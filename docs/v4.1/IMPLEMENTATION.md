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
