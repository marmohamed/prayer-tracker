<script setup lang="ts">
import { number, validCount, type Prayer } from '../model'
import AppIcon from './AppIcon.vue'
defineProps<{ prayer: Prayer; name: string; hint?: string; count: number; editable?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ delta: [prayer: Prayer, value: number]; set: [prayer: Prayer, value: number]; invalid: [] }>()
function edit(event: Event, prayer: Prayer, previous: number) {
  const input = event.target as HTMLInputElement
  const value = input.value.trim() === '' ? NaN : Number(input.value)
  if (validCount(value)) emit('set', prayer, value)
  else { input.value = String(previous); emit('invalid') }
}
</script>
<template>
  <div class="prayer-row">
    <span class="prayer-symbol"><AppIcon :name="prayer === 'isha' || prayer === 'maghrib' ? 'moon' : 'sun'" /></span>
    <div class="prayer-name"><span>{{ name }}</span><small v-if="hint">{{ hint }}</small></div>
    <div class="stepper">
      <button class="step plus" :disabled="disabled" :aria-label="`زيادة ${name}`" @click="emit('delta', prayer, 1)">+</button>
      <input v-if="editable" :value="count" type="number" inputmode="numeric" min="0" step="1" :disabled="disabled" :aria-label="`عدد صلوات ${name}`" @change="edit($event, prayer, count)" />
      <output v-else :aria-label="`عدد صلوات ${name}`">{{ number(count) }}</output>
      <button class="step minus" :disabled="disabled || count === 0" :aria-label="`إنقاص ${name}`" @click="emit('delta', prayer, -1)">−</button>
    </div>
  </div>
</template>
