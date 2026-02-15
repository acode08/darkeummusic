"use client";

import Link from "next/link";
import { Booking, RATE_PER_HOUR, slotTo24, normalizeSlot } from "@/types";

interface ReceiptProps {
  receipt: Booking;
  onClose: () => void;
}

function formatTime(t: string): string {
  if (t.includes("AM") || t.includes("PM")) return t;
  return normalizeSlot(t);
}

function calcEnd(slots: string[]): string {
  const sorted = [...slots].sort((a, b) => slotTo24(a) - slotTo24(b));
  const last = sorted[sorted.length - 1];
  const h24 = slotTo24(last) + 1;
  if (h24 >= 24 || h24 === 0) return "12:00 AM";
  if (h24 === 12) return "12:00 PM";
  if (h24 > 12) return `${h24 - 12}:00 PM`;
  return `${h24}:00 AM`;
}

export default function Receipt({ receipt, onClose }: ReceiptProps) {
  const formatDateLong = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const isPending = receipt.status === "pending";
  const slots = [...receipt.timeSlots].sort((a, b) => slotTo24(a) - slotTo24(b));
  const end = calcEnd(slots);

  return (
    <div className="animate-fade-up max-w-lg mx-auto">
      {/* Success / Pending header */}
      <div className="text-center mb-8">
        <div
          className={`w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center ${
            isPending
              ? "bg-yellow-500/10 border-2 border-yellow-500"
              : "bg-green-500/10 border-2 border-green-500"
          }`}
        >
          {isPending ? (
            <svg className="w-10 h-10 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <h2 className="text-3xl font-extrabold">
          {isPending ? "Booking Submitted!" : "Booking Confirmed!"}
        </h2>
        <p className="text-white/40 mt-2">
          {isPending
            ? "Waiting for admin approval"
            : "Your session has been reserved"}
        </p>
      </div>

      {/* Pending Notice */}
      {isPending && (
        <div className="mb-6 p-4 rounded-xl bg-yellow-500/[0.06] border border-yellow-500/20 flex items-start gap-3">
          <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-yellow-400">Pending Approval</p>
            <p className="text-xs text-yellow-500/50 mt-1">
              Your booking is awaiting admin confirmation. Check your dashboard for status updates.
            </p>
          </div>
        </div>
      )}

      {/* Receipt Card */}
      <div className="rounded-2xl overflow-hidden border border-white/[0.06] bg-dms-dark">
        {/* Receipt header with big receipt number */}
        <div className="p-6 text-center bg-gradient-to-br from-dms-orange/10 to-transparent border-b border-white/[0.04]">
          <div className="text-[10px] font-mono tracking-[4px] text-white/30 mb-2">RECEIPT NO.</div>
          <div className="text-2xl font-black font-mono text-dms-orange-light tracking-wider">{receipt.receiptNo}</div>
          <div className="mt-3">
            <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              isPending
                ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20"
                : "bg-green-500/15 text-green-400 border border-green-500/20"
            }`}>
              {receipt.status}
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="p-6 space-y-0">
          {[
            { label: "Client", value: receipt.userName },
            { label: "Email", value: receipt.userEmail },
            { label: "Phone", value: receipt.userPhone },
            { label: "Studio", value: receipt.studioName },
            { label: "Date", value: formatDateLong(receipt.date) },
            { label: "Time", value: `${formatTime(slots[0])} – ${formatTime(end)}` },
            { label: "Duration", value: `${receipt.hours} hour${receipt.hours > 1 ? "s" : ""}` },
          ].map((row) => (
            <div key={row.label} className="flex justify-between items-start py-3 border-b border-white/[0.03]">
              <span className="text-sm text-white/35 flex-shrink-0">{row.label}</span>
              <span className="text-sm font-semibold text-right max-w-[60%]">{row.value}</span>
            </div>
          ))}

          {/* Total */}
          <div className="flex justify-between items-center pt-5 mt-3">
            <span className="text-lg font-bold">Total Amount</span>
            <div className="text-right">
              <span className="text-3xl font-black font-mono text-dms-orange-light">
                ₱{receipt.amount.toLocaleString()}
              </span>
              <div className="text-xs font-mono text-white/25 mt-1">
                {receipt.hours}h × ₱{RATE_PER_HOUR} = ₱{receipt.amount.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Check-in instruction — only for confirmed */}
        {!isPending && (
          <div className="mx-6 mb-4 p-4 rounded-xl bg-dms-orange/[0.05] border border-dms-orange/15 text-center">
            <p className="text-xs font-bold text-dms-orange-light">Show your receipt number at the studio for check-in</p>
            <p className="text-3xl font-black font-mono text-white mt-2 tracking-widest">{receipt.receiptNo}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 text-center bg-white/[0.01] border-t border-white/[0.03]">
          <p className="text-[10px] font-mono text-white/20">
            Booked on {new Date(receipt.createdAt).toLocaleString()} • DMS PRODUCTION
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mt-6">
        <button onClick={onClose} className="btn-outline flex-1">Book Another</button>
        <Link href="/dashboard" className="btn-primary flex-1 text-center">Dashboard</Link>
      </div>
    </div>
  );
}