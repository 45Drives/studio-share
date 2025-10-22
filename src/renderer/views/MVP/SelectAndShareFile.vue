<template>
    <div class="h-full flex items-start justify-center pt-16 overflow-y-auto">
        <div class="grid grid-cols-1 gap-10 text-2xl w-9/12 mx-auto">
            <CardContainer class="bg-accent rounded-md shadow-xl">
                <template #header>
                        <!-- <div class="flex flex-row gap-2 items-center">
                            <span class="whitespace-nowrap">Enter path for file.</span>
                            <PathInput v-model="filePath" :apiFetch="apiFetch" />
                        </div> -->
                        <!-- inside #header, replace the single PathInput row with: -->
                        <div class="flex flex-col gap-2 text-left">

                            <FileExplorer :apiFetch="apiFetch" :modelValue="files"
                                @add="(paths) => { paths.forEach(p => { if (!files.includes(p)) files.push(p) }) }" />

                            <!-- Selected files panel -->
                            <div v-if="files.length" class="border rounded bg-accent">
                                <!-- header -->
                                <div class="flex items-center justify-between px-3 py-1 text-sm">
                                    <span class="font-semibold">{{ files.length }} selected</span>
                                    <div class="flex items-center gap-1">
                                        <button class="btn btn-secondary" @click="showSelected = !showSelected">
                                            {{ showSelected ? 'Hide' : 'Show' }} list
                                        </button>
                                        <button class="btn btn-danger" @click="clearAll">Clear all</button>
                                    </div>
                                </div>
                                <!-- scrollable list -->
                                <div v-show="showSelected" class="max-h-40 overflow-auto">
                                    <div v-for="(f, i) in files" :key="f"
                                        class="grid items-center [grid-template-columns:1fr_auto] border-t border-default text-sm">
                                        <code class="px-3 py-2 truncate block" :title="f">{{ f }}</code>
                                        <button class="btn btn-danger m-2 px-2 py-1" @click="removeFile(i)"
                                            title="Remove">✕</button>
                                    </div>
                                </div>
                            </div>

                        </div>


                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-base mt-2">
                            <!-- Expiry -->
                            <div class="flex items-center gap-3">
                                <label class="whitespace-nowrap font-semibold">Expires in:</label>

                                <div class="flex flex-wrap gap-2 text-sm">
                                    <button type="button" class="btn btn-secondary" @click="setPreset(1, 'hours')">1
                                        hour</button>
                                    <button type="button" class="btn btn-secondary" @click="setPreset(1, 'days')">1
                                        day</button>
                                    <button type="button" class="btn btn-secondary" @click="setPreset(7, 'weeks')">7
                                        days</button>
                                </div>

                                <!-- number -->
                                <input type="number" min="1" step="1" v-model.number="expiresValue"
                                    class="input-textlike border rounded px-3 py-2 w-32 bg-transparent" />

                                <!-- unit -->
                                <select v-model="expiresUnit"
                                    class="input-textlike border rounded px-3 py-2 bg-transparent"
                                    style="min-width: 8rem">
                                    <option value="hours">hours</option>
                                    <option value="days">days</option>
                                    <option value="weeks">weeks</option>
                                </select>

                                <span class="text-sm opacity-75">({{ prettyExpiry }})</span>
                            </div>

                            <!-- Password (optional) -->
                            <div class="flex items-center gap-3">
                                <label class="whitespace-nowrap font-semibold">Password:</label>
                                <div class="flex items-center gap-2">
                                    <input id="pw-enabled" type="checkbox" v-model="protectWithPassword" />
                                    <label for="pw-enabled" class="text-sm">Protect with password</label>
                                </div>
                                <input
                                    :disabled="!protectWithPassword"
                                    :type="showPassword ? 'text' : 'password'"
                                    v-model.trim="password"
                                    class="input-textlike border rounded px-3 py-2 bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                                    placeholder="Enter password"
                                    style="min-width: 16rem"
                                />
                                <button type="button" class="btn btn-secondary" @click="showPassword = !showPassword" :disabled="!protectWithPassword">
                                    {{ showPassword ? 'Hide' : 'Show' }}
                                </button>
                            </div>

                        </div>

                </template>
                <div class="flex flex-col">
                    <button class="btn btn-secondary w-full" :disabled="!canGenerate" @click="generateLink"
                        title="Create a magic link with the selected options">
                        Share via magic link
                    </button>
                    <p v-if="protectWithPassword && !password" class="text-sm text-red-500 mt-2">Password is required when protection is enabled.</p>
                    <div v-if="viewUrl" class="p-3 border rounded space-x-2 flex flex-col items-center">
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
const showSelected = ref(true)
function clearAll() { files.value = [] }
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
// const maxDownloads = ref(5)

// NEW: password state
const protectWithPassword = ref(false)
const password = ref('')
const showPassword = ref(false)

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
    files.value.length > 0 &&
    Number.isFinite(expiresValue.value) && expiresValue.value >= 1 &&
    (!protectWithPassword.value || !!password.value)
)

// Set preset helper
function setPreset(v: number, u: 'hours' | 'days' | 'weeks') {
    expiresValue.value = v
    expiresUnit.value = u
}

async function generateLink() {
    const body: any = {
        expiresInSeconds: expiresSec.value,
        // maxDownloads: maxDownloads.value
    }
    // Back-compat: if only 1 file, we can still send filePath (server supports both)
    if (files.value.length === 1) {
        body.filePath = files.value[0]
    } else {
        body.filePaths = files.value.slice()
    }

    // NEW: include password if enabled
    if (protectWithPassword.value && password.value) {
        body.password = password.value
    }

    const data = await apiFetch('/api/magic-link', {
        method: 'POST',
        body: JSON.stringify(body)
    })
    console.log('Got magic link data', data)
    viewUrl.value = data.downloadUrl
    downloadUrl.value = data.downloadUrl

    // Clear password after use for safety (optional)
    // password.value = ''
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
