export interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
  phone?: string;
  createdAt?: Date;
}

export interface UserData {
  name: string;
  email: string;
  phone?: string;
  role: "user" | "admin";
  createdAt: string;
}

export interface Booking {
  id: string;
  receiptNo: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  studioId: string;
  studioName: string;
  date: string;
  timeSlots: string[];
  hours: number;
  amount: number;
  status: "pending" | "confirmed" | "cancelled";
  paid?: boolean;
  checkedInAt?: string;
  checkedOutAt?: string;
  autoCheckedOut?: boolean;
  createdAt: string;
  bandName?: string;
}

export interface Studio {
  id: string;
  name: string;
  description: string;
  image: string;
  color: string;
  price: number;
  location: string;
}

export const RATE_PER_SLOT = 125; // ₱125 per 30-minute slot
export const RATE_PER_HOUR = RATE_PER_SLOT * 2; // ₱250 per hour

// 30-minute increments from 8:00 AM to 10:30 PM (last session ends at 11:00 PM)
export const TIME_SLOTS = [
  "8:00 AM",
  "8:30 AM",
  "9:00 AM",
  "9:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "12:00 PM",
  "12:30 PM",
  "1:00 PM",
  "1:30 PM",
  "2:00 PM",
  "2:30 PM",
  "3:00 PM",
  "3:30 PM",
  "4:00 PM",
  "4:30 PM",
  "5:00 PM",
  "5:30 PM",
  "6:00 PM",
  "6:30 PM",
  "7:00 PM",
  "7:30 PM",
  "8:00 PM",
  "8:30 PM",
  "9:00 PM",
  "9:30 PM",
  "10:00 PM",
  "10:30 PM",
];

// Convert slot to minutes since midnight
export function slotToMinutes(slot: string): number {
  const [timePart, period] = slot.split(" ");
  const [hourStr, minuteStr] = timePart.split(":");
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr || "0", 10);

  if (period === "AM" && hour === 12) hour = 0;
  if (period === "PM" && hour !== 12) hour += 12;

  return hour * 60 + minute;
}

// Convert any slot format to 24h number for sorting/comparison
export function slotTo24(slot: string): number {
  return slotToMinutes(slot) / 60;
}

// Normalize any slot to 12-hour display format
export function normalizeSlot(slot: string): string {
  if (slot.includes("AM") || slot.includes("PM")) return slot;
  const [hourStr, minuteStr] = slot.split(":");
  const h = parseInt(hourStr, 10);
  const m = parseInt(minuteStr || "0", 10);
  const minutePart = m > 0 ? `:${m.toString().padStart(2, "0")}` : ":00";

  if (h === 0) return `12${minutePart} AM`;
  if (h < 12) return `${h}${minutePart} AM`;
  if (h === 12) return `12${minutePart} PM`;
  return `${h - 12}${minutePart} PM`;
}

export const STUDIOS: Studio[] = [
  {
    id: "studio-a",
    name: "Studio A",
    description: "Perfect for solo artists and small groups",
    image: "/studios/studio-a.jpg",
    color: "#FF6B35",
    price: 125,
    location: "Floor 1",
  },
  {
    id: "studio-b",
    name: "Studio B",
    description: "Ideal for bands and larger productions",
    image: "/studios/studio-b.jpg",
    color: "#F7931E",
    price: 125,
    location: "Floor 2",
  },
  {
    id: "studio-c",
    name: "Studio C",
    description: "Premium acoustics for professional recording",
    image: "/studios/studio-c.jpg",
    color: "#FDC830",
    price: 125,
    location: "Floor 3",
  },
];

export interface PageProps {
  params: { [key: string]: string };
  searchParams: { [key: string]: string | string[] | undefined };
}