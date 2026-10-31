import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { prettyHotkey, toAccelerator } from "../lib/hotkey";
import { DEFAULT_PROMPT, PROVIDERS, setSetting, updateSetting, useSettings, type Settings } from "../lib/settings";
import { applyTheme, THEMES, themeById } from "../lib/themes";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import AnimatedImage from "../packs/AnimatedImage";
import Spirit from "../packs/Spirit";
import { guessMood } from "../packs/moods";
import { notifyPacksChanged, usePacks } from "../packs/registry";
import { MOODS, type Mood, type Pack, type Rotation } from "../packs/types";
import ProviderSetup from "./ProviderSetup";
import { AccountSection, GallerySection, useAccount } from "./Account";

type View = "onboarding" | "settings";

export default function Main() {
  const settings = useSettings();
  const [view, setView] = useState<View>("settings");
  const [section, setSection] = useState<Section>("Нейросеть");
  // Sign-in callbacks and settings sync run whatever the window shows.
  const account = useAccount();

  useEffect(() => {
    const un = listen<string>("main:navigate", ({ payload }) => {
      if (payload === "onboarding" || payload === "settings") setView(payload);
      if (payload === "hotkey" || payload === "account") {
        setView("settings");
        setSection(payload === "hotkey" ? "Клавиши" : "Аккаунт");
      }
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
    <SettingsView settings={settings} section={section} setSection={setSection} account={account} />
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
    // A hotkey app is only useful if it is already running; it can be turned off in settings.
    await enableAutostart().catch(() => {});
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

const SECTIONS = ["Нейросеть", "Внешний вид", "Персонаж", "Галерея", "Клавиши", "Аккаунт", "О программе"] as const;
type Section = (typeof SECTIONS)[number];

function SettingsView({ settings, section, setSection, account }: {
  settings: Settings;
  section: Section;
  setSection: (s: Section) => void;
  account: ReturnType<typeof useAccount>;
}) {
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
            <AutostartToggle />
          </>
        )}
        {section === "Галерея" && <GallerySection />}
        {section === "Аккаунт" && <AccountSection account={account} />}
        {section === "О программе" && (
          <p className="muted">Familiar 0.1.0 · открытый код, лицензия Apache-2.0.</p>
        )}
      </main>
    </div>
  );
}

function AutostartToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    autostartEnabled().then(setOn, (e) => setError(String(e)));
  }, []);
  const toggle = async (next: boolean) => {
    setError("");
    try {
      await (next ? enableAutostart() : disableAutostart());
      setOn(await autostartEnabled());
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <>
      <label className="check">
        <input type="checkbox" checked={!!on} disabled={on === null} onChange={(e) => toggle(e.target.checked)} />
        Запускать вместе с системой
      </label>
      {error && <p className="status bad">{error}</p>}
    </>
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

const ROTATIONS: { id: Rotation; title: string }[] = [
  { id: "never", title: "Не менять" },
  { id: "show", title: "При каждом открытии" },
  { id: "jump", title: "При каждом прыжке" },
];

function PackPreview({ pack }: { pack: Pack }) {
  if (pack.kind === "svg") return <Spirit mood="idle" />;
  return pack.preview ? <AnimatedImage src={pack.preview} /> : null;
}

function CharacterSettings({ settings }: { settings: Settings }) {
  const packs = usePacks();
  const [importing, setImporting] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const pool = new Set([settings.packId, ...settings.packPool]);

  const choose = async (id: string) => {
    await setSetting("packId", id);
    await updateSetting("packPool", (p) => (p.includes(id) ? p : [...p, id]));
  };
  const togglePool = (id: string) =>
    updateSetting("packPool", (p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const pickGifs = async () => {
    const files = await openDialog({
      multiple: true,
      filters: [{ name: "Картинки и гифки", extensions: ["gif", "png", "webp", "jpg", "jpeg", "apng"] }],
    });
    if (files && files.length) setImporting(files);
  };
  const importPack = async (directory: boolean) => {
    const path = await openDialog(
      directory ? { directory: true } : { filters: [{ name: "Пак Familiar", extensions: ["fampack", "zip"] }] },
    );
    if (!path) return;
    try {
      const id = await invoke<string>("import_pack", { path });
      await notifyPacksChanged();
      choose(id);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  };
  const remove = async (p: Pack) => {
    if (!confirm(`Удалить пак «${p.name}»?`)) return;
    await invoke("delete_pack", { id: p.id });
    if (settings.packId === p.id) await setSetting("packId", "builtin.spirit");
    await updateSetting("packPool", (pool) => pool.filter((x) => x !== p.id));
    await notifyPacksChanged();
  };

  if (importing) {
    return (
      <ImportWizard
        files={importing}
        onCancel={() => setImporting(null)}
        onDone={(id) => {
          setImporting(null);
          choose(id);
        }}
      />
    );
  }

  return (
    <>
      <div className="packs">
        {packs.map((p) => (
          <div key={p.id} className={`pack ${p.id === settings.packId ? "on" : ""}`}>
            <button className="pack-preview" onClick={() => choose(p.id)} title="Сделать основным">
              <PackPreview pack={p} />
            </button>
            <div className="pack-meta">
              <b>{p.name}</b>
              {p.license && <span className="muted">{p.license}</span>}
            </div>
            <div className="pack-actions">
              <label className="check" title="Участвует в смене персонажей">
                <input type="checkbox" checked={pool.has(p.id)} disabled={p.id === settings.packId} onChange={() => togglePool(p.id)} />
                в наборе
              </label>
              {!p.builtin && p.kind === "images" && (
                <button className="icon" onClick={() => remove(p)} title="Удалить пак">🗑</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="presets">
        <button className="primary" onClick={pickGifs}>Импортировать гифки…</button>
        <button onClick={() => importPack(false)}>Пак из файла .fampack…</button>
        <button onClick={() => importPack(true)}>Пак из папки…</button>
      </div>
      {error && <p className="status bad">{error}</p>}
      <label className="field">
        Менять персонажа
        <select value={settings.packRotation} onChange={(e) => setSetting("packRotation", e.target.value as Rotation)}>
          {ROTATIONS.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
      </label>
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

/** Turn loose GIFs into a pack: name it and say which mood each image is for. */
function ImportWizard({ files, onCancel, onDone }: { files: string[]; onCancel: () => void; onDone: (id: string) => void }) {
  const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;
  const [name, setName] = useState("Мой персонаж");
  const [moods, setMoods] = useState<Mood[]>(() => files.map((f) => guessMood(fileName(f))));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState(false);
  useEffect(() => {
    invoke("allow_previews", { paths: files }).then(() => setPreviews(true)).catch(() => {});
  }, [files]);
  const save = async () => {
    setBusy(true);
    try {
      const id = await invoke<string>("import_gifs", {
        name,
        files: files.map((path, i) => ({ path, mood: moods[i] })),
      });
      await notifyPacksChanged();
      onDone(id);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };
  return (
    <div className="wizard">
      <label className="field">
        Название пака
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="muted">Для каждой картинки выбери, когда её показывать. Без «Обычного» первая картинка станет обычной.</p>
      <div className="wizard-files">
        {files.map((f, i) => (
          <div key={f} className="row">
            {previews && <img className="thumb" src={convertFileSrc(f)} alt="" />}
            <span className="file">{fileName(f)}</span>
            <select value={moods[i]} onChange={(e) => setMoods(moods.map((m, j) => (j === i ? (e.target.value as Mood) : m)))}>
              {MOODS.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>
        ))}
      </div>
      {error && <p className="status bad">{error}</p>}
      <div className="presets">
        <button onClick={onCancel}>Отмена</button>
        <button className="primary" disabled={busy || !name.trim()} onClick={save}>Создать пак</button>
      </div>
    </div>
  );
}

// ───────────────────────────── providers ─────────────────────────────

interface Detected {
  claude: string | null;
  codex: string | null;
  gemini: string | null;
  ollama: boolean;
}

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
          <ProviderSetup kind={p} />
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
    invoke<{ current: string | null; error: string | null }>("hotkey_status").then((s) => setError(s.error ?? ""));
  }, []);
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
