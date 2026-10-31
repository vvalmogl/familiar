//! Any OpenAI-compatible chat API: OpenRouter, DashScope (Qwen), Gemini API, Ollama, …

use super::{AskRequest, Event, Session};
use crate::secrets;
use futures_util::StreamExt;
use serde_json::{json, Value};

/// Keychain entry name for a base URL's API key (one key per host).
pub fn key_name(base_url: &str) -> String {
    let host = base_url
        .split("://")
        .nth(1)
        .unwrap_or(base_url)
        .split('/')
        .next()
        .unwrap_or("");
    format!("api:{host}")
}

pub async fn run(req: &AskRequest, mut session: Session, send: &(dyn Fn(Event) + Sync)) -> Session {
    let base = req.api_base_url.as_deref().unwrap_or("").trim().trim_end_matches('/').to_string();
    if base.is_empty() {
        send(Event::Error { message: "Не задан адрес API в настройках".into() });
        return session;
    }
    if session.history.is_empty() {
        session.history.push(("system".into(), req.system_prompt.clone()));
    }
    session.history.push(("user".into(), req.prompt.clone()));
    let messages: Vec<Value> = session
        .history
        .iter()
        .map(|(role, content)| json!({ "role": role, "content": content }))
        .collect();

    let mut request = reqwest::Client::new()
        .post(format!("{base}/chat/completions"))
        .header("X-Title", "Familiar")
        .json(&json!({ "model": req.model.clone().unwrap_or_default(), "messages": messages, "stream": true }));
    if let Some(key) = secrets::get(&key_name(&base)) {
        request = request.bearer_auth(key);
    }

    let response = match request.send().await {
        Ok(r) => r,
        Err(e) => {
            send(Event::Error { message: e.to_string() });
            return session;
        }
    };
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        send(Event::Error { message: format!("HTTP {status}: {}", error_message(&body)) });
        return session;
    }

    let mut answer = String::new();
    // Bytes, not String: a multi-byte letter may be split between two chunks.
    let mut buffer: Vec<u8> = Vec::new();
    let mut stream = response.bytes_stream();
    'outer: while let Some(chunk) = stream.next().await {
        let Ok(chunk) = chunk else { break };
        buffer.extend_from_slice(&chunk);
        while let Some(nl) = buffer.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buffer.drain(..=nl).collect();
            match parse_sse_line(String::from_utf8_lossy(&line).trim()) {
                SseLine::Done => break 'outer,
                SseLine::Text(t) => {
                    answer.push_str(&t);
                    send(Event::Text { text: t });
                }
                SseLine::Skip => {}
            }
        }
    }
    if !answer.is_empty() {
        session.history.push(("assistant".into(), answer));
    }
    session
}

#[derive(Debug, PartialEq)]
enum SseLine {
    Text(String),
    Done,
    Skip,
}

fn parse_sse_line(line: &str) -> SseLine {
    let Some(payload) = line.strip_prefix("data:") else { return SseLine::Skip };
    let payload = payload.trim();
    if payload == "[DONE]" {
        return SseLine::Done;
    }
    let Ok(obj) = serde_json::from_str::<Value>(payload) else { return SseLine::Skip };
    match obj["choices"][0]["delta"]["content"].as_str() {
        Some(t) if !t.is_empty() => SseLine::Text(t.into()),
        _ => SseLine::Skip,
    }
}

fn error_message(body: &str) -> String {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v["error"]["message"].as_str().map(String::from))
        .unwrap_or_else(|| body.chars().take(300).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sse_lines() {
        assert_eq!(
            parse_sse_line(r#"data: {"choices":[{"delta":{"content":"Hi"}}]}"#),
            SseLine::Text("Hi".into())
        );
        assert_eq!(parse_sse_line("data: [DONE]"), SseLine::Done);
        assert_eq!(parse_sse_line(": keep-alive"), SseLine::Skip);
        assert_eq!(parse_sse_line(r#"data: {"choices":[{"delta":{"role":"assistant"}}]}"#), SseLine::Skip);
    }

    #[test]
    fn key_name_is_per_host() {
        assert_eq!(key_name("https://openrouter.ai/api/v1"), "api:openrouter.ai");
        assert_eq!(key_name("http://localhost:11434/v1"), "api:localhost:11434");
    }

    #[test]
    fn extracts_api_error_message() {
        assert_eq!(error_message(r#"{"error":{"message":"Invalid key"}}"#), "Invalid key");
    }
}
