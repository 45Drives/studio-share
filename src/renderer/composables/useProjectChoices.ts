// src/composables/useProjectChoices.ts
import { ref, computed, type Ref } from 'vue'
import { useApi } from './useApi'

type Root = { name: string; mountpoint: string }
type DirEntry = { name: string; path: string }

// ---- module-level caches (shared across component instances)
let zfsRootsCache: Root[] | null = null
const dirCache = new Map<string, { ts: number; entries: DirEntry[] }>()
const DIR_TTL = 5000 // ms

export function useProjectChoices(showEntireTree: Ref<boolean>) {
    const { apiFetch } = useApi()

    // state
    const detecting = ref(false)
    const detectError = ref<string | null>(null)
    const projectRoots = ref<Root[]>([])
    const projectDirs = ref<DirEntry[]>([])
    const browseMode = ref<'roots' | 'dir'>('roots')
    const currentRoot = ref<string>('')   // active root mountpoint (when restricted)
    const browsePath = ref<string>('')   // current directory path

    // derived
    const canGoUp = computed(() => {
        if (showEntireTree.value) return browsePath.value !== '/'
        if (!currentRoot.value) return false
        return browsePath.value !== currentRoot.value
    })

    // debounce holder
    let listTimer: ReturnType<typeof setTimeout> | null = null

    // List directories for any absolute path with small debounce & caching
    async function listDirs(base: string) {
        if (listTimer) clearTimeout(listTimer)
        detecting.value = true

        await new Promise<void>(resolve => {
            listTimer = setTimeout(() => resolve(), 120)
        })

        try {
            const now = Date.now()
            const cached = dirCache.get(base)
            if (cached && (now - cached.ts) < DIR_TTL) {
                projectDirs.value = cached.entries
                return
            }

            const data = await apiFetch(`/api/files?dir=${encodeURIComponent(base)}&dirsOnly=1`)
            const root = base.endsWith('/') ? base : base + '/'
            const entries: DirEntry[] = (data.entries || [])
                .filter((e: any) => e.isDir)
                .map((e: any) => ({ name: e.name, path: root + e.name }))
                .sort((a: any, b: any) => a.name.localeCompare(b.name))

            projectDirs.value = entries
            dirCache.set(base, { ts: now, entries })
        } catch {
            projectDirs.value = []
            detectError.value = 'Unable to load directories.'
        } finally {
            detecting.value = false
        }
    }

    function backToRoots() {
        browseMode.value = 'roots'
        currentRoot.value = ''
        browsePath.value = ''
        projectDirs.value = []
    }

    function goUp() {
        if (!browsePath.value || browsePath.value === '/') return
        const up = browsePath.value.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '/'
        if (!showEntireTree.value && currentRoot.value && !up.startsWith(currentRoot.value)) {
            browsePath.value = currentRoot.value
        } else {
            browsePath.value = up
        }
        listDirs(browsePath.value)
    }

    function drillInto(p: string) {
        browsePath.value = p
        listDirs(p)
    }

    function openRoot(r: Root) {
        currentRoot.value = r.mountpoint
        browsePath.value = r.mountpoint
        browseMode.value = 'dir'
        listDirs(r.mountpoint)
    }

    /**
     * Main entry: load either ZFS roots or '/' depending on showEntireTree
     * Calls on mount and whenever the checkbox changes.
     */
    async function loadProjectChoices() {
        detecting.value = true
        detectError.value = null
        projectDirs.value = []
        projectRoots.value = []
        currentRoot.value = ''
        browsePath.value = ''

        try {
            if (showEntireTree.value) {
                browseMode.value = 'dir'
                await listDirs('/')
                return
            }

            // serve from cache when possible
            if (zfsRootsCache) {
                projectRoots.value = zfsRootsCache
                browseMode.value = 'roots'
                return
            }

            const roots = await apiFetch('/api/zfs/roots').catch(() => [])
            projectRoots.value = Array.isArray(roots) ? roots : []
            zfsRootsCache = projectRoots.value
            browseMode.value = 'roots'
        } catch {
            detectError.value = 'ZFS detection failed; showing system root.'
            browseMode.value = 'dir'
            await listDirs('/')
        } finally {
            detecting.value = false
        }
    }

    return {
        // state/derived
        detecting, detectError, projectRoots, projectDirs,
        browseMode, currentRoot, browsePath, canGoUp,
        // actions
        listDirs, backToRoots, goUp, drillInto, openRoot, loadProjectChoices,
    }
}
