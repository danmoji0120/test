# V4.2 implementation ledger

Baseline: 51f7432d82aac4abb070a110656a2043101d66f3. Original working tree clean; no AGENTS.md. Runtime network policy inspected; existing Node24/Chromium/2CPU software-rendering environment reused. V4.1 source was archived separately at /workspace/doll-squad-v42-reference without changing the checkout. Baseline build and119 tests pass (53.96s); fresh production1/2/4 browser runs are recorded under baseline/.

## Technical decisions

- Mission definitions precede spatial planning. Stable objective IDs differ from facility IDs; a node binds an already-present installation. Six production mission IDs are separate from the existing reward contract.
- Existing `complete` objective status is retained for snapshot/save compatibility; `locked`, prerequisites and explicit N-of-M completion are added. Legacy simulation callers without operation options retain the V4.1 BLACKOUT fixture for regression, while production selects a V4.2 operation.
- Profile compatibility is explicit: defense compact; blitz standard; launch/transfer large or expanded; reactor standard/large/expanded; survey large/expanded. Excluded combinations would erase each archetype's intended density or distributed prerequisites.
- Independent equipment/AP/AV/parts, real physical dispatch, fog filtering and profile format2 are reused. No weapon expansion or account system.
- Terrain uses bounded1024px LRU chunks with world-coordinate procedural sampling. Obstacle spatial indexing, heap-based A*, lazy collision cells and bounded path caches replace global full-grid work.
- Cargo is a server world object. Carrier restrictions, down/disconnect/drop preserve actual coordinates. Work stages and finite physical defense calls replace long repeated E holds.
- Static terrain is sent once. Explored-cell deltas and public mission updates are streamed; hidden facilities and exact unknown objective/POI coordinates are filtered.

## Phase1

Six data definitions and pure graph validation implemented. Five new unit tests pass: ALL order interchange, ANY/failed branch, serial lock, threshold, idempotent completion, malformed/cyclic graphs and incompatible profiles/deployments. TypeScript passes. Production integration and world generation follow; this checkpoint alone is not a playable V4.2 release.
