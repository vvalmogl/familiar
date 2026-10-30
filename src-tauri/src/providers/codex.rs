use super::cli::CliProvider;
use super::{AskRequest, Event, ParseState};
use crate::shellenv;
use serde_json::Value;

pub struct Codex;

const AUTH_HINT: &str =
    "Не выполнен вход в ChatGPT. Настройки → ChatGPT → «Войти через аккаунт ChatGPT».";

impl CliProvider for Codex {
    fn executable(&self) -> Option<String> {
        shellenv::find("codex", &["/Applications/Codex.app/Contents/Resources/codex"])
    }

    fn missing_hint(&self) -> String {
        "Codex CLI не найден. Установи приложение Codex или `npm i -g @openai/codex`.".into()
    }

    fn arguments(&self, req: &AskRequest, session_id: Option<&str>) -> Vec<String> {
        let model: Vec<String> = match req.model.as_deref().filter(|m| !m.is_empty()) {
            Some(m) => vec!["-m".into(), m.into()],
            None => vec![],
        };
        let mut args: Vec<String> = vec!["exec".into()];
        match session_id {
            Some(id) => {
                args.extend(["resume", "--json", "--skip-git-repo-check"].map(String::from));
                args.extend(model);
                args.extend([id.to_string(), req.prompt.clone()]);
            }
            None => {
                args.extend(["--json", "--skip-git-repo-check", "-s", "read-only"].map(String::from));
                args.extend(model);
                // Codex has no system-prompt flag; the instructions ride along with the first turn.
                args.push(format!("{}\n\n{}", req.system_prompt, req.prompt));
            }
        }
        args
    }

    fn parse(&self, obj: &Value, state: &mut ParseState) -> Vec<Event> {
        let kind = obj["type"].as_str().unwrap_or("");
        match kind {
            "thread.started" => {
                state.session_id = obj["thread_id"].as_str().map(String::from);
                vec![]
            }
            "item.started" | "item.updated" | "item.completed" => {
                let item = &obj["item"];
                match item["type"].as_str() {
                    Some("agent_message") => {
                        let text = item["text"].as_str().unwrap_or("");
                        let id = item["id"].as_str().unwrap_or("").to_string();
                        let shown = state.seen.get(&id).copied().unwrap_or(0);
                        let total = text.chars().count();
                        state.seen.insert(id, total);
                        if total > shown {
                            vec![Event::Text { text: text.chars().skip(shown).collect() }]
                        } else {
                            vec![]
                        }
                    }
                    Some("web_search") if kind == "item.started" => {
                        vec![Event::Tool { label: "ищу в интернете…".into() }]
                    }
                    _ => vec![],
                }
            }
            "error" => friendly(obj["message"].as_str().unwrap_or("ошибка"), state),
            "turn.failed" => friendly(obj["error"]["message"].as_str().unwrap_or("ошибка"), state),
            _ => vec![],
        }
    }

    fn friendly_error(&self, stderr: &str) -> String {
        if is_auth(stderr) { AUTH_HINT.into() } else { stderr.into() }
    }
}

fn is_auth(msg: &str) -> bool {
    msg.contains("401") || msg.to_lowercase().contains("unauthorized") || msg.contains("Not logged in")
}

/// Codex retries a failed connection several times; show one human message and stop.
fn friendly(msg: &str, state: &mut ParseState) -> Vec<Event> {
    if is_auth(msg) {
        if state.auth_reported {
            return vec![];
        }
        state.auth_reported = true;
        return vec![Event::Error { message: AUTH_HINT.into() }, Event::Done];
    }
    if msg.starts_with("Reconnecting") {
        return vec![];
    }
    vec![Event::Error { message: msg.into() }]
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn streams_growing_agent_message_as_deltas() {
        let mut st = ParseState::default();
        let a = json!({"type":"thread.started","thread_id":"t1"});
        let b = json!({"type":"item.updated","item":{"id":"i0","type":"agent_message","text":"17 × 23"}});
        let c = json!({"type":"item.completed","item":{"id":"i0","type":"agent_message","text":"17 × 23 = 391"}});
        let out: Vec<_> = [a, b, c].iter().flat_map(|l| Codex.parse(l, &mut st)).collect();
        assert_eq!(out, vec![Event::Text { text: "17 × 23".into() }, Event::Text { text: " = 391".into() }]);
        assert_eq!(st.session_id.as_deref(), Some("t1"));
    }

    #[test]
    fn auth_errors_collapse_into_one_hint_and_stop() {
        let mut st = ParseState::default();
        let e = json!({"type":"error","message":"Reconnecting... 2/5 (unexpected status 401 Unauthorized: Missing bearer)"});
        assert_eq!(Codex.parse(&e, &mut st), vec![Event::Error { message: AUTH_HINT.into() }, Event::Done]);
        assert!(Codex.parse(&e, &mut st).is_empty());
        assert!(Codex.parse(&json!({"type":"error","message":"Reconnecting... 3/5 (timeout)"}), &mut st).is_empty());
    }
}
