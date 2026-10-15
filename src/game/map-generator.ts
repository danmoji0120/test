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
import { elevation } from "./terrain";
export function segmentDistance(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return distance(p, { x: a.x + dx * t, y: a.y + dy * t });
}
/** Continuous seeded strategic sites inside a natural battlefield, with reserved navigable road loops. */
export function region(seed: number): GameMap {
  const random = rng(seed),
    width = 6400,
    height = 4200,
    count = 6 + (seed % 2),
    obstacles: Rect[] = [],
    zones: Zone[] = [],
    roads: Road[] = [];
  const centres: Vec[] = [];
  for (let i = 0; i < count; i++) {
    let best: Vec = { x: 0, y: 0 },
      score = -1;
    for (let n = 0; n < 180; n++) {
      const p = {
          x: 650 + random() * (width - 1300),
          y: 650 + random() * (height - 1300),
        },
        d = centres.length
          ? Math.min(...centres.map((q) => distance(p, q)))
          : 1;
      if (d > score) {
        best = p;
        score = d;
      }
    }
    centres.push(best);
  }
  // Semantics are independently permuted; no row/column facility anchors.
  for (let i = centres.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [centres[i], centres[j]] = [centres[j], centres[i]];
  }
  for (let id = 0; id < count; id++) {
    const center = centres[id],
      kind: ZoneKind =
        id < 2
          ? "reactor"
          : id === 2 || id === 5
            ? "security"
            : id === 3
              ? "yard"
              : "warehouse";
    const w = 420 + Math.floor(random() * 4) * 50,
      h = 360 + Math.floor(random() * 4) * 50,
      variant = Math.floor(random() * 4);
    const z: Zone = {
      id,
      x: center.x - w / 2,
      y: center.y - h / 2,
      w,
      h,
      center,
      kind,
      label:
        id < 2
          ? "전력 거점"
          : id === 2
            ? "통신 고지"
            : id === 3
              ? "외곽 전초"
              : id === 4
                ? "폐허 진지"
                : id === 5
                  ? "병영·정비 거점"
                  : "폐허 보급소",
      variant,
      entry: { x: center.x, y: center.y + h / 2 + 90 },
      pads: [],
    };
    zones.push(z);
    const add = (
      x: number,
      y: number,
      w: number,
      h: number,
      kind: Rect["kind"] = "wall",
    ) => obstacles.push({ x: z.x + x, y: z.y + y, w, h, kind });
    // Open gun pits, ruined corners, split hangars and U-shaped compounds have different footprints.
    if (variant === 0) {
      add(0, 0, w * 0.3, 30);
      add(0, 0, 30, h * 0.35);
      add(w - 30, h * 0.6, 30, h * 0.4);
      add(w * 0.65, h - 30, w * 0.35, 30);
    }
    if (variant === 1) {
      add(0, 0, w * 0.35, 35);
      add(w * 0.65, 0, w * 0.35, 35);
      add(0, 0, 35, h * 0.6);
      add(w - 35, h * 0.4, 35, h * 0.6);
      add(w * 0.3, h - 35, w * 0.7, 35);
    }
    if (variant === 2) {
      add(0, 0, w * 0.28, 35);
      add(w * 0.7, 0, w * 0.3, 35);
      add(0, h - 35, w * 0.28, 35);
      add(w * 0.7, h - 35, w * 0.3, 35);
      add(0, 0, 35, h * 0.3);
      add(w - 35, h * 0.7, 35, h * 0.3);
      add(100, 100, 65, 80, "container");
    }
    if (variant === 3) {
      add(0, 0, w * 0.6, 35);
      add(0, 0, 35, h);
      add(w - 35, 0, 35, h * 0.4);
      add(0, h - 35, w * 0.3, 35);
      add(w * 0.6, h - 35, w * 0.4, 35);
    }
    if (id === 3) {
      add(110, 80, 70, 70, "crate");
      add(w - 150, h - 140, 60, 60, "container");
    }
    z.pads = [
      { x: center.x - 70, y: center.y },
      { x: center.x + 70, y: center.y },
      { x: center.x, y: center.y - 70 },
      { x: center.x, y: center.y + 70 },
      z.entry,
    ].filter((p) => !blocked(p, obstacles, 24));
  }
  const edgePoint = (edge: number, t: number): Vec =>
    edge === 0
      ? { x: 260, y: 350 + t * (height - 700) }
      : edge === 1
        ? { x: width - 260, y: 350 + t * (height - 700) }
        : edge === 2
          ? { x: 350 + t * (width - 700), y: 260 }
          : { x: 350 + t * (width - 700), y: height - 260 };
  const side = Math.floor(random() * 4);
  const chooseEdge = (edge: number) => {
    let p = edgePoint(edge, random()),
      score = 0;
    for (let i = 0; i < 80; i++) {
      const q = edgePoint(edge, random()),
        d = Math.min(...centres.map((c) => distance(c, q)));
      if (d > score) {
        p = q;
        score = d;
      }
    }
    return p;
  };
  const spawn = chooseEdge(side),
    extractions = [1, 2, 3].map((n) => chooseEdge((side + n) % 4));
  const entries = [
    { x: 90, y: 1000 + Math.floor(random() * 500) },
    { x: width - 90, y: 2600 + Math.floor(random() * 500) },
    { x: 3600 + Math.floor(random() * 800), y: 90 },
    { x: 1800 + Math.floor(random() * 800), y: height - 90 },
  ];
  // Borders have physical wide gates, suitable for heavy units.
  const gates = [
    { x: -220, y: entries[0].y },
    { x: width + 220, y: entries[1].y },
    { x: entries[2].x, y: -220 },
    { x: entries[3].x, y: height + 220 },
  ];
  for (let side = 0; side < 4; side++) {
    const e = entries[side],
      vertical = side < 2,
      coord = vertical ? e.y : e.x,
      max = vertical ? height : width;
    const make = (lo: number, hi: number) =>
      obstacles.push(
        vertical
          ? {
              x: side === 0 ? 0 : width - 40,
              y: lo,
              w: 40,
              h: hi - lo,
              kind: "wall",
            }
          : {
              x: lo,
              y: side === 2 ? 0 : height - 40,
              w: hi - lo,
              h: 40,
              kind: "wall",
            },
      );
    make(0, coord - 190);
    make(coord + 190, max);
    obstacles.push(
      vertical
        ? {
            id: "border-" + side,
            x: side === 0 ? 0 : width - 40,
            y: coord - 190,
            w: 40,
            h: 380,
            kind: "door",
            open: true,
          }
        : {
            id: "border-" + side,
            x: coord - 190,
            y: side === 2 ? 0 : height - 40,
            w: 380,
            h: 40,
            kind: "door",
            open: true,
          },
    );
  }
  const nodes = [
    ...zones.map((z) => z.entry),
    spawn,
    ...extractions,
    ...entries,
  ];
  const connect = (a: number, b: number) => {
    const p = nodes[a],
      q = nodes[b],
      dx = q.x - p.x,
      dy = q.y - p.y,
      d = Math.max(1, distance(p, q)),
      bend = (random() - 0.5) * 440;
    roads.push({
      id: "road-" + roads.length,
      from: a,
      to: b,
      width: 160 + random() * 55,
      points: [
        { ...p },
        {
          x: p.x + dx * 0.33 - (dy / d) * bend,
          y: p.y + dy * 0.33 + (dx / d) * bend,
        },
        {
          x: p.x + dx * 0.67 - (dy / d) * bend * 0.65,
          y: p.y + dy * 0.67 + (dx / d) * bend * 0.65,
        },
        { ...q },
      ],
    });
  };
  const joined = new Set([count]);
  while (joined.size < nodes.length) {
    let best = [0, 0, Infinity];
    for (const a of joined)
      for (let b = 0; b < nodes.length; b++)
        if (!joined.has(b) && distance(nodes[a], nodes[b]) < best[2])
          best = [a, b, distance(nodes[a], nodes[b])];
    connect(best[0], best[1]);
    joined.add(best[1]);
  }
  for (let n = 0, added = 0; n < 100 && added < 4; n++) {
    const a = Math.floor(random() * count),
      b = Math.floor(random() * count);
    if (
      a !== b &&
      !roads.some(
        (r) => (r.from === a && r.to === b) || (r.from === b && r.to === a),
      )
    ) {
      connect(a, b);
      added++;
    }
  }
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
  const sources: DispatchSource[] = [];
  for (const z of zones.slice(3, 6)) {
    const candidates: Vec[] = [];
    for (let y = 350; y < height - 450; y += 100)
      for (let x = 350; x < width - 350; x += 100)
        if (distance({ x, y }, z.center) < 1400) candidates.push({ x, y });
    candidates.sort((a, b) => distance(a, z.center) - distance(b, z.center));
    const s = candidates.find(
      (p) =>
        !zones.some(
          (o) =>
            p.x + 220 > o.x &&
            p.x - 220 < o.x + o.w &&
            p.y + 450 > o.y &&
            p.y - 200 < o.y + o.h,
        ) &&
        !nodes.some(
          (v) => Math.abs(p.x - v.x) < 250 && Math.abs(p.y - v.y) < 370,
        ) &&
        !obstacles.some(
          (o) =>
            p.x + 210 > o.x &&
            p.x - 210 < o.x + o.w &&
            p.y + 420 > o.y &&
            p.y - 190 < o.y + o.h,
        ),
    );
    if (!s) throw Error("No physical source " + seed + ":" + z.id);
    obstacles.push(
      { x: s.x - 150, y: s.y - 150, w: 300, h: 30, kind: "wall" },
      { x: s.x - 150, y: s.y - 150, w: 30, h: 340, kind: "wall" },
      { x: s.x + 120, y: s.y - 150, w: 30, h: 340, kind: "wall" },
      {
        id: "door-" + z.id,
        x: s.x - 120,
        y: s.y + 160,
        w: 240,
        h: 25,
        kind: "door",
        open: true,
      },
    );
    const entry = { x: s.x, y: s.y + 235 };
    sources.push({
      id: "source-" + z.id,
      kind: z.id === 5 ? "barracks" : "outpost",
      ...s,
      entry,
      doorId: "door-" + z.id,
      route: [entry, z.entry],
      capacity: 2,
      stock: 2,
      supports: ["rifle", "rush", "heavy"],
      response: 2,
      prepare: 8,
      interval: 40,
      batch: 2,
      disabled: false,
      cooldown: 0,
      warning: 0,
      blocked: false,
      blockProgress: 0,
      facility: "facility-" + z.id,
    });
    nodes.push(entry);
    roads.push({
      id: "source-road-" + z.id,
      from: 3,
      to: z.id,
      width: 240,
      points: [entry, z.entry],
    });
  }
  entries.forEach((entry, i) =>
    sources.push({
      id: "external-" + i,
      kind: "external",
      ...gates[i],
      entry,
      doorId: "border-" + i,
      route: [entry],
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
    }),
  );
  const reserved = (p: Vec, r: number) =>
    nodes.some((n) => distance(n, p) < r + 140) ||
    zones.some(
      (z) =>
        p.x > z.x - r - 90 &&
        p.x < z.x + z.w + r + 90 &&
        p.y > z.y - r - 90 &&
        p.y < z.y + z.h + r + 90,
    ) ||
    sources.some(
      (s) =>
        Math.abs(p.x - s.x) < r + 230 &&
        p.y > s.y - r - 210 &&
        p.y < s.y + r + 480,
    ) ||
    roads.some((road) =>
      road.points
        .slice(1)
        .some((q, i) => segmentDistance(p, road.points[i], q) < r + 160),
    );
  const rock = (
    p: Vec,
    w: number,
    h: number,
    variant: number,
    ridge = false,
  ) => {
    if (
      p.x < 180 ||
      p.y < 180 ||
      p.x > width - 180 ||
      p.y > height - 180 ||
      reserved(p, Math.max(w, h) / 2) ||
      obstacles.some(
        (o) =>
          (!ridge || o.kind !== "rock") &&
          p.x + w / 2 + 85 > o.x &&
          p.x - w / 2 - 85 < o.x + o.w &&
          p.y + h / 2 + 85 > o.y &&
          p.y - h / 2 - 85 < o.y + o.h,
      )
    )
      return;
    const x = p.x - w / 2,
      y = p.y - h / 2;
    obstacles.push({
      x,
      y,
      w,
      h,
      kind: "rock",
      variant,
      polygon: [
        { x: x + w * 0.16, y: y + h * 0.05 },
        { x: x + w * 0.76, y },
        { x: x + w, y: y + h * 0.3 },
        { x: x + w * 0.88, y: y + h * 0.88 },
        { x: x + w * 0.28, y: y + h },
        { x, y: y + h * 0.65 },
        { x: x + w * 0.02, y: y + h * 0.22 },
      ],
    });
  };
  const ridges = [];
  for (let i = 0; i < 5; i++) {
    const a = {
        x: 650 + random() * (width - 1300),
        y: 500 + random() * (height - 1000),
      },
      angle = random() * Math.PI,
      len = 1100 + random() * 1800;
    const points = [];
    for (let t = -0.5; t <= 0.5; t += 0.06) {
      const p = {
        x: a.x + Math.cos(angle) * len * t,
        y: a.y + Math.sin(angle) * len * t + Math.sin(t * 8 + i) * 100,
      };
      points.push(p);
      rock(p, 200 + random() * 150, 120 + random() * 100, i % 4, true);
    }
    ridges.push(points);
  }
  for (let i = 0; i < 220; i++)
    rock(
      { x: 180 + random() * (width - 360), y: 180 + random() * (height - 360) },
      90 + random() * 150,
      70 + random() * 120,
      i % 4,
    );
  const decor = Array.from({ length: 190 }, (_, i) => ({
    x: 100 + random() * (width - 200),
    y: 100 + random() * (height - 200),
    size: 25 + random() * 55,
    frame: i % 5 === 0 ? 11 : 10,
    angle: random() * 6.28,
  }));
  return {
    width,
    height,
    seed,
    obstacles,
    zones,
    roads,
    sources,
    installations,
    extractions,
    spawn,
    patrols: roads
      .filter((r) => r.from < count && r.to < count)
      .slice(0, 8)
      .map((r) => r.points),
    topology: roads
      .map(
        (r) =>
          `${r.from}-${r.to}:${Math.round(r.points[1].x)},${Math.round(r.points[1].y)}`,
      )
      .join(";"),
    supplies: [
      { x: spawn.x + 65, y: spawn.y, used: false },
      ...zones.map((z) => ({ ...z.entry, used: false })),
    ],
    intel: { ...zones[Math.min(6, zones.length - 1)].center },
    terrain: {
      biome: "barren",
      ridges,
      decor,
      elevation: Array.from({ length: 64 * 42 }, (_, i) =>
        elevation((i % 64) * 100, Math.floor(i / 64) * 100, seed),
      ),
    },
  };
}
