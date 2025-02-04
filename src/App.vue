<script setup lang="ts">
import { onMounted, ref, reactive } from 'vue';
import { SerialPort } from 'tauri-plugin-serialplugin';
import { BleDevice, startScan } from '@mnlphlp/plugin-blec';

import { Link, FPushCode, FSelfAdvertType } from './MeshCore/Link.ts';

import 'beercss';
import 'material-dynamic-colors';

interface Serial {
  name: string,
  path: string
};

interface SerialState {
  connected: boolean,
  ports: Serial[] | null,
  selected: SerialPort | null,
};

interface Message {
  text: string,
  own: boolean,
  timestamp: number,
};

interface Chat {
  updated: number,
  name: string,
  publicKey: string,
  messages: Message[]
};

const getCurrentTimestamp = () => Date.now() / 1000 | 0;

const app = reactive({
  deviceInfo: {},
  serial: {
    selected: null ,
  } as SerialState,
  bluetooth: {
    selected: null,
    devices: [] as BleDevice[],
    characteristic: '6E400002-B5A3-F393-E0A9-E50E24DCCA9E',
    scanning: false,
  },
  link: new Link({ debug: true, timeout: 500 }),
  contact: {
    lastSync: 0,
    list: []
  },
  chat: {
    selected: null,
    list: [] as Chat[]
  },
  editMessage: '',
  lastContactRefresh: 0,
  pageSelected: 'contacts'
});


const initLink = async(link: Link) => {
  link.onPushNotification(FPushCode.Advert, async (data) => {
    console.log('FPushCode.Advert', data);
    await refreshContacts();
  })

  link.onPushNotification(FPushCode.SendConfirmed, (data) => {
    console.log('FPushCode.SendConfirmed', data);
  })

  link.onPushNotification(FPushCode.MsgWaiting, async (data) => {
    console.log('FPushCode.MsgWaiting', data);

    const message = await link.syncNextMessage();
    if(!message) return;
    const chat = app.chat.list.find(chat => chat.publicKey.startsWith(message.pubKeyPrefix));
    chat?.messages.push({
      timestamp: message.senderTimestamp,
      text: message.text,
      own: false
    })
  });

  console.log('app', app);
  const deviceInfo = await link.appStart('MCC', 1);
  delete deviceInfo.code;
  app.deviceInfo = deviceInfo;

  if(await link.getDeviceTime() < getCurrentTimestamp()) {
    await link.setDeviceTime(getCurrentTimestamp());
  };

  await link.sendSelfAdvert(1);

  await refreshContacts();
};

const connectSerial = async (port: SerialPort) => {
  await app.link.connectSerial(port, 115200);
  await initLink(app.link);
};

const connectBluetooth = async (device: BleDevice) => {
  await app.link.connectBluetooth(device, app.bluetooth.characteristic);
  await initLink(app.link);
};

const refreshContacts = async () => {
  app.contact.list = await app.link.getContacts(app.lastContactRefresh);
  for(const contact of app.contact.list) {
    if(app.chat.list.some(chat => chat.publicKey === contact.publicKey)) continue;
    app.chat.list.push({
      updated: 0,
      publicKey: contact.publicKey,
      name: contact.name,
      messages: [] as Message[]
    })
  }
  app.lastContactRefresh = getCurrentTimestamp();
}

const saveUserName = () => {
  app.link.setAdvertName(app.deviceInfo.name);
}

const refreshSerialPorts = async () => {
  const allPorts = Object.entries(await SerialPort.available_ports());

  app.serial.ports = allPorts
    .filter(([_, port]) => port.type === 'USB')
    .map(([path, port]) => ({ name: port.product, path: path }))
    .sort((a, b) => a.path.localeCompare(b.path)) as Serial[];

  console.log(app.serial.ports);
}

const refreshBluetooth = async() => {
  startScan((devices: BleDevice[]) => app.bluetooth.devices = devices, 10000);
}

const openChat = (contact) => {
  const chat = app.chat.list.find(chat => chat.publicKey === contact.publicKey);
  if(!chat) return;
  app.pageSelected = 'chat';
  app.chat.selected = chat;
  app.editMessage = '';
}

const sendMessage = async () => {
  const message = app.editMessage;
  await app.link.sendTxtMsg({
    txtType: 0,
    attempt: 1,
    senderTimestamp: getCurrentTimestamp(),
    pubKeyPrefix: app.chat.selected.publicKey.substring(0, 12),
    text: message
  });

  app.chat.selected.messages.push({
    text: message,
    own: true,
    timestamp: getCurrentTimestamp()
  });
  app.editMessage = '';
}

const selfAnnounce = async () => {
  await app.link.sendSelfAdvert(FSelfAdvertType.Flood);
}

onMounted(async () => {
  refreshSerialPorts();
  // refreshBluetooth();
});

</script>

<template>
  <div class="container" v-if="app.pageSelected === 'chat' && app.chat.selected">
    <header class="max fixed secondary-container">
      <nav>
        <button class="circle transparent" @click="app.chat.selected = null;app.pageSelected = 'contacts'"><i>arrow_back</i></button>
        <h5 class="max">{{ app.chat.selected.name }}</h5>
        <button class="circle transparent"><i>more_vert</i></button>
      </nav>
    </header>
    <div class="chat-container">
      <div class="messages">
        <p v-for="msg in app.chat.selected.messages?.toReversed()" class="round primary-container" :class="msg.own ? 'right secondary' : 'left primary'">{{ msg.text }}</p>
      </div>
    </div>
    <footer>
      <nav>
        <div class="field label border max">
          <input type="text" placeholder=" " @keyup.enter="sendMessage" v-model="app.editMessage"><label>Message</label>
        </div>
        <button class="circle primary" @click="sendMessage"><i>send</i></button>
      </nav>
    </footer>
  </div>
  <div v-else-if="app.pageSelected === 'settings'" >

  </div>
  <div v-else-if="app.pageSelected === 'contacts'" class="container">
    <header class="max fixed secondary-container">
      <nav>
        <a class="hidden circle transparent"><i>contacts</i></a>
        <span class="max">
          <div v-if="app.link.isConnected" class="field label prefix border"><i>person</i><input type="text" placeholder=" " v-model="app.deviceInfo.name" @keyup.enter="saveUserName"><label>User Name</label></div>
        </span>
        <template v-if="app.link.isConnected">
          <a class="circle transparent" name="Flood announce" @click="selfAnnounce()"><i>cell_tower</i></a>
          <a data-ui="#serial-ports-actions" :title="app.serial.selected?.options.path">
            <i>usb</i>
            <menu class="left no-wrap" id="serial-ports-actions">
              <a data-ui="menu-selector" @click="console.log(app.serial)">debug info</a>
              <a data-ui="menu-selector" @click="app.link.disconnect()">disconnect [{{ app.serial.selected?.options.path }}]</a>
            </menu>
          </a>
        </template>
        <template v-else-if="app.serial.ports?.length">
          <a class="circle transparent" data-ui="#serial-ports-connect" @click="refreshSerialPorts" title="Connect to device">
            <i>usb_off</i>
            <menu class="left no-wrap" id="serial-ports-connect">
              <a data-ui="menu-selector" v-for="port in app.serial.ports" @click="connectSerial(port.path)">{{ port.name }}[{{ port.path }}]</a>
            </menu>
          </a>
        </template>
        <template v-if="app.link.isConnected && app.link.linkType">
          <a  data-ui="#bluetooth-ports-actions" :title="app.bluetooth.selected?.name">
            <i>bluetooth_connected</i>
            <menu class="left no-wrap" id="bluetooth-ports-actions">
              <a data-ui="menu-selector" @click="console.log(app.bluetooth)">debug info</a>
              <a data-ui="menu-selector" @click="app.link.disconnect()">disconnect [{{ app.bluetooth.selected?.name }}]</a>
            </menu>
          </a>
        </template>
        <template v-else-if="app.bluetooth.devices?.length">
          <a class="circle transparent" data-ui="#bluetooth-ports-connect" @click="refreshBluetooth" title="Connect to device">
            <i>bluetooth</i>
            <menu class="left no-wrap" id="bluetooth-ports-connect">
              <a data-ui="menu-selector" v-for="device in app.bluetooth.devices" @click="connectBluetooth(device)">{{ device.name }}[{{ device.address }}]</a>
            </menu>
          </a>
        </template>
        <a class="hidden circle transparent"><i>more_vert</i></a>
      </nav>
    </header>
    <div class="contacts">
      <article class="contact border" v-for="contact in app.contact.list" @click="openChat(contact)">
          <h6><i class="large">person</i> {{ contact.advName }}</h6>
          <p><i class="small">key</i> {{ contact.publicKey }}</p>
      </article>
    </div>
  </div>
</template>

<style>
html {
  user-select: none;
  cursor: default;
  box-sizing: border-box;
}

button {
  cursor: default;
}
.hidden {
  display: none;
}
.container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.chat-container {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}
.contacts {
  padding: 5px;
}
.contacts article p {
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: keep-all;
  max-width: 100%;
}
.messages {
  flex-grow: 1;
  display: flex;
  flex-direction: column-reverse;
  padding: 5px;
}
.messages p {
  padding: 2px 12px;
}

.messages p.right {
  align-self: flex-end;
}
.messages p.left {
  align-self: flex-start;
}

</style>