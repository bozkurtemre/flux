//! Access tokens live in the OS credential store, never in Flux's own files.
//! macOS Keychain, Windows Credential Manager or the Linux Secret Service, whichever
//! the platform provides. Flux keeps only the pointer that a secret exists.

const SERVICE: &str = "Flux";

fn entry(account: &str) -> Result<keyring::Entry, String> {
    if account.is_empty() {
        return Err("empty account".into());
    }
    keyring::Entry::new(SERVICE, account).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn secret_set(account: String, secret: String) -> Result<(), String> {
    entry(&account)?
        .set_password(&secret)
        .map_err(|e| e.to_string())
}

/// `None` when nothing was stored, which is not an error: a fresh install has no secrets.
#[tauri::command]
pub async fn secret_get(account: String) -> Result<Option<String>, String> {
    match entry(&account)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn secret_delete(account: String) -> Result<(), String> {
    match entry(&account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
