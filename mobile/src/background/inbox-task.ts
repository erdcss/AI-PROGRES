import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import { pollInboxAndPresent } from "../lib/inbox-alerts";
import { ensureAndroidChannel } from "../hooks/usePush";

export const INBOX_BACKGROUND_TASK = "ORVIAN_INBOX_POLL";

TaskManager.defineTask(INBOX_BACKGROUND_TASK, async () => {
  try {
    await ensureAndroidChannel();
    await pollInboxAndPresent();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.warn("[push] background inbox poll failed", err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerInboxBackgroundTask(): Promise<void> {
  try {
    await ensureAndroidChannel();
    const registered = await TaskManager.isTaskRegisteredAsync(INBOX_BACKGROUND_TASK);
    if (!registered) {
      await BackgroundTask.registerTaskAsync(INBOX_BACKGROUND_TASK, {
        minimumInterval: 15,
      });
    }
  } catch (err) {
    console.warn("[push] background task register skipped", err);
  }
}
