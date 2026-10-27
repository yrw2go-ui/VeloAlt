# Velo

Your personal assistant and companion — the Velo from GetPAID, as her own app.

- 💬 **Chat** — talk about anything; Velo plans, listens, and helps.
- 📞 **Call** — a hands-free voice call (natural voice with ElevenLabs, device voice otherwise), with a recap at the end.
- 🧠 **Memory** — Velo remembers your goals, the people and things in your life, and past chats; see and forget it all on the Memory tab.
- ⏰ **Reminders** — "remind me to call Mom tomorrow at 6pm" pops up in the app on time.
- ✅ **To-dos** — Velo adds to your list; check things off on the Today tab.
- 🧑 **Looks** — pick Velo's face (each has her own voice).

## Setup

1. Create a Neon Postgres database and run `db/schema.sql` on it.
2. Copy `.env.example` to `.env.local` and fill it in (`VELO_MODEL` is the Claude model id Velo uses).
3. `npm install && npm run dev`

Deploys on Vercel as a standard Next.js app with the same environment variables.

## Privacy

The browser never talks to the database: everything goes through the app's server routes, and every query there is scoped to the signed-in person. Passwords are hashed with scrypt; sessions are random tokens in an httpOnly cookie, stored only as a SHA-256 hash.
