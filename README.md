# Familiar

**An AI quick bar with an animated companion.** Press a hotkey anywhere, ask a question, get the answer right under the bar, while your companion hangs out, thinks, and teleports around it.

- ⌥ Space / Alt+Space (or any combo you record) opens the bar on macOS, Windows and Linux.
- **Bring your own AI**: Claude Code, ChatGPT (Codex), Gemini CLI, any OpenAI-compatible API (OpenRouter, Gemini API, Qwen) or a local model in Ollama. Requests go through *your* account; Familiar never sees or limits them.
- **Companions**: a built-in spirit, and soon character packs: your own GIFs, with moods for thinking and talking.
- **Themes**: neon, samurai, netrunner, strawberry, lavender and more.

> Status: early development (v0.1). See the [roadmap](#roadmap).

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

### Linux / Wayland

GNOME on Wayland doesn't let apps register global hotkeys. Bind a system shortcut to `familiar --toggle` instead.

## Roadmap

- [x] M0–M1: cross-platform shell, hotkey, streaming answers from 4 provider types, themes, onboarding
- [ ] M2: character packs (`pack.json`), GIF import, moods
- [ ] M3: polished onboarding, one-click CLI install/login
- [ ] M4: optional account (Supabase): settings sync, pack gallery
- [ ] M5: signed releases with auto-update, website
- [ ] Later: pack store for original artist-made companions

## Character art

Only original or properly licensed art ships with Familiar. Fan packs of characters you don't own the rights to stay on your machine (`packs/local/` is git-ignored).

## License

[Apache-2.0](LICENSE)
