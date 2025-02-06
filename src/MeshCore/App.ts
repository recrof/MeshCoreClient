import * as mcf from './Frame';
import { Client, Contact } from './Client';
import { useAppStore } from '@/stores/app';
import * as com from './Comm';

const app = useAppStore();

console.log('debug vars', { app, com, mcf });

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
  Pending = 0,
  Sent = 1,
  Received = 2,
};

export interface Message {
  text: string,
  own: boolean,
  timestamp: number,
  status: MessageStatus
};

export interface Chat {
  updated: number,
  contact: Contact,
  messages: Message[]
};

export async function initClient(client: Client) {
  client.onAdvert(async (data) => {
    console.log('FPushCode.Advert', data);
    await refreshContacts();
  })

  client.onSendConfirmed(async (data) => {
    console.log('FPushCode.SendConfirmed', data);
  })

  client.onMsgWaiting(async (data) => {
    console.log('FPushCode.MsgWaiting', data);
    await processPendingMessages();
  });

  const deviceInfo = await client.appStart(1, 'MCC');

  // @ts-expect-error: we don't want the code, but code is mandatory in this type
  delete deviceInfo.code;

  app.deviceInfo = deviceInfo;
  const epochNow = app.getCurrentTimestamp();
  if((await client.getDeviceTime()).epochSecs < epochNow) {
    await client.setDeviceTime(epochNow);
  };

  await client.sendSelfAdvert(1);

  await refreshContacts();
  await processPendingMessages();

};

export async function processPendingMessages() {
  const messages = await app.client.syncAllMessages();
  if(!messages.length) return;
  for(const message of messages) {
    const chat = app.chat.list.find(chat => chat.contact.publicKey.startsWith(message.pubKeyPrefix));
    chat?.messages.push({
      timestamp: message.senderTimestamp,
      text: message.text,
      own: false
    })
  }
}

export async function refreshContacts() {
  app.contact.list = await app.client.getContacts(app.lastContactRefresh);
  for(const contact of app.contact.list) {
    if(app.chat.list.some(chat => chat.publicKey === contact.publicKey)) continue;
    app.chat.list.push({
      updated: 0,
      contact,
      messages: [] as Message[]
    })
  }
  app.lastContactRefresh = app.getCurrentTimestamp();
}

export async function selfAnnounce() {
  await app.client.sendSelfAdvert(mcf.SelfAdvertType.Flood);
}
