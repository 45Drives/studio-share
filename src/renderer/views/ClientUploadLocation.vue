<template>
    <div class="h-full flex items-start justify-center pt-10 overflow-y-auto">
      <div class="w-10/12 mx-auto flex flex-col gap-6">
        <!-- Heading -->
        <header class="flex items-center justify-between">
          <h1 class="text-2xl font-semibold">Share a Folder</h1>
          <div class="text-sm opacity-70">Pick a folder on the server and generate a shareable link.</div>
        </header>
  
        <!-- DESTINATION PICKER -->
        <!-- <FolderPicker
        v-model="destFolderRel"
        :apiFetch="apiFetch"
        useCase="upload"
        title="Choose destination on server"
        subtitle="Pick the folder on the server where these files will be uploaded."
        @changed-cwd="val => (cwd = val)"
      /> -->
      <IconMode
  :key="cwd"
  :apiFetch="apiFetch"
  :selected="internalSelected"
  :selectedVersion="selectedVersion"
  :getFilesFor="getFilesForFolder"
  :relPath="rootRel"
  :depth="0"
  v-model:selectedFolder="destFolder"
  useCase="upload"
  :isRoot="true"
  @select-folder="onSelectFolder"
  @toggle="togglePath"
  @navigate="navigateTo"
/>
  
        <!-- OPTIONS -->
        <section class="flex flex-col gap-4">
          <h2 class="text-xl font-semibold">Share options</h2>
          <div class="grid gap-3 md:grid-cols-2">
            <label class="flex flex-col gap-1 text-sm">
              <span class="opacity-80">Expiration</span>
              <select v-model="expiresIn" class="px-2 py-1 rounded bg-slate-800 border border-slate-600">
                <option :value="86400">24 hours</option>
                <option :value="604800">7 days</option>
                <option :value="2592000">30 days</option>
                <option :value="0">No expiry</option>
              </select>
            </label>
  
            <label class="flex flex-col gap-1 text-sm">
              <span class="opacity-80">Password (optional)</span>
              <input v-model.trim="password" type="text" placeholder="Leave blank for none"
                     class="px-2 py-1 rounded bg-slate-800 border border-slate-600" />
            </label>
  
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" v-model="allowUpload" />
              <span>Allow clients to upload into this folder</span>
            </label>
  
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" v-model="readOnly" />
              <span>Read-only (ignore upload permission)</span>
            </label>
          </div>
        </section>
  
        <!-- ACTIONS -->
        <section class="flex items-center justify-between">
          <div class="text-sm opacity-70">After generating, copy the link and send it to your clients.</div>
          <div class="flex gap-2">
            <button class="btn btn-secondary" :disabled="loading" @click="resetAll">Reset</button>
            <button class="btn btn-primary" :disabled="!canGenerate || loading" @click="generateLink">
              {{ loading ? 'Generating…' : 'Generate Link' }}
            </button>
          </div>
        </section>
  
        <!-- RESULT -->
        <section v-if="result" class="border rounded p-4 bg-slate-900/40">
          <div class="flex items-start gap-3">
            <div class="grow">
              <div class="text-sm opacity-80">Share link</div>
              <div class="font-mono break-all">{{ result.url }}</div>
              <div v-if="result.expiresAt" class="text-xs opacity-60 mt-1">Expires at: {{ fmtDate(result.expiresAt) }}</div>
              <div v-if="result.code" class="text-xs opacity-60">Code: {{ result.code }}</div>
              <div v-if="result.password" class="text-xs opacity-60">Password required</div>
            </div>
            <div class="flex flex-col gap-2">
              <button class="btn btn-secondary" @click="copy(result.url)">Copy</button>
              <a class="btn btn-primary text-center" :href="result.url" target="_blank" rel="noreferrer">Open</a>
            </div>
          </div>
          <div v-if="error" class="text-red-400 text-sm mt-2">{{ error }}</div>
        </section>
      </div>
    </div>
</template>
  
  <script setup lang="ts">
  import { ref, computed, inject, Ref } from 'vue'
  import { useApi } from '../composables/useApi'
  import { connectionMetaInjectionKey } from '../keys/injection-keys'
  import IconMode from '../components/IconMode.vue'
  
  // --- Injections / API ---
  const { apiFetch } = useApi()
  
  // --- Tree / folder selection ---
  const cwd = ref<string>('')
  const rootRel = computed(() => (cwd.value || '').replace(/^\/+/, '').replace(/\/+$/, ''))
  const internalSelected = ref<Set<string>>(new Set())
  const selectedVersion = ref(0)
  const expandCache = new Map<string, string[]>()
  const destFolderRel = ref<string>('')
  
  const selectedAbs = computed(() => {
    if (!destFolderRel.value) return ''
    const abs = '/' + destFolderRel.value.replace(/^\/+/, '')
    return abs.endsWith('/') ? abs : abs + '/'
  })
  
  async function getFilesForFolder(folder: string): Promise<string[]> {
    if (expandCache.has(folder)) return expandCache.get(folder)!
    try {
      const resp = await apiFetch('/api/expand-paths', { method: 'POST', body: JSON.stringify({ paths: [folder] }) })
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
  }
  
  function navigateTo(rel: string) {
    const absLike = '/' + rel.replace(/^\/+/, '')
    cwd.value = absLike.endsWith('/') ? absLike : absLike + '/'
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
  function goUpOne() { cwd.value = parentPath(cwd.value || '/') }
  
  function onSelectFolder(rel: string) {
    destFolderRel.value = rel
    const abs = '/' + rel.replace(/^\/+/, '')
    cwd.value = abs.endsWith('/') ? abs : abs + '/'
  }
  
  // --- Share options ---
  const expiresIn = ref<number>(604800) // default 7 days in seconds
  const password = ref<string>('')
  const allowUpload = ref<boolean>(true)
  const readOnly = ref<boolean>(false)
  
  // --- Generate link ---
  const loading = ref(false)
  const error = ref<string | null>(null)
  const result = ref<null | { url: string; code?: string; password?: boolean; expiresAt?: string }>(null)
  
  const canGenerate = computed(() => !!destFolderRel.value)
  
  async function generateLink() {
    if (!canGenerate.value) return
    loading.value = true
    error.value = null
    result.value = null
    try {
      const body: any = {
        path: '/' + destFolderRel.value.replace(/^\/+/, ''),
        kind: 'folder',
        allowUpload: readOnly.value ? false : !!allowUpload.value,
        expiresIn: Number(expiresIn.value) || 0,
      }
      if (password.value) body.password = password.value
  
      // POST to your API that creates a magic link for a folder
      // Expected response shape: { url: string, code?: string, expiresAt?: string }
      const resp = await apiFetch('/api/create-upload-link', {
        method: 'POST',
        body: JSON.stringify(body),
      })
  
      if (!resp || !resp.url) throw new Error(resp?.error || 'Failed to create link')
  
      result.value = {
        url: resp.url,
        code: resp.code,
        password: !!password.value,
        expiresAt: resp.expiresAt,
      }
    } catch (e: any) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  }
  
  function resetAll() {
    destFolderRel.value = ''
    cwd.value = '/'
    expiresIn.value = 604800
    password.value = ''
    allowUpload.value = true
    readOnly.value = false
    result.value = null
    error.value = null
    clearTreeCache()
  }
  
  function copy(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {})
  }
  
  function fmtDate(iso?: string) {
    if (!iso) return ''
    try { return new Date(iso).toLocaleString() } catch { return iso }
  }
  </script>
  
  <style scoped>
  .btn { @apply px-3 py-1 rounded bg-slate-700 hover:bg-slate-600; }
  .btn-primary { @apply bg-blue-600 hover:bg-blue-500; }
  .btn-secondary { @apply bg-slate-700 hover:bg-slate-600; }
  </style>
  