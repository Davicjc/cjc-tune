//! What every command and the tray share: the processor, the router, the saved settings.

use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

use crate::dsp::Processor;
use crate::routing::Router;
use crate::settings::{Settings, SettingsStore};
use crate::tray::*;
use crate::{graphics, i18n};

/// Bundle identifier; also names the config directory.
pub(crate) const IDENTIFIER: &str = "com.davicjc.cjctune";
/// Passed by the session autostart entry, so a login start can stay in the tray.
pub(crate) const AUTOSTART_ARG: &str = "--autostart";

/// Shared application state behind the Tauri commands.
pub(crate) struct AppState {
    pub(crate) engine: Arc<Mutex<Processor>>,
    pub(crate) audio: Router,
    pub(crate) settings: Arc<SettingsStore>,
    /// How this launch renders, decided before the window existed.
    pub(crate) graphics: graphics::Choice,
    pub(crate) config_dir: Option<PathBuf>,
    /// `None` when the desktop has no tray to put the icon in.
    pub(crate) tray: Option<TrayHandles>,
}

impl AppState {
    /// The interface language in effect ("auto" resolved from the system).
    pub(crate) fn language(&self) -> &'static str {
        i18n::resolve(&self.settings.get().unwrap_or_default().ui.language)
    }
}

impl AppState {
    pub(crate) fn engine(&self) -> MutexGuard<'_, Processor> {
        self.engine.lock().unwrap_or_else(|e| e.into_inner())
    }
}
/// An engine with the saved EQ, effects and power applied, and no audio history.
pub(crate) fn engine_from(saved: Option<&Settings>) -> Processor {
    let mut engine = Processor::new();
    if let Some(saved) = saved {
        for (band, &gain) in saved.eq.iter().enumerate() {
            engine.set_eq_band(band, gain);
        }
        for (name, value) in saved.effects.iter() {
            engine.set_effect(name, value);
        }
        engine.set_power(saved.powered);
    }
    engine
}

/// One place that changes power, so the window and the tray never disagree.
pub(crate) fn apply_power(state: &AppState, enabled: bool) {
    state.engine().set_power(enabled);
    state.settings.update(|s| s.powered = enabled);
    if let Some(tray) = &state.tray {
        let _ = tray.power.set_checked(enabled);
    }
}
