import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  getNotificationPermissionStatus,
  openNotificationSettings,
  registerPushIfAllowed,
  requestNotificationPermission,
  type NotificationPermissionStatus,
} from "../hooks/usePush";

type Ctx = {
  status: NotificationPermissionStatus;
  show: () => void;
  requestSystemPermission: () => Promise<boolean>;
  registerDevice: () => Promise<{ ok: boolean; error?: string }>;
  refresh: () => Promise<void>;
};

const PermissionCtx = createContext<Ctx | null>(null);

export function useNotificationPermission(): Ctx {
  const ctx = useContext(PermissionCtx);
  if (!ctx) {
    return {
      status: "undetermined",
      show: () => undefined,
      requestSystemPermission: async () => false,
      registerDevice: async () => ({ ok: false, error: "Hazır değil" }),
      refresh: async () => undefined,
    };
  }
  return ctx;
}

export function NotificationPermissionGate({
  ready,
  children,
}: {
  ready: boolean;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<NotificationPermissionStatus>("undetermined");
  const askedRef = useRef(false);

  const refresh = useCallback(async () => {
    const next = await getNotificationPermissionStatus();
    setStatus(next);
    if (next === "granted") {
      await registerPushIfAllowed();
    }
  }, []);

  const requestSystemPermission = useCallback(async () => {
    const current = await getNotificationPermissionStatus();
    if (current === "granted") {
      setStatus("granted");
      return true;
    }
    if (current === "denied") {
      await openNotificationSettings();
      const after = await getNotificationPermissionStatus();
      setStatus(after);
      return after === "granted";
    }
    const granted = await requestNotificationPermission();
    const next = granted ? "granted" : await getNotificationPermissionStatus();
    setStatus(next);
    return next === "granted";
  }, []);

  const registerDevice = useCallback(async () => {
    let next = await getNotificationPermissionStatus();
    if (next !== "granted") {
      const granted = await requestSystemPermission();
      if (!granted) {
        return { ok: false, error: "Sistem bildirim izni verilmedi." };
      }
      next = "granted";
      setStatus("granted");
    }
    return registerPushIfAllowed();
  }, [requestSystemPermission]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const next = await getNotificationPermissionStatus();
      if (cancelled) return;
      setStatus(next);
      if (next === "granted") {
        await registerPushIfAllowed();
        return;
      }
      if (!askedRef.current && next === "undetermined") {
        askedRef.current = true;
        const granted = await requestNotificationPermission();
        if (cancelled) return;
        setStatus(granted ? "granted" : await getNotificationPermissionStatus());
        if (granted) await registerPushIfAllowed();
      }
    })();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [ready, refresh]);

  return (
    <PermissionCtx.Provider
      value={{
        status,
        show: () => {
          void requestSystemPermission();
        },
        requestSystemPermission,
        registerDevice,
        refresh,
      }}
    >
      {children}
    </PermissionCtx.Provider>
  );
}
