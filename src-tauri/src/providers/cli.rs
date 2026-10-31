use super::{AskRequest, Event, ParseState, Session};
use crate::shellenv;
use serde_json::Value;
use std::path::Path;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::Command;

pub trait CliProvider: Sync {
    fn executable(&self) -> Option<String>;
    fn missing_hint(&self) -> String;
    fn arguments(&self, req: &AskRequest, session_id: Option<&str>) -> Vec<String>;
    /// Turn one JSON line into events; may record the session id in `state`.
    fn parse(&self, obj: &Value, state: &mut ParseState) -> Vec<Event>;
    /// Turn stderr of a failed run into something a human can act on.
    fn friendly_error(&self, stderr: &str) -> String {
        stderr.to_string()
    }
}

/// Run one turn of a CLI provider, streaming events; returns the updated session.
pub async fn run(
    provider: &dyn CliProvider,
    req: &AskRequest,
    mut session: Session,
    workdir: &Path,
    send: &(dyn Fn(Event) + Sync),
) -> Session {
    let Some(exe) = provider.executable() else {
        send(Event::Error { message: provider.missing_hint() });
        return session;
    };
    let mut child = match Command::new(&exe)
        .args(provider.arguments(req, session.session_id.as_deref()))
        .current_dir(workdir)
        .env("PATH", shellenv::path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            send(Event::Error { message: format!("не удалось запустить {exe}: {e}") });
            return session;
        }
    };

    let mut stderr = child.stderr.take().expect("piped stderr");
    let err_task = tokio::spawn(async move {
        let mut buf = String::new();
        let _ = stderr.read_to_string(&mut buf).await;
        buf
    });

    let mut state = ParseState { session_id: session.session_id.clone(), ..Default::default() };
    let mut saw_text = false;
    // Raw lines (not `lines()`): one non-UTF-8 line must not stop reading and leave the pipe full.
    let mut stdout = BufReader::new(child.stdout.take().expect("piped stdout"));
    let mut raw = Vec::new();
    loop {
        raw.clear();
        match stdout.read_until(b'\n', &mut raw).await {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let Ok(obj) = serde_json::from_slice::<Value>(&raw) else { continue };
        for ev in provider.parse(&obj, &mut state) {
            let stop = ev == Event::Done;
            if matches!(ev, Event::Text { .. }) {
                saw_text = true;
            }
            if !stop {
                send(ev);
            } else {
                session.session_id = state.session_id;
                return session; // provider asked to stop early (e.g. auth failure); child is killed on drop
            }
        }
    }

    let status = child.wait().await;
    let err_text = err_task.await.unwrap_or_default();
    if !saw_text && status.map(|s| !s.success()).unwrap_or(true) {
        let tail: String = {
            let t = err_text.trim();
            let start = t.char_indices().rev().nth(399).map(|(i, _)| i).unwrap_or(0);
            t[start..].to_string()
        };
        let message = if tail.is_empty() {
            "процесс завершился с ошибкой".to_string()
        } else {
            provider.friendly_error(&tail)
        };
        send(Event::Error { message });
    }
    session.session_id = state.session_id;
    session
}
