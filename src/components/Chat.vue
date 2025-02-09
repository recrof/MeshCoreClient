<template>
  <ion-content class="flex">
    <div class="messages">
      <p v-for="msg in app.chat.selected.messages.toReversed()" :class="messageClass(msg)" @click="showRoundTrip(msg.roundTrip)">
        <span>{{ msg.text }}</span>
        <small>{{ messageTime(msg) }}</small>
        <ion-icon size="small" v-if="msg.status === MessageStatus.Pending" :icon="hourglass" title="Message is sending"></ion-icon>
        <ion-icon size="small" v-else-if="msg.status === MessageStatus.Sent" :icon="checkmark" title="Message sent"></ion-icon>
        <ion-icon size="small" v-else-if="msg.status === MessageStatus.Delivered" :icon="checkmarkDone" title="Message delivered"></ion-icon>
        <ion-icon size="small" v-else-if="msg.status === MessageStatus.Failed" :icon="alertCircle" title="Message failed. Too many resends"></ion-icon>
        <template v-if="msg.retries">
          <ion-icon size="small" :icon="refresh" :title="'This message was retried '+ msg.retries + ' times'"></ion-icon><small>x{{ msg.retries }}</small>
        </template>
      </p>
    </div>
  </ion-content>
  <ion-footer class="padding-side border-top">
    <form name="msgform" action="javascript:void(0)" @submit="sendMessage()" autocomplete="off">
      <ion-textarea placeholder="Message" aria-label="Message" v-model="editMessage" ref="messageBox" :counter="true" :maxlength="120" :autofocus="true" :autocomplete="false" @keyup.enter.prevent="sendMessage()" rows="1" :auto-grow="true">
        <ion-button slot="end" type="submit" size="small">
          <ion-icon slot="icon-only" :icon="send" aria-hidden="true"></ion-icon>
        </ion-button>
      </ion-textarea>
    </form>
  </ion-footer>
</template>

<script setup lang="ts">
import { toastController, IonFooter, IonTextarea, IonButton, IonIcon, IonContent } from '@ionic/vue';
import { onMounted, ref, reactive } from 'vue';
import { send, checkmark, checkmarkDone, hourglass, refresh, alertCircle } from 'ionicons/icons';
import { useAppStore, Chat } from '@/stores/app';
import { MessageStatus, Message } from '@/MeshCore/App';
import * as mcf from '@/MeshCore/Frame';
import { nextTick } from 'vue';

const app = useAppStore();
const chat = app.chat.selected as Chat | null;
const messageBox = ref();
let editMessage = ref('');

onMounted(() => setTimeout(() => messageBox.value.$el.setFocus(), 0));

function messageTime(msg: Message) {
  const messageDt = new Date(msg.timestamp * 1000);

  return `${messageDt.getHours()}:${messageDt.getMinutes().toString().padStart(2, '0')}`
}

function messageClass(msg: Message) {
  const mClass = {} as any;
  mClass['own'] = msg.own;
  mClass['status-' + msg.status] = true;

  return mClass;
}

async function transmitMessage(publicKey: string, messageText: string, attempt) {
  return await app.client.sendTxtMsg({
    txtType: mcf.TxtType.plain,
    attempt: attempt,
    senderTimestamp: app.getCurrentTimestamp(),
    pubKeyPrefix: publicKey.substring(0, 12),
    text: messageText
  });
}

async function sendMessage() {
  if(!chat) return;
  const messageText = editMessage.value;
  const contact = chat.contact;
  const message = reactive({
    text: messageText,
    own: true,
    timestamp: app.getCurrentTimestamp(),
    status: MessageStatus.Pending,
    ackCode: '',
    retries: 0
  });

  chat.messages.push(message);

  editMessage.value = '';

  const msgStatus = await transmitMessage(contact.publicKey, messageText, message.retries);
  app.chat.ackCodes[msgStatus.expectedAckCode] = message;

  message.status = MessageStatus.Sent;

  let idTimeout = 0 as any;
  const suggestedTimeout = msgStatus.suggestedTimeout + 1000;

  const messageTimeoutFn = async () => {
    if(message.status == MessageStatus.Sent) {
      if(message.retries++ >= 3) {
        message.status = MessageStatus.Failed;
        clearTimeout(idTimeout);
        return;
      }
      idTimeout = setTimeout(messageTimeoutFn, suggestedTimeout);
      console.log('trying to resend message:', message);
      const msgStatus = await transmitMessage(contact.publicKey, messageText, message.retries);
      app.chat.ackCodes[msgStatus.expectedAckCode] = message;
    }
  }

  idTimeout = setTimeout(messageTimeoutFn, suggestedTimeout);
}

async function showRoundTrip(roundTrip: number | unknown) {
  if(!roundTrip) return;

  const toast = await toastController.create({
    message: `Roundtrip: ${roundTrip}ms`,
    duration: 1500,
    position: 'top',
  });

  await toast.present();
}

</script>

<style>
ion-content.flex {
  display: flex;
}
.margin-side {
  padding: 0 5px;
}
.border-top {
  border-top: 1px solid #333;
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
  color: #fff;
  background-color: var(--ion-color-medium-shade);
  margin-block-end: 5px;
  margin-block-start: 5px;
}
.messages p.own {
  align-self: flex-end;
  background-color: var(--ion-color-tertiary-shade);
}
.messages p.status-4 span {
  text-decoration: line-through;
}
.messages p.status-4 {
  background-color: var(--ion-color-danger-shade);
  color: #ddd;
}
.messages p ion-icon {
  min-width: 16px;
}

form ion-textarea {
  min-height: 32px !important;
}

form ion-textarea .sc-ion-textarea-md {
  --padding-top: 8px;
}
form ion-textarea textarea {
  margin-top: 8px !important;
}
form ion-button {
  min-height: 32px !important;
}
</style>