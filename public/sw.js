self.addEventListener("push", (event) => {
  let payload = null;
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = null;
    }
  }

  const title =
    payload && typeof payload.title === "string"
      ? payload.title
      : "Family Planner";
  const body =
    payload && typeof payload.body === "string"
      ? payload.body
      : "New notification";
  const url =
    payload && typeof payload.url === "string" ? payload.url : "/";
  const tag =
    payload && typeof payload.tag === "string" ? payload.tag : undefined;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
