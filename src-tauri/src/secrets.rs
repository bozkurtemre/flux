//! Connection tokens, in the login keychain: a generic password per connection, under the service
//! "Flux" and the connection's id as the account, where Keychain Access shows them.
//!
//! The keychain lets the app that wrote an item read it again without asking, and it decides
//! which app that is by the code signature's designated requirement. A release signed with the
//! Developer ID keeps that requirement from one update to the next, so the grant survives them;
//! that is what an unsigned build could not do, and why the tokens spent a while in
//! `connections.json` (docs/adr/0005, reversed by docs/adr/0012).
//!
//! The legacy login keychain rather than the data protection keychain: the latter wants a
//! provisioning profile and a keychain access group that an app distributed outside the App
//! Store would have to be built around.

/// Which entry: a connection id, which is a UUID, so anything much longer is not one.
fn account_of(account: &str) -> Result<&str, String> {
    let account = account.trim();
    if account.is_empty() || account.len() > 128 {
        return Err("not a connection id".into());
    }
    Ok(account)
}

#[cfg(target_os = "macos")]
mod keychain {
    use security_framework::passwords::{
        delete_generic_password, get_generic_password, set_generic_password,
    };

    const SERVICE: &str = "Flux";
    /// `errSecItemNotFound`: nothing stored under that account, which is an answer, not a failure.
    const NOT_FOUND: i32 = -25300;

    pub fn get(account: &str) -> Result<Option<String>, String> {
        match get_generic_password(SERVICE, account) {
            Ok(bytes) => String::from_utf8(bytes)
                .map(Some)
                .map_err(|_| "the stored token is not text".to_string()),
            Err(e) if e.code() == NOT_FOUND => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    /// Creates the entry, or replaces what it holds when there is one already.
    pub fn set(account: &str, secret: &str) -> Result<(), String> {
        set_generic_password(SERVICE, account, secret.as_bytes()).map_err(|e| e.to_string())
    }

    pub fn delete(account: &str) -> Result<(), String> {
        match delete_generic_password(SERVICE, account) {
            Err(e) if e.code() != NOT_FOUND => Err(e.to_string()),
            _ => Ok(()),
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod keychain {
    const NONE: &str = "Flux keeps tokens in the macOS keychain, and this is not macOS";
    pub fn get(_: &str) -> Result<Option<String>, String> {
        Err(NONE.into())
    }
    pub fn set(_: &str, _: &str) -> Result<(), String> {
        Err(NONE.into())
    }
    pub fn delete(_: &str) -> Result<(), String> {
        Err(NONE.into())
    }
}

// A keychain call can wait on a dialog (a build signed differently from the one that stored the
// token is asked first), so each runs on a blocking thread rather than on the async runtime.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// `None` when nothing is stored for the connection: a fresh one, or one without a token.
#[tauri::command]
pub async fn secret_get(account: String) -> Result<Option<String>, String> {
    let account = account_of(&account)?.to_owned();
    blocking(move || keychain::get(&account)).await
}

#[tauri::command]
pub async fn secret_set(account: String, secret: String) -> Result<(), String> {
    let account = account_of(&account)?.to_owned();
    if secret.is_empty() || secret.len() > 16 * 1024 {
        return Err("not a token".into());
    }
    blocking(move || keychain::set(&account, &secret)).await
}

/// Deleting what is not there is not an error: the connection simply had no token stored.
#[tauri::command]
pub async fn secret_delete(account: String) -> Result<(), String> {
    let account = account_of(&account)?.to_owned();
    blocking(move || keychain::delete(&account)).await
}

// Against the real login keychain, so it is run by hand rather than by `make check`:
//   cd src-tauri && cargo test --lib secrets -- --ignored
#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::keychain;

    #[test]
    #[ignore = "writes to the login keychain"]
    fn a_token_goes_in_comes_back_and_goes() {
        let account = format!("flux-test-{}", std::process::id());
        assert_eq!(keychain::get(&account).unwrap(), None);
        keychain::set(&account, "t-1").unwrap();
        assert_eq!(keychain::get(&account).unwrap().as_deref(), Some("t-1"));
        keychain::set(&account, "t-2").unwrap();
        assert_eq!(keychain::get(&account).unwrap().as_deref(), Some("t-2"));
        keychain::delete(&account).unwrap();
        assert_eq!(keychain::get(&account).unwrap(), None);
        // and again, which finds nothing to delete and says so quietly
        keychain::delete(&account).unwrap();
    }
}
