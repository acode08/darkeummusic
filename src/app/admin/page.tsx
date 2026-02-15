"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import Navbar from "@/components/Navbar";
import {
  db,
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  addDoc,
  where,
} from "@/lib/firebase";
import { onSnapshot } from "firebase/firestore";
import {
  Booking,
  STUDIOS,
  TIME_SLOTS,
  RATE_PER_SLOT,
  slotTo24,
  normalizeSlot,
  slotToMinutes,
} from "@/types";

const PROMO_HOURS = 15;
const NO_SHOW_WARN_MINUTES = 15;
const NO_SHOW_CANCEL_MINUTES = 45;

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

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function todayPH(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function nowMinutesPH(): number {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })
  );
  return now.getHours() * 60 + now.getMinutes();
}

function getTimeRange(b: Booking): string {
  const sorted = [...b.timeSlots].sort(
    (a, c) => slotToMinutes(a) - slotToMinutes(c)
  );
  return `${formatTime(sorted[0])} - ${calcEnd(sorted)}`;
}

/* ── Status Badge ──────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  const cls = map[status?.toLowerCase()] ?? map.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${cls}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Loyalty Promo Section (Admin)
   ══════════════════════════════════════════════════════════════════ */
function LoyaltyPromoAdmin({ bookings }: { bookings: Booking[] }) {
  const [expanded, setExpanded] = useState(false);

  const userStats = useMemo(() => {
    const stats: Record<
      string,
      {
        name: string;
        email: string;
        totalHours: number;
        promoEarned: number;
      }
    > = {};

    bookings
      .filter((b) => b.status === "confirmed" && b.userId !== "admin")
      .forEach((b) => {
        const key = b.userId;
        if (!stats[key]) {
          stats[key] = {
            name: b.userName,
            email: b.userEmail,
            totalHours: 0,
            promoEarned: 0,
          };
        }
        stats[key].totalHours += b.hours;
      });

    Object.values(stats).forEach((s) => {
      s.promoEarned = Math.floor(s.totalHours / PROMO_HOURS);
    });

    return Object.entries(stats)
      .map(([userId, data]) => ({ userId, ...data }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [bookings]);

  const closeToPromo = userStats.filter((u) => {
    const remaining = PROMO_HOURS - (u.totalHours % PROMO_HOURS);
    return remaining <= 5 && remaining > 0;
  });

  const earnedPromo = userStats.filter((u) => u.promoEarned > 0);

  const displayList = expanded ? userStats : userStats.slice(0, 8);

  return (
    <div className="animate-fade-in">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="p-4 rounded-xl border border-dms-orange/15 bg-dms-orange/[0.04]">
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-white/30">
            Total Clients
          </div>
          <div className="text-2xl font-black font-mono text-dms-orange-light">
            {userStats.length}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-green-500/15 bg-green-500/[0.04]">
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-white/30">
            Promos Earned
          </div>
          <div className="text-2xl font-black font-mono text-green-400">
            {earnedPromo.reduce((s, u) => s + u.promoEarned, 0)}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-yellow-500/15 bg-yellow-500/[0.04]">
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-white/30">
            Almost There
          </div>
          <div className="text-2xl font-black font-mono text-yellow-400">
            {closeToPromo.length}
          </div>
        </div>
      </div>

      {/* Alert: users close to earning */}
      {closeToPromo.length > 0 && (
        <div className="mb-5 p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.04]">
          <div className="text-xs font-bold text-yellow-400 mb-3">
            Close to earning promo (5 hours or less)
          </div>
          <div className="space-y-2">
            {closeToPromo.map((u) => {
              const remaining =
                PROMO_HOURS - (u.totalHours % PROMO_HOURS);
              return (
                <div
                  key={u.userId}
                  className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-yellow-500/[0.05] border border-yellow-500/10"
                >
                  <div>
                    <span className="text-white/70 font-semibold">
                      {u.name}
                    </span>
                    <span className="text-white/25 ml-2">
                      {u.email}
                    </span>
                  </div>
                  <span className="text-yellow-400 font-bold font-mono">
                    {remaining.toFixed(1)}h to go ({u.totalHours.toFixed(1)}h /{" "}
                    {PROMO_HOURS}h)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      
      {/* Full table */}
      {userStats.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {[
                  "Client",
                  "Total Hours",
                  "Progress to Next Promo",
                  "Promos Earned",
                  "Status",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[10px] font-bold tracking-[1.5px] uppercase text-white/30"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayList.map((u) => {
                const progressInCycle = u.totalHours % PROMO_HOURS;
                const progressPct =
                  (progressInCycle / PROMO_HOURS) * 100;
                const remaining = PROMO_HOURS - progressInCycle;
                const isClose = remaining <= 5 && remaining > 0;
                const justEarned =
                  progressInCycle === 0 && u.promoEarned > 0;

                return (
                  <tr
                    key={u.userId}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-all"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-sm">
                        {u.name}
                      </div>
                      <div className="text-[11px] text-white/25">
                        {u.email}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-white/80">
                      {u.totalHours.toFixed(1)}h
                    </td>
                    <td className="px-4 py-3 min-w-[200px]">
                      <div className="flex items-center gap-2.5">
                        <div className="flex-1 h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              justEarned
                                ? "bg-green-500"
                                : isClose
                                ? "bg-yellow-500"
                                : "bg-dms-orange/60"
                            }`}
                            style={{
                              width: `${justEarned ? 100 : progressPct}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-white/40 shrink-0">
                          {progressInCycle.toFixed(1)}/{PROMO_HOURS}h
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {u.promoEarned > 0 ? (
                        <span className="px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 text-xs font-bold border border-green-500/25">
                          x{u.promoEarned}
                        </span>
                      ) : (
                        <span className="text-white/15 text-xs">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {justEarned ? (
                        <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20">
                          PROMO READY
                        </span>
                      ) : isClose ? (
                        <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 px-2.5 py-1 rounded-full border border-yellow-500/20">
                          {remaining.toFixed(1)}h left
                        </span>
                      ) : (
                        <span className="text-[10px] text-white/25">
                          {remaining.toFixed(1)}h to next promo
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 rounded-2xl border border-dashed border-white/[0.08]">
          <p className="text-white/20 text-sm">
            No client booking data yet
          </p>
        </div>
      )}

      {userStats.length > 8 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-xs font-bold text-dms-orange-light hover:text-dms-orange transition-all"
        >
          {expanded
            ? "Show less"
            : `Show all ${userStats.length} clients`}
        </button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Admin Quick Book Modal
   ══════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════
   Admin Quick Book Modal - UPDATED WITH START/END MARKERS
   ══════════════════════════════════════════════════════════════════
   
   INSTRUCTIONS:
   Replace the AdminQuickBookModal function in your admin.tsx file 
   with this complete updated version.
   
   ══════════════════════════════════════════════════════════════════ */

function AdminQuickBookModal({
  studioId,
  studioName,
  date,
  slot,
  onClose,
  onBooked,
}: {
  studioId: string;
  studioName: string;
  date: string;
  slot: string;
  onClose: () => void;
  onBooked: () => void;
}) {
  const { userData } = useAuth();
  const [password, setPassword] = useState("");
  const [bandName, setBandName] = useState("");
  const [selectedSlots, setSelectedSlots] = useState<string[]>([slot]);
  const [startMarker, setStartMarker] = useState<string | null>(slot);
  const [endMarker, setEndMarker] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);

  useEffect(() => {
    const fetchBooked = async () => {
      try {
        const q = query(
          collection(db, "bookings"),
          where("studioId", "==", studioId),
          where("date", "==", date),
          where("status", "in", ["confirmed", "pending"])
        );
        const snap = await getDocs(q);
        const slots: string[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          slots.push(...(data.timeSlots as string[]));
        });
        setBookedSlots(slots);
      } catch (err) {
        console.error("Error fetching booked slots:", err);
      }
    };
    fetchBooked();
  }, [studioId, date]);

  const handleBook = async () => {
    if (!userData?.email) return;
    if (!password) {
      setError("Please enter your password");
      return;
    }
    if (!bandName.trim()) {
      setError("Please enter band/client name");
      return;
    }
    if (selectedSlots.length === 0) {
      setError("Please select at least one time slot");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const receiptNo =
        "DMS-" +
        Date.now().toString().slice(-6) +
        Math.random().toString(36).slice(-2).toUpperCase();

      const sortedSlots = [...selectedSlots].sort(
        (a, b) => slotToMinutes(a) - slotToMinutes(b)
      );
      const hours = selectedSlots.length * 0.5;
      const amount = selectedSlots.length * RATE_PER_SLOT;

      await addDoc(collection(db, "bookings"), {
        receiptNo,
        userId: "admin",
        userName: bandName.trim(),
        userEmail: userData.email,
        userPhone: userData.phone || "N/A",
        studioId,
        studioName,
        date,
        timeSlots: sortedSlots,
        hours,
        amount,
        status: "confirmed" as const,
        paid: false,
        createdAt: new Date().toISOString(),
        bandName: bandName.trim(),
      });

      onBooked();
      onClose();
    } catch (err) {
      console.error("Admin booking error:", err);
      setError("Failed to create booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSlot = (s: string) => {
    if (bookedSlots.includes(s)) return;

    setSelectedSlots((prev) => {
      const clickedMinutes = slotToMinutes(s);

      // If clicking an already-selected slot, clear everything
      if (prev.includes(s)) {
        setStartMarker(null);
        setEndMarker(null);
        return [];
      }

      // CASE 1: No slots selected - this is the START
      if (prev.length === 0) {
        setStartMarker(s);
        setEndMarker(null);
        return [s];
      }

      // CASE 2: Exactly one slot selected - autofill from START to END
      if (prev.length === 1) {
        const startSlot = prev[0];
        const startMinutes = slotToMinutes(startSlot);

        // Same slot clicked twice - do nothing
        if (clickedMinutes === startMinutes) {
          setEndMarker(null);
          return prev;
        }

        // Determine range direction
        let rangeStart: number;
        let rangeEnd: number;
        let actualStartSlot: string;
        
        if (clickedMinutes < startMinutes) {
          // Clicking before start - swap
          rangeStart = clickedMinutes;
          rangeEnd = startMinutes;
          actualStartSlot = s;
        } else {
          // Normal case - clicking after start
          rangeStart = startMinutes;
          rangeEnd = clickedMinutes;
          actualStartSlot = startSlot;
        }

        // Build array of all slots in range (excluding end)
        const filledSlots: string[] = [];
        for (const timeSlot of TIME_SLOTS) {
          const slotMinutes = slotToMinutes(timeSlot);
          if (slotMinutes >= rangeStart && slotMinutes < rangeEnd) {
            filledSlots.push(timeSlot);
          }
        }

        // Check for conflicts
        for (const filledSlot of filledSlots) {
          if (bookedSlots.includes(filledSlot)) {
            // Conflict found - reset to clicked slot as new start
            setStartMarker(s);
            setEndMarker(null);
            return [s];
          }
        }

        // Set the markers for visual feedback
        setStartMarker(actualStartSlot);
        setEndMarker(s);
        return filledSlots;
      }

      // CASE 3: Multiple slots selected - reset to new start
      setStartMarker(s);
      setEndMarker(null);
      return [s];
    });
  };

  const isSlotBooked = (s: string) => bookedSlots.includes(s);

  const slotIndex = TIME_SLOTS.indexOf(slot);
  const visibleSlots = TIME_SLOTS.slice(
    Math.max(0, slotIndex - 2),
    Math.min(TIME_SLOTS.length, slotIndex + 10)
  );

  const totalAmount = selectedSlots.length * RATE_PER_SLOT;
  const totalHours = selectedSlots.length * 0.5;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{
        backgroundColor: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(6px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-dms-orange/20 bg-[#0f0f0f] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-white/[0.08]">
          <h2 className="text-xl font-bold text-white mb-1">
            Admin Quick Book
          </h2>
          <p className="text-sm text-white/40">
            {studioName} • {fmtDate(date)}
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-white/40 mb-2">
              Band / Client Name
            </label>
            <input
              type="text"
              value={bandName}
              onChange={(e) => setBandName(e.target.value)}
              placeholder="Enter band or client name"
              className="w-full px-4 py-2.5 rounded-lg border border-white/10 bg-white/[0.03] text-white placeholder:text-white/20 focus:outline-none focus:border-dms-orange/50"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-white/40 mb-2">
              Select Time Slots ({selectedSlots.length} selected)
            </label>
            <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto p-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
              {visibleSlots.map((s) => {
                const isBooked = isSlotBooked(s);
                const isSelected = selectedSlots.includes(s);
                const isStartMarkerSlot = startMarker === s;
                const isEndMarkerSlot = endMarker === s;
                
                return (
                  <button
                    key={s}
                    onClick={() => toggleSlot(s)}
                    disabled={isBooked}
                    className={`p-2 rounded-md text-[11px] font-mono font-semibold transition-all ${
                      isBooked
                        ? "bg-red-500/10 text-red-400/30 cursor-not-allowed line-through"
                        : isEndMarkerSlot
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                        : isStartMarkerSlot && selectedSlots.length === 1
                        ? "bg-green-500/20 text-green-400 border border-green-500/40"
                        : isSelected
                        ? "bg-dms-orange text-black"
                        : "bg-white/[0.05] text-white/60 hover:bg-white/10"
                    }`}
                  >
                    <div>{s}</div>
                    {isStartMarkerSlot && selectedSlots.length === 1 && (
                      <div className="text-[8px] mt-0.5 font-bold text-green-400">START</div>
                    )}
                    {isStartMarkerSlot && selectedSlots.length > 1 && (
                      <div className="text-[8px] mt-0.5 font-bold">START</div>
                    )}
                    {isEndMarkerSlot && (
                      <div className="text-[8px] mt-0.5 font-bold text-blue-400">END</div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 text-[9px] font-semibold mt-2">
              <span className="flex items-center gap-1 text-green-400">
                <span className="w-2 h-2 rounded-sm bg-green-500/40" /> Start
              </span>
              <span className="flex items-center gap-1 text-dms-orange-light">
                <span className="w-2 h-2 rounded-sm bg-dms-orange" /> Selected
              </span>
              <span className="flex items-center gap-1 text-blue-400">
                <span className="w-2 h-2 rounded-sm bg-blue-500/40" /> End
              </span>
            </div>
          </div>

          {selectedSlots.length > 0 && (
            <div className="p-3 rounded-lg bg-dms-orange/5 border border-dms-orange/20">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-white/40">Duration</span>
                <span className="font-semibold text-white">{totalHours}h</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Total Amount</span>
                <span className="font-bold text-dms-orange-light">
                  ₱{totalAmount.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-white/40 mb-2">
              Your Admin Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password to confirm"
              className="w-full px-4 py-2.5 rounded-lg border border-white/10 bg-white/[0.03] text-white placeholder:text-white/20 focus:outline-none focus:border-dms-orange/50"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleBook();
              }}
            />
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] text-white/60 font-semibold hover:bg-white/[0.06] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleBook}
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl bg-dms-orange text-black font-bold hover:bg-dms-orange-light transition-all disabled:opacity-50"
          >
            {loading ? "Booking..." : "Confirm Booking"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ══════════════════════════════════════════════════════════════════
   Admin Receipt Modal
   ══════════════════════════════════════════════════════════════════ */
function AdminReceiptModal({
  booking,
  onClose,
}: {
  booking: Booking;
  onClose: () => void;
}) {
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const slots = [...booking.timeSlots].sort(
    (a, b) => slotToMinutes(a) - slotToMinutes(b)
  );
  const end = calcEnd(slots);
  const statusTitles: Record<string, string> = {
    confirmed: "Booking Confirmed!",
    pending: "Booking Pending",
    cancelled: "Booking Cancelled",
  };

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const generateCanvas = useCallback((): HTMLCanvasElement => {
    const W = 700;
    const H = 620;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const details = [
      ["Receipt No.", booking.receiptNo],
      ["Studio", booking.studioName],
      ["Date", fmtDate(booking.date)],
      ["Time", `${formatTime(slots[0])} - ${formatTime(end)}`],
      ["Duration", `${booking.hours}h`],
    ];
    const client = [
      ["Name", booking.userName],
      ["Email", booking.userEmail],
      ["Phone", booking.userPhone],
    ];
    ctx.fillStyle = "#0f0f0f";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#E65100";
    ctx.fillRect(0, 0, W, 3);
    let y = 50;
    ctx.textAlign = "center";
    ctx.fillStyle = "#E65100AA";
    ctx.font = "bold 11px Arial";
    ctx.fillText("DMS STUDIO", W / 2, y);
    y += 32;
    ctx.fillStyle = "#FFF";
    ctx.font = "bold 24px Arial";
    ctx.fillText(statusTitles[booking.status] || "Receipt", W / 2, y);
    y += 22;
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "14px Arial";
    ctx.fillText("Your receipt is ready", W / 2, y);
    y += 35;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(W - 40, y);
    ctx.stroke();
    y += 25;
    ctx.textAlign = "left";
    details.forEach(([l, v]) => {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "14px Arial";
      ctx.fillText(l, 50, y);
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "right";
      ctx.fillText(v, W - 50, y);
      ctx.textAlign = "left";
      y += 30;
    });
    y += 5;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(W - 40, y);
    ctx.stroke();
    y += 25;
    ctx.fillStyle = "#FFF";
    ctx.font = "bold 16px Arial";
    ctx.fillText("Total Amount", 50, y);
    ctx.fillStyle = "#FF9800";
    ctx.font = "bold 28px Courier New";
    ctx.textAlign = "right";
    ctx.fillText(`P${booking.amount.toLocaleString()}`, W - 50, y + 3);
    ctx.textAlign = "left";
    y += 40;
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    const bH = 30 + client.length * 28;
    ctx.beginPath();
    ctx.roundRect(40, y, W - 80, bH, 12);
    ctx.fill();
    ctx.stroke();
    y += 25;
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "bold 10px Arial";
    ctx.fillText("CLIENT INFORMATION", 55, y);
    y += 20;
    client.forEach(([l, v]) => {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "14px Arial";
      ctx.textAlign = "left";
      ctx.fillText(l, 55, y);
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "right";
      ctx.fillText(v, W - 55, y);
      y += 28;
    });
    y += 20;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.font = "10px Arial";
    ctx.fillText("DMS PRODUCTION", W / 2, y);
    ctx.fillStyle = "#E65100";
    ctx.fillRect(0, H - 3, W, 3);
    return canvas;
  }, [booking, slots, end]);

  const handleCopy = async () => {
    setCopying(true);
    try {
      await new Promise((r) => setTimeout(r, 100));
      const canvas = generateCanvas();
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            setCopying(false);
            return;
          }
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": blob }),
            ]);
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
          } catch {
            const l = document.createElement("a");
            l.download = `receipt-${booking.receiptNo}.png`;
            l.href = canvas.toDataURL("image/png");
            l.click();
          }
          setCopying(false);
        },
        "image/png"
      );
    } catch {
      setCopying(false);
    }
  };

  const handleDownload = () => {
    const c = generateCanvas();
    const l = document.createElement("a");
    l.download = `receipt-${booking.receiptNo}.png`;
    l.href = c.toDataURL("image/png");
    l.click();
  };

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        backgroundColor: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-dms-orange/20 bg-[#0f0f0f] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="text-center px-6 pt-8 pb-6 border-b border-white/[0.08]">
          <p className="text-xs font-black tracking-[0.25em] uppercase text-dms-orange/70 mb-2">
            DMS Studio
          </p>
          <h2 className="text-2xl font-extrabold text-white mb-1">
            {statusTitles[booking.status] || "Booking Receipt"}
          </h2>
          <p className="text-sm text-white/40">Your receipt is ready</p>
        </div>
        <div className="px-6 pt-5 pb-3 text-center">
          <div className="text-[10px] font-mono tracking-[3px] text-white/25 mb-1">
            RECEIPT NO.
          </div>
          <div className="text-2xl font-black font-mono text-dms-orange-light tracking-wider">
            {booking.receiptNo}
          </div>
        </div>
        <div className="px-6 py-4 space-y-3.5">
          {(
            [
              ["Studio", booking.studioName],
              ["Date", fmtDate(booking.date)],
              ["Time", `${formatTime(slots[0])} – ${formatTime(end)}`],
              [
                "Duration",
                `${booking.hours} hour${booking.hours > 1 ? "s" : ""}`,
              ],
            ] as [string, string][]
          ).map(([l, v]) => (
            <div key={l} className="flex justify-between items-center gap-4">
              <span className="text-sm text-white/40 shrink-0">{l}</span>
              <span className="text-sm font-semibold text-white text-right">
                {v}
              </span>
            </div>
          ))}
          <div className="flex justify-between items-center pt-3 border-t border-white/[0.08]">
            <span className="text-base font-bold text-white">Total Amount</span>
            <span className="text-2xl font-black font-mono text-dms-orange-light">
              ₱{booking.amount.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="mx-6 mb-5 bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-2">
          <p className="text-xs font-bold tracking-[2px] uppercase text-white/30 mb-3">
            Client Information
          </p>
          {(
            [
              ["Name", booking.userName],
              ["Email", booking.userEmail],
              ["Phone", booking.userPhone],
            ] as [string, string][]
          ).map(([l, v]) => (
            <div key={l} className="flex justify-between gap-4">
              <span className="text-sm text-white/40 shrink-0">{l}</span>
              <span className="text-sm font-semibold text-white text-right break-all">
                {v}
              </span>
            </div>
          ))}
        </div>
        <div className="px-6 pb-4 grid grid-cols-2 gap-3">
          <button
            onClick={handleCopy}
            disabled={copying}
            className={`px-4 py-3 rounded-xl border font-semibold text-sm transition-all ${
              copied
                ? "border-green-500/30 bg-green-500/10 text-green-400"
                : "border-dms-orange/30 bg-dms-orange/10 text-dms-orange-light hover:bg-dms-orange/20"
            }`}
          >
            {copying ? "Copying..." : copied ? "Copied!" : "Copy Image"}
          </button>
          <button
            onClick={handleDownload}
            className="px-4 py-3 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 font-semibold text-sm hover:bg-blue-500/20 transition-all"
          >
            Save PNG
          </button>
        </div>
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 rounded-xl bg-dms-orange text-black font-bold hover:bg-dms-orange-light transition-all text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}

/* ══════════════════════════════════════════════════════════════════
   Schedule Date Picker
   ══════════════════════════════════════════════════════════════════ */
function ScheduleDatePicker({
  selectedDate,
  onSelect,
  bookings,
}: {
  selectedDate: string;
  onSelect: (date: string) => void;
  bookings: Booking[];
}) {
  const [open, setOpen] = useState(false);
  const sel = new Date(selectedDate + "T00:00:00");
  const [viewMonth, setViewMonth] = useState(
    new Date(sel.getFullYear(), sel.getMonth(), 1)
  );
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = todayPH();

  const dateStats: Record<string, { pending: number; confirmed: number }> = {};
  bookings.forEach((b) => {
    if (!dateStats[b.date])
      dateStats[b.date] = { pending: 0, confirmed: 0 };
    if (b.status === "pending") dateStats[b.date].pending++;
    if (b.status === "confirmed") dateStats[b.date].confirmed++;
  });

  const selStats = dateStats[selectedDate];
  const displayLabel = sel.toLocaleDateString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="mb-5 relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-sm hover:border-white/15 transition-all"
      >
        <svg
          className="w-4 h-4 text-white/40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="text-white font-semibold">{displayLabel}</span>
        {selStats && selStats.pending > 0 && (
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
        )}
        {selStats && selStats.confirmed > 0 && (
          <span className="w-2 h-2 rounded-full bg-green-400" />
        )}
        <svg
          className={`w-3.5 h-3.5 text-white/30 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute top-full left-0 mt-2 z-50 rounded-2xl border border-white/10 bg-[#141414] shadow-2xl p-4 animate-fade-up"
            style={{ minWidth: 300 }}
          >
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() =>
                  setViewMonth(new Date(year, month - 1, 1))
                }
                className="w-8 h-8 rounded-lg border border-white/10 bg-white/[0.03] text-white/50 hover:text-white flex items-center justify-center transition-all"
              >
                ←
              </button>
              <span className="text-sm font-bold">
                {viewMonth.toLocaleDateString("en", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <button
                onClick={() =>
                  setViewMonth(new Date(year, month + 1, 1))
                }
                className="w-8 h-8 rounded-lg border border-white/10 bg-white/[0.03] text-white/50 hover:text-white flex items-center justify-center transition-all"
              >
                →
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div
                  key={d}
                  className="w-9 h-6 flex items-center justify-center text-[10px] font-bold text-white/20"
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e${i}`} className="w-9 h-9" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isSelected = dateStr === selectedDate;
                const isToday = dateStr === today;
                const stats = dateStats[dateStr];
                const hasPending = stats && stats.pending > 0;
                const hasConfirmed = stats && stats.confirmed > 0;

                return (
                  <button
                    key={day}
                    onClick={() => {
                      onSelect(dateStr);
                      setOpen(false);
                    }}
                    className={`w-9 h-9 rounded-lg text-xs font-semibold relative transition-all flex flex-col items-center justify-center ${
                      isSelected
                        ? "bg-dms-orange text-black font-bold"
                        : isToday
                        ? "border border-dms-orange/50 text-dms-orange-light"
                        : hasPending
                        ? "text-yellow-400 hover:bg-yellow-500/10"
                        : hasConfirmed
                        ? "text-green-400 hover:bg-green-500/10"
                        : "text-white/50 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    {day}
                    {(hasPending || hasConfirmed) && !isSelected && (
                      <div className="flex gap-0.5 absolute bottom-0.5">
                        {hasPending && (
                          <span className="w-1 h-1 rounded-full bg-yellow-400" />
                        )}
                        {hasConfirmed && (
                          <span className="w-1 h-1 rounded-full bg-green-400" />
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.05]">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[10px] text-white/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />{" "}
                  Pending
                </span>
                <span className="flex items-center gap-1 text-[10px] text-white/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />{" "}
                  Confirmed
                </span>
              </div>
              <button
                onClick={() => {
                  onSelect(today);
                  setViewMonth(new Date());
                  setOpen(false);
                }}
                className="text-[10px] font-bold text-dms-orange-light hover:text-dms-orange transition-all"
              >
                Today
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CalendarView({
  bookings,
  onViewReceipt,
}: {
  bookings: Booking[];
  onViewReceipt: (b: Booking) => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const monthLabel = currentMonth.toLocaleDateString("en", {
    month: "long",
    year: "numeric",
  });
  const dayStats: Record<
    string,
    { count: number; revenue: number; bookings: Booking[] }
  > = {};
  bookings
    .filter((b) => b.status === "confirmed" || b.status === "pending")
    .forEach((b) => {
      if (!dayStats[b.date])
        dayStats[b.date] = { count: 0, revenue: 0, bookings: [] };
      dayStats[b.date].count++;
      if (b.status === "confirmed") dayStats[b.date].revenue += b.amount;
      dayStats[b.date].bookings.push(b);
    });
  const today = todayPH();
  const selectedBookings = selectedDay
    ? dayStats[selectedDay]?.bookings || []
    : [];
  const monthBookings = Object.entries(dayStats)
    .filter(([d]) =>
      d.startsWith(
        `${year}-${String(month + 1).padStart(2, "0")}`
      )
    )
    .reduce((s, [, d]) => s + d.count, 0);
  const monthRevenue = Object.entries(dayStats)
    .filter(([d]) =>
      d.startsWith(
        `${year}-${String(month + 1).padStart(2, "0")}`
      )
    )
    .reduce((s, [, d]) => s + d.revenue, 0);

  return (
    <div className="animate-fade-in">
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="p-4 rounded-xl border border-dms-orange/15 bg-dms-orange/[0.04]">
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-white/30">
            Month Bookings
          </div>
          <div className="text-2xl font-black font-mono text-dms-orange-light">
            {monthBookings}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-green-500/15 bg-green-500/[0.04]">
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-white/30">
            Month Revenue
          </div>
          <div className="text-2xl font-black font-mono text-green-400">
            ₱{monthRevenue.toLocaleString()}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
          className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.03] text-white/50 hover:text-white flex items-center justify-center"
        >
          ←
        </button>
        <h3 className="text-lg font-bold">{monthLabel}</h3>
        <button
          onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
          className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.03] text-white/50 hover:text-white flex items-center justify-center"
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-bold text-white/25 py-2"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-6">
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`e${i}`} className="h-20" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const stats = dayStats[dateStr];
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDay;
          const has = stats && stats.count > 0;
          return (
            <button
              key={day}
              onClick={() =>
                setSelectedDay(isSelected ? null : dateStr)
              }
              className={`h-20 rounded-xl border text-left p-2 transition-all ${
                isSelected
                  ? "border-dms-orange bg-dms-orange/10"
                  : isToday
                  ? "border-dms-orange/40 bg-dms-orange/[0.03]"
                  : has
                  ? "border-white/10 bg-white/[0.03] hover:border-white/20"
                  : "border-white/[0.04] bg-white/[0.01] hover:border-white/10"
              }`}
            >
              <div
                className={`text-xs font-bold ${isToday ? "text-dms-orange-light" : "text-white/50"}`}
              >
                {day}
              </div>
              {has && (
                <div className="mt-1">
                  <div className="text-[10px] font-bold text-dms-orange-light">
                    {stats.count} book
                  </div>
                  {stats.revenue > 0 && (
                    <div className="text-[9px] font-mono text-green-400/70">
                      ₱{stats.revenue.toLocaleString()}
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {selectedDay && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 animate-fade-up">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-lg">
              {new Date(selectedDay + "T00:00:00").toLocaleDateString(
                "en",
                { weekday: "long", month: "long", day: "numeric" }
              )}
            </h4>
            {dayStats[selectedDay] && (
              <div className="flex gap-3">
                <span className="text-xs font-bold text-dms-orange-light">
                  {dayStats[selectedDay].count} bookings
                </span>
                <span className="text-xs font-bold text-green-400">
                  ₱{dayStats[selectedDay].revenue.toLocaleString()}
                </span>
              </div>
            )}
          </div>
          {selectedBookings.length === 0 ? (
            <p className="text-white/25 text-sm">No bookings</p>
          ) : (
            <div className="space-y-2">
              {selectedBookings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] flex-wrap gap-2"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">
                        {b.userName}
                      </span>
                      <StatusBadge status={b.status} />
                    </div>
                    <div className="text-xs text-white/40">
                      {b.studioName} • {getTimeRange(b)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-dms-orange-light text-sm">
                      ₱{b.amount.toLocaleString()}
                    </span>
                    <button
                      onClick={() => onViewReceipt(b)}
                      className="px-2.5 py-1 rounded-md border border-white/10 bg-white/[0.04] text-white/50 text-[10px] font-bold hover:bg-white/[0.08] transition-all"
                    >
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ADMIN PAGE
   ══════════════════════════════════════════════════════════════════ */
export default function AdminPage() {
  const { user, userData, loading: authLoading } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<
    "schedule" | "pending" | "calendar" | "loyalty" | "all"
  >("schedule");
  const [filterStudio, setFilterStudio] = useState("all");
  // FIX: Use Philippine timezone for default date
  const [filterDate, setFilterDate] = useState(todayPH());
  const [viewReceipt, setViewReceipt] = useState<Booking | null>(null);
  const [quickBookModal, setQuickBookModal] = useState<{
    studioId: string;
    studioName: string;
    slot: string;
  } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // No-show tracking refs
  const warnedNoShowIds = useRef<Set<string>>(new Set());
  const cancelledNoShowIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && (!user || userData?.role !== "admin"))
      router.push("/login");
  }, [user, userData, authLoading, router]);

  useEffect(() => {
    if (
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission();
    }
  }, []);

  const sendPushNotif = useCallback(
    (title: string, body: string) => {
      if (!("Notification" in window)) return;
      if (Notification.permission === "granted") {
        new Notification(title, {
          body,
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: "dms-admin-" + Date.now(),
        });
      }
    },
    []
  );

  const playNotifSound = useCallback(() => {
    try {
      if (!audioCtxRef.current)
        audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;

      const playTone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, now + start);
        gain.gain.exponentialRampToValueAtTime(
          0.01,
          now + start + dur
        );
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + start + dur);
      };

      playTone(880, 0, 0.15);
      playTone(1174.66, 0.1, 0.2);
      playTone(1318.51, 0.2, 0.3);
    } catch {}
  }, []);

  const prevPendingIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!user || userData?.role !== "admin") return;

    const q = query(
      collection(db, "bookings"),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Booking)
        );
        const newPendingCount = data.filter(
          (b) => b.status === "pending"
        ).length;
        const currentPendingIds = new Set(
          data
            .filter((b) => b.status === "pending")
            .map((b) => b.id)
        );

        if (prevPendingIds.current !== null) {
          const newlyPending = [...currentPendingIds].filter(
            (id) => !prevPendingIds.current!.has(id)
          );
          if (newlyPending.length > 0) {
            playNotifSound();
            const newBooking = data.find(
              (b) => b.id === newlyPending[0]
            );
            if (newBooking) {
              sendPushNotif(
                "New Booking Request",
                `${newBooking.userName} booked ${newBooking.studioName} on ${new Date(newBooking.date + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })} — ${newBooking.hours}h (₱${newBooking.amount.toLocaleString()})`
              );
            }
          }
        }
        prevPendingIds.current = currentPendingIds;

        if (newPendingCount > 0) {
          document.title = `(${newPendingCount}) DMS Admin`;
        } else {
          document.title = "DMS Admin";
        }

        setBookings(data);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore listener error:", err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
      document.title = "DMS Production";
    };
  }, [user, userData, playNotifSound, sendPushNotif]);

  /* ── Auto check-out + No-show detection ──────────────────────── */
  useEffect(() => {
    if (!user || userData?.role !== "admin") return;

    const checkSessions = async () => {
      const today = todayPH();
      const now = nowMinutesPH();

      for (const b of bookings) {
        if (b.date !== today || b.status !== "confirmed") continue;

        const sorted = [...b.timeSlots].sort(
          (a, c) => slotToMinutes(a) - slotToMinutes(c)
        );
        const firstSlotStart = slotToMinutes(sorted[0]);
        const lastSlotEnd = slotToMinutes(sorted[sorted.length - 1]) + 30;
        const minutesSinceStart = now - firstSlotStart;

        // ── AUTO CHECK-OUT: checked in but session ended ──
        if (b.checkedInAt && !b.checkedOutAt && now >= lastSlotEnd) {
          try {
            await updateDoc(doc(db, "bookings", b.id), {
              checkedOutAt: new Date().toISOString(),
              autoCheckedOut: true,
            });
            sendPushNotif(
              "Auto Check-Out",
              `${b.userName} did NOT check out from ${b.studioName}. Session ended — auto checked out.`
            );
            playNotifSound();
          } catch (err) {
            console.error("Auto check-out error:", err);
          }
          continue;
        }

        // ── NO-SHOW: not checked in at all ──
        if (!b.checkedInAt) {
          // 45 min late → auto-cancel
          if (
            minutesSinceStart >= NO_SHOW_CANCEL_MINUTES &&
            !cancelledNoShowIds.current.has(b.id)
          ) {
            cancelledNoShowIds.current.add(b.id);
            try {
              await updateDoc(doc(db, "bookings", b.id), {
                status: "cancelled",
                cancelReason: "no-show",
              });
              sendPushNotif(
                "No-Show — Booking Cancelled",
                `${b.userName} did not show up for ${b.studioName} (${getTimeRange(b)}). Auto-cancelled after ${NO_SHOW_CANCEL_MINUTES} minutes.`
              );
              playNotifSound();
            } catch (err) {
              console.error("No-show cancel error:", err);
            }
          }
          // 15 min late → warn admin (once)
          else if (
            minutesSinceStart >= NO_SHOW_WARN_MINUTES &&
            minutesSinceStart < NO_SHOW_CANCEL_MINUTES &&
            !warnedNoShowIds.current.has(b.id)
          ) {
            warnedNoShowIds.current.add(b.id);
            sendPushNotif(
              "Client Late — No Check-In",
              `${b.userName} is ${minutesSinceStart} min late for ${b.studioName} (${getTimeRange(b)}). Will auto-cancel at ${NO_SHOW_CANCEL_MINUTES} min.`
            );
            playNotifSound();
          }
        }
      }
    };

    const interval = setInterval(checkSessions, 60_000);
    checkSessions();
    return () => clearInterval(interval);
  }, [bookings, user, userData, sendPushNotif, playNotifSound]);

  const updateStatus = async (
    id: string,
    s: "confirmed" | "cancelled"
  ) => {
    try {
      await updateDoc(doc(db, "bookings", id), { status: s });
      setBookings((p) =>
        p.map((b) => (b.id === id ? { ...b, status: s } : b))
      );
    } catch {
      alert("Failed to update.");
    }
  };
  const handleApprove = (id: string) => {
    if (confirm("Approve this booking?"))
      updateStatus(id, "confirmed");
  };
  const handleReject = (id: string) => {
    if (confirm("Reject this booking?"))
      updateStatus(id, "cancelled");
  };
  const handleCancel = (id: string) => {
    if (confirm("Cancel this booking?"))
      updateStatus(id, "cancelled");
  };
  const togglePaid = async (id: string, currentPaid: boolean) => {
    try {
      await updateDoc(doc(db, "bookings", id), {
        paid: !currentPaid,
      });
      setBookings((p) =>
        p.map((b) =>
          b.id === id ? { ...b, paid: !currentPaid } : b
        )
      );
    } catch {
      alert("Failed to update payment.");
    }
  };

  if (authLoading || loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-dms-orange border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );

  const pending = bookings.filter((b) => b.status === "pending");
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const cancelled = bookings.filter((b) => b.status === "cancelled");
  const paidBookings = confirmed.filter((b) => b.paid);
  const totalRevenue = paidBookings.reduce((s, b) => s + b.amount, 0);
  const unpaidCount = confirmed.filter((b) => !b.paid).length;
  // FIX: Use Philippine timezone
  const today = todayPH();
  const todayBookings = confirmed.filter((b) => b.date === today);
  const filtered =
    filterStudio === "all"
      ? bookings
      : bookings.filter((b) => b.studioId === filterStudio);

  const nowMins = nowMinutesPH();

  const getBookedSlots = (studioId: string, date: string) => {
    const isToday = date === todayPH();

    return bookings
      .filter(
        (b) =>
          b.studioId === studioId &&
          b.date === date &&
          (b.status === "confirmed" || b.status === "pending")
      )
      .flatMap((b) => {
        if (b.checkedOutAt && isToday) {
          const checkoutTime = new Date(b.checkedOutAt);
          const checkoutMinutes =
            checkoutTime.getHours() * 60 +
            checkoutTime.getMinutes();
          return b.timeSlots
            .filter(
              (slot) => slotToMinutes(slot) < checkoutMinutes
            )
            .map((slot) => ({
              slot: normalizeSlot(slot),
              name: b.userName,
              status: b.status,
            }));
        }
        return b.timeSlots.map((slot) => ({
          slot: normalizeSlot(slot),
          name: b.userName,
          status: b.status,
        }));
      });
  };

const getBookingDetails = (studioId: string, date: string) => {
  const isToday = date === todayPH();
  
  // Group slots by booking
  const bookingMap = new Map<string, {
    slots: string[];
    name: string;
    status: string;
    receiptNo: string;
  }>();

  bookings
    .filter(
      (b) =>
        b.studioId === studioId &&
        b.date === date &&
        (b.status === "confirmed" || b.status === "pending")
    )
    .forEach((b) => {
      let slotsToInclude = b.timeSlots;
      
      if (b.checkedOutAt && isToday) {
        const checkoutTime = new Date(b.checkedOutAt);
        const checkoutMinutes =
          checkoutTime.getHours() * 60 + checkoutTime.getMinutes();
        slotsToInclude = b.timeSlots.filter(
          (slot) => slotToMinutes(slot) < checkoutMinutes
        );
      }

      bookingMap.set(b.id, {
        slots: slotsToInclude.map(normalizeSlot),
        name: b.userName,
        status: b.status,
        receiptNo: b.receiptNo,
      });
    });

  return bookingMap;
};
  
  return (
    <div className="min-h-screen">
      <Navbar />
      {viewReceipt && (
        <AdminReceiptModal
          booking={viewReceipt}
          onClose={() => setViewReceipt(null)}
        />
      )}
      {quickBookModal && (
        <AdminQuickBookModal
          studioId={quickBookModal.studioId}
          studioName={quickBookModal.studioName}
          date={filterDate}
          slot={quickBookModal.slot}
          onClose={() => setQuickBookModal(null)}
          onBooked={() => {}}
        />
      )}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
          {[
            { label: "Pending", value: pending.length, accent: "text-yellow-400", glow: "border-yellow-500/20 bg-yellow-500/[0.04]" },
            { label: "Confirmed", value: confirmed.length, accent: "text-green-400", glow: "border-green-500/20 bg-green-500/[0.04]" },
            { label: "Today", value: todayBookings.length, accent: "text-blue-400", glow: "border-blue-500/20 bg-blue-500/[0.04]" },
            { label: "Revenue", value: `₱${totalRevenue.toLocaleString()}`, accent: "text-dms-orange-light", glow: "border-dms-orange/20 bg-dms-orange/[0.04]" },
            { label: "Unpaid", value: unpaidCount, accent: "text-pink-400", glow: "border-pink-500/20 bg-pink-500/[0.04]" },
            { label: "Cancelled", value: cancelled.length, accent: "text-red-400", glow: "border-red-500/20 bg-red-500/[0.04]" },
          ].map((s) => (
            <div key={s.label} className={`p-5 rounded-2xl border ${s.glow}`}>
              <div className="text-[10px] font-bold tracking-[2px] uppercase text-white/30 mb-2">{s.label}</div>
              <div className={`text-2xl font-black font-mono ${s.accent}`}>{s.value}</div>
            </div>
          ))}
        </div>

      {/* Studio Activity — with late warnings */}
{(() => {
  const todayStr = todayPH();
  const todayConfirmed = bookings.filter(
    (b) => b.date === todayStr && b.status === "confirmed"
  );
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-[10px] font-black uppercase tracking-[2px] text-white/25">Studio Activity</h3>
        <span className="h-px flex-1 bg-white/[0.05]" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {STUDIOS.map((studio) => {
          const studioBookings = todayConfirmed.filter((b) => b.studioId === studio.id);
          const inStudio = studioBookings.filter((b) => b.checkedInAt && !b.checkedOutAt);
          const checkedOut = studioBookings.filter((b) => b.checkedOutAt);
          const waiting = studioBookings.filter((b) => !b.checkedInAt);
          const isOccupied = inStudio.length > 0;

          return (
            <div
              key={studio.id}
              className={`rounded-xl border p-4 transition-all ${
                isOccupied
                  ? "border-green-500/25 bg-green-500/[0.03]"
                  : "border-white/[0.06] bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${isOccupied ? "bg-green-400 animate-pulse" : "bg-white/15"}`} />
                  <span className="font-bold text-sm">{studio.name}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isOccupied ? "bg-green-500/15 text-green-400" : "bg-white/5 text-white/25"}`}>
                  {isOccupied ? "Occupied" : "Available"}
                </span>
              </div>

              {inStudio.map((b) => (
                <div key={b.id} className="p-2.5 rounded-lg bg-green-500/[0.06] border border-green-500/15 mb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-green-300">{b.userName}</span>
                    <span className="text-[10px] text-green-400/60">In: {new Date(b.checkedInAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-green-400/40 font-mono">{b.receiptNo} • {getTimeRange(b)}</span>
                    <button onClick={() => togglePaid(b.id, !!b.paid)} className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${b.paid ? "bg-green-500/15 text-green-400 border-green-500/25" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>{b.paid ? "Paid" : "Unpaid"}</button>
                  </div>
                </div>
              ))}

              {checkedOut.map((b) => (
                <div key={b.id} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] mb-2 opacity-70">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-white/50">{b.userName}</span>
                    <span className="text-[10px] text-white/25">
                      {new Date(b.checkedInAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — {new Date(b.checkedOutAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-white/15 font-mono">
                      {b.receiptNo} • {b.autoCheckedOut ? (<span className="text-red-400/70">Auto checked out</span>) : "Done"}
                    </span>
                    <button onClick={() => togglePaid(b.id, !!b.paid)} className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${b.paid ? "bg-green-500/15 text-green-400 border-green-500/25" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>{b.paid ? "Paid" : "Unpaid"}</button>
                  </div>
                </div>
              ))}

              {/* Waiting with late warnings - SORTED BY START TIME */}
              {waiting
                .sort((a, b) => {
                  // Sort by earliest start time
                  const aStart = Math.min(...a.timeSlots.map(slotToMinutes));
                  const bStart = Math.min(...b.timeSlots.map(slotToMinutes));
                  return aStart - bStart;
                })
                .map((b) => {
                  const sortedSlots = [...b.timeSlots].sort((a, c) => slotToMinutes(a) - slotToMinutes(c));
                  const startMin = slotToMinutes(sortedSlots[0]);
                  const minsLate = nowMins - startMin;
                  const isLate = minsLate > 0;
                  const isDanger = minsLate >= NO_SHOW_WARN_MINUTES;

                  return (
                    <div key={b.id} className={`p-2.5 rounded-lg mb-2 border ${isDanger ? "bg-red-500/[0.06] border-red-500/20" : isLate ? "bg-yellow-500/[0.04] border-yellow-500/15" : "bg-white/[0.02] border-white/[0.04]"}`}>
                      <div className="flex items-center justify-between">
                        <span className={`font-bold text-xs ${isDanger ? "text-red-400" : isLate ? "text-yellow-400" : "text-white/50"}`}>{b.userName}</span>
                        <span className={`text-[10px] font-bold ${isDanger ? "text-red-400" : isLate ? "text-yellow-400" : "text-white/25"}`}>
                          {isDanger
                            ? `${minsLate} min late — cancels at ${NO_SHOW_CANCEL_MINUTES}m`
                            : isLate
                            ? `${minsLate} min late`
                            : `Starts ${formatTime(sortedSlots[0])}`}
                        </span>
                      </div>
                      <div className="text-[10px] text-white/25 font-mono mt-0.5">
                        {b.receiptNo} • {getTimeRange(b)}
                      </div>
                    </div>
                  );
                })}

              {studioBookings.length === 0 && (
                <p className="text-[11px] text-white/15">No bookings today</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
})()}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 bg-white/[0.02] rounded-xl inline-flex flex-wrap">
          {(
            ["schedule", "pending", "calendar", "loyalty", "all"] as const
          ).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all capitalize relative ${
                tab === t
                  ? "bg-dms-orange/20 text-dms-orange-light"
                  : "text-white/35 hover:text-white/50"
              }`}
            >
              {t === "all"
                ? "All Bookings"
                : t === "loyalty"
                ? "Loyalty"
                : t}
              {t === "pending" && pending.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-yellow-500 text-black text-[10px] font-black flex items-center justify-center">
                  {pending.length}
                </span>
              )}
            </button>
          ))}
        </div>

       {tab === "schedule" && (
  <div className="animate-fade-in">
    <ScheduleDatePicker
      selectedDate={filterDate}
      onSelect={setFilterDate}
      bookings={bookings}
    />
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {STUDIOS.map((studio) => {
        const bookingDetails = getBookingDetails(studio.id, filterDate);
        const allBookedSlots = Array.from(bookingDetails.values()).flatMap(b => b.slots);
        
        return (
          <div key={studio.id} className="rounded-2xl overflow-hidden border border-dms-orange/10 bg-dms-dark">
            <div className="p-4 bg-dms-orange/[0.06] border-b border-dms-orange/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-dms-orange" />
                <span className="font-bold">{studio.name}</span>
              </div>
              <span className="text-xs font-mono text-dms-orange-light">
                {allBookedSlots.length}/{TIME_SLOTS.length} booked
              </span>
            </div>
            <div className="p-3 grid grid-cols-4 gap-1.5">
              {TIME_SLOTS.map((slot) => {
                // Find which booking (if any) contains this slot
                let bookingInfo: { 
                  name: string; 
                  status: string; 
                  isStart: boolean; 
                  isEnd: boolean;
                  receiptNo: string;
                } | null = null;

                for (const [bookingId, details] of bookingDetails) {
                  if (details.slots.includes(slot)) {
                    const sortedSlots = [...details.slots].sort(
                      (a, b) => slotToMinutes(a) - slotToMinutes(b)
                    );
                    bookingInfo = {
                      name: details.name,
                      status: details.status,
                      receiptNo: details.receiptNo,
                      isStart: sortedSlots[0] === slot,
                      isEnd: sortedSlots[sortedSlots.length - 1] === slot,
                    };
                    break;
                  }
                }

                const isPending = bookingInfo?.status === "pending";
                const isBooked = bookingInfo !== null;

                return (
                  <div
                    key={slot}
                    onDoubleClick={() => {
                      if (!isBooked) {
                        setQuickBookModal({ 
                          studioId: studio.id, 
                          studioName: studio.name, 
                          slot 
                        });
                      }
                    }}
                    className={`p-2 rounded-lg text-center text-[11px] font-mono border cursor-pointer transition-all ${
                      isPending
                        ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
                        : isBooked
                        ? "border-dms-orange/20 bg-dms-orange/10 text-dms-orange-light"
                        : "border-white/[0.03] bg-white/[0.01] text-white/20 hover:border-dms-orange/30"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>{slot}</span>
                      {bookingInfo?.isStart && (
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          isPending ? "bg-yellow-400" : "bg-green-400"
                        }`} title="Start" />
                      )}
                      {bookingInfo?.isEnd && (
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          isPending ? "bg-yellow-400" : "bg-blue-400"
                        }`} title="End" />
                      )}
                    </div>
                    {bookingInfo && (
                      <div className={`text-[9px] mt-0.5 truncate ${
                        isPending ? "text-yellow-400/60" : "text-white/40"
                      }`}>
                        {bookingInfo.name.split(" ")[0]}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
    <p className="text-xs text-white/20 mt-3 text-center">
      Double-click an empty time slot to quick book
    </p>
  </div>
)}
        {tab === "pending" && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-3">
              Pending Approvals{" "}
              {pending.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 text-xs font-bold">
                  {pending.length} waiting
                </span>
              )}
            </h2>
            {pending.length === 0 ? (
              <div className="text-center py-16 rounded-2xl border border-dashed border-white/[0.08]">
                <p className="text-white/25">No pending bookings</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map((b) => {
                  const studio = STUDIOS.find((s) => s.id === b.studioId);
                  return (
                    <div key={b.id} className="p-5 rounded-2xl border border-yellow-500/15 bg-yellow-500/[0.02]">
                      <div className="flex justify-between items-start flex-wrap gap-4">
                        <div className="flex items-start gap-4 flex-1">
                          <div className="w-2 h-14 rounded-full flex-shrink-0 mt-1" style={{ background: studio?.color || "#E65100" }} />
                          <div>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-bold text-lg">{b.userName}</span>
                              <StatusBadge status={b.status} />
                            </div>
                            <div className="text-sm text-white/50 mb-1">
                              {b.studioName} • {new Date(b.date + "T00:00:00").toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
                            </div>
                            <div className="text-xs font-mono text-white/30">{getTimeRange(b)} ({b.timeSlots.length * 30} mins)</div>
                            <div className="text-xs text-white/20 mt-1">{b.userEmail} • {b.userPhone}</div>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-3">
                          <div className="text-xl font-black font-mono text-dms-orange-light">₱{b.amount.toLocaleString()}</div>
                          <div className="flex gap-2 mt-1">
                            <button onClick={() => setViewReceipt(b)} className="px-3 py-2 rounded-lg border border-white/15 bg-white/[0.04] text-white/60 text-xs font-bold hover:bg-white/[0.08] transition-all">Receipt</button>
                            <button onClick={() => handleReject(b.id)} className="px-4 py-2 rounded-lg border border-red-500/30 bg-red-500/[0.08] text-red-400 text-xs font-bold hover:bg-red-500/20 transition-all">Reject</button>
                            <button onClick={() => handleApprove(b.id)} className="px-5 py-2 rounded-lg bg-gradient-to-r from-green-600 to-green-500 text-white text-xs font-bold hover:shadow-lg transition-all">Approve</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "calendar" && (
          <CalendarView bookings={bookings} onViewReceipt={setViewReceipt} />
        )}

        {tab === "loyalty" && (
          <LoyaltyPromoAdmin bookings={bookings} />
        )}

        {tab === "all" && (
          <div className="animate-fade-in">
            <div className="flex gap-2 mb-5 flex-wrap">
              <button onClick={() => setFilterStudio("all")} className={`px-4 py-2 rounded-lg text-xs font-semibold ${filterStudio === "all" ? "bg-white/10 text-white" : "bg-white/[0.02] text-white/30"}`}>All</button>
              {STUDIOS.map((s) => (
                <button key={s.id} onClick={() => setFilterStudio(s.id)} className={`px-4 py-2 rounded-lg text-xs font-semibold ${filterStudio === s.id ? "bg-dms-orange/20 text-dms-orange-light" : "bg-white/[0.02] text-white/30"}`}>{s.name}</button>
              ))}
            </div>
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-white/25">No bookings found</div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {["Receipt", "Client", "Studio", "Date", "Time", "Hrs", "Amount", "Payment", "Status", "Actions"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold tracking-[1.5px] uppercase text-white/30 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((b) => (
                      <tr key={b.id} className="border-b border-white/[0.03] hover:bg-white/[0.01]">
                        <td className="px-4 py-3 font-mono text-xs text-white/50">{b.receiptNo}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-sm">{b.userName}</div>
                          <div className="text-[11px] text-white/25">{b.userEmail}</div>
                          {b.autoCheckedOut && (
                            <div className="text-[10px] text-red-400/60 font-bold">Did not check out</div>
                          )}
                          {(b as any).cancelReason === "no-show" && (
                            <div className="text-[10px] text-red-400/60 font-bold">No-show</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-dms-orange-light font-semibold">{b.studioName}</td>
                        <td className="px-4 py-3 text-white/60">{b.date}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-white/40">{getTimeRange(b)}</td>
                        <td className="px-4 py-3 text-center font-mono">{b.hours}h</td>
                        <td className="px-4 py-3 font-mono font-bold text-white/80">₱{b.amount.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          {b.status === "confirmed" ? (
                            <button onClick={() => togglePaid(b.id, !!b.paid)} className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${b.paid ? "bg-green-500/15 text-green-400 border-green-500/25 hover:bg-green-500/25" : "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"}`}>{b.paid ? "Paid" : "Unpaid"}</button>
                          ) : (
                            <span className="text-[10px] text-white/15">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <button onClick={() => setViewReceipt(b)} className="px-2.5 py-1 rounded-md border border-white/10 bg-white/[0.04] text-white/50 text-[10px] font-bold hover:bg-white/[0.08]">View</button>
                            {b.status === "pending" && (
                              <>
                                <button onClick={() => handleApprove(b.id)} className="px-2.5 py-1 rounded-md bg-green-600/80 text-white text-[10px] font-bold hover:bg-green-600">Approve</button>
                                <button onClick={() => handleReject(b.id)} className="px-2.5 py-1 rounded-md border border-red-500/30 bg-red-500/[0.08] text-red-400 text-[10px] font-bold hover:bg-red-500/20">Reject</button>
                              </>
                            )}
                            {b.status === "confirmed" && (
                              <button onClick={() => handleCancel(b.id)} className="px-3 py-1 rounded-md border border-red-500/25 bg-red-500/[0.06] text-red-400 text-[11px] font-semibold">Cancel</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}