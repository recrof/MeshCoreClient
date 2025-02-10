/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', (event) => {
  console.log('SW: install triggered');
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  console.log('SW: activate triggered');
  event.waitUntil(self.clients.claim());
});

// notifications
function getClientPublicKey(client: WindowClient): Promise<string> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => {
      if (e.data.publicKey) resolve(e.data.publicKey);
      else reject('No publicKey received');
    };
    client.postMessage({ type: 'GET_PUBLIC_KEY' }, [channel.port2]);
  });
}

function sendNavigateMessage(client: WindowClient, url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => resolve(e.data.success);
    client.postMessage({ type: 'NAVIGATE_TO_URL', url }, [channel.port2]);
  });
}

self.addEventListener('message', (event) => {
  if (event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, url, publicKey } = event.data;
    const options: NotificationOptions = {
      body: body || 'Default Body',
      data: { url, target: publicKey },
      icon: '/favicon-96x96.png',
    };
    self.registration.showNotification(title, options);
  }
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  const data = event.notification.data;
  event.notification.close();

  event.waitUntil(
    (async () => {
      const targetPublicKey = data.target;
      const allClients = await clients.matchAll();

      for (const client of allClients) {
        try {
          const publicKey = await getClientPublicKey(client);
          console.log('searching for ', publicKey);
          if (publicKey === targetPublicKey) {
            console.log('found');
            await client.focus();
            // Instruct client to navigate using router
            const navigateSuccess = await sendNavigateMessage(client, data.url);
            if (navigateSuccess) break;
          }
        } catch (error) {
          console.error('Error:', error);
        }
      }
    })()
  );
});
