<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button></ion-back-button>
        </ion-buttons>
        <ion-title>Chat with {{ app.chat.selected.contact?.advName }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <Chat />
  </ion-page>
</template>

<script lang="ts">
import { useAppStore } from '@/stores/app';
import { useRouter } from 'vue-router';

const app = useAppStore();

export default {
  beforeRouteEnter: function (to) {
    const activeChat = app.chat.list.find(ch => ch.contact.publicKey.startsWith(to.params.publicKey));
    app.chat.selected = activeChat;
    if(!activeChat) { useRouter().back() }
    console.log(activeChat);
  }
}
</script>

<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons } from '@ionic/vue';
import Chat from '@/components/Chat.vue';
import { onBeforeMount, onMounted } from 'vue';

onBeforeMount(() => app.device.connected ? null : location.href = '/');

onMounted(() => {
  setTimeout(() => {
    for(const message of app.chat.selected.messages) {
      if(message.status < 0) message.status = 0;
    }
  })
});
</script>
