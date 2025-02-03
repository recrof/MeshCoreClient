<script setup lang="ts">
import { BleDevice } from '@mnlphlp/plugin-blec'

defineProps<{
    device: BleDevice
    showServices: boolean
}>()
</script>

<template>
    <article class="border medium no-padding center-align middle-align">
        <h4>{{ device.name }}</h4>
        <p>{{ device.address }}</p>
        <div>
            Manufacturer data:
            <p v-for="[key, value] in Object.entries(device.manufacturerData)">{{ key }}: {{ value }}</p>
        </div>
        <div v-if="showServices">
            Services:
            <p v-for="service in device.services">{{ service }}</p>
        </div>
        <p>{{ device.isConnected ? "Connected" : "Not Connected" }}</p>
    </article>
</template>