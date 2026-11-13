//! The tray icon, its menu and showing/hiding the window.

use std::time::Duration;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::i18n;
use crate::state::*;

pub(crate) struct TrayHandles {
    pub(crate) show: MenuItem<Wry>,
    pub(crate) hide: MenuItem<Wry>,
    pub(crate) power: CheckMenuItem<Wry>,
    pub(crate) restart: MenuItem<Wry>,
    pub(crate) quit: MenuItem<Wry>,
}

impl TrayHandles {
    pub(crate) fn relabel(&self, lang: &str) {
        let t = i18n::texts(lang);
        let _ = self.show.set_text(t.show);
        let _ = self.hide.set_text(t.hide);
        let _ = self.power.set_text(t.effects_on);
        let _ = self.restart.set_text(t.restart);
        let _ = self.quit.set_text(t.quit);
    }
}

/// Whether a StatusNotifier host (the panel side of the tray) is running.
/// The tray icon registers even when nothing displays it, so this is what
/// tells whether hiding the window leaves a way back.
pub(crate) fn tray_host_visible() -> bool {
    use dbus::blocking::stdintf::org_freedesktop_dbus::Properties;
    let watcher = "org.kde.StatusNotifierWatcher";
    let visible = dbus::blocking::Connection::new_session().and_then(|conn| {
        conn.with_proxy(
            watcher,
            "/StatusNotifierWatcher",
            Duration::from_millis(500),
        )
        .get::<bool>(watcher, "IsStatusNotifierHostRegistered")
    });
    match visible {
        Ok(visible) => visible,
        Err(e) => {
            log::info!("No tray host found ({e}); starting with the window shown");
            false
        }
    }
}

/// Bring the window back from the tray, the taskbar or behind other windows.
pub(crate) fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = app.emit("window-visibility", true);
}

/// Hide to the tray. The page is told, so the visualizer stops working.
pub(crate) fn hide_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    let _ = app.emit("window-visibility", false);
}

/// The "Restart audio service" tray action: a quick fix for crackling, silence
/// or a stuck device without quitting. The processor starts clean from the
/// saved settings, and the virtual device is removed and created again.
pub(crate) fn restart_audio(state: &AppState) {
    log::info!("Audio service restart requested from the tray");
    *state.engine() = engine_from(state.settings.get().as_ref());
    state.audio.restart();
}

pub(crate) fn build_tray(app: &AppHandle, powered: bool, lang: &str) -> tauri::Result<TrayHandles> {
    let t = i18n::texts(lang);
    let show = MenuItem::with_id(app, "show", t.show, true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", t.hide, true, None::<&str>)?;
    let power = CheckMenuItem::with_id(app, "power", t.effects_on, true, powered, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", t.restart, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", t.quit, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &show, &hide, &separator, &power, &restart, &separator, &quit,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("CJC Tune")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_window(app),
            "hide" => hide_window(app),
            "power" => {
                if let Some(state) = app.try_state::<AppState>() {
                    let enabled = !state.settings.get().map(|s| s.powered).unwrap_or(true);
                    apply_power(&state, enabled);
                    let _ = app.emit("power-changed", enabled);
                }
            }
            "restart" => {
                if let Some(state) = app.try_state::<AppState>() {
                    restart_audio(&state);
                }
            }
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(TrayHandles {
        show,
        hide,
        power,
        restart,
        quit,
    })
}
