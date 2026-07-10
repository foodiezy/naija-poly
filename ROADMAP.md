# Odogwu Empire — Roadmap

Source: senior review, July 2026. The game core is strong; the service layer around it
(identity, data, resilience, safety) is what stands between "prototype" and "product".
Phases are ordered by dependency and ROI. Each phase has a definition of done.

---

## Phase 0 — Stop flying blind (days, do first)

Goal: every future decision is made with data and guarded by CI.

- [ ] Error tracking: Sentry (free tier) in client + server. DoD: a thrown error in prod
      appears in a dashboard with stack trace within 1 minute.
- [ ] Analytics funnel: lightweight event capture (PostHog free tier or a tiny
      `/api/event` endpoint logging to console→Render logs at minimum). Events:
      `room_created`, `invite_copied`, `join_attempted`, `join_failed(reason)`,
      `game_started(humans, bots)`, `game_finished(turns, duration, completion)`,
      `player_left_midgame`. DoD: a week of funnel data answering "what % of created
      rooms ever see a second human".
- [ ] CI: GitHub Actions — typecheck + vitest on every push/PR. DoD: red X on GitHub
      when tests fail; local pre-push hook becomes a convenience, not the only gate.
- [ ] Pin Node: `engines` in package.json + `.node-version` (Render reads it).
- [ ] `npm audit` triage: fix the critical + high; document accepted moderates.
- [ ] Infra config truth: render.yaml is not connected to the running service (it was
      dashboard-created). Either recreate the service from the blueprint or delete
      render.yaml and document dashboard settings in DEPLOY.md. One source of truth.
- [ ] Real health check: `/health` should verify the Colyseus matchmaker responds,
      not return a static string.

## Phase 1 — Identity & persistence (1–2 weeks)

Goal: players exist; things accumulate; retention becomes possible.

- [ ] Postgres (Render/Neon free tier) + a thin data layer.
- [ ] Auth: Google one-tap first (lowest friction), phone OTP later (Naija market
      standard). Guest play stays — never force login to play.
- [ ] Persistent profile: display name, avatar/token preference, created_at.
- [ ] Match history: store game summaries (players, winner, duration, turns) at
      game end. DoD: a returning player sees their last 10 games and win rate.
- [ ] Stats surface in UI: wins, games, biggest rent collected (data already tracked
      in engine `stats`).

## Phase 2 — Deploy resilience (1 week, needs Phase 0 telemetry to verify)

Goal: pushing to main stops destroying live games.

- [ ] Graceful shutdown: SIGTERM handler → broadcast "server dey restart" notice →
      block new rooms → allow N minutes drain (Render gives a grace window).
- [ ] Room state snapshot: serialize engine GameState (it is already a pure JSON-able
      object) to Redis/Postgres on every turn end; on boot, offer "resume game" via
      room re-creation with the snapshot. Engine purity makes this cheap — exploit it.
- [ ] Client UX: distinguish "server restarting, game will resume" from "room dead".
- [ ] Decide single-instance pinning in the dashboard (render.yaml is decorative).

## Phase 3 — Trust & safety (3–5 days, before any growth push)

- [ ] Name + chat profanity filter (wordlist incl. Pidgin/Yoruba/Hausa/Igbo slurs).
- [ ] Mute (client-side) + report (server log + flag) + host can revoke invite (new
      room code).
- [ ] Review rate limits with real telemetry; add per-IP room-creation caps.

## Phase 4 — Mobile & data-light performance (1–2 weeks)

Nigeria is Android-first and data-metered. This phase IS the product for the market.

- [ ] Self-host the 22 board photos: license audit → compress to WebP (<30KB each) →
      serve from /public behind Render CDN. Kill all hotlinks (tileImages.ts).
- [ ] Self-host + subset fonts (Nunito, Yanone Kaffeesatz); drop Google Fonts dep.
- [ ] Bundle diet: audit 181KB main chunk; lazy-load modals/overlays.
- [ ] PWA: manifest + service worker shell so revisits cost ~zero data.
- [ ] Touch/responsive pass on real low-end Android (360px, 3G throttled).
- [ ] Measure: total data cost of "open app → finish one game" — target < 2MB first
      visit, < 200KB return visit.

## Phase 5 — Engineering debt (continuous, one item per week alongside features)

- [ ] Split engine.ts (1,624 lines) into modules: movement, rent, building, auction,
      trade, debt, cards. Pure re-export from engine.ts; tests unchanged.
- [ ] Server test harness: @colyseus/testing; cover join/lock, timers, disconnect
      during auction, trade-accept vs bankruptcy races.
- [ ] CSS: extract design tokens (spacing/color/radius) — the palette swap proved the
      cost of smeared styling; consolidate repeated inline gradients into classes.
- [ ] Colyseus upgrade path: align server/client versions, delete patchClientForV017.
- [ ] Compile server for prod (esbuild) instead of tsx runtime interpretation.

## Phase 6 — Game design (telemetry-driven, after Phase 0 data lands)

- [ ] Measure completion rate + median duration first. Then:
- [ ] Short format: "Quick Empire" 15–20 min mode (higher starting cash, turn limit
      default, faster build rules).
- [ ] Anti-runaway: catch-up mechanics (e.g., "Hustle bonus" for trailing players).
- [ ] Dead-time fixes: between-turn micro-engagement (bet on the roll, emotes).
- [ ] Eliminated-player retention: spectate + side-bets, or fast rematch queue.
- [ ] One deeply Nigerian mechanic per cycle (see differentiation) — chaos economy
      events: fuel scarcity, naira/dollar swing, EFCC probe, Owambe levy.

## Legal checkpoint — before any revenue

- [ ] Trade-dress distance review vs Monopoly (board layout, corner squares, card
      structure — mechanics are safe, expression is not).
- [ ] Image licenses for all board photos.

---

# Differentiation — what we can offer that most others can't

1. **Cultural fluency as mechanics, not paint.** Anyone can rename Boardwalk to Ikoyi.
   Nobody at Hasbro can design an event economy that *feels* like Nigeria — NEPA
   blackouts (shipped), fuel scarcity, dollar-rate swings, EFCC probes, Owambe
   spraying, danfo routes. Satirical, living, updated with the news cycle. This is
   the moat: it requires being Nigerian to build and it makes the game funnier and
   mechanically fresher than the original.
2. **Pan-Nigerian by design.** Eight zones from Borno to Lagos — every player sees
   home. Local Monopoly editions are Lagos-centric, physical, and static. We are the
   only *online, evolving, all-of-Nigeria* board.
3. **Built for African networks.** Authoritative-server multiplayer that works on a
   ₦20k Android over 3G with a tiny data budget (Phase 4). Western multiplayer games
   fail this test; local competitors lack the engineering. "It just works on my
   phone with small data" is a marketing sentence no one else in this niche can say.
4. **The diaspora bridge.** Invite links are already WhatsApp-native (?room=CODE).
   Position game night as family time across continents: London/Houston kids playing
   grandpa in Enugu. Add timezone-friendly async or scheduled lobbies later. Emotional
   hook no generic Monopoly clone has.
5. **Data-driven board = a platform.** `src/data/board.ts` means new editions are data,
   not code: Ghana, Kenya, "University of Lagos campus edition", corporate custom
   boards. Retheme-as-content pipeline → seasonal boards (Detty December, Independence
   Day) and eventually creator/community boards.
6. **Local rails.** Paystack/Flutterwave payments, airtime-friendly pricing, Pidgin →
   Yoruba/Hausa/Igbo language packs. Global studios won't prioritize this; we start
   there.

Recommended sequencing: 0 → 1 → 2 → 3 in strict order; 4 and 5 interleave; 6 starts
as soon as Phase 0 data exists. Revisit this file monthly and check items off.
