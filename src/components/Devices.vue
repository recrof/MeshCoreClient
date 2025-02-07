<template>
  <ion-card>
    <ion-card-header>
      <ion-card-title>Connection</ion-card-title>
    </ion-card-header>
    <template v-if="app.device.connected">
      <ion-card-content>
      <ion-item v-if="(app.comm instanceof BluetoothComm)">
        <ion-icon slot="start" :icon="bluetooth"></ion-icon>
        <ion-label> Connected to <code>{{ app.device.settings.name }}</code> via Bluetooth</ion-label>
      </ion-item>
      <ion-item v-else-if="(app.comm instanceof SerialComm)">
        <ion-icon slot="start" :icon="link"></ion-icon>
        <ion-label> Connected to <code>{{ app.device.settings.name }}</code> via USB Serial</ion-label>
      </ion-item>
      </ion-card-content>
      <ion-button fill="clear" @click="disconnect()">Disconnect</ion-button>
    </template>
    <template v-else>
      <ion-card-content>
        <ion-item>
          <ion-icon slot="start" :icon="informationCircle"></ion-icon>
          <ion-label>default bluetooth password is <code>123456</code></ion-label>
        </ion-item>
      </ion-card-content>
      <template v-if="app.platform.web">
        <ion-button fill="clear" @click="connectWebSerial">Connect serial</ion-button>
        <ion-button fill="clear" @click="connectWebBluetooth">Connect bluetooth</ion-button>
      </template>
    </template>
  </ion-card>
</template>

<script>
</script>
<script setup lang="ts">
import { BluetoothComm, SerialComm } from '@/MeshCore/Comm';
import { Client } from '@/MeshCore/Client';
import { initClient } from '@/MeshCore/App';
import { useAppStore } from '@/stores/app';
import {
  IonSelect, IonSelectOption, IonContent, IonIcon, IonButton, IonItem, IonLabel,
  IonCard, IonCardContent, IonCardHeader, IonCardTitle
} from '@ionic/vue';

import { bluetooth, link, informationCircle } from 'ionicons/icons';

const app = useAppStore();

async function connectWebSerial() {
  app.device.connected = false;
  app.comm = new SerialComm({ debug: true });

  app.comm.onConnect = () => app.device.connected = true;
  app.comm.onDisconnect = () => app.device.connected = true;

  await app.comm.connect();
  app.client = new Client(app.comm);
  await initClient(app.client);
}

async function connectWebBluetooth() {
  app.device.connected = false;
  app.comm = new BluetoothComm({ debug: true });

  app.comm.onConnect = () => app.device.connected = true;
  app.comm.onDisconnect = () => app.device.connected = true;

  await app.comm.connect(app.bluetooth.service, app.bluetooth.charRx, app.bluetooth.charTx);
  app.client = new Client(app.comm);
  await initClient(app.client);
};

async function disconnect() {
  location.reload()
}
</script>