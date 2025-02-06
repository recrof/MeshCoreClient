<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet></ion-router-outlet>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="devices" href="/tabs/devices">
          <ion-icon aria-hidden="true" :icon="radio" />
          <ion-label>Devices</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="contacts" href="/tabs/contacts">
          <ion-icon aria-hidden="true" :icon="book" />
          <ion-label>Contacts</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="chats" href="/tabs/chats">
          <ion-icon aria-hidden="true" :icon="chatbox" />
          <ion-label>Chats</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="settings" href="/tabs/settings">
          <ion-icon aria-hidden="true" :icon="settings" />
          <ion-label>Settings</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import { IonTabBar, IonTabButton, IonTabs, IonLabel, IonIcon, IonPage, IonRouterOutlet } from '@ionic/vue';
import { radio, book, settings, chatbox } from 'ionicons/icons';
</script>
