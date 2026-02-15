"use client";

import Image from "next/image";
import Link from "next/link";
import { RATE_PER_HOUR } from "@/types";

interface Studio {
  id: string;
  name: string;
  description: string;
  image: string;
  price: number;
  location: string;
}

interface StudioCardProps {
  studio: Studio;
  isBooked?: boolean;
  bookedTimeLabel?: string; // e.g. "8:00 AM – 11:00 AM"
}

export default function StudioCard({
  studio,
  isBooked = false,
  bookedTimeLabel,
}: StudioCardProps) {
  return (
    <div className="group relative rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03] hover:border-dms-orange/30 hover:bg-white/[0.05] transition-all duration-300 flex flex-col">

      {/* Image */}
      <div className="relative h-44 bg-white/5 overflow-hidden">
        <Image
          src={studio.image}
          alt={studio.name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Booked badge on image */}
        {isBooked && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm border border-dms-orange/30 text-dms-orange-light text-xs font-bold px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-dms-orange animate-pulse" />
            Your booking
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-base font-extrabold text-white">{studio.name}</h3>
        <p className="text-xs text-dms-orange/70 font-semibold mt-0.5 mb-2">
          {studio.location}
        </p>
        <p className="text-sm text-white/40 line-clamp-2 flex-1">
          {studio.description}
        </p>

        {/* Booked time note */}
        {isBooked && bookedTimeLabel && (
          <div className="flex items-center gap-1.5 mt-3 text-xs text-white/40 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5">
            <svg
              className="w-3.5 h-3.5 text-dms-orange/60 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span>
              Booked:{" "}
              <span className="text-white/60 font-semibold">{bookedTimeLabel}</span>
            </span>
          </div>
        )}

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/[0.06]">
          {/* FIXED: Show ₱250/hr (RATE_PER_HOUR) instead of ₱125/hr (studio.price) */}
          <span className="text-base font-bold text-dms-orange-light font-mono">
            ₱{RATE_PER_HOUR.toLocaleString()}/hr
          </span>
          <Link
            href={`/booking/${studio.id}`}
            className="px-4 py-2 rounded-xl bg-dms-orange text-black text-sm font-bold hover:bg-dms-orange-light transition-all duration-200 shadow-md shadow-dms-orange/20 hover:shadow-dms-orange/40"
          >
            Book Now
          </Link>
        </div>
      </div>
    </div>
  );
}