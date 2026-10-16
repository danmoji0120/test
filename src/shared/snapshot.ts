/** Ordered WebSocket stream: static terrain once per run, dynamic state every snapshot. */
export interface StreamCursor {
  run: string;
  vision: number;
  terrain: number;
  explored?: Uint8Array;
}
function runs(cells: number[], previous?: Uint8Array) {
  const out: number[] = [];
  let start = -1;
  for (let i = 0; i <= cells.length; i++) {
    const added = i < cells.length && cells[i] && !previous?.[i];
    if (added && start < 0) start = i;
    if (!added && start >= 0) {
      out.push(start, i - start);
      start = -1;
    }
  }
  return out;
}
function decodeVision(v: any, previous?: any): any {
  if (!v || !v.exploredRuns) return v;
  const base =
    previous?.explored ??
    (previous?.exploredRuns ? decodeVision(previous).explored : undefined);
  const explored = v.exploredBase
    ? Array(v.cols * v.rows).fill(0)
    : [...(base ?? Array(v.cols * v.rows).fill(0))];
  for (let i = 0; i < v.exploredRuns.length; i += 2)
    explored.fill(
      1,
      v.exploredRuns[i],
      v.exploredRuns[i] + v.exploredRuns[i + 1],
    );
  const { exploredRuns, exploredBase, ...rest } = v;
  return { ...rest, explored };
}
export function packRoom(room: any, cursor?: StreamCursor) {
  const w = room.world;
  if (!w) return { room, cursor: undefined };
  const next: StreamCursor = {
    run: w.id,
    vision: w.visibility.revision,
    terrain: w.terrainRevision,
  };
  const first = !cursor || cursor.run !== w.id;
  let vision = w.visibility;
  if (w.mission.id) {
    if (first || cursor!.vision !== next.vision) {
      const { explored, ...rest } = w.visibility;
      vision = {
        ...rest,
        exploredRuns: runs(explored, first ? undefined : cursor!.explored),
        exploredBase: first,
      };
      next.explored = Uint8Array.from(explored);
    } else next.explored = cursor!.explored;
  }
  if (first)
    return {
      room:
        vision === w.visibility
          ? room
          : { ...room, world: { ...w, visibility: vision } },
      cursor: next,
    };
  const world = { ...w };
  world.visibility = vision;
  delete world.map;
  world.mapUpdate = {
    installations: w.map.installations,
    sources: w.map.sources,
    supplies: w.map.supplies,
    smokes: w.map.smokes,
    doors:
      cursor.terrain !== next.terrain
        ? w.map.obstacles.filter((o: any) => o.kind === "door")
        : undefined,
  };
  if (cursor.vision === next.vision) delete world.visibility;
  return { room: { ...room, world }, cursor: next };
}
/** Keep rendering/QA consumers on complete public state; no private state is reconstructed. */
export function unpackRoom(incoming: any, previous: any) {
  const w = incoming.world;
  if (!w) return incoming;
  if (w.map)
    return w.visibility?.exploredRuns
      ? { ...incoming, world: { ...w, visibility: decodeVision(w.visibility) } }
      : incoming;
  if (!previous?.world || previous.world.id !== w.id)
    throw Error("Missing initial operation snapshot");
  const update = w.mapUpdate,
    map = { ...previous.world.map, ...update };
  delete map.doors;
  if (update.doors) {
    const doors = new Map(update.doors.map((d: any) => [d.id, d]));
    map.obstacles = map.obstacles.map((o: any) => doors.get(o.id) ?? o);
  }
  const world = {
    ...w,
    map,
    visibility: w.visibility
      ? decodeVision(w.visibility, previous.world.visibility)
      : decodeVision(previous.world.visibility),
  };
  delete world.mapUpdate;
  return { ...incoming, world };
}
