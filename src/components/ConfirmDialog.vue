<script setup lang="ts">
import { onMounted, ref } from 'vue'
defineProps<{ title: string; confirm: string; disabled?: boolean }>()
const emit = defineEmits<{ cancel: []; confirm: [] }>()
const dialog = ref<HTMLDialogElement>()
onMounted(() => dialog.value?.showModal())
</script>
<template>
  <dialog ref="dialog" aria-labelledby="confirmation-title" @cancel.prevent="emit('cancel')">
    <h2 id="confirmation-title">{{ title }}</h2><div class="dialog-text"><slot /></div>
    <div class="dialog-actions"><button class="button secondary" autofocus :disabled="disabled" @click="emit('cancel')">إلغاء</button><button class="button danger" :disabled="disabled" @click="emit('confirm')">{{ confirm }}</button></div>
  </dialog>
</template>
