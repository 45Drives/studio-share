<template>
  <section class="flex flex-col gap-2 text-left text-base">
    <h2 v-if="title" class=" font-semibold">{{ title }}</h2>

    <div class="flex flex-col gap-2 text-sm">
      <div v-if="subtitle" class="opacity-80">{{ subtitle }}</div>
      <div class="flex flex-row gap-2 items-center">
        <span class="whitespace-nowrap">Destination folder:</span>
        <PathInput v-model="cwd" :apiFetch="apiFetch" :dirsOnly="true" @choose="onChoose" />
      </div>
    </div>

    <div class="border rounded overflow-auto" :class="containerHeights">
      <!-- Toolbar / breadcrumb -->
      <div class="sticky top-0 bg-default border-b border-default px-2 py-1 flex items-center gap-2">
        <button class="btn btn-secondary" :disabled="!canGoUp" @click="goUpOne" title="Go up one directory">
          <FontAwesomeIcon :icon="faArrowLeft" />
        </button>
        <div class="text-xs opacity-75 truncate" :title="cwd">{{ cwd || '/' }}</div>
      </div>

      <!-- Column headers -->
      <div
        class="grid sticky top-0 bg-accent font-semibold border-b border-default [grid-template-columns:40px_minmax(0,1fr)_120px_110px_180px]">
        <div class="px-2 py-2 text-center"></div>
        <div class="px-2 py-2">Name</div>
        <div class="px-2 py-2">Type</div>
        <div class="px-2 py-2">Size</div>
        <div class="px-2 py-2">Modified</div>
      </div>

      <!-- Tree -->
      <TreeNode :key="cwd" :apiFetch="apiFetch" :selected="internalSelected" :selectedVersion="selectedVersion"
        :getFilesFor="getFilesForFolder" :relPath="rootRel" :depth="0" :isRoot="true" :useCase="useCase"
        :selectedFolder="modelValue" @select-folder="onSelectFolder" @toggle="togglePath" @navigate="navigateTo" />
    </div>

    <div v-if="showSelection" class="flex items-center gap-4">
      <div class="text-sm">
        <span class="opacity-80">Selected folder: </span>
        <span class="font-mono">{{ selectedAbs || '—' }}</span>
      </div>
      <div class="grow"></div>
      <button class="btn btn-secondary" @click="clearTreeCache">Refresh</button>
    </div>
  </section>
</template>
  
  <script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
  import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
  import PathInput from './PathInput.vue'
  import TreeNode from './TreeNode.vue'
  
  // Props / Emits
  const props = defineProps<{
    modelValue: string
    apiFetch: (url: string, init?: RequestInit) => Promise<any>
    useCase?: 'upload' | 'share'
    title?: string
    subtitle?: string
    initialCwd?: string
    showSelection?: boolean
    heightClass?: string
  }>()
  
  const emit = defineEmits<{
    (e: 'update:modelValue', v: string): void
    (e: 'changed-cwd', v: string): void
  }>()
  
  // State
  const cwd = ref<string>(props.initialCwd ?? '/')
  const rootRel = computed(() => (cwd.value || '').replace(/^\/+/, '').replace(/\/+$/, ''))
  const internalSelected = ref<Set<string>>(new Set())
  const selectedVersion = ref(0)
  const expandCache = new Map<string, string[]>()
  
  const selectedAbs = computed(() => {
    if (!props.modelValue) return ''
    const abs = '/' + props.modelValue.replace(/^\/+/, '')
    return abs.endsWith('/') ? abs : abs + '/'
  })
  
  const containerHeights = computed(() => props.heightClass || 'max-h-[28rem] min-h-[18rem]')
  
  // Tree helpers
  async function getFilesForFolder(folder: string): Promise<string[]> {
    if (expandCache.has(folder)) return expandCache.get(folder)!
    try {
      const resp = await props.apiFetch('/api/expand-paths', { method: 'POST', body: JSON.stringify({ paths: [folder] }) })
      const files: string[] = resp.files || []
      expandCache.set(folder, files)
      return files
    } catch {
      expandCache.set(folder, [])
      return []
    }
  }
  
  function onChoose(pick: { path: string; isDir: boolean }) {
    if (pick.isDir) {
      cwd.value = pick.path.endsWith('/') ? pick.path : pick.path + '/'
    } else {
      const parent = pick.path.replace(/\/[^/]+$/, '') || '/'
      cwd.value = parent.endsWith('/') ? parent : parent + '/'
    }
    emit('changed-cwd', cwd.value)
  }
  
  function navigateTo(rel: string) {
    const absLike = '/' + rel.replace(/^\/+/, '')
    cwd.value = absLike.endsWith('/') ? absLike : absLike + '/'
    emit('changed-cwd', cwd.value)
  }
  
  async function togglePath({ path, isDir }: { path: string; isDir: boolean }) {
    if (!isDir) return
    await getFilesForFolder(path)
  }
  
  function clearTreeCache() { expandCache.clear(); selectedVersion.value++ }
  
  const canGoUp = computed(() => cwd.value && cwd.value !== '/' && cwd.value !== '')
  function parentPath(absLike: string): string {
    const p = (absLike || '/').replace(/\/+$/, '')
    if (!p || p === '/') return '/'
    const parent = p.replace(/\/[^/]*$/, '') || '/'
    return parent.endsWith('/') ? parent : parent + '/'
  }
  function goUpOne() { cwd.value = parentPath(cwd.value || '/'); emit('changed-cwd', cwd.value) }
  
  function onSelectFolder(rel: string) {
    const normalized = rel.replace(/^\/+/, '')
    emit('update:modelValue', normalized)
    // also reflect into cwd for visual breadcrumb sync
    const abs = '/' + normalized
    cwd.value = abs.endsWith('/') ? abs : abs + '/'
    emit('changed-cwd', cwd.value)
  }
  
  watch(() => props.initialCwd, (v) => { if (typeof v === 'string') cwd.value = v })
  
  </script>
  