import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {migrateLoadout} from "../shared/loadout";
import type { Profile } from "../shared/data";
export class Store {
  profiles = new Map<string, Profile>();
  private file: string;
  constructor(dir = "data") {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "profiles.json");
    for (const f of [this.file, this.file + ".bak"]) {
      try {
        const parsed = JSON.parse(readFileSync(f, "utf8"));
        if (![1,2].includes(parsed.version) || !Array.isArray(parsed.profiles))
          throw Error("Invalid save");
        for (const p of parsed.profiles) {
          if (
            typeof p.token === "string" &&
            /^[a-f0-9]{48}$/.test(p.token) &&
            Number.isFinite(p.credits) &&
            Array.isArray(p.unlocks) &&
            Array.isArray(p.mods) &&
            Array.isArray(p.settled)
          )
            {
            for(const id of ["ar","smg","at","pistol"])if(!p.unlocks.includes(id))p.unlocks.push(id);
            p.loadout=migrateLoadout(p.loadout??p,p.unlocks);p.schema=2;this.profiles.set(p.token,p);}
        }
        break;
      } catch {}
    }
  }
  get(token?: string) {
    let p = token ? this.profiles.get(token) : undefined;
    if (!p) {
      const t = randomBytes(24).toString("hex");
      p = {
        token: t,
        credits: 300,
        unlocks: ["ar", "smg", "at", "pistol"],
        schema:2,
        loadout:migrateLoadout({},["ar","smg","at","pistol"]),
        mods: ["none"],
        runs: 0,
        wins: 0,
        kills: 0,
        settled: [],
      };
      this.profiles.set(t, p);
      this.save();
    }
    return p;
  }
  settle(
    p: Profile,
    id: string,
    reward: number,
    success: boolean,
    kills: number,
  ) {
    if (p.settled.includes(id)) return false;
    p.credits += reward;
    p.runs++;
    p.wins += Number(success);
    p.kills += kills;
    p.settled.push(id);
    p.settled = p.settled.slice(-100);
    this.save();
    return true;
  }
  save() {
    const tmp = this.file + ".tmp";
    writeFileSync(
      tmp,
      JSON.stringify({ version: 2, profiles: [...this.profiles.values()] }),
    );
    if (existsSync(this.file)) copyFileSync(this.file, this.file + ".bak");
    renameSync(tmp, this.file);
  }
}
