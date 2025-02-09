import { reactive, ComputedRef } from 'vue';
import { defineStore } from 'pinia';
import { Chat, AckCodeMap } from '@/MeshCore/App';
import { SerialComm, BluetoothComm } from '@/MeshCore/Comm';
import { Client, Contact } from '@/MeshCore/Client';
import { Capacitor } from '@capacitor/core';

type PlatformType  = 'android' | 'ios' | 'web';

type Platform = Record<PlatformType, boolean>;

const app = reactive({
  platform: {} as Platform,
  client: {} as Client,
  device: {
    settings: {},
    connected: false
  },
  serial: {
    comm: new SerialComm(),
    selected: null,
  },
  bluetooth: {
    comm: new BluetoothComm(),
    selected: null,
    devices: [],
    service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    charRx: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    charTx: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    scanning: false,
  },
  contact: {
    lastSync: 0,
    list: [] as Contact[]
  },
  chat: {
    message: '',
    selected: null as Chat | null,
    list: [] as Chat[],
    unreadCount: {} as ComputedRef,
    ackCodes: {} as AckCodeMap,
    notifAudio: new Audio('/alert.mp3'),
  },
  getCurrentTimestamp: () => Date.now() / 1000 | 0,
});

// @ts-expect-error: ts being ts
app.platform[Capacitor.getPlatform()] = true;

export const useAppStore = defineStore('app', () => app)
