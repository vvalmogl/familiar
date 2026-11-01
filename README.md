# Familiar

**An AI quick bar with an animated companion.** Press a hotkey anywhere, ask a question, get the answer right under the bar, while your companion hangs out, thinks, and teleports around it.

- ⌥ Space / Alt+Space (or any combo you record) opens the bar on macOS, Windows and Linux.
- **Bring your own AI**: Claude Code, ChatGPT (Codex), Gemini CLI, any OpenAI-compatible API (OpenRouter, Gemini API, Qwen) or a local model in Ollama. Requests go through *your* account; Familiar never sees or limits them.
- **Companions**: built-in characters, a pack gallery, and your own GIFs turned into a character with moods for thinking, talking and cheering.
- **Themes**: neon, samurai, netrunner, strawberry, lavender and more.

> Status: early (v0.1). Website: https://familiar.roadmapcli.me · Contact: familiar@roadmapcli.me

## Install

Download the latest version from [Releases](https://github.com/vvalmogl/familiar/releases/latest) or the website.

**macOS** (`.dmg`, Apple Silicon and Intel)
1. Open the `.dmg` and drag Familiar into Applications.
2. Launch it. macOS says it "cannot verify the developer": click **Done**.
3. Open **System Settings → Privacy & Security**, scroll down, click **Open Anyway** next to Familiar, then launch it again. Only needed once.

Familiar isn't notarized by Apple yet (that needs a paid developer account). Updates are signed with the project's key and installed from inside the app.

**Windows** (`.exe` installer or `.msi`): if SmartScreen says "Windows protected your PC", click **More info → Run anyway**.

**Linux** (`.AppImage` or `.deb`): make the AppImage executable and run it. On GNOME/Wayland bind `familiar --toggle` to a shortcut in system settings (see below).

## Develop

Requirements: Node 22+, Rust (stable), and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```sh
npm install
npm run tauri dev     # run the app
npm test              # frontend tests (vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # provider parsers
```

Project layout:

| Path | What |
|---|---|
| `src/windows/` | The three windows: `Bar` (prompt), `Character` (companion), `Main` (onboarding & settings) |
| `src/lib/` | Settings store, themes, hotkey recording, companion placement |
| `src/packs/` | Character packs (built-in `Spirit`, pack types) |
| `src-tauri/src/providers/` | AI providers: CLI streaming (claude, codex, gemini) and OpenAI-compatible HTTP |
| `src-tauri/src/windows.rs` | Hotkey, tray, showing/hiding windows |

### Hotkey conflicts

If the saved hotkey can't be registered at startup, Familiar opens Settings → Keys with a warning. On Windows and Linux (X11) registration fails when another app owns the combo, so this catches conflicts there (not yet tested on those systems). macOS lets several apps register the same combo silently (all of them react), so there Familiar can't detect it — pick a combo no other launcher uses.

### Linux / Wayland

GNOME on Wayland doesn't let apps register global hotkeys. Bind a system shortcut to `familiar --toggle` instead.

## Roadmap

- [x] M0–M1: cross-platform shell, hotkey, streaming answers from 4 provider types, themes, onboarding
- [x] M2: character packs (`pack.json`), GIF import, moods
- [x] M3: one-click CLI install & sign-in (Claude, ChatGPT/Codex, Gemini) with live log, hotkey conflict warning, import previews
- [x] M4: optional account (email, GitHub, Google), settings sync, pack gallery
- [x] M5: release builds with signed auto-update, website
- [ ] Next: selected-text and screenshot questions, conversation history, Apple notarization
- [ ] Later: pack store for original artist-made companions

## Character art

Only original or properly licensed art ships with Familiar. Fan packs of characters you don't own the rights to stay on your machine (`packs/local/` is git-ignored).

## License

[Apache-2.0](LICENSE)
