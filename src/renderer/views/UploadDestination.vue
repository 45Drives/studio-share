<template>
    <div class="flex flex-col gap-3 max-h-[500px]">
        <!-- Top controls + PathInput -->
        <div class="flex flex-col gap-2 text-sm">
            <div class="opacity-70">Pick files/folders to share.</div>

            <div class="flex flex-row gap-2 items-center">
                <span class="whitespace-nowrap">Enter root path to use.</span>
                <PathInput v-model="cwd" :apiFetch="apiFetch" :dirsOnly="true" @choose="onChoose" />
            </div>
        </div>

        <!-- Table wrapper -->
        <div class="border rounded overflow-auto max-h-[440px] min-h-[300px]">
            <!-- Header -->
            <div class="grid sticky top-0 bg-accent font-semibold border-b border-default
           [grid-template-columns:40px_minmax(0,1fr)_120px_110px_180px]">
                <div class="px-2 py-2 text-center"></div>
                <div class="px-2 py-2">Name</div>
                <div class="px-2 py-2">Type</div>
                <div class="px-2 py-2">Size</div>
                <div class="px-2 py-2">Modified</div>
            </div>

            <!-- Body -->
            <div>
                <TreeNode
                    :key="cwd"
                    :apiFetch="apiFetch"
                    :selected="internalSelected"         
                    :selectedVersion="selectedVersion"
                    :getFilesFor="getFilesForFolder"
                    :relPath="rootRel"
                    :depth="0"
                    :isRoot="true"
                    :useCase="'upload'"
                    :selectedFolder="destFolderRel"
                    @select-folder="onSelectFolder"
                    @toggle="togglePath"
                    @navigate="navigateTo"
                    />
            </div>
        </div>

       <!-- // <button class="btn btn-primary" :disabled="!canNext" @click="goStep(3)">Next</button> -->
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import PathInput from '../../components/PathInput.vue';
import TreeNode from '../../components/TreeNode.vue';
import { useApi } from '../composables/useApi'

const props = defineProps<{
    startDir?: string,
    modelValue?: string[]
}>()

const emit = defineEmits<{
    (e: 'add', paths: string[]): void
    (e: 'update:modelValue', v: string[]): void
}>()
const { apiFetch } = useApi()

const destFolderRel = ref<string>('')

const cwd = ref<string>('')                       // shown to user; usually starts with "/"
const rootRel = computed(() =>
    (cwd.value || '').replace(/^\/+/, '').replace(/\/+$/, '') // what the API wants
)

const internalSelected = ref<Set<string>>(new Set())
const selectedVersion = ref(0)

// ---- expand cache (folder -> files[]) ----
const expandCache = new Map<string, string[]>()

async function getFilesForFolder(folder: string): Promise<string[]> {
    if (expandCache.has(folder)) return expandCache.get(folder)!
    try {
        const resp = await apiFetch('/api/expand-paths', {
            method: 'POST',
            body: JSON.stringify({ paths: [folder] })
        })
        const files: string[] = resp.files || []
        expandCache.set(folder, files)
        return files
    } catch {
        expandCache.set(folder, [])
        return []
    }
}

function cloneSet(s: Set<string>) { return new Set(Array.from(s)) }
function addMany(paths: string[]) {
    const s = cloneSet(internalSelected.value)
    for (const p of paths) s.add(p)
    internalSelected.value = s
    selectedVersion.value++
}
function removeMany(paths: string[]) {
    const s = cloneSet(internalSelected.value)
    for (const p of paths) s.delete(p)
    internalSelected.value = s
    selectedVersion.value++
}

// When the user picks an item in PathInput:
//  - if it's a dir, use it as the new root
//  - if it's a file, root to the file's parent
function onChoose(pick: { path: string; isDir: boolean }) {
    if (pick.isDir) {
        cwd.value = pick.path.endsWith('/') ? pick.path : (pick.path + '/')
    } else {
        const parent = pick.path.replace(/\/[^/]+$/, '') || '/'
        cwd.value = parent.endsWith('/') ? parent : (parent + '/')
    }
}

// Allow clicking folder names in the tree to re-root there
function navigateTo(rel: string) {
    const absLike = '/' + rel.replace(/^\/+/, '')
    cwd.value = absLike.endsWith('/') ? absLike : (absLike + '/')
}

type TogglePayload = { path: string; isDir: boolean }
async function togglePath({ path, isDir }: TogglePayload) {
    if (!isDir) {
        internalSelected.value.has(path) ? removeMany([path]) : addMany([path])
        return
    }
    const files = await getFilesForFolder(path)
    if (!files.length) return
    const allSelected = files.every(f => internalSelected.value.has(f))
    allSelected ? removeMany(files) : addMany(files)
}

function clearSelection() {
    internalSelected.value = new Set()
    selectedVersion.value++
}

async function emitSelection() {
    const selected = Array.from(internalSelected.value)
    if (!selected.length) return
    const already = new Set(props.modelValue || [])
    const uniq: string[] = []
    for (const p of selected) if (!already.has(p)) uniq.push(p)
    if (uniq.length) emit('add', uniq)
}


function onSelectFolder(rel: string) {
  destFolderRel.value = rel
  // optionally reflect into cwd:
  const abs = '/' + rel.replace(/^\/+/, '')
  cwd.value = abs.endsWith('/') ? abs : abs + '/'
}

const canNext = computed(() => !!destFolderRel.value)
</script>