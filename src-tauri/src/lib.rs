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
        .plugin(tauri_plugin_deep_link::init())
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
        .manage(windows::PendingAuth::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            windows::setup_tray(app.handle())?;

            // On Windows and Linux showing the companion would activate it and steal focus from the
            // bar, whose blur handler then hides it again: the bar flickers instead of opening.
            // A non-focusable window still gets clicks. (macOS uses orderFrontRegardless instead.)
            #[cfg(not(target_os = "macos"))]
            if let Some(character) = tauri::Manager::get_webview_window(app, "character") {
                let _ = character.set_focusable(false);
            }

            // familiar://auth-callback?code=… returns from the browser after signing in.
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                #[cfg(any(windows, target_os = "linux"))]
                let _ = app.deep_link().register_all();
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        windows::handle_deep_link(&handle, url.as_str());
                    }
                });
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    for url in urls {
                        windows::handle_deep_link(app.handle(), url.as_str());
                    }
                }
            }

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
            windows::take_auth_callback,
            packs::allow_previews,
            packs::install_pack_from_url,
            setup::cli_status,
            setup::cli_install,
            setup::cli_login,
            setup::open_in_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
