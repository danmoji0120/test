/** Ordered WebSocket stream: static terrain once per run, dynamic state every snapshot. */
export interface StreamCursor {
  run: string;
  vision: number;
  terrain: number;
}
export function packRoom(room: any, cursor?: StreamCursor) {
  const w = room.world;
  if (!w) return { room, cursor: undefined };
  const next: StreamCursor = {
    run: w.id,
    vision: w.visibility.revision,
    terrain: w.terrainRevision,
  };
  if (!cursor || cursor.run !== w.id) return { room, cursor: next };
  const world = { ...w };
  delete world.map;
  world.mapUpdate = {
    installations: w.map.installations,
    sources: w.map.sources,
    supplies: w.map.supplies,
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
  if (!w || w.map) return incoming;
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
    visibility: w.visibility ?? previous.world.visibility,
  };
  delete world.mapUpdate;
  return { ...incoming, world };
}
