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
                <div class="flex flex-col w-full items-center text-center gap-2 mt-2">
                    <span class="text-danger text-base semibold">
                        <b>ALSO:</b> To allow sharing links outside your network, <b>port
                            443
                            (HTTPS)</b> <u>must</u> be open or forwarded from your router.
                    </span>
                    <div class="button-group-row">
                        <button type="button" @click.prevent="togglePortFwdModal"
                            class="btn btn-primary w-fit text-base">
                            Click here to find out how.
                        </button>
                        <button type="button" @click.prevent="tryAutomaticPortMapping" :title="`Uses UPNP (Universal Plug N' Play) to automatically open necessary ports on router (not all routers support this).`"
                            class="btn btn-danger w-fit text-base">
                            Port Forward with UPNP<br/>**EXPERIMENTAL - USE AT OWN RISK**
                        </button>
                    </div>

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
);

const findServerByIp = (ip: string) =>
    discoveryState.servers.find(s => s.ip === ip.trim());

watch(() => discoveryState.servers.length, (len) => {
    if (len > 0 && !selectedServerIp.value && !manualIp.value) {
        selectedServerIp.value = discoveryState.servers[0].ip
    }
}, { immediate: true })

watch(manualIp, (val) => {
    const ip = val.trim();
    const hit = ip ? findServerByIp(ip) : undefined;
    if (hit) {
        // If the user typed an IP we already discovered, switch to that entry.
        selectedServerIp.value = hit.ip;
        manualIp.value = '';
    } else if (val !== '') {
        // Ensure dropdown is disabled while user truly enters a different IP.
        selectedServerIp.value = '';
    }
});

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


const tryingUpnp = ref(false);

async function tryAutomaticPortMapping() {
    // Must be called after you’ve resolved apiBase + token (your connect flow already does this).
    const token = connectionMeta.value?.token;
    const apiBase = connectionMeta.value?.apiBase || '';
    if (!token) {
        pushNotification(new Notification('Error', 'Please log in first.', 'error', 7000));
        return;
    }

    tryingUpnp.value = true;
    statusLine.value = 'Attempting UPnP/NAT-PMP mapping (experimental)…';
    try {
        const r = await fetch(`${apiBase}/api/portmap`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            // You can flip also80 to true if you want the script to attempt port 80 too.
            body: JSON.stringify({ also80: false })
        });
        const data = await r.json();
        if (data.ok) {
            const det = data.details;
            const via = det?.tool ? ` via ${det.tool}` : '';
            pushNotification(new Notification('Success', `Port 443 mapped${via}.`, 'success', 8000));
        } else {
            const reason = data?.details?.reason || data?.error || 'Unknown reason';
            pushNotification(new Notification('Notice', `Couldn’t create port mapping (${reason}).`, 'warning', 10000));
        }
        if (import.meta.env.DEV && data?.raw?.stdout) {
            console.debug('[portmap] stdout:', data.raw.stdout);
            console.debug('[portmap] stderr:', data.raw.stderr);
        }
    } catch (err: any) {
        pushNotification(new Notification('Error', err?.message || 'UPnP/NAT-PMP request failed', 'error', 10000));
    } finally {
        statusLine.value = '';
        tryingUpnp.value = false;
    }
}

function listenBootstrap(id: string) {
    const handler = (_: any, msg: any) => {
        if (msg.id !== id) return;
        if (msg.label) statusLine.value = msg.label;
    };
    window.electron?.ipcRenderer.on('bootstrap-progress', handler);
    return () => window.electron?.ipcRenderer.removeListener('bootstrap-progress', handler);
}

async function connectToServer() {
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

    isBusy.value = true;
    statusLine.value = '';

    try {
        const rawIp = (selectedServer.value?.ip || manualIp.value).trim();

        // If the manual IP is already discovered, prefer that discovered record.
        const discovered = findServerByIp(rawIp);
        const effectiveServer = discovered ?? selectedServer.value;
        const ip = effectiveServer?.ip || rawIp;

        const port = DEFAULT_API_PORT;
        const apiBase = `http://${ip}:${port}`;

        // Set current server (avoid creating a "manual" entry if we already discovered it)
        providedCurrentServer.value = effectiveServer ?? {
            ip, name: ip, lastSeen: Date.now(), status: 'unknown', manuallyAdded: true
        };

        connectionMeta.value = { ...connectionMeta.value, port, apiBase, httpsHost: undefined };

        window.appLog?.info('login.resolveApiBase', { isDev, ip, port, apiBase, href: location.href });
        window.appLog?.info('login.request', { url: `${apiBase}/api/login`, ip });

        const probe = async () => {
            const r = await window.electron?.ipcRenderer.invoke('probe-health', { ip, port: DEFAULT_API_PORT });
            return !!r?.ok;
        };

        // Be patient briefly to avoid transient false negatives
        let healthy = await probe();
        if (!healthy) {
            for (let i = 0; i < 2 && !healthy; i++) {
                await new Promise(r => setTimeout(r, 750));
                healthy = await probe();
            }
        }

        /**
         * If this IP came from discovery, check whether the modern "houston-broadcaster"
         * package is installed (vs. just the legacy service). If not installed → force bootstrap.
         */
        let mustBootstrap = false;
        if (effectiveServer) {
            try {
                const preflight = await window.electron?.ipcRenderer.invoke(
                    'remote-check-broadcaster',
                    { host: ip, username: username.value, password: password.value }
                );
                // If package not installed (likely legacy present), we must bootstrap.
                if (preflight && preflight.hasPackage === false) {
                    mustBootstrap = true;
                    window.appLog?.info('preflight', { ip, reason: 'no-package-installed', preflight });
                } else {
                    window.appLog?.info('preflight', { ip, reason: 'package-present', preflight });
                }
            } catch (err: any) {
                // If SSH preflight fails, fall back to the old rule (health decides).
                window.appLog?.warn('preflight.error', { ip, error: err?.message });
            }
        }

        // Decide whether to bootstrap:
        // - If preflight forced it (legacy/no pkg) → bootstrap
        // - Else only bootstrap when API isn’t healthy
        if (mustBootstrap || !healthy) {
            const id = crypto.randomUUID();
            unlistenProgress?.();
            unlistenProgress = listenBootstrap(id);
            statusLine.value = 'Bootstrapping…';
            isBootstrapping.value = true;

            setTimeout(() => {
                if (isBootstrapping.value) {
                    isBootstrapping.value = false;
                    isBusy.value = false;
                    statusLine.value = '';
                    unlistenProgress?.(); unlistenProgress = null;
                    pushNotification(new Notification('Error', 'Bootstrap timed out', 'error', 8000));
                }
            }, 60_000);

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

            // Post-bootstrap: give health a moment
            for (let i = 0; i < 10; i++) {
                await new Promise(r => setTimeout(r, 1000));
                if (await probe()) break;
            }
            statusLine.value = '';
            isBootstrapping.value = false;
            unlistenProgress?.(); unlistenProgress = null;
        }

        // Healthy now — proceed to login
        const res = await fetch(`${apiBase}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.value, password: password.value }),
        });
        if (!res.ok) throw new Error(await res.text());
        const { token } = await res.json();

        connectionMeta.value = { ...connectionMeta.value, token, ssh: { server: ip, username: username.value } };
        try { sessionStorage.setItem('hb_token', token); } catch { /* ignore */ }
        window.appLog?.info('login.success', { ip });
        router.push({ name: 'dashboard' });
    } catch (e: any) {
        window.appLog?.error('login.error', { error: e?.message });
        pushNotification(new Notification('Error', e?.message || 'Login failed', 'error', 8000));
    } finally {
        isBootstrapping.value = false;
        isBusy.value = false;
    }
}

onUnmounted(() => {
    unlistenProgress?.()
    unlistenProgress = null
})
</script>