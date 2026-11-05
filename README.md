# Velo

Your personal assistant and companion — the Velo from GetPAID, as her own app.

- 💬 **Chat** — talk about anything; Velo plans, listens, and helps.
- 📞 **Call** — a hands-free voice call (natural voice with ElevenLabs, device voice otherwise), with a recap at the end.
- 🧠 **Memory** — Velo remembers your goals, the people and things in your life, and past chats; see and forget it all on the Memory tab.
- ⏰ **Reminders** — "remind me to call Mom tomorrow at 6pm" pops up in the app on time.
- ✅ **To-dos** — Velo adds to your list; check things off on the Today tab.
- 💬 **Personality** — Friend (default), Professional assistant, Sarcastic assistant, or Romantic companion (adults only, 18+ confirmation, kept tasteful). Calls Velo makes to other people always use her plain, polite voice.
- 🧠 **Velo's brain** — pick which AI she chats with: Claude (default), Qwen or DeepSeek. Memory, reminders and Pro features work with all of them; passwords and codes are hidden from every one.
- 📎 **Files** — send Velo photos, PDFs and text files in chat (📎); she can look at them, and they're saved (Vercel Blob) in a Files list on the Memory tab where you can open or delete them.
- 🧑 **Looks** — pick Velo's face (each has her own voice).
- ⭐ **Velo Pro** — Velo gets her own phone number: she texts and calls people for you (bookings, appointments, questions) and reports back, and you can text or call her. She can also post to your Facebook Page, 🔎 search the web for you (answers come with links), and 🛒 put together Amazon carts — you review and check out on Amazon yourself. Every text, call and post is shown to you first and only goes out when you tap Send / Call (or reply YES). Texts go out marked "(via Velo)"; on calls she says she's an AI assistant calling for you.

## Setup

1. Create a Neon Postgres database and run `db/schema.sql` on it.
2. Copy `.env.example` to `.env.local` and fill it in (`VELO_MODEL` is the Claude model id Velo uses).
3. `npm install && npm run dev`

### Velo Pro

1. Run `db/migrations/002-pro.sql` (already included in `db/schema.sql` for new databases).
2. **Stripe:** create a monthly price for Velo Pro (`STRIPE_PRICE_PRO`), and a webhook to `https://<your-domain>/api/stripe/webhook` for `checkout.session.completed` and `customer.subscription.*` (`STRIPE_WEBHOOK_SECRET`).
3. **Twilio:** buy a number (`TWILIO_FROM`) and set it up:
   - Messaging → "A message comes in": `https://<your-domain>/api/twilio/sms` (POST)
   - Voice → "A call comes in": `https://<your-domain>/api/twilio/voice` (POST)
   - Voice → "Call status changes": `https://<your-domain>/api/twilio/status` (POST)
   - For texting US numbers, register the number for A2P 10DLC in Twilio.
4. **Facebook Page posting:** create a Meta app with Facebook Login, add `https://<your-domain>/api/social/callback` as a Valid OAuth Redirect URI, and request `pages_show_list`, `pages_manage_posts` and `pages_read_engagement` (App Review is needed before people outside your app's roles can connect). Set `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_TOKEN_KEY` and `APP_ORIGIN`, and run `db/migrations/003-social.sql`. Facebook only lets apps post to Pages, not personal profiles.
5. **Web search** uses Anthropic's web search tool (billed per search on your Anthropic account; up to 5 searches per question) and needs a model that supports it. **Amazon carts** need no setup (optional: `AMAZON_ASSOCIATE_TAG`). Run `db/migrations/004-cart.sql`.
6. Limits: 30 texts, 10 calls and 10 posts per person per day; calls end after 10 minutes.

Run `db/migrations/006-personality.sql` for personalities and `db/migrations/007-files.sql` for files.

### Files (Vercel Blob)

Connect a Blob store to the project (it sets `BLOB_READ_WRITE_TOKEN`). Chat attachments and Velo's custom face are saved there with long random links; uploads are up to 4 MB (photos are shrunk on the device first).

### Qwen and DeepSeek (optional)

Set `QWEN_API_KEY` + `QWEN_MODEL` (Alibaba Cloud Model Studio) and/or `DEEPSEEK_API_KEY` + `DEEPSEEK_MODEL`, and run `db/migrations/005-chat-model.sql`. They handle the everyday conversation (chat, texts, calls with you); memory summaries, recaps and calls Velo makes for you stay on Claude, and if a provider fails Velo answers with Claude instead. Web search for them runs through Claude. Settings shows where each one processes data (DeepSeek's servers are in China).

Deploys on Vercel as a standard Next.js app with the same environment variables.

## Privacy

The browser never talks to the database: everything goes through the app's server routes, and every query there is scoped to the signed-in person. Passwords are hashed with scrypt; sessions are random tokens in an httpOnly cookie, stored only as a SHA-256 hash.
