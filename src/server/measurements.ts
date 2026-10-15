import type { World } from "../shared/data";
const records = new WeakMap<
  World,
  { ticks: number[]; packets: number[]; bytes: number; messages: number }
>();
const intervals: number[] = [];
let last = performance.now();
export function timerSample() {
  if (!process.env.QA_TRACE_FILE) return;
  const now = performance.now();
  intervals.push(now - last);
  last = now;
  if (intervals.length > 1800) intervals.shift();
}
function get(w: World) {
  let r = records.get(w);
  if (!r) {
    r = { ticks: [], packets: [], bytes: 0, messages: 0 };
    records.set(w, r);
  }
  return r;
}
export function tickSample(w: World, ms: number) {
  if (!process.env.QA_TRACE_FILE) return;
  const r = get(w);
  r.ticks.push(ms);
  if (r.ticks.length > 1800) r.ticks.shift();
}
export function packetSample(w: World, packet: unknown) {
  if (!process.env.QA_TRACE_FILE) return;
  const r = get(w),
    size = Buffer.byteLength(JSON.stringify(packet));
  r.bytes += size;
  r.messages++;
  r.packets.push(size);
  if (r.packets.length > 1800) r.packets.shift();
}
function stats(values: number[]) {
  const a = [...values].sort((a, b) => a - b);
  return {
    samples: a.length,
    mean: a.reduce((n, v) => n + v, 0) / Math.max(1, a.length),
    p50: a[Math.floor(a.length * 0.5)] ?? 0,
    p95: a[Math.floor(a.length * 0.95)] ?? 0,
    p99: a[Math.floor(a.length * 0.99)] ?? 0,
    max: a.at(-1) ?? 0,
  };
}
export function measurements(w: World) {
  const r = get(w);
  return {
    serverTickMs: stats(r.ticks),
    timerIntervalMs: stats(intervals),
    snapshotBytes: stats(r.packets),
    totalBytes: r.bytes,
    totalMessages: r.messages,
    heapMiB: process.memoryUsage().heapUsed / 1024 / 1024,
    rssMiB: process.memoryUsage().rss / 1024 / 1024,
  };
}
