import React from "react";
import Modal from "./Modal";
import Button from "./Button";
import {
  fetchVapidPublicKey,
  sendPushTest,
  subscribePush,
  unsubscribePush,
} from "../../api/client";
import { decodeBase64Url, getDeviceId, isPushSupported } from "../../utils/push";

type NoticeTone = "info" | "error";

interface NotificationsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function NotificationsModal({
  open,
  onClose,
}: NotificationsModalProps) {
  const supported =
    isPushSupported() && typeof Notification !== "undefined";
  const [permission, setPermission] = React.useState<
    NotificationPermission | "unsupported"
  >(() => (supported ? Notification.permission : "unsupported"));
  const [busy, setBusy] = React.useState(false);
  const [subscriptionActive, setSubscriptionActive] = React.useState<
    boolean | null
  >(null);
  const [notice, setNotice] = React.useState<{
    tone: NoticeTone;
    message: string;
  } | null>(null);
  const deviceId = React.useMemo(() => getDeviceId(), []);

  const refreshSubscription = React.useCallback(async () => {
    if (!supported) {
      setSubscriptionActive(false);
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        setSubscriptionActive(false);
        return;
      }
      const subscription = await registration.pushManager.getSubscription();
      setSubscriptionActive(Boolean(subscription));
    } catch {
      setSubscriptionActive(false);
    }
  }, [supported]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    if (!supported) {
      setPermission("unsupported");
      setSubscriptionActive(false);
      return;
    }
    setPermission(Notification.permission);
    refreshSubscription();
  }, [open, refreshSubscription, supported]);

  const formatError = (error: unknown): string => {
    if (!error || typeof error !== "object") {
      return "Something went wrong.";
    }
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
    return "Something went wrong.";
  };

  const getRegistration = async (): Promise<ServiceWorkerRegistration> => {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) {
      return existing;
    }
    return navigator.serviceWorker.register("/sw.js");
  };

  const handleEnable = async () => {
    setNotice(null);
    if (!supported) {
      setNotice({
        tone: "error",
        message: "Push notifications are not supported in this browser.",
      });
      return;
    }
    setBusy(true);
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        setNotice({
          tone: "error",
          message: "Permission was not granted.",
        });
        return;
      }
      const registration = await getRegistration();
      const { publicKey } = await fetchVapidPublicKey();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64Url(publicKey) as BufferSource,
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Subscription details were incomplete.");
      }
      await subscribePush({
        deviceId,
        subscription: {
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
        },
        userAgent: navigator.userAgent,
      });
      await refreshSubscription();
      setNotice({
        tone: "info",
        message: "Push notifications enabled on this device.",
      });
    } catch (error) {
      setNotice({ tone: "error", message: formatError(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setNotice(null);
    if (!supported) {
      setNotice({
        tone: "error",
        message: "Push notifications are not supported in this browser.",
      });
      return;
    }
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration
        ? await registration.pushManager.getSubscription()
        : null;
      if (subscription) {
        await subscription.unsubscribe();
      }
      await unsubscribePush({ deviceId });
      await refreshSubscription();
      setNotice({
        tone: "info",
        message: "Push notifications disabled on this device.",
      });
    } catch (error) {
      setNotice({ tone: "error", message: formatError(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setNotice(null);
    setBusy(true);
    try {
      const result = await sendPushTest({ deviceId });
      const message =
        result.attempted === 0
          ? "No active subscription found for this device."
          : `Test sent (${result.sent}/${result.attempted}).`;
      setNotice({ tone: "info", message });
    } catch (error) {
      setNotice({ tone: "error", message: formatError(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Notifications" open={open} onClose={onClose}>
      <p className="muted">
        Push notifications are per device. Enable them on the devices you want
        to alert.
      </p>
      {!supported ? (
        <div className="notice is-error">
          This browser does not support push notifications.
        </div>
      ) : (
        <>
          <div className="card">
            <div className="summary-label">Status</div>
            <div>Permission: {permission}</div>
            <div>
              Subscription:{" "}
              {subscriptionActive === null
                ? "Unknown"
                : subscriptionActive
                ? "Enabled"
                : "Disabled"}
            </div>
          </div>
          {notice ? (
            <div className={`notice${notice.tone === "error" ? " is-error" : ""}`}>
              {notice.message}
            </div>
          ) : null}
          <div className="modal-actions">
            <Button onClick={handleEnable} disabled={busy}>
              Enable push notifications
            </Button>
            <Button variant="ghost" onClick={handleDisable} disabled={busy}>
              Disable push notifications
            </Button>
            <Button
              variant="ghost"
              onClick={handleTest}
              disabled={busy || subscriptionActive === false}
            >
              Send test notification
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
