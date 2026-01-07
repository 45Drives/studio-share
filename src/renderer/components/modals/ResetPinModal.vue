<template>
    <div v-if="modelValue" class="fixed inset-0 z-[60] flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="close"></div>
  
      <div class="relative w-full max-w-md bg-accent rounded-lg shadow-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-semibold">Reset PIN</h3>
          <button class="btn btn-secondary" @click="close">Close</button>
        </div>
  
        <div class="space-y-3">
          <p class="text-sm">
            Enter a temporary PIN for
            <b>{{ user?.name || user?.username }}</b>. They’ll be required to change it on
            next login.
          </p>
  
          <!-- New PIN -->
          <div>
            <label class="text-xs opacity-80">Temporary PIN (4–8 digits)</label>
            <div class="relative">
              <input
                :type="showResetPin ? 'text' : 'password'"
                inputmode="numeric"
                pattern="\\d*"
                v-model.trim="resetPinInput"
                class="input-textlike border rounded px-3 py-2 w-full pr-16"
                placeholder="4–8 digits"
                autocomplete="off"
              />
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-xs border rounded px-2 py-1"
                @click="showResetPin = !showResetPin"
                :aria-pressed="showResetPin ? 'true' : 'false'"
              >
                <FontAwesomeIcon :icon="showResetPin ? faEyeSlash : faEye" />
              </button>
            </div>
            <p v-if="resetPinInvalid" class="text-xs text-red-500 mt-1">
              PIN must be 4–8 digits.
            </p>
          </div>
  
          <!-- Confirm PIN -->
          <div>
            <label class="text-xs opacity-80">Confirm PIN</label>
            <div class="relative">
              <input
                :type="showResetConfirm ? 'text' : 'password'"
                inputmode="numeric"
                pattern="\\d*"
                v-model.trim="resetPinConfirm"
                class="input-textlike border rounded px-3 py-2 w-full pr-16"
                placeholder="Re-enter PIN"
                autocomplete="off"
              />
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-xs border rounded px-2 py-1"
                @click="showResetConfirm = !showResetConfirm"
                :aria-pressed="showResetConfirm ? 'true' : 'false'"
              >
                <FontAwesomeIcon :icon="showResetConfirm ? faEyeSlash : faEye" />
              </button>
            </div>
            <p v-if="resetMismatch" class="text-xs text-red-500 mt-1">
              PINs do not match.
            </p>
          </div>
  
          <div class="text-sm text-red-500" v-if="error">{{ error }}</div>
        </div>
  
        <div class="flex justify-end gap-2 mt-4">
          <button class="btn btn-secondary" @click="close">Cancel</button>
          <button
            class="btn btn-primary"
            :disabled="resetPinInvalid || resetMismatch || !resetPinInput || !resetPinConfirm"
            @click="confirm"
          >
            Reset PIN
          </button>
        </div>
      </div>
    </div>
</template>
  
  <script setup lang="ts">
  import { ref, computed, watch,} from 'vue'
  import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
  import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
  
  type MinimalUser = { id?: number | string; username?: string; name?: string }
  
  const props = defineProps<{
    modelValue: boolean
    user: MinimalUser | null
  }>()
  
  const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void
    (e: 'confirm', payload: { userId?: number | string; newPin: string }): void
  }>()
  
  const resetPinInput = ref('')
  const resetPinConfirm = ref('')
  const showResetPin = ref(false)
  const showResetConfirm = ref(false)
  const error = ref<string | null>(null)
  
  const resetPinInvalid = computed(
    () => resetPinInput.value !== '' && !/^\d{4,8}$/.test(resetPinInput.value)
  )
  const resetMismatch = computed(
    () => resetPinInput.value !== '' && resetPinConfirm.value !== '' && resetPinInput.value !== resetPinConfirm.value
  )
  
  watch(
    () => props.modelValue,
    (open) => {
      if (open) {
        resetPinInput.value = ''
        resetPinConfirm.value = ''
        showResetPin.value = false
        showResetConfirm.value = false
        error.value = null
      }
    }
  )
  
  function close() {
    emit('update:modelValue', false)
  }
  
  function confirm() {
    if (!/^\d{4,8}$/.test(resetPinInput.value.trim())) {
      error.value = 'PIN must be 4–8 digits.'
      return
    }
    if (resetPinInput.value.trim() !== resetPinConfirm.value.trim()) {
      error.value = 'PINs do not match.'
      return
    }
    emit('confirm', { userId: props.user?.id, newPin: resetPinInput.value.trim() })
    close()
  }
  </script>
  