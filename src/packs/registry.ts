import type { Pack } from "./types";

/** Packs that ship with the app. Image packs from disk are added in M2. */
export const BUILTIN_PACKS: Pack[] = [
  { id: "builtin.spirit", name: "Дух", author: "Familiar", kind: "svg", width: 200, height: 200 },
];

export function packById(id: string): Pack {
  return BUILTIN_PACKS.find((p) => p.id === id) ?? BUILTIN_PACKS[0];
}
