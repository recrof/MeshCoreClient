<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Contacts</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">Contacts</ion-title>
        </ion-toolbar>
      </ion-header>
      <Contacts />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/vue';
import Contacts from '@/components/Contacts.vue';
import { useAppStore } from '@/stores/app';
import { onBeforeMount } from 'vue';

const app = useAppStore();
onBeforeMount(() => app.device.connected ? null : location.href = '/');
</script>
