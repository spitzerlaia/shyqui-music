use reqwest::Client;
use rusty_ytdl::Video;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

const THUMB_BASE: &str = "https://img.youtube.com/vi";
const YOUTUBE_PLAYLIST_BASE: &str = "https://www.youtube.com/playlist?list=";

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

#[derive(Serialize, Clone, Debug)]
pub struct ChannelInfo {
    pub id: String,
    pub name: String,
    pub url: String,
    pub thumbnail: String,
}

/// Respuesta estándar para todas las búsquedas.
#[derive(Serialize, Clone, Debug)]
pub struct SearchResponse {
    pub videos: Vec<SearchResult>,
    pub channels: Vec<ChannelInfo>,
}

impl SearchResponse {
    fn empty() -> Self {
        Self {
            videos: Vec::new(),
            channels: Vec::new(),
        }
    }
}

fn format_duration(secs: u64) -> String {
    if secs == 0 {
        return String::new();
    }

    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;

    if h > 0 {
        format!("{}:{:02}:{:02}", h, m, s)
    } else {
        format!("{}:{:02}", m, s)
    }
}

fn thumbnail(id: &str) -> String {
    format!("{}/{}/mqdefault.jpg", THUMB_BASE, id)
}

fn extract_playlist_id(input: &str) -> Option<String> {
    let query = input.trim().split_once('?')?.1;
    let query = query.split('#').next().unwrap_or("");

    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));

        if key == "list" && !value.is_empty() {
            return Some(value.to_string());
        }
    }

    None
}

fn extract_video_id(input: &str) -> Option<String> {
    let input = input.trim();

    // ID directo de YouTube.
    if input.len() == 11
        && input
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Some(input.to_string());
    }

    // URL normal: youtube.com/watch?v=...
    if let Some(pos) = input.find("v=") {
        let rest = &input[pos + 2..];
        let id = rest.split(['&', '#']).next().unwrap_or("");

        if id.len() == 11 {
            return Some(id.to_string());
        }
    }

    // URL corta: youtu.be/...
    if let Some(pos) = input.find("youtu.be/") {
        let rest = &input[pos + 9..];
        let id = rest.split(['?', '&', '/', '#']).next().unwrap_or("");

        if id.len() == 11 {
            return Some(id.to_string());
        }
    }

    // Shorts, embed, live y formatos alternativos.
    for marker in ["/shorts/", "/embed/", "/live/", "/v/"] {
        if let Some(pos) = input.find(marker) {
            let rest = &input[pos + marker.len()..];
            let id = rest.split(['?', '&', '/', '#']).next().unwrap_or("");

            if id.len() == 11 {
                return Some(id.to_string());
            }
        }
    }

    None
}

async fn video_info_core(id: &str) -> Result<SearchResult, String> {
    let video = Video::new(id.to_string()).map_err(|e| format!("[Video Error] {}", e))?;

    let info = video
        .get_info()
        .await
        .map_err(|e| format!("[Info Error] {}", e))?;

    let details = info.video_details;
    let duration = details.length_seconds.parse::<u64>().unwrap_or(0);
    let channel_id = details.channel_id.clone();

    Ok(SearchResult {
        id: id.to_string(),
        title: details.title,
        duration: format_duration(duration),
        thumbnail: thumbnail(id),
        channel: details.owner_channel_name,
        channel_id: channel_id.clone(),
        channel_url: format!("https://www.youtube.com/channel/{}", channel_id),
        source: "youtube".to_string(),
    })
}

fn extract_text(value: &Value) -> Option<String> {
    match value {
        Value::String(s) if !s.trim().is_empty() => Some(s.clone()),

        Value::Object(map) => {
            if let Some(Value::String(s)) = map.get("simpleText") {
                if !s.trim().is_empty() {
                    return Some(s.clone());
                }
            }

            if let Some(Value::Array(runs)) = map.get("runs") {
                let text: String = runs
                    .iter()
                    .filter_map(|run| run.get("text").and_then(Value::as_str))
                    .collect();

                if !text.trim().is_empty() {
                    return Some(text);
                }
            }

            for child in map.values() {
                if let Some(text) = extract_text(child) {
                    return Some(text);
                }
            }

            None
        }

        Value::Array(items) => {
            for item in items {
                if let Some(text) = extract_text(item) {
                    return Some(text);
                }
            }

            None
        }

        _ => None,
    }
}

fn time_text_to_secs(text: &str) -> u64 {
    let parts: Vec<&str> = text.trim().split(':').collect();

    match parts.as_slice() {
        [m, s] => m.parse::<u64>().unwrap_or(0) * 60 + s.parse::<u64>().unwrap_or(0),
        [h, m, s] => {
            h.parse::<u64>().unwrap_or(0) * 3600
                + m.parse::<u64>().unwrap_or(0) * 60
                + s.parse::<u64>().unwrap_or(0)
        }
        [value] => value.parse::<u64>().unwrap_or(0),
        _ => 0,
    }
}

fn parse_json_after_marker(text: &str, marker: &str) -> Result<Value, String> {
    let marker_pos = text
        .find(marker)
        .ok_or_else(|| format!("No se encontró el marcador {}", marker))?;

    let after = &text[marker_pos + marker.len()..];

    let json_start = after
        .find('{')
        .ok_or_else(|| format!("No se encontró JSON después de {}", marker))?;

    let mut deserializer = serde_json::Deserializer::from_str(&after[json_start..]);

    <Value as Deserialize>::deserialize(&mut deserializer)
        .map_err(|e| format!("[JSON Error] {}", e))
}

fn find_next_token(value: &Value) -> Option<String> {
    match value {
        Value::Object(map) => {
            let token = map
                .get("continuationItemRenderer")
                .and_then(|v| v.get("continuationEndpoint"))
                .and_then(|v| v.get("continuationCommand"))
                .and_then(|v| v.get("token"))
                .and_then(Value::as_str)
                .or_else(|| {
                    map.get("nextContinuationData")
                        .and_then(|v| v.get("continuation"))
                        .and_then(Value::as_str)
                });

            if let Some(token) = token {
                if !token.is_empty() {
                    return Some(token.to_string());
                }
            }

            for child in map.values() {
                if let Some(token) = find_next_token(child) {
                    return Some(token);
                }
            }

            None
        }

        Value::Array(items) => {
            for item in items {
                if let Some(token) = find_next_token(item) {
                    return Some(token);
                }
            }

            None
        }

        _ => None,
    }
}

fn collect_playlist_videos(
    value: &Value,
    playlist_id: &str,
    videos: &mut Vec<SearchResult>,
    seen: &mut HashSet<String>,
    allow_missing_playlist_id: bool,
) {
    match value {
        Value::Object(map) => {
            if let Some(lockup) = map.get("lockupViewModel") {
                let video_id = lockup.get("contentId").and_then(Value::as_str);

                let endpoint_playlist_id = lockup
                    .pointer(
                        "/rendererContext/commandContext/onTap/innertubeCommand/watchEndpoint/playlistId",
                    )
                    .and_then(Value::as_str);

                let belongs_to_playlist = match endpoint_playlist_id {
                    Some(found_id) => found_id == playlist_id,
                    None => allow_missing_playlist_id,
                };

                if let Some(video_id) = video_id {
                    if belongs_to_playlist
                        && video_id.len() == 11
                        && seen.insert(video_id.to_string())
                    {
                        let title = lockup
                            .pointer("/metadata/lockupMetadataViewModel/title")
                            .and_then(extract_text)
                            .unwrap_or_default();

                        videos.push(SearchResult {
                            id: video_id.to_string(),
                            title,
                            duration: String::new(),
                            thumbnail: thumbnail(video_id),
                            channel: String::new(),
                            channel_id: String::new(),
                            channel_url: String::new(),
                            source: "youtube".to_string(),
                        });
                    }
                }
            }

            for child in map.values() {
                collect_playlist_videos(
                    child,
                    playlist_id,
                    videos,
                    seen,
                    allow_missing_playlist_id,
                );
            }
        }

        Value::Array(items) => {
            for item in items {
                collect_playlist_videos(item, playlist_id, videos, seen, allow_missing_playlist_id);
            }
        }

        _ => {}
    }
}

async fn fetch_playlist(playlist_id: &str) -> Result<Vec<SearchResult>, String> {
    if playlist_id.is_empty() {
        return Err("[Playlist Error] ID vacío".to_string());
    }

    let client = Client::builder()
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
             AppleWebKit/537.36 (KHTML, like Gecko) \
             Chrome/131.0.0.0 Safari/537.36",
        )
        .build()
        .map_err(|e| format!("[Client Error] {}", e))?;

    let playlist_url = format!("{}{}", YOUTUBE_PLAYLIST_BASE, playlist_id);

    let response = client
        .get(&playlist_url)
        .send()
        .await
        .map_err(|e| format!("[Playlist Request Error] {}", e))?;

    if !response.status().is_success() {
        return Err(format!("[Playlist HTTP Error] {}", response.status()));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("[Playlist Body Error] {}", e))?;

    let initial_data = parse_json_after_marker(&html, "var ytInitialData = ")?;

    let api_key = html
        .split("\"INNERTUBE_API_KEY\":\"")
        .nth(1)
        .and_then(|s| s.split('"').next())
        .ok_or_else(|| "[Playlist Error] No se encontró INNERTUBE_API_KEY".to_string())?
        .to_string();

    let context = parse_json_after_marker(&html, "\"INNERTUBE_CONTEXT\":")?;

    let mut videos = Vec::new();
    let mut seen = HashSet::new();

    collect_playlist_videos(&initial_data, playlist_id, &mut videos, &mut seen, false);

    let mut token = find_next_token(&initial_data);
    let mut used_tokens = HashSet::new();

    while let Some(current_token) = token {
        if current_token.is_empty() || !used_tokens.insert(current_token.clone()) {
            break;
        }

        let response = client
            .post(format!(
                "https://www.youtube.com/youtubei/v1/browse?key={}",
                api_key
            ))
            .header("Content-Type", "application/json")
            .header("Origin", "https://www.youtube.com")
            .header("Referer", &playlist_url)
            .json(&serde_json::json!({
                "context": context,
                "continuation": current_token
            }))
            .send()
            .await
            .map_err(|e| format!("[Playlist Continuation Request Error] {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "[Playlist Continuation HTTP Error] {}",
                response.status()
            ));
        }

        let next_data: Value = response
            .json()
            .await
            .map_err(|e| format!("[Playlist Continuation JSON Error] {}", e))?;

        collect_playlist_videos(&next_data, playlist_id, &mut videos, &mut seen, true);

        token = find_next_token(&next_data);
    }

    if videos.is_empty() {
        return Err("[Playlist Error] No se encontraron vídeos. \
             Puede estar vacía, ser privada o haber cambiado su estructura."
            .to_string());
    }

    Ok(videos)
}

fn collect_search(value: &Value, videos: &mut Vec<SearchResult>, channels: &mut Vec<ChannelInfo>) {
    match value {
        Value::Object(map) => {
            if let Some(renderer) = map.get("videoRenderer") {
                if let Some(id) = renderer.get("videoId").and_then(Value::as_str) {
                    if !id.is_empty() && !videos.iter().any(|video| video.id == id) {
                        let title = renderer
                            .pointer("/title/runs/0/text")
                            .or_else(|| renderer.pointer("/title/simpleText"))
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string();

                        let duration_secs = renderer
                            .pointer("/lengthText/simpleText")
                            .and_then(Value::as_str)
                            .map(time_text_to_secs)
                            .unwrap_or(0);

                        // Excluye emisiones o vídeos de más de 24 horas
                        // cuando YouTube proporciona su duración.
                        if duration_secs > 24 * 3600 {
                            return;
                        }

                        let (channel, channel_id, channel_url) = renderer
                            .pointer("/longBylineText/runs/0")
                            .or_else(|| renderer.pointer("/ownerText/runs/0"))
                            .map(|item| {
                                let name = item
                                    .get("text")
                                    .and_then(Value::as_str)
                                    .unwrap_or("")
                                    .to_string();

                                let cid = item
                                    .pointer("/navigationEndpoint/browseEndpoint/browseId")
                                    .and_then(Value::as_str)
                                    .unwrap_or("")
                                    .to_string();

                                let url = if cid.is_empty() {
                                    String::new()
                                } else {
                                    format!("https://www.youtube.com/channel/{}", cid)
                                };

                                (name, cid, url)
                            })
                            .unwrap_or_default();

                        videos.push(SearchResult {
                            id: id.to_string(),
                            title,
                            duration: format_duration(duration_secs),
                            thumbnail: thumbnail(id),
                            channel,
                            channel_id,
                            channel_url,
                            source: "youtube".to_string(),
                        });
                    }
                }

                return;
            }

            if let Some(renderer) = map
                .get("channelRenderer")
                .or_else(|| map.get("gridChannelRenderer"))
            {
                if let Some(id) = renderer.get("channelId").and_then(Value::as_str) {
                    if !channels.iter().any(|channel| channel.id == id) {
                        let name = renderer
                            .pointer("/title/simpleText")
                            .or_else(|| renderer.pointer("/title/runs/0/text"))
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string();

                        let icon = renderer
                            .pointer("/thumbnail/thumbnails")
                            .and_then(Value::as_array)
                            .and_then(|items| items.last())
                            .and_then(|item| item.get("url"))
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string();

                        channels.push(ChannelInfo {
                            id: id.to_string(),
                            name,
                            url: format!("https://www.youtube.com/channel/{}", id),
                            thumbnail: icon,
                        });
                    }
                }

                return;
            }

            for child in map.values() {
                collect_search(child, videos, channels);
            }
        }

        Value::Array(items) => {
            for child in items {
                collect_search(child, videos, channels);
            }
        }

        _ => {}
    }
}

async fn scrape_search(query: &str) -> Result<SearchResponse, String> {
    use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};

    let client = Client::builder()
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
             AppleWebKit/537.36 (KHTML, like Gecko) \
             Chrome/131.0.0.0 Safari/537.36",
        )
        .build()
        .map_err(|e| format!("[Client Error] {}", e))?;

    let encoded = utf8_percent_encode(query, NON_ALPHANUMERIC);

    let url = format!(
        "https://www.youtube.com/results?search_query={}&hl=en",
        encoded
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("[Search Request Error] {}", e))?;

    if !response.status().is_success() {
        return Err(format!("[Search HTTP Error] {}", response.status()));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("[Search Body Error] {}", e))?;

    let json = parse_json_after_marker(&html, "var ytInitialData = ")?;

    let mut videos = Vec::new();
    let mut channels = Vec::new();

    collect_search(&json, &mut videos, &mut channels);

    if videos.is_empty() && channels.is_empty() {
        return Err("[Search Error] No se encontraron resultados.".to_string());
    }

    Ok(SearchResponse { videos, channels })
}

/// Motor interno de búsqueda textual.
async fn try_search(query: &str) -> Result<SearchResponse, String> {
    scrape_search(query).await
}

/// Resuelve cualquier entrada compatible en una respuesta estándar.
async fn resolve_input(input: &str) -> Result<SearchResponse, String> {
    let input = input.trim();

    if input.is_empty() {
        return Ok(SearchResponse::empty());
    }

    // Las playlists se detectan antes que los vídeos.
    if let Some(playlist_id) = extract_playlist_id(input) {
        let videos = fetch_playlist(&playlist_id).await?;

        return Ok(SearchResponse {
            videos,
            channels: Vec::new(),
        });
    }

    // Un ID o una URL de vídeo devuelve un solo vídeo.
    if let Some(video_id) = extract_video_id(input) {
        let video = video_info_core(&video_id).await?;

        return Ok(SearchResponse {
            videos: vec![video],
            channels: Vec::new(),
        });
    }

    // No interpretar enlaces desconocidos como búsquedas textuales.
    if input.starts_with("https://") || input.starts_with("http://") {
        return Err("[Input Error] No se reconoce este enlace. \
             Usa una búsqueda de texto, un ID o un enlace de YouTube."
            .to_string());
    }

    try_search(input).await
}

/// Único comando público para buscar vídeos, IDs, URLs y playlists.
#[tauri::command]
async fn search_youtube(query: String) -> Result<SearchResponse, String> {
    let input = query.trim();

    if input.is_empty() {
        return Ok(SearchResponse::empty());
    }

    let mut last_error = String::new();

    for attempt in 0..2 {
        match resolve_input(input).await {
            Ok(response) => return Ok(response),

            Err(error) => {
                last_error = error;

                if attempt == 0 {
                    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
                }
            }
        }
    }

    Err(last_error)
}

#[tauri::command]
async fn get_video_info(video_id: String) -> Result<SearchResult, String> {
    let id =
        extract_video_id(&video_id).ok_or_else(|| "ID o URL de vídeo no válido".to_string())?;

    video_info_core(&id).await
}

#[tauri::command]
async fn get_channel_videos(channel_id: String) -> Result<Vec<SearchResult>, String> {
    if !channel_id.starts_with("UC") {
        return Ok(Vec::new());
    }

    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build()
        .map_err(|e| format!("[Client Error] {}", e))?;

    let feed_url = format!(
        "https://www.youtube.com/feeds/videos.xml?channel_id={}",
        channel_id
    );

    let response = client
        .get(&feed_url)
        .send()
        .await
        .map_err(|e| format!("[Feed Request Error] {}", e))?;

    if !response.status().is_success() {
        return Ok(Vec::new());
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("[Feed Body Error] {}", e))?;

    let mut videos = Vec::new();
    let mut rest = body.as_str();

    while let Some(start) = rest.find("<entry>") {
        rest = &rest[start + 7..];

        let Some(end) = rest.find("</entry>") else {
            break;
        };

        let entry = &rest[..end];
        rest = &rest[end + 8..];

        let id = tag_value(entry, "yt:videoId")
            .unwrap_or_default()
            .to_string();

        if id.is_empty() {
            continue;
        }

        let title = tag_value(entry, "media:title")
            .map(html_unescape)
            .unwrap_or_default();

        let duration = entry
            .find("<media:duration")
            .and_then(|pos| {
                let segment = &entry[pos..entry.len().min(pos + 120)];
                segment.split("duration=").nth(1)
            })
            .and_then(|value| value.split('"').nth(1))
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0);

        videos.push(SearchResult {
            id: id.clone(),
            title,
            duration: format_duration(duration),
            thumbnail: thumbnail(&id),
            channel: String::new(),
            channel_id: channel_id.clone(),
            channel_url: format!("https://www.youtube.com/channel/{}", channel_id),
            source: "youtube".to_string(),
        });
    }

    Ok(videos)
}

fn tag_value<'a>(entry: &'a str, tag: &str) -> Option<&'a str> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);

    let start = entry.find(&open)? + open.len();
    let rest = &entry[start..];
    let end = rest.find(&close)?;

    Some(&rest[..end])
}

fn html_unescape(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            search_youtube,
            get_video_info,
            get_channel_videos,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn text_search_returns_results() {
        let response = try_search("lofi hip hop")
            .await
            .expect("La búsqueda ha fallado");

        assert!(!response.videos.is_empty(), "No se han encontrado vídeos");
    }

    #[test]
    fn test_find_next_token() {
        let json = serde_json::json!({
            "continuationContents": {
                "playlistVideoListContinuation": {
                    "continuations": [{
                        "nextContinuationData": {
                            "continuation": "TOKEN_PAGINA_2"
                        }
                    }]
                }
            }
        });

        let token = find_next_token(&json);

        assert_eq!(token.as_deref(), Some("TOKEN_PAGINA_2"));
    }

    #[test]
    fn test_continuation_token_changes_between_pages() {
        let page_1 = serde_json::json!({
            "continuationItemRenderer": {
                "continuationEndpoint": {
                    "continuationCommand": {
                        "token": "TOKEN_PAGINA_2"
                    }
                }
            }
        });

        let page_2 = serde_json::json!({
            "continuationContents": {
                "playlistVideoListContinuation": {
                    "continuations": [{
                        "nextContinuationData": {
                            "continuation": "TOKEN_PAGINA_3"
                        }
                    }]
                }
            }
        });

        let token_2 = find_next_token(&page_1).unwrap();
        let token_3 = find_next_token(&page_2).unwrap();

        assert_eq!(token_2, "TOKEN_PAGINA_2");
        assert_eq!(token_3, "TOKEN_PAGINA_3");
        assert_ne!(token_2, token_3);
    }

    #[test]
    fn extracts_video_ids() {
        assert_eq!(
            extract_video_id("dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );

        assert_eq!(
            extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );

        assert_eq!(
            extract_video_id("https://youtu.be/dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
    }

    #[test]
    fn extracts_playlist_ids() {
        assert_eq!(
            extract_playlist_id("https://www.youtube.com/playlist?list=PL123456"),
            Some("PL123456".to_string())
        );
    }
}
