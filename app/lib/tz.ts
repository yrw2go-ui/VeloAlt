/** This device's IANA time zone (falls back to Central). */
export const timeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago"; } catch { return "America/Chicago"; } };
