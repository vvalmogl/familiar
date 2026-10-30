mod packs;
mod providers;
mod secrets;
mod setup;
mod shellenv;
mod windows;

use tauri::WindowEvent;
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_store::StoreExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // A second launch (e.g. `familiar --toggle` bound to a system shortcut on Wayland) talks to this one.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|a| a == "--toggle") {
                windows::toggle_bar(app);
            } else {
                windows::open_main(app.clone(), None);
            }
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        windows::toggle_bar(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .manage(providers::Providers::default())
        .manage(windows::HotkeyState::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            windows::setup_tray(app.handle())?;

            let store = app.store("settings.json")?;
            let hotkey = store
                .get("hotkey")
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_else(|| windows::DEFAULT_HOTKEY.into());
            let hotkey_ok = windows::set_hotkey(app.handle().clone(), hotkey).is_ok();

            let onboarded = store.get("onboarded").and_then(|v| v.as_bool()).unwrap_or(false);
            if !onboarded {
                windows::open_main(app.handle().clone(), Some("onboarding".into()));
            } else if !hotkey_ok {
                // Without a hotkey the bar is unreachable: say so and let the user pick another combo.
                windows::open_main(app.handle().clone(), Some("hotkey".into()));
            }
            if std::env::args().any(|a| a == "--toggle") {
                windows::toggle_bar(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the main window only hides it; the app lives in the tray.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            packs::list_packs,
            packs::import_gifs,
            packs::import_pack,
            packs::delete_pack,
            providers::ask,
            providers::cancel,
            providers::reset,
            providers::detect,
            secrets::set_secret,
            secrets::has_secret,
            secrets::api_key_name,
            windows::hide_bar,
            windows::show_character,
            windows::open_main,
            windows::set_hotkey,
            windows::hotkey_status,
            packs::allow_previews,
            setup::cli_status,
            setup::cli_install,
            setup::cli_login,
            setup::open_in_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
