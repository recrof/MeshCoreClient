<template>
  <ion-content class="flex">
    <div class="messages">
      <p v-for="msg in app.chat.selected.messages?.toReversed()" class="round primary-container" :class="{ own: msg.own }">{{ msg.text }}</p>
    </div>
  </ion-content>
  <ion-footer>
    <ion-input label-placement="floating" label="Message" v-model="app.chat.message" @keyup.enter="sendMessage()" ref="chatbox">
      <ion-button slot="end" @click="sendMessage()">
        <ion-icon slot="icon-only" :icon="send" aria-hidden="true"></ion-icon>
      </ion-button>
    </ion-input>
  </ion-footer>
</template>

<script setup lang="ts">
import { IonFooter, IonInput, IonButton, IonIcon, IonContent } from '@ionic/vue';
import { onMounted, ref } from 'vue';
import { useAppStore, Chat } from '@/stores/app';
import { send, checkmarkCircle, checkmarkDoneCircle } from 'ionicons/icons';

import * as mcf from '@/MeshCore/Frame';
const app = useAppStore();

const chat = app.chat.selected as Chat | null;
const contact = chat.contact;
const chatbox = ref();

onMounted(() => chatbox.value.$el.setFocus());

async function sendMessage() {
  const message = app.chat.message;
  if(!chat) return;

  await app.client.sendTxtMsg({
    txtType: mcf.TxtType.plain,
    attempt: 1,
    senderTimestamp: app.getCurrentTimestamp(),
    pubKeyPrefix: contact.publicKey.substring(0, 12),
    text: message
  });

  chat.messages.push({
    text: message,
    own: true,
    timestamp: app.getCurrentTimestamp(),
    status: 0
  });

  app.chat.message = '';
}

</script>

<style>
ion-content.flex {
  display: flex;
}
.messages {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  flex-grow: 1;
  display: flex;
  flex-direction: column-reverse;
  padding: 5px;
  overflow-y: auto;
}
.messages p {
  border-radius: 14px;
  padding: 6px 12px;
  align-self: flex-start;
  background-color: var(--ion-color-tertiary-shade);
  margin-block-end: 5px;
  margin-block-start: 5px;
}
.messages p.own {
  align-self: flex-end;
  background-color: var(--ion-color-medium-shade);
}
</style>