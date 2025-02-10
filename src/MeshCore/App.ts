import * as mcf from './Frame';
import { Client, Contact } from './Client';
import { useAppStore } from '@/stores/app';
import { computed, ComputedRef } from 'vue';
import * as com from './Comm';
import router from '../router';

const app = useAppStore();

export interface Serial {
  name: string,
  path: string
};

export interface SerialState {
  connected: boolean,
  ports: Serial[] | null,
  selected: SerialPort | null,
};

export enum MessageStatus {
  Unread = -1,
  Read = 0,
  Pending = 1,
  Sent = 2,
  Delivered = 3,
  Failed = 4
};

export interface Message {
  timestamp: number,
  text: string,
  own: boolean,
  status: MessageStatus,
  ackCode?: string,
  roundTrip?: number,
  retries?: number
};

export interface Chat {
  updated: number,
  contact: Contact,
  messages: Message[],
  unreadMessages: ComputedRef,
};

export type AckCodeMap = Record<string, Message>;

export async function initClient(client: Client) {
  client.onAdvert(async (data) => {
    console.log('FPushCode.Advert', data);
    await refreshContacts();
  })

  client.onSendConfirmed(async (data) => {
    const message = app.chat.ackCodes[data.ackCode] ?? findMessageByAckCode(data.ackCode);
    if(!message) {
      console.log('WARNING: did not find the message with ackCode:', data.ackCode)

      return;
    }

    message.status = MessageStatus.Delivered;
    message.roundTrip = data.roundTrip;
  })

  client.onMsgWaiting(async (data) => {
    console.log('FPushCode.MsgWaiting', data);
    await processPendingMessages();
  });

  const deviceInfo = await client.appStart(1, 'MCC');

  // @ts-expect-error: we don't want the code, but code is mandatory in this type
  delete deviceInfo.code;

  app.device.settings = deviceInfo;
  console.log('device', app.device);
  const epochNow = app.getCurrentTimestamp();
  if((await client.getDeviceTime()).epochSecs < epochNow) {
    await client.setDeviceTime(epochNow);
  };

  await client.sendSelfAdvert();
  await refreshContacts();
  await processPendingMessages();
};

export function findMessageByAckCode(ackCode: string) {
  console.warn('findMessageByAckCode called. this is not optimal.');

  for(const chat of app.chat.list) {
    const message = chat.messages.find(msg => msg.ackCode === ackCode);
    if(message) return message;
  }

  return null;
}

export async function processPendingMessages() {
  const incommingMessages = await app.client.syncAllMessages();
  if(!incommingMessages.length) return;

  const selectedChat = app.chat.selected;

  for(const incommingMessage of incommingMessages) {
    const chat = app.chat.list.find(chat => chat.contact.publicKey.startsWith(incommingMessage.pubKeyPrefix));
    if(chat == null) continue;
    const isOpen = document.hasFocus() && chat === selectedChat;
    const messageStatus = isOpen ? MessageStatus.Read : MessageStatus.Unread;

    chat?.messages.push({
      timestamp: incommingMessage.senderTimestamp,
      text: incommingMessage.text,
      own: false,
      status: messageStatus,
      ackCode: ''
    });

    if(messageStatus === MessageStatus.Unread) {
      app.chat.notifAudio.play();
      showNotification(
        `Message from ${chat.contact.advName}`,
        incommingMessage.text,
        `/chat/${chat.contact.publicKey}`
      )
    }
  }
}

export async function refreshContacts() {
  app.contact.list = await app.client.getContacts(app.lastContactRefresh);
  for(const contact of app.contact.list) {
    if(app.chat.list.some(chat => chat.contact.publicKey === contact.publicKey)) continue;

    const chat = {
      updated: 0,
      contact,
      messages: [] as Message[],
      get unreadMessages() {
        return this.messages.reduce(
          (count: number, item: Message) => count + (item.status === MessageStatus.Unread ? 1 : 0),
        0);
      }
    }

    app.chat.list.push(chat)
  }
  app.contact.lastSync = app.getCurrentTimestamp();
}

export async function selfAnnounce() {
  await app.client.sendSelfAdvert(mcf.SelfAdvertType.Flood);
}

function shortenText(text: string, maxLength = 80) {
  if (text.length <= maxLength) {
    return text;
  }
  const match = text.match(/^.{0,${maxLength - 1}}\b(?!\w)/);
  if (match) {
      //If there's a match (i.e., we found a word boundary within the limit), return the matched portion.
      return match[0] + "...";  // Append ellipsis to indicate shortening.
  }

  return text;
}

export async function requestNotificationAccess() {
  try {
    const permissionResult = await Notification.requestPermission();

    if (permissionResult === 'granted') {
      console.log('Notification permission granted.');
    } else if (permissionResult === 'denied') {
      console.warn('Notification permission denied.');
    } else { // permissionResult === 'default'
      console.log('Notification permission dismissed.');
    }
  } catch (error) {
    console.error('Error requesting notification permission:', error);
  }
}

export function showNotification(title: string, body: string, url: string) {
  if (navigator.serviceWorker.controller) {
    console.log('postMessage to sw: SHOW_NOTIFICATION');
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      title,
      body: shortenText(body),
      url,
      publicKey: app.device.settings.publicKey
    });
  }
}

navigator.serviceWorker.addEventListener('message', (event) => {
  if (event.data.type === 'GET_PUBLIC_KEY') {
    const port = event.ports[0];
    port.postMessage({ publicKey: app.device.settings.publicKey });
  } else if (event.data.type === 'NAVIGATE_TO_URL') {
    const url = event.data.url;
    router.push(url).then(() => {
      const port = event.ports[0];
      port.postMessage({ success: true });
    });
  }
});

app.chat.unreadCount = computed(() => {
  if(app.chat.list.length === 0) return 0;

  return app.chat.list.reduce(
    (count, item) => {
      const chatUnread = item.messages.some(m => m.status === MessageStatus.Unread) ? 1 : 0
      return count + chatUnread
    },
    0
  );
});

Object.assign(window, { app, com, mcf });
