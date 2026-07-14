use std::convert::Infallible;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use futures_util::{SinkExt, StreamExt};
use igd_next as igd;
use warp::ws::{Message, WebSocket};
use warp::{Filter, Reply};

use crate::state::{ServerInfo, ServerState, SharedState};
use crate::auth::AuthStoreRef;

type ClientTx = tokio::sync::mpsc::UnboundedSender<Message>;
type Clients = Arc<RwLock<Vec<(usize, ClientTx)>>>;

pub async fn start_server(
    state: SharedState,
    cache_dir: PathBuf,
    dist_dir: PathBuf,
    app_handle: tauri::AppHandle,
    auth_store: AuthStoreRef,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) {
    let port = find_free_port(21970).await;
    let local_ip = get_local_ip().await;
    let external_ip = get_external_ip().await;

    {
        let mut s = state.write().await;
        s.port = port;
        s.local_ip = local_ip.clone();
        s.external_ip = external_ip.clone();
        s.cache_dir = cache_dir.to_string_lossy().to_string();
        s.available = true;
    }

    // UPnP
    let upnp_ok = add_upnp_mapping(port).await;
    state.write().await.upnp_ok = upnp_ok;

    let clients: Clients = Arc::new(RwLock::new(Vec::new()));
    let _auth_store_ref = auth_store.clone();

    let cors = warp::cors()
        .allow_any_origin()
        .allow_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
        .allow_headers(vec!["content-type"]);

    // ── WebSocket ──
    let ws = warp::path!("api" / "ws")
        .and(warp::ws())
        .and(with_state(state.clone()))
        .and(with_clients(clients.clone()))
        .map(|ws: warp::ws::Ws, st, cl| ws.on_upgrade(move |sock| handle_ws(sock, st, cl)));

    // ── REST API ──
    let api_prefix = warp::path("api");

    // GET /api/status
    let status = api_prefix
        .and(warp::path("status"))
        .and(warp::get())
        .and(with_state(state.clone()))
        .then(get_status);

    // GET /api/queue
    let queue_get = api_prefix
        .and(warp::path("queue"))
        .and(warp::get())
        .and(with_state(state.clone()))
        .then(get_queue);

    // POST /api/queue/add
    let queue_add = api_prefix
        .and(warp::path("queue").and(warp::path("add")))
        .and(warp::post())
        .and(warp::body::json())
        .and(with_state(state.clone()))
        .and(with_clients(clients.clone()))
        .then(add_to_queue);

    // POST /api/queue/remove
    let queue_remove = api_prefix
        .and(warp::path("queue").and(warp::path("remove")))
        .and(warp::post())
        .and(warp::body::json())
        .and(with_state(state.clone()))
        .and(with_clients(clients.clone()))
        .then(remove_from_queue);

    // POST /api/queue/play
    let queue_play = api_prefix
        .and(warp::path("queue").and(warp::path("play")))
        .and(warp::post())
        .and(warp::body::json())
        .and(with_state(state.clone()))
        .and(with_clients(clients.clone()))
        .then(play_from_queue);

    // POST /api/queue/move
    let queue_move = api_prefix
        .and(warp::path("queue").and(warp::path("move")))
        .and(warp::post())
        .and(warp::body::json())
        .and(with_state(state.clone()))
        .and(with_clients(clients.clone()))
        .then(move_queue_item);

    // POST /api/player/play
    let player_play = api_prefix
        .and(warp::path("player").and(warp::path("play")))
        .and(warp::post())
        .and(warp::body::json())
        .and(with_state(state.clone()))
        .and(with_clients(clients.clone()))
        .then(player_play_handler);

    // POST /api/player/toggle
    let player_toggle = api_prefix
        .and(warp::path("player").and(warp::path("toggle")))
        .and(warp::post())
        .and(with_state(state.clone()))
        .and(with_clients(clients.clone()))
        .then(player_toggle_handler);

    // POST /api/player/next
    let player_next = api_prefix
        .and(warp::path("player").and(warp::path("next")))
        .and(warp::post())
        .and(with_state(state.clone()))
        .and(with_clients(clients.clone()))
        .then(player_next_handler);

    // POST /api/player/prev
    let player_prev = api_prefix
        .and(warp::path("player").and(warp::path("prev")))
        .and(warp::post())
        .and(with_state(state.clone()))
        .and(with_clients(clients.clone()))
        .then(player_prev_handler);

    // POST /api/player/seek
    let player_seek = api_prefix
        .and(warp::path("player").and(warp::path("seek")))
        .and(warp::post())
        .and(warp::body::json())
        .and(with_state(state.clone()))
        .then(player_seek_handler);

    // POST /api/player/volume
    let player_volume = api_prefix
        .and(warp::path("player").and(warp::path("volume")))
        .and(warp::post())
        .and(warp::body::json())
        .and(with_state(state.clone()))
        .then(player_volume_handler);

    // GET /api/search
    let search = api_prefix
        .and(warp::path("search"))
        .and(warp::get())
        .and(warp::query::<std::collections::HashMap<String, String>>())
        .and(with_handle(app_handle.clone()))
        .then(search_handler);

    // GET /api/search/hinai
    let search_hinai = api_prefix
        .and(warp::path("search").and(warp::path("hinai")))
        .and(warp::get())
        .and(warp::query::<std::collections::HashMap<String, String>>())
        .and(with_handle(app_handle.clone()))
        .then(search_hinai_handler);

    // GET /api/channel
    let channel = api_prefix
        .and(warp::path("channel"))
        .and(warp::get())
        .and(warp::query::<std::collections::HashMap<String, String>>())
        .and(with_handle(app_handle.clone()))
        .then(channel_handler);

    // POST /api/url/fetch
    let url_fetch = api_prefix
        .and(warp::path("url").and(warp::path("fetch")))
        .and(warp::post())
        .and(warp::body::json())
        .and(with_handle(app_handle.clone()))
        .then(fetch_url_handler);

    // GET /api/downloads
    let downloads = api_prefix
        .and(warp::path("downloads"))
        .and(warp::get())
        .and(with_handle(app_handle.clone()))
        .then(downloads_handler);

    // POST /api/downloads/delete
    let downloads_delete = api_prefix
        .and(warp::path("downloads").and(warp::path("delete")))
        .and(warp::post())
        .and(warp::body::json())
        .and(with_handle(app_handle.clone()))
        .then(delete_download_handler);

    // POST /api/download/audio
    let download_audio = api_prefix
        .and(warp::path("download").and(warp::path("audio")))
        .and(warp::post())
        .and(warp::body::json())
        .and(with_handle(app_handle.clone()))
        .then(download_audio_handler);

    // GET /api/qr (returns QR code PNG)
    let qr = api_prefix
        .and(warp::path("qr"))
        .and(warp::get())
        .and(with_state(state.clone()))
        .then(qr_handler);

    // GET /api/server-info
    let server_info = api_prefix
        .and(warp::path("server-info"))
        .and(warp::get())
        .and(with_state(state.clone()))
        .then(server_info_handler);

    // ── Audio serving ──
    let audio = warp::path("audio")
        .and(warp::get())
        .and(warp::path::param::<String>())
        .and(with_cache(cache_dir.clone()))
        .and_then(serve_audio);

    // ── Auth endpoints ──
    let auth_register = api_prefix
        .and(warp::path("auth").and(warp::path("register")))
        .and(warp::post())
        .and(warp::body::json())
        .and(with_auth(auth_store.clone()))
        .then(auth_register_handler);

    let auth_login = api_prefix
        .and(warp::path("auth").and(warp::path("login")))
        .and(warp::post())
        .and(warp::body::json())
        .and(with_auth(auth_store.clone()))
        .then(auth_login_handler);

    let auth_verify = api_prefix
        .and(warp::path("auth").and(warp::path("verify")))
        .and(warp::post())
        .and(warp::body::json())
        .and(with_auth(auth_store.clone()))
        .then(auth_verify_handler);

    // ── Static files (SPA fallback) ──
    let dist = dist_dir.clone();
    let spa = warp::any()
        .and(warp::get())
        .and(warp::fs::dir(dist))
        .or(warp::get()
            .and(warp::path::full())
            .and(with_dist(dist_dir.clone()))
            .and_then(spa_fallback));

    let routes = ws
        .or(auth_register)
        .or(auth_login)
        .or(auth_verify)
        .or(status)
        .or(queue_get)
        .or(queue_add)
        .or(queue_remove)
        .or(queue_play)
        .or(queue_move)
        .or(player_play)
        .or(player_toggle)
        .or(player_next)
        .or(player_prev)
        .or(player_seek)
        .or(player_volume)
        .or(search)
        .or(search_hinai)
        .or(channel)
        .or(url_fetch)
        .or(downloads)
        .or(downloads_delete)
        .or(download_audio)
        .or(qr)
        .or(server_info)
        .or(audio)
        .or(spa)
        .with(cors);

    let addr: SocketAddr = ([0, 0, 0, 0], port).into();
    println!("🌐 Server running on http://{}:{}", local_ip, port);
    println!("🌍 External: http://{}:{}", external_ip, port);
    println!("📱 Scan QR at http://{}:{}/api/qr", local_ip, port);

    let (_, server_fut) = warp::serve(routes).bind_with_graceful_shutdown(addr, async {
        shutdown_rx.await.ok();
    });
    server_fut.await;
}

// ── Handler functions ──

async fn get_status(state: SharedState) -> impl Reply {
    let s = state.read().await;
    warp::reply::json(&serde_json::json!({
        "queue_len": s.queue.len(),
        "queue_idx": s.queue_idx,
        "current_id": s.current_id,
        "current_title": s.current_title,
        "current_thumb": s.current_thumb,
        "playing": s.playing,
        "current_time": s.current_time,
        "duration": s.duration,
        "volume": s.volume,
        "port": s.port,
        "local_ip": s.local_ip,
        "external_ip": s.external_ip,
        "available": s.available,
    }))
}

async fn get_queue(state: SharedState) -> impl Reply {
    let s = state.read().await;
    warp::reply::json(&s.queue)
}

async fn add_to_queue(item: crate::SearchResult, state: SharedState, clients: Clients) -> impl Reply {
    let mut s = state.write().await;
    let is_first = s.queue.is_empty() && s.current_id.is_none();
    s.queue.push(item);
    if is_first {
        s.queue_idx = 0;
        let first = s.queue[0].clone();
        s.current_id = Some(first.id);
        s.current_title = first.title;
        s.current_thumb = first.thumbnail;
        s.playing = true;
    }
    let _ = broadcast_state(&s, &clients).await;
    warp::reply::json(&serde_json::json!({"ok": true}))
}

async fn remove_from_queue(body: serde_json::Value, state: SharedState, clients: Clients) -> impl Reply {
    let index = body["index"].as_i64().unwrap_or(-1) as i32;
    let mut s = state.write().await;
    if index >= 0 && (index as usize) < s.queue.len() {
        s.queue.remove(index as usize);
        if index < s.queue_idx {
            s.queue_idx -= 1;
        } else if index == s.queue_idx {
            if s.queue.is_empty() {
                s.queue_idx = -1;
                s.current_id = None;
                s.current_title = String::new();
                s.current_thumb = String::new();
                s.playing = false;
            } else if s.queue_idx as usize >= s.queue.len() {
                s.queue_idx = (s.queue.len() as i32) - 1;
            }
        }
    }
    let _ = broadcast_state(&s, &clients).await;
    warp::reply::json(&serde_json::json!({"ok": true}))
}

async fn play_from_queue(body: serde_json::Value, state: SharedState, clients: Clients) -> impl Reply {
    let index = body["index"].as_i64().unwrap_or(-1) as usize;
    let mut s = state.write().await;
    if index < s.queue.len() {
        s.queue_idx = index as i32;
        let item = &s.queue[index].clone();
        s.current_id = Some(item.id.clone());
        s.current_title = item.title.clone();
        s.current_thumb = item.thumbnail.clone();
        s.current_time = 0.0;
        s.playing = true;
    }
    let _ = broadcast_state(&s, &clients).await;
    warp::reply::json(&serde_json::json!({"ok": true}))
}

async fn move_queue_item(body: serde_json::Value, state: SharedState, clients: Clients) -> impl Reply {
    let from = body["from"].as_i64().unwrap_or(-1) as usize;
    let to = body["to"].as_i64().unwrap_or(-1) as usize;
    let mut s = state.write().await;
    if from < s.queue.len() && to < s.queue.len() {
        let item = s.queue.remove(from);
        s.queue.insert(to, item);
        if s.queue_idx == from as i32 {
            s.queue_idx = to as i32;
        } else if from < s.queue_idx as usize && to >= s.queue_idx as usize {
            s.queue_idx -= 1;
        } else if from > s.queue_idx as usize && to <= s.queue_idx as usize {
            s.queue_idx += 1;
        }
    }
    let _ = broadcast_state(&s, &clients).await;
    warp::reply::json(&serde_json::json!({"ok": true}))
}

async fn player_play_handler(item: crate::SearchResult, state: SharedState, clients: Clients) -> impl Reply {
    let mut s = state.write().await;
    s.current_id = Some(item.id.clone());
    s.current_title = item.title.clone();
    s.current_thumb = item.thumbnail.clone();
    s.current_time = 0.0;
    s.playing = true;
    let _ = broadcast_state(&s, &clients).await;
    warp::reply::json(&serde_json::json!({"ok": true}))
}

async fn player_toggle_handler(state: SharedState, clients: Clients) -> impl Reply {
    let mut s = state.write().await;
    s.playing = !s.playing;
    let _ = broadcast_state(&s, &clients).await;
    warp::reply::json(&serde_json::json!({"playing": s.playing}))
}

async fn player_next_handler(state: SharedState, clients: Clients) -> impl Reply {
    let mut s = state.write().await;
    let next = s.queue_idx + 1;
    if next >= 0 && (next as usize) < s.queue.len() {
        s.queue_idx = next;
        let item = s.queue[next as usize].clone();
        s.current_id = Some(item.id.clone());
        s.current_title = item.title.clone();
        s.current_thumb = item.thumbnail.clone();
        s.current_time = 0.0;
        s.playing = true;
    }
    let _ = broadcast_state(&s, &clients).await;
    warp::reply::json(&serde_json::json!({"ok": true}))
}

async fn player_prev_handler(state: SharedState, clients: Clients) -> impl Reply {
    let mut s = state.write().await;
    let prev = s.queue_idx - 1;
    if prev >= 0 {
        s.queue_idx = prev;
        let item = s.queue[prev as usize].clone();
        s.current_id = Some(item.id.clone());
        s.current_title = item.title.clone();
        s.current_thumb = item.thumbnail.clone();
        s.current_time = 0.0;
        s.playing = true;
    }
    let _ = broadcast_state(&s, &clients).await;
    warp::reply::json(&serde_json::json!({"ok": true}))
}

async fn player_seek_handler(body: serde_json::Value, state: SharedState) -> impl Reply {
    let time = body["time"].as_f64().unwrap_or(0.0);
    state.write().await.current_time = time;
    warp::reply::json(&serde_json::json!({"ok": true}))
}

async fn player_volume_handler(body: serde_json::Value, state: SharedState) -> impl Reply {
    let vol = body["volume"].as_f64().unwrap_or(0.7);
    state.write().await.volume = vol;
    warp::reply::json(&serde_json::json!({"ok": true}))
}

async fn search_handler(params: std::collections::HashMap<String, String>, handle: tauri::AppHandle) -> impl Reply {
    let query = params.get("q").cloned().unwrap_or_default();
    if query.is_empty() {
        return warp::reply::json(&serde_json::json!({"results": [], "channels": []}));
    }
    let is_url = query.starts_with("http://") || query.starts_with("https://");
    let (results, channels) = if is_url {
        crate::fetch_url_inner(&handle, &query).await.unwrap_or_default()
    } else {
        crate::search_youtube_inner(&handle, &query).await.unwrap_or_default()
    };
    warp::reply::json(&serde_json::json!({"results": results, "channels": channels}))
}

async fn search_hinai_handler(params: std::collections::HashMap<String, String>, _handle: tauri::AppHandle) -> impl Reply {
    let query = params.get("q").cloned().unwrap_or_default();
    let (results, channels) = crate::search_hinai_inner(query, None).await.unwrap_or_default();
    warp::reply::json(&serde_json::json!({"results": results, "channels": channels}))
}

async fn channel_handler(params: std::collections::HashMap<String, String>, handle: tauri::AppHandle) -> impl Reply {
    let url = params.get("url").cloned().unwrap_or_default();
    let results = crate::get_channel_videos_inner(&handle, &url).await.unwrap_or_default();
    warp::reply::json(&results)
}

async fn fetch_url_handler(body: serde_json::Value, handle: tauri::AppHandle) -> impl Reply {
    let url = body["url"].as_str().unwrap_or("").to_string();
    let results = crate::fetch_url_inner(&handle, &url).await.unwrap_or_default();
    warp::reply::json(&results.0)
}

async fn downloads_handler(handle: tauri::AppHandle) -> impl Reply {
    let songs = crate::get_downloaded_songs_inner(&handle).await.unwrap_or_default();
    warp::reply::json(&songs)
}

async fn delete_download_handler(body: serde_json::Value, handle: tauri::AppHandle) -> impl Reply {
    let id = body["id"].as_str().unwrap_or("").to_string();
    let _ = crate::delete_downloaded_song_inner(&handle, &id).await;
    warp::reply::json(&serde_json::json!({"ok": true}))
}

async fn download_audio_handler(body: serde_json::Value, handle: tauri::AppHandle) -> impl Reply {
    let id = body["id"].as_str().unwrap_or("").to_string();
    let source = body["source"].as_str().unwrap_or("youtube").to_string();
    if id.is_empty() {
        return warp::reply::with_status(
            warp::reply::json(&serde_json::json!({"error": "id required"})),
            warp::http::StatusCode::BAD_REQUEST,
        ).into_response();
    }
    let meta = crate::SongMeta {
        id: id.clone(),
        title: body["title"].as_str().unwrap_or(&id).to_string(),
        thumbnail: body["thumbnail"].as_str().unwrap_or("").to_string(),
        channel: body["channel"].as_str().unwrap_or("").to_string(),
        channel_id: body["channel_id"].as_str().unwrap_or("").to_string(),
        channel_url: body["channel_url"].as_str().unwrap_or("").to_string(),
        duration: body["duration"].as_str().unwrap_or("").to_string(),
        source: source.clone(),
    };
    let result = if source == "hinai" {
        crate::download_hinai_audio_inner(&handle, &id, Some(meta)).await
    } else {
        crate::download_audio_inner(&handle, &id, Some(meta)).await
    };
    match result {
        Ok(_path) => warp::reply::json(&serde_json::json!({"ok": true, "id": id})).into_response(),
        Err(e) => warp::reply::with_status(
            warp::reply::json(&serde_json::json!({"error": e})),
            warp::http::StatusCode::INTERNAL_SERVER_ERROR,
        ).into_response(),
    }
}

async fn qr_handler(state: SharedState) -> impl Reply {
    let s = state.read().await;
    let url = format!("http://{}:{}", s.local_ip, s.port);
    drop(s);
    let code = qrcode::QrCode::new(url.as_bytes()).unwrap();
    let img = code.render::<image::Luma<u8>>().build();
    let mut buf = std::io::Cursor::new(Vec::new());
    let _ = img.write_to(&mut buf, image::ImageFormat::Png);
    buf.set_position(0);
    let mut res = warp::reply::Response::new(buf.into_inner().into());
    res.headers_mut().insert("content-type", "image/png".parse().unwrap());
    res
}

async fn server_info_handler(state: SharedState) -> impl Reply {
    let s = state.read().await;
    warp::reply::json(&ServerInfo {
        port: s.port,
        local_ip: s.local_ip.clone(),
        external_ip: s.external_ip.clone(),
        url: format!("http://{}:{}", s.local_ip, s.port),
        available: s.available,
        web_enabled: s.web_enabled,
        upnp_ok: s.upnp_ok,
    })
}

// ── WebSocket ──

async fn handle_ws(ws: WebSocket, state: SharedState, clients: Clients) {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    let id = {
        let mut c = clients.write().await;
        let id = c.len();
        c.push((id, tx));
        id
    };

    // Send initial state
    {
        let s = state.read().await;
        let msg = make_state_msg(&s);
        let _ = send_to_client(&clients, id, msg).await;
    }

    // Forward messages from channel to WebSocket
    let (mut ws_tx, mut ws_rx) = ws.split();
    let ws_tx_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Read from WebSocket (keep alive, discard messages)
    while let Some(Ok(_)) = ws_rx.next().await {}

    drop(ws_tx_task);
    clients.write().await.retain(|(i, _)| *i == id);
}

async fn broadcast_state(state: &ServerState, clients: &Clients) -> Result<(), ()> {
    let msg = make_state_msg(state);
    let ids: Vec<usize> = {
        let c = clients.read().await;
        c.iter().map(|(i, _)| *i).collect()
    };
    for id in ids {
        let _ = send_to_client(clients, id, msg.clone()).await;
    }
    Ok(())
}

fn make_state_msg(state: &ServerState) -> String {
    serde_json::to_string(&serde_json::json!({
        "type": "state",
        "data": {
            "queue": state.queue,
            "queue_idx": state.queue_idx,
            "current_id": state.current_id,
            "current_title": state.current_title,
            "current_thumb": state.current_thumb,
            "playing": state.playing,
            "current_time": state.current_time,
            "duration": state.duration,
            "volume": state.volume,
        }
    })).unwrap_or_default()
}

async fn send_to_client(clients: &Clients, id: usize, msg: String) -> Result<(), ()> {
    let c = clients.read().await;
    if let Some((_, tx)) = c.iter().find(|(i, _)| *i == id) {
        let _ = tx.send(Message::text(msg));
    }
    Ok(())
}

// ── Audio serving ──

async fn serve_audio(id: String, cache: PathBuf) -> Result<impl warp::Reply, Infallible> {
    let file_path = cache.join(format!("{}.mp3", id));
    if !file_path.exists() {
        return Ok(warp::reply::with_status(
            "Audio not found",
            warp::http::StatusCode::NOT_FOUND,
        ).into_response());
    }
    match tokio::fs::read(&file_path).await {
        Ok(bytes) => {
            let mut res = warp::reply::Response::new(bytes.into());
            res.headers_mut().insert("content-type", "audio/mpeg".parse().unwrap());
            res.headers_mut().insert("accept-ranges", "bytes".parse().unwrap());
            Ok(res)
        }
        Err(_) => Ok(warp::reply::with_status(
            "Error reading file",
            warp::http::StatusCode::INTERNAL_SERVER_ERROR,
        ).into_response()),
    }
}

// ── SPA fallback ──

async fn spa_fallback(path: warp::path::FullPath, dist: PathBuf) -> Result<impl warp::Reply, Infallible> {
    let p = path.as_str();
    if p.starts_with("/api/") || p.starts_with("/audio/") {
        return Ok(warp::reply::with_status(
            "Not found",
            warp::http::StatusCode::NOT_FOUND,
        ).into_response());
    }
    let index = dist.join("index.html");
    match tokio::fs::read(&index).await {
        Ok(bytes) => {
            let mut res = warp::reply::Response::new(bytes.into());
            res.headers_mut().insert("content-type", "text/html".parse().unwrap());
            Ok(res)
        }
        Err(_) => Ok(warp::reply::with_status(
            "Not found",
            warp::http::StatusCode::NOT_FOUND,
        ).into_response()),
    }
}

// ── Utility functions ──

async fn find_free_port(start: u16) -> u16 {
    for port in start..(start + 100) {
        if tokio::net::TcpListener::bind(("0.0.0.0", port)).await.is_ok() {
            return port;
        }
    }
    start
}

async fn get_local_ip() -> String {
    if let Ok(socket) = tokio::net::UdpSocket::bind("0.0.0.0:0").await {
        if socket.connect("8.8.8.8:53").await.is_ok() {
            if let Ok(local) = socket.local_addr() {
                return local.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

async fn get_external_ip() -> String {
    if let Ok(resp) = reqwest::get("https://api.ipify.org").await {
        if let Ok(ip) = resp.text().await {
            return ip.trim().to_string();
        }
    }
    "unknown".to_string()
}

async fn add_upnp_mapping(port: u16) -> bool {
    if let Ok(gateway) = igd::search_gateway(Default::default()) {
        match gateway.add_port(
            igd::PortMappingProtocol::TCP,
            port,
            SocketAddr::from(([0, 0, 0, 0], port)),
            3600,
            "shyqui-music",
        ) {
            Ok(_) => { println!("✅ UPnP port {} opened", port); true }
            Err(e) => { println!("⚠️  UPnP failed: {}", e); false }
        }
    } else {
        println!("⚠️  No UPnP gateway found");
        false
    }
}

// ── Auth handlers ──

async fn auth_register_handler(body: serde_json::Value, auth_store: AuthStoreRef) -> impl Reply {
    let username = body["username"].as_str().unwrap_or("").to_string();
    let password = body["password"].as_str().unwrap_or("").to_string();
    if username.trim().is_empty() || password.len() < 3 {
        return warp::reply::with_status(
            warp::reply::json(&serde_json::json!({"error": "Username required, password min 3 chars"})),
            warp::http::StatusCode::BAD_REQUEST,
        ).into_response();
    }
    let mut store = match auth_store.lock() {
        Ok(s) => s,
        Err(_) => return warp::reply::with_status(
            warp::reply::json(&serde_json::json!({"error": "Internal error"})),
            warp::http::StatusCode::INTERNAL_SERVER_ERROR,
        ).into_response(),
    };
    if store.users.iter().any(|u| u.username == username) {
        return warp::reply::with_status(
            warp::reply::json(&serde_json::json!({"error": "Username already exists"})),
            warp::http::StatusCode::CONFLICT,
        ).into_response();
    }
    let hash = match crate::auth::hash_password(&password) {
        Ok(h) => h,
        Err(_) => return warp::reply::with_status(
            warp::reply::json(&serde_json::json!({"error": "Internal error"})),
            warp::http::StatusCode::INTERNAL_SERVER_ERROR,
        ).into_response(),
    };
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
    let user_id = uuid::Uuid::new_v4().to_string();
    let token = uuid::Uuid::new_v4().to_string();
    store.users.push(crate::auth::StoredUser {
        id: user_id.clone(),
        username: username.clone(),
        password_hash: hash,
        created_at: now,
    });
    store.sessions.push(crate::auth::Session {
        token: token.clone(),
        user_id: user_id.clone(),
        created_at: now,
    });
    store.save();
    warp::reply::json(&serde_json::json!({
        "token": token,
        "user": { "id": user_id, "username": username, "created_at": now }
    })).into_response()
}

async fn auth_login_handler(body: serde_json::Value, auth_store: AuthStoreRef) -> impl Reply {
    let username = body["username"].as_str().unwrap_or("").to_string();
    let password = body["password"].as_str().unwrap_or("").to_string();
    let store = match auth_store.lock() {
        Ok(s) => s,
        Err(_) => return warp::reply::with_status(
            warp::reply::json(&serde_json::json!({"error": "Internal error"})),
            warp::http::StatusCode::INTERNAL_SERVER_ERROR,
        ).into_response(),
    };
    let user = match store.users.iter().find(|u| u.username == username) {
        Some(u) => u.clone(),
        None => return warp::reply::with_status(
            warp::reply::json(&serde_json::json!({"error": "Invalid credentials"})),
            warp::http::StatusCode::UNAUTHORIZED,
        ).into_response(),
    };
    match crate::auth::verify_password(&password, &user.password_hash) {
        Ok(true) => {},
        _ => return warp::reply::with_status(
            warp::reply::json(&serde_json::json!({"error": "Invalid credentials"})),
            warp::http::StatusCode::UNAUTHORIZED,
        ).into_response(),
    }
    let token = uuid::Uuid::new_v4().to_string();
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
    drop(store);
    let mut store = auth_store.lock().unwrap();
    store.sessions.push(crate::auth::Session {
        token: token.clone(),
        user_id: user.id.clone(),
        created_at: now,
    });
    store.save();
    warp::reply::json(&serde_json::json!({
        "token": token,
        "user": { "id": user.id, "username": user.username, "created_at": user.created_at }
    })).into_response()
}

async fn auth_verify_handler(body: serde_json::Value, auth_store: AuthStoreRef) -> impl Reply {
    let token = body["token"].as_str().unwrap_or("").to_string();
    let store = auth_store.lock().unwrap();
    if let Some(session) = store.sessions.iter().find(|s| s.token == token) {
        if let Some(user) = store.users.iter().find(|u| u.id == session.user_id) {
            return warp::reply::json(&serde_json::json!({
                "valid": true,
                "user": { "id": user.id, "username": user.username, "created_at": user.created_at }
            })).into_response();
        }
    }
    warp::reply::json(&serde_json::json!({"valid": false})).into_response()
}

// ── Filter helpers ──

fn with_state(state: SharedState) -> impl Filter<Extract = (SharedState,), Error = Infallible> + Clone {
    warp::any().map(move || state.clone())
}

fn with_clients(clients: Clients) -> impl Filter<Extract = (Clients,), Error = Infallible> + Clone {
    warp::any().map(move || clients.clone())
}

fn with_cache(cache: PathBuf) -> impl Filter<Extract = (PathBuf,), Error = Infallible> + Clone {
    warp::any().map(move || cache.clone())
}

fn with_handle(handle: tauri::AppHandle) -> impl Filter<Extract = (tauri::AppHandle,), Error = Infallible> + Clone {
    warp::any().map(move || handle.clone())
}

fn with_dist(dist: PathBuf) -> impl Filter<Extract = (PathBuf,), Error = Infallible> + Clone {
    warp::any().map(move || dist.clone())
}

fn with_auth(auth: AuthStoreRef) -> impl Filter<Extract = (AuthStoreRef,), Error = Infallible> + Clone {
    warp::any().map(move || auth.clone())
}
