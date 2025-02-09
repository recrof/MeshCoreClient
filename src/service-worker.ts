/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;
precacheAndRoute(self.__WB_MANIFEST);

const broadcast = new BroadcastChannel('notification-channel');

broadcast.addEventListener('message', (event: MessageEvent) => {
  const data = event.data;

  if (data && data.type === 'SHOW_NOTIFICATION') {
    const title = data.title || 'Default Title';
    const options: NotificationOptions = {
      body: data.body || 'Default Body',
      data: { url: data.url, target: data.publicKey } || {},
      icon: '/favicon-96x96.png',
    };

    console.log('message: show_notification:', options)
    self.registration.showNotification(title, options)
      .then(() => console.log('Notification shown via Broadcast Channel'))
      .catch(error => console.error('Error showing notification:', error));
  }
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  const data = event.notification.data;
  event.notification.close();
  broadcast.postMessage({
    type: 'NOTIFICATION_CLICK',
    target: data.target,
    url: data.url
  });
});