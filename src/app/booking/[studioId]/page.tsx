"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import Navbar from "@/components/Navbar";
import BookingForm from "@/components/BookingForm";
import { STUDIOS } from "@/types";

export default function BookingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const studioId = params.studioId as string;
  const studio = STUDIOS.find((s) => s.id === studioId);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-dms-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !studio) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/40 mb-4">Studio not found</p>
          <Link href="/dashboard" className="btn-primary">
            Back to Studios
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-32">
        {/* Back button */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/60 transition-colors mb-6"
        >
          ← Back to Studios
        </Link>

        {/* Studio header */}
        <div className="flex items-center gap-4 mb-8 animate-fade-up">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-dms-orange to-dms-orange-light flex items-center justify-center shadow-lg shadow-orange-900/30">
            <span className="text-2xl font-black font-mono text-white">
              {studio.name.slice(-1)}
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold">Book {studio.name}</h1>
            <p className="text-sm text-white/35">{studio.description}</p>
          </div>
        </div>

        <BookingForm studio={studio} />
      </main>
    </div>
  );
}
