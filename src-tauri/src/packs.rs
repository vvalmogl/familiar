//! Character packs: a folder (or a `.fampack` zip of one) with `pack.json` and images.
//! User packs live in `$APPDATA/packs/<id>`, bundled ones in `$RESOURCE/packs/<id>`.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

const IMAGE_EXTS: [&str; 6] = ["gif", "png", "webp", "jpg", "jpeg", "apng"];

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Mood {
    Intro,
    Idle,
    Thinking,
    Talking,
    Happy,
}

/// `card` in pack.json: `"auto"` (frame opaque images), `true` or `false`.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(untagged)]
pub enum Card {
    Flag(bool),
    Mode(String),
}

impl Default for Card {
    fn default() -> Self {
        Card::Mode("auto".into())
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct Style {
    #[serde(default)]
    pub card: Card,
    #[serde(default = "one")]
    pub scale: f64,
}

impl Default for Style {
    fn default() -> Self {
        Style { card: Card::default(), scale: 1.0 }
    }
}

fn one() -> f64 {
    1.0
}

fn default_version() -> String {
    "1.0.0".into()
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct Manifest {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub author: String,
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default)]
    pub license: String,
    /// Images per mood; one is picked at random each time the mood starts.
    #[serde(default)]
    pub states: BTreeMap<Mood, Vec<String>>,
    /// Frame-by-frame animations per mood: `[file, milliseconds]`.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub frames: BTreeMap<Mood, Vec<(String, u32)>>,
    #[serde(default)]
    pub style: Style,
}

fn is_safe_relative(file: &str) -> bool {
    let p = Path::new(file);
    !file.is_empty() && p.components().all(|c| matches!(c, Component::Normal(_)))
}

fn is_image(file: &str) -> bool {
    Path::new(file)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| IMAGE_EXTS.contains(&e.to_ascii_lowercase().as_str()))
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '-' | '_'))
        && !id.starts_with('.')
}

impl Manifest {
    pub fn files(&self) -> impl Iterator<Item = &String> {
        self.states
            .values()
            .flatten()
            .chain(self.frames.values().flatten().map(|(f, _)| f))
    }

    /// Check the manifest against the folder it lives in.
    pub fn validate(&self, dir: &Path) -> Result<(), String> {
        if !valid_id(&self.id) {
            return Err(format!("неверный id пака «{}»: только a-z, 0-9, точка, дефис", self.id));
        }
        if self.name.trim().is_empty() {
            return Err("у пака нет названия".into());
        }
        let has_idle = self.states.get(&Mood::Idle).is_some_and(|v| !v.is_empty())
            || self.frames.get(&Mood::Idle).is_some_and(|v| !v.is_empty());
        if !has_idle {
            return Err("в паке нет ни одной картинки для состояния idle".into());
        }
        if !(0.2..=3.0).contains(&self.style.scale) {
            return Err("style.scale должен быть от 0.2 до 3".into());
        }
        if let Card::Mode(m) = &self.style.card {
            if m != "auto" {
                return Err("style.card: \"auto\", true или false".into());
            }
        }
        for f in self.files() {
            if !is_safe_relative(f) {
                return Err(format!("недопустимый путь к файлу: {f}"));
            }
            if !is_image(f) {
                return Err(format!("не картинка: {f}"));
            }
            if !dir.join(f).is_file() {
                return Err(format!("нет файла: {f}"));
            }
        }
        Ok(())
    }

    pub fn read(dir: &Path) -> Result<Manifest, String> {
        let text = fs::read_to_string(dir.join("pack.json")).map_err(|_| "нет pack.json".to_string())?;
        let m: Manifest = serde_json::from_str(&text).map_err(|e| format!("pack.json: {e}"))?;
        m.validate(dir)?;
        Ok(m)
    }
}

/// What the UI needs to show a pack. Paths are absolute; the frontend turns them into asset URLs.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackInfo {
    id: String,
    name: String,
    author: String,
    version: String,
    license: String,
    builtin: bool,
    states: BTreeMap<Mood, Vec<String>>,
    frames: BTreeMap<Mood, Vec<(String, u32)>>,
    card: String,
    scale: f64,
    preview: Option<String>,
}

impl PackInfo {
    fn new(m: Manifest, dir: &Path, builtin: bool) -> PackInfo {
        let abs = |f: &String| dir.join(f).to_string_lossy().into_owned();
        let states: BTreeMap<_, _> = m.states.iter().map(|(k, v)| (*k, v.iter().map(abs).collect())).collect();
        let frames: BTreeMap<_, Vec<(String, u32)>> =
            m.frames.iter().map(|(k, v)| (*k, v.iter().map(|(f, ms)| (abs(f), *ms)).collect())).collect();
        let preview = states
            .get(&Mood::Idle)
            .and_then(|v: &Vec<String>| v.first().cloned())
            .or_else(|| frames.get(&Mood::Idle).and_then(|v| v.first().map(|(f, _)| f.clone())));
        let card = match &m.style.card {
            Card::Flag(true) => "on",
            Card::Flag(false) => "off",
            Card::Mode(_) => "auto",
        };
        PackInfo {
            id: m.id,
            name: m.name,
            author: m.author,
            version: m.version,
            license: m.license,
            builtin,
            states,
            frames,
            card: card.into(),
            scale: m.style.scale,
            preview,
        }
    }
}

fn user_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("packs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn bundled_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().resource_dir().ok().map(|d| d.join("packs"))
}

fn scan(root: &Path, builtin: bool, out: &mut Vec<PackInfo>) {
    let Ok(entries) = fs::read_dir(root) else { return };
    let mut dirs: Vec<PathBuf> = entries.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
    dirs.sort();
    for dir in dirs {
        if dir.file_name().is_some_and(|n| n.to_string_lossy().starts_with('.')) {
            continue;
        }
        match Manifest::read(&dir) {
            Ok(m) => out.push(PackInfo::new(m, &dir, builtin)),
            Err(e) => eprintln!("skipping pack {}: {e}", dir.display()),
        }
    }
}

#[tauri::command]
pub fn list_packs(app: AppHandle) -> Result<Vec<PackInfo>, String> {
    let mut out = Vec::new();
    if let Some(dir) = bundled_dir(&app) {
        scan(&dir, true, &mut out);
    }
    scan(&user_dir(&app)?, false, &mut out);
    Ok(out)
}

#[derive(Debug, Deserialize)]
pub struct ImportFile {
    pub path: String,
    pub mood: Mood,
}

fn slug(name: &str) -> String {
    let s: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let s = s.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-");
    if s.is_empty() { "pack".into() } else { s.chars().take(40).collect() }
}

/// Copy loose images into a new pack folder under `root` and write its pack.json.
pub fn create_from_images(root: &Path, name: &str, files: &[ImportFile], stamp: u128) -> Result<Manifest, String> {
    if files.is_empty() {
        return Err("не выбрано ни одной картинки".into());
    }
    let id = format!("user.{}-{:x}", slug(name), stamp);
    let dir = root.join(&id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let result = (|| {
        let mut states: BTreeMap<Mood, Vec<String>> = BTreeMap::new();
        for (i, f) in files.iter().enumerate() {
            let src = Path::new(&f.path);
            let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
            if !IMAGE_EXTS.contains(&ext.as_str()) {
                return Err(format!("не картинка: {}", f.path));
            }
            let stem = src.file_stem().map(|s| slug(&s.to_string_lossy())).unwrap_or_else(|| "img".into());
            let file = format!("{i:02}-{stem}.{ext}");
            fs::copy(src, dir.join(&file)).map_err(|e| format!("{}: {e}", f.path))?;
            states.entry(f.mood).or_default().push(file);
        }
        // Every pack needs something to show at rest.
        if !states.contains_key(&Mood::Idle) {
            let first = states.values().next().and_then(|v| v.first()).cloned().expect("non-empty");
            states.insert(Mood::Idle, vec![first]);
        }
        let m = Manifest {
            id: id.clone(),
            name: name.trim().to_string(),
            author: String::new(),
            version: default_version(),
            license: "personal".into(),
            states,
            frames: BTreeMap::new(),
            style: Style::default(),
        };
        m.validate(&dir)?;
        let json = serde_json::to_string_pretty(&m).map_err(|e| e.to_string())?;
        fs::write(dir.join("pack.json"), json).map_err(|e| e.to_string())?;
        Ok(m)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&dir);
    }
    result
}

fn copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &to)?;
        } else {
            fs::copy(entry.path(), to)?;
        }
    }
    Ok(())
}

/// Unpack a `.fampack` zip into `dest`, refusing entries that would escape it.
pub fn extract_zip(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("не zip-архив: {e}"))?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = entry.enclosed_name() else {
            return Err("недопустимый путь в архиве".to_string());
        };
        let out = dest.join(rel);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut w = fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut w).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// The folder holding pack.json: the root itself or its single subfolder.
fn manifest_root(dir: &Path) -> Option<PathBuf> {
    if dir.join("pack.json").is_file() {
        return Some(dir.to_path_buf());
    }
    let subs: Vec<PathBuf> = fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
    match subs.as_slice() {
        [only] if only.join("pack.json").is_file() => Some(only.clone()),
        _ => None,
    }
}

/// Install a pack from a folder or a `.fampack`/`.zip` into `root`, replacing an older copy.
pub fn install(root: &Path, source: &Path, stamp: u128) -> Result<Manifest, String> {
    let staging = root.join(format!(".import-{stamp:x}"));
    let _ = fs::remove_dir_all(&staging);
    let result = (|| {
        if source.is_dir() {
            copy_dir(source, &staging).map_err(|e| e.to_string())?;
        } else {
            fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
            extract_zip(source, &staging)?;
        }
        let pack_dir = manifest_root(&staging).ok_or("в паке нет pack.json")?;
        let m = Manifest::read(&pack_dir)?;
        let target = root.join(&m.id);
        if target.exists() {
            fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
        }
        fs::rename(&pack_dir, &target).map_err(|e| e.to_string())?;
        Ok(m)
    })();
    let _ = fs::remove_dir_all(&staging);
    result
}

fn stamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default()
}

#[tauri::command]
pub fn import_gifs(app: AppHandle, name: String, files: Vec<ImportFile>) -> Result<String, String> {
    Ok(create_from_images(&user_dir(&app)?, &name, &files, stamp())?.id)
}

#[tauri::command]
pub fn import_pack(app: AppHandle, path: String) -> Result<String, String> {
    Ok(install(&user_dir(&app)?, Path::new(&path), stamp())?.id)
}

#[tauri::command]
pub fn delete_pack(app: AppHandle, id: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("неверный id".into());
    }
    let dir = user_dir(&app)?.join(&id);
    if !dir.join("pack.json").is_file() {
        return Err("это встроенный пак или его уже нет".into());
    }
    fs::remove_dir_all(dir).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write(dir: &Path, file: &str, bytes: &[u8]) {
        if let Some(p) = dir.join(file).parent() {
            fs::create_dir_all(p).unwrap();
        }
        fs::write(dir.join(file), bytes).unwrap();
    }

    fn sample(dir: &Path) {
        write(dir, "idle.gif", b"GIF89a");
        write(dir, "think.png", b"png");
        write(
            dir,
            "pack.json",
            br#"{"id":"author.cat","name":"Cat","states":{"idle":["idle.gif"],"thinking":["think.png"]},
                "frames":{"intro":[["idle.gif",80]]},"style":{"card":true,"scale":1.2}}"#,
        );
    }

    #[test]
    fn reads_a_valid_pack_with_defaults() {
        let t = tempfile::tempdir().unwrap();
        sample(t.path());
        let m = Manifest::read(t.path()).unwrap();
        assert_eq!(m.version, "1.0.0");
        assert_eq!(m.style.card, Card::Flag(true));
        assert_eq!(m.frames[&Mood::Intro], vec![("idle.gif".to_string(), 80)]);
    }

    #[test]
    fn rejects_bad_packs() {
        let t = tempfile::tempdir().unwrap();
        write(t.path(), "a.gif", b"x");
        let check = |json: &str| {
            fs::write(t.path().join("pack.json"), json).unwrap();
            Manifest::read(t.path()).unwrap_err()
        };
        assert!(check(r#"{"id":"Bad Id","name":"x","states":{"idle":["a.gif"]}}"#).contains("id"));
        assert!(check(r#"{"id":"ok","name":"x","states":{"thinking":["a.gif"]}}"#).contains("idle"));
        assert!(check(r#"{"id":"ok","name":"x","states":{"idle":["../a.gif"]}}"#).contains("путь"));
        assert!(check(r#"{"id":"ok","name":"x","states":{"idle":["missing.gif"]}}"#).contains("нет файла"));
        assert!(check(r#"{"id":"ok","name":"x","states":{"idle":["a.gif"]},"style":{"card":"maybe"}}"#).contains("card"));
        assert!(check(r#"{"id":"ok","name":"x","states":{"idle":["pack.json"]}}"#).contains("не картинка"));
    }

    #[test]
    fn creates_a_pack_from_loose_images() {
        let src = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        write(src.path(), "Котик Typing.gif", b"GIF89a");
        let files = vec![ImportFile { path: src.path().join("Котик Typing.gif").to_string_lossy().into(), mood: Mood::Talking }];
        let m = create_from_images(root.path(), "Мои котики", &files, 0xabc).unwrap();
        assert!(m.id.starts_with("user.") && m.id.ends_with("-abc"));
        // No idle image chosen: the first one is used at rest too.
        assert_eq!(m.states[&Mood::Idle], m.states[&Mood::Talking]);
        assert!(Manifest::read(&root.path().join(&m.id)).is_ok());
    }

    #[test]
    fn installs_from_folder_and_zip_and_blocks_zip_slip() {
        let src = tempfile::tempdir().unwrap();
        sample(src.path());
        let root = tempfile::tempdir().unwrap();
        assert_eq!(install(root.path(), src.path(), 1).unwrap().id, "author.cat");
        assert!(root.path().join("author.cat/pack.json").is_file());

        // Zip with the pack inside a top-level folder.
        let zip_path = src.path().join("cat.fampack");
        {
            let mut z = zip::ZipWriter::new(fs::File::create(&zip_path).unwrap());
            let opts = zip::write::SimpleFileOptions::default();
            for f in ["pack.json", "idle.gif", "think.png"] {
                z.start_file(format!("cat/{f}"), opts).unwrap();
                z.write_all(&fs::read(src.path().join(f)).unwrap()).unwrap();
            }
            z.finish().unwrap();
        }
        assert_eq!(install(root.path(), &zip_path, 2).unwrap().id, "author.cat");
        assert!(fs::read_dir(root.path()).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().starts_with(".import")));

        let evil = src.path().join("evil.fampack");
        {
            let mut z = zip::ZipWriter::new(fs::File::create(&evil).unwrap());
            z.start_file("../escape.gif", zip::write::SimpleFileOptions::default()).unwrap();
            z.write_all(b"x").unwrap();
            z.finish().unwrap();
        }
        assert!(install(root.path(), &evil, 3).unwrap_err().contains("недопустимый"));
        assert!(!root.path().parent().unwrap().join("escape.gif").exists());
    }
}
