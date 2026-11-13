//! CJC Tune: entry point.
//!
//! Starts the processor (`dsp`), the system audio routing (`routing`) and the
//! saved settings, hands them to the window (`commands`) and the tray
//! (`tray`), and makes sure the system's own routing comes back however the
//! app exits.

use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

mod commands;
mod dsp;
mod graphics;
mod i18n;
mod instance;
mod routing;
mod settings;
mod state;
mod tray;
mod update;

use commands::*;
use routing::Router;
use settings::SettingsStore;
use state::*;
use tray::*;

/// Exit cleanly on SIGTERM, SIGINT and SIGHUP (logout, Ctrl+C, `kill`), so the
/// virtual device is removed and the system's own output restored. A second
/// exit signal, or a shutdown that hangs, exits immediately.
///
/// SIGUSR2 restarts the audio service instead, the same as the tray item, so
/// it can be bound to a key: `pkill -USR2 cjc-tune`. Not SIGUSR1: WebKit's
/// JavaScriptCore installs its own SIGUSR1 handler (thread suspension) in
/// this process and takes it over.
fn handle_signals(handle: tauri::AppHandle) {
    use signal_hook::consts::{SIGHUP, SIGINT, SIGTERM, SIGUSR2};
    let mut signals = match signal_hook::iterator::Signals::new([SIGTERM, SIGINT, SIGHUP, SIGUSR2])
    {
        Ok(signals) => signals,
        Err(e) => {
            log::warn!("Could not install signal handlers: {e}");
            return;
        }
    };
    let spawned = std::thread::Builder::new()
        .name("cjctune-signals".into())
        .spawn(move || {
            let mut exiting = false;
            for signal in signals.forever() {
                if signal == SIGUSR2 {
                    if let Some(state) = handle.try_state::<AppState>() {
                        restart_audio(&state);
                    }
                    continue;
                }
                if exiting {
                    std::process::exit(1);
                }
                exiting = true;
                log::info!("Received signal {signal}; restoring audio routing and exiting");
                handle.exit(0);
                std::thread::spawn(|| {
                    std::thread::sleep(Duration::from_secs(5));
                    std::process::exit(1);
                });
            }
        });
    if let Err(e) = spawned {
        log::warn!("Could not start the signal handler: {e}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let instance = match instance::acquire() {
        instance::Instance::Primary(primary) => Arc::new(Mutex::new(Some(primary))),
        instance::Instance::Secondary => {
            println!("CJC Tune is already running; bringing its window to the front.");
            return;
        }
    };
    let instance_for_setup = Arc::clone(&instance);

    // Settings are read before Tauri starts: the rendering choice has to be
    // in the environment before WebKitGTK creates its first EGL display.
    let config_dir = graphics::config_dir(IDENTIFIER);
    if let (Some(dir), Some(old)) = (
        &config_dir,
        graphics::config_dir(settings::LEGACY_IDENTIFIER),
    ) {
        settings::adopt_legacy(&dir.join("settings.json"), &old.join("settings.json"));
    }
    let settings = Arc::new(SettingsStore::open(
        config_dir.as_ref().map(|dir| dir.join("settings.json")),
    ));
    let saved_ui = settings.get().unwrap_or_default().ui;
    let graphics = graphics::apply(saved_ui.render_mode, config_dir.as_deref());
    let autostarted = std::env::args().any(|a| a == AUTOSTART_ARG);

    let app = tauri::Builder::default()
        // Logs go to stdout and to the app's log directory
        // (~/.local/share/com.davicjc.cjctune/logs), so bug reports can include them.
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .max_file_size(512 * 1024)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_ARG]),
        ))
        .setup(move |app| {
            // Apply the saved state before any audio flows, so there is no
            // moment of wrong processing at launch.
            let saved = settings.get();
            let engine = Arc::new(Mutex::new(engine_from(saved.as_ref())));

            let handle = app.handle().clone();
            let store = Arc::clone(&settings);
            let audio = Router::start(
                Arc::clone(&engine),
                saved.and_then(|s| s.output_device),
                move |status| {
                    // A device picked in the system sound settings is followed
                    // and remembered just like one picked in CJC Tune.
                    if status.preferred.is_some() {
                        store.update(|s| s.output_device = status.preferred.clone());
                    }
                    let _ = handle.emit("audio-status", status);
                },
            );

            // Decided before logging existed; record it now for bug reports.
            log::info!(
                "Window rendering: {:?} ({:?})",
                graphics.renderer,
                graphics.reason
            );
            let powered = settings.get().map(|s| s.powered).unwrap_or(true);
            let language = i18n::resolve(&saved_ui.language);
            // libappindicator is loaded at run time and *panics* when the
            // library is missing (minimal installs, CI). That must cost the
            // tray icon, not the whole app.
            let built = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                build_tray(app.handle(), powered, language)
            }));
            let tray = match built {
                Ok(Ok(tray)) => Some(tray),
                Ok(Err(e)) => {
                    // Without a tray, hiding the window would strand the app.
                    log::warn!("No system tray available ({e}); closing the window will quit");
                    None
                }
                Err(_) => {
                    log::warn!("No tray library (libayatana-appindicator3) installed; closing the window will quit");
                    None
                }
            };
            // Only stay hidden when a tray host will actually show the icon;
            // otherwise the window would be unreachable.
            let start_hidden =
                autostarted && saved_ui.start_hidden && tray.is_some() && tray_host_visible();

            app.manage(AppState {
                engine,
                audio,
                settings,
                graphics,
                config_dir: config_dir.clone(),
                tray,
            });

            if !start_hidden {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                }
            }

            // A second launch brings this window forward instead of starting
            // a competing copy.
            let handle = app.handle().clone();
            if let Some(primary) = instance_for_setup
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .as_mut()
            {
                primary.serve(move || show_window(&handle));
            }

            handle_signals(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_eq_band,
            set_effect,
            apply_preset_state,
            set_power,
            get_settings,
            get_audio_status,
            set_output_device,
            get_visualizer_data,
            get_ui_info,
            set_ui_settings,
            set_autostart,
            ui_ready,
            export_settings,
            import_settings,
            restart_audio_service,
            check_update,
            install_update,
            open_release_page,
            save_user_preset,
            delete_user_preset,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let Some(state) = app.try_state::<AppState>() else {
                    return;
                };
                let to_tray = state.tray.is_some()
                    && state.settings.get().unwrap_or_default().ui.close_to_tray;
                if to_tray {
                    api.prevent_close();
                    hide_window(app);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(move |handle, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = handle.try_state::<AppState>() {
                state.audio.shutdown(Duration::from_secs(3));
                state.settings.flush();
            }
            instance.lock().unwrap_or_else(|e| e.into_inner()).take();
        }
    });
}
