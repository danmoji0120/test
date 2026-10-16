# V4.2 implementation ledger

Baseline: `51f7432d82aac4abb070a110656a2043101d66f3` (V4.1). The original checkout was clean. A separate Git archive preserves that source for same-environment comparison. Baseline build/119 tests and fresh production1/2/4-browser runs are recorded under `baseline/`. Existing V4.1 docs, screenshots, PNGs and profile format2 are retained.

## Implemented structure

| Module                                                  | Responsibility                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/missions.ts`                                    | Six mission definitions, prerequisites, ALL/ANY, explicit completion threshold, facility roles, effects, profile compatibility, generator42 |
| `game/mission-graph.ts`                                 | Validation, lock/failure propagation, idempotent completion, viable final condition                                                         |
| `game/world-plan.ts`                                    | Mission requirements and POIs before geometry generation                                                                                    |
| `game/map-generator.ts`, `facility-grammar.ts`          | Strategic sites, roads/loops, directional physical footprints, terrain and real source compounds                                            |
| `game/operation-world.ts`                               | Bounded deterministic retries, work/formation/path/heavy-entry/travel validation, all insertion choices                                     |
| `game/operational-objectives.ts`, `facility-defense.ts` | Physical cargo, launch/drill/upload/analysis/finite defense, regional strategic effects, actual facility damage                             |
| `game/navigation.ts`, `spatial.ts`                      | Heap A*, radius-specific lazy cells/edge cache,128path LRU,256unit geometry hash                                                            |
| `client/terrain-chunks.ts`, `terrain.ts`                | 1024unit bounded16chunk LRU, stateless world-coordinate texture and offscreen culling                                                       |
| `client/mission-art.ts`, `tactical-map.ts`, `main.ts`   | Hardware states, Korean mission HUD, brief/insertion, independent zoom/pan/tracking                                                         |
| `server/visibility.ts`, `shared/snapshot.ts`            | Remembered facilities, hidden coordinates/events, static initial map and explored RLE deltas                                                |

The legacy `complete` objective state is retained. Objective IDs, physical facility IDs and location IDs differ. Existing simulation calls/old create messages without operation options use a V4.1 BLACKOUT compatibility adapter. The production lobby always sends a V4.2 mission/profile/version/insertion choice.

## Preserved systems

Server30Hz/15Hz snapshots,1–4peers, room codes/ready/host migration/reconnect, PNG operators/enemies/equipment, weapon recoil/camera, legal three-slot loadouts, AP/AV/normal-durable/real component damage, consumables, bounded observation-driven aim, squads/cover, regional alert, physical continuous dispatch, Fog, transport extraction, rewards/idempotent settlement/save migration remain in their existing modules. No weapon roster or persistent account expansion was introduced.

## Decisions and limits

- Only11 mission/profile pairs are supported explicitly. Size changes facility/POI/terrain budgets and paths. Three shared safe insertion choices are host controlled; settings reset readiness. Seed folding includes mission/profile/difficulty/player count/version/attempt but excludes insertion, so insertion changes spawn rather than terrain.
- Every physical facility exists at deployment. Prerequisites unlock its work or expose its existing shield; no target spawns on completion. Operators can destroy crucial equipment with AT and make a mission fail. AV3 consoles resist incidental small-arms crossfire.
- Defense is finite75seconds with three physical response calls; nearby garrisons still act. Infantry uses actual rays/cover/acquisition against the1000HP target. No invisible timed damage or forced win/loss.
- Cargo follows the authoritative carrier, drops at actual coordinates on X/down/disconnect/leave, and restricts primary fire. Resume/recovery is a world operation, not an inventory teleport.
- Terrain surfaces are bounded64MiB logical memory. Low-resolution Fog remains a whole-world mask (up to about16.4MiB), not a full-resolution terrain canvas. Runtime final paths still use improved detailed A*, not a complete hierarchical navigation engine. Dynamic actor arrays retain some bounded linear scans.
- Static geometry is intentionally sent once, as in V4.1. Exact hidden facilities/POIs/enemy state are filtered. This is gameplay information filtering, not cryptographic secrecy of a deterministic map Seed.
- Automatic pilots know all public static collision geometry and aim algorithmically. Input-only pilots, production DOM/WebSocket browsers, controlled rule/performance fixtures and human playtesting are separate evidence classes.

## Corrections found during verification

Initial generation campaign found two exact heavy approach clearances missed by coarse reachability. Exact endpoint checks and deterministic retry now cover them. A later full replay found compact defense Seed49/count1 had legal source space between100unit placement samples; a50unit fallback now preserves every source clearance rule instead of deleting terrain. Regression Seeds27/49/59 are retained.

Actual transfer browser QA found a pilot preferring locked cargo; navigation now chooses available prerequisites. Carrier reload migrated room leadership and exposed a QA helper assuming page0 remained host; it now chooses the real host. An extraction pilot incorrectly kept a virtual work objective and held E instead of returning fire; the adapter now omits that objective after extraction request. These are recorded histories, not fabricated gameplay passes. Final results are in [QA_RESULTS](QA_RESULTS.md).

See [mission rules](MISSION_SYSTEM.md), [world generation](WORLD_GENERATION.md), [navigation](NAVIGATION.md) and [measured performance](PERFORMANCE.md). No human fun, sound quality, Windows GPU performance or cross-device WAN success is inferred from automated completion.
