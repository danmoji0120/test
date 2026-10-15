import { it, expect } from "vitest";
import { packRoom, unpackRoom } from "../src/shared/snapshot";
import { createWorld, makePlayer } from "../src/game/simulation";
import { visibleWorld } from "../src/server/visibility";
it("streams changing public state without repeating terrain or leaking private actors; reconnect is self-contained", () => {
  const w = createWorld("stream", 7, [makePlayer("p", "P")]);
  const first = packRoom({ world: visibleWorld(w) });
  const full = JSON.stringify(first.room).length;
  const old = JSON.parse(JSON.stringify(first.room));
  w.map.sources[0].warning = 5;
  w.map.obstacles.find((o) => o.kind === "door")!.open = true;
  w.terrainRevision++;
  const next = packRoom({ world: visibleWorld(w) }, first.cursor);
  expect(next.room.world.map).toBeUndefined();
  expect(next.room.world.visibility).toBeUndefined();
  expect(JSON.stringify(next.room).length).toBeLessThan(full * 0.45);
  const rebuilt = unpackRoom(JSON.parse(JSON.stringify(next.room)), old);
  expect(rebuilt.world.map).toEqual(visibleWorld(w).map);
  expect(rebuilt.world.visibility).toEqual(w.visibility);
  expect(rebuilt.world.enemies.length).toBeLessThan(w.enemies.length);
  expect(rebuilt.world.reinforcements).toBeUndefined();
  expect(packRoom({ world: visibleWorld(w) }).room.world.map).toBeDefined();
  expect(
    packRoom(
      { world: createWorld("new", 42, [makePlayer("p", "P")]) },
      first.cursor,
    ).room.world.map,
  ).toBeDefined();
});
