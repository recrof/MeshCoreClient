<template>
	<ion-card v-for="contact of app.contact.list.sort(sortByLatestAdvert)" :key="contact.publicKey">
    <ion-card-header>
      <ion-card-title>
        <ion-icon :icon="getIconType(contact.type)"></ion-icon>
        {{ contact.advName }}
      </ion-card-title>
    </ion-card-header>

    <ion-card-content>
      <ion-icon :icon="time"></ion-icon> {{ lastUpdateRelative(contact) }}<br>
      <ion-icon :icon="key"></ion-icon> {{ contact.publicKey }}
    </ion-card-content>

    <ion-button fill="clear" @click="router.push(`/chat/${contact.publicKey}`)" :disabled="contact.type !== mcf.AdvType.Chat">Chat</ion-button>
  </ion-card>
</template>

<script setup lang="ts">
import Contact from '@/MeshCore/Client';
import * as mcf from '@/MeshCore/Frame';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { IonButton, IonCard, IonCardTitle, IonCardSubtitle, IonCardHeader, IonCardContent } from '@ionic/vue';
import { IonIcon } from '@ionic/vue';
import { person, key, server, chatbox, help, time } from 'ionicons/icons';
import { formatRelative } from 'date-fns';

const router = useRouter();
const app = useAppStore();

function sortByLatestAdvert(a: Contact, b: Contact) {
  return b.lastAdvert - a.lastAdvert;
}

function getIconType(type: mcf.AdvType) {
  switch(type) {
    case mcf.AdvType.Chat: return person;
    case mcf.AdvType.Repeater: return server;
    case mcf.AdvType.Room: return chatbox;
  }

  return help;
}

function lastUpdateRelative(contact: Contact) {
  return formatRelative(new Date(), new Date(contact.lastAdvert * 1000))
}
</script>
