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
import { computed, inject, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import CardContainer from '../components/CardContainer.vue'
import { useHeader } from '../composables/useHeader'
import { currentServerInjectionKey, discoveryStateInjectionKey, connectionMetaInjectionKey } from '../keys/injection-keys'
import { EyeIcon, EyeSlashIcon } from "@heroicons/vue/20/solid";
import { DiscoveryState, Server } from '../types'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
useHeader('Welcome to 45Studio Collab!');

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
const providedCurrentServer = inject(currentServerInjectionKey)!;
const connectionMeta = inject(connectionMetaInjectionKey)!;
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

const isDev = import.meta.env.DEV === true;
const DEFAULT_API_PORT = Number((import.meta as any).env?.VITE_API_PORT || 9095);

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
    const port = DEFAULT_API_PORT;

    providedCurrentServer.value = selectedServer.value
        ? selectedServer.value
        : { ip, name: ip, lastSeen: Date.now(), status: 'unknown', manuallyAdded: true };
    // const isElectron = !!(window as any).process?.versions?.electron;
    // const servedOverHttp = /^https?:/.test(window.location.protocol);
    // -------- Decide apiBase --------
    let apiBase = '';
    if (isDev) {
        // Dev: frontend runs on http://localhost:8081, so call the target box directly
        apiBase = `http://${ip}:${port}`;
        connectionMeta.value = { ...connectionMeta.value, port, apiBase, httpsHost: undefined };
    } else {
        // Prod: SPA is served by nginx on a box
            if (ip === window.location.hostname || ip === '127.0.0.1' || ip === 'localhost') {
                    // Same box → same-origin through nginx
                    apiBase = '';
                    connectionMeta.value = { ...connectionMeta.value, port, apiBase, httpsHost: location.host };
                } else {
                // Different box → go through this box’s broker
                const brokerSeg = `broker/${encodeURIComponent(`${ip}:${port}`)}`;
                apiBase = `/${brokerSeg}`;
                connectionMeta.value = { ...connectionMeta.value, port, apiBase, httpsHost: `${location.host}/${brokerSeg}` };
            }
    }
    
    // let apiBase = '';

    // if (isDev) {
    //     // Dev: call target directly
    //     apiBase = `http://${ip}:${port}`;
    // } else if (isElectron && !servedOverHttp) {
    //     // Packaged desktop app (file://) → call target directly
    //     apiBase = `http://${ip}:${port}`;
    // } else {
    //     // Web build (served by nginx)
    //     if (ip === window.location.hostname || ['127.0.0.1', 'localhost'].includes(ip)) {
    //         apiBase = '';  // same-origin reverse proxy
    //     } else {
    //         apiBase = `/broker/${encodeURIComponent(`${ip}:${port}`)}`; // nginx route only
    //     }
    // }

    // connectionMeta.value = { ...connectionMeta.value, port, apiBase };
    // window.appLog?.info('login.apiBase.decided', { apiBase, context: servedOverHttp ? 'web' : 'electron' });

    window.appLog?.info('login.resolveApiBase', { isDev, ip, port, apiBase, href: location.href });
    window.appLog?.info('login.request', { url: `${apiBase}/api/login`, ip });
    try {


        const probe = async () => {
            try {
                const r = await fetch(`${apiBase}/api/health`, { signal: AbortSignal.timeout(3000) });
                return r.ok;
            } catch { return false; }
        };

        const usedManual = !selectedServer.value;
        let healthy = await probe();

        // If API isn’t healthy or user used manual IP, run remote bootstrap
        if (!healthy || usedManual) {
            try {
                window.appLog?.info('bootstrap.start', { ip });
                const result = await window.electron?.ipcRenderer.invoke(
                    "run-remote-bootstrap",
                    { host: ip, username: username.value, password: password.value }
                );
                if (!result?.success) {
                    pushNotification(new Notification('Error', result?.error || 'Bootstrap failed', 'error', 12000));
                    return;
                }
                pushNotification(new Notification('Success', 'Server bootstrapped.', 'success', 6000));
            } catch (e: any) {
                pushNotification(new Notification('Error', e?.message || 'Bootstrap failed', 'error', 12000));
                return;
            }
            // Try the probe again
            healthy = await probe();
            if (!healthy) {
                pushNotification(new Notification('Error', 'Server not reachable after bootstrap', 'error', 10000));
                return;
            }
        }

        // Use the apiBase we just decided on
        const res = await fetch(`${apiBase}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.value, password: password.value }),
        });
        if (!res.ok) throw new Error(await res.text());
        const { token } = await res.json();

        connectionMeta.value = { ...connectionMeta.value, token,ssh:{server:ip,username:username.value} };
        try { sessionStorage.setItem('hb_token', token) } catch { }
        window.appLog?.info('login.success', { ip });
        router.push({ name: 'dashboard' });

    } catch (e: any) {
        window.appLog?.error('login.error', { ip, error: e?.message });
        pushNotification(new Notification('Error', e.message || 'Login failed', 'error', 8000));
    }

}
</script>
