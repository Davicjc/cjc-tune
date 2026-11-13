//! User settings, remembered between launches.
//!
//! Every launch used to start over on the Music preset with power on and the
//! system's output device, whatever the user had set up before. The backend
//! now keeps the EQ, effects, power state and chosen output device in
//! `settings.json` under the app's config directory and applies them before
//! any audio flows.

use crate::graphics::RenderMode;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Writes are coalesced: a slider drag produces dozens of changes a second,
/// but the file is rewritten at most this often.
const SAVE_DELAY: Duration = Duration::from_millis(400);

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Effects {
    pub fidelity: f32,
    pub ambiance: f32,
    pub dynamic: f32,
    pub surround: f32,
    pub bass: f32,
}

impl Effects {
    pub fn set(&mut self, name: &str, value: f32) {
        match name {
            "fidelity" => self.fidelity = value,
            "ambiance" => self.ambiance = value,
            "dynamic" => self.dynamic = value,
            "surround" => self.surround = value,
            "bass" => self.bass = value,
            _ => {}
        }
    }

    pub fn iter(&self) -> [(&'static str, f32); 5] {
        [
            ("fidelity", self.fidelity),
            ("ambiance", self.ambiance),
            ("dynamic", self.dynamic),
            ("surround", self.surround),
            ("bass", self.bass),
        ]
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub powered: bool,
    /// Preset name shown in the UI, or "Custom".
    pub preset: String,
    pub eq: [f32; 10],
    pub effects: Effects,
    /// Output device chosen by the user; `None` lets CJC Tune decide.
    pub output_device: Option<String>,
    /// Window and rendering behaviour (not audio).
    pub ui: UiSettings,
}

/// How the app window behaves. Files saved before these existed load with
/// the defaults below.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct UiSettings {
    /// Draw the spectrum. Off stops all visualizer work, not only the drawing.
    pub visualizer: bool,
    /// Closing the window keeps CJC Tune running in the tray.
    pub close_to_tray: bool,
    /// When started with the session, stay in the tray instead of opening.
    pub start_hidden: bool,
    /// GPU or software rendering; applied at the next launch.
    pub render_mode: RenderMode,
    /// Interface language: "auto" (follow the system) or a code from
    /// `i18n::SUPPORTED`.
    pub language: String,
    /// "auto" (follow the desktop), "light" or "dark".
    pub theme: String,
    /// Accent color name, one of `ACCENTS`.
    pub accent: String,
}

/// Themes the window can use.
pub const THEMES: [&str; 3] = ["auto", "light", "dark"];
/// Accent colors offered in Settings, the same set macOS offers.
pub const ACCENTS: [&str; 8] = [
    "blue", "purple", "pink", "red", "orange", "yellow", "green", "graphite",
];

impl UiSettings {
    /// Replace anything unknown (hand-edited or from an older file) with the
    /// default, so the window never gets a value it cannot show.
    pub(crate) fn cleaned(mut self) -> Self {
        if self.language != "auto" && !crate::i18n::SUPPORTED.contains(&self.language.as_str()) {
            self.language = "auto".into();
        }
        if !THEMES.contains(&self.theme.as_str()) {
            self.theme = "auto".into();
        }
        if !ACCENTS.contains(&self.accent.as_str()) {
            self.accent = "blue".into();
        }
        self
    }
}

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            visualizer: true,
            close_to_tray: true,
            start_hidden: true,
            render_mode: RenderMode::Auto,
            language: "auto".into(),
            theme: "auto".into(),
            accent: "blue".into(),
        }
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            powered: true,
            preset: "Custom".into(),
            eq: [0.0; 10],
            effects: Effects::default(),
            output_device: None,
            ui: UiSettings::default(),
        }
    }
}

impl Settings {
    /// Clamp values that may have been edited by hand to what the engine
    /// accepts, and drop anything that is not a number.
    pub(crate) fn sanitized(mut self) -> Self {
        for gain in self.eq.iter_mut() {
            *gain = if gain.is_finite() {
                gain.clamp(-12.0, 12.0)
            } else {
                0.0
            };
        }
        for (name, value) in self.effects.iter() {
            let value = if value.is_finite() {
                value.clamp(0.0, 100.0)
            } else {
                0.0
            };
            self.effects.set(name, value);
        }
        self.output_device = self.output_device.filter(|d| !d.is_empty());
        self.preset = clean_preset(Some(self.preset));
        self.ui = self.ui.cleaned();
        self
    }
}

/// Marks an exported file so an unrelated JSON file is rejected on import.
const EXPORT_FORMAT: &str = "cjc-tune-config";
const EXPORT_VERSION: u32 = 1;
/// A preset name is display text only: keep it short and printable, or fall
/// back to "Custom".
pub fn clean_preset(preset: Option<String>) -> String {
    preset
        .filter(|p| !p.is_empty() && p.len() <= 64 && !p.chars().any(char::is_control))
        .unwrap_or_else(|| "Custom".into())
}

/// Write an exported file without ever leaving a half-written one behind:
/// the text goes to a new sibling file first and replaces the target only
/// once it is completely on disk.
pub fn write_export(path: &std::path::Path, text: &str) -> std::io::Result<()> {
    use std::io::Write;
    let name = path
        .file_name()
        .ok_or_else(|| std::io::Error::other("no file name"))?
        .to_string_lossy();
    let tmp = path.with_file_name(format!(".{name}.{}.tmp", std::process::id()));
    let result = (|| {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        std::fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}

/// Error codes the page translates (see `src/i18n.js`).
pub const ERR_NOT_CONFIG: &str = "error.not-config";
pub const ERR_NEWER: &str = "error.newer";
/// A settings file is well under 2 KB; anything far bigger is not one.
pub const MAX_IMPORT_BYTES: u64 = 64 * 1024;

#[derive(Serialize, Deserialize)]
struct ExportFile {
    format: String,
    version: u32,
    settings: Settings,
}

/// The settings as a shareable file. The output device is left out: device
/// names belong to one machine and would not match on another.
pub fn export_json(settings: &Settings) -> String {
    let file = ExportFile {
        format: EXPORT_FORMAT.into(),
        version: EXPORT_VERSION,
        settings: Settings {
            output_device: None,
            ..settings.clone()
        },
    };
    serde_json::to_string_pretty(&file).expect("settings always serialize")
}

/// Read a file written by [`export_json`]. Values are clamped like a hand-edited
/// settings file; the output device is never taken from the file.
pub fn import_json(text: &str) -> Result<Settings, String> {
    let file: ExportFile = serde_json::from_str(text).map_err(|_| ERR_NOT_CONFIG.to_string())?;
    // Files exported by FXSound for Linux share the layout and import as-is.
    if file.format != EXPORT_FORMAT && file.format != "fxsound-linux-config" {
        return Err(ERR_NOT_CONFIG.into());
    }
    if file.version > EXPORT_VERSION {
        return Err(ERR_NEWER.into());
    }
    Ok(Settings {
        output_device: None,
        ..file.settings.sanitized()
    })
}

pub struct SettingsStore {
    path: Option<PathBuf>,
    /// `None` until the first launch has saved anything.
    current: Arc<Mutex<Option<Settings>>>,
    save: Mutex<Option<Sender<()>>>,
    /// The background writer, joined by `flush` so the two never write at once.
    writer: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl SettingsStore {
    /// Load settings from `path` (if any) and start the background writer.
    pub fn open(path: Option<PathBuf>) -> Self {
        let loaded = path
            .as_deref()
            .and_then(|p| match std::fs::read_to_string(p) {
                Ok(text) => match serde_json::from_str::<Settings>(&text) {
                    Ok(settings) => Some(settings.sanitized()),
                    Err(e) => {
                        log::warn!("Ignoring unreadable settings file {}: {e}", p.display());
                        None
                    }
                },
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
                Err(e) => {
                    log::warn!("Could not read settings file {}: {e}", p.display());
                    None
                }
            });

        let current = Arc::new(Mutex::new(loaded));
        let mut writer = None;
        let save = path.clone().map(|path| {
            let (tx, rx) = mpsc::channel::<()>();
            let current = Arc::clone(&current);
            let handle = std::thread::Builder::new()
                .name("cjctune-settings".into())
                .spawn(move || {
                    while rx.recv().is_ok() {
                        // Let a burst of changes settle, then write once.
                        loop {
                            match rx.recv_timeout(SAVE_DELAY) {
                                Ok(()) => continue,
                                Err(RecvTimeoutError::Timeout) => break,
                                Err(RecvTimeoutError::Disconnected) => break,
                            }
                        }
                        write(&path, &current);
                    }
                })
                .expect("failed to spawn the settings writer");
            writer = Some(handle);
            tx
        });

        Self {
            path,
            current,
            save: Mutex::new(save),
            writer: Mutex::new(writer),
        }
    }

    pub fn get(&self) -> Option<Settings> {
        self.current
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Change the settings and schedule a save.
    pub fn update(&self, change: impl FnOnce(&mut Settings)) {
        {
            let mut current = self.current.lock().unwrap_or_else(|e| e.into_inner());
            let mut next = current.clone().unwrap_or_default();
            change(&mut next);
            if current.as_ref() == Some(&next) {
                return;
            }
            *current = Some(next);
        }
        if let Some(save) = self.save.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
            let _ = save.send(());
        }
    }

    /// Stop the background writer, wait for it, then write once more. Call on
    /// exit.
    ///
    /// Waiting matters: dropping the sender wakes the writer, which saves on
    /// its way out. Writing here at the same moment raced it on the same
    /// temporary file, and the rename could publish a half-written file — a
    /// settings file that came back empty after closing the app.
    pub fn flush(&self) {
        self.save.lock().unwrap_or_else(|e| e.into_inner()).take();
        if let Some(writer) = self.writer.lock().unwrap_or_else(|e| e.into_inner()).take() {
            let _ = writer.join();
        }
        if let Some(path) = &self.path {
            write(path, &self.current);
        }
    }
}

/// Atomically replace the settings file, so a crash mid-write can never
/// leave it truncated.
fn write(path: &PathBuf, current: &Mutex<Option<Settings>>) {
    let Some(settings) = current.lock().unwrap_or_else(|e| e.into_inner()).clone() else {
        return;
    };
    let result = (|| -> std::io::Result<()> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let text = serde_json::to_string_pretty(&settings).map_err(std::io::Error::other)?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, text)?;
        std::fs::rename(&tmp, path)
    })();
    if let Err(e) = result {
        log::warn!("Could not save settings to {}: {e}", path.display());
    }
}

/// Settings file of the app CJC Tune grew out of (FXSound for Linux). On the
/// first launch its EQ, effects and output carry over, so switching apps does
/// not mean tuning the sound again.
pub const LEGACY_IDENTIFIER: &str = "com.fxsound.linux";

/// Copy `legacy` to `target` when `target` does not exist yet. Never
/// overwrites, never touches the old file, and only takes a file that parses.
pub fn adopt_legacy(target: &Path, legacy: &Path) -> bool {
    if target.exists() {
        return false;
    }
    let Ok(text) = std::fs::read_to_string(legacy) else {
        return false;
    };
    if serde_json::from_str::<Settings>(&text).is_err() {
        log::warn!(
            "Ignoring unreadable legacy settings at {}",
            legacy.display()
        );
        return false;
    }
    let copied = target
        .parent()
        .map_or(Ok(()), std::fs::create_dir_all)
        .and_then(|()| std::fs::write(target, text));
    match copied {
        Ok(()) => {
            log::info!("Carried settings over from {}", legacy.display());
            true
        }
        Err(e) => {
            log::warn!("Could not carry the legacy settings over: {e}");
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cjctune-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("settings.json")
    }

    #[test]
    fn round_trips_through_disk() {
        let path = temp_path("roundtrip");
        let store = SettingsStore::open(Some(path.clone()));
        assert_eq!(store.get(), None, "first launch has no settings");
        store.update(|s| {
            s.preset = "Bass Boost".into();
            s.eq[0] = 8.0;
            s.effects.set("bass", 90.0);
            s.powered = false;
            s.output_device = Some("alsa_output.usb".into());
        });
        store.flush();

        let reopened = SettingsStore::open(Some(path.clone())).get().unwrap();
        assert_eq!(reopened.preset, "Bass Boost");
        assert_eq!(reopened.eq[0], 8.0);
        assert_eq!(reopened.effects.bass, 90.0);
        assert!(!reopened.powered);
        assert_eq!(reopened.output_device.as_deref(), Some("alsa_output.usb"));
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn hand_edited_values_are_clamped_and_unknown_keys_ignored() {
        let path = temp_path("sanitize");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(
            &path,
            r#"{"eq":[99,-99,0,0,0,0,0,0,0,0],"effects":{"bass":250},"output_device":"","future_key":1}"#,
        )
        .unwrap();
        let s = SettingsStore::open(Some(path.clone())).get().unwrap();
        assert_eq!(s.eq[0], 12.0);
        assert_eq!(s.eq[1], -12.0);
        assert_eq!(s.effects.bass, 100.0);
        assert_eq!(s.output_device, None);
        assert!(s.powered, "missing keys take their defaults");
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn corrupt_file_is_ignored() {
        let path = temp_path("corrupt");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "{not json").unwrap();
        assert_eq!(SettingsStore::open(Some(path.clone())).get(), None);
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }
}

#[cfg(test)]
mod export_tests {
    use super::*;

    fn sample() -> Settings {
        let mut s = Settings {
            preset: "Bass Boost".into(),
            output_device: Some("alsa_output.usb-headset".into()),
            ..Settings::default()
        };
        s.eq[0] = 6.5;
        s.effects.bass = 80.0;
        s.ui.visualizer = false;
        s.ui.render_mode = RenderMode::Software;
        s.ui.language = "pt".into();
        s
    }

    #[test]
    fn export_then_import_keeps_everything_but_the_device() {
        let back = import_json(&export_json(&sample())).unwrap();
        assert_eq!(
            back,
            Settings {
                output_device: None,
                ..sample()
            }
        );
    }

    #[test]
    fn import_rejects_files_that_are_not_ours() {
        assert!(import_json("{\"eq\":[1,2,3]}").is_err());
        assert!(import_json("not json").is_err());
        let foreign = export_json(&sample()).replace(EXPORT_FORMAT, "something-else");
        assert!(import_json(&foreign).is_err());
    }

    #[test]
    fn import_refuses_a_newer_format() {
        let newer = export_json(&sample()).replace("\"version\": 1", "\"version\": 99");
        assert!(import_json(&newer).unwrap_err().contains("newer"));
    }

    #[test]
    fn import_clamps_out_of_range_values() {
        let wild = export_json(&sample()).replace("6.5", "400.0");
        assert_eq!(import_json(&wild).unwrap().eq[0], 12.0);
    }

    #[test]
    fn import_cleans_the_preset_name() {
        let long = "x".repeat(200);
        let file = export_json(&sample()).replace("Bass Boost", &long);
        assert_eq!(import_json(&file).unwrap().preset, "Custom");
        let file = export_json(&sample()).replace("Bass Boost", "bad\\u0007name");
        assert_eq!(import_json(&file).unwrap().preset, "Custom");
        assert_eq!(
            import_json(&export_json(&sample())).unwrap().preset,
            "Bass Boost"
        );
    }

    #[test]
    fn export_replaces_the_file_only_when_complete() {
        let dir = std::env::temp_dir().join(format!("cjctune-export-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("cjc-tune-config.json");
        std::fs::write(&target, "old").unwrap();
        write_export(&target, "new").unwrap();
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "new");
        // Only the target remains: the temporary file was renamed away.
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        // A failed write (missing directory) leaves nothing behind.
        assert!(write_export(&dir.join("missing").join("x.json"), "y").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_unknown_language_falls_back_to_automatic() {
        let file = export_json(&sample()).replace("\"pt\"", "\"klingon\"");
        assert_eq!(import_json(&file).unwrap().ui.language, "auto");
    }

    #[test]
    fn settings_saved_before_ui_options_load_with_defaults() {
        let old = r#"{"powered":true,"preset":"Music","eq":[0,0,0,0,0,0,0,0,0,0],
                      "effects":{"bass":10},"output_device":null}"#;
        let s: Settings = serde_json::from_str(old).unwrap();
        assert_eq!(s.ui, UiSettings::default());
        assert_eq!(s.effects.bass, 10.0);
    }

    #[test]
    fn legacy_settings_are_adopted_once_and_never_overwrite() {
        let dir = std::env::temp_dir().join(format!("cjctune-legacy-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let legacy = dir.join("old/settings.json");
        let target = dir.join("new/settings.json");
        std::fs::create_dir_all(legacy.parent().unwrap()).unwrap();

        // Nothing to adopt.
        assert!(!adopt_legacy(&target, &legacy));

        // Garbage is left alone.
        std::fs::write(&legacy, "not json").unwrap();
        assert!(!adopt_legacy(&target, &legacy));
        assert!(!target.exists());

        let mut old = Settings::default();
        old.eq[0] = 6.0;
        std::fs::write(&legacy, serde_json::to_string(&old).unwrap()).unwrap();
        assert!(adopt_legacy(&target, &legacy));
        let got: Settings =
            serde_json::from_str(&std::fs::read_to_string(&target).unwrap()).unwrap();
        assert_eq!(got.eq[0], 6.0);

        // Once there is a file of its own, the old one is never copied again.
        old.eq[0] = -3.0;
        std::fs::write(&legacy, serde_json::to_string(&old).unwrap()).unwrap();
        assert!(!adopt_legacy(&target, &legacy));
        let got: Settings =
            serde_json::from_str(&std::fs::read_to_string(&target).unwrap()).unwrap();
        assert_eq!(got.eq[0], 6.0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn unknown_theme_and_accent_fall_back_to_defaults() {
        let ui = UiSettings {
            theme: "neon".into(),
            accent: "rainbow".into(),
            ..UiSettings::default()
        }
        .cleaned();
        assert_eq!((ui.theme.as_str(), ui.accent.as_str()), ("auto", "blue"));
        let ui = UiSettings {
            theme: "dark".into(),
            accent: "green".into(),
            ..UiSettings::default()
        }
        .cleaned();
        assert_eq!((ui.theme.as_str(), ui.accent.as_str()), ("dark", "green"));
    }
}
