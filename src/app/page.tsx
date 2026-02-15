"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { STUDIOS, RATE_PER_HOUR } from "@/types";

export default function LandingPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user && userData) {
      router.push(userData.role === "admin" ? "/admin" : "/dashboard");
    }
  }, [user, userData, loading, router]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-dms-orange/[0.03] blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-dms-orange/[0.02] blur-[80px]" />
        {/* Diagonal lines pattern */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent, transparent 30px, #FF9800 30px, #FF9800 31px)",
          }}
        />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
        {/* Logo */}
        <div className="animate-fade-up mb-6">
          <Image
            src="/logo.png"
            alt="DMS Production"
            width={120}
            height={120}
            className="mx-auto rounded-2xl shadow-2xl shadow-orange-900/20"
            style={{ animation: "pulse-glow 3s ease-in-out infinite" }}
            priority
          />
        </div>

        {/* Title */}
        <h1 className="animate-fade-up delay-100 text-5xl sm:text-7xl md:text-8xl font-black tracking-tight leading-[0.9]">
          <span className="bg-gradient-to-r from-dms-orange to-dms-orange-light bg-clip-text text-transparent">
            Darkeum Music
          </span>
          <br />
          <span className="text-dms-white text-3xl sm:text-4xl md:text-5xl font-light tracking-[6px]">
            Studio
          </span>
        </h1>

        {/* Waveform decoration */}
        <div className="animate-fade-up delay-200 flex items-center justify-center gap-[2px] my-6 h-8 opacity-40">
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              className="w-[2px] bg-dms-orange rounded-full waveform-bar"
              style={{ animationDelay: `${i * 0.06}s` }}
            />
          ))}
        </div>

        <p className="animate-fade-up delay-200 text-sm font-mono tracking-[4px] uppercase text-white/25 mb-4">
          Music Rehearsal & Recording Studios
        </p>

        <p className="animate-fade-up delay-300 max-w-md text-base text-white/40 leading-relaxed font-light mb-10">
  One of Davao’s best studios, featuring premium sound across three purpose-built rooms.
  <br />
  <span className="font-bold text-white">Book your session in seconds.</span>
</p>


        {/* Studio preview chips */}
        <div className="animate-fade-up delay-300 flex gap-3 mb-10 flex-wrap justify-center">
          {STUDIOS.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2.5 px-5 py-2.5 rounded-full border border-dms-orange/15 bg-dms-orange/[0.04]"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-dms-orange shadow-sm shadow-orange-500/50" />
              <span className="text-sm font-mono font-bold tracking-wider text-white/70">
                {s.name}
              </span>
              <span className="text-xs text-white/25">₱{RATE_PER_HOUR}/hr</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="animate-fade-up delay-400 flex gap-4 flex-wrap justify-center">
          <Link href="/login" className="btn-primary text-lg px-10">
            Book Now
          </Link>
          
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center">
        <p className="text-xs font-mono text-white/15 tracking-wider">
          © 2019 DMS Production. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
