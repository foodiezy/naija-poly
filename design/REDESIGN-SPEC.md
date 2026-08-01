# Odogwu Empire — Redesign Spec (v2, light)

Synthesized 2 Aug 2026 from a UX audit + two independent design passes.
Owner's brief: clean & modern light theme, full UX restructure, mobile-first
(360px Android, metered data), "friendly fintech polish". Light-only v1.

## Governing principle

**Text and photography leave the board; the board becomes a map. Everything
else is a sheet.** Warmth and Nigerian identity come from the sand base, zone
colors, Pidgin copy, tokens, and deed-sheet photography — not from dark glass
and gold.

## 1. Flows

### First-timer → playing < 30s
1. **Landing**: wordmark, "Buy Naija land. Bankrupt your friends.", ONE primary
   **Start a game**, text links "I have a code" / "How to play". No rules wall,
   no stats grid for first-timers, no onboarding modal. Name is prefilled with
   a generated Naija handle (editable, never blocks); token auto-preselected.
2. **Room lobby**: share card is the hero (code at 32px, full-width **Invite on
   WhatsApp**, Copy link secondary). Players list with dashed "Waiting…" empty
   slots. **Play with bots** secondary CTA (adds 2 bots + starts, one tap).
   Host settings collapse to one summary row ("₦1.5M · Classic · No timer");
   only Chaos Mode stays surfaced. Chat collapses to a row → sheet.
3. **First turn**: 3 coach marks anchored to real UI (Roll → your token →
   action bar), each dismissed by doing the thing. The 7-card HOW_TO_PLAY
   becomes an on-demand rules sheet in the menu.

### Invite-link clicker → in room < 15s
`?room=CODE` renders ONLY a join sheet — no landing, no hero, no rules.
"You've been invited to Room X" + avatars already in the room + prefilled name
+ one **Join game** button. Returning player: **"Join as Chidi"** one-tap.
**Never autofocus the name input** (Android keyboard pushes the CTA
off-screen). Room locked/full: sheet swaps content in place — "Game don start
already — start your own?" — never a toast + dead end. (Surfacing the lock
reason may need a tiny server change — ship as separate PR.)

### Returning host
"Welcome back, Chidi" + **Start a game** reusing last settings (persist last
RoomSettings to localStorage, apply after createRoom). Compact stats row.
"Rejoin last room" chip while a reconnection token is live.

## 2. Screen IA

### Landing (one layout, responsive gutters)
Single column: wordmark → value line → primary CTA → text links → 3-step icon
strip (Roll → Buy land → Collect rent) → footer. Zero images; inline-SVG adire
motif watermark. Kill the global app-header on landing.

### Room lobby
Mobile: sticky top bar → share card → players → token chip ("Change") →
collapsed Game options (host) → chat row → sticky bottom **Start game** /
"Waiting for host" pill. Desktop ≥900px: 2 columns (share+options | players+chat).

### In-game desktop (3 columns, max 1600px)
- Left: players (cash, net worth, zone chips) → game feed → chat dock.
- Center: board. Center holds ONLY dice, active-player line, round counter.
  Feed/trivia/wordmark leave the center. Mama Put pot + NEPA become status
  chips in the top bar.
- Right: wallet → action stack (Trade/Manage/Mortgage/Forfeit) → holdings by
  zone with set indicators.

### In-game mobile 360px — five fixed bands, NO page scroll
1. Top bar 56px: menu · room chip · **your cash** (large, tabular) · status
   chips (🍲 pot, ⚡ NEPA) · mute
2. Turn strip 44px: horizontal player rail (token+cash), auto-scrolls active
   player into view, coral ring
3. Board: square, `min(100vw - 16px, 100dvh - 268px)`, full-bleed. Center =
   dice + "Your turn"/"Ada is playing" only.
4. Context ticker 36px: "You're on **Ilorin** · ₦120k · Unowned" in zone color;
   latest feed line alternates; tap → history sheet
5. Action bar 72px + safe-area: `⋯` (actions sheet) · **one full-width
   contextual primary** (ROLL → BUY ₦180k → END TURN → WAITING…) · `💬` (chat
   sheet, unread dot). Primary action lives HERE (thumb reach), not board center.

### Modal system — one `<Sheet>` primitive
Bottom sheet <600px (drag handle, max-height 88svh, radius 20 top, pinned
footer, safe-area) / centered dialog ≥600px (max-w 420/560/720, radius 16).
- **L1 informational** (deed inspector, log, rules, holdings, chat, share):
  scrim-dismissible, swipe-down.
- **L2 decision** (buy deed, auction, chaos, debt rescue, incoming trade): NOT
  scrim-dismissible; countdown bar in header when server timer runs; **queue —
  only one L2 on screen, others wait with "1 waiting" chip**.
- **L3 terminal** (game over): full-screen takeover.
- **Auction + ChaosDecision are promoted from inline ControlPanel children to
  L2 sheets** — they're timed decisions currently below the fold on mobile.
- **Deed Card = one component, three densities**: hero (buy/inspector), card
  (holdings), row (trade builder, lists).

## 3. Design tokens (`:root[data-theme="light"]`)

Font: **Figtree Variable**, self-hosted woff2, latin subset incl. U+20A6 (₦),
weights 300–900, `font-display: swap`, ~28KB. Wordmark = inline SVG. Delete
both Google Fonts links + preconnects. Money: `tabular-nums`, weight 700.

```css
/* Base */
--bg-page:#FAF7F2; --bg-sunken:#F2EDE4; --surface:#FFFFFF;
--surface-hover:#F9FAFB; --surface-tint:#FFFBF5;
--border-subtle:#EAECF0; --border:#D0D5DD; --border-strong:#98A2B3;
/* Ink */
--text:#101828; --text-secondary:#475467; --text-muted:#667085;
--text-disabled:#98A2B3; --text-on-primary:#FFFFFF;
/* Brand */
--primary:#008751; --primary-600:#006F42; --primary-700:#005432;
--primary-50:#E6F4EE; --primary-100:#C0E3D3; --primary-ring:rgba(0,135,81,.24);
--accent:#FF6B4A;   /* fills only — NEVER text, never white body text on it */
--accent-600:#E85632; --accent-700:#C43F1E; --accent-50:#FFEDE8;
--gold:#D99A2B; --gold-50:#FDF4E3;  /* winner/host/Odogwu moments ONLY */
/* Semantic */
--success:#039855; --success-bg:#ECFDF3; --warning:#DC6803; --warning-bg:#FFFAEB;
--danger:#D92D20; --danger-bg:#FEF3F2; --info:#1570EF; --info-bg:#EFF8FF;
--money:#027A48;
/* Zones: -bar ≥3:1 on white, -tint wash, -ink ≥4.5:1 text. Alias the old
   --color-<group> names to -bar so GameBoard's var() lookups keep working. */
--zone-borno-bar:#8A5A2B;  --zone-borno-tint:#F4EBE1;  --zone-borno-ink:#6B4420;   /* BO */
--zone-kwara-bar:#0E86C4;  --zone-kwara-tint:#E3F1FA;  --zone-kwara-ink:#0A6A9B;   /* KW */
--zone-enugu-bar:#D6336C;  --zone-enugu-tint:#FCE8EF;  --zone-enugu-ink:#A82552;   /* EN */
--zone-kaduna-bar:#E8590C; --zone-kaduna-tint:#FDEEE2; --zone-kaduna-ink:#B34509;  /* KD */
--zone-edo-bar:#D92D20;    --zone-edo-tint:#FDE9E7;    --zone-edo-ink:#A81E14;     /* ED */
--zone-rivers-bar:#C08A00; --zone-rivers-tint:#FDF4D9; --zone-rivers-ink:#8A6300;  /* RV */
--zone-abuja-bar:#2B8A3E;  --zone-abuja-tint:#E8F5EB;  --zone-abuja-ink:#1F6B2E;   /* AB */
--zone-lagos-bar:#1D4ED8;  --zone-lagos-tint:#E7ECFB;  --zone-lagos-ink:#16389F;   /* LA */
/* Players — distinct hue set, never doubles as a zone role */
--p1:#E11D48; --p2:#7C3AED; --p3:#0891B2; --p4:#EA580C; --p5:#0F766E; --p6:#475569;
/* Space 4px base */
--s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:20px; --s-6:24px;
--s-8:32px; --s-10:40px; --s-12:48px; --s-16:64px;
/* Radii (replaces all-2px scale) */
--r-xs:4px; --r-sm:8px; --r-md:12px; --r-lg:16px; --r-xl:20px; --r-full:999px;
/* buttons md · cards lg · sheet-top xl · chips full · board tiles xs */
/* Shadows — warm, low alpha */
--sh-xs:0 1px 2px rgba(23,20,16,.05);
--sh-sm:0 1px 3px rgba(23,20,16,.10),0 1px 2px rgba(23,20,16,.06);
--sh-md:0 4px 8px -2px rgba(23,20,16,.10),0 2px 4px -2px rgba(23,20,16,.06);
--sh-lg:0 12px 16px -4px rgba(23,20,16,.08),0 4px 6px -2px rgba(23,20,16,.03);
--sh-xl:0 20px 24px -4px rgba(23,20,16,.08),0 8px 8px -4px rgba(23,20,16,.03);
--sh-sheet:0 -8px 24px -6px rgba(23,20,16,.12);
--sh-focus:0 0 0 4px var(--primary-ring);
/* Motion */
--d-fast:120ms; --d-base:180ms; --d-slow:240ms; --d-sheet:260ms;
--d-token-step:200ms;
--e-standard:cubic-bezier(.2,0,0,1); --e-enter:cubic-bezier(0,0,.2,1);
--e-exit:cubic-bezier(.4,0,1,1);
```

Type scale: display 32/36 w800 (mobile 26/30) · h1 24/30 · h2 20/26 · h3 17/24
· body-lg 16/24 · body 15/22 · sm 13/18 · caption 12/16 w600 · micro 11/14 w700
uppercase. **Root stays 16px at every breakpoint** (current 13px shrink at
480px is a legibility failure).

Hard rules: gold only for winner/host/Odogwu · `--primary` NEVER on board
surfaces (Abuja green is the only board green) · coral never a text color ·
elevation discipline: page → card+sh-sm → hover+sh-md → sheet+sh-xl, nothing else.

## 4. The board

Size-tiered by **computed tile size** via container query on `.monopoly-board`
(viewport media queries as fallback):
- **<36px** (phone): zone band (5px) + ownership tint + tokens. NO name, no
  price, no photo, no tooltip. Corners keep 9px uppercase labels + glyph.
- **36–52px**: + shortName 10px, 1 line ellipsis + 2-letter zone code on band.
- **>52px** (desktop): + price stripe 11px tabular + development row.

Tile: `--surface` face, 1px `--border-subtle`, `--r-xs`. Board frame
`--bg-sunken`, 8px inset, `--sh-md`. Center: `--surface-sunk` with 4% CSS
adire-pattern (repeating-gradient, ~0.5KB).

Ownership — three redundant channels: face tint 14% owner color
(`color-mix`), 3px inner-edge bar in owner color, owner token badge in a white
chip at outer corner. Mortgaged: 45° hatch + badge → 🔒. Buildings: 1–4 filled
squares in zone-ink on the band edge; hotel = gold bar.

Tokens: 16px circles (22px desktop), white ring, emoji at 11px; max 2 shown,
3+ → "+N" chip; YOU = persistent primary ring + halo; active = coral ring +
one 1.15 pulse. Keep framer-motion `layoutId` walking. Fallback if 11px emoji
proves illegible in mockup review: white initials.

Special tiles: 14px monochrome inline SVG glyphs in `--text-secondary`
(replace emoji, which render as colored mud at 14px on Android).

**Photos: off the board at every breakpoint.** Self-host the 19 unique images
as 480×280-ish WebP q72 (~15–25KB each) in `public/tiles/`, shown ONLY in deed
sheets (buy modal + inspector), `loading="lazy"`, `aspect-ratio` reserved,
zone-tint gradient fallback (existing onError pattern). Per-tile city images
kept — "every player sees home" is the moat. License audit + Credits sheet
required (CC-BY attribution). First paint = zero images.

DO NOT TOUCH: `getTileGridCoords`, `getTileEdge`, `getColorBarStyle`, layoutId
token system, `useGameRoom`, all Colyseus flows, `?room=` + replaceState
handling, engine. `src/client/preview.tsx` is the board regression harness.

## 5. Execution order (each step independently shippable)

0. **De-inlining sweep** — every `style={{}}` with a visual literal becomes a
   class; dynamic values pass as CSS custom properties. CI gate:
   `rg "style=\{\{[^}]*#[0-9a-fA-F]{3,6}" src/client` → zero. ~40% of total
   effort. Nothing visual ships before this is green.
1. Tokens + fonts (`tokens.css`, self-hosted Figtree, delete Google Fonts).
2. Landing + entry + join-sheet flows.
3. Room lobby.
4. `<Sheet>` primitive + modal migration (incl. Auction/Chaos promotion).
5. In-game shell (top bar, turn strip, action bar, rails).
6. Board.
7. Polish: coach marks, empty states, reduced-motion pass, contrast unit test
   (parse tokens, assert ratios), deuteranopia/protanopia simulation check.

Known small fixes to fold in: ToastContainer `theme="dark"` + 70px offset;
`--board-size` 100vh → dvh; late-join rejection dead end (separate server PR).

Budgets: ≤140KB JS gz · ≤25KB CSS · ≤40KB font · zero images on first paint.
Acceptance gate per screen: "does this read as Nigerian at 360px with images
blocked?"
