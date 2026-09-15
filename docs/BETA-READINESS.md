# First playable beta: readiness review

Reviewed 11 September 2026 against commit `440a3cf` (beta feedback and pacing).
The working tree was clean at the start of this review; no existing work was
reverted or overwritten.

The core game is implemented and passes the automated checks below. It is ready
for structured playtesting, but has not yet passed the human playability gate.
Use [PLAYABILITY-CHECKLIST.md](PLAYABILITY-CHECKLIST.md) as the sign-off record.
The broader [public launch plan](PUBLIC-LAUNCH-PLAN.md) remains separate from this
first playable beta; paid infrastructure is still deferred pending owner sign-off.

## Evidence from this review

| Check                                                      | Result                                                                                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository formatting, TypeScript, and colour-token checks | Passed                                                                                                                                             |
| Unit and engine tests                                      | 229 passed across 18 files                                                                                                                         |
| Full deterministic two-player game                         | Reached bankruptcy and a winner in 384 actions                                                                                                     |
| Production client build                                    | Passed                                                                                                                                             |
| Existing local server health                               | Reported healthy                                                                                                                                   |
| Real-server bot smoke test                                 | Bot joined, took a turn, and returned control                                                                                                      |
| Three-client integration check                             | 11 passed: joining, private/general chat, game start, bid validation, timed auction resolution and ownership                                       |
| Simulated phone pass (13 September 2026)                   | Two turns each at 360px and 390px with no horizontal overflow; buy, auction, chat, trade, property management, stacked tokens and reload exercised |

The initial test attempt was blocked by Windows directory access; tests and build
passed when rerun with the required access. Live checks used the server already
listening on port 2567; its source revision was not independently verified. No
existing server was stopped. These checks do not establish production deployment
status or browser usability.

One small correction from the review: the server restart notice now says the game
will end and asks players to create a new room afterward. Previously it promised
the game would return, despite restart recovery still being unimplemented. The
changed file passed formatting; the notice has not been tested through a live
restart.

The phone pass found and fixed two mobile blockers: the game header clipped the
room code, and opening a holding from the Actions sheet placed its deed behind
that sheet. The phone header now gives the complete invite code priority, and a
holding opens its deed after closing Actions. Debt rescue and a second human
client still need direct device testing before the remaining mobile and
reconnection checks can be signed off.

## Remaining work, in order

1. **Exercise the latest build in browsers.** At 360px and 390px, create a room,
   join by invitation, and complete two turns. Confirm no horizontal page scroll,
   readable cash/turn/position, and reachable controls in chat, deeds, trading,
   auctions, debt rescue, and results. Repeat in Chrome, Firefox, and Safari;
   include a real low-end Android device and a slow connection. Record browser,
   viewport, steps, expected result, and actual result for every failure.
2. **Verify connection recovery.** Disconnect host and guest separately, then
   reconnect within the 60-second grace period and reload an active game. Verify
   the same player, assets, pending decision, and usable next action return.
   Repeat during an auction and a trade. Let grace expire and verify the client
   offers a usable exit instead of a frozen board. Check the free demo's cold
   start loading state. Server restart recovery is a separate unimplemented
   feature, not covered by reconnection grace.
3. **Complete the human rules matrix.** Buy and decline; bid with multiple humans;
   collect rent; form a group; build/sell/mortgage/unmortgage; accept/reject/counter
   trades; recover from debt or go bankrupt; exercise all supported jail exits.
   Test a mixed human/bot game and Chaos decisions. Finish at a winner, return to
   the lobby, and start a rematch with the same group.
4. **Run the first-time-player gate.** Three people unfamiliar with the project
   must complete their first two turns without verbal instruction. Run three
   complete human games, recording confusion and completion time. Fix every
   blocking issue and the three most common usability problems, then retest the
   affected flows and obtain the owner's sign-off.

Do not mark unchecked human or device tests as passed based on engine tests.
No new major game feature is needed to begin this playtest cycle.

## After playable-beta sign-off

Before broader public promotion, return to the public launch plan for durable
game recovery, hosting reliability, telemetry and alerts, moderation/support,
privacy pages, dependency review, and rollback verification. Accounts, payments,
leaderboards, new boards, and an engine refactor should not delay the first
playable beta.
