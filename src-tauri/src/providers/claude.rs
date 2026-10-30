use super::cli::CliProvider;
use super::{AskRequest, Event, ParseState};
use crate::shellenv;
use serde_json::Value;

pub struct Claude;

impl CliProvider for Claude {
    fn executable(&self) -> Option<String> {
        shellenv::find("claude", &[])
    }

    fn missing_hint(&self) -> String {
        "Claude Code не найден. Установи: https://claude.com/claude-code".into()
    }

    fn arguments(&self, req: &AskRequest, session_id: Option<&str>) -> Vec<String> {
        let mut args: Vec<String> = [
            "-p", &req.prompt, "--output-format", "stream-json", "--verbose", "--include-partial-messages",
            "--tools", "WebSearch,WebFetch", "--allowedTools", "WebSearch,WebFetch", "--strict-mcp-config",
            "--append-system-prompt", &req.system_prompt,
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        if let Some(model) = req.model.as_deref().filter(|m| !m.is_empty()) {
            args.extend(["--model".into(), model.into()]);
        }
        if let Some(id) = session_id {
            args.extend(["--resume".into(), id.into()]);
        }
        args
    }

    fn parse(&self, obj: &Value, state: &mut ParseState) -> Vec<Event> {
        if let Some(id) = obj["session_id"].as_str() {
            state.session_id = Some(id.to_string());
        }
        match obj["type"].as_str() {
            Some("stream_event") => {
                let ev = &obj["event"];
                if ev["type"] == "content_block_start"
                    && ev["content_block"]["type"].as_str().is_some_and(|t| t.ends_with("tool_use"))
                {
                    return vec![Event::Tool { label: "ищу в интернете…".into() }];
                }
                if ev["delta"]["type"] == "text_delta" {
                    if let Some(text) = ev["delta"]["text"].as_str() {
                        return vec![Event::Text { text: text.into() }];
                    }
                }
                vec![]
            }
            Some("result") if obj["is_error"] == true => {
                vec![Event::Error { message: obj["result"].as_str().unwrap_or("ошибка").into() }]
            }
            _ => vec![],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn streams_text_and_remembers_session() {
        let mut st = ParseState::default();
        let lines = [
            json!({"type":"system","subtype":"init","session_id":"abc"}),
            json!({"type":"stream_event","session_id":"abc","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Пари"}}}),
            json!({"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"ж"}}}),
            json!({"type":"result","subtype":"success","is_error":false,"session_id":"abc"}),
        ];
        let out: Vec<_> = lines.iter().flat_map(|l| Claude.parse(l, &mut st)).collect();
        assert_eq!(out, vec![Event::Text { text: "Пари".into() }, Event::Text { text: "ж".into() }]);
        assert_eq!(st.session_id.as_deref(), Some("abc"));
    }

    #[test]
    fn reports_tool_use_and_errors() {
        let mut st = ParseState::default();
        let tool = json!({"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"server_tool_use"}}});
        assert!(matches!(Claude.parse(&tool, &mut st)[0], Event::Tool { .. }));
        let err = json!({"type":"result","is_error":true,"result":"Credit balance is too low"});
        assert_eq!(Claude.parse(&err, &mut st), vec![Event::Error { message: "Credit balance is too low".into() }]);
    }

    #[test]
    fn resume_flag_only_with_session() {
        let req = AskRequest {
            provider: super::super::ProviderKind::Claude,
            prompt: "hi".into(),
            conversation: "c".into(),
            model: Some("sonnet".into()),
            system_prompt: "sp".into(),
            api_base_url: None,
        };
        assert!(!Claude.arguments(&req, None).contains(&"--resume".to_string()));
        let args = Claude.arguments(&req, Some("s1"));
        assert_eq!(&args[args.len() - 2..], ["--resume", "s1"]);
    }
}
