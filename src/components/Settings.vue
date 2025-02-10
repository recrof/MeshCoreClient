<template>
  <ion-card>
    <ion-card-header>
      <ion-card-title>General Settings</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <ion-list>
        <ion-item>
          <ion-input label-placement="fixed" label="Device Name" placeholder="Enter new name" v-model="app.device.settings.name" @keyup.enter="setName()">
          </ion-input>
        </ion-item>
      </ion-list>
    </ion-card-content>
    <ion-button fill="clear" @click="setName()">Set name</ion-button>
  </ion-card>

  <ion-card>
    <ion-card-header>
      <ion-card-title>Radio Settings</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <ion-list>
        <ion-item>
          <ion-input label-placement="fixed" title="Frequency" label="Freq (kHz)" v-model="app.device.settings.radioFreq"></ion-input>
        </ion-item>
        <ion-item>
          <ion-input label-placement="fixed" title="Bandwidth" label="BW (Hz)" v-model="app.device.settings.radioBw"></ion-input>
        </ion-item>
        <ion-item>
          <ion-input label-placement="fixed" title="Spreading Factor" label="SF" v-model="app.device.settings.radioSf"></ion-input>
        </ion-item>
        <ion-item>
          <ion-input label-placement="fixed" title="Coding Rate" label="CR" v-model="app.device.settings.radioCr"></ion-input>
        </ion-item>
      </ion-list>
    </ion-card-content>
    <ion-button fill="clear" @click="setRadioSettings()">Set radio settings</ion-button>
  </ion-card>

  <ion-card class="ion-hide">
    <ion-card-header>
      <ion-card-title>Advanced settings</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <ion-list>
        <ion-item>
          <ion-input label-placement="fixed" label="TX power" v-model="app.device.settings.name" @keyup.enter="setName()">
          </ion-input>
        </ion-item>
      </ion-list>
    </ion-card-content>
    <ion-button fill="clear" @click="setName()">Set name</ion-button>
  </ion-card>
</template>

<script setup lang="ts">
import * as mcf from '@/MeshCore/Frame';
import { useAppStore, Chat } from '@/stores/app';
import { IonItem, IonList, IonInput, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/vue';
import { } from 'ionicons/icons';
import { useRouter } from 'vue-router';

const router = useRouter();
const app = useAppStore();

async function setName() {
  await app.client.setAdvertName(app.device.settings.name);
  // re-announce with new name
  await app.client.sendSelfAdvert(mcf.SelfAdvertType.Flood);
}

async function setRadioSettings() {
  try {
    await app.client.setRadioParams({
      radioFreq: app.device.settings.radioFreq,
      radioBw: app.device.settings.radioBw,
      radioSf: app.device.settings.radioSf,
      radioCr: app.device.settings.radioCr
    });

    await app.comm.disconnect();
    app.device.connected = false;
    alert('Settings saved, please restart the device.');
    location.reload();
  }
  catch(e) {
    alert('Settings were NOT saved, please check your input and try again.')
  }
}
</script>