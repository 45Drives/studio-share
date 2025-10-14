<template>
    <form @submit.prevent="connectToServer" class="h-full flex items-start justify-center pt-16">
        <div class="grid grid-cols-2 gap-10 text-2xl w-9/12 mx-auto">
            <div class="col-span-2 mx-auto text-3xl">
                <span>Share files with your collaborators easily through secure links.<br /> Log into your server to
                    begin.</span>
                <br />
                <br />
                <span class="text-default italic text-base">
                    <b>Note:</b> The servers in the dropdown will only populate if the <b
                        class="text-primary">houston-broadcaster</b>
                    service is
                    enabled (It should be by default).<br /> If it is
                    not, manual connection is required.
                </span>
            </div>
            <CardContainer class="col-span-1 bg-accent border-default rounded-md text-bold shadow-xl">
                <div class="flex flex-col text-left">
                    <span>
                        Select a server to connect to:
                    </span>
                    <select v-model="selectedServerIp" :disabled="manualIp !== ''"
                        class="bg-default h-[3rem] text-default rounded-lg px-4 flex-1 border border-default w-full">
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
                        class="text-default input-textlike border px-4 py-1 rounded text-xl w-full" />
                </div>
            </CardContainer>

            <CardContainer class="col-span-1 bg-primary border-default rounded-md text-bold text-left shadow-xl">

                <div class="flex flex-col text-bold">
                    <span>
                        Username:
                    </span>
                    <input v-model="username" type="text" placeholder="root"
                        class="text-default input-textlike px-4 py-1 rounded text-xl w-full border" />
                    <span class="text-center items-center justify-self-center">
                        <br />
                    </span>
                    <span>
                        Password:
                    </span>
                    <div class="w-full relative">
                        <input v-model="password" v-enter-next :type="showPassword ? 'text' : 'password'" id="password"
                            class="text-default input-textlike px-4 py-1 rounded text-xl w-full border"
                            placeholder="••••••••" />
                        <button type="button" @click="togglePassword"
                            class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted">
                            <EyeIcon v-if="!showPassword" class="w-5 h-5" />
                            <EyeSlashIcon v-if="showPassword" class="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </CardContainer>
            <div class="col-span-2 items-center">
                <button type="submit" class="btn btn-secondary w-60">Connect to Server</button>
            </div>
        </div>
    </form>
</template>

<script setup lang="ts">
import { computed, inject, provide, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import CardContainer from '../components/CardContainer.vue'
import { useHeader } from '../composables/useHeader'
import { currentServerInjectionKey, discoveryStateInjectionKey, connectionMetaInjectionKey } from '../keys/injection-keys'
import { EyeIcon, EyeSlashIcon } from "@heroicons/vue/20/solid";
import { DiscoveryState, Server, ConnectionMeta } from '../types'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
useHeader('Houston Collabos');

const router = useRouter();
const discoveryState = inject<DiscoveryState>(discoveryStateInjectionKey)!;
// console.log('discovered:', discoveryState.servers);
const manualIp = ref('');
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const togglePassword = () => {
    showPassword.value = !showPassword.value;
};
const selectedServerIp = ref<string>('')
const providedCurrentServer = inject(currentServerInjectionKey)!;
const connectionMeta = inject(connectionMetaInjectionKey)!;
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

const isHttps = window.location.protocol === 'https:';
const isLocalDev = !isHttps && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

// True if the selected server is the same machine that serves the SPA
function isSameBox(host: string) {
    const h = window.location.hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === h;
}

async function connectToServer() {
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

    const ip = (selectedServer.value?.ip || manualIp.value).trim();
    const port = 9095;

    providedCurrentServer.value = selectedServer.value
        ? selectedServer.value
        : { ip, name: ip, lastSeen: Date.now(), status: 'unknown', manuallyAdded: true };

    // -------- Choose apiBase + tell useApi how to build future URLs --------
    let apiBase: string;

    if (isLocalDev) {
        // DEV (HTTP): talk directly to the remote broadcaster
        apiBase = `http://${ip}:${port}`;
        // Clear httpsHost so useApi picks http://<ip>:<port> later
        connectionMeta.value = { ...connectionMeta.value, port, apiBase, httpsHost: undefined };
    } else {
        // PROD (HTTPS)
        if (isSameBox(ip)) {
            // Same box: same-origin
            apiBase = '';
            connectionMeta.value = { ...connectionMeta.value, port, apiBase, httpsHost: location.host };
        } else {
            // Remote box: always go via broker; encode ip:port for safety
            const brokerSeg = `broker/${encodeURIComponent(`${ip}:${port}`)}`;
            apiBase = `/${brokerSeg}`;
            // Trick: set httpsHost to include the broker segment so useApi builds:
            //   https://<host>/broker/<ip:port>
            connectionMeta.value = {
                ...connectionMeta.value,
                port,
                apiBase,
                httpsHost: `${location.host}/${brokerSeg}`,
            };
        }
    }

    try {
        // Use the apiBase we just decided on
        const res = await fetch(`${apiBase}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.value, password: password.value }),
        });
        if (!res.ok) throw new Error(await res.text());
        const { token } = await res.json();

        const settings = await fetch(`${apiBase}/api/settings`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.ok ? r.json() : {});

        const needsBootstrap = !settings?.externalBase || !settings?.subdomain;

        // Option A: skip silently and let user do it from a Settings screen
        // Option B (non-blocking): fire-and-forget, but don't fail login/UI flow if it errors
        if (needsBootstrap) {
            fetch(`${apiBase}/api/setup/bootstrap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ /* wantSubdomain?: 'optional' */ })
            }).catch(() => {/* ignore; user can retry from Settings */ });
        }

        connectionMeta.value = { ...connectionMeta.value, token };
        router.push({ name: 'select-file' });
    } catch (e: any) {
        pushNotification(new Notification('Error', e.message || 'Login failed', 'error', 8000));
    }

}
</script>
