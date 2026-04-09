//! Weekly Review - Tauri Application
//!
//! This is the Rust side of the Tauri application.
//! The main logic lives in the React frontend and FastAPI backend.

use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
use rand::Rng;
use base64::{Engine as _, engine::general_purpose};

// Global state to hold the backend process handle
struct BackendProcess(Mutex<Option<CommandChild>>);

// Auth token passed to sidecar and exposed to frontend
struct AuthToken(String);

/// Generate a 32-byte cryptographically random token, URL-safe base64 encoded.
fn generate_auth_token() -> String {
    let bytes: [u8; 32] = rand::thread_rng().gen();
    general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// Tauri command: frontend retrieves the auth token to include in API requests.
#[tauri::command]
fn get_auth_token(state: tauri::State<AuthToken>) -> String {
    state.0.clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Generate auth token before building the app
    let token = generate_auth_token();
    #[cfg(not(debug_assertions))]
    let token_for_sidecar = token.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        // Updater disabled until signing keys are configured
        // .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(BackendProcess(Mutex::new(None)))
        .manage(AuthToken(token))
        .invoke_handler(tauri::generate_handler![
            get_auth_token,
        ])
        .setup(move |app| {
            // Start the FastAPI backend as a sidecar process
            #[cfg(not(debug_assertions))]
            {
                let sidecar = app.shell().sidecar("weekly-review-backend")
                    .expect("failed to create sidecar command")
                    .env("WEEKLY_REVIEW_AUTH_TOKEN", &token_for_sidecar);

                match sidecar.spawn() {
                    Ok((_rx, child)) => {
                        // Store the child process handle for cleanup
                        let backend_state = app.state::<BackendProcess>();
                        *backend_state.0.lock().unwrap() = Some(child);
                        println!("Backend sidecar started (auth token set)");
                    }
                    Err(e) => {
                        eprintln!("Failed to start backend sidecar: {}", e);
                        // In production, we might want to show an error dialog
                    }
                }
            }

            #[cfg(debug_assertions)]
            {
                // Debug builds must be explicitly opted into at build time.
                // option_env! is evaluated at compile time so the check is
                // baked into the binary — a debug build without this env var
                // set at cargo-build time cannot run. This prevents a debug
                // binary (devtools open, relaxed auth) from being shipped or
                // executed outside the dev environment.
                if option_env!("TAURI_ENV_DEBUG_BUILD") != Some("true") {
                    panic!(
                        "Refusing to run debug build outside dev environment. \
                         Set TAURI_ENV_DEBUG_BUILD=true at build time."
                    );
                }
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            // Create system tray
            let show_item = MenuItem::with_id(app, "show", "Show Weekly Review", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show_item, &settings_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Weekly Review")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "settings" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            // Emit event to navigate to settings
                            let _ = window.emit("navigate", "/settings");
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Keep app running when window is closed (minimize to tray)
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Cleanup backend process on app exit
            if let tauri::RunEvent::Exit = event {
                let backend_state = app_handle.state::<BackendProcess>();
                let mut guard = backend_state.0.lock().unwrap();
                if let Some(child) = guard.take() {
                    println!("Stopping backend sidecar...");
                    let _ = child.kill();
                }
                drop(guard);
            }
        });
}
