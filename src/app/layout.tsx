import type { Metadata } from "next";
import { AuthProvider } from "@/lib/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "DMS Production | Music Rehearsal & Recording Studios",
  description:
    "Book your rehearsal and recording sessions at DMS Production Studios. Three professional studios available at ₱250/hour.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-dms-black text-dms-white font-outfit antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
