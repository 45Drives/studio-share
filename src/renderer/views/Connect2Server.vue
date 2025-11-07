<template>
    <form @submit.prevent="connectToServer" class="h-full flex items-start justify-center pt-16" :aria-busy="isBusy">
        <div class="grid grid-cols-2 gap-10 text-2xl w-9/12 mx-auto">
            <div class="col-span-2 mx-auto text-3xl">
                <span>Share files with your collaborators easily through secure links.<br /> Log into your server to
                    begin.</span>
                <br />
                <br />
                <span class="text-default italic text-base">
                    <b>Note:</b> The servers in the dropdown will only populate if the <b
                        class="text-primary">houston-broadcaster</b>
                    service is enabled (It should be by default).<br /> If it is not, manual connection is required.
                </span>
                <div class="flex flex-row w-full items-center text-center gap-2 mt-2">
                    <span class="text-danger text-base semibold">
                        <b>ALSO:</b> To allow sharing links outside your network, <b>port
                            443
                            (HTTPS)</b> <u>must</u> be open or forwarded from your router.

                    </span>
                    <button type="button" @click.prevent="togglePortFwdModal" class="btn btn-danger w-fit text-base">
                        Click here to find out how.
                    </button>
                </div>

            </div>

            <CardContainer class="col-span-1 bg-accent border-default rounded-md text-bold shadow-xl">
                <div class="flex flex-col text-left">
                    <span>Select a server to connect to:</span>
                    <select v-model="selectedServerIp" :disabled="isBusy || manualIp !== ''"
                        class="bg-default h-[3rem] text-default rounded-lg px-4 flex-1 border border-default w-full">
                        <option v-for="server in discoveryState.servers" :key="server.ip" :value="server.ip">
                            {{ server.name }} ({{ server.ip }})
                        </option>
                    </select>
                </div>
                <span class="text-center items-center justify-self-center"> -- OR -- </span>
                <div class="flex flex-col text-left">
                    <span>Connect to server manually via IP Address:</span>
                    <input v-model="manualIp" type="text" placeholder="192.168.1.123" :disabled="isBusy"
                        class="text-default input-textlike border px-4 py-1 rounded text-xl w-full" />
                </div>
            </CardContainer>

            <CardContainer class="col-span-1 bg-primary border-default rounded-md text-bold text-left shadow-xl">
                <div class="flex flex-col text-bold">
                    <span>Username:</span>
                    <input v-model="username" type="text" placeholder="root" :disabled="isBusy"
                        class="text-default input-textlike px-4 py-1 rounded text-xl w-full border" />
                    <span class="text-center items-center justify-self-center"><br /></span>
                    <span>Password:</span>
                    <div class="w-full relative">
                        <input v-model="password" v-enter-next :type="showPassword ? 'text' : 'password'" id="password"
                            :disabled="isBusy"
                            class="text-default input-textlike px-4 py-1 rounded text-xl w-full border"
                            placeholder="••••••••" />
                        <button type="button" @click="togglePassword" :disabled="isBusy"
                            class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted">
                            <EyeIcon v-if="!showPassword" class="w-5 h-5" />
                            <EyeSlashIcon v-else class="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </CardContainer>

            <div class="col-span-2 items-center flex flex-col">
                <button type="submit"
                    class="btn btn-secondary w-60 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    :disabled="isBusy">
                    <svg v-if="isBusy" class="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"
                            opacity=".25" />
                        <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" stroke-width="4" fill="none" />
                    </svg>
                    <span>{{ isBusy ? 'Connecting…' : 'Connect to Server' }}</span>
                </button>

                <div v-if="statusLine" class="mt-2 text-sm opacity-80 flex items-center gap-2">
                    <svg v-if="isBootstrapping" class="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"
                            opacity=".25" />
                        <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" stroke-width="4" fill="none" />
                    </svg>
                    <span>{{ statusLine }}</span>
                </div>
            </div>
        </div>
    </form>
    <PortForwardingModal v-if="showPortFwdModal" @close="togglePortFwdModal" />
</template>

<script setup lang="ts">
import { computed, inject, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { IPCRouter } from '@45drives/houston-common-lib';
import CardContainer from '../components/CardContainer.vue'
import { useHeader } from '../composables/useHeader'
import { currentServerInjectionKey, discoveryStateInjectionKey, connectionMetaInjectionKey } from '../keys/injection-keys'
import { EyeIcon, EyeSlashIcon } from "@heroicons/vue/20/solid";
import { DiscoveryState, Server } from '../types'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import PortForwardingModal from '../components/modals/PortForwardingModal.vue' 
useHeader('Welcome to 45Studio Collab!');

const router = useRouter();
const discoveryState = inject<DiscoveryState>(discoveryStateInjectionKey)!;
const manualIp = ref('');
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const togglePassword = () => { showPassword.value = !showPassword.value; };

const selectedServerIp = ref<string>('')
const providedCurrentServer = inject(currentServerInjectionKey)!;
const connectionMeta = inject(connectionMetaInjectionKey)!;

const selectedServer = computed<Server | undefined>(() =>
    discoveryState.servers.find(s => s.ip === selectedServerIp.value)
)

watch(() => discoveryState.servers.length, (len) => {
    if (len > 0 && !selectedServerIp.value && !manualIp.value) {
        selectedServerIp.value = discoveryState.servers[0].ip
    }
}, { immediate: true })

watch(manualIp, () => { if (manualIp.value !== '') selectedServerIp.value = '' })
watch(selectedServerIp, () => { if (selectedServerIp.value !== '') manualIp.value = '' })

const isDev = import.meta.env.DEV === true;
const DEFAULT_API_PORT = Number((import.meta as any).env?.VITE_API_PORT || 9095);

const statusLine = ref<string>('');  // one line only
const isBusy = ref(false);           // disables UI + button during whole flow
const isBootstrapping = ref(false);  // shows spinner while remote deps/bootstrap running
let unlistenProgress: (() => void) | null = null;

const showPortFwdModal = ref(false);
function togglePortFwdModal() {
    showPortFwdModal.value = !showPortFwdModal.value;
}

function listenBootstrap(id: string) {
    const handler = (_: any, msg: any) => {
        if (msg.id !== id) return;
        if (msg.label) statusLine.value = msg.label;
        // If your bootstrap progress emits phases, you can also refine:
        // isBootstrapping.value = !!(msg.phase || msg.label);
    };
    window.electron?.ipcRenderer.on('bootstrap-progress', handler);
    return () => window.electron?.ipcRenderer.removeListener('bootstrap-progress', handler);
}

async function connectToServer() {
    // quick validation (don’t enter busy state if we’re about to bail)
    if (!selectedServer.value && !manualIp.value) {
        pushNotification(new Notification('Error', `Please select or enter a server before connecting.`, 'error', 8000))
        return
    }
    if (!username.value.trim()) {
        pushNotification(new Notification('Error', `Please enter a username.`, 'error', 8000))
        return
    }
    if (!password.value.trim()) {
        pushNotification(new Notification('Error', `Please enter a password.`, 'error', 8000))
        return
    }

    isBusy.value = true; // disable UI until we’re done
    statusLine.value = '';
    try {
        const ip = (selectedServer.value?.ip || manualIp.value).trim();
        const port = DEFAULT_API_PORT;

        providedCurrentServer.value = selectedServer.value
            ? selectedServer.value
            : { ip, name: ip, lastSeen: Date.now(), status: 'unknown', manuallyAdded: true };

        let apiBase = '';
        if (isDev) {
            apiBase = `http://${ip}:${port}`;
            connectionMeta.value = { ...connectionMeta.value, port, apiBase, httpsHost: undefined };
        } else {
            if (ip === window.location.hostname || ip === '127.0.0.1' || ip === 'localhost') {
                apiBase = '';
                connectionMeta.value = { ...connectionMeta.value, port, apiBase, httpsHost: location.host };
            } else {
                const brokerSeg = `broker/${encodeURIComponent(`${ip}:${port}`)}`;
                apiBase = `/${brokerSeg}`;
                connectionMeta.value = { ...connectionMeta.value, port, apiBase, httpsHost: `${location.host}/${brokerSeg}` };
            }
        }

        window.appLog?.info('login.resolveApiBase', { isDev, ip, port, apiBase, href: location.href });
        window.appLog?.info('login.request', { url: `${apiBase}/api/login`, ip });

        const probe = async () => {
            try {
                const r = await fetch(`${apiBase}/healthz`, { signal: AbortSignal.timeout(3000) });
                return r.ok;
            } catch { return false; }
        };

        const usedManual = !selectedServer.value;
        let healthy = await probe();

        // If API isn’t healthy or user used manual IP, run remote bootstrap
        if (!healthy || usedManual) {
            const id = crypto.randomUUID();
            unlistenProgress?.();
            unlistenProgress = listenBootstrap(id);
            statusLine.value = 'Bootstrapping…';
            isBootstrapping.value = true;

            if (isBootstrapping.value) {
                setTimeout(() => {
                    // force-unstick after 60s
                    if (isBootstrapping.value) {
                        isBootstrapping.value = false
                        isBusy.value = false
                        statusLine.value = ''
                        unlistenProgress?.(); unlistenProgress = null
                        pushNotification(new Notification('Error', 'Bootstrap timed out', 'error', 8000))
                    }
                }, 60_000)
            }

            const result = await window.electron?.ipcRenderer.invoke(
                "run-remote-bootstrap",
                { id, host: ip, username: username.value, password: password.value }
            );

            if (!result?.success) {
                pushNotification(new Notification('Error', result?.error || 'Bootstrap failed', 'error', 12000));
                statusLine.value = '';
                isBootstrapping.value = false;
                unlistenProgress?.(); unlistenProgress = null;
                return;
            }

            // quick retry loop for health
            for (let i = 0; i < 10; i++) {
                await new Promise(r => setTimeout(r, 1000));
                if (await probe()) break;
            }
            statusLine.value = '';
            isBootstrapping.value = false;
            unlistenProgress?.(); unlistenProgress = null;
        }

        const res = await fetch(`${apiBase}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.value, password: password.value }),
        });
        if (!res.ok) throw new Error(await res.text());
        const { token } = await res.json();

        connectionMeta.value = { ...connectionMeta.value, token, ssh: { server: ip, username: username.value } };
        try { sessionStorage.setItem('hb_token', token) } catch { }
        window.appLog?.info('login.success', { ip });
        router.push({ name: 'dashboard' });

    } catch (e: any) {
        window.appLog?.error('login.error', { error: e?.message });
        pushNotification(new Notification('Error', e?.message || 'Login failed', 'error', 8000));
    } finally {
        isBootstrapping.value = false
        isBusy.value = false
    }
}

onUnmounted(() => {
    unlistenProgress?.()
    unlistenProgress = null
})
</script>