// 📞✉️ Phone numbers and emails, the same rules everywhere (every app, every
// form, server and browser). Optional fields can stay blank, but anything typed
// in has to be real:
//   • Phone: US/Canada, exactly 10 digits (a leading 1 is dropped), shown as
//     219-555-0142 — dashes are added as you type.
//   • Email: something@something.something (no spaces).
// Pure functions, safe to import from client or server code.

/** Digits only, without a leading country code 1, at most 10. */
export const phoneDigits = (v: unknown) => {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("1")) d = d.slice(1);
  return d.slice(0, 10);
};

/** Formats as you type: "2195" → "219-5", "2195550142" → "219-555-0142". Use in onChange. */
export function formatPhone(v: unknown) {
  const d = phoneDigits(v);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

/** A full 10-digit number. */
export const isValidPhone = (v: unknown) => phoneDigits(v).length === 10 && !/^[01]/.test(phoneDigits(v));

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;
/** something@something.something */
export const isValidEmail = (v: unknown) => EMAIL_RE.test(String(v ?? "").trim());
/** Trimmed and lowercased — what gets saved. */
export const cleanEmail = (v: unknown) => String(v ?? "").trim().toLowerCase();

export const PHONE_MSG = "Enter a 10-digit phone number, like 888-888-8888.";
export const EMAIL_MSG = "Enter a real email address, like name@company.com.";

/**
 * Checks optional (or required) contact fields. Returns the first problem as a
 * friendly message, or "" when everything is fine. Blank optional fields pass.
 *   const err = contactProblem({ phone: form.phone, email: form.email }); if (err) return gpAlert(err);
 */
export function contactProblem(f: { phone?: unknown; email?: unknown; label?: string }, required: { phone?: boolean; email?: boolean } = {}) {
  const who = f.label ? `${f.label}: ` : "";
  const phone = String(f.phone ?? "").trim(), email = String(f.email ?? "").trim();
  if (required.phone && !phone) return `${who}Add a phone number.`;
  if (required.email && !email) return `${who}Add an email address.`;
  if (phone && !isValidPhone(phone)) return who + PHONE_MSG;
  if (email && !isValidEmail(email)) return who + EMAIL_MSG;
  return "";
}

/** Server side: the cleaned value, "" for blank, or null when it's filled in but not valid. */
export const serverPhone = (v: unknown): string | null => { const s = String(v ?? "").trim(); return !s ? "" : isValidPhone(s) ? formatPhone(s) : null; };
export const serverEmail = (v: unknown): string | null => { const s = String(v ?? "").trim(); return !s ? "" : isValidEmail(s) ? cleanEmail(s) : null; };
