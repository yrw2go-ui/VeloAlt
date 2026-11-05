import type { NextConfig } from "next";

// Pictures can also come from the Supabase project's storage (when it's linked).
const supabaseEnv = () => { for (const n of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) { if (process.env[n]) return process.env[n]!; const k = Object.keys(process.env).find(k => k.endsWith(`_${n}`) && process.env[k]); if (k) return process.env[k]!; } return ""; };
const SUPABASE = (() => { try { return new URL(supabaseEnv()).origin; } catch { return ""; } })();

// No framing, no sniffing, and the browser only ever talks to this site.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com" + (SUPABASE ? ` ${SUPABASE}` : ""),
  "connect-src 'self'",
  "media-src 'self' blob: data: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

// 🏷️ This build's version (the commit) and when it was built, shown at the bottom of Settings.
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7);
const BUILD_TIME = new Date().toISOString();

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID, NEXT_PUBLIC_BUILD_TIME: BUILD_TIME },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: CSP },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
