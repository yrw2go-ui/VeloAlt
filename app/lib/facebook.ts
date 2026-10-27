// 📣 Velo posts to the person's Facebook Page (Velo Pro). Server only.
//
// Settings → Velo Pro → Facebook Page → Connect opens Facebook Login; the
// callback trades the code for a long-lived user token, lists their Pages and
// keeps the chosen Page's token in social_accounts, sealed (fbCrypto.ts). The
// browser only ever sees the Page name.
//
// Velo never posts on her own: draft_post only makes a draft; a tap on Post
// (or YES by text) publishes it through runAction (lib/pro.ts).
// Facebook only allows apps to post to Pages, not personal profiles.
//
// SECURITY: tokens never leave the server and are never logged.
import { sql } from "./db";
import { decryptToken, encryptToken } from "./fbCrypto";

// Graph API version (override with FACEBOOK_GRAPH_VERSION, e.g. "v25.0").
export const GRAPH_VERSION = /^v\d+\.\d+$/.test(process.env.FACEBOOK_GRAPH_VERSION || "") ? process.env.FACEBOOK_GRAPH_VERSION! : "v24.0";
const GRAPH = () => process.env.FACEBOOK_GRAPH_URL || `https://graph.facebook.com/${GRAPH_VERSION}`;
export const FB_SCOPES = ["pages_show_list", "pages_manage_posts", "pages_read_engagement"];
export const NONCE_COOKIE = "velo_fb_nonce";
const RECONNECT = "Reconnect Facebook in Settings → Velo Pro.";

export const fbConfigured = () => !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET && process.env.FACEBOOK_TOKEN_KEY);
/** Register exactly this in the Meta app (Facebook Login → Valid OAuth Redirect URIs). */
export const redirectUri = (origin: string) => `${process.env.APP_ORIGIN || origin}/api/social/callback`;

export class FbError extends Error {
  constructor(public code: number, public subcode: number, public kind: string) { super(`facebook ${code}/${subcode} ${kind}`); }
}

/** What to tell the person about a failed Facebook call. */
export function fbErrorMessage(e: unknown): string {
  if (!(e instanceof FbError)) return "Couldn't reach Facebook. Please try again.";
  const { code, subcode } = e;
  if (code === 190 || code === 102 || [458, 459, 460, 463, 464, 467].includes(subcode)) return `Facebook signed Velo out of your Page. ${RECONNECT}`;
  if (code === 10 || (code >= 200 && code < 300)) return `Facebook didn't let Velo post to this Page. ${RECONNECT} and allow posting.`;
  if ([4, 17, 32, 613].includes(code)) return "Facebook is limiting posts right now. Try again in a little while.";
  if (code === 368) return "Facebook blocked this post. Check it follows Facebook's rules, then try again.";
  if (code === 506) return "Facebook says this is the same as a recent post. Change the text a little and try again.";
  return "Facebook didn't accept the post. Please try again.";
}

/** Calls the Graph API. The token goes in a header, never the URL. */
export async function graph<T = Record<string, unknown>>(path: string, opts: { token?: string; method?: "GET" | "POST"; body?: URLSearchParams } = {}): Promise<T> {
  const res = await fetch(`${GRAPH()}${path}`, {
    method: opts.method || "GET",
    headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : undefined,
    body: opts.body,
    signal: AbortSignal.timeout(20_000),
  });
  const j = await res.json().catch(() => ({})) as { error?: { code?: number; error_subcode?: number; type?: string } } & T;
  if (!res.ok || j.error) {
    const err = new FbError(Number(j.error?.code) || res.status, Number(j.error?.error_subcode) || 0, String(j.error?.type || "error").slice(0, 40));
    console.error("[facebook]", path.split("?")[0].replace(/\d{5,}/g, "#"), err.message);   // codes only — no tokens, no message text
    throw err;
  }
  return j;
}

export interface FbPage { id: string; name: string; token: string }
type Row = { page_id: string | null; page_name: string | null; page_token: string | null; pending_pages: string | null; pending_until: string | Date | null; connected_at: string | Date | null };

async function row(userId: string): Promise<Row | null> {
  const [r] = await sql()`select page_id, page_name, page_token, pending_pages, pending_until, connected_at from social_accounts where user_id = ${userId} and provider = 'facebook'`;
  return (r as Row) || null;
}

const pendingPages = (sealed: string): FbPage[] => {
  try { const v = JSON.parse(decryptToken(sealed) || "[]"); return Array.isArray(v) ? v.filter(p => p && typeof p.id === "string" && typeof p.token === "string") : []; }
  catch { return []; }
};
const live = (t: string | Date | null) => !!t && new Date(t).getTime() > Date.now();

/** What the app may know: never a token. */
export async function connectionStatus(userId: string) {
  const r = await row(userId);
  return {
    configured: fbConfigured(),
    connected: !!(r?.page_id && r.page_token),
    pageName: r?.page_token ? r.page_name : null,
    choices: r?.pending_pages && live(r.pending_until) ? pendingPages(r.pending_pages).map(p => ({ id: p.id, name: p.name })) : [],
  };
}

/** The connected Page with its token, for posting. null = not connected. */
export async function connectedPage(userId: string): Promise<FbPage | null> {
  const r = await row(userId);
  const token = r?.page_id ? decryptToken(r.page_token) : null;
  return r?.page_id && token ? { id: r.page_id, name: r.page_name || "your Page", token } : null;
}

export async function connectedPageName(userId: string): Promise<string | null> {
  const r = await row(userId);
  return r?.page_id && r.page_token ? r.page_name || "your Page" : null;
}

export async function savePage(userId: string, p: FbPage) {
  await sql()`insert into social_accounts (user_id, provider, page_id, page_name, page_token, pending_pages, pending_until, connected_at, updated_at)
    values (${userId}, 'facebook', ${p.id}, ${p.name.slice(0, 200)}, ${encryptToken(p.token)}, null, null, now(), now())
    on conflict (user_id, provider) do update set page_id = excluded.page_id, page_name = excluded.page_name, page_token = excluded.page_token,
      pending_pages = null, pending_until = null, connected_at = now(), updated_at = now()`;
}

/** Several Pages: keep them (sealed) for 15 minutes while they pick one. */
export async function savePending(userId: string, pages: FbPage[]) {
  await sql()`insert into social_accounts (user_id, provider, pending_pages, pending_until, updated_at)
    values (${userId}, 'facebook', ${encryptToken(JSON.stringify(pages.slice(0, 50)))}, now() + interval '15 minutes', now())
    on conflict (user_id, provider) do update set pending_pages = excluded.pending_pages, pending_until = excluded.pending_until, updated_at = now()`;
}

export async function pickPending(userId: string, pageId: string): Promise<FbPage | null> {
  const r = await row(userId);
  if (!r?.pending_pages || !live(r.pending_until)) return null;
  const p = pendingPages(r.pending_pages).find(x => x.id === pageId);
  if (!p) return null;
  await savePage(userId, p);
  return p;
}

export async function disconnect(userId: string) {
  await sql()`delete from social_accounts where user_id = ${userId} and provider = 'facebook'`;
}

/** Code → short-lived user token → long-lived user token → their Pages (with Page tokens). */
export async function pagesFromCode(code: string, redirect: string): Promise<FbPage[]> {
  const id = process.env.FACEBOOK_APP_ID || "", secret = process.env.FACEBOOK_APP_SECRET || "";
  const short = await graph<{ access_token?: string }>("/oauth/access_token", { method: "POST", body: new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: redirect, code }) });
  if (!short.access_token) throw new FbError(190, 0, "no_token");
  const long = await graph<{ access_token?: string }>("/oauth/access_token", { method: "POST", body: new URLSearchParams({ grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: short.access_token }) });
  const userToken = long.access_token || short.access_token;
  const out: FbPage[] = [];
  let next: string | null = "/me/accounts?fields=id,name,access_token,tasks&limit=50";
  for (let i = 0; next && i < 4; i++) {
    const page: { data?: { id?: string; name?: string; access_token?: string; tasks?: string[] }[]; paging?: { next?: string } } = await graph(next, { token: userToken });
    for (const p of page.data || []) {
      // Only Pages they can post to (CREATE_CONTENT), when Facebook says which.
      if (p.id && p.access_token && (!Array.isArray(p.tasks) || p.tasks.includes("CREATE_CONTENT") || p.tasks.includes("MANAGE"))) out.push({ id: String(p.id), name: String(p.name || "Facebook Page"), token: p.access_token });
    }
    const n = page.paging?.next ? new URL(page.paging.next) : null;
    if (n) n.searchParams.delete("access_token");
    next = n ? `${n.pathname.replace(/^\/v\d+\.\d+/, "")}${n.search}` : null;
  }
  return out;
}

/** Posts to the Page. Returns the post id. */
export async function publish(page: FbPage, message: string): Promise<string> {
  const r = await graph<{ id?: string }>(`/${encodeURIComponent(page.id)}/feed`, { method: "POST", token: page.token, body: new URLSearchParams({ message }) });
  return String(r.id || "");
}
