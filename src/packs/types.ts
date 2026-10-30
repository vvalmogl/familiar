export type Mood = "intro" | "idle" | "thinking" | "talking" | "happy";

export const MOODS: { id: Mood; title: string }[] = [
  { id: "idle", title: "Обычное" },
  { id: "thinking", title: "Думает" },
  { id: "talking", title: "Отвечает" },
  { id: "happy", title: "Радуется" },
  { id: "intro", title: "Появление" },
];

/** A frame of a frame-by-frame animation: [image URL, milliseconds]. */
export type Frame = [string, number];

/** A character pack. "svg" packs are drawn by the app; "images" packs come from pack.json folders. */
export interface Pack {
  id: string;
  name: string;
  author: string;
  license: string;
  kind: "svg" | "images";
  builtin: boolean;
  /** Image URLs per mood; one is picked at random when the mood starts. */
  states: Partial<Record<Mood, string[]>>;
  /** Frame animations per mood; take precedence over `states`. */
  frames: Partial<Record<Mood, Frame[]>>;
  card: "auto" | "on" | "off";
  scale: number;
  preview?: string;
}

export type Rotation = "never" | "show" | "jump";
