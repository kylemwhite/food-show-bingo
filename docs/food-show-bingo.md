# Food Show Bingo

A lightweight web app for playing "spot it" bingo with friends while walking a
trade show / food expo floor. Optimized for phones.

> **Status:** v1 implemented — see [`../index.html`](../index.html) and
> [`../README.md`](../README.md). This doc is the design of record.

## Concept

Instead of letters and numbers, every bingo square describes something you might
witness at a food show. When you see it happen, you tap the square. First player
to complete a line (or the whole card, depending on mode) wins.

**No server.** The whole app is a static site. There is no live connection
between players' phones — everything needed to play is carried in a share
link / QR code, and cards are generated on-device from a shared seed. See
[Architecture](#architecture).

## Players

- **2–8 players** per game, though nothing technically enforces the cap.
- One player is the **host**: they choose the settings and generate the game
  link / QR code.
- Everyone else **joins by opening the link** (tap it, or scan the QR) and
  entering a display name + emoji.
- No accounts, no lobby to wait in. Your name + emoji and current card state
  live in local storage, so a refresh keeps your place.
- "Host" is just a role for setup and for calling a round done — there's no
  live host authority once play starts.

## Cards

- **5×5 grid**, center square is a **FREE** space. 24 prompts per card.
- The game link carries a **seed** and the **active prompt pool**. Each
  player's card is a deterministic shuffle of that pool keyed by
  `seed + playerName`, so:
  - everyone draws from the same pool,
  - everyone's card is different,
  - the same name + same link always rebuilds the exact same card (refresh-safe,
    no sync needed).
- Card layout is fixed for the life of the game link.

## Gameplay

- Tap a square to mark it; tap again to unmark (misclicks happen).
- A marked square shows who marked it and when (for your own card only).
- **Win conditions** (host picks one when creating the game):
  - **Line** – any row, column, or diagonal. Fast, good for short visits.
  - **Corners** – all four corner squares. Quick warm-up round.
  - **Blackout** – the entire card. Long game, good for a full day.
- When a player believes they've won, they hit **BINGO!**. The app locks their
  card and shows a big "BINGO!" screen with the completed card laid out.
- **Winning is announced out loud and confirmed in person** — you show your
  phone to the group. There's no network broadcast; the group walking the floor
  together is the audience.
- Ties are whatever the group agrees on.
- To play again, the host generates a new link (new seed) and everyone reopens
  it. Names + emoji are remembered, so it's one tap back into a fresh card.

## Honesty / scoring

- This is a social game played in person; there's no proof you saw "someone
  asleep in their booth," and the app doesn't pretend otherwise. Calling each
  other out is the whole point.
- Optional **"witness" nicety**: long-press a square to add a one-line note
  ("Booth 214, blue polo"). Notes are local to your device and show on the
  BINGO! screen when you win.

## Prompt pool

Ship with ~40 prompts so cards feel varied. Host can toggle individual prompts
off before starting, or add custom ones (per-game, not saved).

### Starter prompts

The canonical list (exact wording, frozen order) lives in `BUILTIN` in
`index.html`. The list below is the same set, lightly abbreviated for the small
squares.

**People**
- Someone talks to you with food in their teeth
- Someone has a visible spill/stain on their shirt
- A vendor is asleep or nodding off in their booth
- Someone is on a phone call and ignoring a customer at their booth
- A rep mispronounces their own product name
- Someone wearing a full suit in a very casual hall
- A vendor eating their own product for lunch
- Two vendors from competing booths chatting like old friends
- Someone taking notes on a clipboard like it's 1995
- A buyer says "let me talk to my team" and clearly means no

**Samples & food**
- Too many samples broke someone's tote bag
- A sample table is completely empty / picked clean
- You're handed a sample you immediately regret
- A "new flavor" that is just the old flavor with a different label
- Someone double-dips
- A toothpick sculpture / garnish that's trying way too hard
- Free tote bag that's already falling apart
- A booth giving out full-size products, not samples
- Coffee sample that's gone cold
- Something served on a tiny spoon

**Booths & signage**
- A typo on a printed booth banner
- A booth with a spinning prize wheel
- A TV in a booth playing the same 20-second loop
- A QR code that doesn't scan
- Booth using the word "artisanal" unironically
- "As seen on Shark Tank" sign
- A booth that's just one folding table and a laptop
- Someone still setting up hours after opening
- A booth completely mobbed while the one next to it is empty
- Fake grass / Astroturf flooring in a booth

**Show-floor chaos**
- A pallet jack nearly runs someone over
- Someone pushing a hand truck stacked way too high
- A spill on the floor with no cone
- The one aisle everyone is bottlenecked in
- Someone loudly taking a work call in the middle of the aisle
- A lost-looking exhibitor asking where their booth is
- Registration line wrapped around the corner
- Someone carrying more branded swag than they can hold
- A dog (service or otherwise) on the show floor
- The fire-exit door propped open for a smoke break

## Screens

1. **Landing** – "New game" (host) or paste/open a link to join.
2. **Set up game** (host) – pick win condition, toggle prompts / add custom
   ones, then get a big QR code + share link + "copy link" button to pass
   around.
3. **Join** – shown when you open a game link: enter name + emoji, hit Play.
4. **Card** – 5×5 grid, tappable squares, BINGO! button, your name/emoji in a
   thin status bar. This is the main screen; the grid fits on a phone screen
   with no scrolling.
5. **BINGO!** – your completed card shown large with any witness notes; "show
   this to everyone" prompt. Button to go back to the card (if it was a
   misfire) — the group decides.
6. **Rematch** (host) – generates a new link; others just reopen the new link.

## Non-goals (v1)

- No server, no backend, no hosted realtime service.
- No live sync between phones — no shared lobby, no "someone got bingo"
  notification, no live player list.
- No persistent accounts, stats, or history across games.
- No real-time chat.
- No verification that a marked square really happened.

## Architecture

- **Static single-page app.** Plain HTML/CSS/JS or a small framework build,
  deployed to any static host (GitHub Pages, Netlify, Cloudflare Pages). No
  runtime cost, no ops.
- **All game config travels in the URL fragment** (`#...`, never sent to a
  server), e.g. `…/#v=1&s=FIG482&m=line`:
  - `v` – pool version. The built-in prompt list order is frozen per version
    (append-only) so the bitmask stays positional.
  - `s` – seed (random 6 chars, no ambiguous letters).
  - `m` – win condition (`line` / `corners` / `blackout`).
  - `p` – base64url bitmask of which built-in prompts are on. Omitted when all
    are on (the common case), keeping the link and QR short.
  - `c` – any custom prompts (URL-encoded, `~`-separated), capped at 8 so the
    QR stays scannable.
- **Card generation** is deterministic: seeded PRNG (e.g. a small
  xmur3 + mulberry32) fed `s + playerName` → shuffle of the pool → first 24 →
  grid with FREE center.
- **Per-device state** in `localStorage`: last name + emoji, and the marked
  squares + witness notes for the current seed (so refresh / backgrounding the
  tab doesn't lose progress). Keyed by seed.
- **Offline:** cache the app shell with a service worker so it keeps working
  once loaded — venue wifi is unreliable and the app doesn't need the network
  anyway after the link is open.
- Keep the bundle small for the same reason.

## Trade-offs of the no-server design

- **Lost:** automatic win broadcast, shared lobby/presence, any cross-phone
  "kill feed." All replaced by playing in person and talking to each other.
- **Fine because:** the game is already honor-system and played by a group
  walking a floor together. Live sync would be cosmetic.
- If live presence is ever wanted, the smallest add is a hosted realtime free
  tier (PartyKit / Supabase / Firebase / Ably) syncing only lobby + win
  events; card marking stays local. Not planned for v1.

## Settled during v1

- **Human-readable room code:** dropped. QR + "copy link" + native share sheet
  is enough.
- **Cross-device state:** not supported. Marks/notes are per-device; opening the
  same link elsewhere starts a fresh card. Accepted as an edge case.
- **Custom prompt cap:** 8 prompts, 48 chars each. A full 40-prompt QR with all
  8 customs still scans fine at the on-screen size.

## Possible v2

- Sound/vibration on BINGO.
- "Shake to shuffle" a fresh personal card before the game starts (host allows).
- A curated second prompt pack (e.g. tech expo, wine show) selectable at setup.
- Optional hosted-realtime presence (see trade-offs above) if groups want a live
  "someone got bingo" ping.
