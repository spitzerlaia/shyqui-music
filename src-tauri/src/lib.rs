use std::fs;
use std::io::{Cursor, Read};
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
    pub source: String,
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
    #[serde(default)]
    pub source: String,
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
            source: "youtube".to_string(),
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

#[derive(Deserialize)]
struct HinaiFilters {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    sort: Option<String>,
    #[serde(default)]
    genre: Option<i64>,
    #[serde(default)]
    language: Option<i64>,
    #[serde(default)]
    page: Option<i64>,
}

#[tauri::command]
async fn search_hinai(query: String, filters: Option<HinaiFilters>) -> Result<(Vec<SearchResult>, Vec<ChannelInfo>), String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| format!("[Hinai Client Error] {}", e))?;

    let mut url = format!("https://catboy.best/api/v2/search?q={}&limit=50", query);

    if let Some(f) = filters {
        if let Some(status) = f.status {
            if !status.is_empty() {
                url.push_str(&format!("&status={}", status));
            }
        }
        if let Some(sort) = f.sort {
            if !sort.is_empty() {
                url.push_str(&format!("&sort={}", sort));
            }
        }
        if let Some(genre) = f.genre {
            if genre > 0 {
                url.push_str(&format!("&genre={}", genre));
            }
        }
        if let Some(language) = f.language {
            if language > 0 {
                url.push_str(&format!("&language={}", language));
            }
        }
        if let Some(page) = f.page {
            url.push_str(&format!("&page={}", page));
        }
    }

    let resp = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("[Hinai Search Error] {}", e))?;

    if resp.status().is_client_error() || resp.status().is_server_error() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("[Hinai API Error] {} - {}", status, body));
    }

    let raw: Vec<serde_json::Value> = resp.json().await
        .map_err(|e| format!("[Hinai Parse Error] {}", e))?;

    let mut results = Vec::new();
    for item in raw.iter() {
        let set_id = item.get("id")
            .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
            .unwrap_or(0);

        let artist = item.get("artist")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown");

        let title = item.get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown");

        let creator = item.get("creator").and_then(|v| v.as_str()).unwrap_or("");

        let duration_secs = item.get("beatmaps")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|bm| bm.get("total_length").or_else(|| bm.get("TotalLength")))
            .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
            .unwrap_or(0);

        let mins = duration_secs / 60;
        let secs = duration_secs % 60;
        let duration_str = format!("{:02}:{:02}", mins, secs);

        results.push(SearchResult {
            id: set_id.to_string(),
            title: format!("{} - {} ({})", artist, title, creator),
            duration: duration_str,
            thumbnail: format!("https://assets.ppy.sh/beatmaps/{}/covers/cover.jpg", set_id),
            channel: artist.to_string(),
            channel_id: String::new(),
            channel_url: String::new(),
            source: "hinai".to_string(),
        });
    }

    Ok((results, Vec::new()))
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

#[tauri::command]
async fn download_hinai_audio(app: AppHandle, beatmap_id: String, meta: Option<SongMeta>) -> Result<String, String> {
    let cache_dir = app.path().app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("tracks");

    fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let _ = purge_stale_cache(&cache_dir);

    let file_path = cache_dir.join(format!("{}.mp3", beatmap_id));

    if file_path.exists() {
        return Ok(file_path.to_string_lossy().to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| format!("[Hinai Client Error] {}", e))?;

    // Step 1: query the mirror API to get the real download URL
    let mirror_url = format!("https://mirror.hinamizawa.ai/d/{}", beatmap_id);
    let resp = client.get(&mirror_url)
        .send()
        .await
        .map_err(|e| format!("[Hinai Mirror Error] {}", e))?;
    if resp.status().is_client_error() || resp.status().is_server_error() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("[Hinai Mirror Error] {} - {}", status, body));
    }
    let mirror_json: serde_json::Value = resp.json().await
        .map_err(|e| format!("[Hinai Mirror Parse Error] {}", e))?;
    let real_url = mirror_json.get("download_url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "[Hinai Error] No download_url in mirror response".to_string())?;

    // Step 2: download the actual .osz file
    let resp = client.get(real_url)
        .send()
        .await
        .map_err(|e| format!("[Hinai Download Error] {}", e))?;
    if resp.status().is_client_error() || resp.status().is_server_error() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("[Hinai Download Error] {} - {}", status, body));
    }

    let bytes = resp.bytes()
        .await
        .map_err(|e| format!("[Hinai Read Error] {}", e))?
        .to_vec();

    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("[Zip Error] {}", e))?;

    let mut audio_data: Option<Vec<u8>> = None;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("[Zip Read Error] {}", e))?;
        let name = file.name().to_lowercase();
        if name.ends_with(".mp3") || name.ends_with(".ogg") {
            let mut buf = Vec::new();
            file.read_to_end(&mut buf)
                .map_err(|e| format!("[Audio Read Error] {}", e))?;
            audio_data = Some(buf);
            break;
        }
    }

    match audio_data {
        Some(data) => {
            fs::write(&file_path, &data).map_err(|e| e.to_string())?;
            if let Some(m) = meta {
                let meta_path = cache_dir.join(format!("{}.json", beatmap_id));
                let json = serde_json::to_string(&m).map_err(|e| e.to_string())?;
                let _ = fs::write(&meta_path, json);
            }
            Ok(file_path.to_string_lossy().to_string())
        }
        None => Err("No audio file found in beatmap".to_string()),
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
    pub source: String,
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
        source: String::new(),
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
                source: m.source,
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
            search_hinai,
            download_audio,
            download_hinai_audio,
            get_channel_videos,
            get_downloaded_songs,
            delete_downloaded_song
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
