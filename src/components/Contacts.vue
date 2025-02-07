<template>
	<ion-card v-for="contact of app.contact.list" :key="contact.publicKey">
    <ion-card-header>
      <ion-card-title>
        {{ contact.advName }}
      </ion-card-title>
    </ion-card-header>

    <ion-card-content>
      <ion-icon :icon="key"></ion-icon> {{ contact.publicKey }}
    </ion-card-content>

    <ion-button fill="clear" @click="router.push(`/chat/${contact.publicKey}`)">Chat</ion-button>
  </ion-card>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { IonButton, IonCard, IonCardTitle, IonCardSubtitle, IonCardHeader, IonCardContent } from '@ionic/vue';
import { IonIcon } from '@ionic/vue';
import { person, key } from 'ionicons/icons';

const router = useRouter();
const app = useAppStore();
</script>
