import type { World, Vec } from "../shared/data";
import { event } from "./simulation";
export const ALERT_THRESHOLDS = [0, 15, 40, 70, 100] as const;
export const initialAlert = () => ({
  level: 0,
  heat: 0,
  floor: 0,
  lastContact: -100,
  lastRaise: -100,
  reason: "평시",
  gates: {} as Record<string, number>,
});
const levelOf = (heat: number) =>
  ALERT_THRESHOLDS.filter((v) => heat >= v).length - 1;
export function audit(w: World, event: string, detail: string) {
  w.responseLog.push({ at: w.time, event, detail });
  if (w.responseLog.length > 256)
    w.responseLog.splice(0, w.responseLog.length - 256);
}
export function raiseAlert(
  w: World,
  amount: number,
  reason: string,
  at?: Vec,
  floor = 0,
) {
  const a = w.alertState,
    gates = (a.gates ??= {}),
    sound = /총성|발사음|불명음/.test(reason),
    contact = reason === "병력 접촉",
    support = reason === "지원 요청";
  a.gates = gates;
  a.lastContact = w.time;
  const gate = sound
    ? "noise"
    : contact
      ? "contact"
      : support
        ? "support"
        : reason;
  const gap = sound ? 1.5 : contact ? 6 : support ? 8 : 0.2;
  if (w.time - (gates[gate] ?? -100) < gap) return;
  gates[gate] = w.time;
  a.lastRaise = w.time;
  a.floor = Math.max(a.floor, floor);
  if (sound)
    a.heat = Math.max(a.heat, Math.min(18, a.heat + Math.min(amount, 4)));
  else if (contact) a.heat = Math.max(40, a.heat + 4);
  else a.heat = Math.min(130, a.heat + (support ? 8 : amount));
  a.reason = reason;
  const level = Math.max(a.floor, levelOf(a.heat));
  if (level !== a.level) {
    audit(w, "alert", `${a.level}->${level}: ${reason}`);
    if (level > a.level && at)
      event(w, { type: "alarm", ...at, heavy: level === 4 });
    if (level >= 3) w.director.next = Math.min(w.director.next, w.time + 2);
  }
  a.level = level;
}
export function tickAlert(w: World, dt: number) {
  const a = w.alertState;
  if (w.time - a.lastContact > 22)
    a.heat = Math.max(
      ALERT_THRESHOLDS[Math.min(4, a.floor)],
      a.heat - dt * 0.65,
    );
  a.level = Math.max(a.floor, levelOf(a.heat));
}
