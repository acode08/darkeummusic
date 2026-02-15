"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import Navbar from "@/components/Navbar";
import {
  db,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
} from "@/lib/firebase";
import { Booking, STUDIOS } from "@/types";

export default function MyBookingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const fetchBookings = async () => {
      if (!user) return;
      try {
        const q = query(
          collection(db, "bookings"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);
        const data: Booking[] = [];
        snapshot.forEach((doc) => {
          data.push({ id: doc.id, ...doc.data() } as Booking);
        });
        setBookings(data);
      } catch (err) {
        console.error("Error fetching bookings:", err);
      } finally {
        setLoading(false);
      }
    };
    if (user) fetchBookings();
  }, [user]);

  const handleCancel = async (bookingId: string) => {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    try {
      await updateDoc(doc(db, "bookings", bookingId), {
        status: "cancelled",
      });
      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId ? { ...b, status: "cancelled" } : b
        )
      );
    } catch (err) {
      console.error("Cancel error:", err);
      alert("Failed to cancel. Try again.");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-dms-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/60 transition-colors mb-6"
        >
          ← Back to Studios
        </Link>

        <h1 className="text-3xl font-extrabold mb-8 animate-fade-up">
          My Bookings
        </h1>

        {bookings.length === 0 ? (
          <div className="text-center py-20 animate-fade-up">
            <div className="text-5xl mb-4 opacity-30">📅</div>
            <p className="text-white/30 mb-6">
              No bookings yet. Book your first session!
            </p>
            <Link href="/dashboard" className="btn-primary">
              Browse Studios
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((b, i) => {
              const studio = STUDIOS.find((s) => s.id === b.studioId);
              const isCancelled = b.status === "cancelled";
              return (
                <div
                  key={b.id}
                  className={`p-5 rounded-2xl border transition-all animate-fade-up ${
                    isCancelled
                      ? "border-white/[0.03] bg-white/[0.01] opacity-50"
                      : "border-dms-orange/15 bg-dms-orange/[0.03] hover:border-dms-orange/25"
                  }`}
                  style={{ animationDelay: `${i * 0.05}s`, animationFillMode: "both" }}
                >
                  <div className="flex justify-between items-start flex-wrap gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold">{b.studioName}</h3>
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                            isCancelled
                              ? "bg-red-500/15 text-red-400"
                              : "bg-green-500/15 text-green-400"
                          }`}
                        >
                          {b.status}
                        </span>
                      </div>
                      <p className="text-sm text-white/40">
                        {new Date(b.date + "T00:00:00").toLocaleDateString(
                          "en",
                          {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                      </p>
                      <p className="text-xs font-mono text-white/30 mt-1">
                        {b.timeSlots.sort().join(" • ")} — {b.hours}h
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] font-mono text-white/20 mb-1">
                        {b.receiptNo}
                      </div>
                      <div className="text-xl font-black font-mono text-dms-orange-light">
                        ₱{b.amount.toLocaleString()}
                      </div>
                      {!isCancelled && (
                        <button
                          onClick={() => handleCancel(b.id)}
                          className="mt-2 px-4 py-1.5 rounded-lg border border-red-500/25 bg-red-500/[0.08] text-red-400 text-xs font-semibold hover:bg-red-500/15 transition-all"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
