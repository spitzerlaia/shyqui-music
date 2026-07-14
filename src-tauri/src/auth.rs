use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use serde::{Serialize, Deserialize};

pub type AuthStoreRef = Arc<Mutex<AuthStore>>;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct StoredUser {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub created_at: u64,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub created_at: u64,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Session {
    pub token: String,
    pub user_id: String,
    pub created_at: u64,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct AuthStore {
    pub users: Vec<StoredUser>,
    pub sessions: Vec<Session>,
    #[serde(skip)]
    pub file_path: PathBuf,
}

impl AuthStore {
    pub fn new(file_path: PathBuf) -> Self {
        let store = if file_path.exists() {
            std::fs::read_to_string(&file_path)
                .ok()
                .and_then(|s| serde_json::from_str::<AuthStoreRaw>(&s).ok())
                .map(|raw| Self {
                    users: raw.users,
                    sessions: raw.sessions,
                    file_path: file_path.clone(),
                })
                .unwrap_or_else(|| Self { users: Vec::new(), sessions: Vec::new(), file_path: file_path.clone() })
        } else {
            Self { users: Vec::new(), sessions: Vec::new(), file_path }
        };
        store
    }

    pub fn save(&self) {
        if let Ok(content) = serde_json::to_string(&self.to_raw()) {
            let _ = std::fs::write(&self.file_path, content);
        }
    }

    fn to_raw(&self) -> AuthStoreRaw {
        AuthStoreRaw {
            users: self.users.clone(),
            sessions: self.sessions.clone(),
        }
    }
}

#[derive(Serialize, Deserialize)]
struct AuthStoreRaw {
    users: Vec<StoredUser>,
    sessions: Vec<Session>,
}

pub fn hash_password(password: &str) -> Result<String, String> {
    bcrypt::hash(password, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, String> {
    bcrypt::verify(password, hash).map_err(|e| e.to_string())
}
