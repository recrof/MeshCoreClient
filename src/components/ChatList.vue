<template>
  <ion-list>
    <ion-item v-for="chat in app.chat.list" @click="router.push(`/chat/${chat.contact.publicKey}`)" :key="chat.contact.publicKey">
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

const router = useRouter();
const app = useAppStore();
</script>

<style>
  ion-label.unread {
    font-weight: 800;
  }
</style>