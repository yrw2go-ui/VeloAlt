import { NextResponse } from "next/server";

// 🏷️ The version that's live right now (the app compares it with the one it's running).
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ id: process.env.NEXT_PUBLIC_BUILD_ID || "dev", time: process.env.NEXT_PUBLIC_BUILD_TIME || null }, { headers: { "Cache-Control": "no-store" } });
}
