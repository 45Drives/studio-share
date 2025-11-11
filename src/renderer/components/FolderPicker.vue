<!-- FolderPicker.vue -->
<template>
  <!-- FolderPicker.vue template (only the changed/added blocks) -->
  <section class="flex flex-col gap-2 text-left text-base rounded-md">

    <!-- Top summary + PathInput -->
    <div class="flex flex-col gap-2 text-sm">
      <!-- NEW: optional bypass -->
      <label v-if="allowEntireTree" class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" v-model="showEntireTree" @change="changeProject" />
        <span>Show entire directory tree from root</span>
      </label>
      <div v-if="subtitle" class="opacity-80">{{ subtitle }}</div>



      <div class="text-sm opacity-80 -mb-1 flex items-center justify-start gap-3 flex-wrap"
        v-if="internalProject && internalProject.trim().length > 0">
        <span class="font-semibold">Project:</span>
        <code>{{ internalProject }}</code>
        <button class="btn btn-secondary" @click="changeProject()">Change Project Directory</button>
      </div>
      <div class="flex flex-row gap-2 items-center">
        <span class="whitespace-nowrap">Destination folder:</span>
        <PathInput v-model="cwd" :apiFetch="apiFetch" :dirsOnly="true" @choose="onChoose" />
      </div>


      <!-- Auto-detect status -->
      <div v-if="(autoDetectRoots ?? true) && !showEntireTree" class="text-xs opacity-70">
        <template v-if="detecting">Detecting ZFS pools…</template>
        <template v-else-if="browseMode === 'roots' && !projectRoots.length">No ZFS pools found; browsing /</template>
      </div>
    </div>

    <!-- Browser area -->
    <div class="border rounded overflow-auto bg-default" :class="containerHeights">
      <!-- Toolbar -->
      <div class="sticky top-0 bg-default z-[1000] border-b border-default px-2 py-1 flex items-center gap-2">
        <button class="btn btn-secondary" :disabled="!canGoUp || browseMode === 'roots'" @click="goUpOne"
          title="Go up one directory">
          <FontAwesomeIcon :icon="faArrowLeft" />
        </button>
        <div class="text-xs opacity-75 truncate" :title="cwd">
          {{ browseMode === 'roots' ? 'Pick a ZFS pool…' : (cwd || '/') }}
        </div>
        <div class="ml-auto flex items-center gap-1" v-if="browseMode !== 'roots'">
          <button type="button" class="px-2 py-1 text-xs flex items-center justify-center hover:bg-white/5"
            :class="viewMode === 'tree' ? 'bg-white/10' : ''" :aria-pressed="viewMode === 'tree'" aria-label="List view"
            title="List view" @click="viewMode = 'tree'">
            <FontAwesomeIcon :icon="faList" />
            <span class="sr-only">List</span>
          </button>
          <button type="button"
            class="px-2 py-1 text-xs flex items-center justify-center border-l border-default hover:bg-white/5"
            :class="viewMode === 'icons' ? 'bg-white/10' : ''" :aria-pressed="viewMode === 'icons'"
            aria-label="Grid view" title="Grid view" @click="viewMode = 'icons'">
            <FontAwesomeIcon :icon="faGrip" />
            <span class="sr-only">Grid</span>
          </button>
        </div>
      </div>

      <!-- Column headers -->
      <div v-if="browseMode !== 'roots'" class="grid sticky top-0 bg-well font-semibold border-b border-default
               [grid-template-columns:40px_minmax(0,1fr)_120px_110px_180px]">
        <div class="px-2 py-2"></div>
        <div class="px-2 py-2">Name</div>
        <div class="px-2 py-2">Type</div>
        <div class="px-2 py-2">Size</div>
        <div class="px-2 py-2">Modified</div>
      </div>

      <!-- NEW: Roots list -->
      <template v-if="browseMode === 'roots' && !showEntireTree && (autoDetectRoots ?? true)">
        <div v-for="r in projectRoots" :key="r.mountpoint" class="grid items-center border-b border-default px-3 py-1
                  [grid-template-columns:40px_minmax(0,1fr)_120px_110px_180px]">
          <div></div>
          <div class="truncate">
            <code :title="`${r.name} → ${r.mountpoint}`">{{ r.mountpoint }}</code>
          </div>
          <div>ZFS Pool</div>
          <div>—</div>
          <div class="px-2 py-1">
            <button class="btn btn-secondary" @click="chooseProject(r.mountpoint)">Select</button>
          </div>
        </div>
      </template>

      <!-- Tree / Icon view -->
      <template v-if="browseMode !== 'roots' && viewMode === 'tree'">
        <TreeNode :key="'tree-' + cwd" :apiFetch="apiFetch" :selected="internalSelected"
          :selectedVersion="selectedVersion" :getFilesFor="getFilesForFolder" :relPath="rootRel" :depth="0"
          :isRoot="true" :useCase="useCase || 'upload'" v-model:selectedFolder="selectedFolderBridge"
          @select-folder="onSelectFolder" @toggle="togglePath" @navigate="navigateTo" />
      </template>

      <template v-if="browseMode !== 'roots' && viewMode === 'icons'">
        <IconMode :key="'icons-' + cwd" :apiFetch="apiFetch" :selected="internalSelected"
          :selectedVersion="selectedVersion" :getFilesFor="getFilesForFolder" :relPath="rootRel" :depth="0"
          :isRoot="true" :useCase="useCase || 'upload'" v-model:selectedFolder="selectedFolderBridge"
          @select-folder="onSelectFolder" @toggle="togglePath" @navigate="navigateTo" />
      </template>
    </div>
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
  allowEntireTree?: boolean

  // ADD THESE (so v-model:project / v-model:dest are typed)
  project?: string
  dest?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'changed-cwd', v: string): void
  (e: 'update:project', v: string): void
  (e: 'update:dest', v: string): void
}>()
/* Bridge modelValue <-> v-model:selectedFolder on child components */
const selectedFolderBridge = computed<string | null>({
  get: () => (internalDest.value ? internalDest.value : null),
  set: (v) => { internalDest.value = v ?? '' }
})

const internalProject = computed({
  get: () => props.project ?? '',
  set: (v: string) => emit('update:project', v),
})

const internalDest = computed({
  get: () => (props.dest ?? props.modelValue ?? ''),
  set: (v: string) => {
    emit('update:dest', v)
    emit('update:modelValue', v)
  },
})

/* Roots auto-detect */
const showEntireTree = ref(false)
const { detecting, projectRoots, loadProjectChoices } = useProjectChoices(showEntireTree)
const clampBase = computed(() => (internalProject.value || props.base || ''))

/* Local state */
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
  await loadProjectChoices()
  if (internalProject.value) {
    browseMode.value = 'dir'
    cwd.value = ensureSlash(internalProject.value)
  } else if (props.autoDetectRoots ?? true) {
    browseMode.value = 'roots'
    cwd.value = '/'
  } else {
    browseMode.value = 'dir'
    cwd.value = '/'
  }
  emit('changed-cwd', cwd.value)
})

watch(() => props.base, (v) => {
  clampBase.value = v ?? ''
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
  const clamped = clampBase.value ? ensureSlash(toAbsUnder(clampBase.value, next)) : next
  cwd.value = clamped
  emit('changed-cwd', cwd.value)
}

/* Navigation from children */
function navigateTo(rel: string) {
  const absLike = ensureSlash('/' + rel.replace(/^\/+/, ''))
  const clamped = clampBase.value ? ensureSlash(toAbsUnder(clampBase.value, absLike)) : absLike
  cwd.value = clamped
  emit('changed-cwd', cwd.value)
}

async function togglePath({ path, isDir }: { path: string; isDir: boolean }) {
  if (!isDir) return
  await getFilesForFolder(path)
}


/* Up clamp */
const canGoUp = computed(() => {
  if (!cwd.value || cwd.value === '/') return false
  if (!clampBase.value) return cwd.value !== '/'
  const base = ensureSlash(clampBase.value)
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
  if (clampBase.value) {
    const base = ensureSlash(clampBase.value)
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
  const clamped = clampBase.value ? ensureSlash(toAbsUnder(clampBase.value, abs)) : ensureSlash(abs)
  cwd.value = clamped
  emit('changed-cwd', cwd.value)
}

/* ZFS root picking */
function openRoot(mountpoint: string) {
  clampBase.value = mountpoint
  browseMode.value = 'dir'

  const abs = ensureSlash(mountpoint)
  cwd.value = abs
  emit('changed-cwd', cwd.value)

  // NEW: auto-select this zpool as the destination
  const normalized = abs.replace(/^\/+/, '').replace(/\/+$/, '') // "tank" or "tank/projects"
  emit('update:modelValue', normalized)
}


/* UI */
const selectedAbs = computed(() => {
  if (!props.modelValue) return ''
  const abs = '/' + props.modelValue.replace(/^\/+/, '')
  return abs.endsWith('/') ? abs : abs + '/'
})
function chooseProject(dirPath: string) {
  const abs = ensureSlash(dirPath).replace(/\/+$/, '')
  internalProject.value = abs
  browseMode.value = 'dir'
  internalDest.value = abs.replace(/^\/+/, '')
  cwd.value = ensureSlash(abs)
  emit('changed-cwd', cwd.value)
}

function openRootBrowse(mountpoint: string) {
  browseMode.value = 'dir'
  const abs = ensureSlash(mountpoint)
  cwd.value = abs
  emit('changed-cwd', cwd.value)
}
function changeProject() {
  internalProject.value = ''
  internalDest.value = ''
  browseMode.value = (props.autoDetectRoots ?? true) && !showEntireTree.value ? 'roots' : 'dir'
  cwd.value = showEntireTree.value ? '/' : '/'
  emit('changed-cwd', cwd.value)
}
const containerHeights = computed(() => props.heightClass || 'max-h-[28rem] min-h-[18rem]')
</script>
