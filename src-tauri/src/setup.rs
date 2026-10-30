//! One-click install and sign-in for the CLI providers, right inside the app (no terminal).
//! A terminal is only a fallback, opened without Apple Events (a `.command` file on macOS).

use crate::providers::{cli_executable, ProviderKind};
use crate::shellenv;
use serde::Serialize;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// Where Familiar installs Node.js + npm CLIs for users who don't have Node.
pub fn node_prefix() -> PathBuf {
    shellenv::home().join(".local").join("familiar-node")
}

fn npm_package(kind: ProviderKind) -> Option<(&'static str, &'static str)> {
    match kind {
        ProviderKind::Codex => Some(("@openai/codex", "codex")),
        ProviderKind::Gemini => Some(("@google/gemini-cli", "gemini")),
        _ => None,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    installed: Option<String>,
    /// None when we can't tell.
    logged_in: Option<bool>,
}

#[tauri::command]
pub async fn cli_status(kind: ProviderKind) -> CliStatus {
    let Some(exe) = cli_executable(kind) else {
        return CliStatus { installed: None, logged_in: Some(false) };
    };
    let logged_in = match kind {
        ProviderKind::Claude => run_quiet(&exe, &["auth", "status", "--json"]).await.and_then(|(_, out)| {
            serde_json::from_str::<serde_json::Value>(&out).ok()?["loggedIn"].as_bool()
        }),
        ProviderKind::Codex => run_quiet(&exe, &["login", "status"]).await.map(|(ok, _)| ok),
        ProviderKind::Gemini => Some(
            shellenv::home().join(".gemini").join("oauth_creds.json").is_file()
                || std::env::var_os("GEMINI_API_KEY").is_some(),
        ),
        ProviderKind::Api => None,
    };
    CliStatus { installed: Some(exe), logged_in }
}

async fn run_quiet(exe: &str, args: &[&str]) -> Option<(bool, String)> {
    let out = tokio::time::timeout(
        Duration::from_secs(15),
        Command::new(exe).args(args).env("PATH", shellenv::path()).stdin(Stdio::null()).output(),
    )
    .await
    .ok()?
    .ok()?;
    Some((out.status.success(), String::from_utf8_lossy(&out.stdout).into_owned()))
}

/// The command (program + args) that installs a provider's CLI on this OS.
fn install_command(app: &AppHandle, kind: ProviderKind) -> Result<(String, Vec<String>), String> {
    if kind == ProviderKind::Claude {
        return Ok(if cfg!(windows) {
            ("powershell".into(), vec!["-NoProfile".into(), "-Command".into(), "irm https://claude.ai/install.ps1 | iex".into()])
        } else {
            ("/bin/sh".into(), vec!["-c".into(), "curl -fsSL https://claude.ai/install.sh | bash".into()])
        });
    }
    let (package, _) = npm_package(kind).ok_or("для этого ИИ установка не нужна")?;
    if cfg!(windows) {
        let npm = shellenv::find("npm", &[]).ok_or("Нужен Node.js: установи его с nodejs.org и нажми ещё раз.")?;
        return Ok((npm, vec!["install".into(), "-g".into(), package.into()]));
    }
    let script = app
        .path()
        .resolve("resources/install-node-cli.sh", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    Ok((
        "/bin/sh".into(),
        vec![script.to_string_lossy().into_owned(), package.into(), node_prefix().to_string_lossy().into_owned()],
    ))
}

fn login_command(kind: ProviderKind) -> Result<(String, Vec<String>), String> {
    let exe = cli_executable(kind).ok_or("сначала установи")?;
    Ok(match kind {
        ProviderKind::Claude => (exe, vec!["auth".into(), "login".into()]),
        ProviderKind::Codex => (exe, vec!["login".into()]),
        // Gemini has no login command: a first headless run with "Login with Google" selected
        // opens the browser and caches the credentials.
        ProviderKind::Gemini => (
            exe,
            ["-p", "Ответь одним словом: готово", "--output-format", "json", "--approval-mode", "plan"]
                .map(String::from)
                .to_vec(),
        ),
        ProviderKind::Api => return Err("для API вход не нужен".into()),
    })
}

/// Make Gemini CLI use "Login with Google" (security.auth.selectedType = oauth-personal).
fn select_google_login() -> Result<(), String> {
    let dir = shellenv::home().join(".gemini");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("settings.json");
    let mut settings: serde_json::Value = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    if settings["security"]["auth"]["selectedType"].is_string() {
        return Ok(()); // the user already chose something; don't override it
    }
    settings["security"]["auth"]["selectedType"] = "oauth-personal".into();
    std::fs::write(&path, serde_json::to_string_pretty(&settings).unwrap()).map_err(|e| e.to_string())
}

/// Run a setup command, streaming its output line by line; fails on a non-zero exit.
async fn stream(program: String, args: Vec<String>, cwd: PathBuf, on_line: Channel<String>, timeout: Duration) -> Result<(), String> {
    let mut child = Command::new(&program)
        .args(&args)
        .current_dir(cwd)
        .env("PATH", shellenv::path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("не удалось запустить {program}: {e}"))?;
    let a = tokio::spawn(pump(child.stdout.take().expect("piped"), on_line.clone()));
    let b = tokio::spawn(pump(child.stderr.take().expect("piped"), on_line.clone()));
    let status = tokio::time::timeout(timeout, child.wait())
        .await
        .map_err(|_| "время вышло — попробуй ещё раз".to_string())?
        .map_err(|e| e.to_string())?;
    let _ = tokio::join!(a, b);
    if status.success() { Ok(()) } else { Err(format!("завершилось с ошибкой (код {})", status.code().unwrap_or(-1))) }
}

async fn pump<R: tokio::io::AsyncRead + Unpin>(reader: R, ch: Channel<String>) {
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let _ = ch.send(strip_ansi(&line));
    }
}

/// Drop terminal color codes so the log reads cleanly in the app.
pub fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for c in chars.by_ref() {
                    if c.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else if c != '\r' {
            out.push(c);
        }
    }
    out
}

fn workdir(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir()).join("chat");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

#[tauri::command]
pub async fn cli_install(app: AppHandle, kind: ProviderKind, on_line: Channel<String>) -> Result<(), String> {
    let (program, args) = install_command(&app, kind)?;
    stream(program, args, workdir(&app), on_line, Duration::from_secs(600)).await
}

#[tauri::command]
pub async fn cli_login(app: AppHandle, kind: ProviderKind, on_line: Channel<String>) -> Result<(), String> {
    if kind == ProviderKind::Gemini {
        select_google_login()?;
    }
    let (program, args) = login_command(kind)?;
    stream(program, args, workdir(&app), on_line, Duration::from_secs(300)).await
}

/// Fallback: run install/login in a real terminal window.
#[tauri::command]
pub fn open_in_terminal(app: AppHandle, kind: ProviderKind, action: String) -> Result<(), String> {
    let (program, args) = match action.as_str() {
        "install" => install_command(&app, kind)?,
        "login" => {
            let exe = cli_executable(kind).ok_or("сначала установи")?;
            // Interactive sign-in: plain `gemini` asks how to log in; others have a login command.
            match kind {
                ProviderKind::Gemini => (exe, vec![]),
                _ => login_command(kind)?,
            }
        }
        _ => return Err("неизвестное действие".into()),
    };
    let line = std::iter::once(program).chain(args).map(|a| shell_quote(&a)).collect::<Vec<_>>().join(" ");

    #[cfg(target_os = "macos")]
    {
        // Opening a .command file runs it in Terminal without needing Automation permission.
        let file = std::env::temp_dir().join(format!("familiar-{action}.command"));
        std::fs::write(&file, format!("#!/bin/zsh\nexport PATH={}\n{line}\n", shell_quote(shellenv::path())))
            .map_err(|e| e.to_string())?;
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
        std::process::Command::new("open").arg(&file).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(windows)]
    std::process::Command::new("cmd").args(["/C", "start", "", "cmd", "/K", &line]).spawn().map_err(|e| e.to_string())?;
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let spawned = ["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"].iter().any(|term| {
            let args: Vec<&str> = if *term == "gnome-terminal" { vec!["--", "sh", "-c", &line] } else { vec!["-e", "sh", "-c", &line] };
            std::process::Command::new(term).args(args).spawn().is_ok()
        });
        if !spawned {
            return Err(format!("не нашёл терминал; выполни вручную: {line}"));
        }
    }
    Ok(())
}

fn shell_quote(s: &str) -> String {
    if cfg!(windows) {
        if s.contains(' ') { format!("\"{s}\"") } else { s.to_string() }
    } else {
        format!("'{}'", s.replace('\'', "'\\''"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_terminal_colors() {
        assert_eq!(strip_ansi("\u{1b}[1m\u{1b}[92mDone\u{1b}[0m 100%\r"), "Done 100%");
    }

    #[test]
    fn quotes_for_posix_shell() {
        assert_eq!(shell_quote("it's"), "'it'\\''s'");
    }
}
