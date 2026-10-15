import type {
  GameMap,
  Rect,
  Vec,
  Zone,
  ZoneKind,
  DispatchSource,
  Installation,
  Road,
} from "../shared/data";
import { rng, distance, blocked } from "./map";
/** Spaced seeded facilities + an MST road network with independent service loops, not a fixed route. */
export function region(seed: number): GameMap {
  const random = rng(seed),
    width = 5000,
    height = 3300;
  const obstacles: Rect[] = [
    { x: 0, y: 0, w: width, h: 40, kind: "wall" },
    { x: 0, y: height - 40, w: width, h: 40, kind: "wall" },
    { x: 0, y: 0, w: 40, h: height, kind: "wall" },
    { x: width - 40, y: 0, w: 40, h: height, kind: "wall" },
  ];
  const zones: Zone[] = [];
  const labels: Record<ZoneKind, string> = {
    yard: "야적장",
    warehouse: "화물 창고",
    corridor: "설비 통로",
    security: "보안 관제",
    reactor: "발전 시설",
    extraction: "외곽 집결",
  };
  // Independently jittered anchors, rejection for clearance; permutation changes semantic locations.
  const candidates: Vec[] = [];
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 4; x++)
      candidates.push({
        x: 550 + x * 1250 + Math.floor(random() * 200) - 100,
        y: 500 + y * 1100 + Math.floor(random() * 200) - 100,
      });
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (let id = 0; id < 12; id++) {
    const center = candidates[id],
      kind: ZoneKind =
        id < 2
          ? "reactor"
          : id === 2 || id === 5
            ? "security"
            : id === 3 || id === 4 || id === 8
              ? "yard"
              : id === 7
                ? "corridor"
                : "warehouse";
    const w = (kind === "corridor" ? 450 : 550) + Math.floor(random() * 3) * 50,
      h = (kind === "corridor" ? 700 : 450) + Math.floor(random() * 3) * 50;
    const z: Zone = {
      id,
      x: center.x - w / 2,
      y: center.y - h / 2,
      w,
      h,
      center,
      entry: { x: center.x, y: center.y + h / 2 + 70 },
      kind,
      label: labels[kind],
      variant: Math.floor(random() * 3),
      pads: [],
    };
    zones.push(z);
    const wall = (
      x: number,
      y: number,
      w: number,
      h: number,
      kind: Rect["kind"] = "wall",
    ) => obstacles.push({ x: z.x + x, y: z.y + y, w, h, kind });
    if (kind !== "yard") {
      // Four doors, offset inner walls: interior flanks and a clear cross to each objective.
      for (const [x, y, w, h] of [
        [0, 0, z.w / 2 - 90, 30],
        [z.w / 2 + 90, 0, z.w / 2 - 90, 30],
        [0, z.h - 30, z.w / 2 - 90, 30],
        [z.w / 2 + 90, z.h - 30, z.w / 2 - 90, 30],
        [0, 0, 30, z.h / 2 - 90],
        [0, z.h / 2 + 90, 30, z.h / 2 - 90],
        [z.w - 30, 0, 30, z.h / 2 - 90],
        [z.w - 30, z.h / 2 + 90, 30, z.h / 2 - 90],
      ])
        wall(x, y, w, h);
      if (z.variant === 0) {
        wall(85, 80, 75, Math.max(60, z.h / 2 - 180), "container");
        wall(z.w - 180, z.h / 2 + 100, 100, 80, "crate");
      } else if (z.variant === 1) {
        wall(75, 80, z.w / 2 - 180, 80, "container");
        wall(z.w / 2 + 100, z.h - 160, z.w / 2 - 180, 80, "container");
      } else {
        wall(70, 70, 90, 100, "wall");
        wall(z.w - 170, z.h - 170, 100, 100, "wall");
      }
    } else
      for (const [x, y, w, h] of [
        [75, 60, 100, 150],
        [z.w - 175, z.h - 190, 100, 130],
      ])
        wall(x, y, w, h, "container");
    z.pads = [
      { x: center.x - 80, y: center.y },
      { x: center.x + 80, y: center.y },
      { x: center.x, y: center.y - 80 },
      { x: center.x, y: center.y + 80 },
      z.entry,
    ].filter((p) => !blocked(p, obstacles, 24));
  }
  const edge = Math.floor(random() * 4),
    spawn: Vec =
      edge === 0
        ? { x: 150, y: 1100 }
        : edge === 1
          ? { x: width - 150, y: 2200 }
          : edge === 2
            ? { x: width / 2, y: 220 }
            : { x: width / 2, y: height - 220 };
  const extractions = [
    { x: 90, y: 450 },
    { x: width - 90, y: height - 450 },
    { x: width / 2, y: height - 220 },
  ].filter((p) => distance(p, spawn) > 500);
  if (extractions.length < 3) extractions.push({ x: width / 2, y: 220 });
  const nodes = [...zones.map((z) => z.entry), spawn, ...extractions];
  const roads: Road[] = [];
  const connect = (a: number, b: number) => {
    const p = nodes[a],
      q = nodes[b],
      horizontal = random() > 0.5;
    roads.push({
      id: "road-" + roads.length,
      from: a,
      to: b,
      width: random() > 0.5 ? 180 : 240,
      points: [
        { ...p },
        horizontal ? { x: q.x, y: p.y } : { x: p.x, y: q.y },
        { ...q },
      ],
    });
  };
  const joined = new Set([12]);
  while (joined.size < nodes.length) {
    let best: [number, number, number] = [0, 0, Infinity];
    for (const a of joined)
      for (let b = 0; b < nodes.length; b++)
        if (!joined.has(b) && distance(nodes[a], nodes[b]) < best[2])
          best = [a, b, distance(nodes[a], nodes[b])];
    connect(best[0], best[1]);
    joined.add(best[1]);
  }
  for (let n = 0; n < 6; n++) {
    const a = Math.floor(random() * 12),
      b = Math.floor(random() * 12);
    if (
      a !== b &&
      !roads.some(
        (r) => (r.from === a && r.to === b) || (r.from === b && r.to === a),
      )
    )
      connect(a, b);
  }
  // Outdoor belts have independent gaps and do not cross facility entrances or planned travel lanes.
  const reserved = (p: Vec, r = 130) =>
    nodes.some((v) => distance(p, v) < r) ||
    zones.some(
      (z) =>
        p.x > z.x - 70 &&
        p.x < z.x + z.w + 70 &&
        p.y > z.y - 70 &&
        p.y < z.y + z.h + 70,
    ) ||
    roads.some((road) =>
      road.points.slice(1).some((q, i) => {
        const a = road.points[i];
        return (
          p.x >= Math.min(a.x, q.x) - r &&
          p.x <= Math.max(a.x, q.x) + r &&
          p.y >= Math.min(a.y, q.y) - r &&
          p.y <= Math.max(a.y, q.y) + r
        );
      }),
    );
  const installations: Installation[] = zones.slice(0, 6).map((z, i) => ({
    id: "facility-" + i,
    kind:
      i < 2 ? "generator" : i === 2 ? "comms" : i < 5 ? "outpost" : "barracks",
    x: z.center.x,
    y: z.center.y,
    hp: i < 2 ? 420 : 260,
    maxHp: i < 2 ? 420 : 260,
    sourceId: i >= 3 ? "source-" + i : undefined,
    discovered: i < 2,
  }));
  const sources: DispatchSource[] = zones.slice(3, 6).map((z) => {
    const choices: Vec[] = [];
    for (const dx of [-1, 0, 1])
      for (const dy of [-1, 0, 1])
        if (dx || dy)
          choices.push({
            x: z.center.x + dx * (z.w / 2 + 230),
            y: z.center.y + dy * (z.h / 2 + 240),
          });
    for (let y = 200; y < height - 200; y += 150)
      for (let x = 200; x < width - 200; x += 150)
        if (distance(z.center, { x, y }) < 850) choices.push({ x, y });
    choices.sort((a, b) => distance(a, z.center) - distance(b, z.center));
    const pos = choices.find(
      (p) =>
        p.x > 160 &&
        p.x < width - 160 &&
        p.y > 170 &&
        p.y < height - 330 &&
        !zones.some(
          (o) =>
            p.x + 140 > o.x &&
            p.x - 140 < o.x + o.w &&
            p.y + 320 > o.y &&
            p.y - 150 < o.y + o.h,
        ) &&
        !nodes.some(
          (v) => Math.abs(p.x - v.x) < 150 && Math.abs(p.y - v.y) < 220,
        ) &&
        !obstacles.some(
          (o) =>
            p.x + 120 > o.x &&
            p.x - 120 < o.x + o.w &&
            p.y + 300 > o.y &&
            p.y - 130 < o.y + o.h,
        ),
    )!;
    if (!pos) throw Error("No staging footprint for " + seed + ":" + z.id);
    const entry = { ...z.entry };
    // A real occluded staging alcove, opening south onto its entry lane.
    obstacles.push(
      { x: pos.x - 100, y: pos.y - 110, w: 200, h: 30, kind: "wall" },
      { x: pos.x - 100, y: pos.y - 110, w: 30, h: 240, kind: "wall" },
      { x: pos.x + 70, y: pos.y - 110, w: 30, h: 240, kind: "wall" },
    );
    const doorId = "door-" + z.id;
    obstacles.push({
      id: doorId,
      x: pos.x - 70,
      y: pos.y + 100,
      w: 140,
      h: 25,
      kind: "door",
      open: true,
    });
    return {
      id: "source-" + z.id,
      kind: z.id === 5 ? "barracks" : "outpost",
      ...pos,
      entry: { x: pos.x, y: pos.y + 160 },
      doorId,
      route: [{ x: pos.x, y: pos.y + 160 }, entry],
      capacity: 6,
      stock: 6,
      supports: ["rifle", "rush", "heavy"],
      response: 2,
      prepare: 8,
      interval: 40,
      batch: 3,
      disabled: false,
      cooldown: 0,
      warning: 0,
      blocked: false,
      blockProgress: 0,
      facility: "facility-" + z.id,
    };
  });
  // Two physical border approaches. Openings are part of the map, not proximity spawns.
  for (const [i, y] of [950, 2300].entries()) {
    const right = (i + seed) % 2 === 0,
      x = right ? width : 0;
    const boundaryIndex = right ? 3 : 2;
    const original = obstacles[boundaryIndex];
    // Split boundary pieces around gates, including a second gate on the same side if needed.
    const segments = obstacles.filter(
      (o) =>
        o.kind === "wall" &&
        o.x === original.x &&
        o.w === 40 &&
        o.y <= y &&
        o.y + o.h >= y,
    );
    for (const o of segments) {
      const ix = obstacles.indexOf(o);
      obstacles.splice(
        ix,
        1,
        { ...o, h: y - 110 - o.y },
        { ...o, y: y + 110, h: o.y + o.h - y - 110 },
      );
    }
    obstacles.push({
      id: "border-" + i,
      x: right ? width - 40 : 0,
      y: y - 110,
      w: 40,
      h: 220,
      kind: "door",
      open: true,
    });
    sources.push({
      id: "external-" + i,
      kind: "external",
      x: x + (right ? 120 : -120),
      y,
      entry: { x: right ? width - 90 : 90, y },
      doorId: "border-" + i,
      route: [{ x: right ? width - 90 : 90, y }],
      capacity: 999,
      stock: 999,
      supports: ["rifle", "rush", "heavy"],
      response: 3,
      prepare: 14,
      interval: 55,
      batch: 3,
      disabled: false,
      cooldown: 0,
      warning: 0,
      blocked: false,
      blockProgress: 0,
      facility: "",
    });
  }
  for (let i = 0; i < 90; i++) {
    const p = {
      x: 150 + random() * (width - 300),
      y: 150 + random() * (height - 300),
    };
    if (
      reserved(p, 130) ||
      sources.some(
        (s) =>
          s.kind !== "external" &&
          Math.abs(p.x - s.x) < 180 &&
          p.y > s.y - 180 &&
          p.y < s.y + 380,
      ) ||
      sources.some((s) => distance(p, s.entry) < 200)
    )
      continue;
    obstacles.push({
      x: p.x - 40,
      y: p.y - 30,
      w: 60 + random() * 70,
      h: 60 + random() * 60,
      kind: i % 3 === 0 ? "crate" : i % 3 === 1 ? "wall" : "container",
    });
  }
  const patrols = roads
    .filter((r) => r.from < 12 && r.to < 12)
    .slice(0, 6)
    .map((r) => r.points);
  return {
    width,
    height,
    seed,
    obstacles,
    zones,
    route: zones.map((z) => z.id),
    roads,
    sources,
    installations,
    extractions,
    patrols,
    topology: roads.map((r) => r.from + "-" + r.to).join(","),
    spawn,
    core: { ...zones[0].center },
    extract: { ...extractions[0] },
    // Transitional V2 combat fixtures until objective migration in phase5.
    devices: [
      {
        x: zones[0].center.x - 75,
        y: zones[0].center.y - 65,
        hp: 240,
        maxHp: 240,
      },
      {
        x: zones[0].center.x + 75,
        y: zones[0].center.y + 65,
        hp: 240,
        maxHp: 240,
      },
    ],
    supplies: zones
      .filter((_, i) => i % 2 === 0)
      .map((z) => ({ ...z.entry, used: false })),
    intel: { ...zones[6].center },
  };
}
