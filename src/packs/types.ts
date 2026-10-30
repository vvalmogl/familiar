export type Mood = "intro" | "idle" | "thinking" | "talking" | "happy";

/** A character pack. Image packs are folders with pack.json; "svg" packs are built into the app. */
export interface Pack {
  id: string;
  name: string;
  author: string;
  kind: "svg" | "images";
  width: number;
  height: number;
  /** Image URLs per mood; moods without images fall back to `idle`. */
  states?: Partial<Record<Mood, string[]>>;
  /** Solid-background images get a rounded card with a themed frame. */
  card?: boolean;
}
