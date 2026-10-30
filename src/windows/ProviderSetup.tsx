import { Channel, invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import type { ProviderKind } from "../lib/settings";

type CliKind = Exclude<ProviderKind, "api">;

interface CliStatus {
  installed: string | null;
  loggedIn: boolean | null;
}

const ABOUT: Record<CliKind, { account: string; note: string }> = {
  claude: { account: "аккаунт Claude", note: "Нужна подписка Claude Pro/Max или ключ Anthropic." },
  codex: { account: "аккаунт ChatGPT", note: "Работает с аккаунтом ChatGPT, лимиты зависят от тарифа." },
  gemini: { account: "аккаунт Google", note: "Бесплатно с дневным лимитом; с Google AI Pro лимиты больше. В некоторых странах нужен VPN." },
};

const URL_RE = /https?:\/\/[^\s"'<>]+/;

/** Install and sign in to a CLI-based AI right from the app, with a live log. */
export default function ProviderSetup({ kind }: { kind: CliKind }) {
  const [status, setStatus] = useState<CliStatus | null>(null);
  const [busy, setBusy] = useState<"install" | "login" | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    setStatus(null);
    invoke<CliStatus>("cli_status", { kind }).then(setStatus);
  }, [kind]);
  useEffect(() => {
    refresh();
    setLog([]);
    setLink(null);
    setError("");
  }, [refresh]);

  const run = async (action: "install" | "login") => {
    setBusy(action);
    setLog([]);
    setLink(null);
    setError("");
    const channel = new Channel<string>();
    channel.onmessage = (line) => {
      if (!line.trim()) return;
      const url = line.match(URL_RE)?.[0];
      if (url && action === "login") setLink(url);
      setLog((l) => [...l.slice(-7), line]);
    };
    try {
      await invoke(action === "install" ? "cli_install" : "cli_login", { kind, onLine: channel });
      if (action === "install") {
        // Straight on to signing in.
        const s = await invoke<CliStatus>("cli_status", { kind });
        setStatus(s);
        if (s.installed && s.loggedIn === false) return run("login");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const terminal = (action: "install" | "login") =>
    invoke("open_in_terminal", { kind, action }).catch((e) => setError(String(e)));

  const state = !status ? "check" : !status.installed ? "missing" : status.loggedIn === false ? "login" : "ready";
  const label = { check: "Проверяю…", missing: "Не установлен", login: "Нужно войти", ready: "Готов к работе" }[state];

  return (
    <div className="setup">
      <p className={`status ${state === "ready" ? "ok" : state === "check" ? "" : "bad"}`}>
        {state === "ready" ? "● " : "○ "}
        {label}
        {status?.installed && <span className="muted"> · {status.installed}</span>}
      </p>
      <p className="muted">{ABOUT[kind].note}</p>

      <div className="presets">
        {state === "missing" && (
          <button className="primary" disabled={!!busy} onClick={() => run("install")}>
            {busy === "install" ? "Устанавливаю…" : "Установить и войти"}
          </button>
        )}
        {(state === "login" || state === "ready") && (
          <button className={state === "login" ? "primary" : ""} disabled={!!busy} onClick={() => run("login")}>
            {busy === "login" ? "Жду вход в браузере…" : state === "ready" ? "Войти заново" : `Войти через ${ABOUT[kind].account}`}
          </button>
        )}
        {state !== "check" && !busy && (
          <button onClick={() => terminal(state === "missing" ? "install" : "login")}>Открыть в терминале</button>
        )}
      </div>

      {link && (
        <p className="muted">
          Браузер не открылся?{" "}
          <a href={link} onClick={(e) => (e.preventDefault(), openUrl(link))}>Открыть страницу входа</a>
        </p>
      )}
      {log.length > 0 && <pre className="log">{log.join("\n")}</pre>}
      {error && <p className="status bad">{error}</p>}
    </div>
  );
}
