<template>
    <div class="w-full min-w-0">
        <div class="flex items-center gap-2 min-w-0">
            <button type="button" class="btn btn-primary whitespace-nowrap px-3 py-2 text-base w-full" :class="buttonClass"
                :disabled="disabled || checking" @click="runCheck">
                {{ checking ? checkingLabel : buttonLabel }}
            </button>

          

            <button type="button" class="btn btn-danger w-full text-base"
                :disabled="checking" @click="reset" title="Reset status">
                Reset
            </button>
        </div>
        <div>
            <span
                class="inline-flex items-center justify-center whitespace-nowrap select-none rounded-full border text-[0.72rem] font-bold h-5 px-2 w-full"
                :class="badgeTwClass">
                {{ badgeText }}
            </span>
        </div>

        <p class="mt-2 mb-0 min-w-0 opacity-90 leading-5 break-words text-sm">
            <span v-if="message">{{ message }}</span>
            <span v-else class="opacity-70">Run a check to verify port forwarding.</span>
        </p>

        <p v-if="showDetails && detailsLine" class="mt-1 mb-0 text-xs opacity-70 break-words">
            {{ detailsLine }}
        </p>
      
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

type VerifyForwardingResponse = {
    ok: boolean;
    observedIp?: string;
    port?: number;
    forwardedToThisStudio?: boolean;
    stage?: string;
    tlsReachable?: boolean;
    httpOk?: boolean;
    httpStatus?: number;
    tokenMatched?: boolean;
    gotToken?: "present" | "missing" | string;
    error?: string;
    detail?: string;
    [k: string]: unknown;
};

type ResultEvent =
    | { ok: true; enabled: boolean; response: VerifyForwardingResponse }
    | { ok: false; status?: number; response?: unknown; error?: string; detail?: string };

type ApiFetch = (path: string, init?: RequestInit) => Promise<any>;

const props = withDefaults(
    defineProps<{
        endpoint?: string;

        buttonLabel?: string;
        checkingLabel?: string;

        autoCheckOnMount?: boolean;
        disabled?: boolean;

        showDetails?: boolean;
        buttonClass?: string | string[] | Record<string, boolean>;

        apiFetch?: ApiFetch;

        requestBody?: Record<string, unknown> | string | null;
    }>(),
    {
        endpoint: "/api/forwarding/check",
        buttonLabel: "Check Port",
        checkingLabel: "Testing...",
        autoCheckOnMount: false,
        disabled: false,
        showDetails: true,
        buttonClass: "",
        apiFetch: undefined,
        requestBody: null,
    }
);

const emit = defineEmits<{
    (e: "result", payload: ResultEvent): void;
    (e: "reset"): void;
}>();

const checking = ref(false);
const status = ref<null | "enabled" | "disabled" | "error">(null);
const message = ref("");
const lastResponse = ref<VerifyForwardingResponse | null>(null);

const detailsLine = computed(() => {
    const r = lastResponse.value;
    if (!r) return "";
    const bits: string[] = [];
    if (r.observedIp) bits.push(`Observed IP: ${r.observedIp}`);
    if (typeof r.port === "number") bits.push(`Port: ${r.port}`);
    // if (typeof r.httpStatus === "number") bits.push(`HTTP: ${r.httpStatus}`);
    // if (typeof r.stage === "string") bits.push(`Stage: ${r.stage}`);
    return bits.join(" | ");
});

const badgeText = computed(() => {
    if (status.value === "enabled") return "Port Forwarding Enabled";
    if (status.value === "disabled") return "Port Forwarding Disabled";
    if (status.value === "error") return "Test Failed";
    return "Not Tested";
});

const badgeTwClass = computed(() => {
    if (status.value === "enabled") return "bg-green-500/15 border-green-500/30 text-green-100";
    if (status.value === "disabled") return "bg-amber-500/15 border-amber-500/30 text-amber-100";
    if (status.value === "error") return "bg-red-500/15 border-red-500/30 text-red-100";
    return "bg-white/10 border-white/15 text-white/85";
});

function reset() {
    checking.value = false;
    status.value = null;
    message.value = "";
    lastResponse.value = null;
    emit("reset");
}

async function runCheck() {
    if (checking.value) return;

    checking.value = true;
    message.value = "";
    lastResponse.value = null;

    try {
        const body =
            props.requestBody == null
                ? undefined
                : typeof props.requestBody === "string"
                    ? props.requestBody
                    : JSON.stringify(props.requestBody);

        let json: VerifyForwardingResponse | null = null;

        if (props.apiFetch) {
            const resp = await props.apiFetch(props.endpoint, {
                method: "POST",
                ...(body ? { body } : {}),
            });
            json = (resp ?? null) as VerifyForwardingResponse | null;
        } else {
            const res = await fetch(props.endpoint, {
                method: "POST",
                headers: { "content-type": "application/json" },
                ...(body ? { body } : {}),
            });
            json = (await res.json().catch(() => null)) as VerifyForwardingResponse | null;
            if (!res.ok) {
                status.value = "error";
                message.value = json?.error ? String(json.error) : `HTTP ${res.status}`;
                emit("result", { ok: false, status: res.status, response: json ?? undefined });
                return;
            }
        }

        if (!json) {
            status.value = "error";
            message.value = "No response";
            emit("result", { ok: false, error: "bad_response", detail: "No JSON body" });
            return;
        }

        if (json.ok === false && typeof json.error === "string") {
            status.value = "error";
            message.value = json.detail ? String(json.detail) : String(json.error);
            emit("result", { ok: false, response: json, error: json.error, detail: json.detail });
            return;
        }

        lastResponse.value = json;

        const enabled = json.forwardedToThisStudio === true && json.tokenMatched === true;

        if (enabled) {
            status.value = "enabled";
            message.value = "Forwarding is correctly reaching this Studio.";
        } else {
            status.value = "disabled";
            const gotToken = json.gotToken ?? "missing";
            const httpStatus = typeof json.httpStatus === "number" ? json.httpStatus : "unknown";
            message.value = `Probe did not match this Studio (HTTP ${httpStatus}, token ${gotToken}).`;
        }

        emit("result", { ok: true, enabled, response: json });
    } catch (e) {
        status.value = "error";
        message.value = String((e as any)?.message || e);
        emit("result", { ok: false, error: "network_error", detail: message.value });
    } finally {
        checking.value = false;
    }
}

onMounted(() => {
    if (props.autoCheckOnMount) runCheck();
});

defineExpose({ runCheck, reset });
</script>