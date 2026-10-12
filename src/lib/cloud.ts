// Flux's account and the preferences that follow it between machines, kept by Supabase so that
// there is no server of our own to run. Signing in is required: every launch asks Supabase
// whether the session on this machine is still good before the window opens. What syncs is the
// person's preferences and nothing else — connections, their tokens, projects, saved queries
// and stage addresses never leave the machine (docs/adr/0009).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { loadSettings, saveSettings, withDefaults, type Settings } from "./settings";

/** The project's address and its publishable key: public by design, every row is behind RLS. */
export const SUPABASE_URL = "https://dorbuegwifjjellvclsq.supabase.co";
export const SUPABASE_KEY = "sb_publishable_hAVUwYmnRfEMYdKhAqzfTA_UYm4qIrn";

/** Where the sign-in link brings the browser back to: this app, by its own URL scheme. */
export const AUTH_CALLBACK = "flux://auth/callback";

export type AuthState =
  | { status: "checking" }
  | { status: "unconfigured" }
  | { status: "signed-out"; error?: string }
  | { status: "unreachable"; error: string }
  | { status: "signed-in"; email: string };

/** The settings that sync: everything but what belongs to this machine's connections. */
export type Preferences = Omit<Settings, "connections" | "projects" | "replay">;

export function preferencesOf(settings: Settings): Preferences {
  const { connections: _c, projects: _p, replay: _r, ...preferences } = settings;
  void _c;
  void _p;
  void _r;
  return preferences;
}

/** This machine's settings with the synced preferences over them; its own parts kept as they are. */
export function withPreferences(local: Settings, remote: Partial<Preferences>): Settings {
  return withDefaults({ ...local, ...remote, connections: local.connections, projects: local.projects, replay: local.replay });
}

/** What a `flux://auth/callback` link carries: the code to finish signing in with, or why it failed. */
export function callbackOf(url: string): { code: string } | { error: string } | null {
  if (!url.startsWith(AUTH_CALLBACK)) return null;
  const query = new URLSearchParams(url.slice(url.indexOf("?") + 1).split("#")[0]);
  const hash = new URLSearchParams(url.includes("#") ? url.slice(url.indexOf("#") + 1) : "");
  const code = query.get("code");
  if (code) return { code };
  const error = query.get("error_description") ?? hash.get("error_description") ?? query.get("error") ?? hash.get("error");
  return { error: error ? error.replace(/\+/g, " ") : "The sign-in link did not carry a code." };
}

export function isEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

let client: SupabaseClient | null = null;

function cloud(): SupabaseClient {
  // through the HTTP plugin, like every other call Flux makes, so it is issued from Rust
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "flux-auth" },
    global: { fetch: (input, init) => tauriFetch(input, init) },
  });
  return client;
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A failure that is the network's rather than the account's: the session may well be fine. */
function unreachable(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? "";
  const status = (e as { status?: number })?.status;
  return name === "AuthRetryableFetchError" || name === "TypeError" || status === 0 || (status != null && status >= 500);
}

/**
 * Whether this machine is signed in, asked of Supabase every time: a session in storage is not
 * taken at its word. A session Supabase refuses is dropped; a Supabase that cannot be reached
 * blocks, since signing in is required.
 */
export async function verify(): Promise<AuthState> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { status: "unconfigured" };
  try {
    const { data: session, error: sessionError } = await cloud().auth.getSession();
    if (sessionError) throw sessionError;
    if (!session.session) return { status: "signed-out" };
    const { data, error } = await cloud().auth.getUser();
    if (error) throw error;
    return { status: "signed-in", email: data.user.email ?? "" };
  } catch (e) {
    if (unreachable(e)) return { status: "unreachable", error: reason(e) };
    await cloud()
      .auth.signOut({ scope: "local" })
      .catch(() => {});
    return { status: "signed-out", error: "Your session has ended. Sign in again." };
  }
}

/** The sign-in email, with a link that comes back to this app. */
export async function sendLink(email: string): Promise<void> {
  const { error } = await cloud().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: AUTH_CALLBACK } });
  if (error) throw new Error(error.message);
}

/**
 * The link from the email, opened. The code in it is exchanged for a session together with the
 * verifier this machine kept when it asked for the link — which is why the link only works on
 * the Mac that sent it.
 */
export async function finishSignIn(url: string): Promise<AuthState | null> {
  const found = callbackOf(url);
  if (!found) return null;
  if ("error" in found) return { status: "signed-out", error: found.error };
  const { data, error } = await cloud().auth.exchangeCodeForSession(found.code);
  if (error) {
    return {
      status: "signed-out",
      error: /verifier/i.test(error.message) ? "Open the link on the Mac that asked for it, with Flux running there." : error.message,
    };
  }
  return { status: "signed-in", email: data.user.email ?? "" };
}

export async function signOut(): Promise<void> {
  await cloud()
    .auth.signOut()
    .catch(() => cloud().auth.signOut({ scope: "local" }));
}

/** Who is signed in on this machine, as the session in storage says. */
export async function signedInAs(): Promise<string | null> {
  if (!SUPABASE_URL) return null;
  const { data } = await cloud().auth.getSession();
  return data.session?.user.email ?? null;
}

async function userId(): Promise<string | null> {
  const { data } = await cloud().auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * The preferences kept in the cloud, written over this machine's before the window opens. A
 * first sign-in has none yet, and this machine's become the account's.
 */
export async function pullPreferences(): Promise<void> {
  const id = await userId();
  if (!id) return;
  const { data, error } = await cloud().from("user_settings").select("preferences").eq("user_id", id).maybeSingle();
  if (error) throw new Error(error.message);
  const local = await loadSettings();
  const remote = data?.preferences as Partial<Preferences> | undefined;
  if (remote && Object.keys(remote).length) await saveSettings(withPreferences(local, remote));
  else await pushPreferences(local);
}

export async function pushPreferences(settings: Settings): Promise<void> {
  const id = await userId();
  if (!id) return;
  const { error } = await cloud()
    .from("user_settings")
    .upsert({ user_id: id, preferences: preferencesOf(settings), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

let pending: ReturnType<typeof setTimeout> | undefined;

/** A change, sent a few seconds after the last one, so a dragged slider is one write. */
export function schedulePush(settings: Settings): void {
  if (!SUPABASE_URL) return;
  clearTimeout(pending);
  pending = setTimeout(() => void pushPreferences(settings).catch(() => {}), 3000);
}

/** The person's synced preferences removed from the cloud; this machine keeps its own. */
export async function deleteCloudData(): Promise<void> {
  const id = await userId();
  if (!id) return;
  const { error } = await cloud().from("user_settings").delete().eq("user_id", id);
  if (error) throw new Error(error.message);
}
