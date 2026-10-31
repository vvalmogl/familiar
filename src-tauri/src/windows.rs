//! The three windows: `bar` (prompt), `character` (companion), `main` (onboarding / settings).

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

const BAR_WIDTH: f64 = 680.0;
pub const DEFAULT_HOTKEY: &str = "Alt+Space";

/// A background (accessory) app must explicitly take focus, or keystrokes keep going to the
/// previously active app.
fn activate_app() {
    #[cfg(target_os = "macos")]
    if let Some(mtm) = objc2_foundation::MainThreadMarker::new() {
        #[allow(deprecated)]
        objc2_app_kit::NSApplication::sharedApplication(mtm).activateIgnoringOtherApps(true);
    }
}

pub fn toggle_bar(app: &AppHandle) {
    let visible = app.get_webview_window("bar").and_then(|w| w.is_visible().ok()).unwrap_or(false);
    if visible { hide(app) } else { show(app) }
}

fn show(app: &AppHandle) {
    let Some(bar) = app.get_webview_window("bar") else { return };
    #[cfg(target_os = "macos")]
    let _ = app.show(); // undo a previous app.hide()

    // Center horizontally on the monitor under the cursor, in the upper part of the screen.
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|c| app.monitor_from_point(c.x, c.y).ok().flatten())
        .or_else(|| bar.primary_monitor().ok().flatten());
    if let Some(m) = monitor {
        let scale = m.scale_factor();
        let (pos, size) = (m.position(), m.size());
        let x = pos.x as f64 + (size.width as f64 - BAR_WIDTH * scale) / 2.0;
        let y = pos.y as f64 + (size.height as f64 * 0.2).max(260.0 * scale);
        let _ = bar.set_position(PhysicalPosition::new(x, y));
    }
    let _ = bar.show();
    activate_app();
    let _ = bar.set_focus();
    let _ = app.emit_to("bar", "bar:shown", ());
    let _ = app.emit_to("character", "character:show", ());
}

fn hide_overlay(app: &AppHandle) {
    if let Some(bar) = app.get_webview_window("bar") {
        let _ = bar.hide();
    }
    let _ = app.emit_to("character", "character:hide", ());
}

fn hide(app: &AppHandle) {
    hide_overlay(app);
    // Hand focus back to the previous app, unless the main window is open.
    #[cfg(target_os = "macos")]
    {
        let main_open = app.get_webview_window("main").and_then(|w| w.is_visible().ok()).unwrap_or(false);
        if !main_open {
            let _ = app.hide();
        }
    }
}

/// Show the companion without taking keyboard focus away from the bar.
#[tauri::command]
pub fn show_character(app: AppHandle) {
    let Some(win) = app.get_webview_window("character") else { return };
    #[cfg(target_os = "macos")]
    if let Ok(ptr) = win.ns_window() {
        // SAFETY: Tauri hands out the live NSWindow of this webview window; we're on the main thread.
        unsafe { (*(ptr as *const objc2_app_kit::NSWindow)).orderFrontRegardless() };
        return;
    }
    let _ = win.show();
    if let Some(bar) = app.get_webview_window("bar") {
        let _ = bar.set_focus();
    }
}

#[tauri::command]
pub fn hide_bar(app: AppHandle) {
    // Ignore stray blur events from the bar while it is already hidden (e.g. at startup).
    let visible = app.get_webview_window("bar").and_then(|w| w.is_visible().ok()).unwrap_or(false);
    if visible {
        hide(&app);
    }
}

#[tauri::command]
pub fn open_main(app: AppHandle, section: Option<String>) {
    hide_overlay(&app);
    if let Some(main) = app.get_webview_window("main") {
        #[cfg(target_os = "macos")]
        let _ = app.show();
        let _ = main.show();
        activate_app();
        let _ = main.set_focus();
        if let Some(section) = section {
            let _ = app.emit_to("main", "main:navigate", section);
        }
    }
}

/// Route `familiar://…` links: sign-in callbacks go to the main window.
pub fn handle_deep_link(app: &AppHandle, url: &str) {
    if url.starts_with("familiar://auth-callback") {
        // Kept until the page takes it: on a cold start the event fires before any listener exists.
        *app.state::<PendingAuth>().0.lock().unwrap() = Some(url.to_string());
        open_main(app.clone(), Some("account".into()));
        let _ = app.emit_to("main", "auth:callback", ());
    }
}

#[derive(Default)]
pub struct PendingAuth(std::sync::Mutex<Option<String>>);

/// The last sign-in link the browser opened, handed out once.
#[tauri::command]
pub fn take_auth_callback(state: tauri::State<'_, PendingAuth>) -> Option<String> {
    state.0.lock().unwrap().take()
}

/// Replace the global hotkey. Fails (and keeps the old one) if the combo is invalid or taken.
#[tauri::command]
pub fn set_hotkey(app: AppHandle, accelerator: String) -> Result<(), String> {
    let new: Shortcut = accelerator.parse().map_err(|e| format!("неверное сочетание: {e}"))?;
    let gs = app.global_shortcut();
    let state = app.state::<HotkeyState>();
    let mut state = state.0.lock().unwrap();
    let _ = gs.unregister_all();
    if gs.register(new).is_err() {
        // Keep the previous combo working, if there was one.
        if let Some(prev) = state.current.as_deref().and_then(|p| p.parse::<Shortcut>().ok()) {
            let _ = gs.register(prev);
        }
        let error = format!("{} уже занято другой программой (например, Raycast, Alfred или Spotlight). Выбери другое сочетание.", accelerator);
        if state.current.is_none() {
            state.error = Some(error.clone());
        }
        return Err(error);
    }
    state.current = Some(accelerator);
    state.error = None;
    Ok(())
}

/// The global hotkey that is actually registered, and why the saved one failed (if it did).
#[derive(Default)]
pub struct HotkeyState(std::sync::Mutex<HotkeyInfo>);

#[derive(Default, Clone, serde::Serialize)]
pub struct HotkeyInfo {
    current: Option<String>,
    error: Option<String>,
}

#[tauri::command]
pub fn hotkey_status(state: tauri::State<'_, HotkeyState>) -> HotkeyInfo {
    state.0.lock().unwrap().clone()
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Открыть строку", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Настройки…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &settings, &PredefinedMenuItem::separator(app)?, &quit])?;
    TrayIconBuilder::with_id("tray")
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("Familiar")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show(app),
            "settings" => open_main(app.clone(), Some("settings".into())),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}
