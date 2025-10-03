<template>
    <div class="h-full flex items-start justify-center pt-16">
        <div class="grid grid-cols-1 gap-10 text-2xl w-9/12 mx-auto">
            <CardContainer class="bg-accent rounded-md shadow-xl">
                <template #header>
                    <div class="flex flex-col gap-4 text-left">
                        <!-- <div class="flex flex-row gap-2 items-center">
                            <span class="whitespace-nowrap">Enter path for file.</span>
                            <PathInput v-model="filePath" :apiFetch="apiFetch" />
                        </div> -->
                        <!-- inside #header, replace the single PathInput row with: -->
                        <div class="flex flex-col gap-3 text-left">

                            <FileExplorer :apiFetch="apiFetch" :modelValue="files"
                                @add="(paths) => { paths.forEach(p => { if (!files.includes(p)) files.push(p) }) }" />

                            <div v-if="files.length" class="flex flex-wrap gap-2">
                                <div v-for="(f, i) in files" :key="f"
                                    class="flex items-center gap-2 px-3 py-1 border rounded-full text-sm bg-transparent">
                                    <code class="opacity-90">{{ f }}</code>
                                    <button class="btn btn-danger" style="padding: 2px 8px; border-radius: 999px"
                                        @click="removeFile(i)" title="Remove">
                                        ✕
                                    </button>
                                </div>
                            </div>
                        </div>


                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-base">
                            <!-- Max downloads -->
                            <div class="flex items-center gap-3">
                                <label class="whitespace-nowrap font-semibold">Max downloads</label>
                                <input type="number" min="1" step="1" v-model.number="maxDownloads"
                                    class="input border rounded px-3 py-2 w-32 bg-transparent" />
                            </div>

                            <!-- Expiry -->
                            <div class="flex items-center gap-3">
                                <label class="whitespace-nowrap font-semibold">Expires in</label>

                                <!-- number -->
                                <input type="number" min="1" step="1" v-model.number="expiresValue"
                                    class="input border rounded px-3 py-2 w-32 bg-transparent" />

                                <!-- unit -->
                                <select v-model="expiresUnit" class="input border rounded px-3 py-2 bg-transparent"
                                    style="min-width: 8rem">
                                    <option value="hours">hours</option>
                                    <option value="days">days</option>
                                    <option value="weeks">weeks</option>
                                </select>

                                <span class="text-sm opacity-75">({{ prettyExpiry }})</span>
                            </div>
                            <div class="flex flex-wrap gap-2 text-sm">
                                <button type="button" class="btn btn-secondary" @click="setPreset(1, 'hours')">1
                                    hour</button>
                                <button type="button" class="btn btn-secondary" @click="setPreset(1, 'days')">1
                                    day</button>
                                <button type="button" class="btn btn-secondary" @click="setPreset(7, 'weeks')">7
                                    days</button>
                            </div>

                        </div>

                    </div>
                </template>
                <div class="flex flex-col">
                    <button class="btn btn-secondary w-full" :disabled="!canGenerate" @click="generateLink"
                        title="Create a magic link with the selected options">
                        Share via magic link
                    </button>
                    <div v-if="viewUrl" class="p-3 border rounded space-x-2">
                        <code>{{ viewUrl }}</code>
                        <div class="button-group-row">
                            <button class="btn btn-secondary" @click="copyLink">Copy</button>
                            <button class="btn btn-primary" @click="openInBrowser">Open</button>
                        </div>
                    </div>
                </div>
            </CardContainer>
            <div class="button-group-row col-span-1">
                <button @click="goBack" class="btn btn-danger justify-start">
                    Go Back
                </button>
            </div>
        </div>

    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../../composables/useApi'
import CardContainer from '../../components/CardContainer.vue'
import FileExplorer from '../../components/FileExplorer.vue'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import { router } from '../../../app/routes'

const { apiFetch } = useApi()

const cwd = ref<string>('') // relative to SHARE_ROOT
const entries = ref<Array<{ name: string; isDir: boolean; path: string }>>([])

async function loadDir(rel = '') {
    const data = await apiFetch(`/api/files?dir=${encodeURIComponent(rel)}`)
    cwd.value = data.dir
    entries.value = (data.entries || []).map((e: any) => ({
        ...e,
        path: (rel ? rel + '/' : '') + e.name
    }))
}

const filePath = ref('')
const files = ref<string[]>([])

function addFile() {
    if (!filePath.value) return
    if (!files.value.includes(filePath.value)) files.value.push(filePath.value)
    filePath.value = ''
}
function removeFile(i: number) {
    files.value.splice(i, 1)
}

const expiresValue = ref(1)
const expiresUnit = ref<'hours' | 'days' | 'weeks'>('days')
const maxDownloads = ref(5)

const viewUrl = ref('')
const downloadUrl = ref('')

// Map units → seconds
const UNIT_TO_SECONDS = {
    hours: 60 * 60,
    days: 24 * 60 * 60,
    weeks: 7 * 24 * 60 * 60,
} as const

// Compute the seconds value we send to the server
const expiresSec = computed(() => {
    const v = Math.max(1, Math.floor(expiresValue.value || 0))
    return v * UNIT_TO_SECONDS[expiresUnit.value]
})

// Pretty text like "3 days" / "2 weeks"
const prettyExpiry = computed(() => {
    const v = Math.max(1, Math.floor(expiresValue.value || 0))
    const u = expiresUnit.value
    // pluralize
    const label = v === 1 ? u.slice(0, -1) : u
    return `${v} ${label}`
})

const canGenerate = computed(() =>
    // Boolean(filePath.value) &&
    files.value.length > 0 &&
    Number.isFinite(maxDownloads.value) && maxDownloads.value >= 1 &&
    Number.isFinite(expiresValue.value) && expiresValue.value >= 1
)

// Set preset helper
function setPreset(v: number, u: 'hours' | 'days' | 'weeks') {
    expiresValue.value = v
    expiresUnit.value = u
}

async function generateLink() {
    const body: any = {
        expiresInSeconds: expiresSec.value,
        maxDownloads: maxDownloads.value
    }
    // Back-compat: if only 1 file, we can still send filePath (server supports both)
    if (files.value.length === 1) {
        body.filePath = files.value[0]
    } else {
        body.filePaths = files.value.slice()
    }

    const data = await apiFetch('/api/magic-link', {
        method: 'POST',
        body: JSON.stringify(body)
    })
    viewUrl.value = data.viewUrl
    downloadUrl.value = data.downloadUrl
}

onMounted(() => loadDir())

async function copyLink() {
    if (!viewUrl.value) return
    await navigator.clipboard.writeText(viewUrl.value)
    pushNotification(new Notification('Copied!', 'Link copied to clipboard', 'success', 8000))
}

function openInBrowser() {
    // window.open will be intercepted by your main.ts setWindowOpenHandler
    window.open(viewUrl.value, '_blank')
}

function goBack() {
    router.push({ name: 'server-selection' })
}

</script>
