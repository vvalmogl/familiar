const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

const NAMED: Record<string, string> = {
  Space: "Space", Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Backquote: "`",
  Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'",
  BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
};

/** Key name for a physical key code, or null for modifier keys. */
function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  return NAMED[code] ?? null;
}

/** Tauri accelerator string from a keydown, e.g. "Alt+Space". Requires at least one modifier. */
export function toAccelerator(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): string | null {
  const key = keyName(e.code);
  if (!key) return null;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Control");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  if (mods.length === 0) return null;
  return [...mods, key].join("+");
}

/** Human form: ⌥ Space on macOS, Alt+Space elsewhere. */
export function prettyHotkey(acc: string): string {
  const mac: Record<string, string> = { Control: "⌃", Alt: "⌥", Shift: "⇧", Super: "⌘", CommandOrControl: "⌘" };
  const other: Record<string, string> = { Super: "Win", CommandOrControl: "Ctrl", Control: "Ctrl" };
  const parts = acc.split("+");
  return isMac
    ? parts.map((p) => mac[p] ?? p).join(" ")
    : parts.map((p) => other[p] ?? p).join("+");
}
