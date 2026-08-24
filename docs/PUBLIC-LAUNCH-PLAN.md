# Odogwu Empire Public Launch Plan

**Created:** 24 August 2026  
**Launch model:** Free-to-play public beta before accounts, payments, or subscriptions  
**Target timeline:** Three to four weeks for a solo developer

Odogwu Empire is already publicly reachable, but a public launch means making the
service reliable, safe, measurable, and supportable before actively inviting traffic.

The launch sequence is:

> Finish the release -> move to reliable hosting -> make games recoverable -> add
> telemetry and safety -> run a closed beta -> launch publicly.

## Phase 1 - Finish the current release

**Target:** 2-3 days

- [x] Complete the mobile trade, chat, and debt-rescue interaction work.
- [x] Add focused tests for incoming trades, counter-offers, and debt-rescue visibility.
- [x] Add the real-server bot smoke test to the automated release checks.
- [x] Fix formatting in touched files and make formatting a CI gate.
- [x] Ensure tests, typecheck, production build, design-token checks, formatting, and
      the bot playthrough all pass.
- [x] Update README, roadmap, and documented test counts.
- [x] Merge the release into `main` and tag it `v0.1.0-beta`.

Do not begin another major game feature until this phase is complete.

## Phase 2 - Use production-grade hosting

**Target:** 1 day

- [ ] Move the game server from a sleeping free instance to an always-on service.
- [ ] Keep one server instance initially while rooms are held in memory.
- [ ] Provision a paid Postgres database for durable data.
- [ ] Create a separate staging deployment.
- [ ] Configure `NODE_ENV=production` and exact `ALLOWED_ORIGINS` values.
- [x] Keep `/health` as the deployment health check.
- [ ] Allow production deployment only after CI passes.
- [ ] Purchase and connect a short product domain.
- [ ] Verify HTTPS, WebSockets, room creation, invite links, and rollback.

Render's free service is suitable for previews, not production: it sleeps after idle
periods and uses ephemeral local storage. The public beta should not be promoted until
the cold-start delay is removed.

## Phase 3 - Make unfinished games recoverable

**Target:** 3-5 days

- [ ] Save a room snapshot after every completed turn.
- [ ] Store the room code, players, authoritative game state, and expiry time.
- [ ] Restore unfinished rooms after a restart or deployment.
- [ ] Give players a clear resume link and restart message.
- [ ] Expire abandoned snapshots after an agreed retention period.
- [ ] Test restoration during auctions, trades, debt, and Chaos decisions.
- [ ] Test database backup restoration.

Until recovery works, avoid deploying while public games are active.

## Phase 4 - Add launch telemetry and alerting

**Target:** 2-3 days

Track a small, privacy-conscious funnel:

- [ ] `room_created`
- [ ] `invite_copied`
- [ ] `join_attempted`
- [ ] `join_failed` with a safe reason code
- [ ] `game_started`
- [ ] `game_finished`
- [ ] `player_disconnected`
- [ ] `game_resumed`
- [ ] Game duration and turn count

Operational work:

- [ ] Add client and server error reporting with alerts.
- [ ] Add an external uptime check for `/health`.
- [ ] Document where logs, errors, and launch metrics are reviewed.
- [ ] Avoid recording chat content or unnecessary personal data in analytics.

Initial release targets:

- More than 95% of valid join attempts succeed.
- More than 99% of sessions are crash-free.
- No games are lost during a normal deployment.
- Warm page loads and room creation respond within a few seconds.
- Every production exception produces an actionable alert.

## Phase 5 - Add public safety controls

**Target:** 3-5 days

- [ ] Filter player names as well as chat.
- [ ] Add mute and report controls.
- [ ] Allow a host to revoke an invite code.
- [ ] Add per-IP room-creation limits.
- [ ] Store reports with room, message, and timestamp evidence.
- [ ] Publish concise community guidelines.
- [ ] Add a monitored support address.
- [ ] Complete a controlled Colyseus dependency upgrade.
- [ ] Triage and document any temporarily accepted dependency findings.

## Phase 6 - Prepare privacy and legal pages

Before the closed beta, publish:

- [ ] Privacy Notice
- [ ] Terms of Use
- [ ] Community Guidelines
- [ ] Data access and deletion contact process
- [ ] Analytics purpose and retention periods
- [ ] Copyright and asset attribution

Additional checks:

- [ ] Obtain appropriate guidance if children are an intended audience.
- [ ] Review the game's trade dress and branding before monetisation.
- [ ] Verify licences for every visual, sound, and font.
- [ ] Choose and add a repository licence.

## Phase 7 - Run a closed beta

**Target:** 7 days, approximately 50-100 invited players

Test on:

- [ ] 360px Android phones and low-end devices.
- [ ] Slow mobile connections.
- [ ] Current Chrome, Safari, and Firefox.
- [ ] Two-to-six-player human games.
- [ ] Mixed human and bot games.
- [ ] Disconnect and reconnect scenarios.
- [ ] Long games and simultaneous actions.
- [ ] Recovery of a saved game after a deployment.

Ask beta players:

1. Was joining easy?
2. Did you understand what to do next?
3. Where did you become confused?
4. Did you finish the game?
5. Would you invite friends to play again?

Fix the three most common or damaging problems before public promotion.

## Phase 8 - Public launch

1. Freeze feature development for 48 hours.
2. Deploy the release candidate to staging.
3. Run the complete multiplayer release checks.
4. Verify a usable database backup.
5. Deploy production.
6. Verify the domain, HTTPS, room creation, invite joining, recovery, and analytics.
7. Announce through WhatsApp, Nigerian gaming communities, universities, and diaspora
   communities.
8. Monitor errors, failed joins, reports, and server load daily for the first week.
9. Keep a tested rollback available.

## Features that should not block the beta

- Mandatory Google accounts
- Payments or subscriptions
- Leaderboards
- New boards or more Chaos cards
- Advanced matchmaking
- A complete engine refactor
- Native mobile applications

These can be prioritised using evidence from the beta rather than assumptions.

## Go/no-go checklist

Launch publicly only when all of the following are true:

- [ ] `main` is clean and CI is green.
- [ ] The service is always-on and has a custom HTTPS domain.
- [ ] Players can resume a game after a server restart.
- [ ] Production errors and funnel events are visible.
- [ ] Name/chat abuse, mute, and reporting have a clear path.
- [ ] Privacy, terms, community, and support pages are published.
- [ ] The closed beta has no unresolved launch-blocking issue.
- [ ] A rollback and data restoration have been tested.
