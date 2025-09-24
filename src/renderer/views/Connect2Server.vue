<template>
    <div class="h-full flex items-center justify-center">
        <div class="grid grid-cols-2 gap-10 text-2xl w-9/12 mx-auto">
            <CardContainer class="col-span-1 bg-accent border-default rounded-md text-bold">
                <div class="flex flex-col text-left">
                    <span>
                        Select a server to connect to:
                    </span>
                    <select v-model="selectedServerIp" :disabled="manualIp !== ''"
                        class="bg-default h-[3rem] text-default rounded-lg px-4 flex-1 border border-default">
                        <option v-for="server in discoveryState.servers" :key="server.ip" :value="server.ip">
                            {{ server.name }} ({{ server.ip }})
                        </option>
                    </select>

                </div>
                <span class="text-center items-center justify-self-center">
                    -- OR --
                </span>
                <div class="flex flex-col text-left">
                    <span>
                        Connect to server manually via IP Address:
                    </span>
                    <input v-model="manualIp" type="text" placeholder="192.168.1.123"
                        
                        class="input-textlike border px-4 py-1 rounded text-xl w-full" />
                </div>
            </CardContainer>

            <CardContainer class="col-span-1 bg-primary border-default rounded-md text-bold text-left">

                <div class="flex flex-col text-bold">
                    <span>
                        Username:
                    </span>
                    <input v-model="username" type="text" placeholder="root"
                        class="input-textlike px-4 py-1 rounded text-xl w-full border" />
                    <span class="text-center items-center justify-self-center">
                        <br />
                    </span>
                    <span>
                        Password:
                    </span>
                    <div class="w-64 relative">
                        <input v-model="password" v-enter-next :type="showPassword ? 'text' : 'password'" id="password"
                            class="input-textlike px-4 py-1 rounded text-xl w-full border" placeholder="••••••••" />
                        <button type="button" @click="togglePassword"
                            class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted">
                            <EyeIcon v-if="!showPassword" class="w-5 h-5" />
                            <EyeSlashIcon v-if="showPassword" class="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </CardContainer>
            <div class="col-span-2 items-center">
                <button class="btn btn-secondary w-60" @click="goToDashboard">Connect to Server</button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import CardContainer from '../components/CardContainer.vue'
import { useHeader } from '../composables/useHeader'
import { discoveryStateInjectionKey } from '../keys/injection-keys'
import { EyeIcon, EyeSlashIcon } from "@heroicons/vue/20/solid";
import { DiscoveryState, Server } from '../types'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
useHeader('CollaboConnect');

const router = useRouter();
const discoveryState = inject<DiscoveryState>(discoveryStateInjectionKey)!;

const manualIp = ref('');
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const togglePassword = () => {
    showPassword.value = !showPassword.value;
};
const selectedServerIp = ref<string>('')

// computed to always get the full object if needed
const selectedServer = computed<Server | undefined>(() =>
    discoveryState.servers.find(s => s.ip === selectedServerIp.value)
)

watch(
    () => discoveryState.servers.length,
    (len) => {
        if (len > 0 && !selectedServerIp.value && !manualIp.value) {
            selectedServerIp.value = discoveryState.servers[0].ip
        }
    },
    { immediate: true }
)

// clear select if manualIp typed
watch(manualIp, () => {
    if (manualIp.value !== '') {
        selectedServerIp.value = ''
    }
})

// clear manualIp if a server is picked
watch(selectedServerIp, () => {
    if (selectedServerIp.value !== '') {
        manualIp.value = ''
    }
})

function goToDashboard() {
    if (!selectedServer.value && !manualIp.value) {
        pushNotification(
            new Notification('Error', `Please select or enter a server before connecting.`, 'error', 8000)
        )
        return
    }

    if (!username.value.trim()) {
        pushNotification(
            new Notification('Error', `Please enter a username.`, 'error', 8000)
        )
        return
    }

    if (!password.value.trim()) {
        pushNotification(
            new Notification('Error', `Please enter a password.`, 'error', 8000)
        )
        return
    }

    router.push({ name: 'dashboard' })
}

</script>
