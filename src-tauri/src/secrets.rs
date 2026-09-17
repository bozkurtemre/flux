//! What is left of the OS credential store. Access tokens are kept in `connections.json`
//! now (see docs/adr/0005); these two commands exist so an install that predates that can
//! have its entry read back into the file and removed from the store. Nothing writes here.

const SERVICE: &str = "Flux";

fn entry(account: &str) -> Result<keyring::Entry, String> {
    if account.is_empty() {
        return Err("empty account".into());
    }
    keyring::Entry::new(SERVICE, account).map_err(|e| e.to_string())
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
