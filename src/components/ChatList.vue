<template>
  <ion-list></ion-list>
</template>

<script setup lang="ts">
import { useAppStore } from '@/stores/app';
import { IonList } from '@ionic/vue';

const app = useAppStore();
</script>
