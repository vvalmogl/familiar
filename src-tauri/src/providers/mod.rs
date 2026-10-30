//! AI providers. CLI-backed ones (Claude Code, Codex, Gemini CLI) stream JSON lines from a child
//! process; the HTTP one talks to any OpenAI-compatible endpoint. Every request ends with `Done`.

mod claude;
mod cli;
mod codex;
mod gemini;
mod openai;

pub use openai::key_name as api_key_name;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Event {
    Text { text: String },
    Tool { label: String },
    Error { message: String },
    Done,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ProviderKind {
    Claude,
    Codex,
    Gemini,
    Api,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskRequest {
    pub provider: ProviderKind,
    pub prompt: String,
    /// Identifies the chat; a new id starts a fresh conversation.
    pub conversation: String,
    pub model: Option<String>,
    pub system_prompt: String,
    pub api_base_url: Option<String>,
}

/// What a provider remembers between turns of one conversation.
#[derive(Debug, Default, Clone)]
pub struct Session {
    pub session_id: Option<String>,
    pub history: Vec<(String, String)>, // (role, content) for the HTTP provider
}

/// Per-request parser state for CLI providers.
#[derive(Debug, Default)]
pub struct ParseState {
    pub session_id: Option<String>,
    pub seen: HashMap<String, usize>,
    pub auth_reported: bool,
}

#[derive(Default)]
pub struct Providers {
    sessions: Mutex<HashMap<(String, ProviderKind), Session>>,
    current: Mutex<Option<tokio::task::AbortHandle>>,
}

impl Providers {
    fn session(&self, req: &AskRequest) -> Session {
        let key = (req.conversation.clone(), req.provider);
        self.sessions.lock().unwrap().get(&key).cloned().unwrap_or_default()
    }

    fn store(&self, req: &AskRequest, session: Session) {
        let key = (req.conversation.clone(), req.provider);
        self.sessions.lock().unwrap().insert(key, session);
    }

    fn cancel(&self) {
        if let Some(handle) = self.current.lock().unwrap().take() {
            handle.abort();
        }
    }
}

#[tauri::command]
pub async fn ask(app: AppHandle, req: AskRequest, on_event: Channel<Event>) -> Result<(), String> {
    let state = app.state::<Providers>();
    state.cancel();
    let session = state.session(&req);
    let workdir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("chat");
    let _ = std::fs::create_dir_all(&workdir);

    let app2 = app.clone();
    let task = tokio::spawn(async move {
        let send = |ev: Event| {
            let _ = on_event.send(ev);
        };
        let updated = match req.provider {
            ProviderKind::Claude => cli::run(&claude::Claude, &req, session, &workdir, &send).await,
            ProviderKind::Codex => cli::run(&codex::Codex, &req, session, &workdir, &send).await,
            ProviderKind::Gemini => cli::run(&gemini::Gemini, &req, session, &workdir, &send).await,
            ProviderKind::Api => openai::run(&req, session, &send).await,
        };
        app2.state::<Providers>().store(&req, updated);
        send(Event::Done);
    });
    *state.current.lock().unwrap() = Some(task.abort_handle());
    Ok(())
}

#[tauri::command]
pub fn cancel(state: State<'_, Providers>) {
    state.cancel();
}

/// Forget a conversation (all providers).
#[tauri::command]
pub fn reset(state: State<'_, Providers>, conversation: String) {
    state.cancel();
    state.sessions.lock().unwrap().retain(|(c, _), _| *c != conversation);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detected {
    claude: Option<String>,
    codex: Option<String>,
    gemini: Option<String>,
    ollama: bool,
}

/// Which providers are available on this machine.
#[tauri::command]
pub async fn detect() -> Detected {
    let ollama = reqwest::Client::new()
        .get("http://localhost:11434/api/version")
        .timeout(std::time::Duration::from_millis(800))
        .send()
        .await
        .is_ok();
    Detected {
        claude: cli::CliProvider::executable(&claude::Claude),
        codex: cli::CliProvider::executable(&codex::Codex),
        gemini: cli::CliProvider::executable(&gemini::Gemini),
        ollama,
    }
}
