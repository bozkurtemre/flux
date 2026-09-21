// A notification outside the window. macOS grants that per application and asks once, so
// everything that wants to be heard goes through here rather than calling the plugin and
// finding out nothing happened.
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

/** True when it was shown; false when notifications are not allowed for Flux. */
export async function announce(title: string, body: string, sound?: string): Promise<boolean> {
  const granted = (await isPermissionGranted()) || (await requestPermission()) === "granted";
  if (granted) sendNotification({ title, body, sound: sound && sound !== "none" ? sound : undefined });
  return granted;
}
