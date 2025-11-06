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
        <!-- Small toolbar: List / Grid toggle -->
        <div class="sticky top-0 bg-default border-b border-default px-2 py-1 flex items-center gap-2 z-10" >
          <div class="text-xs opacity-75 truncate" :title="cwd">Showing: {{ cwd || '/' }}</div>
          <div class="ml-auto flex items-center">
            <button
              type="button"
              class="px-2 py-1 text-xs hover:bg-white/5"
              :class="viewMode === 'list' ? 'bg-white/10' : ''"
              :aria-pressed="viewMode === 'list'"
              title="List view"
              @click="viewMode = 'list'">
              List
            </button>
            <button
              type="button"
              class="px-2 py-1 text-xs border-l border-default hover:bg-white/5"
              :class="viewMode === 'grid' ? 'bg-white/10' : ''"
              :aria-pressed="viewMode === 'grid'"
              title="Grid view"
              @click="viewMode = 'grid'">
              Grid
            </button>
          </div>
        </div>
  
        <!-- Body -->
        <div>
          <!-- List view -->
          <template v-if="viewMode === 'list'">
            <TreeNode
              :key="'list-'+cwd"
              :apiFetch="apiFetch"
              :selected="internalSelected"
              :selectedVersion="selectedVersion"
              :getFilesFor="getFilesForFolder"
              :relPath="rootRel"
              :depth="0"
              :isRoot="true"
              useCase="share"
              @toggle="togglePath"
              @navigate="navigateTo"
            />
          </template>
  
          <!-- Grid view -->
          <template v-else>
            <IconMode
              :key="'grid-'+cwd"
              :apiFetch="apiFetch"
              :selected="internalSelected"
              :selectedVersion="selectedVersion"
              :getFilesFor="getFilesForFolder"
              :relPath="rootRel"
              :depth="0"
              :isRoot="true"
              useCase="share"
              @toggle="togglePath"
              @navigate="navigateTo"
            />
          </template>
        </div>
      </div>
  
      <!-- Actions -->
      <div class="flex items-center gap-2">
        <button class="btn btn-primary" :disabled="!internalSelected.size" @click="emitSelection">
          Add {{ internalSelected.size }} selected
        </button>
        <button class="btn btn-secondary" :disabled="!internalSelected.size" @click="clearSelection">Clear</button>
        <div class="grow"></div>
      </div>
    </div>
</template>
  
  <script setup lang="ts">
  import { ref, computed, onMounted, watch } from 'vue'
  import PathInput from './PathInput.vue'
  import TreeNode from './TreeNode.vue'
  import IconMode from './IconMode.vue'
  
  const props = defineProps<{
    apiFetch: (url: string, init?: any) => Promise<any>,
    startDir?: string,
    modelValue?: string[] // existing selection passed in (if any)
  }>()
  
  const emit = defineEmits<{
    (e: 'add', paths: string[]): void
    (e: 'update:modelValue', v: string[]): void
  }>()
  
  const apiFetch = props.apiFetch
  
  function normDir(p?: string) {
    if (!p) return ''
    return p.endsWith('/') ? p : (p + '/')
  }
  
  const cwd = ref<string>('') // drives what TreeNode/IconMode show
  onMounted(() => {
    if (props.startDir) cwd.value = normDir(props.startDir)
  })
  
  // keep cwd in sync if parent changes it
  watch(() => props.startDir, (v) => { cwd.value = normDir(v) })
  
  const rootRel = computed(() =>
    (cwd.value || '/').replace(/\/+$/, '') // keep leading slash; trim trailing
  )
  
  const internalSelected = ref<Set<string>>(new Set())
  const selectedVersion = ref(0)
  
  // ---------- View mode toggle (persisted) ----------
  type ViewMode = 'list' | 'grid'
  const VIEW_KEY = 'sharepicker:viewMode'
  const viewMode = ref<ViewMode>('grid')
  
  onMounted(() => {
    const saved = localStorage.getItem(VIEW_KEY) as ViewMode | null
    if (saved === 'list' || saved === 'grid') viewMode.value = saved
  })
  watch(viewMode, m => localStorage.setItem(VIEW_KEY, m))
  
  // ---------- Expand cache ----------
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
  
  // ---------- Selection helpers ----------
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
  
  // ---------- Navigation ----------
  function onChoose(pick: { path: string; isDir: boolean }) {
    // PathInput "choose" means explicit navigation
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
  
  // ---------- Emit selection to parent ----------
  async function emitSelection() {
    const selected = Array.from(internalSelected.value)
    if (!selected.length) return
    const already = new Set(props.modelValue || [])
    const uniq: string[] = []
    for (const p of selected) if (!already.has(p)) uniq.push(p)
    if (uniq.length) emit('add', uniq)
  }
  </script>
  