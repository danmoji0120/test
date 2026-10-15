import type { Page } from "playwright";
import type { Input } from "../src/shared/data";
export async function drive(page: Page, input: Input) {
  await page.evaluate((input) => {
    const q = (window as any).dollQA;
    if (!q.camera || q.room?.phase !== "playing") return;
    const p = q.room.players.find((p: any) => p.id === q.id),
      wanted = new Set<string>();
    if (input.dx > 0.1) wanted.add("d");
    if (input.dx < -0.1) wanted.add("a");
    if (input.dy > 0.1) wanted.add("s");
    if (input.dy < -0.1) wanted.add("w");
    if (input.sprint) wanted.add("Shift");
    if (input.reload) wanted.add("r");
    if (input.interact) wanted.add("e");
    if (input.revive) wanted.add("f");
    if(input.slot)wanted.add(String(input.slot));
    const old: Set<string> = (window as any).__qaKeys || new Set();
    for (const k of ["w", "a", "s", "d", "Shift", "r", "e", "f", "1", "2", "3"])
      document.body.dispatchEvent(
        new KeyboardEvent(wanted.has(k) ? "keydown" : "keyup", {
          key: k,
          bubbles: true,
        }),
      );
    (window as any).__qaKeys = wanted;
    const zoom = q.zoom || 1,
      x =
        ((input.targetX??p.x+Math.cos(input.angle)*250)-q.camera.x) * zoom +
        innerWidth / 2,
      y =
        ((input.targetY!==undefined?input.targetY-16:p.y-16+Math.sin(input.angle)*250)-q.camera.y) * zoom +
        innerHeight / 2;
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }),
    );
    const canvas = document.querySelector("canvas")!;
    for (const [field, button, on] of [
      ["__qaFire", 0, input.fire],
      ["__qaAim", 2, input.aim],
    ] as const) {
      {
        canvas.dispatchEvent(
          new MouseEvent(on ? "mousedown" : "mouseup", {
            button,
            bubbles: true,
            clientX: x,
            clientY: y,
          }),
        );
        (window as any)[field] = on;
      }
    }
  }, input);
}
