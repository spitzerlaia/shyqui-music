use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, Duration};
use std::sync::Arc;
use tauri::{AppHandle, Manager, Emitter};
use tauri_plugin_shell::ShellExt;
use serde::{Serialize, Deserialize};

mod state;
mod server;
mod auth;

const MAX_FILE_LIFETIME: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Serialize, Deserialize, Clone, Debug)]
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

#[derive(Serialize, Clone)]
pub struct ChannelInfo {
    pub id: String,
    pub name: String,
    pub url: String,
    pub thumbnail: String,
}

#[derive(Serialize, Deserialize, Clone)]
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

// ── Inner functions (callable from both Tauri commands and HTTP server) ──

pub async fn search_youtube_inner(app: &AppHandle, query: &str) -> Result<(Vec<SearchResult>, Vec<ChannelInfo>), String> {
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
pub struct HinaiFilters {
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

pub async fn search_hinai_inner(query: String, filters: Option<HinaiFilters>) -> Result<(Vec<SearchResult>, Vec<ChannelInfo>), String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| format!("[Hinai Client Error] {}", e))?;

    let mut url = format!("https://catboy.best/api/v2/search?q={}&limit=50", query);

    if let Some(f) = filters {
        if let Some(status) = f.status { if !status.is_empty() { url.push_str(&format!("&status={}", status)); } }
        if let Some(sort) = f.sort { if !sort.is_empty() { url.push_str(&format!("&sort={}", sort)); } }
        if let Some(genre) = f.genre { if genre > 0 { url.push_str(&format!("&genre={}", genre)); } }
        if let Some(language) = f.language { if language > 0 { url.push_str(&format!("&language={}", language)); } }
        if let Some(page) = f.page { url.push_str(&format!("&page={}", page)); }
    }

    let resp = client.get(&url).send().await.map_err(|e| format!("[Hinai Search Error] {}", e))?;
    if resp.status().is_client_error() || resp.status().is_server_error() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("[Hinai API Error] {} - {}", status, body));
    }

    let raw: Vec<serde_json::Value> = resp.json().await.map_err(|e| format!("[Hinai Parse Error] {}", e))?;
    let mut results = Vec::new();
    for item in raw.iter() {
        let set_id = item.get("id").and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0);
        let artist = item.get("artist").and_then(|v| v.as_str()).unwrap_or("Unknown");
        let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown");
        let creator = item.get("creator").and_then(|v| v.as_str()).unwrap_or("");
        let duration_secs = item.get("beatmaps").and_then(|v| v.as_array()).and_then(|arr| arr.first()).and_then(|bm| bm.get("total_length").or_else(|| bm.get("TotalLength"))).and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0);
        let mins = duration_secs / 60;
        let secs = duration_secs % 60;
        results.push(SearchResult {
            id: set_id.to_string(),
            title: format!("{} - {} ({})", artist, title, creator),
            duration: format!("{:02}:{:02}", mins, secs),
            thumbnail: format!("https://assets.ppy.sh/beatmaps/{}/covers/cover.jpg", set_id),
            channel: artist.to_string(),
            channel_id: String::new(),
            channel_url: String::new(),
            source: "hinai".to_string(),
        });
    }
    Ok((results, Vec::new()))
}

pub async fn get_channel_videos_inner(app: &AppHandle, channel_url: &str) -> Result<Vec<SearchResult>, String> {
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

pub async fn download_audio_inner(app: &AppHandle, video_id: &str, meta: Option<SongMeta>) -> Result<String, String> {
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("tracks");
    fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let _ = purge_stale_cache(&cache_dir);
    let file_path = cache_dir.join(format!("{}.mp3", video_id));
    if file_path.exists() { return Ok(file_path.to_string_lossy().to_string()); }

    let output = app.shell().sidecar("yt-dlp")
        .map_err(|e| e.to_string())?
        .args(["-x", "--audio-format", "mp3", "--no-playlist",
            "-o", &format!("{}/%(id)s.%(ext)s", cache_dir.to_string_lossy()),
            &format!("https://www.youtube.com/watch?v={}", video_id)])
        .output().await.map_err(|e| e.to_string())?;

    if output.status.success() {
        if let Some(m) = meta {
            let meta_path = cache_dir.join(format!("{}.json", video_id));
            let _ = fs::write(&meta_path, serde_json::to_string(&m).map_err(|e| e.to_string())?);
        }
        Ok(file_path.to_string_lossy().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub async fn download_hinai_audio_inner(app: &AppHandle, beatmap_id: &str, meta: Option<SongMeta>) -> Result<String, String> {
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("tracks");
    fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let _ = purge_stale_cache(&cache_dir);
    let file_path = cache_dir.join(format!("{}.mp3", beatmap_id));
    if file_path.exists() { return Ok(file_path.to_string_lossy().to_string()); }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build().map_err(|e| format!("[Hinai Client Error] {}", e))?;

    let mirror_url = format!("https://mirror.hinamizawa.ai/d/{}", beatmap_id);
    let resp = client.get(&mirror_url).send().await.map_err(|e| format!("[Hinai Mirror Error] {}", e))?;
    if resp.status().is_client_error() || resp.status().is_server_error() {
        return Err(format!("[Hinai Mirror Error] {} - {}", resp.status(), resp.text().await.unwrap_or_default()));
    }
    let mirror_json: serde_json::Value = resp.json().await.map_err(|e| format!("[Hinai Mirror Parse Error] {}", e))?;
    let real_url = mirror_json.get("download_url").and_then(|v| v.as_str()).ok_or_else(|| "[Hinai Error] No download_url".to_string())?;

    let resp = client.get(real_url).send().await.map_err(|e| format!("[Hinai Download Error] {}", e))?;
    if resp.status().is_client_error() || resp.status().is_server_error() {
        return Err(format!("[Hinai Download Error] {} - {}", resp.status(), resp.text().await.unwrap_or_default()));
    }
    let bytes = resp.bytes().await.map_err(|e| format!("[Hinai Read Error] {}", e))?.to_vec();
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("[Zip Error] {}", e))?;

    let mut audio_data: Option<Vec<u8>> = None;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("[Zip Read Error] {}", e))?;
        let name = file.name().to_lowercase();
        if name.ends_with(".mp3") || name.ends_with(".ogg") {
            let mut buf = Vec::new();
            file.read_to_end(&mut buf).map_err(|e| format!("[Audio Read Error] {}", e))?;
            audio_data = Some(buf);
            break;
        }
    }
    match audio_data {
        Some(data) => {
            fs::write(&file_path, &data).map_err(|e| e.to_string())?;
            if let Some(m) = meta {
                let meta_path = cache_dir.join(format!("{}.json", beatmap_id));
                let _ = fs::write(&meta_path, serde_json::to_string(&m).map_err(|e| e.to_string())?);
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
        channel: String::new(), channel_id: String::new(),
        channel_url: String::new(), duration: String::new(), source: String::new(),
    }
}

pub async fn get_downloaded_songs_inner(app: &AppHandle) -> Result<Vec<DownloadedSong>, String> {
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("tracks");
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
                fs::read_to_string(&meta_path).ok().and_then(|json| serde_json::from_str::<SongMeta>(&json).ok()).unwrap_or_else(|| meta_default(&id))
            } else { meta_default(&id) };
            songs.push(DownloadedSong { id, size, file_path, title: m.title, thumbnail: m.thumbnail, channel: m.channel, channel_id: m.channel_id, channel_url: m.channel_url, duration: m.duration, source: m.source });
        }
    }
    Ok(songs)
}

pub async fn fetch_url_inner(app: &AppHandle, url: &str) -> Result<(Vec<SearchResult>, Vec<ChannelInfo>), String> {
    let output = app.shell().sidecar("yt-dlp")
        .map_err(|e| format!("[Shell Error] {}", e))?
        .args([
            "--print", "%(id)s|%(title)s|%(duration_string)s|%(channel)s|%(channel_id)s",
            "--flat-playlist", "--match-filter", "duration > 30", "--playlist-end", "200", url,
        ])
        .output().await.map_err(|e| format!("[Fetch Error] {}", e))?;
    let results = parse_results(&output.stdout);
    let channels = extract_channels(&results);
    Ok((results, channels))
}

pub async fn delete_downloaded_song_inner(app: &AppHandle, video_id: &str) -> Result<(), String> {
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("tracks");
    let file_path = cache_dir.join(format!("{}.mp3", video_id));
    fs::remove_file(&file_path).map_err(|e| format!("[Delete Error] {}", e))
}

// ── Tauri Commands ──

#[tauri::command]
async fn search_youtube(app: AppHandle, query: String) -> Result<(Vec<SearchResult>, Vec<ChannelInfo>), String> {
    search_youtube_inner(&app, &query).await
}

#[tauri::command]
async fn search_hinai(query: String, filters: Option<HinaiFilters>) -> Result<(Vec<SearchResult>, Vec<ChannelInfo>), String> {
    search_hinai_inner(query, filters).await
}

#[tauri::command]
async fn get_channel_videos(app: AppHandle, channel_url: String) -> Result<Vec<SearchResult>, String> {
    get_channel_videos_inner(&app, &channel_url).await
}

#[tauri::command]
async fn download_audio(app: AppHandle, video_id: String, meta: Option<SongMeta>) -> Result<String, String> {
    download_audio_inner(&app, &video_id, meta).await
}

#[tauri::command]
async fn download_hinai_audio(app: AppHandle, beatmap_id: String, meta: Option<SongMeta>) -> Result<String, String> {
    download_hinai_audio_inner(&app, &beatmap_id, meta).await
}

#[tauri::command]
async fn get_downloaded_songs(app: AppHandle) -> Result<Vec<DownloadedSong>, String> {
    get_downloaded_songs_inner(&app).await
}

#[tauri::command]
async fn fetch_url(app: AppHandle, url: String) -> Result<(Vec<SearchResult>, Vec<ChannelInfo>), String> {
    fetch_url_inner(&app, &url).await
}

#[tauri::command]
async fn delete_downloaded_song(app: AppHandle, video_id: String) -> Result<(), String> {
    delete_downloaded_song_inner(&app, &video_id).await
}

#[tauri::command]
async fn get_server_info(state: tauri::State<'_, Arc<tokio::sync::RwLock<state::ServerState>>>) -> Result<state::ServerInfo, String> {
    let s = state.read().await;
    Ok(state::ServerInfo {
        port: s.port,
        local_ip: s.local_ip.clone(),
        external_ip: s.external_ip.clone(),
        url: format!("http://{}:{}", s.local_ip, s.port),
        available: s.available,
        web_enabled: s.web_enabled,
        upnp_ok: s.upnp_ok,
    })
}

#[tauri::command]
async fn sync_server_state(
    app: AppHandle,
    state: tauri::State<'_, Arc<tokio::sync::RwLock<state::ServerState>>>,
    queue: Vec<SearchResult>,
    queue_idx: i32,
    current_id: Option<String>,
    current_title: String,
    current_thumb: String,
    playing: bool,
    current_time: f64,
    duration: f64,
    volume: f64,
) -> Result<(), String> {
    let mut s = state.write().await;
    s.queue = queue;
    s.queue_idx = queue_idx;
    s.current_id = current_id;
    s.current_title = current_title;
    s.current_thumb = current_thumb;
    s.playing = playing;
    s.current_time = current_time;
    s.duration = duration;
    s.volume = volume;
    app.emit("state-synced", ()).ok();
    Ok(())
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

#[tauri::command]
async fn toggle_web_server(
    app: AppHandle,
    enabled: bool,
    state: tauri::State<'_, state::SharedState>,
    shutdown: tauri::State<'_, state::ShutdownHandle>,
    auth_store: tauri::State<'_, auth::AuthStoreRef>,
) -> Result<state::ServerInfo, String> {
    if enabled {
        let s = state.read().await;
        if s.available {
            return Ok(state::ServerInfo {
                port: s.port,
                local_ip: s.local_ip.clone(),
                external_ip: s.external_ip.clone(),
                url: format!("http://{}:{}", s.local_ip, s.port),
                available: true,
                web_enabled: true,
                upnp_ok: s.upnp_ok,
            });
        }
        drop(s);

        let cache_dir = app.path().app_cache_dir()
            .map_err(|e| e.to_string())?
            .join("tracks");
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

        let dist_dir = app.path().resource_dir()
            .map_err(|e| e.to_string())?
            .join("../dist");
        let dist_dir = if dist_dir.exists() { dist_dir } else { PathBuf::from("../dist") };

        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        let state_clone = state.inner().clone();
        let cache_clone = cache_dir.clone();
        let dist_clone = dist_dir.clone();
        let handle_clone = app.clone();
        let auth_clone = auth_store.inner().clone();

        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                server::start_server(state_clone, cache_clone, dist_clone, handle_clone, auth_clone, rx).await;
            });
        });

        {
            let mut s = state.write().await;
            s.web_enabled = true;
        }

        *shutdown.lock().map_err(|e| e.to_string())? = Some(tx);

        tokio::time::sleep(Duration::from_millis(500)).await;

        let s = state.read().await;
        Ok(state::ServerInfo {
            port: s.port,
            local_ip: s.local_ip.clone(),
            external_ip: s.external_ip.clone(),
            url: format!("http://{}:{}", s.local_ip, s.port),
            available: s.available,
            web_enabled: s.web_enabled,
            upnp_ok: s.upnp_ok,
        })
    } else {
        let tx = shutdown.lock().map_err(|e| e.to_string())?.take();
        if let Some(tx) = tx {
            let _ = tx.send(());
        }
        let mut s = state.write().await;
        s.available = false;
        s.web_enabled = false;
        Ok(state::ServerInfo {
            port: s.port,
            local_ip: s.local_ip.clone(),
            external_ip: s.external_ip.clone(),
            url: format!("http://{}:{}", s.local_ip, s.port),
            available: false,
            web_enabled: false,
            upnp_ok: s.upnp_ok,
        })
    }
}

#[tauri::command]
async fn generate_qr_code(url: String) -> Result<String, String> {
    let code = qrcode::QrCode::new(url.as_bytes()).map_err(|e| e.to_string())?;
    let img = code.render::<image::Luma<u8>>().build();
    let mut buf = std::io::Cursor::new(Vec::new());
    img.write_to(&mut buf, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    let b64 = base64_encode(&buf.into_inner());
    Ok(format!("data:image/png;base64,{}", b64))
}

// ── Account Management ──

#[tauri::command]
async fn list_users(auth_store: tauri::State<'_, auth::AuthStoreRef>) -> Result<Vec<auth::UserInfo>, String> {
    let store = auth_store.lock().map_err(|e| e.to_string())?;
    Ok(store.users.iter().map(|u| auth::UserInfo {
        id: u.id.clone(),
        username: u.username.clone(),
        created_at: u.created_at,
    }).collect())
}

#[tauri::command]
async fn create_user(
    username: String,
    password: String,
    auth_store: tauri::State<'_, auth::AuthStoreRef>,
) -> Result<auth::UserInfo, String> {
    if username.trim().is_empty() || password.len() < 3 {
        return Err("Username required, password min 3 chars".into());
    }
    let mut store = auth_store.lock().map_err(|e| e.to_string())?;
    if store.users.iter().any(|u| u.username == username) {
        return Err("Username already exists".into());
    }
    let hash = auth::hash_password(&password)?;
    let user = auth::StoredUser {
        id: uuid::Uuid::new_v4().to_string(),
        username: username.clone(),
        password_hash: hash,
        created_at: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
    };
    let info = auth::UserInfo {
        id: user.id.clone(),
        username: user.username.clone(),
        created_at: user.created_at,
    };
    store.users.push(user);
    store.save();
    Ok(info)
}

#[tauri::command]
async fn delete_user(
    user_id: String,
    auth_store: tauri::State<'_, auth::AuthStoreRef>,
) -> Result<(), String> {
    let mut store = auth_store.lock().map_err(|e| e.to_string())?;
    store.users.retain(|u| u.id != user_id);
    store.sessions.retain(|s| s.user_id != user_id);
    store.save();
    Ok(())
}

#[tauri::command]
async fn set_user_password(
    user_id: String,
    password: String,
    auth_store: tauri::State<'_, auth::AuthStoreRef>,
) -> Result<(), String> {
    if password.len() < 3 {
        return Err("Password must be at least 3 characters".into());
    }
    let hash = auth::hash_password(&password)?;
    let mut store = auth_store.lock().map_err(|e| e.to_string())?;
    if let Some(user) = store.users.iter_mut().find(|u| u.id == user_id) {
        user.password_hash = hash;
        store.save();
        Ok(())
    } else {
        Err("User not found".into())
    }
}

// ── App Entry Point ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(tokio::sync::RwLock::new(state::ServerState::new()));
    let shutdown_handle: state::ShutdownHandle = Arc::new(std::sync::Mutex::new(None));
    let auth_store: auth::AuthStoreRef = Arc::new(std::sync::Mutex::new(
        auth::AuthStore::new(PathBuf::from("."))
    ));

    tauri::Builder::default()
        .manage(state.clone())
        .manage(shutdown_handle.clone())
        .manage(auth_store.clone())
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
            fetch_url,
            delete_downloaded_song,
            get_server_info,
            sync_server_state,
            toggle_web_server,
            generate_qr_code,
            list_users,
            create_user,
            delete_user,
            set_user_password,
        ])
        .setup(move |app| {
            let data_dir = app.path().app_data_dir()
                .map_err(|e| e.to_string())
                .unwrap_or_else(|_| PathBuf::from("."));
            let _ = std::fs::create_dir_all(&data_dir);
            let users_path = data_dir.join("users.json");
            let store = auth::AuthStore::new(users_path);
            *auth_store.lock().expect("auth store lock") = store;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
