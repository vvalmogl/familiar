//! Finding user-installed CLIs. GUI apps don't inherit the shell PATH (nvm, npm, brew…),
//! so on Unix we ask the user's login shell once.

use once_cell::sync::Lazy;
use std::path::PathBuf;

pub fn home() -> PathBuf {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from).unwrap_or_default()
}

/// PATH as the user's login shell sets it. Gives up after a few seconds:
/// a slow or interactive .zshrc must not hang every provider call.
#[cfg(unix)]
fn login_shell_path() -> Option<String> {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut child = Command::new(shell)
        .args(["-lic", "echo __PATH__$PATH"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let deadline = Instant::now() + Duration::from_secs(5);
    while child.try_wait().ok()?.is_none() {
        if Instant::now() > deadline {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    let mut out = String::new();
    child.stdout.take()?.read_to_string(&mut out).ok()?;
    // Only trust output that carries our marker; rc files may print anything before it.
    out.rsplit_once("__PATH__").map(|(_, p)| p.trim().to_string())
}

static PATH: Lazy<String> = Lazy::new(|| {
    let sep = if cfg!(windows) { ";" } else { ":" };
    let mut parts: Vec<String> = Vec::new();

    #[cfg(unix)]
    {
        if let Some(p) = login_shell_path() {
            parts.push(p);
        }
        let h = home();
        for extra in [".local/familiar-node/bin", ".local/gemini-node/bin", ".local/bin", ".npm-global/bin"] {
            parts.push(h.join(extra).to_string_lossy().into());
        }
        parts.extend(["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].map(String::from));
    }
    #[cfg(windows)]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            parts.push(PathBuf::from(appdata).join("npm").to_string_lossy().into());
        }
        parts.push(home().join(".local").join("bin").to_string_lossy().into());
    }
    if let Ok(p) = std::env::var("PATH") {
        parts.push(p);
    }
    parts.retain(|p| !p.is_empty());
    parts.join(sep)
});

pub fn path() -> &'static str {
    &PATH
}

/// Full path of an executable on the resolved PATH (or one of `extra` absolute paths).
pub fn find(name: &str, extra: &[&str]) -> Option<String> {
    let names: Vec<String> = if cfg!(windows) {
        ["exe", "cmd", "bat"].iter().map(|e| format!("{name}.{e}")).collect()
    } else {
        vec![name.to_string()]
    };
    let sep = if cfg!(windows) { ';' } else { ':' };
    extra
        .iter()
        .map(PathBuf::from)
        .chain(path().split(sep).flat_map(|dir| names.iter().map(move |n| PathBuf::from(dir).join(n))))
        .find(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
}
