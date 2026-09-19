import { readFileSync } from "node:fs";
import path from "node:path";
import type { Profile } from "./types";

/**
 * The talent map. In the real product this is ~98M people behind a query
 * engine; here it is a 48-row JSON file read once per server process.
 */
let cache: Profile[] | null = null;

export function loadProfiles(): Profile[] {
  if (cache) return cache;
  const file = path.join(process.cwd(), "data", "profiles.json");
  cache = JSON.parse(readFileSync(file, "utf8")) as Profile[];
  return cache;
}

export function profilesById(ids: string[]): Profile[] {
  const index = new Map(loadProfiles().map((p) => [p.id, p]));
  return ids.map((id) => index.get(id)).filter((p): p is Profile => Boolean(p));
}
