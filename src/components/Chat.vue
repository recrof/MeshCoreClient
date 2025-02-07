<template>
  <ion-content class="flex">
    <div class="messages">
      <p v-for="msg in app.chat.selected.messages?.toReversed()" :class="messageClass(msg)">
        {{ msg.text }}
        <small>{{ messageTime(msg) }}</small>
        <ion-icon size="small" v-if="msg.status === MessageStatus.Pending" :icon="helpCircle"></ion-icon>
        <ion-icon size="small" v-if="msg.status === MessageStatus.Sent" :icon="checkmarkCircle"></ion-icon>
        <ion-icon size="small" v-else-if="msg.status === MessageStatus.Delivered" :icon="checkmarkDoneCircle"></ion-icon>
      </p>
    </div>
  </ion-content>
  <ion-footer>
    <ion-input label-placement="floating" label="Message" v-model="app.chat.message" @keyup.enter="sendMessage()" ref="chatbox" :counter="true" :maxlength="120">
      <ion-button slot="end" @click="sendMessage()">
        <ion-icon slot="icon-only" :icon="send" aria-hidden="true"></ion-icon>
      </ion-button>
    </ion-input>
  </ion-footer>
</template>

<script setup lang="ts">
import { IonFooter, IonInput, IonButton, IonIcon, IonContent } from '@ionic/vue';
import { onMounted, ref } from 'vue';
import { send, checkmarkCircle, checkmarkDoneCircle, helpCircle } from 'ionicons/icons';
import { useAppStore, Chat } from '@/stores/app';
import { MessageStatus, Message } from '@/MeshCore/App';
import * as mcf from '@/MeshCore/Frame';

const app = useAppStore();
const chat = app.chat.selected as Chat | null;
const chatbox = ref();

function setChatBoxFocus() {
  chatbox.value.$el.setFocus();
}

onMounted(() => setChatBoxFocus());

function messageTime(msg: Message) {
  const messageDt = new Date(msg.timestamp * 1000);

  return `${messageDt.getHours()}:${messageDt.getMinutes().toString().padStart(2, '0')}`
}

function messageClass(msg: Message) {
  const mClass = { own: msg.own };
  mClass['status-' + msg.status] = true;
  return mClass;
}

async function sendMessage() {
  const message = app.chat.message;
  if(!chat) return;

  const contact = chat.contact;

  const msgObj: Message = {
    text: message,
    own: true,
    timestamp: app.getCurrentTimestamp(),
    status: MessageStatus.Pending,
    ackCode: '',
  };
  chat.messages.push(msgObj);

  const msgStatus = await app.client.sendTxtMsg({
    txtType: mcf.TxtType.plain,
    attempt: 1,
    senderTimestamp: app.getCurrentTimestamp(),
    pubKeyPrefix: contact.publicKey.substring(0, 12),
    text: message
  });

  app.chat.ackCodes[msgStatus.expectedAckCode] = msgObj;
  msgObj.status = MessageStatus.Sent;
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
  font-size: 1.1em;
  display: flex;
  align-items: end;
  gap: 5px;
  border-radius: 14px;
  padding: 6px 12px;
  align-self: flex-start;
  background-color: var(--ion-color-medium-shade);
  margin-block-end: 5px;
  margin-block-start: 5px;
}
.messages p.own {
  align-self: flex-end;
  background-color: var(--ion-color-tertiary-shade);
}
</style>