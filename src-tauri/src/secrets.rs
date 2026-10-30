//! API keys live in the OS keychain (Keychain / Credential Manager / Secret Service), never in settings files.

const SERVICE: &str = "app.familiar.desktop";

pub fn get(name: &str) -> Option<String> {
    keyring::Entry::new(SERVICE, name).ok()?.get_password().ok()
}

#[tauri::command]
pub fn set_secret(name: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, &name).map_err(|e| e.to_string())?;
    if value.is_empty() {
        let _ = entry.delete_credential();
        Ok(())
    } else {
        entry.set_password(&value).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn has_secret(name: String) -> bool {
    get(&name).is_some()
}

/// Keychain entry name for an OpenAI-compatible base URL.
#[tauri::command]
pub fn api_key_name(base_url: String) -> String {
    crate::providers::api_key_name(&base_url)
}
