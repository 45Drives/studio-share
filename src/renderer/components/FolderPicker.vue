<!-- FolderPicker.vue -->
<template>
  <section class="flex flex-col gap-2 text-left text-base rounded-md">
    <h2 v-if="title" class="font-semibold">{{ title }}</h2>

    <!-- Top summary + PathInput -->
    <div class="flex flex-col gap-2 text-sm">
      <div v-if="subtitle" class="opacity-80">{{ subtitle }}</div>
      <div class="flex flex-row gap-2 items-center">
        <span class="whitespace-nowrap">Destination folder:</span>
        <PathInput v-model="cwd" :apiFetch="apiFetch" :dirsOnly="true" @choose="onChoose" />
      </div>
      <div class="text-xs opacity-70 px-2 py-1">
        debug: mode={{ browseMode }} roots={{ projectRoots.length }}
      </div>

      <!-- Optional status for auto-detect -->
      <div v-if="!base && (autoDetectRoots ?? true)" class="text-xs opacity-70">
        <template v-if="detecting">Detecting ZFS pools…</template>
        <template v-else-if="browseMode === 'roots' && !projectRoots.length">No ZFS pools found; browsing /</template>
      </div>
    </div>

    <!-- Browser area -->
    <div class="border rounded overflow-auto bg-default" :class="containerHeights">
      <!-- Toolbar -->
      <div class="sticky top-0 bg-default z-[1000] border-b border-default px-2 py-1 flex items-center gap-2">
        <button
          class="btn btn-secondary"
          :disabled="!canGoUp || browseMode === 'roots'"
          @click="goUpOne"
          title="Go up one directory"
        >
          <FontAwesomeIcon :icon="faArrowLeft" />
        </button>
        <div class="text-xs opacity-75 truncate" :title="cwd">
          {{ browseMode === 'roots' ? 'Pick a ZFS pool…' : (cwd || '/') }}
        </div>

        <!-- View toggle (hidden while picking roots) -->
        <div class="ml-auto flex items-center gap-1" v-if="browseMode !== 'roots'">
          <button
            type="button"
            class="px-2 py-1 text-xs flex items-center justify-center hover:bg-white/5"
            :class="viewMode === 'tree' ? 'bg-white/10' : ''"
            :aria-pressed="viewMode === 'tree'"
            aria-label="List view"
            title="List view"
            @click="viewMode = 'tree'"
          >
            <FontAwesomeIcon :icon="faList" />
            <span class="sr-only">List</span>
          </button>
          <button
            type="button"
            class="px-2 py-1 text-xs flex items-center justify-center border-l border-default hover:bg-white/5"
            :class="viewMode === 'icons' ? 'bg-white/10' : ''"
            :aria-pressed="viewMode === 'icons'"
            aria-label="Grid view"
            title="Grid view"
            @click="viewMode = 'icons'"
          >
            <FontAwesomeIcon :icon="faGrip" />
            <span class="sr-only">Grid</span>
          </button>
        </div>
      </div>

      <!-- Column headers (only when not in roots mode) -->
      <div
        v-if="browseMode !== 'roots'"
        class="grid sticky top-0 bg-well font-semibold border-b border-default
               [grid-template-columns:40px_minmax(0,1fr)_120px_110px_180px]"
      >
        <div class="px-2 py-2"></div>
        <div class="px-2 py-2">Name</div>
        <div class="px-2 py-2">Type</div>
        <div class="px-2 py-2">Size</div>
        <div class="px-2 py-2">Modified</div>
      </div>

      <!-- Roots list (auto-detect mode only) -->
      <template v-if="browseMode === 'roots' && !base && (autoDetectRoots ?? true)">
        <div
          v-for="r in projectRoots"
          :key="r.mountpoint"
          class="grid items-center border-b border-default px-3 py-1
                 [grid-template-columns:40px_minmax(0,1fr)_120px_110px_180px]"
        >
          <div class="px-2 py-1"></div>
          <div class="px-2 py-1">
            <div class="truncate">
              <code :title="`${r.name} → ${r.mountpoint}`">{{ r.mountpoint }}</code>
            </div>
          </div>
          <div class="px-2 py-1">ZFS Pool</div>
          <div class="px-2 py-1">—</div>
          <div class="px-2 py-1">
            <button class="btn btn-secondary mr-2" @click="selectRoot(r.mountpoint)">Select</button>
            <button class="btn btn-primary" @click="openRoot(r.mountpoint)">Open</button>
          </div>
        </div>
      </template>

      <!-- Tree view -->
      <template v-if="browseMode !== 'roots' && viewMode === 'tree'">
        <TreeNode
          :key="'tree-'+cwd"
          :apiFetch="apiFetch"
          :selected="internalSelected"
          :selectedVersion="selectedVersion"
          :getFilesFor="getFilesForFolder"
          :relPath="rootRel"
          :depth="0"
          :isRoot="true"
          useCase="upload"
          v-model:selectedFolder="selectedFolderBridge"
          @select-folder="onSelectFolder"
          @toggle="togglePath"
          @navigate="navigateTo"
        />
      </template>

      <!-- Icon (grid) view -->
      <template v-if="browseMode !== 'roots' && viewMode === 'icons'">
        <IconMode
          :key="'icons-'+cwd"
          :apiFetch="apiFetch"
          :selected="internalSelected"
          :selectedVersion="selectedVersion"
          :getFilesFor="getFilesForFolder"
          :relPath="rootRel"
          :depth="0"
          :isRoot="true"
          useCase="upload"
          v-model:selectedFolder="selectedFolderBridge"
          @select-folder="onSelectFolder"
          @toggle="togglePath"
          @navigate="navigateTo"
        />
      </template>
    </div>

    <!-- Selected summary -->

  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faArrowLeft, faList, faGrip } from '@fortawesome/free-solid-svg-icons'
import PathInput from './PathInput.vue'
import TreeNode from './TreeNode.vue'
import IconMode from './IconMode.vue'
import { useProjectChoices } from '../composables/useProjectChoices'

type ViewMode = 'tree' | 'icons'

const props = defineProps<{
  modelValue: string
  apiFetch: (url: string, init?: RequestInit) => Promise<any>
  useCase?: 'upload' | 'share'
  title?: string
  subtitle?: string
  base?: string
  startDir?: string
  autoDetectRoots?: boolean
  showSelection?: boolean
  heightClass?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'changed-cwd', v: string): void
}>()

/* Bridge modelValue <-> v-model:selectedFolder on child components */
const selectedFolderBridge = computed<string | null>({
  get: () => (props.modelValue ? props.modelValue : null),
  set: (v) => emit('update:modelValue', v ?? '')
})

/* Roots auto-detect */
const showEntireTree = ref(false)
const { detecting, projectRoots, loadProjectChoices } = useProjectChoices(showEntireTree)

/* Local state */
const internalBase = ref<string>(props.base ?? '')
const browseMode = ref<'roots' | 'dir'>('dir')
const viewMode = ref<ViewMode>('icons') // persisted below
const cwd = ref<string>(props.startDir ?? props.base ?? '/')
const rootRel = computed(() => (cwd.value || '').replace(/^\/+/, '').replace(/\/+$/, ''))
const internalSelected = ref<Set<string>>(new Set())
const selectedVersion = ref(0)
const expandCache = new Map<string, string[]>()

/* Persist view mode */
onMounted(() => {
  const saved = localStorage.getItem('folderpicker:viewMode') as ViewMode | null
  if (saved === 'tree' || saved === 'icons') viewMode.value = saved
})
watch(viewMode, (m) => localStorage.setItem('folderpicker:viewMode', m))

/* Initial mount logic */
onMounted(async () => {
  const wantRoots = !props.base && (props.autoDetectRoots ?? true)
  if (wantRoots) {
    await loadProjectChoices()
    browseMode.value = projectRoots.value.length > 0 ? 'roots' : 'dir'
    if (browseMode.value === 'dir') {
      cwd.value = '/'
      emit('changed-cwd', cwd.value)
    }
  } else {
    browseMode.value = 'dir'
  }

  if (props.startDir) {
    cwd.value = ensureSlash(props.startDir)
    emit('changed-cwd', cwd.value)
  } else if (props.base) {
    cwd.value = ensureSlash(props.base)
    emit('changed-cwd', cwd.value)
  }
})

/* React to prop changes */
watch(() => props.base, (v) => {
  internalBase.value = v ?? ''
  if (v) {
    browseMode.value = 'dir'
    cwd.value = ensureSlash(v)
  }
})

watch(projectRoots, (roots) => {
  if (!props.base && (props.autoDetectRoots ?? true)) {
    if ((!roots || roots.length === 0) && browseMode.value === 'roots') {
      browseMode.value = 'dir'
      cwd.value = '/'
      emit('changed-cwd', cwd.value)
    }
  }
})

/* Helpers */
function ensureSlash(p: string) {
  if (!p) return '/'
  return p.endsWith('/') ? p : p + '/'
}
function toAbsUnder(base: string, p: string) {
  const bName = (base || '').replace(/\/+$/, '').replace(/^\/+/, '')
  const clean = (p || '').replace(/^\/+/, '')
  if (!bName) return '/' + clean
  if (clean === bName || clean.startsWith(bName + '/')) return '/' + clean
  return '/' + bName + '/' + clean
}

/* Data providers */
async function getFilesForFolder(folder: string): Promise<string[]> {
  if (expandCache.has(folder)) return expandCache.get(folder)!
  try {
    const resp = await props.apiFetch('/api/expand-paths', {
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

/* PathInput choose */
function onChoose(pick: { path: string; isDir: boolean }) {
  const next = pick.isDir ? ensureSlash(pick.path)
    : ensureSlash(pick.path.replace(/\/[^/]+$/, '') || '/')
  const clamped = internalBase.value ? ensureSlash(toAbsUnder(internalBase.value, next)) : next
  cwd.value = clamped
  emit('changed-cwd', cwd.value)
}

/* Navigation from children */
function navigateTo(rel: string) {
  const absLike = ensureSlash('/' + rel.replace(/^\/+/, ''))
  const clamped = internalBase.value ? ensureSlash(toAbsUnder(internalBase.value, absLike)) : absLike
  cwd.value = clamped
  emit('changed-cwd', cwd.value)
}

async function togglePath({ path, isDir }: { path: string; isDir: boolean }) {
  if (!isDir) return
  await getFilesForFolder(path)
}

function clearTreeCache() {
  expandCache.clear()
  selectedVersion.value++
}

/* Up clamp */
const canGoUp = computed(() => {
  if (!cwd.value || cwd.value === '/') return false
  if (!internalBase.value) return cwd.value !== '/'
  const base = ensureSlash(internalBase.value)
  return cwd.value !== base
})

function parentPath(absLike: string): string {
  const p = (absLike || '/').replace(/\/+$/, '')
  if (!p || p === '/') return '/'
  const parent = p.replace(/\/[^/]*$/, '') || '/'
  return ensureSlash(parent)
}

function goUpOne() {
  const parent = parentPath(cwd.value || '/')
  if (internalBase.value) {
    const base = ensureSlash(internalBase.value)
    cwd.value = parent.startsWith(base) ? parent : base
  } else {
    cwd.value = parent
  }
  emit('changed-cwd', cwd.value)
}

/* Select a folder (from child components) */
function onSelectFolder(rel: string) {
  const normalized = rel.replace(/^\/+/, '')
  emit('update:modelValue', normalized)

  const abs = '/' + normalized
  const clamped = internalBase.value ? ensureSlash(toAbsUnder(internalBase.value, abs)) : ensureSlash(abs)
  cwd.value = clamped
  emit('changed-cwd', cwd.value)
}

/* ZFS root picking */
function openRoot(mountpoint: string) {
  internalBase.value = mountpoint
  browseMode.value = 'dir'
  cwd.value = ensureSlash(mountpoint)
  emit('changed-cwd', cwd.value)
}

/* IMPORTANT: also flip to 'dir' when using Select (not only Open) */
function selectRoot(mountpoint: string) {
  internalBase.value = mountpoint
  browseMode.value = 'dir'

  const normalized = mountpoint.replace(/^\/+/, '')
  emit('update:modelValue', normalized)

  cwd.value = ensureSlash(mountpoint)
  emit('changed-cwd', cwd.value)
}

/* UI */
const selectedAbs = computed(() => {
  if (!props.modelValue) return ''
  const abs = '/' + props.modelValue.replace(/^\/+/, '')
  return abs.endsWith('/') ? abs : abs + '/'
})
const containerHeights = computed(() => props.heightClass || 'max-h-[28rem] min-h-[18rem]')
</script>
