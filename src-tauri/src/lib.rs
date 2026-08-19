use serde::{Serialize, Deserialize};
use rusty_ytdl::Video;

const THUMB_BASE: &str = "https://img.youtube.com/vi";

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

async fn video_info_core(id: &str) -> Result<SearchResult, String> {
    let video = Video::new(id.to_string()).map_err(|e| format!("[Video Error] {}", e))?;
    let info = video
        .get_info()
        .await
        .map_err(|e| format!("[Info Error] {}", e))?;
    let details = info.video_details;
    let length: u64 = details.length_seconds.parse().unwrap_or(0);
    let channel_id = details.channel_id.clone();
    Ok(SearchResult {
        id: id.to_string(),
        title: details.title,
        duration: format_duration(length),
        thumbnail: thumbnail(id),
        channel: details.owner_channel_name,
        channel_id: details.channel_id,
        channel_url: format!("https://www.youtube.com/channel/{}", channel_id),
        source: "youtube".to_string(),
    })
}

fn extract_video_id(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.len() == 11 && !trimmed.contains('/') && !trimmed.contains('?') && !trimmed.contains('=') {
        return Some(trimmed.to_string());
    }
    if let Some(pos) = trimmed.find("v=") {
        let rest = &trimmed[pos + 2..];
        let id = rest.split('&').next().unwrap_or("");
        if id.len() == 11 {
            return Some(id.to_string());
        }
    }
    if let Some(pos) = trimmed.find("youtu.be/") {
        let rest = &trimmed[pos + 9..];
        let id = rest.split(['?', '&']).next().unwrap_or("");
        if id.len() == 11 {
            return Some(id.to_string());
        }
    }
    if let Some(pos) = trimmed.find("/shorts/") {
        let rest = &trimmed[pos + 8..];
        let id = rest.split(['?', '&']).next().unwrap_or("");
        if id.len() == 11 {
            return Some(id.to_string());
        }
    }
if let Some(pos) = trimmed.find("/watch/") {
        let rest = &trimmed[pos + 7..];
        let id = rest.split(['?', '&', '/']).next().unwrap_or("");
        if id.len() == 11 {
            return Some(id.to_string());
        }
    }
    if let Some(pos) = trimmed.find("/embed/") {
        let rest = &trimmed[pos + 7..];
        let id = rest.split(['?', '&', '/']).next().unwrap_or("");
        if id.len() == 11 {
            return Some(id.to_string());
        }
    }
    if let Some(pos) = trimmed.find("/live/") {
        let rest = &trimmed[pos + 6..];
        let id = rest.split(['?', '&', '/']).next().unwrap_or("");
        if id.len() == 11 {
            return Some(id.to_string());
        }
    }
    if let Some(pos) = trimmed.find("/v/") {
        let rest = &trimmed[pos + 3..];
        let id = rest.split(['?', '&', '/']).next().unwrap_or("");
        if id.len() == 11 {
            return Some(id.to_string());
        }
    }
    None
}

fn time_text_to_secs(text: &str) -> u64 {
    let parts: Vec<&str> = text.trim().split(':').collect();
    if parts.len() == 2 {
        let m: u64 = parts[0].parse().unwrap_or(0);
        let s: u64 = parts[1].parse().unwrap_or(0);
        return m * 60 + s;
    }
    if parts.len() == 3 {
        let h: u64 = parts[0].parse().unwrap_or(0);
        let m: u64 = parts[1].parse().unwrap_or(0);
        let s: u64 = parts[2].parse().unwrap_or(0);
        return h * 3600 + m * 60 + s;
    }
    parts.first().and_then(|p| p.parse().ok()).unwrap_or(0)
}

fn collect_search(
    v: &serde_json::Value,
    songs: &mut Vec<SearchResult>,
    channels: &mut Vec<ChannelInfo>,
) {
    match v {
        serde_json::Value::Object(obj) => {
            if let Some(vr) = obj.get("videoRenderer") {
                if let Some(id) = vr.get("videoId").and_then(|x| x.as_str()) {
                    if !id.is_empty() && !songs.iter().any(|s| s.id == id) {
                        let title = vr
                            .pointer("/title/runs/0/text")
                            .or_else(|| vr.pointer("/title/simpleText"))
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string();
                        let duration = vr
                            .pointer("/lengthText/simpleText")
                            .and_then(|x| x.as_str())
                            .map(time_text_to_secs)
                            .unwrap_or(0);
                        if duration > 24 * 3600 {
                            return;
                        }
                        let (channel, channel_id, channel_url) = vr
                            .pointer("/longBylineText/runs/0")
                            .or_else(|| vr.pointer("/ownerText/runs/0"))
                            .map(|r| {
                                let name = r
                                    .get("text")
                                    .and_then(|x| x.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let cid = r
                                    .pointer("/navigationEndpoint/browseEndpoint/browseId")
                                    .and_then(|x| x.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                (
                                    name,
                                    cid.clone(),
                                    format!("https://www.youtube.com/channel/{}", cid),
                                )
                            })
                            .unwrap_or_default();
                        songs.push(SearchResult {
                            id: id.to_string(),
                            title,
                            duration: format_duration(duration),
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
            if let Some(cr) = obj.get("channelRenderer").or_else(|| obj.get("gridChannelRenderer")) {
                if let Some(id) = cr.get("channelId").and_then(|x| x.as_str()) {
                    if !channels.iter().any(|c| c.id == id) {
                        let name = cr
                            .pointer("/title/simpleText")
                            .or_else(|| cr.pointer("/title/runs/0/text"))
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string();
                        let icon = cr
                            .pointer("/thumbnail/thumbnails")
                            .and_then(|x| x.as_array())
                            .and_then(|a| a.last())
                            .and_then(|t| t.get("url"))
                            .and_then(|x| x.as_str())
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
            for child in obj.values() {
                collect_search(child, songs, channels);
            }
        }
        serde_json::Value::Array(arr) => {
            for child in arr {
                collect_search(child, songs, channels);
            }
        }
        _ => {}
    }
}

async fn scrape_search(query: &str) -> Result<(Vec<SearchResult>, Vec<ChannelInfo>), String> {
    use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("[Client Error] {}", e))?;
    let encoded = utf8_percent_encode(query, NON_ALPHANUMERIC).to_string();
    let url = format!("https://www.youtube.com/results?search_query={}&hl=en", encoded);
    let html = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("[Request Error] {}", e))?
        .text()
        .await
        .map_err(|e| format!("[Body Error] {}", e))?;
    let marker = "var ytInitialData = ";
    let start = html
        .find(marker)
        .ok_or_else(|| "No data".to_string())?;
    let after = &html[start + marker.len()..];
    let end = after
        .find(";</script>")
        .ok_or_else(|| "No end".to_string())?;
    let json: serde_json::Value = serde_json::from_str(&after[..end])
        .map_err(|e| format!("[Json Error] {}", e))?;
    let mut songs = Vec::new();
    let mut channels = Vec::new();
    collect_search(&json, &mut songs, &mut channels);
    Ok((songs, channels))
}

async fn try_search(query: &str) -> Result<(Vec<SearchResult>, Vec<ChannelInfo>), String> {
    scrape_search(query).await
}

#[tauri::command]
async fn search_youtube(query: String) -> Result<(Vec<SearchResult>, Vec<ChannelInfo>), String> {
    let mut last_err = String::new();
    for attempt in 0..2 {
        match try_search(&query).await {
            Ok(v) => return Ok(v),
            Err(e) => {
                last_err = e;
                if attempt == 0 {
                    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
                }
            }
        }
    }
    Err(last_err)
}

#[tauri::command]
async fn get_video_info(video_id: String) -> Result<SearchResult, String> {
    video_info_core(&video_id).await
}

#[tauri::command]
async fn fetch_url(url: String) -> Result<(Vec<SearchResult>, Vec<ChannelInfo>), String> {
    let id = extract_video_id(&url).ok_or_else(|| {
        "[URL Error] No se pudo leer ese enlace. Usa un enlace o ID de video de YouTube.".to_string()
    })?;
    let song = video_info_core(&id).await?;
    Ok((vec![song], Vec::new()))
}

#[tauri::command]
async fn get_channel_videos(channel_id: String) -> Result<Vec<SearchResult>, String> {
    if !channel_id.starts_with("UC") {
        return Ok(Vec::new());
    }
    let client = match reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
    {
        Ok(c) => c,
        Err(_) => return Ok(Vec::new()),
    };
    let feed_url = format!(
        "https://www.youtube.com/feeds/videos.xml?channel_id={}",
        channel_id
    );
    let body = match client.get(&feed_url).send().await {
        Ok(r) if r.status().is_success() => match r.text().await {
            Ok(t) => t,
            Err(_) => return Ok(Vec::new()),
        },
        _ => return Ok(Vec::new()),
    };

    let mut songs = Vec::new();
    let mut rest = body.as_str();
    while let Some(start) = rest.find("<entry>") {
        rest = &rest[start + 7..];
        let Some(end) = rest.find("</entry>") else { break };
        let entry = &rest[..end];
        rest = &rest[end + 8..];

        let id = tag_value(entry, "yt:videoId").unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        let title = tag_value(entry, "media:title")
            .map(|t| html_unescape(&t))
            .unwrap_or_default();
        let duration: u64 = entry
            .find("<media:duration")
            .and_then(|p| {
                let seg = &entry[p..entry.len().min(p + 120)];
                seg.split("duration=").nth(1)
            })
            .and_then(|v| v.split('"').nth(1))
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);

        songs.push(SearchResult {
            id: id.to_string(),
            title,
            duration: format_duration(duration),
            thumbnail: thumbnail(&id),
            channel: String::new(),
            channel_id: channel_id.clone(),
            channel_url: format!("https://www.youtube.com/channel/{}", channel_id),
            source: "youtube".to_string(),
        });
    }
    Ok(songs)
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
            fetch_url,
            get_channel_videos,
        ])
.run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn real_search() {
        let (songs, channels) = try_search("lofi hip hop").await.expect("search failed");
        println!("songs={} channels={}", songs.len(), channels.len());
        assert!(!songs.is_empty(), "no songs returned");
        for song in songs.iter().take(6) {
            println!("song: {} | {} | {}", song.title, song.duration, song.channel);
        }
    }
}
