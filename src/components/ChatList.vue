<template>
  <ion-list>
    <ion-item v-for="chat in app.chat.list.filter(filterChats)" @click="router.push(`/chat/${chat.contact.publicKey}`)" :key="chat.contact.publicKey">
      <ion-label :class="{ unread: chat.unreadMessages }">
        {{ chat.contact.advName }}
      </ion-label>
      <ion-badge v-if="chat.unreadMessages" slot="start" color="danger">{{ chat.unreadMessages }}</ion-badge>
    </ion-item>
  </ion-list>
</template>

<script setup lang="ts">
import { useAppStore } from '@/stores/app';
import { IonList, IonItem, IonLabel, IonBadge } from '@ionic/vue';
import { useRouter } from 'vue-router';
import { Chat } from '@/MeshCore/App';
import Contact from '@/MeshCore/Client';
import * as mcf from '@/MeshCore/Frame';

const router = useRouter();
const app = useAppStore();

function sortByNewestMessage(a: Chat, b: Chat) {
  return a.messages?.at(-1).timestamp - b.messages?.at(-1).timestamp;
}

function filterChats(chat) {
  return chat.contact.type === mcf.AdvType.Chat
}
</script>

<style>
  ion-label.unread {
    font-weight: 800;
  }
</style>