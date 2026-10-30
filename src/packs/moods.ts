import type { Frame, Mood, Pack } from "./types";

/** What to show for a mood: a frame animation or a single (randomly picked) image. */
export type Visual = { kind: "frames"; frames: Frame[] } | { kind: "image"; src: string } | { kind: "none" };

/** Moods a pack doesn't define fall back to idle. */
const FALLBACK: Record<Mood, Mood[]> = {
  intro: ["intro", "happy", "idle"],
  idle: ["idle"],
  thinking: ["thinking", "idle"],
  talking: ["talking", "idle"],
  happy: ["happy", "idle"],
};

export function visualFor(pack: Pack, mood: Mood, random = Math.random): Visual {
  for (const m of FALLBACK[mood]) {
    const frames = pack.frames[m];
    if (frames?.length) return { kind: "frames", frames };
    const images = pack.states[m];
    if (images?.length) return { kind: "image", src: images[Math.floor(random() * images.length)] };
  }
  return { kind: "none" };
}

/** Moods that play once and then settle back to idle. */
export function isOneShot(mood: Mood) {
  return mood === "intro" || mood === "happy";
}

/** Another pack from the rotation pool (or the current one if there's nothing else). */
export function nextPack(pool: string[], current: string, random = Math.random): string {
  const others = pool.filter((id) => id !== current);
  if (others.length === 0) return current;
  return others[Math.floor(random() * others.length)];
}

/** Guess a mood from a file name when importing loose GIFs. */
export function guessMood(fileName: string): Mood {
  const n = fileName.toLowerCase();
  if (/think|ponder|loading|hmm|думает/.test(n)) return "thinking";
  if (/talk|typ|laptop|keyboard|write|печата|говор/.test(n)) return "talking";
  if (/happy|dance|yay|joy|рад|танц/.test(n)) return "happy";
  if (/intro|hello|hi\b|wave|привет/.test(n)) return "intro";
  return "idle";
}
