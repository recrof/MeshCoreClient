<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Devices</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">Devices</ion-title>
        </ion-toolbar>
      </ion-header>
      <Devices />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/vue';
import { useAppStore } from '@/stores/app';
import Devices from '@/components/Devices.vue';

const app = useAppStore();

</script>
