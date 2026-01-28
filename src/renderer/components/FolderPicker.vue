<template>
  <section class="flex flex-col gap-2 text-left text-base rounded-md">
    <div class="flex flex-col gap-2 text-sm">
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
        <PathInput v-model="destAbs" :apiFetch="apiFetch" :dirsOnly="true" @choose="onChooseDest" />
      </div>

      <div v-if="(autoDetectRoots ?? true) && !showEntireTree" class="text-xs opacity-70">
        <template v-if="detecting">Detecting ZFS pools…</template>
        <template v-else-if="browseMode === 'roots' && !projectRoots.length">No ZFS pools found; browsing /</template>
      </div>
    </div>

    <div class="border rounded overflow-auto bg-default" :class="containerHeights">
      <div class="sticky top-0 bg-default border-b border-default px-2 py-1 flex items-center gap-2 z-10">
        <button class="btn btn-secondary" :disabled="!canGoUp || browseMode === 'roots'" @click="goUpOne"
          title="Go up one directory">
          <FontAwesomeIcon :icon="faArrowLeft" />
        </button>

        <div class="text-xs opacity-75 truncate" :title="browseCwd">
          {{ browseMode === 'roots' ? 'Pick a ZFS pool…' : (browseCwd || '/') }}
        </div>

        <div class="ml-auto flex items-center" v-if="browseMode !== 'roots'">
          <button type="button" class="btn btn-secondary text-xs mr-2 flex items-center gap-1 px-2"
            @click="createNewFolder" title="Create a new folder in current directory">
            <FontAwesomeIcon :icon="faFolderPlus" />
            <span>New Folder</span>
          </button>

          <button type="button" class="px-2 py-1 text-xs flex items-center justify-center hover:bg-white/5 rounded-l-md"
            :class="viewMode === 'tree' ? 'bg-white/10' : ''" :aria-pressed="viewMode === 'tree'" aria-label="List view"
            title="List view" @click="viewMode = 'tree'">
            <FontAwesomeIcon :icon="faList" />
            <span class="sr-only">List</span>
          </button>

          <button type="button"
            class="px-2 py-1 text-xs flex items-center justify-center border-l border-default hover:bg-white/5 rounded-r-md"
            :class="viewMode === 'icons' ? 'bg-white/10' : ''" :aria-pressed="viewMode === 'icons'"
            aria-label="Grid view" title="Grid view" @click="viewMode = 'icons'">
            <FontAwesomeIcon :icon="faGrip" />
            <span class="sr-only">Grid</span>
          </button>
        </div>
      </div>

      <template v-if="browseMode === 'roots' && !showEntireTree && (autoDetectRoots ?? true)">
        <div v-for="r in projectRoots" :key="r.mountpoint" class="grid items-center border-b border-default px-3 py-1 bg-default
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

      <template v-if="browseMode !== 'roots' && viewMode === 'tree'">
        <TreeNode :key="'tree-' + browseCwd + refreshKey" :apiFetch="apiFetch" :selected="internalSelected"
          :selectedVersion="selectedVersion" :getFilesFor="getFilesForFolder" :relPath="rootRel" :depth="0"
          :isRoot="true" :useCase="useCase || 'upload'" v-model:selectedFolder="selectedFolderBridge"
          @select-folder="onSelectFolder" @toggle="togglePath" @navigate="navigateTo" />
      </template>

      <template v-if="browseMode !== 'roots' && viewMode === 'icons'">
        <IconMode :key="'icons-' + browseCwd + refreshKey" :apiFetch="apiFetch" :selected="internalSelected"
          :selectedVersion="selectedVersion" :getFilesFor="getFilesForFolder" :relPath="rootRel" :depth="0"
          :isRoot="true" :useCase="useCase || 'upload'" v-model:selectedFolder="selectedFolderBridge"
          @select-folder="onSelectFolder" @toggle="togglePath" @navigate="navigateTo" />
      </template>

      <div v-if="showNewFolderModal" class="fixed inset-0 z-[2000] bg-gray-600/80 flex items-center justify-center p-4">
        <div class="bg-accent p-6 rounded-lg shadow-2xl w-full max-w-sm border border-default">
          <h3 class="text-lg font-semibold mb-4 text-default">Create New Folder</h3>
          <p class="text-sm mb-4 text-muted">
            Current Path: <code>{{ browseCwd }}</code>
          </p>

          <form @submit.prevent="confirmNewFolder">
            <input ref="folderNameInput" type="text" v-model="newFolderName" placeholder="Enter folder name" required
              autofocus class="w-full px-3 py-2 input-textlike text-default" />

            <div class="mt-6 flex justify-end gap-3">
              <button type="button" @click="showNewFolderModal = false" class="btn btn-danger">
                Cancel
              </button>
              <button type="submit" :disabled="!newFolderName.trim()" class="btn btn-primary">
                Create
              </button>
            </div>
          </form>

          <p v-if="newFolderError" class="mt-4 text-sm text-danger p-2 bg-red-900/30 rounded">
            Error: {{ newFolderError }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faArrowLeft, faList, faGrip, faFolderPlus } from '@fortawesome/free-solid-svg-icons'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
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
  uploadLink?: boolean
  project?: string
  dest?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'changed-cwd', v: string): void
  (e: 'update:project', v: string): void
  (e: 'update:dest', v: string): void
}>()

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

/* Bridge modelValue <-> v-model:selectedFolder on child components */
const selectedFolderBridge = computed<string | null>({
  get: () => (internalDest.value ? internalDest.value : null),
  set: (v) => {
    internalDest.value = v ?? ''
  },
})

/* Roots auto-detect */
const showEntireTree = ref(false)
const { detecting, projectRoots, loadProjectChoices } = useProjectChoices(showEntireTree)

/* Local state */
const clampBase = ref<string>(internalProject.value || props.base || '')
const browseMode = ref<'roots' | 'dir'>('dir')
const viewMode = ref<ViewMode>('icons')
const browseCwd = ref<string>(props.startDir ?? props.base ?? '/')

/* Destination (what PathInput shows) */
const destAbs = ref<string>('/')

/* Root rel for children (driven by browseCwd) */
const rootRel = computed(() => (browseCwd.value || '').replace(/^\/+/, '').replace(/\/+$/, ''))

const internalSelected = ref<Set<string>>(new Set())
const selectedVersion = ref(0)
const expandCache = new Map<string, string[]>()
const refreshKey = ref(0)

/* Persist view mode */
onMounted(() => {
  const saved = localStorage.getItem('folderpicker:viewMode') as ViewMode | null
  if (saved === 'tree' || saved === 'icons') viewMode.value = saved
})
watch(viewMode, (m) => localStorage.setItem('folderpicker:viewMode', m))

/* Keep PathInput (destAbs) synced to internalDest */
watch(
  () => internalDest.value,
  (rel) => {
    const abs = ensureSlash('/' + (rel || '').replace(/^\/+/, ''))
    destAbs.value = abs
  },
  { immediate: true },
)

/* Initial mount logic */
onMounted(async () => {
  await loadProjectChoices()

  if (internalProject.value) {
    browseMode.value = 'dir'
    browseCwd.value = ensureSlash(internalProject.value)
  } else if (props.autoDetectRoots ?? true) {
    browseMode.value = 'roots'
    browseCwd.value = '/'
  } else {
    browseMode.value = 'dir'
    browseCwd.value = '/'
  }

  emit('changed-cwd', browseCwd.value)

  if (!internalDest.value) {
    const rel = browseCwd.value.replace(/^\/+/, '').replace(/\/+$/, '')
    internalDest.value = rel
  } else {
    destAbs.value = ensureSlash('/' + internalDest.value.replace(/^\/+/, ''))
  }
})

watch(
  () => props.base,
  (v) => {
    clampBase.value = v ?? ''
    if (v) {
      browseMode.value = 'dir'
      browseCwd.value = ensureSlash(v)
      emit('changed-cwd', browseCwd.value)
    }
  },
)

watch(projectRoots, (roots) => {
  if (!props.base && (props.autoDetectRoots ?? true)) {
    if ((!roots || roots.length === 0) && browseMode.value === 'roots') {
      browseMode.value = 'dir'
      browseCwd.value = '/'
      emit('changed-cwd', browseCwd.value)
    }
  }
})

watch(browseCwd, (v) => {
  if (browseMode.value === 'roots' && v !== '/') browseMode.value = 'dir'
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
      body: JSON.stringify({ paths: [folder] }),
    })
    const files: string[] = resp.files || []
    expandCache.set(folder, files)
    return files
  } catch {
    expandCache.set(folder, [])
    return []
  }
}

/* PathInput choose: navigate + select destination */
function onChooseDest(pick: { path: string; isDir: boolean }) {
  if (browseMode.value === 'roots') browseMode.value = 'dir'

  const next = pick.isDir ? ensureSlash(pick.path) : ensureSlash(pick.path.replace(/\/[^/]+$/, '') || '/')

  const clamped = clampBase.value ? ensureSlash(toAbsUnder(clampBase.value, next)) : next

  browseCwd.value = clamped
  emit('changed-cwd', browseCwd.value)

  destAbs.value = clamped
  internalDest.value = clamped.replace(/^\/+/, '').replace(/\/+$/, '')
}

/* Navigation from children (double click): navigate + select */
function navigateTo(rel: string) {
  const absLike = ensureSlash('/' + rel.replace(/^\/+/, ''))
  const clamped = clampBase.value ? ensureSlash(toAbsUnder(clampBase.value, absLike)) : absLike

  browseCwd.value = clamped
  emit('changed-cwd', browseCwd.value)

  destAbs.value = clamped
  internalDest.value = clamped.replace(/^\/+/, '').replace(/\/+$/, '')
}

async function togglePath({ path, isDir }: { path: string; isDir: boolean }) {
  if (!isDir) return
  await getFilesForFolder(path)
}

/* New folder modal */
const showNewFolderModal = ref(false)
const newFolderName = ref('')
const newFolderError = ref<string | null>(null)
const folderNameInput = ref<HTMLInputElement | null>(null)

watch(showNewFolderModal, (isOpen) => {
  if (isOpen) {
    nextTick(() => folderNameInput.value?.focus())
  }
})

function createNewFolder() {
  newFolderName.value = ''
  newFolderError.value = null
  showNewFolderModal.value = true
}

async function confirmNewFolder() {
  const name = newFolderName.value.trim()
  if (!name) return

  const current = browseCwd.value.replace(/\/+$/, '')
  const newPath = current + '/' + name

  try {
    const response = await props.apiFetch('/api/mkdir', {
      method: 'POST',
      body: JSON.stringify({ path: newPath }),
    })

    if (response.error) {
      newFolderError.value = response.error
      return
    }

    expandCache.delete(ensureSlash(current))
    if (current === '') expandCache.delete('/')

    refreshKey.value++

    showNewFolderModal.value = false

    // Select the newly created folder (single-click behavior: destination only)
    onSelectFolder(newPath)

    pushNotification(new Notification('New Folder Created', `Folder '${name}' has been created successfully.`, 'success', 8000))
  } catch (e: any) {
    console.error(e)
    newFolderError.value = `API failed: ${e.message || 'Unknown error'}`
  }
}

/* Up clamp */
const canGoUp = computed(() => {
  if (!browseCwd.value || browseCwd.value === '/') return false
  if (!clampBase.value) return browseCwd.value !== '/'
  const base = ensureSlash(clampBase.value)
  return browseCwd.value !== base
})

function parentPath(absLike: string): string {
  const p = (absLike || '/').replace(/\/+$/, '')
  if (!p || p === '/') return '/'
  const parent = p.replace(/\/[^/]*$/, '') || '/'
  return ensureSlash(parent)
}

function goUpOne() {
  const parent = parentPath(browseCwd.value || '/')
  if (clampBase.value) {
    const base = ensureSlash(clampBase.value)
    browseCwd.value = parent.startsWith(base) ? parent : base
  } else {
    browseCwd.value = parent
  }
  emit('changed-cwd', browseCwd.value)

  // keep destination following nav on Up
  destAbs.value = browseCwd.value
  internalDest.value = browseCwd.value.replace(/^\/+/, '').replace(/\/+$/, '')
}

/* Single click selection from children: destination only (no navigation) */
function onSelectFolder(relOrAbs: string) {
  const looksAbs = relOrAbs.startsWith('/')
  const abs = ensureSlash(looksAbs ? relOrAbs : '/' + relOrAbs.replace(/^\/+/, ''))
  const clampedAbs = clampBase.value ? ensureSlash(toAbsUnder(clampBase.value, abs)) : abs

  destAbs.value = clampedAbs
  internalDest.value = clampedAbs.replace(/^\/+/, '').replace(/\/+$/, '')
}

function chooseProject(dirPath: string) {
  const absNoTrail = ensureSlash(dirPath).replace(/\/+$/, '')
  internalProject.value = absNoTrail
  browseMode.value = 'dir'

  browseCwd.value = ensureSlash(absNoTrail)
  emit('changed-cwd', browseCwd.value)

  destAbs.value = browseCwd.value
  internalDest.value = absNoTrail.replace(/^\/+/, '')
}

function changeProject() {
  internalProject.value = ''
  internalDest.value = ''
  browseMode.value = (props.autoDetectRoots ?? true) && !showEntireTree.value ? 'roots' : 'dir'
  browseCwd.value = '/'
  emit('changed-cwd', browseCwd.value)
}

const containerHeights = computed(() => props.heightClass || 'max-h-[28rem] min-h-[18rem]')
</script>
