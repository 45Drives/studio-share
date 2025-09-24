<template>
    <div class="h-full flex items-center justify-center">
        <div class="grid grid-cols-2 gap-10 text-2xl w-9/12 mx-auto">
            <CardContainer class="col-span-1 bg-accent border-default rounded-md text-bold">
                <div class="flex flex-col text-left">
                    <span>
                        Select a server to connect to:
                    </span>
                    <select v-model="selectedServer"
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
                    <input v-model="manualIp" type="text" placeholder="192.168.1.123" tabindex="1"
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
import { computed, inject, ref } from 'vue'
import { useRouter } from 'vue-router'
import CardContainer from '../components/CardContainer.vue'
import { useHeader } from '../composables/useHeader'
import { discoveryStateInjectionKey } from '../keys/injection-keys'
import { EyeIcon, EyeSlashIcon } from "@heroicons/vue/20/solid";
import { DiscoveryState, Server } from '../types'
useHeader('CollaboConnect');

const router = useRouter();
const discoveryState = inject<DiscoveryState>(discoveryStateInjectionKey)!;
const selectedServer = ref<Server>();
const manualIp = ref('');
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const togglePassword = () => {
    showPassword.value = !showPassword.value;
};


function goToDashboard() {
    router.push({name: 'dashboard'});
}
</script>