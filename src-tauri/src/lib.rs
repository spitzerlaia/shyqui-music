use std::fs;
use std::path::Path;
use std::time::{SystemTime, Duration};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use serde::{Serialize, Deserialize};

const MAX_FILE_LIFETIME: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub duration: String,
    pub thumbnail: String,
    pub channel: String,
    pub channel_id: String,
    pub channel_url: String,
}

#[derive(Serialize)]
pub struct ChannelInfo {
    pub id: String,
    pub name: String,
    pub url: String,
    pub thumbnail: String,
}

#[derive(Serialize, Deserialize)]
pub struct SongMeta {
    pub id: String,
    pub title: String,
    pub thumbnail: String,
    #[serde(default)]
    pub channel: String,
    #[serde(default)]
    pub channel_id: String,
    #[serde(default)]
    pub channel_url: String,
    #[serde(default)]
    pub duration: String,
}

fn purge_stale_cache(cache_path: &Path) -> std::io::Result<()> {
    if !cache_path.exists() { return Ok(()); }
    for entry in fs::read_dir(cache_path)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            if let Ok(meta) = fs::metadata(&path) {
                let modified = meta.modified().unwrap_or(SystemTime::now());
                if modified.elapsed().unwrap_or_default() > MAX_FILE_LIFETIME {
                    let _ = fs::remove_file(path);
                }
            }
        }
    }
    Ok(())
}

fn parse_results(stdout: &[u8]) -> Vec<SearchResult> {
    let non_song = ["interview", "podcast", "trailer", "tutorial", "review", "reaction", "vlog", "let's play", "gameplay", "highlights"];
    let mut results = Vec::new();
    for line in String::from_utf8_lossy(stdout).lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() < 3 { continue; }
        let id = parts[0].to_string();
        let title = parts[1].trim();
        if title.is_empty() || title == "0:00" { continue; }
        if non_song.iter().any(|kw| title.to_lowercase().contains(kw)) { continue; }
        let channel = if parts.len() > 3 && !parts[3].is_empty() { parts[3].to_string() } else { String::new() };
        let channel_id = if parts.len() > 4 && !parts[4].is_empty() { parts[4].to_string() } else { String::new() };
        results.push(SearchResult {
            thumbnail: format!("https://img.youtube.com/vi/{}/0.jpg", id),
            channel_url: if channel_id.starts_with("UC") { format!("https://www.youtube.com/channel/{}", channel_id) } else { String::new() },
            id, title: parts[1].to_string(), duration: parts[2].to_string(), channel, channel_id,
        });
    }
    results
}

fn extract_channels(results: &[SearchResult]) -> Vec<ChannelInfo> {
    let mut seen = std::collections::HashSet::new();
    results.iter()
        .filter(|r| !r.channel_id.is_empty() && seen.insert(r.channel_id.clone()))
        .map(|r| ChannelInfo {
            id: r.channel_id.clone(),
            name: r.channel.clone(),
            url: r.channel_url.clone(),
            thumbnail: String::new(),
        })
        .collect()
}

#[tauri::command]
async fn search_youtube(app: AppHandle, query: String) -> Result<(Vec<SearchResult>, Vec<ChannelInfo>), String> {
    let output = app.shell().sidecar("yt-dlp")
        .map_err(|e| format!("[Shell Error] {}", e))?
        .args([
            "--print", "%(id)s|%(title)s|%(duration_string)s|%(channel)s|%(channel_id)s",
            "--flat-playlist",
            "--match-filter", "duration > 30",
            "--playlist-end", "10",
            &format!("ytsearch10:{}", query),
        ])
        .output()
        .await
        .map_err(|e| format!("[Network Error] {}", e))?;

    let results = parse_results(&output.stdout);
    let channels = extract_channels(&results);
    Ok((results, channels))
}

#[tauri::command]
async fn get_channel_videos(app: AppHandle, channel_url: String) -> Result<Vec<SearchResult>, String> {
    let output = app.shell().sidecar("yt-dlp")
        .map_err(|e| format!("[Shell Error] {}", e))?
        .args([
            "--flat-playlist",
            "--print", "%(id)s|%(title)s|%(duration_string)s|%(channel)s|%(channel_id)s",
            "--playlist-end", "50",
            "--match-filter", "duration > 30",
            &format!("{}/videos", channel_url),
        ])
        .output()
        .await
        .map_err(|e| format!("[Channel Error] {}", e))?;

    Ok(parse_results(&output.stdout))
}

#[tauri::command]
async fn download_audio(app: AppHandle, video_id: String, meta: Option<SongMeta>) -> Result<String, String> {
    let cache_dir = app.path().app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("tracks");

    fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let _ = purge_stale_cache(&cache_dir);

    let file_path = cache_dir.join(format!("{}.mp3", video_id));

    if file_path.exists() {
        return Ok(file_path.to_string_lossy().to_string());
    }

    let sidecar = app.shell().sidecar("yt-dlp")
        .map_err(|e| e.to_string())?
        .args([
            "-x", "--audio-format", "mp3",
            "--no-playlist",
            "-o", &format!("{}/%(id)s.%(ext)s", cache_dir.to_string_lossy()),
            &format!("https://www.youtube.com/watch?v={}", video_id),
        ]);

    let output = sidecar.output().await.map_err(|e| e.to_string())?;

    if output.status.success() {
        if let Some(m) = meta {
            let meta_path = cache_dir.join(format!("{}.json", video_id));
            let json = serde_json::to_string(&m).map_err(|e| e.to_string())?;
            let _ = fs::write(&meta_path, json);
        }
        Ok(file_path.to_string_lossy().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[derive(Serialize)]
pub struct DownloadedSong {
    pub id: String,
    pub title: String,
    pub thumbnail: String,
    pub channel: String,
    pub channel_id: String,
    pub channel_url: String,
    pub duration: String,
    pub size: u64,
    pub file_path: String,
}

fn meta_default(id: &str) -> SongMeta {
    SongMeta {
        id: id.to_string(),
        title: id.to_string(),
        thumbnail: format!("https://img.youtube.com/vi/{}/0.jpg", id),
        channel: String::new(),
        channel_id: String::new(),
        channel_url: String::new(),
        duration: String::new(),
    }
}

#[tauri::command]
async fn get_downloaded_songs(app: AppHandle) -> Result<Vec<DownloadedSong>, String> {
    let cache_dir = app.path().app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("tracks");
    if !cache_dir.exists() { return Ok(Vec::new()); }
    let mut songs = Vec::new();
    for entry in fs::read_dir(&cache_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("mp3") {
            let id = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            let file_path = path.to_string_lossy().to_string();
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

            let meta_path = cache_dir.join(format!("{}.json", id));
            let m = if meta_path.exists() {
                fs::read_to_string(&meta_path)
                    .ok()
                    .and_then(|json| serde_json::from_str::<SongMeta>(&json).ok())
                    .unwrap_or_else(|| meta_default(&id))
            } else {
                meta_default(&id)
            };

            songs.push(DownloadedSong {
                id, size, file_path,
                title: m.title,
                thumbnail: m.thumbnail,
                channel: m.channel,
                channel_id: m.channel_id,
                channel_url: m.channel_url,
                duration: m.duration,
            });
        }
    }
    Ok(songs)
}

#[tauri::command]
async fn delete_downloaded_song(app: AppHandle, video_id: String) -> Result<(), String> {
    let cache_dir = app.path().app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("tracks");
    let file_path = cache_dir.join(format!("{}.mp3", video_id));
    fs::remove_file(&file_path).map_err(|e| format!("[Delete Error] {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            search_youtube,
            download_audio,
            get_channel_videos,
            get_downloaded_songs,
            delete_downloaded_song
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}