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
| `sw.js` | Service worker — caches the app shell for offline use |
| `manifest.webmanifest`, `icon.svg` | PWA install metadata |

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

## The share link

```
…/index.html#v=1&s=<seed>&m=<line|corners|blackout>&p=<bitmask?>&c=<custom?>
```

Everything after `#` stays in the browser and is never sent anywhere. `p` (a
base64url bitmask over the built-in prompt list) is omitted when every prompt is
on. `c` carries any custom prompts. The prompt list order is frozen for
`v=1` — it's append-only for future versions.

## Tests

No dependencies — just Node (and, for the browser test, a local Chrome or Edge).

```
node test/logic-test.js      # seeded-card determinism, win detection, bitmask round-trip
node test/browser-test.js    # headless click-through: create → share → join → mark → BINGO → reload
```

`browser-test.js` starts its own static server and finds Chrome/Edge in the
usual install locations; it exits cleanly (skipping) if no browser is found.
