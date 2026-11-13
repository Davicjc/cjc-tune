//! Commands the window calls with `invoke()`.

use tauri::{AppHandle, Emitter, State};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_dialog::DialogExt as _;

use crate::dsp::EFFECT_NAMES;
use crate::routing::RouteStatus;
use crate::settings::{self, Settings, UiSettings};
use crate::state::*;
use crate::tray::restart_audio;
use crate::{graphics, i18n, update};

// ── Tauri Commands ──
// These functions are callable from the frontend via `invoke("command_name", { args })`.
// None of them talks to the audio server: synchronous commands run on the GTK
// main thread, and a blocking audio-server query there froze the window (#510).

/// Set the gain (in dB) for a single EQ band.
#[tauri::command]
pub(crate) fn set_eq_band(state: State<AppState>, band: usize, gain: f32) -> Result<(), String> {
    if band >= 10 {
        return Err("Invalid EQ band".to_string());
    }
    if !gain.is_finite() {
        return Err("Invalid gain value".to_string());
    }
    let gain = gain.clamp(-12.0, 12.0);
    state.engine().set_eq_band(band, gain);
    state.settings.update(|s| {
        s.eq[band] = gain;
        s.preset = "Custom".into();
    });
    Ok(())
}

/// Set the intensity (0–100) for a named audio effect.
#[tauri::command]
pub(crate) fn set_effect(state: State<AppState>, effect: String, value: f32) -> Result<(), String> {
    if !value.is_finite() {
        return Err("Invalid effect value".to_string());
    }
    // Validate effect name against an allowlist to prevent memory exhaustion (DoS)
    if !EFFECT_NAMES.contains(&effect.as_str()) {
        return Err("Invalid effect name".to_string());
    }
    let value = value.clamp(0.0, 100.0);
    state.engine().set_effect(&effect, value);
    state.settings.update(|s| {
        s.effects.set(&effect, value);
        s.preset = "Custom".into();
    });
    Ok(())
}

#[derive(serde::Deserialize, Default)]
pub(crate) struct PresetEffects {
    pub(crate) fidelity: Option<f32>,
    pub(crate) ambiance: Option<f32>,
    pub(crate) dynamic: Option<f32>,
    pub(crate) surround: Option<f32>,
    pub(crate) bass: Option<f32>,
}

/// Apply a full preset state (EQ bands + effects) in one batch to avoid IPC overhead.
#[tauri::command]
pub(crate) fn apply_preset_state(
    state: State<AppState>,
    eq_bands: [f32; 10],
    effects: PresetEffects,
    preset: Option<String>,
) -> Result<(), String> {
    let eq = eq_bands.map(|g| {
        if g.is_finite() {
            g.clamp(-12.0, 12.0)
        } else {
            0.0
        }
    });
    let effects = [
        ("fidelity", effects.fidelity),
        ("ambiance", effects.ambiance),
        ("dynamic", effects.dynamic),
        ("surround", effects.surround),
        ("bass", effects.bass),
    ]
    .map(|(name, value)| {
        (
            name,
            value.filter(|v| v.is_finite()).map(|v| v.clamp(0.0, 100.0)),
        )
    });

    {
        let mut engine = state.engine();
        for (band, &gain) in eq.iter().enumerate() {
            engine.set_eq_band(band, gain);
        }
        for (name, value) in effects {
            if let Some(value) = value {
                engine.set_effect(name, value);
            }
        }
    }

    let preset = settings::clean_preset(preset);
    state.settings.update(|s| {
        s.eq = eq;
        for (name, value) in effects {
            if let Some(value) = value {
                s.effects.set(name, value);
            }
        }
        s.preset = preset;
    });
    Ok(())
}

/// Toggle processing. Off is a bypass: audio still plays, unprocessed.
#[tauri::command]
pub(crate) fn set_power(state: State<AppState>, enabled: bool) -> Result<(), String> {
    apply_power(&state, enabled);
    Ok(())
}

/// Everything the settings page shows.
#[derive(serde::Serialize)]
pub(crate) struct UiInfo {
    pub(crate) ui: UiSettings,
    pub(crate) graphics: graphics::Choice,
    pub(crate) tray_available: bool,
    pub(crate) autostart: bool,
    /// Effective language code, for the page to translate itself.
    pub(crate) language: &'static str,
    /// What "auto" resolves to, for labelling that option.
    pub(crate) system_language: &'static str,
    /// What the next launch would render with, to tell when a restart
    /// changes anything.
    pub(crate) next_renderer: graphics::Renderer,
}

/// Reply to a settings change: what depends on it right away.
#[derive(serde::Serialize)]
pub(crate) struct UiUpdate {
    pub(crate) language: &'static str,
    pub(crate) next_renderer: graphics::Renderer,
}

#[tauri::command]
pub(crate) fn get_ui_info(app: AppHandle, state: State<AppState>) -> UiInfo {
    UiInfo {
        ui: state.settings.get().unwrap_or_default().ui,
        graphics: state.graphics,
        tray_available: state.tray.is_some(),
        autostart: app.autolaunch().is_enabled().unwrap_or(false),
        language: state.language(),
        system_language: i18n::resolve("auto"),
        next_renderer: graphics::next_renderer(
            state.settings.get().unwrap_or_default().ui.render_mode,
            state.config_dir.as_deref(),
        ),
    }
}

/// Save the window/rendering options. Rendering changes apply next launch.
#[tauri::command]
pub(crate) fn set_ui_settings(
    state: State<AppState>,
    mut ui: UiSettings,
) -> Result<UiUpdate, String> {
    ui = ui.cleaned();
    let before = state.settings.get().unwrap_or_default().ui;
    if ui.render_mode != before.render_mode {
        graphics::forget_failure(state.config_dir.as_deref());
    }
    let mode = ui.render_mode;
    state.settings.update(|s| s.ui = ui);
    let language = state.language();
    if let Some(tray) = &state.tray {
        tray.relabel(language);
    }
    Ok(UiUpdate {
        language,
        next_renderer: graphics::next_renderer(mode, state.config_dir.as_deref()),
    })
}

/// Start CJC Tune with the desktop session (an XDG autostart entry).
#[tauri::command]
pub(crate) fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let launcher = app.autolaunch();
    let result = if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    };
    result.map_err(|e| format!("Could not change autostart: {e}"))?;
    launcher.is_enabled().map_err(|e| e.to_string())
}

/// The window loaded: an automatic GPU choice is proven to work here.
#[tauri::command]
pub(crate) fn ui_ready(state: State<AppState>) {
    graphics::confirm_started(state.config_dir.as_deref());
}

/// Ask where to save, then write the configuration there. `Ok(false)` means
/// the user cancelled. The path never comes from the web page.
#[tauri::command]
pub(crate) async fn export_settings(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let t = i18n::texts(state.language());
    let Some(path) = app
        .dialog()
        .file()
        .set_title(t.export_title)
        .add_filter(t.file_filter, &["json"])
        .set_file_name("cjc-tune-config.json")
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let mut path = path.into_path().map_err(|e| e.to_string())?;
    if path.extension().is_none() {
        path.set_extension("json");
    }
    let text = settings::export_json(&state.settings.get().unwrap_or_default());
    settings::write_export(&path, &text)
        .map_err(|e| format!("Could not write {}: {e}", path.display()))?;
    log::info!("Exported configuration to {}", path.display());
    Ok(true)
}

/// Ask for a file, validate it and make it the current configuration.
/// Returns the new settings, or `None` if the user cancelled. The output
/// device in use is kept: it belongs to this machine, not to the file.
#[tauri::command]
pub(crate) async fn import_settings(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<Settings>, String> {
    let t = i18n::texts(state.language());
    let Some(path) = app
        .dialog()
        .file()
        .set_title(t.import_title)
        .add_filter(t.file_filter, &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if size > settings::MAX_IMPORT_BYTES {
        return Err(settings::ERR_NOT_CONFIG.into());
    }
    let text = std::fs::read_to_string(&path)
        .map_err(|e| format!("Could not read {}: {e}", path.display()))?;
    let mut imported = settings::import_json(&text)?;
    let before = state.settings.get().unwrap_or_default();
    imported.output_device = before.output_device;
    // Same rule as changing the option by hand: a new rendering choice gets
    // a fresh try on the GPU.
    if imported.ui.render_mode != before.ui.render_mode {
        graphics::forget_failure(state.config_dir.as_deref());
    }

    {
        let mut engine = state.engine();
        for (band, &gain) in imported.eq.iter().enumerate() {
            engine.set_eq_band(band, gain);
        }
        for (name, value) in imported.effects.iter() {
            engine.set_effect(name, value);
        }
    }
    apply_power(&state, imported.powered);
    let stored = imported.clone();
    state.settings.update(move |s| *s = stored);
    if let Some(tray) = &state.tray {
        tray.relabel(state.language());
    }
    log::info!("Imported configuration from {}", path.display());
    Ok(Some(imported))
}

/// The saved settings, or `None` on first launch.
#[tauri::command]
pub(crate) fn get_settings(state: State<AppState>) -> Option<Settings> {
    state.settings.get()
}

/// Where audio is going and which devices it could go to.
#[tauri::command]
pub(crate) fn get_audio_status(state: State<AppState>) -> RouteStatus {
    state.audio.status()
}

/// Play to a specific output device, or let CJC Tune choose when `sink` is
/// `None` or empty.
#[tauri::command]
pub(crate) fn set_output_device(
    state: State<AppState>,
    sink: Option<String>,
) -> Result<(), String> {
    let sink = sink.filter(|s| !s.is_empty());
    state.settings.update(|s| s.output_device = sink.clone());
    state.audio.set_output(sink);
    Ok(())
}

/// Return the current FFT magnitude data for the visualizer (32 bins).
#[tauri::command]
pub(crate) fn get_visualizer_data(state: State<AppState>) -> Result<Vec<f32>, String> {
    Ok(state.engine().get_fft_data())
}

/// Same as the tray's "Restart audio service": rebuild the processor from the
/// saved settings and recreate the virtual device, without closing anything.
#[tauri::command]
pub(crate) fn restart_audio_service(state: State<AppState>) {
    restart_audio(&state);
}

/// Ask GitHub whether a newer release exists. Runs off the main thread.
#[tauri::command]
pub(crate) async fn check_update() -> Result<update::UpdateInfo, String> {
    tauri::async_runtime::spawn_blocking(update::check)
        .await
        .map_err(|e| e.to_string())?
}

/// Download and install the new AppImage, then reopen from it. Progress
/// (0–100) arrives as `update-progress` events. Only for AppImage copies.
#[tauri::command]
pub(crate) async fn install_update(app: AppHandle) -> Result<(), String> {
    let events = app.clone();
    let path = tauri::async_runtime::spawn_blocking(move || {
        update::install(&|pct| {
            let _ = events.emit("update-progress", pct);
        })
    })
    .await
    .map_err(|e| e.to_string())??;
    update::relaunch_after_exit(&path)?;
    // A normal exit: the virtual device goes away and the system output comes
    // back before the new copy starts.
    app.exit(0);
    Ok(())
}

/// Open the release page (installs that cannot update themselves).
#[tauri::command]
pub(crate) fn open_release_page(url: String) -> Result<(), String> {
    update::open_page(&url)
}
