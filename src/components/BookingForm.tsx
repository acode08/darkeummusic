"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import {
  db,
  collection,
  addDoc,
  getDocs,
  query,
  where,
} from "@/lib/firebase";
import {
  Studio,
  RATE_PER_SLOT,
  RATE_PER_HOUR,
  TIME_SLOTS,
  slotToMinutes,
  normalizeSlot,
} from "@/types";
import Link from "next/link";

interface BookingFormProps {
  studio: Studio;
}

function currentMinutesPH(): number {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })
  );
  return now.getHours() * 60 + now.getMinutes();
}

function todayPH(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });
}

function calculateEndTime(slots: string[]): string {
  if (slots.length === 0) return "";
  const sorted = [...slots].sort(
    (a, b) => slotToMinutes(a) - slotToMinutes(b)
  );
  const lastSlot = sorted[sorted.length - 1];
  const lastMinutes = slotToMinutes(lastSlot);
  const endMinutes = lastMinutes + 30;

  const hours = Math.floor(endMinutes / 60);
  const mins = endMinutes % 60;

  if (hours === 0 || hours === 24)
    return `12:${mins.toString().padStart(2, "0")} AM`;
  if (hours < 12)
    return `${hours}:${mins.toString().padStart(2, "0")} AM`;
  if (hours === 12)
    return `12:${mins.toString().padStart(2, "0")} PM`;
  return `${hours - 12}:${mins.toString().padStart(2, "0")} PM`;
}

export default function BookingForm({ studio }: BookingFormProps) {
  const { user, userData } = useAuth();
  const [selectedDate, setSelectedDate] = useState(todayPH());
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [pendingSlots, setPendingSlots] = useState<string[]>([]);
  const [mySlots, setMySlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submittedInfo, setSubmittedInfo] = useState<{
    hours: number;
    amount: number;
    date: string;
    startTime: string;
    endTime: string;
  } | null>(null);

  const totalSlots = selectedSlots.length;
  const totalHours = totalSlots * 0.5;
  const totalAmount = totalSlots * RATE_PER_SLOT;

  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  });

  useEffect(() => {
    const fetchBooked = async () => {
      try {
        const qConfirmed = query(
          collection(db, "bookings"),
          where("studioId", "==", studio.id),
          where("date", "==", selectedDate),
          where("status", "==", "confirmed")
        );
        const qPending = query(
          collection(db, "bookings"),
          where("studioId", "==", studio.id),
          where("date", "==", selectedDate),
          where("status", "==", "pending")
        );
        const [snapConfirmed, snapPending] = await Promise.all([
          getDocs(qConfirmed),
          getDocs(qPending),
        ]);
        const others: string[] = [];
        const mine: string[] = [];
        const pending: string[] = [];

        const now = currentMinutesPH();
        const isToday = selectedDate === todayPH();

        snapConfirmed.forEach((docSnap) => {
          const data = docSnap.data();
          let slots = data.timeSlots as string[];

          // If booking is checked out early today, only count slots up to checkout time
          if (data.checkedOutAt && isToday) {
            const checkoutTime = new Date(data.checkedOutAt);
            const checkoutMinutes =
              checkoutTime.getHours() * 60 +
              checkoutTime.getMinutes();
            slots = slots.filter(
              (slot: string) =>
                slotToMinutes(slot) < checkoutMinutes
            );
          }

          if (data.userId === user?.uid) mine.push(...slots);
          else others.push(...slots);
        });

        snapPending.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.userId === user?.uid)
            mine.push(...(data.timeSlots as string[]));
          else pending.push(...(data.timeSlots as string[]));
        });

        setBookedSlots(others);
        setPendingSlots(pending);
        setMySlots(mine);
      } catch (err) {
        console.error("Error fetching bookings:", err);
      }
    };
    if (user) fetchBooked();
  }, [selectedDate, studio.id, user]);

  const isSlotDisabled = (slot: string): boolean => {
    if (bookedSlots.includes(slot)) return true;
    if (pendingSlots.includes(slot)) return true;
    if (mySlots.includes(slot)) return true;
    if (
      selectedDate === todayPH() &&
      slotToMinutes(slot) <= currentMinutesPH()
    )
      return true;
    return false;
  };

  const getSlotLabel = (
    slot: string
  ): { tag: string; style: string } | null => {
    if (mySlots.includes(slot))
      return { tag: "YOURS", style: "text-dms-orange/50" };
    if (bookedSlots.includes(slot))
      return { tag: "TAKEN", style: "text-red-500/40" };
    if (pendingSlots.includes(slot))
      return { tag: "PENDING", style: "text-yellow-500/40" };
    if (
      selectedDate === todayPH() &&
      slotToMinutes(slot) <= currentMinutesPH()
    )
      return { tag: "PAST", style: "text-white/20" };
    return null;
  };

  const toggleSlot = (slot: string) => {
    if (isSlotDisabled(slot)) return;
    setSelectedSlots((prev) =>
      prev.includes(slot)
        ? prev.filter((s) => s !== slot)
        : [...prev, slot]
    );
  };

  const sortSlots = (slots: string[]) =>
    [...slots].sort((a, b) => slotToMinutes(a) - slotToMinutes(b));

  const handleSubmitBooking = async () => {
    if (!user || !userData || selectedSlots.length === 0) return;
    setLoading(true);
    setShowConfirm(false);
    try {
      const receiptNo =
        "DMS-" +
        Date.now().toString().slice(-6) +
        Math.random().toString(36).slice(-2).toUpperCase();
      await addDoc(collection(db, "bookings"), {
        receiptNo,
        userId: user.uid,
        userName: userData.name,
        userEmail: userData.email,
        userPhone: userData.phone || "N/A",
        studioId: studio.id,
        studioName: studio.name,
        date: selectedDate,
        timeSlots: sortSlots(selectedSlots),
        hours: totalHours,
        amount: totalAmount,
        status: "pending" as const,
        createdAt: new Date().toISOString(),
      });
      setSubmittedInfo({
        hours: totalHours,
        amount: totalAmount,
        date: selectedDate,
        startTime: sortSlots(selectedSlots)[0],
        endTime: calculateEndTime(selectedSlots),
      });
      setSubmitted(true);
      setSelectedSlots([]);
    } catch (err) {
      console.error("Booking error:", err);
      alert("Failed to create booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return {
      day: d.toLocaleDateString("en", { weekday: "short" }),
      date: d.getDate(),
      month: d.toLocaleDateString("en", { month: "short" }),
    };
  };

  /* ══ SUBMITTED STATE ══ */
  if (submitted && submittedInfo) {
    return (
      <div className="animate-fade-up max-w-md mx-auto text-center py-8">
        <div className="w-20 h-20 rounded-full mx-auto mb-6 bg-yellow-500/10 border-2 border-yellow-500 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-yellow-500"
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
        <h2 className="text-3xl font-extrabold mb-2">
          Booking Submitted!
        </h2>
        <p className="text-white/40 mb-2">
          Your booking has been sent for approval.
        </p>
        <p className="text-sm text-yellow-500/60 mb-8">
          The admin will review your request. Once approved, your
          receipt will be available in your dashboard.
        </p>

        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-6 text-left space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-white/35">Studio</span>
            <span className="font-semibold">{studio.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/35">Date</span>
            <span className="font-semibold">
              {new Date(
                submittedInfo.date + "T00:00:00"
              ).toLocaleDateString("en", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/35">Session Time</span>
            <span className="font-semibold">
              {submittedInfo.startTime} - {submittedInfo.endTime}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/35">Duration</span>
            <span className="font-semibold">
              {Math.round(submittedInfo.hours * 60)} minutes
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/35">Amount</span>
            <span className="font-bold text-dms-orange-light font-mono">
              ₱{submittedInfo.amount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/35">Status</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 uppercase">
              Pending
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              setSubmitted(false);
              setSubmittedInfo(null);
            }}
            className="btn-outline flex-1"
          >
            Book Another
          </button>
          <Link
            href="/dashboard"
            className="btn-primary flex-1 text-center"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      {/* Step 1: Date */}
      <div className="mb-8">
        <label className="block text-xs font-bold tracking-[2px] uppercase text-white/30 mb-4">
          Step 1 — Select Date
        </label>
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-thin">
          {dates.map((d) => {
            const f = formatDate(d);
            const isSelected = selectedDate === d;
            const isToday = d === todayPH();
            return (
              <button
                key={d}
                onClick={() => {
                  setSelectedDate(d);
                  setSelectedSlots([]);
                }}
                className={`min-w-[72px] p-3 rounded-xl border text-center transition-all flex-shrink-0 ${
                  isSelected
                    ? "border-dms-orange bg-dms-orange/10 text-dms-orange-light"
                    : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:border-white/10"
                }`}
              >
                <div className="text-[11px] font-semibold mb-1">
                  {isToday ? "Today" : f.day}
                </div>
                <div className="text-xl font-extrabold">{f.date}</div>
                <div className="text-[10px] opacity-60">{f.month}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Time Slots */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <label className="block text-xs font-bold tracking-[2px] uppercase text-white/30">
            Step 2 — Select Time Slots{" "}
            <span className="text-white/15 normal-case tracking-normal">
              (30-min slots × ₱{RATE_PER_SLOT} = ₱{RATE_PER_HOUR}/hr)
            </span>
          </label>
          <div className="flex items-center gap-3 text-[10px] font-semibold">
            <span className="flex items-center gap-1 text-white/30">
              <span className="w-2 h-2 rounded-sm bg-white/10" />{" "}
              Past
            </span>
            <span className="flex items-center gap-1 text-red-400/60">
              <span className="w-2 h-2 rounded-sm bg-red-500/20" />{" "}
              Taken
            </span>
            <span className="flex items-center gap-1 text-yellow-400/60">
              <span className="w-2 h-2 rounded-sm bg-yellow-500/20" />{" "}
              Pending
            </span>
            <span className="flex items-center gap-1 text-dms-orange/60">
              <span className="w-2 h-2 rounded-sm bg-dms-orange/20" />{" "}
              Yours
            </span>
            <span className="flex items-center gap-1 text-dms-orange-light">
              <span className="w-2 h-2 rounded-sm bg-dms-orange/40" />{" "}
              Selected
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {TIME_SLOTS.map((slot) => {
            const disabled = isSlotDisabled(slot);
            const isSelected = selectedSlots.includes(slot);
            const label = getSlotLabel(slot);
            const isMine = mySlots.includes(slot);
            const isTaken = bookedSlots.includes(slot);
            const isPending = pendingSlots.includes(slot);
            const isPast =
              !isMine &&
              !isTaken &&
              !isPending &&
              selectedDate === todayPH() &&
              slotToMinutes(slot) <= currentMinutesPH();
            return (
              <button
                key={slot}
                onClick={() => toggleSlot(slot)}
                disabled={disabled}
                className={`p-2.5 rounded-xl border text-center text-xs font-mono font-semibold transition-all ${
                  isMine
                    ? "border-dms-orange/20 bg-dms-orange/[0.06] text-dms-orange/40 cursor-not-allowed"
                    : isTaken
                    ? "border-red-500/10 bg-red-500/[0.04] text-white/10 cursor-not-allowed line-through"
                    : isPending
                    ? "border-yellow-500/15 bg-yellow-500/[0.04] text-yellow-500/30 cursor-not-allowed"
                    : isPast
                    ? "border-white/[0.03] bg-white/[0.01] text-white/15 cursor-not-allowed"
                    : isSelected
                    ? "border-dms-orange bg-dms-orange/15 text-dms-orange-light shadow-md shadow-orange-900/10"
                    : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-dms-orange/30 hover:text-white/70 cursor-pointer"
                }`}
              >
                {slot}
                {label && (
                  <div
                    className={`text-[9px] mt-0.5 font-bold ${label.style}`}
                  >
                    {label.tag}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedSlots.length > 0 && <div className="h-28" />}

      {/* Summary Bar */}
      {selectedSlots.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-dms-orange/20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <div className="text-[10px] text-white/30 uppercase tracking-widest">
                  Studio
                </div>
                <div className="text-sm font-bold text-dms-orange-light">
                  {studio.name}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-white/30 uppercase tracking-widest">
                  Session Time
                </div>
                <div className="text-sm font-bold">
                  {sortSlots(selectedSlots)[0]} -{" "}
                  {calculateEndTime(selectedSlots)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-white/30 uppercase tracking-widest">
                  Duration
                </div>
                <div className="text-sm font-bold">
                  {totalSlots * 30} mins
                </div>
              </div>
              <div>
                <div className="text-[10px] text-white/30 uppercase tracking-widest">
                  Total
                </div>
                <div className="text-2xl font-black font-mono text-white">
                  ₱{totalAmount.toLocaleString()}
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={loading}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Booking..." : "Confirm Booking"}
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowConfirm(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-dms-orange/20 bg-dms-dark p-6 shadow-2xl animate-fade-up">
            <h3 className="text-xl font-bold text-center mb-2">
              Confirm Your Booking?
            </h3>
            <p className="text-sm text-white/40 text-center mb-6">
              Your booking will be sent to the admin for approval.
            </p>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 mb-6 space-y-3">
              {[
                { label: "Studio", value: studio.name },
                {
                  label: "Date",
                  value: new Date(
                    selectedDate + "T00:00:00"
                  ).toLocaleDateString("en", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  }),
                },
                {
                  label: "Session Time",
                  value: `${sortSlots(selectedSlots)[0]} - ${calculateEndTime(selectedSlots)}`,
                },
                {
                  label: "Duration",
                  value: `${totalSlots * 30} minutes`,
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex justify-between text-sm"
                >
                  <span className="text-white/35">{row.label}</span>
                  <span className="font-semibold text-right max-w-[60%]">
                    {row.value}
                  </span>
                </div>
              ))}
              <div className="border-t border-white/[0.06] pt-3 flex justify-between items-center">
                <span className="font-bold">Total Amount</span>
                <div className="text-right">
                  <div className="text-2xl font-black font-mono text-dms-orange-light">
                    ₱{totalAmount.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-white/40 mt-0.5">
                    {totalSlots} slots × ₱{RATE_PER_SLOT}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-xs text-center text-yellow-500/60 mb-5">
              Your booking will be PENDING until the admin approves
              it.
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-xl border border-white/10 bg-white/[0.03] text-white/60 font-semibold text-sm hover:bg-white/[0.06] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitBooking}
                disabled={loading}
                className="flex-1 btn-primary text-center disabled:opacity-50"
              >
                {loading ? "Submitting..." : "Yes, Book Now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}