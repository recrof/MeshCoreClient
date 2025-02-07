import * as mcf from './Frame';
import { Client, Contact } from './Client';
import { useAppStore } from '@/stores/app';
import { computed, ComputedRef } from 'vue';
import * as com from './Comm';

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
};

export interface Message {
  timestamp: number,
  text: string,
  own: boolean,
  status: MessageStatus,
  ackCode: string
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
    if(!message) return;

    message.status = MessageStatus.Delivered;
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

  await client.sendSelfAdvert(1);

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
  const messages = await app.client.syncAllMessages();
  if(!messages.length) return;
  for(const message of messages) {
    const chat = app.chat.list.find(chat => chat.contact.publicKey.startsWith(message.pubKeyPrefix));
    if(chat == null) continue;

    chat?.messages.push({
      timestamp: message.senderTimestamp,
      text: message.text,
      own: false,
      status: MessageStatus.Unread,
      ackCode: ''
    });
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
