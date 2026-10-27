"use client";
// Calls Velo's server routes as the signed-in person (the session cookie rides along).

export async function api<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/auth") window.dispatchEvent(new Event("velo:signed-out"));
  if (!res.ok) throw Object.assign(new Error(data.error || `Velo didn't answer (${res.status}).`), { final: res.status === 401 || res.status === 403 || res.status === 429 });
  return data as T;
}

/** Reads and changes the person's own data (app/api/data). */
export const data = <T = unknown>(action: string, args: Record<string, unknown> = {}) => api<T>("/api/data", { action, ...args });
