// Access tokens are kept by the OS credential store, addressed by connection id.
// The settings file records only that a secret exists, never the secret itself.
import { invoke } from "@tauri-apps/api/core";

export async function setSecret(account: string, secret: string): Promise<void> {
  await invoke("secret_set", { account, secret });
}

export async function getSecret(account: string): Promise<string | null> {
  return invoke<string | null>("secret_get", { account });
}

export async function deleteSecret(account: string): Promise<void> {
  await invoke("secret_delete", { account });
}
