<template>
    <form @submit.prevent="connectToServer" class="h-full flex items-start justify-center pt-16" :aria-busy="anyBusy">
        <div class="grid grid-cols-2 gap-6 text-2xl w-9/12 mx-auto">
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
            </div>

            <CardContainer class="col-span-1 bg-accent border-default rounded-md text-bold shadow-xl">
                <div class="flex flex-col text-left">
                    <span>Select a server to connect to:</span>
                    <select v-model="selectedServerIp" :disabled="anyBusy || manualIp !== ''"
                        class="bg-default h-[3rem] text-default rounded-lg px-4 flex-1 border border-default w-full">
                        <option v-for="server in discoveryState.servers" :key="server.ip" :value="server.ip">
                            {{ server.name }} ({{ server.ip }})
                        </option>
                    </select>
                </div>
                <span class="text-center items-center justify-self-center"> -- OR -- </span>
                <div class="flex flex-col text-left">
                    <span>Connect to server manually via IP Address:</span>
                    <input v-model="manualIp" type="text" placeholder="192.168.1.123" :disabled="anyBusy"
                        class="text-default input-textlike border px-4 py-1 rounded text-xl w-full" />
                </div>
                <div class="mt-4 text-left">
                    <span class="block text-sm mb-2">Ports (optional)</span>

                    <div class="grid grid-cols-3 gap-4 text-sm">
                        <!-- SSH -->
                        <label class="flex flex-col">
                            <span class="mb-1 opacity-80">SSH</span>
                            <input v-model.number="sshPort" type="number" min="1" max="65535" :disabled="anyBusy"
                                class="text-default input-textlike border px-3 py-1 rounded text-base w-full"
                                placeholder="22" />
                        </label>

                        <!-- Broadcaster / API -->
                        <label class="flex flex-col">
                            <span class="mb-1 opacity-80">
                                API <span class="text-xs">(houston-broadcaster)</span>
                            </span>
                            <input v-model.number="broadcasterPort" type="number" min="1" max="65535"
                                :disabled="anyBusy"
                                class="text-default input-textlike border px-3 py-1 rounded text-base w-full"
                                placeholder="9095" />
                        </label>

                        <!-- HTTPS -->
                        <label class="flex flex-col">
                            <span class="mb-1 opacity-80">HTTPS</span>
                            <input v-model.number="httpsPort" type="number" min="1" max="65535" :disabled="anyBusy"
                                class="text-default input-textlike border px-3 py-1 rounded text-base w-full"
                                placeholder="443" />
                        </label>
                    </div>

                    <p class="mt-1 text-xs opacity-75">
                        Leave blank to use defaults: SSH 22, API 9095, HTTPS 443. Ports must be different for each
                        service.
                    </p>

                    <p v-if="portError" class="mt-1 text-xs text-danger">
                        {{ portError }}
                    </p>
                    <p v-else-if="portWarning" class="mt-1 text-xs text-warning">
                        {{ portWarning }}
                    </p>
                </div>

            </CardContainer>

            <CardContainer class="col-span-1 bg-primary border-default rounded-md text-bold text-left shadow-xl">
                <div class="flex flex-col text-bold">
                    <span>Username:</span>
                    <input v-model="username" type="text" placeholder="root" :disabled="anyBusy"
                        class="text-default input-textlike px-4 py-1 rounded text-xl w-full border" />
                    <span class="text-center items-center justify-self-center"><br /></span>
                    <span>Password:</span>
                    <div class="w-full relative">
                        <input v-model="password" v-enter-next :type="showPassword ? 'text' : 'password'" id="password"
                            :disabled="anyBusy"
                            class="text-default input-textlike px-4 py-1 rounded text-xl w-full border"
                            placeholder="••••••••" />
                        <button type="button" @click="togglePassword" :disabled="anyBusy"
                            class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted">
                            <EyeIcon v-if="!showPassword" class="w-5 h-5" />
                            <EyeSlashIcon v-else class="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </CardContainer>

            <div class="col-span-2 grid grid-cols-2 gap-4">
                <div class="flex flex-row justify-between w-full items-center text-center gap-2 col-span-2">
                    <span class="text-danger text-base semibold text-left">
                        <b>ALSO:</b> To allow sharing links outside your network, <b>HTTPS port
                            (443 by default, unless you change it above) <u>must</u> </b> be open or forwarded from your router.
                    </span>
                    <button type="button" @click.prevent="togglePortFwdModal" :disabled="anyBusy"
                        class="btn btn-secondary w-fit text-base justify-end">
                        Click here to find out how.
                    </button>
                </div>
                <div class="flex flex-row justify-center col-span-2">
                    <div class="flex flex-col">
                        <button type="submit"
                            class="btn btn-success w-80 h-12 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                            :disabled="anyBusy">
                            <svg v-if="isBusy" class="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"
                                    opacity=".25" />
                                <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" stroke-width="4" fill="none" />
                            </svg>
                            <span>{{ isBusy ? 'Connecting…' : 'Connect to Server' }}</span>
                        </button>
                        <div v-if="statusLine"
                            class="mt-1 text-sm opacity-80 flex items-center gap-2 col-span-2 justify-center text-center">
                            <svg v-if="isBootstrapping" class="animate-spin h-4 w-4" viewBox="0 0 24 24"
                                aria-hidden="true">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"
                                    opacity=".25" />
                                <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" stroke-width="4" fill="none" />
                            </svg>
                            <span>{{ statusLine }}</span>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    </form>
    <PortForwardingModal v-if="showPortFwdModal" @close="togglePortFwdModal" />
</template>

<script setup lang="ts">
import { computed, inject, onUnmounted, ref, watch } from 'vue'
import { useHeader } from '../composables/useHeader'
import { currentServerInjectionKey, discoveryStateInjectionKey, connectionMetaInjectionKey } from '../keys/injection-keys'
import { EyeIcon, EyeSlashIcon } from "@heroicons/vue/20/solid";
import { DiscoveryState, Server } from '../types'
import { pushNotification, Notification, CardContainer } from '@45drives/houston-common-ui'
import PortForwardingModal from '../components/modals/PortForwardingModal.vue' 
import { useResilientNav } from '../composables/useResilientNav';
useHeader('Welcome to Flow by 45Studio!');

const { to } = useResilientNav()
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

const sshPort = ref<number | null>(null);          // SSH port (null means “unspecified → default/detect”)
const broadcasterPort = ref<number | null>(null);  // internal API, default 9095
const httpsPort = ref<number | null>(null);        // external HTTPS, default 443

const DEFAULT_SSH_PORT = 22;
const DEFAULT_API_PORT = Number((import.meta as any).env?.VITE_API_PORT || 9095);
const DEFAULT_HTTPS_PORT = 443;

// Map for nicer names in the message
const PORT_LABELS: Record<'ssh' | 'api' | 'https', string> = {
    ssh: 'SSH',
    api: 'API',
    https: 'HTTPS',
};

const PORT_PREF_KEY = 'hb_port_prefs_v1';

type PortPrefs = Record<string, {
    sshPort?: number;
    apiPort?: number;
    httpsPort?: number;
}>;

function formatPortNames(keys: PortKey[]): string {
    const labels = keys.map(k => PORT_LABELS[k]);
    const last = labels.pop()!;
    if (labels.length === 0) return last;
    if (labels.length === 1) return `${labels[0]} and ${last}`;
    return `${labels.join(', ')} and ${last}`;
}

function normalizePort(val: unknown): number | null {
    if (val === null || val === undefined || val === '') return null;

    const n = typeof val === 'string' ? Number(val) : (val as number);

    if (!Number.isFinite(n)) return null;
    if (n < 1 || n > 65535) return null;

    return n;
}

function loadPortPrefs(): PortPrefs {
    try {
        const raw = window.localStorage.getItem(PORT_PREF_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed as PortPrefs : {};
    } catch {
        return {};
    }
}

function savePortPrefs(prefs: PortPrefs) {
    try {
        window.localStorage.setItem(PORT_PREF_KEY, JSON.stringify(prefs));
    } catch {
        // ignore storage errors (private mode, etc.)
    }
}

function getPrefsForHost(host: string) {
    const prefs = loadPortPrefs();
    return prefs[host] || null;
}

function rememberPortsForHost(host: string, ports: {
    sshPort?: number;
    apiPort?: number;
    httpsPort?: number;
}) {
    const prefs = loadPortPrefs();
    prefs[host] = {
        ...prefs[host],
        ...ports,
    };
    savePortPrefs(prefs);
}

watch(selectedServerIp, (ip) => {
    if (!ip) return;

    // clear manual IP when selecting from dropdown (you already do similar)
    manualIp.value = '';

    const prefs = getPrefsForHost(ip.trim());
    if (prefs) {
        sshPort.value = prefs.sshPort ?? null;
        broadcasterPort.value = prefs.apiPort ?? null;
        httpsPort.value = prefs.httpsPort ?? null;
    }
}, { immediate: false });

type NormalizedHost = {
    host: string;
    sshPort?: number;
};

function normalizeHost(raw: string): NormalizedHost {
    const s = raw.trim();
    if (!s) return { host: '' };

    // Pattern: "10.0.0.10:2222"
    const colonIdx = s.lastIndexOf(':');
    if (colonIdx > -1) {
        const hostPart = s.slice(0, colonIdx).trim();
        const portPart = s.slice(colonIdx + 1).trim();
        if (/^\d+$/.test(portPart) && hostPart) {
            return { host: hostPart, sshPort: Number(portPart) };
        }
    }

    // Pattern: "10.0.0.10 -p 2222" or "10.0.0.10 -P 2222"
    const m = s.match(/^(.*)\s+-p\s+(\d+)$/i);
    if (m) {
        const hostPart = m[1].trim();
        const portPart = Number(m[2]);
        if (hostPart) {
            return { host: hostPart, sshPort: portPart };
        }
    }

    // Fallback: just a host/IP
    return { host: s };
}

/** Simple IPv4-ish validation for UI */
function looksLikeIpv4(host: string): boolean {
    const parts = host.split('.');
    if (parts.length !== 4) return false;
    return parts.every(p => {
        if (!/^\d+$/.test(p)) return false;
        const n = Number(p);
        return n >= 0 && n <= 255;
    });
}

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
        selectedServerIp.value = hit.ip;
        manualIp.value = '';
        return;
    } else if (val !== '') {
        selectedServerIp.value = '';
    }

    if (ip) {
        const prefs = getPrefsForHost(ip);
        if (prefs) {
            sshPort.value = prefs.sshPort ?? null;
            broadcasterPort.value = prefs.apiPort ?? null;
            httpsPort.value = prefs.httpsPort ?? null;
        }
    }
});

watch(selectedServerIp, () => { if (selectedServerIp.value !== '') manualIp.value = '' })

const isDev = import.meta.env.DEV === true;

const portError = ref<string>('');    // hard error: block Connect
const portWarning = ref<string>('');  // soft warning: explain auto-fallback

type PortKey = 'ssh' | 'api' | 'https';

function ensurePortConstraints(changed: PortKey) {
    portError.value = '';
    portWarning.value = '';

    const values: Record<PortKey, number | null> = {
        ssh: normalizePort(sshPort.value),
        api: normalizePort(broadcasterPort.value),
        https: normalizePort(httpsPort.value),
    };

    const defaults: Record<PortKey, number> = {
        ssh: DEFAULT_SSH_PORT,
        api: DEFAULT_API_PORT,
        https: DEFAULT_HTTPS_PORT,
    };

    const allKeys: PortKey[] = ['ssh', 'api', 'https'];

    //
    // 1) Explicit conflicts only (user-entered values, ignoring defaults)
    //
    const explicitMap = new Map<number, PortKey[]>();
    for (const k of allKeys) {
        const v = values[k];
        if (v == null) continue; // blank → ignore here
        const arr = explicitMap.get(v) ?? [];
        arr.push(k);
        explicitMap.set(v, arr);
    }

    for (const [port, keys] of explicitMap.entries()) {
        if (keys.length > 1) {
            const names = formatPortNames(keys);
            portError.value =
                `Ports must be unique: ${names} are all set to ${port}. ` +
                `Please choose a different port for one of them.`;
            return; // do not auto-fix explicit conflicts
        }
    }

    // 2) auto-bump block
    const changedVal = values[changed];

    if (changedVal != null && changedVal !== defaults[changed]) {
        const warnParts: string[] = [];
        let didAdjust = false;

        const used = new Set<number>();
        for (const k of allKeys) {
            const v = values[k];
            if (v != null) used.add(v);
        }
        used.add(changedVal);

        for (const k of allKeys) {
            if (k === changed) continue;

            if (values[k] == null && defaults[k] === changedVal) {
                let candidate = defaults[k] + 1;
                while (candidate <= 65535 && used.has(candidate)) {
                    candidate++;
                }

                if (candidate > 65535) {
                    portError.value = `No free port found for ${PORT_LABELS[k]}. Please pick a value manually.`;
                    return;
                }

                values[k] = candidate;
                used.add(candidate);
                didAdjust = true;

                warnParts.push(
                    `${PORT_LABELS[k]} default port ${defaults[k]} is already used by ${PORT_LABELS[changed]} (${changedVal}).\n` +
                    `${PORT_LABELS[k]} was set to ${candidate}. Please review and adjust if needed.\n`
                );
            }
        }

        if (didAdjust) {
            isProgrammaticPortUpdate = true;
            try {
                sshPort.value = values.ssh;
                broadcasterPort.value = values.api;
                httpsPort.value = values.https;
            } finally {
                isProgrammaticPortUpdate = false;
            }
        }

        if (warnParts.length > 0) {
            const msg = warnParts.join(' ');
            portWarning.value = msg;
            pushNotification(new Notification('Port Changed', msg, 'warning', 8000));
        }
    }


    //
    // 3) Final safety: check conflicts on *effective* ports (value or default if blank)
    //
    const effective: Record<PortKey, number> = {
        ssh: values.ssh ?? DEFAULT_SSH_PORT,
        api: values.api ?? DEFAULT_API_PORT,
        https: values.https ?? DEFAULT_HTTPS_PORT,
    };

    const effectiveMap = new Map<number, PortKey[]>();
    for (const k of allKeys) {
        const p = effective[k];
        const arr = effectiveMap.get(p) ?? [];
        arr.push(k);
        effectiveMap.set(p, arr);
    }

    for (const [port, keys] of effectiveMap.entries()) {
        if (keys.length > 1) {
            const names = formatPortNames(keys);
            portError.value =
                `Ports must be unique: ${names} are all set to ${port} (including defaults). ` +
                `Please choose distinct ports.`;
            return;
        }
    }

    // If we get here, no conflicts remain and warnings (if any) were already set.
}

let isProgrammaticPortUpdate = false;

watch(sshPort, () => {
    if (isProgrammaticPortUpdate) return;
    ensurePortConstraints('ssh');
});

watch(broadcasterPort, () => {
    if (isProgrammaticPortUpdate) return;
    ensurePortConstraints('api');
});

watch(httpsPort, () => {
    if (isProgrammaticPortUpdate) return;
    ensurePortConstraints('https');
});

const statusLine = ref<string>('');  // one line only
const isBusy = ref(false);           // disables UI + button during whole flow
const isBootstrapping = ref(false);  // shows spinner while remote deps/bootstrap running
let unlistenProgress: (() => void) | null = null;
const anyBusy = computed(() => isBusy.value);

const showPortFwdModal = ref(false);
function togglePortFwdModal() {
    showPortFwdModal.value = !showPortFwdModal.value;
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
        pushNotification(new Notification('Error', `Please select or enter a server before connecting.`, 'error', 8000));
        return;
    }
    if (!username.value.trim()) {
        pushNotification(new Notification('Error', `Please enter a username.`, 'error', 8000));
        return;
    }
    if (!password.value.trim()) {
        pushNotification(new Notification('Error', `Please enter a password.`, 'error', 8000));
        return;
    }

    // Re-run port constraints on submit to be extra safe
    ensurePortConstraints('ssh');

    if (portError.value) {
        pushNotification(new Notification('Error', portError.value, 'error', 8000));
        return;
    }

    // Normalize manual IP (strip any :port / -p flags the user typed)
    if (!selectedServer.value && manualIp.value.trim()) {
        const norm = normalizeHost(manualIp.value);
        if (!looksLikeIpv4(norm.host)) {
            pushNotification(new Notification('Error', `Please enter a valid IPv4 address (e.g. 192.168.1.10).`, 'error', 8000));
            return;
        }
        // If they typed a port inline and no explicit sshPort yet, adopt it.
        if (norm.sshPort && sshPort.value == null) {
            sshPort.value = norm.sshPort;
        }
        manualIp.value = norm.host;
    }

    isBusy.value = true;
    statusLine.value = '';

    try {
        const rawIpInput = (selectedServer.value?.ip || manualIp.value).trim();
        const normalized = normalizeHost(rawIpInput);
        const rawIp = normalized.host;

        // If the manual IP is already discovered, prefer that discovered record.
        const discovered = findServerByIp(rawIp);
        const effectiveServer = discovered ?? selectedServer.value;
        const ip = effectiveServer?.ip || rawIp;
        
        const apiPortToUse =
            broadcasterPort.value && broadcasterPort.value > 0 && broadcasterPort.value < 65536
                ? broadcasterPort.value
                : DEFAULT_API_PORT;

        const apiBase = `http://${ip}:${apiPortToUse}`;

        // Decide which SSH port to use for this session
        const sshPortToUse = (sshPort.value && sshPort.value > 0 && sshPort.value < 65536)
            ? sshPort.value
            : undefined; // undefined → “let main detect / default 22”

        // Ensure SSH is ready early so any later SSH operations can use keys reliably
        statusLine.value = 'Preparing SSH…';
        try {
            const r = await window.electron?.ipcRenderer.invoke('ensure-ssh-ready', {
                host: ip,
                username: username.value,
                password: password.value || undefined,
                sshPort: sshPortToUse,
            });

            if (!r?.ok) {
                // If this fails, SSH preflight/bootstrap will probably fail too, so treat as fatal.
                window.appLog?.error('ensure-ssh-ready.failed', { error: r?.error });
                statusLine.value = '';
                pushNotification(new Notification('Error', r?.error || 'SSH setup failed', 'error', 12000));
                return;
            }
        } catch (e: any) {
            statusLine.value = '';
            window.appLog?.error('ensure-ssh-ready.failed', { error: e?.message });
            pushNotification(new Notification('Error', e?.message || 'SSH setup failed', 'error', 12000));
            return;
        }

        // Set current server (avoid creating a "manual" entry if we already discovered it)
        providedCurrentServer.value = effectiveServer ?? {
            ip, name: ip, lastSeen: Date.now(), status: 'unknown', manuallyAdded: true
        };

        connectionMeta.value = {
            ...connectionMeta.value,
            port: apiPortToUse,
            apiBase,
            httpsHost: undefined,
            ssh: {
                server: ip,
                username: username.value,
                port: sshPortToUse,
            },
        };

        window.appLog?.info('login.resolveApiBase', { isDev, ip, port: apiPortToUse, apiBase, href: location.href });
        window.appLog?.info('login.request', { url: `${apiBase}/api/login`, ip });

        const probe = async () => {
            const r = await window.electron?.ipcRenderer.invoke('probe-health', { ip, port: apiPortToUse });
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
                    {
                        host: ip,
                        username: username.value,
                        password: password.value,
                        sshPort: sshPortToUse,
                    }
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

            const result = await window.electron?.ipcRenderer.invoke(
                "run-remote-bootstrap",
                {
                    id,
                    host: ip,
                    username: username.value,
                    password: password.value,
                    sshPort: sshPortToUse,
                    bcastPort: apiPortToUse,
                    httpsPort: httpsPort.value ?? 443,
                }
            );

            if (!result?.success) {
                statusLine.value = '';
                isBootstrapping.value = false;
                unlistenProgress?.(); unlistenProgress = null;
                pushNotification(new Notification('Error', result?.error || 'Bootstrap failed', 'error', 12000));
                return;
            }

            // Mark bootstrap finished before doing extra health probes
            isBootstrapping.value = false;
            statusLine.value = 'Checking server health…';

            // Post-bootstrap health wait (no longer counted as "bootstrapping")
            for (let i = 0; i < 10; i++) {
                await new Promise(r => setTimeout(r, 1000));
                if (await probe()) break;
            }

            statusLine.value = '';
            unlistenProgress?.();
            unlistenProgress = null;
        }

        // Healthy now — proceed to login
        const res = await fetch(`${apiBase}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.value, password: password.value }),
        });
        if (!res.ok) throw new Error(await res.text());
        const { token } = await res.json();

        connectionMeta.value = {
            ...connectionMeta.value,
            token,
            ssh: {
                server: ip,
                username: username.value,
                port: sshPortToUse,
            },
        };

        // // Ensure SSH is ready for rsync (make key locally + add to authorized_keys)
        // try {
        // statusLine.value = 'Preparing SSH for file transfers…';
        //     const r = await window.electron?.ipcRenderer.invoke('ensure-ssh-ready', {
        //         host: ip,
        //         username: username.value,
        //         password: password.value || undefined,
        //         sshPort: sshPortToUse,
        //     });

        // if (!r?.ok) {
        //     // Non-fatal: rsync may still work via agent or existing keys, but tell the user.
        //     window.appLog?.warn('ensure-ssh-ready.failed', { error: r?.error });
        //     pushNotification(new Notification('Notice', `SSH key setup skipped: ${r?.error || 'unknown error'}`, 'warning', 8000));
        // } else {
        //     window.appLog?.info('ensure-ssh-ready.ok', { keyPath: r.keyPath });
        // }
        // } catch (e: any) {
        // window.appLog?.warn('ensure-ssh-ready.exception', { message: e?.message });
        // }
        statusLine.value = '';
        
        try { sessionStorage.setItem('hb_token', token); } catch { /* ignore */ }

        // Seed internal/external base on the server for later link generation
        try {
            const hdrs = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            };

            // One shot: let the server detect both. Internal = LAN IP, External = WAN IP.
            await fetch(`${apiBase}/api/settings`, {
                method: 'POST',
                headers: hdrs,
                body: JSON.stringify({
                    internalBase: 'auto',
                    externalBase: 'auto',
                    externalHttpsPort: httpsPort.value ?? 443
                }),
            });
        } catch (e: any) {
            window.appLog?.warn('settings.seed.failed', { message: e?.message });
        }

        rememberPortsForHost(ip, {
            sshPort: sshPortToUse,
            apiPort: apiPortToUse,
            httpsPort: httpsPort.value ?? 443,
        });

        window.appLog?.info('login.success', { ip });
        to('dashboard');
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