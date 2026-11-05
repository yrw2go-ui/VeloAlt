// 📣 Social posting: keeps Page access tokens unreadable at rest and
// signs the OAuth `state`. Server only. The key is FACEBOOK_TOKEN_KEY — 32
// random bytes, base64 (e.g. `openssl rand -base64 32`).
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";

const b64url = (b: Buffer) => b.toString("base64url");
const unb64url = (s: string) => Buffer.from(s, "base64url");

/** The 32-byte key, or an error when it's missing or the wrong size. */
export function tokenKey(raw = process.env.FACEBOOK_TOKEN_KEY): Buffer {
  const key = Buffer.from(String(raw || "").trim(), "base64");
  if (key.length !== 32) throw new Error("FACEBOOK_TOKEN_KEY must be 32 bytes, base64.");
  return key;
}

/** AES-256-GCM: "v1.<iv>.<tag>.<ciphertext>" (base64url). A fresh IV every time. */
export function encryptToken(plain: string, key: Buffer = tokenKey()): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${b64url(iv)}.${b64url(c.getAuthTag())}.${b64url(ct)}`;
}

/** The token, or null when it was tampered with or made with another key. */
export function decryptToken(sealed: string | null | undefined, key: Buffer = tokenKey()): string | null {
  const [v, iv, tag, ct] = String(sealed || "").split(".");
  if (v !== "v1" || !iv || !tag || ct === undefined) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key, unb64url(iv));
    d.setAuthTag(unb64url(tag));
    return Buffer.concat([d.update(unb64url(ct)), d.final()]).toString("utf8");
  } catch { return null; }
}

// OAuth state: "<userId>.<nonce>.<expires>.<sig>". The nonce also goes in an
// httpOnly cookie, so the callback only works in the browser that started it.
const stateSig = (body: string, key: Buffer) => b64url(createHmac("sha256", key).update(`fb-state:${body}`).digest()).slice(0, 43);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const STATE_TTL_MS = 15 * 60_000;

export function makeState(userId: string, now = Date.now(), key: Buffer = tokenKey()): { state: string; nonce: string } {
  const nonce = b64url(randomBytes(18));
  const body = `${userId}.${nonce}.${now + STATE_TTL_MS}`;
  return { state: `${body}.${stateSig(body, key)}`, nonce };
}

/** The user the state was made for, or null (bad signature, expired, other browser). */
export function readState(state: string, cookieNonce: string | null | undefined, now = Date.now(), key: Buffer = tokenKey()): string | null {
  const parts = String(state || "").split(".");
  if (parts.length !== 4) return null;
  const [userId, nonce, exp, sig] = parts;
  if (!UUID.test(userId) || !nonce || !/^\d+$/.test(exp)) return null;
  const want = Buffer.from(stateSig(`${userId}.${nonce}.${exp}`, key)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (Number(exp) < now) return null;
  const a = Buffer.from(String(cookieNonce || "")), b = Buffer.from(nonce);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}
