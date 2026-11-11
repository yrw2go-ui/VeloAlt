// Rough weather awareness for a character's time zone.
// Uses Open-Meteo (free, no key) with approximate lat/lon for common zones.
// Returns a short note to append to the character prompt, or "" on failure.

const ZONE_COORDS: Record<string, [number, number]> = {
  "America/Chicago": [41.88, -87.63],
  "America/New_York": [40.71, -74.01],
  "America/Los_Angeles": [34.05, -118.24],
  "America/Denver": [39.74, -104.99],
  "America/Phoenix": [33.45, -112.07],
  "Europe/London": [51.51, -0.13],
  "Europe/Paris": [48.86, 2.35],
  "Asia/Tokyo": [35.68, 139.65],
  "Australia/Sydney": [-33.87, 151.21],
};

export async function weatherNote(tz: string): Promise<string> {
  const coords = ZONE_COORDS[tz] || ZONE_COORDS["America/Chicago"];
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords[0]}&longitude=${coords[1]}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&timezone=${encodeURIComponent(tz)}`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return "";
    const j = await res.json();
    const t = j?.current?.temperature_2m;
    const code = j?.current?.weather_code;
    if (t == null) return "";
    const cond = code >= 80 ? "rainy" : code >= 60 ? "showery" : code >= 50 ? "drizzly" : code >= 40 ? "foggy" : code >= 20 ? "cloudy" : "clear";
    return `WEATHER RIGHT NOW (your local time zone): about ${Math.round(t)}°F and ${cond}. When you're outdoors, dress for this — jacket or layers if cool, light clothes if warm, rain gear if wet. Mention the weather naturally when it fits.`;
  } catch {
    return "";
  }
}
