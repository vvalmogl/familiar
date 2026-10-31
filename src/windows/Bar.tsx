import { Channel, invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { currentMonitor, getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { PROVIDERS, setSetting, useSettings, type ProviderKind } from "../lib/settings";
import { applyTheme, themeById } from "../lib/themes";
import type { Mood } from "../packs/types";

type ProviderEvent =
  | { type: "text"; text: string }
  | { type: "tool"; label: string }
  | { type: "error"; message: string }
  | { type: "done" };

interface Turn {
  q: string;
  a: string;
}

const WIDTH = 680;
const BAR_HEIGHT = 58;
const MAX_ANSWER = 420;

const mood = (m: Mood) => emitTo("character", "character:mood", m);

/** Spotlight-style prompt: Enter sends, Esc hides, ⌘/Ctrl+N new chat, ⌘/Ctrl+1…4 switch AI. */
export default function Bar() {
  const settings = useSettings();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const conversation = useRef(crypto.randomUUID());
  const requestId = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) applyTheme(themeById(settings.theme));
  }, [settings?.theme]);

  const reportFrame = useCallback(async () => {
    const win = getCurrentWindow();
    const [sf, pos, size, monitor] = await Promise.all([
      win.scaleFactor(),
      win.outerPosition(),
      win.outerSize(),
      currentMonitor(),
    ]);
    if (!monitor) return;
    const area = monitor.workArea ?? { position: monitor.position, size: monitor.size };
    const msf = monitor.scaleFactor ?? sf;
    await emitTo("character", "bar:frame", {
      bar: { x: pos.x / sf, y: pos.y / sf, w: size.width / sf, h: size.height / sf },
      screen: {
        x: area.position.x / msf,
        y: area.position.y / msf,
        w: area.size.width / msf,
        h: area.size.height / msf,
      },
    });
  }, []);

  // Clicking anywhere else hides the bar (like Spotlight) — but only after it really had focus:
  // a freshly shown window can report a blur before it gets focused.
  const hadFocus = useRef(false);
  useEffect(() => {
    const un = listen("bar:shown", () => {
      hadFocus.current = false;
      inputRef.current?.focus();
      reportFrame();
    });
    return () => void un.then((f) => f());
  }, [reportFrame]);

  useEffect(() => {
    const un = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) hadFocus.current = true;
      else if (hadFocus.current) invoke("hide_bar");
    });
    return () => void un.then((f) => f());
  }, []);

  // Grow the window with the answer; the top edge stays put.
  useLayoutEffect(() => {
    const answer = answerRef.current;
    const answerH = answer ? Math.min(answer.scrollHeight, MAX_ANSWER) : 0;
    const height = BAR_HEIGHT + (answerH ? 8 + answerH : 0);
    getCurrentWindow()
      .setSize(new LogicalSize(WIDTH, height))
      .then(reportFrame);
    if (answer) answer.scrollTop = answer.scrollHeight;
  }, [turns, reportFrame]);

  const newChat = useCallback(() => {
    requestId.current++;
    invoke("reset", { conversation: conversation.current });
    conversation.current = crypto.randomUUID();
    setTurns([]);
    setBusy(false);
    mood("idle");
  }, []);

  // Switching AI starts a new chat.
  const provider = settings?.provider;
  useEffect(() => {
    if (provider) newChat();
  }, [provider, newChat]);

  const append = (text: string) =>
    setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, a: t.a + text } : t)));

  const send = () => {
    const q = input.trim();
    if (!q || !settings) return;
    setInput("");
    setTurns((ts) => [...ts, { q, a: "" }]);
    setBusy(true);
    mood("thinking");

    const id = ++requestId.current;
    let talking = false;
    const channel = new Channel<ProviderEvent>();
    channel.onmessage = (ev) => {
      if (id !== requestId.current) return;
      switch (ev.type) {
        case "text":
          if (!talking) {
            talking = true;
            mood("talking");
            if (settings.jumping && Math.random() < 0.5) emitTo("character", "character:jump");
          }
          append(ev.text);
          break;
        case "tool":
          append(`\n\n_🔎 ${ev.label}_\n\n`);
          break;
        case "error":
          append(`\n\n⚠️ ${ev.message}`);
          break;
        case "done":
          setBusy(false);
          mood("happy");
      }
    };
    const p = settings.provider;
    invoke("ask", {
      req: {
        provider: p,
        prompt: q,
        conversation: conversation.current,
        model: settings.models[p] || null,
        systemPrompt: settings.systemPrompt,
        apiBaseUrl: settings.apiBaseUrl,
      },
      onEvent: channel,
    }).catch((e) => {
      append(`⚠️ ${e}`);
      setBusy(false);
    });
  };

  const switchProvider = (kind: ProviderKind) => setSetting("provider", kind);
  const cycleProvider = () => {
    const i = PROVIDERS.findIndex((p) => p.id === settings?.provider);
    switchProvider(PROVIDERS[(i + 1) % PROVIDERS.length].id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === "Escape") {
      invoke("hide_bar");
    } else if (e.metaKey || e.ctrlKey) {
      // Physical keys, so shortcuts work in any keyboard layout.
      if (e.code === "KeyN") {
        e.preventDefault();
        newChat();
      } else if (e.code === "Comma") {
        e.preventDefault();
        invoke("open_main", { section: "settings" });
      } else if (/^Digit[1-9]$/.test(e.code)) {
        const p = PROVIDERS[Number(e.code.slice(5)) - 1];
        if (p) {
          e.preventDefault();
          switchProvider(p.id);
        }
      }
    }
  };

  const title = PROVIDERS.find((p) => p.id === settings?.provider)?.title ?? "";

  return (
    <div className="bar-root" ref={rootRef}>
      <div className="bar glass">
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Спроси что угодно…"
          spellCheck={false}
        />
        <button className="pill" onClick={cycleProvider} title="Сменить нейросеть (⌘1…⌘4)">
          {title}
        </button>
        <span className={busy ? "spinner" : "spinner off"} />
      </div>
      {turns.length > 0 && (
        <div className="answer glass" ref={answerRef}>
          {turns.map((t, i) => (
            <div className="turn" key={i}>
              <div className="q">› {t.q}</div>
              <Markdown
                // Model output is untrusted: no remote images (they could leak data via the URL),
                // and links open in the browser only for http(s).
                disallowedElements={["img"]}
                unwrapDisallowed
                components={{
                  a: ({ href, children }) => (
                    <a href={href} onClick={(e) => (e.preventDefault(), href && /^https?:\/\//i.test(href) && openUrl(href))}>
                      {children}
                    </a>
                  ),
                }}
              >
                {t.a}
              </Markdown>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
