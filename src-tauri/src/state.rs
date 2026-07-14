use std::sync::Arc;
use tokio::sync::RwLock;

pub type SharedState = Arc<RwLock<ServerState>>;
pub type ShutdownHandle = Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>>;

#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct ServerState {
    pub queue: Vec<crate::SearchResult>,
    pub queue_idx: i32,
    pub current_id: Option<String>,
    pub current_title: String,
    pub current_thumb: String,
    pub playing: bool,
    pub current_time: f64,
    pub duration: f64,
    pub volume: f64,
    pub history: Vec<HistoryItem>,
    pub playlists: Vec<Playlist>,
    pub kept_ids: Vec<String>,
    pub source: String,
    pub port: u16,
    pub local_ip: String,
    pub external_ip: String,
    pub available: bool,
    pub cache_dir: String,
    pub web_enabled: bool,
    pub upnp_ok: bool,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
pub struct HistoryItem {
    pub id: String,
    pub title: String,
    pub thumbnail: String,
    pub duration: String,
    pub played_at: u64,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub tracks: Vec<crate::SearchResult>,
}

#[derive(Clone, serde::Serialize, Debug)]
pub struct ServerInfo {
    pub port: u16,
    pub local_ip: String,
    pub external_ip: String,
    pub url: String,
    pub available: bool,
    pub web_enabled: bool,
    pub upnp_ok: bool,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            queue: Vec::new(),
            queue_idx: -1,
            current_id: None,
            current_title: String::new(),
            current_thumb: String::new(),
            playing: false,
            current_time: 0.0,
            duration: 0.0,
            volume: 0.7,
            history: Vec::new(),
            playlists: Vec::new(),
            kept_ids: Vec::new(),
            source: "youtube".to_string(),
            port: 0,
            local_ip: String::new(),
            external_ip: String::new(),
            available: false,
            cache_dir: String::new(),
            web_enabled: false,
            upnp_ok: false,
        }
    }
}
