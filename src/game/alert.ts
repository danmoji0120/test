import type { World, Vec } from "../shared/data";
import { event } from "./simulation";
export const initialAlert = () => ({
  level: 0,
  heat: 0,
  floor: 0,
  lastContact: -100,
  lastRaise: -100,
  reason: "평시",
});
export function raiseAlert(
  w: World,
  amount: number,
  reason: string,
  at?: Vec,
  floor = 0,
) {
  const a = w.alertState;
  if (reason === "총성" && w.time - a.lastRaise < 1.5) return;
  a.lastRaise = w.time;
  a.lastContact = w.time;
  a.floor = Math.max(a.floor, floor);
  a.heat = Math.min(100, a.heat + amount);
  a.reason = reason;
  const level = Math.max(a.floor, Math.min(4, Math.floor(a.heat / 22)));
  if (level > a.level) {
    a.level = level;
    if (at) event(w, { type: "alarm", ...at });
  } else a.level = level;
}
export function tickAlert(w: World, dt: number) {
  const a = w.alertState;
  if (w.time - a.lastContact > 22)
    a.heat = Math.max(a.floor * 22, a.heat - dt * 0.65);
  a.level = Math.max(a.floor, Math.min(4, Math.floor(a.heat / 22)));
}
