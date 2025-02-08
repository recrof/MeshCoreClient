<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Discover</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">Discover</ion-title>
        </ion-toolbar>
      </ion-header>
      <Discover />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/vue';
import Discover from '@/components/Discover.vue';
import { useAppStore } from '@/stores/app';
import { onBeforeMount } from 'vue';

const app = useAppStore();
onBeforeMount(() => app.device.connected ? null : location.href = '/');
</script>
