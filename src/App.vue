<script setup lang="ts">
import { onMounted, ref, reactive } from 'vue';
import { SerialPort } from 'tauri-plugin-serialplugin';

import { Link, FPushCode } from './MeshCore/Link.ts';

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
    connected: false,
    ports: null,
    selected: null,
  } as SerialState,
  bluetooth: {
    connected: false,
    ports: null,
    selected: null,
  },
  link: null,
  contacts: {
    lastSync: 0,
    list: []
  },
  chats: []
});

const connectSerial = async (path: string) => {
  const port = new SerialPort({
    path: path,
    baudRate: 115200
  });
  try {
    await port.open();
    app.serial.connected = true;
    port.disconnected(() => {
      app.serial.selected = null;
      app.serial.connected = false;
    });
  } catch(e) {
    app.serial.connected = false;
    throw e;
  }
  app.serial.selected = port;
  await processSerial(port);
}

const disconnectSerial = async () => {
  const port = app.serial.selected;

  try {
    if(!port) throw new Error('already disconnected!');
    await port.close();
  }
  catch(e) {
    console.error(e);
  }
  finally {
    app.serial.selected = null;
    app.serial.connected = false;
  }
}

const processSerial = async (port: SerialPort) => {
  const link = app.link = new Link(port, { debug: true, timeout: 200 });

  link.onPushNotification(FPushCode.Advert, (data) => {
    console.log('new advertisment', data);
  })

  link.onPushNotification(FPushCode.SendConfirmed, (data) => {
    console.log('new send confirmed', data);
  })

  console.log('app', app);
  const deviceInfo = await link.appStart('MCC', 1);
  delete deviceInfo.code;
  app.deviceInfo = deviceInfo;
  // await link.setDeviceTime(getCurrentTimestamp());

  app.contacts.list = await link.getContacts();
}

const saveUserName = () => {
  console.log('saveUserName');
  app.link.setAdvertName(app.deviceInfo.name);
}

const refreshPorts = async () => {
  const allPorts = Object.entries(await SerialPort.available_ports());

  app.serial.ports = allPorts
    .filter(([_, port]) => port.type === 'USB')
    .map(([path, port]) => ({ name: port.product, path: path }))
    .sort((a, b) => a.path.localeCompare(b.path)) as Serial[];

  console.log(app.serial.ports);
}

onMounted(async () => {
  refreshPorts();
});

</script>

<template>
  <div class="container">
    <header class="max fixed secondary-container">
      <nav>
        <a class="circle transparent"><i>contacts</i></a>
        <span class="max">
          <div v-if="app.serial.connected" class="field label prefix border"><i>person</i><input type="text" placeholder=" " v-model="app.deviceInfo.name" @keyup.enter="saveUserName"><label>User Name</label></div>
        </span>
        <a v-if="app.serial.connected" data-ui="#serial-ports-actions" :title="app.serial.selected?.options.path"><i>usb</i>
          <menu class="left no-wrap" id="serial-ports-actions">
            <a data-ui="menu-selector" @click="console.log(app.serial)">debug info</a>
            <a data-ui="menu-selector" @click="disconnectSerial()">disconnect [{{ app.serial.selected?.options.path }}]</a>
          </menu>
        </a>
        <a v-else-if="app.serial.ports?.length" class="circle transparent" data-ui="#serial-ports-connect" @click="refreshPorts" title="Connect to device"><i>usb_off</i>
          <menu class="left no-wrap" id="serial-ports-connect">
            <a data-ui="menu-selector" v-for="port in app.serial.ports" @click="connectSerial(port.path)">{{ port.name }}[{{ port.path }}]</a>
          </menu>
        </a>
        <a class="circle transparent"><i>more_vert</i></a>
      </nav>
    </header>
    <article class="border" v-for="contact in app.contacts.list" @click="openChat(contact)">
        <h6><i class="large">person</i> {{ contact.advName }}</h6>
        <div><i class="small">key</i> {{ contact.publicKey }}</div>
    </article>
  </div>
</template>

<style>
html {
  user-select: none;
  cursor: default;
}

button {
  cursor: default;
}
.container {
  height: 100vh;
}
</style>