"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import {
  db,
  doc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
} from "@/lib/firebase";
import { Booking, normalizeSlot, slotToMinutes } from "@/types";

/* ── Helpers ───────────────────────────────────────────────────── */
function formatTime(t: string): string {
  if (t.includes("AM") || t.includes("PM")) return t;
  return normalizeSlot(t);
}

function calcEnd(slots: string[]): string {
  const sorted = [...slots].sort((a, b) => slotToMinutes(a) - slotToMinutes(b));
  const last = sorted[sorted.length - 1];
  const minutes = slotToMinutes(last) + 30;
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;

  if (h24 >= 24 || h24 === 0) return `12:${m.toString().padStart(2, "0")} AM`;
  if (h24 === 12) return `12:${m.toString().padStart(2, "0")} PM`;
  if (h24 > 12) return `${h24 - 12}:${m.toString().padStart(2, "0")} PM`;
  return `${h24}:${m.toString().padStart(2, "0")} AM`;
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/* ── Running Clock ─────────────────────────────────────────────── */
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="text-center">
      <div className="text-3xl font-black font-mono text-dms-orange-light tracking-wider">
        {time.toLocaleTimeString("en-PH", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })}
      </div>
      <div className="text-[11px] text-white/30 mt-0.5">
        {time.toLocaleDateString("en-PH", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </div>
    </div>
  );
}

/* ── View type ─────────────────────────────────────────────────── */
type View = "search" | "result" | "notfound" | "error" | "success";

export default function ScanPage() {
  const [receiptInput, setReceiptInput] = useState("DMS-");
  const [view, setView] = useState<View>("search");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [searching, setSearching] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [successSub, setSuccessSub] = useState("");
  const [successType, setSuccessType] = useState<"in" | "out">("in");
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── Clear any running timer ────────────────────────────────── */
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCountdown(null);
  }, []);

  /* ── Go back to search ──────────────────────────────────────── */
  const goToSearch = useCallback(() => {
    clearTimer();
    setReceiptInput("DMS-");
    setBooking(null);
    setView("search");
    setErrorMsg("");
    setSuccessMsg("");
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [clearTimer]);

  /* ── Start countdown then go to search ──────────────────────── */
  const autoReturn = useCallback(
    (seconds: number) => {
      clearTimer();
      let remaining = seconds;
      setCountdown(remaining);
      timerRef.current = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          goToSearch();
        } else {
          setCountdown(remaining);
        }
      }, 1000);
    },
    [clearTimer, goToSearch]
  );

  /* ── Cleanup on unmount ─────────────────────────────────────── */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /* ── Search by receipt number ───────────────────────────────── */
  const handleSearch = async () => {
    const term = receiptInput.trim().toUpperCase();
    if (!term || term === "DMS-") return;

    clearTimer();
    setSearching(true);

    try {
      const q = query(
        collection(db, "bookings"),
        where("receiptNo", "==", term)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setView("notfound");
        autoReturn(5);
      } else {
        const data = {
          id: snap.docs[0].id,
          ...snap.docs[0].data(),
        } as Booking;
        setBooking(data);
        setView("result");
        autoReturn(15);
      }
    } catch (err) {
      console.error("Search error:", err);
      setView("notfound");
      autoReturn(5);
    } finally {
      setSearching(false);
    }
  };

  /* ── Validation ─────────────────────────────────────────────── */
  const todayPH = () =>
    new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Manila",
    });
  const nowMinutesPH = () => {
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })
    );
    return now.getHours() * 60 + now.getMinutes();
  };

  const validateCheckIn = (b: Booking): string | null => {
    const today = todayPH();
    if (b.date !== today) {
      const bookDate = new Date(b.date + "T00:00:00").toLocaleDateString(
        "en-PH",
        { month: "short", day: "numeric", year: "numeric" }
      );
      return `This booking is for ${bookDate}. Check-in is only allowed on the booking date.`;
    }

    const slots = [...b.timeSlots].sort(
      (a, c) => slotToMinutes(a) - slotToMinutes(c)
    );
    const firstSlotMinutes = slotToMinutes(slots[0]);
    const lastSlotMinutes =
      slotToMinutes(slots[slots.length - 1]) + 30;
    const currentMinutes = nowMinutesPH();

    // Check if trying to check in after session has ended
    if (currentMinutes >= lastSlotMinutes) {
      return `Your session time (${formatTime(slots[0])} – ${calcEnd(slots)}) has already ended. Check-in is no longer available.`;
    }

    // FIXED: Check if trying to check in BEFORE session start time (no early check-in allowed)
    if (currentMinutes < firstSlotMinutes) {
      const minutesEarly = firstSlotMinutes - currentMinutes;
      return `Too early! Your session starts at ${formatTime(slots[0])}. Please come back in ${minutesEarly} minute${minutesEarly > 1 ? "s" : ""}.`;
    }

    // Check if trying to check in MORE than 30 minutes after start
    if (currentMinutes > firstSlotMinutes + 30) {
      const minutesLate = currentMinutes - firstSlotMinutes;
      return `You are ${minutesLate} minutes late. Your session started at ${formatTime(slots[0])}. Please contact admin for assistance.`;
    }

    return null;
  };

  /* ── Check-in ──────────────────────────────────────────────── */
  const handleCheckIn = async () => {
    if (!booking) return;
    clearTimer();

    const err = validateCheckIn(booking);
    if (err) {
      setErrorMsg(err);
      setView("error");
      autoReturn(5);
      return;
    }

    setProcessing(true);
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, "bookings", booking.id), {
        checkedInAt: now,
      });
      setSuccessType("in");
      setSuccessMsg(`Welcome, ${booking.userName.split(" ")[0]}!`);
      setSuccessSub(
        `Checked in to ${booking.studioName} at ${new Date(now).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}`
      );
      setView("success");
      autoReturn(3);
    } catch {
      alert("Failed to check in.");
    } finally {
      setProcessing(false);
    }
  };

  /* ── Check-out ─────────────────────────────────────────────── */
  const handleCheckOut = async () => {
    if (!booking) return;
    clearTimer();
    setProcessing(true);
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, "bookings", booking.id), {
        checkedOutAt: now,
      });
      setSuccessType("out");
      setSuccessMsg(`Goodbye, ${booking.userName.split(" ")[0]}!`);
      setSuccessSub(
        `Checked out from ${booking.studioName} at ${new Date(now).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}`
      );
      setView("success");
      autoReturn(3);
    } catch {
      alert("Failed to check out.");
    } finally {
      setProcessing(false);
    }
  };

  /* ── Status ─────────────────────────────────────────────────── */
  const getStatus = (b: Booking) => {
    if (b.checkedOutAt) return "checked-out";
    if (b.checkedInAt) return "checked-in";
    return "waiting";
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header — centered clock */}
      <div className="border-b border-white/[0.06] bg-black/50 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <LiveClock />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {/* ═══ SEARCH (default) ═══ */}
        {view === "search" && (
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <div className="w-24 h-24 mx-auto mb-5 relative">
                <Image
                  src="/logo.png"
                  alt="DMS Production"
                  width={96}
                  height={96}
                  className="object-contain"
                  priority
                />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">
                Enter Receipt Number
              </h2>
              <p className="text-sm text-white/30">
                Type the receipt number to check in or check out
              </p>
            </div>

            <div className="mb-4">
              <input
                ref={inputRef}
                type="text"
                value={receiptInput}
                onChange={(e) => {
                  let val = e.target.value.toUpperCase();
                  if (!val.startsWith("DMS-"))
                    val = "DMS-" + val.replace("DMS-", "");
                  setReceiptInput(val);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="DMS-XXXXXXXX"
                className="w-full px-5 py-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] text-white text-center text-2xl font-mono font-bold tracking-wider placeholder:text-white/15 focus:outline-none focus:border-dms-orange/50 transition-all"
                autoFocus
              />
            </div>

            <button
              onClick={handleSearch}
              disabled={searching || receiptInput.trim() === "DMS-"}
              className="w-full px-5 py-4 rounded-2xl bg-dms-orange text-black font-bold text-base hover:bg-dms-orange-light transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {searching ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Searching...
                </span>
              ) : (
                "Search"
              )}
            </button>
          </div>
        )}

        {/* ═══ NOT FOUND ═══ */}
        {view === "notfound" && (
          <div className="w-full max-w-md animate-fade-up text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-red-400 mb-1">
              Receipt Not Found
            </h2>
            <p className="text-sm text-white/30 mb-4">
              Check the receipt number and try again
            </p>
            {countdown !== null && (
              <p className="text-xs text-white/20">
                Returning in {countdown}s...
              </p>
            )}
          </div>
        )}

        {/* ═══ CHECK-IN ERROR ═══ */}
        {view === "error" && (
          <div className="w-full max-w-md animate-fade-up text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-red-400 mb-2">
              Cannot Check In
            </h2>
            <p className="text-sm text-red-400/70 mb-4 px-6">
              {errorMsg}
            </p>
            {countdown !== null && (
              <p className="text-xs text-white/20">
                Returning in {countdown}s...
              </p>
            )}
          </div>
        )}

        {/* ═══ SUCCESS ═══ */}
        {view === "success" && (
          <div className="w-full max-w-md animate-fade-up text-center">
            <div
              className={`w-20 h-20 rounded-full border-2 flex items-center justify-center mx-auto mb-4 ${
                successType === "in"
                  ? "bg-green-500/20 border-green-500"
                  : "bg-blue-500/20 border-blue-500"
              }`}
            >
              {successType === "in" ? (
                <svg
                  className="w-10 h-10 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="w-10 h-10 text-blue-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3-3l3-3m0 0l-3-3m3 3H9"
                  />
                </svg>
              )}
            </div>
            <h2
              className={`text-2xl font-bold mb-1 ${
                successType === "in"
                  ? "text-green-400"
                  : "text-blue-400"
              }`}
            >
              {successMsg}
            </h2>
            <p
              className={`text-sm ${
                successType === "in"
                  ? "text-green-400/60"
                  : "text-blue-400/60"
              }`}
            >
              {successSub}
            </p>
            {countdown !== null && (
              <p className="text-xs text-white/20 mt-4">
                Returning in {countdown}s...
              </p>
            )}
          </div>
        )}

        {/* ═══ BOOKING RESULT ═══ */}
        {view === "result" && booking && (
          <div className="w-full max-w-md animate-fade-up">
            {/* Status header */}
            <div className="text-center mb-5">
              {getStatus(booking) === "waiting" && (
                <>
                  <div className="w-14 h-14 rounded-full bg-yellow-500/10 border-2 border-yellow-500/40 flex items-center justify-center mx-auto mb-2">
                    <svg
                      className="w-7 h-7 text-yellow-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-yellow-400 font-bold">
                    Ready for Check-in
                  </p>
                </>
              )}
              {getStatus(booking) === "checked-in" && (
                <>
                  <div className="w-14 h-14 rounded-full bg-green-500/10 border-2 border-green-500/40 flex items-center justify-center mx-auto mb-2">
                    <svg
                      className="w-7 h-7 text-green-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-green-400 font-bold">
                    Currently In Studio
                  </p>
                  <p className="text-xs text-green-400/40 mt-1">
                    Checked in at{" "}
                    {new Date(
                      booking.checkedInAt!
                    ).toLocaleTimeString("en-PH", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </>
              )}
              {getStatus(booking) === "checked-out" && (
                <>
                  <div className="w-14 h-14 rounded-full bg-blue-500/10 border-2 border-blue-500/40 flex items-center justify-center mx-auto mb-2">
                    <svg
                      className="w-7 h-7 text-blue-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-blue-400 font-bold">
                    Session Complete
                  </p>
                  <p className="text-xs text-blue-400/40 mt-1">
                    {new Date(
                      booking.checkedInAt!
                    ).toLocaleTimeString("en-PH", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    —{" "}
                    {new Date(
                      booking.checkedOutAt!
                    ).toLocaleTimeString("en-PH", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </>
              )}
            </div>

            {/* Booking card */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden mb-5">
              <div className="p-4 text-center border-b border-white/[0.06] bg-white/[0.02]">
                <div className="text-[9px] font-mono tracking-[3px] text-white/20 mb-1">
                  RECEIPT NO.
                </div>
                <div className="text-xl font-black font-mono text-dms-orange-light tracking-wider">
                  {booking.receiptNo}
                </div>
              </div>
              <div className="p-5 space-y-3">
                {[
                  ["Client", booking.userName],
                  ["Studio", booking.studioName],
                  [
                    "Date",
                    new Date(
                      booking.date + "T00:00:00"
                    ).toLocaleDateString("en-PH", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    }),
                  ],
                  [
                    "Time",
                    (() => {
                      const s = [...booking.timeSlots].sort(
                        (a, b) =>
                          slotToMinutes(a) - slotToMinutes(b)
                      );
                      return `${formatTime(s[0])} – ${calcEnd(s)}`;
                    })(),
                  ],
                  ["Duration", `${booking.hours}h`],
                  ["Phone", booking.userPhone],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-sm text-white/35">{l}</span>
                    <span className="text-sm font-bold text-white">
                      {v}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-white/[0.06]">
                  <span className="text-base font-bold text-white">
                    Amount
                  </span>
                  <span className="text-xl font-black font-mono text-dms-orange-light">
                    ₱{booking.amount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Not confirmed */}
            {booking.status !== "confirmed" && (
              <div className="mb-5 p-4 rounded-xl border border-red-500/20 bg-red-500/[0.05] text-center">
                <p className="text-red-400 font-semibold text-sm">
                  Booking is {booking.status}
                </p>
                <p className="text-red-400/50 text-xs mt-1">
                  Only confirmed bookings can check in
                </p>
              </div>
            )}

            {/* Action buttons */}
            {booking.status === "confirmed" && (
              <div className="space-y-3">
                {getStatus(booking) === "waiting" && (
                  <button
                    onClick={handleCheckIn}
                    disabled={processing}
                    className="w-full px-5 py-4 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 text-white font-bold text-base hover:shadow-lg hover:shadow-green-500/20 transition-all disabled:opacity-50"
                  >
                    {processing ? "Processing..." : "Check In"}
                  </button>
                )}
                {getStatus(booking) === "checked-in" && (
                  <button
                    onClick={handleCheckOut}
                    disabled={processing}
                    className="w-full px-5 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold text-base hover:shadow-lg hover:shadow-blue-500/20 transition-all disabled:opacity-50"
                  >
                    {processing ? "Processing..." : "Check Out"}
                  </button>
                )}
              </div>
            )}

            {/* Countdown */}
            {countdown !== null && (
              <p className="text-center text-xs text-white/20 mt-4">
                Returning in {countdown}s...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}