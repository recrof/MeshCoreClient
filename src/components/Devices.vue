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
        <ion-button fill="clear" @click="connect('serial')">Connect serial</ion-button>
        <ion-button fill="clear" @click="connect('bluetooth')">Connect bluetooth</ion-button>
      </template>
    </template>
  </ion-card>
</template>

<script>
</script>
<script setup lang="ts">
import { requestNotificationAccess } from '@/MeshCore/App';
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

async function connect(type: string) {
  app.device.connected = false;

  const commOptions = {
    debug: true,
    onConnect: () => app.device.connected = true,
    onDisconnect: () => app.device.connected = true,
  };

  if(type === 'serial') {
    app.comm = new SerialComm(commOptions);
    await app.comm.connect();
  } else {
    app.comm = new BluetoothComm(commOptions);
    await app.comm.connect(app.bluetooth.service, app.bluetooth.charRx, app.bluetooth.charTx);
  }

  requestNotificationAccess();
  app.client = new Client(app.comm);
  await initClient(app.client);
}

async function disconnect() {
  location.reload()
}
</script>