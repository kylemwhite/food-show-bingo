# Food Show Bingo

Spot-it bingo for walking a trade-show / food-expo floor with friends. Every
square is something to catch happening on the floor ("a vendor asleep in their
booth", "too many samples broke someone's tote bag"). Tap squares as you spot
them; first to complete the pattern yells BINGO and shows their phone.

**No server, no accounts, no build step.** One person makes a game and shares a
link / QR code. Everyone's card is generated on-device from a seed carried in
that link, so all cards draw from the same pool but no two are alike.

See [docs/food-show-bingo.md](docs/food-show-bingo.md) for the full design.

## Files

| File | What |
|------|------|
| `index.html` | The whole app — markup, styles, and logic in one file |
| `qrcode.min.js` | Vendored QR generator ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4, MIT) |
| `realtime-config.js` | Optional live-sync keys — blank by default (see below) |
| `sw.js` | Service worker — caches the app shell for offline use |
| `manifest.webmanifest`, `icon.svg` | PWA install metadata |
| `netlify.toml` | Static-publish + no-cache headers for Netlify |

## Running it

It's a static site. Any of:

- **Just open `index.html`** in a browser (works from `file://`; the offline
  service worker is skipped there but everything else works).
- **Serve the folder** for phone testing on the same network:
  ```
  npx serve .        # or: python -m http.server
  ```
- **Deploy** by copying the folder to GitHub Pages, Netlify, Cloudflare Pages,
  or any static host. No configuration needed.

## How a game flows

1. Host opens the app → **Make a game** → picks a win condition (Line / Corners
   / Blackout), optionally toggles prompts off or adds custom ones → **Generate
   game link**.
2. Host shows the QR / sends the link. Each player opens it, enters a name +
   marker emoji, and gets their card.
3. Players tap squares as they spot things. Long-press a square for the full
   text and to add a private "witness note".
4. When your pattern is complete the **BINGO!** button lights up. Tap it, show
   your phone to the group — that's the whole verification (honor system).
5. **Rematch** from the menu or the BINGO screen generates a fresh link; players
   reopen it. Names are remembered per device.

## State

- `localStorage` only. `fsb:profile` holds your name + emoji; `fsb:game:<seed>`
  holds your marks and notes for one card.
- State is per-device — opening the same link on another phone starts a fresh
  card there.

## Optional: live sync

Off by default — the game is fully offline/no-server as shipped. Turn it on and
players get a banner (with sound + vibration) when anyone calls BINGO, plus a
small "N online" indicator on the board.

1. Create a free [Supabase](https://supabase.com) project (no tables, no schema
   — just Realtime, which is on by default).
2. Put the **Project URL** and the **anon / publishable key** in
   [`realtime-config.js`](realtime-config.js) and commit. Both are public client
   values, safe to ship in the browser; the app only uses Realtime broadcast +
   presence (ephemeral pub/sub, no database access).
3. Redeploy. Done.

The channel name is the game seed, so sync is scoped to one game and needs no
auth. If the keys are blank, the Supabase library is never even loaded. Free-tier
usage for this is a few messages per game — effectively nothing.

Spoofing a BINGO over the wire is possible; that already matches the in-person
honor-system design. "Back to card" broadcasts a retraction that clears the
banner on everyone's phone.

## The share link

```
…/index.html#v=1&s=<seed>&m=<line|corners|blackout>&p=<bitmask?>&c=<custom?>
```

Everything after `#` stays in the browser and is never sent anywhere. `p` (a
base64url bitmask over the built-in prompt list) is omitted when every prompt is
on. `c` carries any custom prompts. The prompt list order is frozen for
`v=1` — it's append-only for future versions.

## Versioning

A small `v <date>` shows at the bottom of the landing / join / share screens and
in the in-game menu — glance there to confirm a deploy landed. On each change,
bump **both** `APP_VERSION` in `index.html` and `CACHE` in `sw.js` to the same
value (the `CACHE` bump is what makes clients pull the new offline shell).

## Tests

No dependencies — just Node (and, for the browser test, a local Chrome or Edge).

```
node test/logic-test.js       # seeded-card determinism, win detection, bitmask round-trip
node test/browser-test.js     # headless click-through: create → share → join → mark → BINGO → reload
node test/realtime-test.js    # live-sync wiring: presence count, incoming-BINGO banner, retract, outgoing broadcast
```

The browser tests start their own static server and find Chrome/Edge in the
usual install locations; they exit cleanly (skipping) if no browser is found.
`realtime-test.js` uses a mock Supabase client — no account or network needed.
