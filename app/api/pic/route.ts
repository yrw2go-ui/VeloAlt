import { NextRequest, NextResponse } from "next/server";

// Loads a generated picture on the server and sends the bytes to the app.
// The image hosts block the phone, so the chat asks this route instead.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u") || "";
  let target = "";
  try { target = decodeURIComponent(raw); } catch { target = raw; }
  if (!target.startsWith("https://")) return new NextResponse("Bad image.", { status: 400 });
  const img = await fetch(target, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "image/avif,image/webp,image/*,*/*" },
    redirect: "follow",
  }).catch(() => null);
  if (!img || !img.ok) return new NextResponse("Image unavailable.", { status: 404 });
  const buf = await img.arrayBuffer();
  if (buf.byteLength < 32) return new NextResponse("Empty image.", { status: 404 });
  const type = (img.headers.get("content-type") || "image/jpeg").split(";")[0];
  return new NextResponse(buf, {
    headers: {
      "Content-Type": type.startsWith("image/") ? type : "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
