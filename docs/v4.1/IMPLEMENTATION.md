# V4.1 COMBAT SYSTEM REWORK — implementation ledger

Baseline V4: `54709a6403a00019d83e319dd008a99f9f456d3e`, clean main. Existing V4 art, map generation, authority, physical reinforcement, fog, saves and evidence are preserved. No hard reset/force push.

## PHASE 0

Existing build and 93 tests pass (41.76s). `baseline/combat.json` contains 252 controlled weapon/range/facing samples, 25 seeds per sample. V4 walker rear rocket:575 damage, remaining75, followed by3 AR shots (0.24s excluding flight); frontal rocket312.8. At200 range unguarded420HP generators fall to AR1.63s/SMG1.17s/SG2.43s. Single elite rifle30s controlled open-arena hit rates: stationary88.9%, repeating strafe12.3%, circular29.2%; solid cover0%. High-health measurement targets are explicitly fixtures, not mission-success proof. Blind difficulty10 solo ordinary-input cases Seed7/42/103 naturally fail18/38/40s. Baseline server stress and actual1/2/4browser evidence retained under `baseline/`.

## Implementation contract

- Exactly primary/secondary/consumable. AT occupies primary; P-01 fixed secondary. Server validates IDs/unlocks; v1 saves migrate to v2 without losing credits/unlocks/mods/results and without changing an old primary into AT. Legacy tactical field cannot grant extra attacks.
- Independent gun state; switching cancels unfinished reload (no ammunition granted), preserves ammo/cooldown/recoil. Switching prevents attacks; consumables require a fresh fire edge and reserve exactly one charge at completed preparation.
- One AP/AV formula and one normal/durable damage resolver. Real local hit geometry, exposed rear core/weapon components, main-HP contribution applied once. Explosions use impact position and do not duplicate direct/splash damage.
- Authoritative thrown grenades/smoke/medical and finite supply. Smoke is an occluder for both AI and shared team fog, not for bullets. No through-smoke current-position tracking.
- Aim controller learns positions/velocities only from confirmed visual observations, bounded heading speed, imperfect prediction/tracking, distinct heavy turret heading. Guard/suppress/flank/intercept/assault maintain real paths and dated observations.
- Objective shielding/core geometry creates useful approaches without kill gates, long interaction waits or tenfold HP. An actual attack alerts existing local guards, not magic new spawns.
- Repeat controlled comparisons, malicious network input, actual browser1/2/4, same-load performance. Explicitly separate fixtures, public-input autopilots, live browser gameplay and human evaluation.

## Current status

Implementation in progress. Phase results, limitations and final commit/push status will be updated after verification.

## Integrated equipment / armor / consumable / aim checkpoint

Server/client now use four primary choices, fixed P-01 secondary and one of four consumables. Flat equipped-gun HUD values mirror independent authoritative gun states; legacy G requests are ignored. Version1/2 profile restore, AT-primary exclusivity, stale/forged ammo rejection, independent magazines, reload cancellation and reconnect are covered by unit/live-WebSocket tests. New save format2 retains prior unlocks/mods/credits/metadata/settled history.

AP<AV=0/AP=AV=.65/AP>AV=1 is centralized. Every pellet and explosion routes through the same resolver. Exposed circles protrude from the hull; nearest contact prevents frontal rays reaching the rear through armor. Core/weapon component damage contributes to main HP once, independently of the component health clamp. Walker rear AT hit404.7/650=62.3% destroys drive; the burned core remains attackable but rifles need many more than three follow-up hits. Weapon destruction disables cannon/artillery; core damage slows heavy movement and reduces juggernaut bursts. Generator frontal AV3/shield and rear AV0 core have real contact geometry, no added HP gate. Ricochet attacks also alert existing local guards using facility coordinates, not invisible attacker coordinates.

Frag/antiarmor/smoke travel and stop on physical collision. Smoke blocks both teams' server LOS and shared fog, never bullets. Medical has1.2s preparation; button-edge latch prevents held-input repeat. Finite boxes replenish only owned primary/secondary reserves and one chosen consumable up to maxima; no extra rocket inventory. Sprint/interact/down/disconnect cancels preparation. Supplies retain original finite map state.

Aim controller uses only consecutive visually confirmed positions for velocity; no player input or unseen lookup. Bounded independent turret/body turn, imperfect lead, recoil/spread and actual world bullets remain. Assault/suppress/flank/intercept/guard choose physically reachable roles; guards stay near home facilities. Duplicate heavy aim updates were found and removed; turn bound has a regression test.

Build passes. Full checkpoint108 tests pass (45.62s), then37 focused tests pass including the final heavy turn bound. Actual lobby capture exposed a below-fold equipment selection; primary cards now form2×2 so three slots remain together. First live solo failures are preserved rather than called successes. Same-harness V4 reference is extracted from54709a6 outside the worktree; no destructive checkout. Controlled difficulty10 movement results before→after: three-enemy strafe14.0%→42.8% hit rate, circle28.1%→46.4%; single rapid reversals44.4%→33.3%; cover0→0. These are fixtures, not human balance approval; final measurements follow subsequent tuning.

## Physical objective clearance fix

A repeated Seed7 pilot run exposed a navigation mismatch: the new generator body blocked movement while the path/string-pull still cut through it. Facility clearance is now shared by real movement, A* and pilot corridor checks. Navigation accepts any valid adjacent goal approach instead of getting stuck on a free but isolated nearest cell (found atSeed20). Destroying a facility invalidates navigation. Actual static collision does not replace the device's separate bullet hit regions. All100 Seed reachability/heavy-route tests pass again; an additional100 Seed scan found0initial actors intersecting facility/terrain clearance. Mobility damage now also applies to far strategic and traveling reinforcement movement. Heavy ray checks have a conservative broad-phase cull.

54 focused map/game/component tests pass (29.27s). Actual production WebSocket UI exercise passed all four consumable selections, AT-primary/P-01 shooting, independent retained ammunition, held-click single consumption, real smoke cloud and full-HP medical rejection; it uses normal DOM input at insertion, no state mutation. Earlier1/2/4 browser deaths and pre-navigation matrix are retained as tuning history, not final acceptance.

## Balance / feedback checkpoint

Actual generated equipment PNGs are included with unmodified source atlas, cropped sprites and SHA256 provenance. Operators retain original body PNGs with equipped item overlays. Lobby and actual thrown objects use the generated items, not pretend rasterized vectors. Armor feedback distinguishes ricochet/partial/penetration/weakpoint/component break; zero-damage ricochets no longer create a flesh hurt flash. Short pistol transient differs from AR. Right-aiming a throwable previews the server-equivalent clamped landing/radius.

Enemy fire and cannon blast now respect generator cover without allowing enemy-friendly destruction of objectives. Blocked observers seek an actual lateral firing position instead of endlessly firing into a generator; paths are still collision-validated. Every site retains a dedicated guard, difficulty controls observation-based proficiency/dispersion/interception and guard leash, while infantry HP remains unchanged. Throwing smoke/grenades emits a small local noise; smoke does not make a rocket-launch gunshot. Saturated projectile budgets do not debit unused equipment.

A115-test run while several browsers and CPU experiments were active hit two wall-clock timeouts (100-Seed reachability/spawn) and a worker RPC timeout. All113 other assertions passed; logs are retained under `tuning/co-load-timeouts`. No assertion or Seed count is removed. Final isolated regression and performance measurement are scheduled after browser jobs finish. Intermediate actual solo difficulty1 success97.57s, four mixed-loadout difficulty3 failure96.83s, reconnect/redeploy and no page errors are recorded honestly. Simulated input pilots have completed missions with each of the four primaries; highest-difficulty failures are not replaced with manufactured victories.

## Isolated regression result

After stopping concurrent heavy browser/test jobs, unchanged assertions pass in the normal isolated command: `npm install`, build, **14 files /115 tests /50.05s**. Logs are in `final/`. The earlier co-load timeouts remain available; no timeout budget, assertion or Seed count was weakened.115 includes AP/AV36 combinations, slot/migration/security, physical components/functional effects, smoke/consumable latch/supply, impact-side explosion/no duplicate hit, generator friendly-cover and actual lateral firing position, plus all existing multiplayer/fog/source/path/reward regressions.
