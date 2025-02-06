<template>
  <ion-content class="ion-padding">
    <template v-if="app.platform.web">
      <ion-button @click="connectWebSerial">Connect serial</ion-button>
      <ion-button @click="connectWebBluetooth">Connect bluetooth</ion-button>
    </template>
    <ion-select v-else aria-label="Fruit" interface="popover" placeholder="Select device" v-model="app.selectedDevice">
      <ion-select-option disabled><strong>Bluetooth</strong></ion-select-option>
      <ion-select-option value="oranges">Oranges</ion-select-option>
      <template v-if="app.platform.android">
        <ion-select-option disabled><strong>Serial</strong></ion-select-option>
        <ion-select-option value="bananas">Bananas</ion-select-option>
      </template>
    </ion-select>
    <template v-if="app.comm && app.deviceInfo.name">
    <ion-input label="Name" placeholder="Enter new name" v-model="app.deviceInfo.name" @keyup.enter="setName()">
      <ion-button slot="end" @click="setName()">
        <ion-icon slot="icon-only" :icon="save" aria-hidden="true"></ion-icon>
      </ion-button>
    </ion-input>
    </template>
  </ion-content>
</template>

<script>
</script>
<script setup lang="ts">
import { BluetoothComm, SerialComm } from '@/MeshCore/Comm';
import { Client } from '@/MeshCore/Client';
import { initClient } from '@/MeshCore/App';
import { useAppStore } from '@/stores/app';
import { IonSelect, IonSelectOption, IonContent, IonIcon, IonButton, IonInput } from '@ionic/vue';
import { save } from 'ionicons/icons';

const app = useAppStore();
async function setName() {
  app.client.setAdvertName(app.deviceInfo.name);
}

async function connectWebSerial() {
  app.comm = new SerialComm({ debug: true });
  await app.comm.connect();
  app.client = new Client(app.comm);
  await initClient(app.client);
}

async function connectWebBluetooth() {
  app.comm = new BluetoothComm({ debug: true });
  await app.comm.connect(app.bluetooth.service, app.bluetooth.charRx, app.bluetooth.charTx);
  app.client = new Client(app.comm);
  await initClient(app.client);
};
</script>