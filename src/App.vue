<script setup lang="ts">
import { onMounted, ref, reactive } from 'vue';
import { SerialPort } from 'tauri-plugin-serialplugin';

import { Link } from './MeshCore/Link.ts';

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
  messages: Message[]
};


const userName = ref('');

const contacts = reactive([] as Contact[]);

const chats = reactive([] as Chat[]);

const messageTo = ref('');

const getCurrentTimestamp = () => Date.now() / 1000 | 0;

const link = ref(null);

const app = reactive({
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
  link: null
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
  const port = serial.selected;

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
  app.serial.link = new Link(port, { debug: true });

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
        <div v-if="app.serial.connected" class="field label prefix border"><i>person</i><input type="text" placeholder=" " v-model="userName" @keyup.enter="saveUserName"><label>User Name</label></div>
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