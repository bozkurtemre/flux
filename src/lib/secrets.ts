// What is left of the credential store. Tokens are kept in `connections.json` now; these two
// exist so an install that predates that can have its keychain entry read back and removed.
// See docs/adr/0005.
import { invoke } from "@tauri-apps/api/core";

export async function getSecret(account: string): Promise<string | null> {
  return invoke<string | null>("secret_get", { account });
}

export async function deleteSecret(account: string): Promise<void> {
  await invoke("secret_delete", { account });
}
