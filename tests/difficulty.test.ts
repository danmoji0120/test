import { it, expect } from "vitest";
import { difficulty } from "../src/shared/difficulty";
import { createWorld, makePlayer } from "../src/game/simulation";
import { ENEMIES } from "../src/shared/data";

it("scales response, composition and pressure across ten levels without health inflation", () => {
  for (const team of [1, 2, 4]) {
    let previous = difficulty(1, team);
    for (let level = 1; level <= 10; level++) {
      const config = difficulty(level, team);
      expect(config.prepare).toBeLessThanOrEqual(previous.prepare);
      expect(config.reaction).toBeLessThanOrEqual(previous.reaction);
      expect(config.guardCount).toBeGreaterThanOrEqual(previous.guardCount);
      expect(config.activeCap).toBeGreaterThanOrEqual(previous.activeCap);
      const w = createWorld(
        `difficulty-${team}-${level}`,
        7,
        Array.from({ length: team }, (_, i) => makePlayer("p" + i, "Pilot")),
        level,
      );
      expect(w.enemies.length).toBeLessThanOrEqual(36);
      expect(w.enemies.length).toBeGreaterThan(0);
      for (const e of w.enemies) expect(e.hp).toBe(ENEMIES[e.kind].hp);
      previous = config;
    }
  }
  expect(difficulty(0).level).toBe(1);
  expect(difficulty(11).level).toBe(10);
});
