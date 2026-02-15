"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const { user, userData, signOut } = useAuth();
  const pathname = usePathname();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Display first name only
  const displayName = userData?.name
    ? userData.name.split(" ")[0].charAt(0).toUpperCase() +
      userData.name.split(" ")[0].slice(1).toLowerCase()
    : user?.email ?? "";

  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">

          {/* Logo + nav */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center">
              <Image
                src="/logo.png"
                alt="DMS"
                width={80}
                height={32}
                className="h-8 w-auto object-contain"
                priority
              />
            </Link>

            <div className="hidden sm:flex items-center gap-6">
              <Link
                href="/dashboard"
                className={`relative inline-flex items-center pb-0.5 text-sm font-semibold transition-colors duration-200 ${
                  pathname === "/dashboard"
                    ? "text-white"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                Dashboard
                {pathname === "/dashboard" && (
                  <span className="absolute -bottom-[1px] left-0 right-0 h-0.5 bg-dms-orange rounded-full" />
                )}
              </Link>
            </div>
          </div>

          {/* Right — name + sign out */}
          <div className="flex items-center gap-3">
            {user && (
              <>
                {/* Avatar circle with initial */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-dms-orange/20 border border-dms-orange/30 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-dms-orange-light">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="hidden sm:block text-sm font-semibold text-white/70">
                    {displayName}
                  </span>
                </div>

                <div className="w-px h-5 bg-white/10" />

                <button
                  onClick={handleSignOut}
                  className="text-xs font-semibold text-white/40 hover:text-white border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition-all duration-200"
                >
                  Sign Out
                </button>
              </>
            )}
            {!user && (
              <Link
                href="/login"
                className="text-sm font-semibold text-dms-orange hover:text-dms-orange-light transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>

        </div>
      </div>
    </nav>
  );
}