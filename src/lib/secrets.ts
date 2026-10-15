// Connection tokens, in the login keychain: one entry per connection, under the service "Flux"
// and the connection's id. The Rust side is src-tauri/src/secrets.rs; see docs/adr/0012.
import { invoke } from "@tauri-apps/api/core";

/** The token stored for a connection, or null when there is none. */
export async function getSecret(account: string): Promise<string | null> {
  return invoke<string | null>("secret_get", { account });
}

/** Stores the token, replacing whatever the entry held. */
export async function setSecret(account: string, secret: string): Promise<void> {
  await invoke("secret_set", { account, secret });
}

/** Removes the entry; one that is not there is not an error. */
export async function deleteSecret(account: string): Promise<void> {
  await invoke("secret_delete", { account });
}
