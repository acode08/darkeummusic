"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import Navbar from "@/components/Navbar";
import StudioCard from "@/components/StudioCard";
import { STUDIOS, Booking, slotToMinutes, normalizeSlot } from "@/types";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

const PROMO_HOURS = 15;

function todayPH(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}
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
  if (h24 >= 24 || h24 === 0) return `12:${m.toString().padStart(2, '0')} AM`;
  if (h24 === 12) return `12:${m.toString().padStart(2, '0')} PM`;
  if (h24 > 12) return `${h24 - 12}:${m.toString().padStart(2, '0')} PM`;
  return `${h24}:${m.toString().padStart(2, '0')} AM`;
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function fmtDateShort(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  const cls = map[status?.toLowerCase()] ?? map.pending;
  const label = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function ReceiptModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const slots = [...booking.timeSlots].sort((a, b) => slotToMinutes(a) - slotToMinutes(b));
  const end = calcEnd(slots);

  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  useEffect(() => { const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [onClose]);

  const handleSaveImage = async () => {
    setSaving(true);
    try {
      const W = 700, H = 580;
      const details = [["Receipt No.", booking.receiptNo], ["Studio", booking.studioName], ["Date", fmtDate(booking.date)], ["Time", `${formatTime(slots[0])} - ${formatTime(end)}`], ["Duration", `${booking.timeSlots.length * 30} mins`]];
      const client = [["Name", booking.userName], ["Email", booking.userEmail], ["Phone", booking.userPhone]];
      const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#0f0f0f"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#E65100"; ctx.fillRect(0, 0, W, 3);
      let y = 50;
      ctx.textAlign = "center"; ctx.fillStyle = "#E65100AA"; ctx.font = "bold 11px Arial"; ctx.fillText("DMS STUDIO", W / 2, y); y += 32;
      ctx.fillStyle = "#FFF"; ctx.font = "bold 24px Arial"; ctx.fillText("Booking Confirmed!", W / 2, y); y += 22;
      ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "14px Arial"; ctx.fillText("Your receipt is ready", W / 2, y); y += 35;
      ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 40, y); ctx.stroke(); y += 25;
      ctx.textAlign = "left";
      details.forEach(([l, v]) => { ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "14px Arial"; ctx.fillText(l, 50, y); ctx.fillStyle = "#FFF"; ctx.font = "bold 14px Arial"; ctx.textAlign = "right"; ctx.fillText(v, W - 50, y); ctx.textAlign = "left"; y += 30; });
      y += 5; ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 40, y); ctx.stroke(); y += 25;
      ctx.fillStyle = "#FFF"; ctx.font = "bold 16px Arial"; ctx.fillText("Total Amount", 50, y); ctx.fillStyle = "#FF9800"; ctx.font = "bold 28px Courier New"; ctx.textAlign = "right"; ctx.fillText(`P${booking.amount.toLocaleString()}`, W - 50, y + 3); ctx.textAlign = "left"; y += 40;
      ctx.fillStyle = "rgba(255,255,255,0.03)"; ctx.strokeStyle = "rgba(255,255,255,0.06)"; const bH = 30 + client.length * 28; ctx.beginPath(); ctx.roundRect(40, y, W - 80, bH, 12); ctx.fill(); ctx.stroke(); y += 25;
      ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.font = "bold 10px Arial"; ctx.fillText("CLIENT INFORMATION", 55, y); y += 20;
      client.forEach(([l, v]) => { ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "14px Arial"; ctx.textAlign = "left"; ctx.fillText(l, 55, y); ctx.fillStyle = "#FFF"; ctx.font = "bold 14px Arial"; ctx.textAlign = "right"; ctx.fillText(v, W - 55, y); y += 28; });
      y += 15; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.font = "10px Arial"; ctx.fillText("DMS PRODUCTION", W / 2, y);
      ctx.fillStyle = "#E65100"; ctx.fillRect(0, H - 3, W, 3);
      const link = document.createElement("a"); link.download = `receipt-${booking.receiptNo}.png`; link.href = canvas.toDataURL("image/png"); link.click();
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl border border-dms-orange/20 bg-[#0f0f0f] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="text-center px-6 pt-8 pb-6 border-b border-white/[0.08]">
          <p className="text-xs font-black tracking-[0.25em] uppercase text-dms-orange/70 mb-2">DMS Studio</p>
          <h2 className="text-2xl font-extrabold text-white mb-1">Booking Confirmed!</h2>
          <p className="text-sm text-white/40">Your receipt is ready</p>
        </div>
        <div className="px-6 py-5 space-y-3.5">
          {([["Receipt No.", booking.receiptNo], ["Studio", booking.studioName], ["Date", fmtDate(booking.date)], ["Session Time", `${formatTime(slots[0])} – ${formatTime(end)}`], ["Duration", `${booking.timeSlots.length * 30} minutes`]] as [string, string][]).map(([label, value]) => (
            <div key={label} className="flex justify-between items-center gap-4"><span className="text-sm text-white/40 shrink-0">{label}</span><span className="text-sm font-semibold text-white text-right">{value}</span></div>
          ))}
          <div className="flex justify-between items-center pt-3 border-t border-white/[0.08]">
            <span className="text-base font-bold text-white">Total Amount</span>
            <span className="text-2xl font-black font-mono text-dms-orange-light">₱{booking.amount.toLocaleString()}</span>
          </div>
        </div>
        <div className="mx-6 mb-5 bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-2">
          <p className="text-xs font-bold tracking-[2px] uppercase text-white/30 mb-3">Client Information</p>
          {([["Name", booking.userName], ["Email", booking.userEmail], ["Phone", booking.userPhone]] as [string, string][]).map(([l, v]) => (
            <div key={l} className="flex justify-between gap-4"><span className="text-sm text-white/40 shrink-0">{l}</span><span className="text-sm font-semibold text-white text-right break-all">{v}</span></div>
          ))}
        </div>
        <div className="mx-6 mb-5 p-3 rounded-xl bg-dms-orange/[0.05] border border-dms-orange/15 text-center">
          <p className="text-[10px] font-bold tracking-[2px] uppercase text-white/25 mb-1">Show this at the studio</p>
          <p className="text-xl font-black font-mono text-dms-orange-light tracking-wider">{booking.receiptNo}</p>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={handleSaveImage} disabled={saving} className={`flex-1 px-4 py-3 rounded-xl border font-semibold text-sm transition-all ${saved ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-dms-orange/30 bg-dms-orange/10 text-dms-orange-light hover:bg-dms-orange/20"}`}>{saving ? "Saving..." : saved ? "Saved!" : "Save Image"}</button>
          <button onClick={onClose} className="flex-1 px-4 py-3 rounded-xl bg-dms-orange text-black font-bold hover:bg-dms-orange-light transition-all text-sm">Done</button>
        </div>
        <p className="text-center text-xs text-white/20 pb-5">Please arrive on time for your session</p>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}

function ActiveBookingCard({ booking }: { booking: Booking }) {
  const [showReceipt, setShowReceipt] = useState(false);
  const slots = [...booking.timeSlots].sort((a, b) => slotToMinutes(a) - slotToMinutes(b));
  const end = calcEnd(slots);
  const isToday = booking.date === todayPH();
  const isConfirmed = booking.status === "confirmed";
  const isCheckedIn = booking.checkedInAt;

  return (
    <>
      {showReceipt && isConfirmed && <ReceiptModal booking={booking} onClose={() => setShowReceipt(false)} />}
      <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-1 bg-dms-orange rounded-l-2xl" />
        <div className="pl-6 pr-5 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {isToday ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-dms-orange uppercase tracking-widest"><span className="w-1.5 h-1.5 rounded-full bg-dms-orange animate-pulse" /> Live Today</span>
              ) : (
                <span className="text-xs font-bold text-white/30 uppercase tracking-widest">Upcoming</span>
              )}
              <StatusBadge status={booking.status} />
              {isConfirmed && isCheckedIn && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border bg-green-500/15 text-green-400 border-green-500/30"><span className="w-1.5 h-1.5 rounded-full bg-current" /> Checked In</span>
              )}
              {isConfirmed && (
                <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${booking.paid ? "bg-green-500/10 text-green-400 border-green-500/25" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>{booking.paid ? "Paid" : "Unpaid"}</span>
              )}
            </div>
            <p className="text-xl font-black text-white truncate">{booking.studioName}</p>
            <p className="text-xs text-white/40 mt-0.5">{fmtDate(booking.date)}<span className="mx-1.5 text-white/20">·</span>{formatTime(slots[0])} – {formatTime(end)}<span className="mx-1.5 text-white/20">·</span>{booking.timeSlots.length * 30} mins</p>
            {isCheckedIn && <p className="text-xs text-green-400/60 mt-1">Checked in at {new Date(booking.checkedInAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</p>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right"><p className="text-xs text-white/30 font-semibold">Total</p><p className="text-lg font-black text-dms-orange-light font-mono">₱{booking.amount.toLocaleString()}</p></div>
            {isConfirmed && (
              <button onClick={() => setShowReceipt(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dms-orange/10 hover:bg-dms-orange/20 border border-dms-orange/25 hover:border-dms-orange/40 text-dms-orange-light text-sm font-bold transition-all duration-200">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Receipt
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Simple loyalty card — no emojis, no dots, no gradients
function LoyaltyPromoCard({ bookings }: { bookings: Booking[] }) {
  const totalHours = useMemo(() => {
    return bookings.filter((b) => b.status === "confirmed").reduce((sum, b) => sum + b.hours, 0);
  }, [bookings]);

  const promosEarned = Math.floor(totalHours / PROMO_HOURS);
  const progressInCycle = totalHours % PROMO_HOURS;
  const progressPct = (progressInCycle / PROMO_HOURS) * 100;
  const remaining = PROMO_HOURS - progressInCycle;
  const isClose = remaining <= 5 && remaining > 0;
  const justCompleted = progressInCycle === 0 && promosEarned > 0;

  return (
    <div className={`rounded-2xl border p-5 transition-all ${justCompleted ? "border-green-500/25 bg-green-500/[0.04]" : isClose ? "border-yellow-500/20 bg-yellow-500/[0.03]" : "border-white/10 bg-white/[0.03]"}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">Loyalty Promo</h3>
          <p className="text-[11px] text-white/30 mt-0.5">Book {PROMO_HOURS} hours total = 1 FREE live recording</p>
        </div>
        {promosEarned > 0 && (
          <span className="px-3 py-1.5 rounded-full bg-green-500/15 border border-green-500/25 text-green-400 text-xs font-bold">{promosEarned} earned</span>
        )}
      </div>
      <div className="flex items-end justify-between mb-2">
        <div><span className="text-2xl font-black font-mono text-white">{totalHours.toFixed(1)}</span><span className="text-sm text-white/30 ml-1">/ {PROMO_HOURS}h</span></div>
        <span className={`text-xs font-semibold ${justCompleted ? "text-green-400" : isClose ? "text-yellow-400" : "text-white/25"}`}>
          {justCompleted ? "Promo ready — contact DMS Studio" : `${remaining.toFixed(1)}h to next promo`}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${justCompleted ? "bg-green-500" : isClose ? "bg-yellow-500" : "bg-dms-orange"}`} style={{ width: `${justCompleted ? 100 : progressPct}%` }} />
      </div>
      <p className="text-[10px] text-white/15 mt-2">Every 15 hours of booking earns 1 free song live recording (1 hour max, including video)</p>
    </div>
  );
}

function BookingHistory({ bookings }: { bookings: Booking[] }) {
  const [receiptBooking, setReceiptBooking] = useState<Booking | null>(null);
  if (bookings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
        <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3"><svg className="w-7 h-7 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
        <p className="text-white/25 text-sm font-semibold">No previous bookings yet</p>
      </div>
    );
  }
  return (
    <>
      {receiptBooking && receiptBooking.status === "confirmed" && <ReceiptModal booking={receiptBooking} onClose={() => setReceiptBooking(null)} />}
      <div className="space-y-2">
        {bookings.map((b) => {
          const slots = [...b.timeSlots].sort((a, c) => slotToMinutes(a) - slotToMinutes(c));
          const end = calcEnd(slots);
          const isConfirmed = b.status === "confirmed";
          return (
            <div key={b.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04] transition-all duration-200 overflow-hidden">
              <div className="flex items-center gap-4 px-4 py-3.5">
                <div className="shrink-0 w-11 h-11 rounded-lg bg-white/5 border border-white/10 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold uppercase text-white/30 leading-none">{new Date(b.date + "T00:00:00").toLocaleDateString("en", { month: "short" })}</span>
                  <span className="text-base font-black text-white leading-tight">{new Date(b.date + "T00:00:00").getDate()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-white">{b.studioName}</p>
                    <StatusBadge status={b.status} />
                    {isConfirmed && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${b.paid ? "bg-green-500/10 text-green-400 border-green-500/25" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>{b.paid ? "Paid" : "Unpaid"}</span>}
                  </div>
                  <p className="text-xs text-white/35 mt-0.5">{formatTime(slots[0])} – {formatTime(end)}<span className="mx-1.5 text-white/20">·</span>{b.timeSlots.length * 30} mins<span className="mx-1.5 text-white/20">·</span>{fmtDateShort(b.date)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-black text-dms-orange-light font-mono hidden sm:block">₱{b.amount.toLocaleString()}</span>
                  {isConfirmed && (
                    <button onClick={() => setReceiptBooking(b)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-dms-orange/10 border border-white/10 hover:border-dms-orange/25 text-white/40 hover:text-dms-orange-light text-xs font-bold transition-all duration-200">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                      Receipt
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/[0.07] ${className ?? ""}`} />;
}

export default function DashboardPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [historyBookings, setHistoryBookings] = useState<Booking[]>([]);
  const [allUserBookings, setAllUserBookings] = useState<Booking[]>([]);
  const [bookingLoading, setBookingLoading] = useState(true);
  const prevConfirmedIds = useRef<Set<string> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && userData?.role === "admin") router.push("/admin");
  }, [user, userData, loading, router]);

  const playConfirmSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current; const now = ctx.currentTime;
      const playTone = (freq: number, start: number, dur: number) => { const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.type = "sine"; osc.frequency.value = freq; gain.gain.setValueAtTime(0.25, now + start); gain.gain.exponentialRampToValueAtTime(0.01, now + start + dur); osc.connect(gain); gain.connect(ctx.destination); osc.start(now + start); osc.stop(now + start + dur); };
      playTone(523.25, 0, 0.12); playTone(659.25, 0.1, 0.12); playTone(783.99, 0.2, 0.15); playTone(1046.5, 0.3, 0.3);
    } catch { }
  }, []);

  const sendPushNotif = useCallback((title: string, body: string) => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") new Notification(title, { body, icon: "/favicon.ico", badge: "/favicon.ico", tag: "dms-booking" });
  }, []);

  useEffect(() => { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "bookings"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) })).sort((a, b) => b.date.localeCompare(a.date));
      const today = todayPH();
      const upcoming = docs.filter((b) => b.date >= today && b.status !== "cancelled").sort((a, b) => a.date.localeCompare(b.date));
      const past = docs.filter((b) => b.date < today);
      const currentConfirmedIds = new Set(docs.filter((b) => b.status === "confirmed").map((b) => b.id));
      if (prevConfirmedIds.current !== null) {
        const newlyConfirmed = [...currentConfirmedIds].filter((id) => !prevConfirmedIds.current!.has(id));
        if (newlyConfirmed.length > 0) {
          playConfirmSound();
          const newBooking = docs.find((b) => b.id === newlyConfirmed[0]);
          if (newBooking) { sendPushNotif("Booking Confirmed!", `Your ${newBooking.studioName} session on ${new Date(newBooking.date + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })} has been approved!`); document.title = "Booking Confirmed! — DMS"; setTimeout(() => { document.title = "DMS Production"; }, 5000); }
        }
      }
      prevConfirmedIds.current = currentConfirmedIds;
      setUpcomingBookings(upcoming); setHistoryBookings(past); setAllUserBookings(docs); setBookingLoading(false);
    }, (err) => { console.error("Booking listener error:", err); setBookingLoading(false); });
    return () => unsubscribe();
  }, [user, playConfirmSound, sendPushNotif]);

  if (loading) return (<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-dms-orange border-t-transparent rounded-full animate-spin" /></div>);
  if (!user) return null;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        <section className="animate-fade-up" style={{ animationDelay: "0ms" }}>
          <SectionLabel>Loyalty Promo</SectionLabel>
          {bookingLoading ? <Skeleton className="h-[120px] rounded-2xl" /> : <LoyaltyPromoCard bookings={allUserBookings} />}
        </section>
        <section className="animate-fade-up" style={{ animationDelay: "60ms" }}>
          <SectionLabel right={upcomingBookings.length > 1 ? <span className="text-xs font-bold text-white/25">{upcomingBookings.length} upcoming</span> : undefined}>Your Sessions</SectionLabel>
          {bookingLoading ? (
            <div className="rounded-2xl border border-white/10 p-6 space-y-4"><Skeleton className="h-8 w-44" /><Skeleton className="h-3 w-32" /></div>
          ) : upcomingBookings.length > 0 ? (
            <div className="space-y-3">{upcomingBookings.map((b) => <ActiveBookingCard key={b.id} booking={b} />)}</div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center"><p className="text-white/25 text-sm font-semibold">No upcoming sessions</p><p className="text-white/15 text-xs mt-1">Choose a studio below to book</p></div>
          )}
        </section>
        <section className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          <SectionLabel>Book a Studio</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {STUDIOS.map((studio) => {
              const studioBookings = upcomingBookings.filter((b) => b.studioId === studio.id);
              const isBooked = studioBookings.length > 0;
              let bookedTimeLabel: string | undefined;
              if (isBooked) { bookedTimeLabel = studioBookings.map((b) => { const s = [...b.timeSlots].sort((a, c) => slotToMinutes(a) - slotToMinutes(c)); const dateShort = new Date(b.date + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" }); return `${dateShort}: ${formatTime(s[0])} – ${calcEnd(b.timeSlots)}`; }).join(" | "); }
              return <StudioCard key={studio.id} studio={studio} isBooked={isBooked} bookedTimeLabel={bookedTimeLabel} />;
            })}
          </div>
        </section>
        <section className="animate-fade-up" style={{ animationDelay: "180ms" }}>
          <SectionLabel right={historyBookings.length > 0 ? <span className="text-xs font-bold text-white/25">{historyBookings.length} session{historyBookings.length > 1 ? "s" : ""}</span> : undefined}>Booking History</SectionLabel>
          {bookingLoading ? <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-[70px] rounded-xl" />)}</div> : <BookingHistory bookings={historyBookings} />}
        </section>
      </main>
    </div>
  );
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-white/30 shrink-0">{children}</h2>
      <span className="h-px flex-1 bg-white/[0.07]" />
      {right}
    </div>
  );
}