# Redesigning Odogwu Empire

A game that worked and looked wrong. This is what changed, why, and the two
lessons that cost the most to learn.

---

## The problem

The game was feature-complete — pure engine, authoritative server, 198 tests —
and the UI was actively working against it.

It was a **three-column desktop grid** that collapsed into one long scrolling
page on a phone. The consequences were not cosmetic:

- The **Roll / Buy / End Turn** buttons lived in a sidebar that dropped below
  the board under 980px. On a phone, a turn timer counted down while the button
  you needed was off screen.
- **Auctions and chaos decisions** — both server-timed — rendered inside that
  same sidebar. You could lose an auction without ever seeing it.
- The board fetched **22 photographs from Wikimedia** to render cities as
  30px-wide brown smudges.
- Every surface was hand-coloured. ~200 hardcoded `rgba()` and hex values across
  a 4,900-line stylesheet, with no way to change the theme in one place.

Target user: a 360px Android phone on metered data. The design was built for a
1440px monitor.

---

## The approach

Spec and mockups first (`design/REDESIGN-SPEC.md`, `design/mockups-v2.html`),
approved before any code. Then seven steps, each its own commit, each shippable:

| Step | What                                         |
| ---- | -------------------------------------------- |
| B1   | Design tokens + self-hosted variable font    |
| B2   | Landing + invite-link join                   |
| B3   | Room lobby                                   |
| B4   | One `<Sheet>` primitive + the decision queue |
| B5   | In-game shell — five fixed bands on mobile   |
| B6   | The board itself                             |
| B7   | Rails, inspector, trade builder, modals      |

**The shell** is the core idea. Mobile is five fixed bands — top bar, turn strip,
board, context ticker, action bar — and the page never scrolls. The board is the
only elastic band. The one action that matters is always a full-width button
under your thumb, and _which_ action it is comes from a pure function
(`lib/primaryAction.ts`) that is unit-tested without a DOM or a socket.

**The board became a map.** At 29px a tile cannot hold a name and a price; it
holds a zone band, an ownership tint and the owner's token. The ticker names the
tile you're standing on. The photographs left entirely — the deed sheet carries
the detail, and the app now makes **zero third-party requests**.

---

## Two lessons

### 1. Tests and typecheck are blind to this entire class of bug

Every single real bug in this redesign passed `tsc --noEmit`, 198 vitest tests
and a production build while it was live:

- A bare `1fr` grid track is `minmax(auto, 1fr)`, so a long tile name pushed its
  row past its share and **clipped the bottom two rows of the board off a
  phone**. Desktop never showed it — the board was big enough to absorb it.
- A top-level `AnimatePresence mode="wait"` could finish its exit without
  unmounting, leaving the app **blank** after joining a room.
- The deed inspector was `rgba(15,23,42,0.97)` with ink-coloured text on it —
  unreadable. A colour sweep had matched `rgba(255,…)` and `rgba(0,0,0,…)`;
  slate values passed straight through.
- A pending trade offer outlives the final turn, so an **"Incoming deal" sheet
  rendered on top of the GAME OVER screen**, offering to accept a deal in a
  finished game.

Not one of these is expressible as a unit test on a pure reducer. They were all
found by opening a browser and looking.

### 2. Your tools lie too

The dark trade-builder card survived a contrast audit because the auditor only
inspected `background-color` and never `background-image`. The card was a
gradient. Fixing the _auditor_ found the bug in seconds — and the same class of
miss had already produced the `rgba(15,23,42,…)` escape above.

The general version: when an automated check says clean, ask what it cannot see.

---

## What holds it together now

The theme lives in `tokens.css` and nowhere else, enforced by a CI gate that
fails the build on a literal colour in a component. On its **first run** it
caught two survivors of the manual sweep — which is the argument for the gate in
one line.

That also means the light theme is not load-bearing. Going dark later is mostly
token values, not another teardown.

## Still open

Honest list, kept current in the repo's `ROADMAP.md`:

- `ChaosStandingPanel` has never been rendered in a browser — it needs a
  specific board event that the dev tooling can only make _likely_, not certain.
  The fix is repairing the design preview harness, which itself rotted during
  the redesign.
- The desktop board centre is emptier than it needs to be.
- No error tracking or analytics beyond server logs.
