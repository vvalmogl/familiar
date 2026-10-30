use super::cli::CliProvider;
use super::{AskRequest, Event, ParseState};
use crate::shellenv;
use serde_json::Value;

pub struct Gemini;

impl CliProvider for Gemini {
    fn executable(&self) -> Option<String> {
        shellenv::find("gemini", &[])
    }

    fn missing_hint(&self) -> String {
        "Gemini CLI не установлен. Настройки → Gemini → «Установить и войти».".into()
    }

    fn arguments(&self, req: &AskRequest, session_id: Option<&str>) -> Vec<String> {
        let prompt = match session_id {
            Some(_) => req.prompt.clone(),
            None => format!("{}\n\n{}", req.system_prompt, req.prompt),
        };
        let mut args = vec!["-p".to_string(), prompt, "--output-format".into(), "stream-json".into()];
        if let Some(model) = req.model.as_deref().filter(|m| !m.is_empty()) {
            args.extend(["-m".into(), model.into()]);
        }
        if let Some(id) = session_id {
            args.extend(["--resume".into(), id.into()]);
        }
        args
    }

    fn parse(&self, obj: &Value, state: &mut ParseState) -> Vec<Event> {
        match obj["type"].as_str() {
            Some("init") => {
                state.session_id = obj["session_id"].as_str().map(String::from);
                vec![]
            }
            Some("message") if obj["role"] == "assistant" => match obj["content"].as_str() {
                Some(c) => vec![Event::Text { text: c.into() }],
                None => vec![],
            },
            Some("tool_use") => vec![Event::Tool { label: "использую инструмент…".into() }],
            Some("error") => vec![Event::Error { message: self.friendly_error(obj["message"].as_str().unwrap_or("ошибка")) }],
            Some("result") if obj["status"] == "error" => {
                vec![Event::Error { message: self.friendly_error(obj["error"]["message"].as_str().unwrap_or("ошибка")) }]
            }
            _ => vec![],
        }
    }

    fn friendly_error(&self, stderr: &str) -> String {
        let lower = stderr.to_lowercase();
        if stderr.contains("Auth method") || lower.contains("login") {
            "Не выполнен вход в Google. Настройки → Gemini → «Войти через Google».".into()
        } else if lower.contains("location is not supported") || lower.contains("not available in your country") {
            "Gemini недоступен в этой стране. Включи VPN и спроси ещё раз.".into()
        } else {
            stderr.into()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn streams_assistant_deltas_and_session() {
        let mut st = ParseState::default();
        let lines = [
            json!({"type":"init","session_id":"g1","model":"gemini-3.8-flash"}),
            json!({"type":"message","role":"user","content":"привет"}),
            json!({"type":"message","role":"assistant","content":"Мяу! ","delta":true}),
            json!({"type":"result","status":"success"}),
        ];
        let out: Vec<_> = lines.iter().flat_map(|l| Gemini.parse(l, &mut st)).collect();
        assert_eq!(out, vec![Event::Text { text: "Мяу! ".into() }]);
        assert_eq!(st.session_id.as_deref(), Some("g1"));
    }

    #[test]
    fn maps_known_failures_to_hints() {
        let auth = Gemini.friendly_error("Please set an Auth method in your /x/.gemini/settings.json");
        assert!(auth.contains("Войти через Google"));
        let geo = Gemini.friendly_error("User location is not supported for the API use.");
        assert!(geo.contains("VPN"));
    }
}
