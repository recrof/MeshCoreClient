<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet></ion-router-outlet>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="devices" href="/tabs/devices">
          <ion-icon aria-hidden="true" :icon="radio" />
          <ion-label>Devices</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="discover" href="/tabs/discover" :disabled="!app.device.connected">
          <ion-icon aria-hidden="true" :icon="book" />
          <ion-label>Discover</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="chats" href="/tabs/chats" :disabled="!app.device.connected">
          <ion-icon aria-hidden="true" :icon="chatbox" />
          <ion-label>Chats</ion-label>
          <ion-badge v-if="app.chat.unreadCount" color="danger">{{ app.chat.unreadCount }}</ion-badge>
        </ion-tab-button>

        <ion-tab-button tab="settings" href="/tabs/settings" :disabled="!app.device.connected">
          <ion-icon aria-hidden="true" :icon="settings" />
          <ion-label>Settings</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonTabBar, IonTabButton, IonTabs, IonLabel, IonIcon, IonPage, IonRouterOutlet,
  IonBadge
} from '@ionic/vue';
import { radio, book, settings, chatbox } from 'ionicons/icons';
import { computed } from 'vue';
import { useAppStore } from '@/stores/app';

const app = useAppStore();
</script>
