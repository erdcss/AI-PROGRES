import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import { ensureWatchdogScheduled, pollInboxAndPresent } from "../lib/inbox-alerts";
import { WATCHDOG_NOTIFICATION_ID, ensureAndroidChannel } from "../hooks/usePush";

export const INBOX_BACKGROUND_TASK = "ORVIAN_INBOX_POLL";
export const BACKGROUND_NOTIFICATION_TASK = "ORVIAN_NOTIFICATION_TASK";

TaskManager.defineTask(INBOX_BACKGROUND_TASK, async () => {
  try {
    await ensureAndroidChannel();
    await pollInboxAndPresent();
    await ensureWatchdogScheduled();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.warn("[push] background inbox poll failed", err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async () => {
  try {
    await ensureAndroidChannel();
    await Notifications.dismissNotificationAsync(WATCHDOG_NOTIFICATION_ID).catch(() => undefined);
    await pollInboxAndPresent();
    await ensureWatchdogScheduled();
  } catch (err) {
    console.warn("[push] notification task failed", err);
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
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((err) => {
      console.warn("[push] notification task register skipped", err);
    });
    await ensureWatchdogScheduled();
  } catch (err) {
    console.warn("[push] background task register skipped", err);
  }
}
