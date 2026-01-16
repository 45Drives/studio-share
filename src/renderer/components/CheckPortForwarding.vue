<template>
    <div class="pf-check">
        <!-- Row 1 -->
        <button type="button" class="btn btn-primary pf-check__btn" :class="buttonClass"
            :disabled="disabled || checking" @click="runCheck">
            {{ checking ? checkingLabel : buttonLabel }}
        </button>

        <span class="badge pf-check__badge" :class="badgeClass">
            {{ badgeText }}
        </span>

        <p v-if="message" class="pf-check__message">
            {{ message }}
        </p>
        <p v-else class="pf-check__message pf-check__message--empty">
            <span class="opacity-70">Run a check to verify port forwarding.</span>
        </p>

        <!-- Row 2 -->
        <p v-if="showDetails && detailsLine" class="pf-check__details">
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

const badgeClass = computed(() => {
    if (status.value === "enabled") return "badge-success";
    if (status.value === "disabled") return "badge-warning";
    if (status.value === "error") return "badge-error";
    return "badge-neutral";
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

<style scoped>
/* Layout: 3 columns, details spans cols 2-3 */
.pf-check {
    display: grid;
    grid-template-columns: auto auto 1fr;
    column-gap: 0.75rem;
    row-gap: 0.25rem;
    align-items: center;
    width: 100%;
    min-width: 0;
}

.pf-check__btn {
    white-space: nowrap;
}

.pf-check__message {
    min-width: 0;
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.25rem;
    opacity: 0.9;
    word-break: break-word;
}

.pf-check__message--empty {
    opacity: 0.65;
}

.pf-check__details {
    grid-column: 2 / 4;
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.1rem;
    opacity: 0.7;
    word-break: break-word;
}

/* Badge system (since you said these classes don't exist) */
.badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    user-select: none;

    height: 1.5rem;
    padding: 0 0.6rem;
    border-radius: 9999px;
    border: 1px solid transparent;

    font-size: 0.75rem;
    line-height: 1rem;
    font-weight: 600;
    letter-spacing: 0.01em;
}

.badge-neutral {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.86);
}

.badge-success {
    background: rgba(34, 197, 94, 0.14);
    border-color: rgba(34, 197, 94, 0.28);
    color: rgba(187, 247, 208, 0.95);
}

.badge-warning {
    background: rgba(245, 158, 11, 0.16);
    border-color: rgba(245, 158, 11, 0.30);
    color: rgba(254, 243, 199, 0.95);
}

.badge-error {
    background: rgba(239, 68, 68, 0.16);
    border-color: rgba(239, 68, 68, 0.30);
    color: rgba(254, 202, 202, 0.95);
}

/* Responsive: stack nicely on narrow widths */
@media (max-width: 640px) {
    .pf-check {
        grid-template-columns: auto 1fr;
        row-gap: 0.4rem;
    }

    .pf-check__badge {
        justify-self: start;
    }

    .pf-check__message {
        grid-column: 1 / 3;
    }

    .pf-check__details {
        grid-column: 1 / 3;
    }
}
</style>
