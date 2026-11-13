//! Updates from the project's GitHub releases.
//!
//! `check` asks GitHub for the latest release and compares versions. When CJC
//! Tune runs as an AppImage, `install` downloads the new AppImage next to the
//! running one, verifies it against the SHA-256 digest GitHub publishes for
//! the asset, and swaps the file in one rename; the app then reopens from it.
//! Other installs (.deb) get the release page instead.
//!
//! This is the only network access the app makes, and it can be turned off.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::Duration;

const LATEST: &str = "https://api.github.com/repos/Davicjc/cjc-tune/releases/latest";
/// Only these hosts may be opened or downloaded from.
const RELEASE_PAGE_PREFIX: &str = "https://github.com/Davicjc/cjc-tune/";
const DOWNLOAD_PREFIXES: [&str; 2] = [
    "https://github.com/Davicjc/cjc-tune/releases/download/",
    "https://objects.githubusercontent.com/",
];
const USER_AGENT: &str = concat!("cjc-tune/", env!("CARGO_PKG_VERSION"));

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    assets: Vec<Asset>,
}

#[derive(Deserialize, Clone)]
struct Asset {
    name: String,
    browser_download_url: String,
    #[serde(default)]
    size: u64,
    /// "sha256:<hex>", published by GitHub for every release asset.
    #[serde(default)]
    digest: Option<String>,
}

/// What the window shows about updates.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub available: bool,
    /// Release page, for the notes and for installs that cannot self-update.
    pub url: String,
    pub notes: String,
    /// True when this copy is an AppImage and the release has one: the
    /// button installs in place instead of opening the page.
    pub can_install: bool,
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(10))
        .timeout_read(Duration::from_secs(30))
        .user_agent(USER_AGENT)
        .build()
}

/// "v1.2.3" / "1.2.3" → (1, 2, 3). Anything else is not a version.
fn parse_version(text: &str) -> Option<(u64, u64, u64)> {
    let core = text.trim().trim_start_matches('v');
    let core = core.split(['-', '+']).next()?;
    let mut parts = core.split('.').map(|p| p.parse::<u64>().ok());
    let v = (parts.next()??, parts.next()??, parts.next()??);
    parts.next().is_none().then_some(v)
}

/// Whether `latest` is newer than `current`.
fn is_newer(latest: &str, current: &str) -> bool {
    matches!((parse_version(latest), parse_version(current)), (Some(l), Some(c)) if l > c)
}

/// The AppImage this process was started from, if it was.
fn running_appimage() -> Option<PathBuf> {
    let path = PathBuf::from(std::env::var_os("APPIMAGE")?);
    path.is_file().then_some(path)
}

fn appimage_asset(release: &Release) -> Option<&Asset> {
    release
        .assets
        .iter()
        .find(|a| a.name.ends_with(".AppImage"))
}

/// The latest release, or `None` while the project has none published.
fn fetch_latest() -> Result<Option<Release>, String> {
    let response = match agent()
        .get(LATEST)
        .set("Accept", "application/vnd.github+json")
        .call()
    {
        Ok(response) => response,
        Err(ureq::Error::Status(404, _)) => return Ok(None),
        Err(e) => return Err(format!("could not reach GitHub: {e}")),
    };
    let release: Release = response
        .into_json()
        .map_err(|e| format!("unexpected answer from GitHub: {e}"))?;
    if release.draft || release.prerelease {
        return Err("the latest release is not final".into());
    }
    if !release.html_url.starts_with(RELEASE_PAGE_PREFIX) {
        return Err("unexpected release address".into());
    }
    Ok(Some(release))
}

fn describe(release: &Release) -> UpdateInfo {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let latest = release.tag_name.trim_start_matches('v').to_string();
    let available = is_newer(&latest, &current);
    UpdateInfo {
        can_install: available && running_appimage().is_some() && appimage_asset(release).is_some(),
        current,
        latest,
        available,
        url: release.html_url.clone(),
        notes: release.body.chars().take(2000).collect(),
    }
}

/// Ask GitHub whether there is a newer release.
pub fn check() -> Result<UpdateInfo, String> {
    let Some(release) = fetch_latest()? else {
        let current = env!("CARGO_PKG_VERSION").to_string();
        return Ok(UpdateInfo {
            latest: current.clone(),
            current,
            available: false,
            url: format!("{RELEASE_PAGE_PREFIX}releases"),
            notes: String::new(),
            can_install: false,
        });
    };
    let info = describe(&release);
    log::info!(
        "Update check: running {}, latest {}{}",
        info.current,
        info.latest,
        if info.available { " (newer)" } else { "" }
    );
    Ok(info)
}

/// Download `asset` to `dest`, checking its size and SHA-256 digest.
fn download(asset: &Asset, dest: &Path, progress: &dyn Fn(u8)) -> Result<(), String> {
    if !DOWNLOAD_PREFIXES
        .iter()
        .any(|p| asset.browser_download_url.starts_with(p))
    {
        return Err("unexpected download address".into());
    }
    let expected = asset
        .digest
        .as_deref()
        .and_then(|d| d.strip_prefix("sha256:"))
        .ok_or("the release does not publish a checksum for the AppImage")?
        .to_ascii_lowercase();

    let response = agent()
        .get(&asset.browser_download_url)
        .call()
        .map_err(|e| format!("download failed: {e}"))?;
    let mut reader = response.into_reader();
    let mut file =
        std::fs::File::create(dest).map_err(|e| format!("cannot write the update: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    let mut got: u64 = 0;
    let mut last = u8::MAX;
    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("download interrupted: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        file.write_all(&buf[..n])
            .map_err(|e| format!("cannot write the update: {e}"))?;
        got += n as u64;
        if let Some(pct) = (got * 100).checked_div(asset.size) {
            let pct = pct.min(100) as u8;
            if pct != last {
                last = pct;
                progress(pct);
            }
        }
    }
    file.sync_all()
        .map_err(|e| format!("cannot write the update: {e}"))?;
    if asset.size > 0 && got != asset.size {
        return Err(format!(
            "download incomplete ({got} of {} bytes)",
            asset.size
        ));
    }
    let actual = format!("{:x}", hasher.finalize());
    if actual != expected {
        return Err("the downloaded file does not match the published checksum".into());
    }
    Ok(())
}

/// Replace the running AppImage with the latest release. Returns the path to
/// start again. The old file stays usable until the final rename, and a
/// failed or tampered download never replaces it.
pub fn install(progress: &dyn Fn(u8)) -> Result<PathBuf, String> {
    let target = running_appimage().ok_or("this copy is not an AppImage")?;
    let release = fetch_latest()?.ok_or("no release published yet")?;
    if !is_newer(&release.tag_name, env!("CARGO_PKG_VERSION")) {
        return Err("already up to date".into());
    }
    let asset = appimage_asset(&release)
        .ok_or("the release has no AppImage")?
        .clone();
    // Same folder, so the final rename is atomic.
    let dir = target.parent().ok_or("cannot find the AppImage folder")?;
    let partial = dir.join(format!(".{}.download", asset.name));
    let result = download(&asset, &partial, progress).and_then(|()| {
        std::fs::set_permissions(&partial, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("cannot make the update executable: {e}"))?;
        std::fs::rename(&partial, &target).map_err(|e| format!("cannot replace the AppImage: {e}"))
    });
    if result.is_err() {
        let _ = std::fs::remove_file(&partial);
    }
    result?;
    log::info!("Updated {} to {}", target.display(), release.tag_name);
    Ok(target)
}

/// Open the release page in the browser (for installs that cannot update
/// themselves). Only this project's pages are opened.
pub fn open_page(url: &str) -> Result<(), String> {
    if !url.starts_with(RELEASE_PAGE_PREFIX) {
        return Err("unexpected address".into());
    }
    std::process::Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("could not open the browser: {e}"))
}

/// Start `appimage` once this process is gone (the single-instance lock is
/// released on exit), detached from it.
pub fn relaunch_after_exit(appimage: &Path) -> Result<(), String> {
    std::process::Command::new("sh")
        .arg("-c")
        .arg("sleep 1.5; exec \"$0\"")
        .arg(appimage)
        .env_remove("APPIMAGE")
        .env_remove("APPDIR")
        .env_remove("ARGV0")
        .env_remove("OWD")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("could not reopen CJC Tune: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_compare_numerically() {
        assert!(is_newer("v1.0.1", "1.0.0"));
        assert!(is_newer("1.10.0", "1.9.9"));
        assert!(is_newer("v2.0.0", "1.99.99"));
        assert!(!is_newer("v1.0.0", "1.0.0"));
        assert!(!is_newer("0.9.0", "1.0.0"));
        assert!(!is_newer("banana", "1.0.0"));
        assert!(!is_newer("1.0", "0.9.0"));
        assert_eq!(parse_version("v1.2.3-beta"), Some((1, 2, 3)));
    }

    fn release(tag: &str, assets: Vec<Asset>) -> Release {
        Release {
            tag_name: tag.into(),
            html_url: "https://github.com/Davicjc/cjc-tune/releases/tag/x".into(),
            body: "notes".into(),
            draft: false,
            prerelease: false,
            assets,
        }
    }

    #[test]
    fn appimage_asset_is_found_by_name() {
        let r = release(
            "v9.0.0",
            vec![
                Asset {
                    name: "cjc-tune_9.0.0_amd64.deb".into(),
                    browser_download_url: String::new(),
                    size: 1,
                    digest: None,
                },
                Asset {
                    name: "cjc-tune_9.0.0_amd64.AppImage".into(),
                    browser_download_url: String::new(),
                    size: 1,
                    digest: None,
                },
            ],
        );
        assert_eq!(
            appimage_asset(&r).unwrap().name,
            "cjc-tune_9.0.0_amd64.AppImage"
        );
        assert!(appimage_asset(&release("v9.0.0", vec![])).is_none());
    }

    #[test]
    fn a_newer_release_is_reported_and_an_older_one_is_not() {
        let info = describe(&release("v999.0.0", vec![]));
        assert!(info.available);
        assert_eq!(info.latest, "999.0.0");
        // No AppImage in the release (and not running from one): page only.
        assert!(!info.can_install);
        assert!(!describe(&release("v0.0.1", vec![])).available);
    }

    #[test]
    fn downloads_only_from_this_project_and_need_a_checksum() {
        let dest = std::env::temp_dir().join(format!("cjctune-dl-{}", std::process::id()));
        let foreign = Asset {
            name: "x.AppImage".into(),
            browser_download_url: "https://example.com/x.AppImage".into(),
            size: 1,
            digest: Some("sha256:00".into()),
        };
        assert!(download(&foreign, &dest, &|_| {})
            .unwrap_err()
            .contains("unexpected"));
        let unsigned = Asset {
            browser_download_url:
                "https://github.com/Davicjc/cjc-tune/releases/download/v1/x.AppImage".into(),
            digest: None,
            ..foreign
        };
        assert!(download(&unsigned, &dest, &|_| {})
            .unwrap_err()
            .contains("checksum"));
        assert!(!dest.exists());
        assert!(open_page("https://example.com/").is_err());
    }
}
