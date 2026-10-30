import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { prettyHotkey, toAccelerator } from "../lib/hotkey";
import { DEFAULT_PROMPT, PROVIDERS, setSetting, useSettings, type ProviderKind, type Settings } from "../lib/settings";
import { applyTheme, THEMES, themeById } from "../lib/themes";
import Spirit from "../packs/Spirit";
import { BUILTIN_PACKS } from "../packs/registry";

type View = "onboarding" | "settings";

export default function Main() {
  const settings = useSettings();
  const [view, setView] = useState<View>("settings");

  useEffect(() => {
    const un = listen<string>("main:navigate", ({ payload }) => {
      if (payload === "onboarding" || payload === "settings") setView(payload);
    });
    return () => void un.then((f) => f());
  }, []);
  useEffect(() => {
    if (settings && !settings.onboarded) setView("onboarding");
  }, [settings?.onboarded]);
  useEffect(() => {
    if (settings) applyTheme(themeById(settings.theme));
  }, [settings?.theme]);

  if (!settings) return null;
  return view === "onboarding" ? (
    <Onboarding settings={settings} onDone={() => setView("settings")} />
  ) : (
    <SettingsView settings={settings} />
  );
}

// ───────────────────────────── onboarding ─────────────────────────────

function Onboarding({ settings, onDone }: { settings: Settings; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    <div className="ob-step" key="hi">
      <div className="ob-hero"><Spirit mood="intro" /></div>
      <h1>Привет! Я твой ИИ-компаньон</h1>
      <p>Жми сочетание клавиш в любой программе — появится строка. Спрашивай что угодно, а я буду рядом.</p>
    </div>,
    <div className="ob-step" key="hotkey">
      <h2>Сочетание клавиш</h2>
      <p>Им ты будешь вызывать строку. Можно оставить как есть.</p>
      <HotkeyRecorder value={settings.hotkey} />
    </div>,
    <div className="ob-step" key="look">
      <h2>Как я буду выглядеть</h2>
      <ThemePicker value={settings.theme} />
      <p className="muted">Своих персонажей и гифки можно будет добавить в настройках.</p>
    </div>,
    <div className="ob-step" key="ai">
      <h2>Кто будет отвечать</h2>
      <p>Подключи нейросеть, которая у тебя уже есть. Запросы идут через твой аккаунт — мы их не видим и не ограничиваем.</p>
      <ProviderSettings settings={settings} />
    </div>,
    <div className="ob-step" key="done">
      <div className="ob-hero"><Spirit mood="happy" /></div>
      <h1>Готово!</h1>
      <p>
        Нажми <kbd>{prettyHotkey(settings.hotkey)}</kbd> и задай первый вопрос.
      </p>
    </div>,
  ];
  const last = step === steps.length - 1;
  const finish = async () => {
    await setSetting("onboarded", true);
    onDone();
    await getCurrentWindow().hide();
  };
  return (
    <div className="onboarding">
      {steps[step]}
      <div className="ob-nav">
        <div className="dots">{steps.map((_, i) => <span key={i} className={i === step ? "on" : ""} />)}</div>
        {step > 0 && <button onClick={() => setStep(step - 1)}>Назад</button>}
        <button className="primary" onClick={() => (last ? finish() : setStep(step + 1))}>
          {last ? "Начать" : "Дальше"}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────── settings ─────────────────────────────

const SECTIONS = ["Нейросеть", "Внешний вид", "Персонаж", "Клавиши", "Аккаунт", "О программе"] as const;

function SettingsView({ settings }: { settings: Settings }) {
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Нейросеть");
  return (
    <div className="settings">
      <nav>
        {SECTIONS.map((s) => (
          <button key={s} className={s === section ? "on" : ""} onClick={() => setSection(s)}>
            {s}
          </button>
        ))}
      </nav>
      <main>
        <h2>{section}</h2>
        {section === "Нейросеть" && (
          <>
            <ProviderSettings settings={settings} />
            <label className="field">
              Системный промпт
              <textarea
                rows={4}
                value={settings.systemPrompt}
                onChange={(e) => setSetting("systemPrompt", e.target.value)}
              />
            </label>
            <button onClick={() => setSetting("systemPrompt", DEFAULT_PROMPT)}>По умолчанию</button>
          </>
        )}
        {section === "Внешний вид" && <ThemePicker value={settings.theme} />}
        {section === "Персонаж" && <CharacterSettings settings={settings} />}
        {section === "Клавиши" && (
          <>
            <HotkeyRecorder value={settings.hotkey} />
            <p className="muted">
              В строке: Enter — спросить · Esc — скрыть · ⌘/Ctrl+N — новый чат · ⌘/Ctrl+1…4 — нейросеть · ⌘/Ctrl+, — настройки
            </p>
          </>
        )}
        {section === "Аккаунт" && (
          <p className="muted">Вход и синхронизация настроек появятся в следующей версии. Без аккаунта всё работает.</p>
        )}
        {section === "О программе" && (
          <p className="muted">Familiar 0.1.0 · открытый код, лицензия Apache-2.0.</p>
        )}
      </main>
    </div>
  );
}

function ThemePicker({ value }: { value: string }) {
  return (
    <div className="themes">
      {THEMES.map((t) => (
        <button key={t.id} className={`theme ${t.id === value ? "on" : ""}`} onClick={() => setSetting("theme", t.id)}>
          <span className="swatch" style={{ background: t.dark ? "#16141c" : "#faf8fc" }}>
            {[t.frame, t.frame2, t.accent2].map((c, i) => <i key={i} style={{ background: c }} />)}
          </span>
          {t.title}
        </button>
      ))}
    </div>
  );
}

function CharacterSettings({ settings }: { settings: Settings }) {
  return (
    <>
      <div className="packs">
        {BUILTIN_PACKS.map((p) => (
          <button key={p.id} className={`pack ${p.id === settings.packId ? "on" : ""}`} onClick={() => setSetting("packId", p.id)}>
            <div className="pack-preview">{p.kind === "svg" && <Spirit mood="idle" />}</div>
            {p.name}
          </button>
        ))}
      </div>
      <p className="muted">Импорт своих гифок и паков — в следующем обновлении.</p>
      <label className="field">
        Размер: {Math.round(settings.characterScale * 100)}%
        <input type="range" min={0.5} max={1.6} step={0.05} value={settings.characterScale}
          onChange={(e) => setSetting("characterScale", Number(e.target.value))} />
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.jumping} onChange={(e) => setSetting("jumping", e.target.checked)} />
        Прыгает с места на место
      </label>
      {settings.jumping && (
        <label className="field">
          Примерно раз в {settings.jumpInterval} с
          <input type="range" min={3} max={30} step={1} value={settings.jumpInterval}
            onChange={(e) => setSetting("jumpInterval", Number(e.target.value))} />
        </label>
      )}
    </>
  );
}

// ───────────────────────────── providers ─────────────────────────────

interface Detected {
  claude: string | null;
  codex: string | null;
  gemini: string | null;
  ollama: boolean;
}

const HOW_TO: Record<Exclude<ProviderKind, "api">, string> = {
  claude: "Установи Claude Code (claude.com/claude-code) и один раз запусти `claude` в терминале, чтобы войти.",
  codex: "Установи Codex и войди аккаунтом ChatGPT: `codex login`.",
  gemini: "Установи Gemini CLI (`npm i -g @google/gemini-cli`), запусти `gemini` и выбери «Sign in with Google». Бесплатно с дневным лимитом.",
};

const API_PRESETS = [
  { name: "OpenRouter", url: "https://openrouter.ai/api/v1", model: "qwen/qwen3.8-flash" },
  { name: "Gemini API", url: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.8-flash" },
  { name: "Qwen (DashScope)", url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", model: "qwen-flash" },
  { name: "Ollama (локально)", url: "http://localhost:11434/v1", model: "qwen3:8b" },
];

function ProviderSettings({ settings }: { settings: Settings }) {
  const [detected, setDetected] = useState<Detected | null>(null);
  useEffect(() => {
    invoke<Detected>("detect").then(setDetected);
  }, []);
  const p = settings.provider;
  const setModel = (m: string) => setSetting("models", { ...settings.models, [p]: m });

  return (
    <div className="providers">
      <div className="segmented">
        {PROVIDERS.map((x) => (
          <button key={x.id} className={x.id === p ? "on" : ""} onClick={() => setSetting("provider", x.id)}>
            {x.title}
            {x.id !== "api" && detected?.[x.id] && <span className="ok">●</span>}
          </button>
        ))}
      </div>
      {p !== "api" ? (
        <>
          <p className={detected?.[p] ? "status ok" : "status bad"}>
            {detected === null ? "Проверяю…" : detected[p] ? `Найден: ${detected[p]}` : "Не установлен"}
          </p>
          <p className="muted">{HOW_TO[p]}</p>
          <label className="field">
            Модель (пусто — по умолчанию)
            <input value={settings.models[p]} onChange={(e) => setModel(e.target.value)} />
          </label>
        </>
      ) : (
        <ApiSettings settings={settings} ollama={detected?.ollama ?? false} setModel={setModel} />
      )}
    </div>
  );
}

function ApiSettings({ settings, ollama, setModel }: { settings: Settings; ollama: boolean; setModel: (m: string) => void }) {
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const refresh = async () => {
    const name = await invoke<string>("api_key_name", { baseUrl: settings.apiBaseUrl });
    setHasKey(await invoke<boolean>("has_secret", { name }));
  };
  useEffect(() => void refresh(), [settings.apiBaseUrl]);
  const saveKey = async () => {
    const name = await invoke<string>("api_key_name", { baseUrl: settings.apiBaseUrl });
    await invoke("set_secret", { name, value: key.trim() });
    setKey("");
    refresh();
  };
  return (
    <>
      <div className="presets">
        {API_PRESETS.map((x) => (
          <button key={x.name} onClick={() => { setSetting("apiBaseUrl", x.url); setModel(x.model); }}>
            {x.name}
          </button>
        ))}
      </div>
      {ollama && <p className="status ok">Ollama запущена на этом компьютере</p>}
      <label className="field">
        Адрес API
        <input value={settings.apiBaseUrl} onChange={(e) => setSetting("apiBaseUrl", e.target.value)} />
      </label>
      <label className="field">
        Модель
        <input value={settings.models.api} onChange={(e) => setModel(e.target.value)} />
      </label>
      <label className="field">
        API-ключ {hasKey ? "· сохранён в связке ключей" : "· не задан"}
        <div className="row">
          <input type="password" value={key} placeholder={hasKey ? "••••••••" : "вставь ключ"} onChange={(e) => setKey(e.target.value)} />
          <button onClick={saveKey}>{key ? "Сохранить" : "Удалить"}</button>
        </div>
      </label>
    </>
  );
}

// ───────────────────────────── hotkey ─────────────────────────────

function HotkeyRecorder({ value }: { value: string }) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!recording) return;
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") return setRecording(false);
      const acc = toAccelerator(e);
      if (!acc) return;
      setRecording(false);
      try {
        await invoke("set_hotkey", { accelerator: acc });
        await setSetting("hotkey", acc);
        setError("");
      } catch (err) {
        setError(String(err));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording]);
  return (
    <div className="hotkey">
      <kbd className={recording ? "rec" : ""}>{recording ? "Нажми сочетание…" : prettyHotkey(value)}</kbd>
      <button onClick={() => setRecording(!recording)}>{recording ? "Отмена" : "Изменить"}</button>
      {error && <p className="status bad">{error}</p>}
    </div>
  );
}
