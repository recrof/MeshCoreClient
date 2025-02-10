<template>
  <ion-card>
    <ion-card-header>
      <ion-card-title>
        Send advert
      </ion-card-title>
    </ion-card-header>
    <ion-button fill="clear" @click="reAdvert(mcf.SelfAdvertType.ZeroHop)">Zero-hop</ion-button>
    <ion-button fill="clear" @click="reAdvert(mcf.SelfAdvertType.Flood)">Flood</ion-button>
  </ion-card>
	<ion-card v-for="contact of app.contact.list.sort(sortByLatestAdvert)" :key="contact.publicKey">
    <ion-card-header>
      <ion-card-title>
        <ion-icon :icon="getIconType(contact.type)"></ion-icon>
        {{ contact.advName }}
      </ion-card-title>
    </ion-card-header>

    <ion-card-content>
      <ion-icon :icon="time"></ion-icon> <span class="time-announced">{{ lastUpdateRelative(contact) }}</span><br>
      <ion-icon :icon="key"></ion-icon> <span class="public-key">{{ contact.publicKey }}</span>
    </ion-card-content>

    <ion-button fill="clear" @click="router.push(`/chat/${contact.publicKey}`)" :disabled="contact.type !== mcf.AdvType.Chat">Chat</ion-button>
    <ion-button fill="clear" @click="copyPublicKey(contact)">Copy Key</ion-button>
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

function reAdvert(type: mcf.SelfAdvertType) {
  const warningMessage =
    'You are about to flood ENTIRE network with your advert.\n'+
    'This puts severe stress on the mesh, please use this feature sparingly!';

  if(type === mcf.SelfAdvertType.Flood && !confirm(warningMessage)) { return }

  app.client.sendSelfAdvert(type);
}

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

function copyPublicKey(contact: Contact) {
  navigator.clipboard.writeText(contact.publicKey);
}
</script>

<style>
.public-key {
  font-family: monospace;
  display: inline-block;
  max-width: 120px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
</style>