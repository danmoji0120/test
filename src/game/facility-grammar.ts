import type { Zone, Rect } from "../shared/data";
import type { FacilityRole } from "../shared/missions";
/** Physical, open-sided role-specific footprints. The central device and approach lane stay clear. */
export function facilityGrammar(
  z: Zone,
  role: FacilityRole,
  add: (
    x: number,
    y: number,
    w: number,
    h: number,
    kind?: Rect["kind"],
  ) => unknown,
) {
  const w = z.w,
    h = z.h;
  if (["silo", "drill", "analyzer", "beacon"].includes(role)) {
    add(0, 0, 90, 35);
    add(w - 90, 0, 90, 35);
    if (role === "silo") {
      add(0, h * 0.3, 35, h * 0.3);
      add(w - 35, h * 0.3, 35, h * 0.3);
    }
    if (role === "beacon") {
      add(75, h - 40, 80, 35, "crate");
      add(w - 155, h - 40, 80, 35, "crate");
    }
    if (role === "drill") {
      add(0, h * 0.5, 60, 70, "rock");
      add(w - 60, h * 0.2, 60, 70, "rock");
    }
  } else if (["reactor", "cooling", "power"].includes(role)) {
    add(0, 0, w * 0.28, 30);
    add(w * 0.72, 0, w * 0.28, 30);
    add(0, h * 0.25, 35, h * 0.35);
    add(w - 35, h * 0.25, 35, h * 0.35);
    add(w * 0.15, h - 35, w * 0.18, 35);
    add(w * 0.67, h - 35, w * 0.18, 35);
    if (role === "cooling") {
      add(80, 85, 50, 70, "container");
      add(w - 130, h - 155, 50, 70, "container");
    }
  } else if (["transmitter", "radar", "command", "archive"].includes(role)) {
    const mirror = z.variant % 2 ? 1 : -1;
    add(0, 0, w * 0.3, 32);
    add(w * 0.7, 0, w * 0.3, 32);
    add(mirror > 0 ? 0 : w - 32, 0, 32, h * 0.5);
    add(mirror > 0 ? w - 32 : 0, h * 0.65, 32, h * 0.35);
    add(w * 0.1, h - 32, w * 0.22, 32);
  } else if (role === "production") {
    add(0, 0, w * 0.35, 32);
    add(w * 0.65, 0, w * 0.35, 32);
    add(0, h * 0.2, 32, h * 0.45);
    add(w - 32, h * 0.35, 32, h * 0.45);
    add(90, h - 85, 65, 55, "crate");
  } else {
    add(0, 0, w * 0.25, 30);
    add(w * 0.75, 0, w * 0.25, 30);
    add(0, h * 0.25, 30, h * 0.4);
    add(w - 30, h * 0.3, 30, h * 0.4);
    if (role === "supply") add(75, 75, 60, 60, "container");
  }
}
