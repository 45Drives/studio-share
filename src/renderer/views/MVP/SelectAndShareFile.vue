<template>
    <div class="h-full flex items-start justify-center pt-28">
        <div class="grid grid-cols-1 gap-10 text-2xl w-9/12 mx-auto">
            <CardContainer class="bg-accent rounded-md shadow-xl">
                <template #header>
                    <div class="flex flex-row gap-2 text-left items-center">
                        <span class="whitespace-nowrap">
                            Enter path for file.
                        </span>
                        <PathInput v-model="filePath" :apiFetch="apiFetch" />
                    </div>
                </template>
                <div>
                    <button class="btn btn-secondary w-full" @click="generateLink">Share via magic link</button>
                </div>
                <template #footer>
                    <div v-if="viewUrl" class="p-3 border rounded space-x-2">
                        <code>{{ viewUrl }}</code>
                        <button class="btn btn-secondary" @click="copyLink">Copy</button>
                        <button class="btn btn-primary" @click="openInBrowser">Open</button>
                    </div>
                </template>
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
import { onMounted, ref } from 'vue'
import { useApi } from '../../composables/useApi'
import CardContainer from '../../components/CardContainer.vue'
import PathInput from '../../components/PathInput.vue'
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
const expiresSec = ref(60 * 60 * 24)
const maxDownloads = ref(3)
const viewUrl = ref('')
const downloadUrl = ref('')

async function generateLink() {
    const data = await apiFetch('/api/magic-link', {
        method: 'POST',
        body: JSON.stringify({
            filePath: filePath.value,
            expiresInSeconds: expiresSec.value,
            maxDownloads: maxDownloads.value
        })
    })
    console.log('data:', data);
    viewUrl.value = data.viewUrl;
    downloadUrl.value = data.downloadUrl;
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
