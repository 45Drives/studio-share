<template>
  <div class="h-full flex items-start justify-center pt-10 overflow-y-auto">
    <div class="w-10/12 mx-auto flex flex-col gap-6">

      <!-- Stepper -->
      <div class="flex items-center gap-3 text-sm justify-center">
        <div :class="stepClass(1)">1</div><span>Select local files</span>
        <div class="h-px w-10 bg-slate-600 mx-2"></div>
        <div :class="stepClass(2)">2</div><span>Choose destination</span>
        <div class="h-px w-10 bg-slate-600 mx-2"></div>
        <div :class="stepClass(3)">3</div><span>Upload</span>
      </div>

      <!-- STEP 1: Local files -->
      <section v-show="step===1" class="flex flex-col gap-4">
        <h2 class="text-xl font-semibold mt-[2rem]">Pick local files</h2>

        <div class="flex items-center gap-2 mt-[2rem]">
          <button class="btn btn-primary" @click="pickFiles">Choose Files</button>
          <button class="btn btn-secondary" @click="pickFolder">Choose Folder</button>
          <span class="text-sm opacity-70">
            {{ selected.length ? `${selected.length} item(s) • ${formatSize(totalSelectedBytes)}` : 'No files selected' }}
          </span>
          <div class="grow"></div>
          <button class="btn btn-secondary" v-if="selected.length" @click="clearSelected">Clear</button>
        </div>

        <div class="border rounded h-[32rem] overflow-auto">
          <div class="grid bg-accent font-semibold border-b border-default
                      [grid-template-columns:minmax(0,1fr)_140px_120px]">
            <div class="px-3 py-2">Name</div>
            <div class="px-3 py-2">Size</div>
            <div class="px-3 py-2 text-right">Action</div>
          </div>

          <div v-if="!selected.length" class="p-6 text-sm opacity-70">
            No files selected. Click <span class="font-medium">Choose Files</span> (you can select multiple),
            or <span class="font-medium">Choose Folder</span> to add its contents.
          </div>

          <div v-else class="divide-y divide-default">
            <div v-for="f in selected" :key="f.path"
                 class="grid items-center [grid-template-columns:minmax(0,1fr)_140px_120px]">
              <div class="px-3 py-2 truncate" :title="f.path">{{ f.name }}</div>
              <div class="px-3 py-2 text-sm opacity-75">{{ formatSize(f.size) }}</div>
              <div class="px-3 py-2 text-right">
                <button class="btn btn-secondary" @click="removeSelected(f)">Remove</button>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end">
          <button class="btn btn-primary" :disabled="!selected.length" @click="goStep(2)">Next</button>
        </div>
      </section>

      <!-- STEP 2: Destination (server) -->
      <section v-show="step===2" class="flex flex-col gap-4">
        <h2 class="text-xl font-semibold mt-[2rem]">Choose destination on server</h2>

        <div class="flex flex-col gap-2 text-sm mt-[2rem]">
          <div class="opacity-80">Pick the folder on the server where these files will be uploaded.</div>
          <div class="flex flex-row gap-2 items-center">
            <span class="whitespace-nowrap">Destination folder:</span>
            <PathInput v-model="cwd" :apiFetch="apiFetch" :dirsOnly="true" @choose="onChoose" />
          </div>
        </div>

        <div class="border rounded overflow-auto max-h-[28rem] min-h-[18rem]">
          <div class="sticky top-0 bg-default border-b border-default px-2 py-1 flex items-center gap-2">
    <button class="btn btn-secondary"
            :disabled="!canGoUp"
            @click="goUpOne">
       <FontAwesomeIcon :icon="faArrowLeft" />
    </button>
    <div class="text-xs opacity-75 truncate" :title="cwd">
      {{ cwd || '/' }}
    </div>
  </div>
          <div class="grid sticky top-0 bg-accent font-semibold border-b border-default
                      [grid-template-columns:40px_minmax(0,1fr)_120px_110px_180px]">
            <div class="px-2 py-2 text-center"></div>
            <div class="px-2 py-2">Name</div>
            <div class="px-2 py-2">Type</div>
            <div class="px-2 py-2">Size</div>
            <div class="px-2 py-2">Modified</div>
          </div>
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

        <div class="flex justify-between">
          <button class="btn btn-secondary" @click="goStep(1)">Back</button>
          <button class="btn btn-primary" :disabled="!canNext" @click="goStep(3)">Next</button>
        </div>
      </section>

      <!-- STEP 3: Upload progress -->
      <section v-show="step===3" class="flex flex-col gap-4">
        <h2 class="text-xl font-semibold">
           Uploading to {{ destDir || '/' }}
          </h2>

  <!-- Show what will be uploaded -->
<!-- Table -->
<div class="border rounded">
  <!-- Header -->
  <div
    class="grid bg-accent font-semibold border-b border-default
           [grid-template-columns:minmax(0,1fr)_140px_100px_120px]"
  >
    <div class="px-3 py-2">Name</div>
    <div class="px-3 py-2">Size</div>
    <div class="px-3 py-2">Status</div>
    <div class="px-3 py-2 text-right">Action</div>
  </div>

  <!-- Empty state -->
  <div v-if="!uploads.length" class="p-4 text-sm opacity-70">
    Ready to start. Click <b>Start Upload</b>.
  </div>

  <!-- Rows -->
  <div v-else class="divide-y divide-default">
    <div
      v-for="u in uploads"
      :key="u.localKey"
      class="grid items-center gap-2 p-3
             [grid-template-columns:minmax(0,1fr)_140px_100px_120px]"
    >
      <!-- Name -->
      <div class="min-w-0 px-0">
        <div class="truncate font-medium" :title="u.path">{{ u.name }}</div>
        <div class="text-xs opacity-70">
          <template v-if="u.status === 'uploading'">
            {{ Number.isFinite(u.progress) ? u.progress.toFixed(0) : 0 }}%
            <span v-if="u.speed"> • {{ u.speed }}</span>
            <span v-if="u.eta"> • ETA {{ u.eta }}</span>
          </template>
          <template v-else>
            {{ u.status }}
          </template>
        </div>
      </div>

      <!-- Size -->
      <div class="text-sm opacity-80">
        {{ formatSize(u.size) }}
      </div>

      <!-- Status -->
      <div class="text-sm">
        <template v-if="u.status === 'uploading'">Uploading</template>
        <template v-else>{{ u.status }}</template>
      </div>

      <!-- Action -->
      <div class="text-right">
        <button
          class="btn btn-secondary"
          @click="cancelOne(u)"
          :disabled="u.status !== 'uploading'"
          title="Cancel this upload"
        >
          Cancel
        </button>
      </div>

      <progress
  class="col-start-1 col-span-3 w-full mt-2 h-2 rounded-lg overflow-hidden
         accent-[#584c91]
         [&::-webkit-progress-value]:bg-[#584c91]
         [&::-moz-progress-bar]:bg-[#584c91]"
  :value="Number.isFinite(u.progress) ? u.progress : 0"
  max="100"
  v-show="u.status === 'uploading'"
></progress>

      <!-- Error spans all cols -->
      <div v-if="u.error" class="text-xs text-red-400 mt-1 col-span-4">
        {{ u.error }}
      </div>
    </div>
  </div>
</div>


  <div class="flex justify-between">
    <button class="btn btn-secondary" @click="goStep(2)">Back</button>
    <div class="flex gap-2">
      <button class="btn btn-secondary" :disabled="!uploads.length" @click="cancelAll">Cancel All</button>
      <button class="btn btn-primary" :disabled="isUploading" @click="startUploads">Start Upload</button>
      <button class="btn btn-primary" :disabled="!allDone" @click="finish">Finish</button>
    </div>
  </div>
</section>


    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch } from 'vue'
import PathInput from '../components/PathInput.vue'
import TreeNode from '../components/TreeNode.vue'
import { useApi } from '../composables/useApi'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faArrowLeft  } from '@fortawesome/free-solid-svg-icons';
import { connectionMetaInjectionKey } from '../keys/injection-keys';
import { useHeader } from '../composables/useHeader';

useHeader('Upload Files')

type LocalFile = { path: string; name: string; size: number }



const connectionMeta = inject(connectionMetaInjectionKey)!;
const ssh = connectionMeta.value.ssh
const isUploading = ref(false)

const { apiFetch } = useApi()
/** ── Step control ───────────────────────────────────────── */
const step = ref<1|2|3>(1)
  function goStep(s: 1|2|3) {
  step.value = s
  if (s === 3) {
    // build rows for review
    uploads.value = prepareRows()
  }
}
function stepClass(n: number) {
  return [
    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
    step.value >= n ? 'bg-[#584c91] text-white' : 'bg-slate-700 text-slate-300'
  ].join(' ')
}

/** ── Step 1: local files ───────────────────────────────── */
const selected = ref<LocalFile[]>([])
function addToSelection(files?: LocalFile[]) {
  const seen = new Set(selected.value.map(f => f.path))
  const append: LocalFile[] = []
  for (const f of (files || [])) if (!seen.has(f.path)) { append.push(f); seen.add(f.path) }
  if (append.length) selected.value = [...selected.value, ...append]
}
function pickFiles () { window.electron.pickFiles().then(addToSelection) }
function pickFolder () { window.electron.pickFolder().then(addToSelection) }
function removeSelected(file: LocalFile) { selected.value = selected.value.filter(f => f.path !== file.path) }
function clearSelected(){ selected.value = [] }

const totalSelectedBytes = computed(() =>
  selected.value.reduce((sum, f) => sum + (f.size || 0), 0)
)
function formatSize(size: number) {
  const u = ['B','KB','MB','GB','TB']
  let i=0; let v=size
  while(v>=1024&&i<u.length-1){ v/=1024; i++ }
  return `${v.toFixed(v<10&&i>0?1:0)} ${u[i]}`
}

/** ── Step 2: destination (server) ──────────────────────── */
const cwd = ref<string>('') // shown to user ("/…/")
const rootRel = computed(() =>
  (cwd.value || '').replace(/^\/+/, '').replace(/\/+$/, '')
)
const destDir = computed(() => cwd.value) // alias used in UI

const internalSelected = ref<Set<string>>(new Set())
const selectedVersion = ref(0)
const expandCache = new Map<string, string[]>()

async function getFilesForFolder(folder: string): Promise<string[]> {
  if (expandCache.has(folder)) return expandCache.get(folder)!
  try {
    const resp = await apiFetch('/api/expand-paths', { method: 'POST', body: JSON.stringify({ paths: [folder] }) })
    const files: string[] = resp.files || []
    expandCache.set(folder, files); return files
  } catch { expandCache.set(folder, []); return [] }
}
function onChoose(pick: { path: string; isDir: boolean }) {
  if (pick.isDir) {
    cwd.value = pick.path.endsWith('/') ? pick.path : (pick.path + '/')
  } else {
    const parent = pick.path.replace(/\/[^/]+$/, '') || '/'
    cwd.value = parent.endsWith('/') ? parent : (parent + '/')
  }
}
function navigateTo(rel: string) {
  const absLike = '/' + rel.replace(/^\/+/, '')
  cwd.value = absLike.endsWith('/') ? absLike : (absLike + '/')
}
type TogglePayload = { path: string; isDir: boolean }
async function togglePath({ path, isDir }: TogglePayload) {
  if (!isDir) return
  // For destination picking we don't need multi-file select; just expand
  await getFilesForFolder(path)
}
function clearTreeCache(){ expandCache.clear(); selectedVersion.value++ }

/** ── Step 3: upload & progress ─────────────────────────── */


function finish() {
  // Reset the wizard (or route away)
  selected.value = []
  uploads.value = []
  cwd.value = '/'
  isUploading.value = false
  

  clearTreeCache()
  goStep(1)
}

const destFolderRel = ref<string>('')

function onSelectFolder(rel: string) {
  destFolderRel.value = rel
  // optionally reflect into cwd:
  const abs = '/' + rel.replace(/^\/+/, '')
  cwd.value = abs.endsWith('/') ? abs : abs + '/'
}

const canNext = computed(() => !!destFolderRel.value)

function parentPath(absLike: string): string {
  const p = (absLike || '/').replace(/\/+$/, '')   // trim trailing
  if (!p || p === '/') return '/'
  const parent = p.replace(/\/[^/]*$/, '') || '/'
  return parent.endsWith('/') ? parent : parent + '/'
}

const canGoUp = computed(() => (cwd.value && cwd.value !== '/' && cwd.value !== ''))
function goUpOne() {
  const parent = parentPath(cwd.value || '/')
  cwd.value = parent
}

// When you enter step 3, seed the rows once:
watch(step, (s) => {
  if (s === 3 && uploads.value.length === 0) {
    uploads.value = prepareRows()
  }
})


// ----- TYPES -----
type UploadRow = {
  localKey: string
  path: string
  name: string
  size: number
  rsyncId?: string
  status: 'queued' | 'uploading' | 'done' | 'canceled' | 'error'
  error: string | null
  progress: number
  speed: string | null
  eta: string | null
}

const uploads = ref<UploadRow[]>([])
// from step 1
const serverPort = 22
const privateKeyPath = undefined // or "~/.ssh/id_ed25519"

// Make rows once when entering Step 3
function prepareRows(): UploadRow[] {
  return selected.value.map(f => ({
    localKey: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
    path: f.path,
    name: f.name,
    size: f.size,
    rsyncId: null,
    progress: 0,
    status: 'queued',
    error: null,
    speed: null,
    eta: null,
  }))
}
function updateRowProgress(row: UploadRow, p?: number, speed?: string, eta?: string) {
  // Coalesce many rsync ticks into one animation frame update
  const prev = rafState.get(row.localKey) || {
    p: typeof row.progress === 'number' ? row.progress : undefined,
    speed: row.speed,
    eta: row.eta,
    scheduled: 0 as number | 0,
  };

  // Only update fields we actually received
  if (typeof p === 'number' && !Number.isNaN(p)) {
    prev.p = Math.max(0, Math.min(100, p));
  }
  if (typeof speed === 'string') prev.speed = speed;
  if (typeof eta === 'string') prev.eta = eta;

  if (!prev.scheduled) {
    prev.scheduled = requestAnimationFrame(() => {
      if (typeof prev.p === 'number') row.progress = prev.p;
      if (typeof prev.speed !== 'undefined') row.speed = prev.speed;
      if (typeof prev.eta !== 'undefined') row.eta = prev.eta;
      prev.scheduled = 0;
    });
  }

  rafState.set(row.localKey, prev);
}

const rafState = new Map<string, { p?: number; speed?: string; eta?: string; scheduled?: number }>();
  async function startUploads() {
  if (!uploads.value.length) uploads.value = prepareRows();

  for (const row of uploads.value) {
    if (row.status !== 'queued') continue;
    row.status = 'uploading';
    isUploading.value = true

    const { id, done } = await window.electron.rsyncStart(
      {
        host: ssh?.server,
        user: ssh?.username,
        src: row.path,
        destDir: `/${destFolderRel.value.replace(/^\/+/, '')}`,
        port: serverPort,
        keyPath: privateKeyPath,
      },
      p => {
        console.log('rsync progress', row.name, p);
        console.log("typeof",typeof p.percent, p.bytesTransferred, row.size);
        let pct: number | undefined =
    typeof p.percent === 'number' && !Number.isNaN(p.percent) ? p.percent : undefined;

  // Fallback: compute from bytesTransferred if present
  if (pct === undefined && typeof p.bytesTransferred === 'number' && row.size > 0) {
    pct = (p.bytesTransferred / row.size) * 100;
  }

  // Optional: parse from raw line if library sometimes only gives raw text
  if (pct === undefined && typeof p.raw === 'string') {
    const m = p.raw.match(/(\d+(?:\.\d+)?)%/);
    if (m) pct = parseFloat(m[1]);
  }

  updateRowProgress(row, pct, p.rate, p.eta);
      }
    );

    row.rsyncId = id;

    done.then(res => {
      if ((res as any).ok) {
        row.status = row.status === 'canceled' ? 'canceled' : 'done';
        row.progress = 100;
      } else if (row.status !== 'canceled') {
        row.status = 'error';
        row.error = (res as any).error || 'rsync failed';
      }
    }).catch(err => {
      isUploading.value = false
      if (row.status !== 'canceled') {
        row.status = 'error';
        row.error = err?.message || String(err);
      }
    });
  }
}

function cancelOne(row: UploadRow) {
  if (!row.rsyncId) return
  window.electron.rsyncCancel(row.rsyncId)
  row.status = 'canceled'
}

function cancelAll() {
  for (const r of uploads.value) {
    if (r.rsyncId && r.status === 'uploading') {
      window.electron.rsyncCancel(r.rsyncId)
      r.status = 'canceled'
    }
  }
}

const allDone = computed(() =>
  uploads.value.length > 0 &&
  uploads.value.every(u => u.status === 'done' || u.status === 'canceled')
)

</script>

<style scoped>
.btn { @apply px-3 py-1 rounded bg-slate-700 hover:bg-slate-600; }
.btn-primary { @apply bg-blue-600 hover:bg-blue-500; }
.btn-secondary { @apply bg-slate-700 hover:bg-slate-600; }
</style>
