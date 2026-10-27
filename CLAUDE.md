# How changes are shipped

Keep replies short and ask at most one question at a time.

- Make each change on its own branch off the default branch, test it before showing it, then commit and push the branch.
- Show what changed (screenshots or a short summary), then **offer a Ship button**: ask with the question tool using a single "Ship" option (plus "Not yet"). Never make the owner type "ship". A click on it, or the word "ship", "ship it" or "merge", is the go-ahead. Do not open a PR or merge before it.
- On Ship: open a PR into the default branch, squash-merge it, and report the result (and the deploy state, if the repo deploys).
- Never put secrets in chat, commits or PRs. Do not put model names or identifiers in commits, PR text or code. Destructive actions need the owner's confirmation first.

# Velo — house rules

## Velo never sees passwords or codes (every channel, every device)
- Every message that can reach the AI or the database goes through `hideSecrets` / `scrub` (`app/lib/secrets.ts`): app chat (hidden on the device before sending), texts to Velo, phone calls, calls Velo makes, memory, reminders and drafts. Add new channels the same way.
- Velo never asks for, repeats, stores or sends passwords, PINs, one-time / verification codes, card numbers, CVVs or Social Security numbers.
- Phone and tablet apps (Android, iPad): never read or send to the AI any password field (`isPassword`), secure window (`FLAG_SECURE`), lock screen, PIN pad, or one-time-code notification or SMS; skip banking, password-manager and authenticator apps entirely; never use autofill data. Run any screen or notification text through the same `hideSecrets` before it leaves the device.
- Tests: `npm test` (tests/secrets.test.ts) — add a case for anything new it must catch or leave alone.
