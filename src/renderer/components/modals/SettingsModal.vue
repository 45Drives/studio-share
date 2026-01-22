<template>
    <div class="fixed inset-0 z-50">
        <div class="absolute inset-0 bg-black/60" @click="close" />

        <div class="absolute inset-0 flex items-center justify-center p-4">
            <div
                class="w-full max-w-7xl max-h-[calc(100vh-2rem)] rounded-lg border border-default bg-default shadow-2xl flex flex-col">

                <CardContainer class="flex-1 min-h-0 overflow-y-auto w-full bg-accent rounded-md shadow-xl min-w-0">
                    <template #header>
                        <div class="flex items-center justify-between px-6 py-4 shrink-0">
                            <div class="text-xl font-semibold text-default">Studio Share Settings</div>
                            <button class="btn btn-secondary" type="button" @click="close" :disabled="busy">
                                Close
                            </button>
                        </div>
                        <div class="px-6 text-left text-sm text-muted">
                            Adjust global settings for share links.
                        </div>
                    </template>
                    <div class="grid grid-cols-2 w-full">

                        <div class="px-6 py-4 border-r border-default text-left gap-4 items-center">
                            <div class="flex flex-col gap-1">
                                <label>Default Link Access</label>
                                <div class="flex items-center gap-4">
                                    <!-- Internal -->
                                    <span class="text-sm" :class="[
                                        !defaultAccessIsInternal
                                            ? 'border-b-2 border-primary pb-0.5 font-semibold'
                                            : 'opacity-70'
                                    ]">
                                        Internal
                                    </span>

                                    <!-- Switch -->
                                    <Switch id="link-access-switch" v-model="defaultAccessIsInternal" :class="[
                                        defaultAccessIsInternal ? 'bg-primary' : 'bg-well',
                                        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                    ]">
                                        <span class="sr-only">Toggle link access</span>
                                        <span aria-hidden="true" :class="[
                                            defaultAccessIsInternal ? 'translate-x-5' : 'translate-x-0',
                                            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                        ]" />
                                    </Switch>

                                    <!-- External -->
                                    <span class="text-sm" :class="[
                                        defaultAccessIsInternal
                                            ? 'border-b-2 border-primary font-semibold'
                                            : 'opacity-70'
                                    ]">
                                        External
                                    </span>
                                </div>
                            </div>
                            <div class="text-xs text-muted mt-1">
                                External uses your public domain or IP.
                                Internal uses LAN or VPN routing.
                            </div>
                            <div class="space-y-4 mt-4">
                                <div class="text-base font-semibold">External share URL (public)</div>

                                <label class="flex items-center gap-2 text-sm">
                                    <input type="checkbox" v-model="externalAuto" :disabled="busy" />
                                    <span>Auto-detect (WAN IP)</span>
                                </label>

                                <div>
                                    <label class="block text-sm opacity-80 mb-1">External base</label>
                                    <input v-model="externalBase" type="text" :disabled="busy || externalAuto"
                                        class="text-default input-textlike border px-3 py-2 rounded text-sm w-full"
                                        placeholder="https://example.ddns.net" />
                                    <div class="text-xs opacity-70 mt-1">
                                        Hostname or public IP only. No path.
                                    </div>
                                </div>

                                <div>
                                    <label class="block text-sm opacity-80 mb-1">External HTTPS port</label>
                                    <input v-model.number="externalHttpsPort" type="number" min="1" max="65535"
                                        :disabled="busy"
                                        class="text-default input-textlike border px-3 py-2 rounded text-sm w-full"
                                        placeholder="443" />
                                    <div class="text-xs opacity-70 mt-1">
                                        Port users enter in their browser.
                                    </div>
                                </div>

                                <div class="text-xs opacity-70">
                                    Using a domain requires a valid certificate for that domain.
                                </div>
                            </div>
                            <div class="space-y-4 mt-4">
                                <div class="text-base font-semibold">Internal share URL (LAN / VPN)</div>

                                <label class="flex items-center gap-2 text-sm">
                                    <input type="checkbox" v-model="internalAuto" :disabled="busy" />
                                    <span>Auto-detect (LAN IP)</span>
                                </label>
                                <div>
                                    <label class="block text-sm opacity-80 mb-1">Internal base</label>
                                    <input v-model="internalBase" type="text" :disabled="busy || internalAuto"
                                        class="text-default input-textlike border px-3 py-2 rounded text-sm w-full"
                                        placeholder="http://192.168.1.123" />
                                    <div class="text-xs opacity-70 mt-1">
                                        Private IP or internal hostname.
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="text-left space-y-3 bg-default px-6 py-4 rounded-md">
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                <div class="text-center text-base">
                                    <label>Preview</label>
                                </div>
                                <div>
                                    <div class="opacity-75 mb-1">External</div>
                                    <div class="font-mono text-xs break-all">
                                        {{ externalPreview || "—" }}
                                    </div>
                                    <div v-if="externalAuto && externalEffectivePreview"
                                        class="mt-1 text-xs opacity-70 break-all">
                                        Detected:
                                        <span class="font-mono">{{ externalEffectivePreview }}</span>
                                    </div>
                                </div>

                                <div>
                                    <div class="opacity-75 mb-1">Internal</div>
                                    <div class="font-mono text-xs break-all">
                                        {{ internalPreview || "—" }}
                                    </div>
                                </div>
                            </div>

                            <div class="text-xs opacity-70">
                                These base URLs are used when generating share links.
                            </div>

                            <div class="space-y-2">
                                <div class="text-sm font-semibold">Domain / DDNS example</div>

                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono break-all">
                                    <div>
                                        <div class="opacity-70 mb-1">Before</div>
                                        https:///&lt;ip&gt;/s/&lt;token&gt;
                                    </div>
                                    <div>
                                        <div class="opacity-70 mb-1">After</div>
                                        https://&lt;custom-domain&gt;/s/&lt;token&gt;
                                    </div>
                                </div>

                                <div class="text-xs opacity-70">
                                    Set External base to
                                    <span class="font-mono">"https://custom-domain"</span>
                                    and keep port 443 (or your forwarded port).
                                </div>
                            </div>
                        </div>
                        
                    </div>
                    <template #footer>
                        <div class="mb-1">
                            <div v-if="validationError" class="text-danger text-sm">
                                {{ validationError }}
                            </div>
                            <div v-if="saveError" class="text-danger text-sm">
                                {{ saveError }}
                            </div>
                            <div v-if="saveOk" class="text-success text-sm">
                                Saved.
                            </div>
                        </div>
                        <div class="flex items-center justify-between px-6 py-4 shrink-0">
                            <div class="text-xs text-muted">
                                New shares will use these settings automatically.
                            </div>
                            <div class="flex gap-3">
                                <button class="btn btn-secondary" type="button" @click="reload" :disabled="busy">
                                    Reload
                                </button>
                                <button class="btn btn-success" type="button" @click="save"
                                    :disabled="busy || !!validationError">
                                    <span v-if="busy">Saving…</span>
                                    <span v-else>Save settings</span>
                                </button>
                            </div>
                        </div>
                    </template>
                </CardContainer>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { CardContainer } from "@45drives/houston-common-ui";
import { Switch } from "@headlessui/vue";
import { useApi } from "../../composables/useApi";

const emit = defineEmits<{
    (e: "close"): void;
    (e: "saved", payload: {
        externalBaseCustom: string | null;
        externalBaseEffective: string | null;
        internalBase: string | null;
        externalHttpsPort: number;
        defaultLinkAccess: "external" | "internal";
        externalMode: "auto" | "custom";
    }): void;
}>();

const { apiFetch } = useApi();

const busy = ref(false);
const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const saveOk = ref(false);

const defaultLinkAccess = ref<"external" | "internal">("internal");

const defaultAccessIsInternal = computed({
    get: () => defaultLinkAccess.value === "external",
    set: (v: boolean) => {
        defaultLinkAccess.value = v ? "external" : "internal";
    },
});

const externalAuto = ref(false);
const internalAuto = ref(false);

// In the new API, this field represents the CUSTOM external base (when not auto)
const externalBase = ref<string>("");
const internalBase = ref<string>("");

const externalHttpsPort = ref<number>(443);

// Read-only server-reported effective base (when auto)
const externalBaseEffective = ref<string | null>(null);
// Read-only server-reported custom base (what’s stored)
const externalBaseCustom = ref<string | null>(null);

function close() {
    if (!busy.value) emit("close");
}

function normalizeUrlInput(raw: string, scheme: "http" | "https"): string | null {
    const s = (raw || "").trim();
    if (!s) return null;

    const withScheme = /^https?:\/\//i.test(s) ? s : `${scheme}://${s}`;
    try {
        const u = new URL(withScheme);

        // Enforce "origin only" (no path/query/hash/creds)
        if (u.username || u.password) return null;
        if (u.pathname && u.pathname !== "/") return null;
        if (u.search) return null;
        if (u.hash) return null;

        return u.origin;
    } catch {
        return null;
    }
}

function isValidPort(p: number): boolean {
    return Number.isFinite(p) && p >= 1 && p <= 65535;
}

function withPortIfNeeded(base: string | null, port: number): string | null {
    if (!base) return null;

    const p = Number(port);
    if (!Number.isFinite(p) || p < 1 || p > 65535) return base;

    try {
        const u = new URL(base);

        // Keep an explicitly provided port
        if (u.port) return u.origin;

        const isHttps = u.protocol === "https:";
        const isHttp = u.protocol === "http:";

        // Only append when non-default
        if ((isHttps && p === 443) || (isHttp && p === 80)) return u.origin;

        u.port = String(p);
        return u.origin;
    } catch {
        return base;
    }
}

const externalEffectivePreview = computed(() => {
    if (!externalAuto.value) return null;
    if (!externalBaseEffective.value) return null;
    return withPortIfNeeded(externalBaseEffective.value, externalHttpsPort.value);
});

const externalPreview = computed(() => {
    // What the modal is currently configured to use
    if (externalAuto.value) {
        // Show effective if we have it, otherwise "auto"
        return externalEffectivePreview.value || "auto";
    }

    const b = normalizeUrlInput(externalBase.value, "https");
    if (!b) return null;
    if (!isValidPort(externalHttpsPort.value)) return null;
    return withPortIfNeeded(b, externalHttpsPort.value);
});

const internalPreview = computed(() => {
    if (internalAuto.value) return "auto";
    return normalizeUrlInput(internalBase.value, "http");
});

const validationError = computed(() => {
    if (!isValidPort(externalHttpsPort.value)) {
        return "External HTTPS port must be between 1 and 65535.";
    }

    // External
    if (!externalAuto.value) {
        if (!externalBase.value.trim()) return "External base is required unless Auto-detect is enabled.";
        if (!normalizeUrlInput(externalBase.value, "https")) {
            return "External base must be a valid origin (scheme + host + optional port).";
        }
    }

    // Internal
    if (!internalAuto.value) {
        if (!internalBase.value.trim()) return "Internal base is required unless Auto-detect is enabled.";
        if (!normalizeUrlInput(internalBase.value, "http")) {
            return "Internal base must be a valid origin (scheme + host + optional port).";
        }
    }

    return null;
});

async function reload() {
    busy.value = true;
    loadError.value = null;
    saveError.value = null;
    saveOk.value = false;

    try {
        const data = await apiFetch("/api/settings");

        externalHttpsPort.value = Number(data.externalHttpsPort ?? 443);

        defaultLinkAccess.value = (data.defaultLinkAccess === "internal" ? "internal" : "external");

        const mode: "auto" | "custom" = (data.externalMode === "custom" ? "custom" : "auto");
        externalAuto.value = (mode === "auto");

        // internalBase: null means "auto" on server side; keep the existing UI switch behavior
        internalAuto.value = !data.internalBase;
        internalBase.value = data.internalBase ?? "";

        externalBaseCustom.value = data.externalBaseCustom ?? null;
        externalBaseEffective.value = data.externalBaseEffective ?? null;

        // For UI editing, externalBase is the CUSTOM base (only meaningful when mode=custom)
        externalBase.value = data.externalBaseCustom ?? "";
    } catch (e: any) {
        loadError.value = e?.message ? `Failed to load settings: ${e.message}` : "Failed to load settings.";
    } finally {
        busy.value = false;
    }
}

async function save() {
    saveOk.value = false;
    saveError.value = null;

    if (validationError.value) {
        saveError.value = validationError.value;
        return;
    }

    busy.value = true;
    try {
        const payload: any = {
            defaultLinkAccess: defaultLinkAccess.value,
            externalHttpsPort: externalHttpsPort.value,

            // New fields
            externalMode: externalAuto.value ? "auto" : "custom",
            externalBaseCustom: externalAuto.value ? null : (externalBase.value || "").trim(),

            internalBase: internalAuto.value ? "auto" : (internalBase.value || "").trim(),
        };

        await apiFetch("/api/settings", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        await reload();

        saveOk.value = true;

        emit("saved", {
            externalBaseCustom: externalBaseCustom.value,
            externalBaseEffective: externalBaseEffective.value,
            internalBase: internalAuto.value ? null : (normalizeUrlInput(internalBase.value, "http") || null),
            externalHttpsPort: externalHttpsPort.value,
            defaultLinkAccess: defaultLinkAccess.value,
            externalMode: externalAuto.value ? "auto" : "custom",
        });
    } catch (e: any) {
        saveError.value = e?.message || "Failed to save settings.";
    } finally {
        busy.value = false;
        setTimeout(() => { saveOk.value = false; }, 2000);
    }
}

watch(externalAuto, () => { saveOk.value = false; saveError.value = null; });
watch(internalAuto, () => { saveOk.value = false; saveError.value = null; });

onMounted(() => {
    reload();
});
</script>
