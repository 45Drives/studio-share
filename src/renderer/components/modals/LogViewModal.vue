<template>
  <div class="fixed inset-0 z-[2100]">
    <div class="absolute inset-0 bg-black/60" @click="close" />

    <div class="absolute inset-0 flex items-center justify-center p-4">
      <div class="w-full max-w-7xl max-h-[calc(100vh-2rem)] rounded-lg border border-default bg-default shadow-2xl flex flex-col">
        <CardContainer class="flex-1 min-h-0 overflow-y-auto w-full bg-accent rounded-md shadow-xl min-w-0">
          <template #header>
            <div class="flex items-center justify-between px-6 py-4 shrink-0">
              <div>
                <div class="text-xl font-semibold text-default text-left">Client Log Viewer</div>
                <div class="text-xs text-muted mt-1">Showing parsed entries from the local app log file.</div>
              </div>
              <div class="flex items-center gap-2">
                <button class="btn btn-secondary" type="button" @click="refresh" :disabled="loading">
                  {{ loading ? 'Refreshing…' : 'Refresh' }}
                </button>
                <button class="btn btn-secondary" type="button" @click="close">
                  Close
                </button>
              </div>
            </div>
          </template>

          <div class="px-6 pb-4 text-left min-h-0">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Log file</div>
                <div class="text-sm font-mono break-all">{{ meta.file || 'n/a' }}</div>
              </div>
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Directory</div>
                <div class="text-sm font-mono break-all">{{ meta.logDir || 'n/a' }}</div>
              </div>
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Entries loaded</div>
                <div class="text-sm font-semibold">{{ entries.length }}</div>
              </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Errors</div>
                <div class="text-lg font-semibold text-red-400">{{ counts.error }}</div>
              </div>
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Warnings</div>
                <div class="text-lg font-semibold text-amber-400">{{ counts.warn }}</div>
              </div>
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Info</div>
                <div class="text-lg font-semibold">{{ counts.info }}</div>
              </div>
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Debug</div>
                <div class="text-lg font-semibold">{{ counts.debug }}</div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 mb-4">
              <input
                v-model.trim="search"
                type="search"
                placeholder="Search event, summary, details..."
                class="input-textlike px-3 py-2 border border-default rounded-lg bg-default text-default min-w-[280px]"
              />
              <select v-model="levelFilter" class="px-3 py-2 border border-default rounded-lg bg-default">
                <option value="">All levels</option>
                <option value="error">Error</option>
                <option value="warn">Warn</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </select>
              <label class="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" v-model="errorsOnly" />
                <span>Errors/warnings only</span>
              </label>
              <label class="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" v-model="groupRelated" />
                <span>Group related events</span>
              </label>
            </div>

            <div v-if="error" class="p-3 rounded bg-red-900/20 border border-red-800 text-sm mb-3">
              {{ error }}
            </div>

            <div class="overflow-x-auto border border-default rounded-md">
              <table class="min-w-full text-sm border-collapse">
                <thead class="bg-default border-b border-default">
                  <tr>
                    <th class="p-2 text-left border-r border-default">Time</th>
                    <th class="p-2 text-left border-r border-default">Level</th>
                    <th class="p-2 text-left border-r border-default">Event</th>
                    <th class="p-2 text-left">Summary</th>
                  </tr>
                </thead>
                <tbody class="bg-accent">
                  <tr v-if="loading">
                    <td colspan="4" class="p-4 text-center">Loading logs…</td>
                  </tr>
                  <tr v-else-if="displayRows.length === 0">
                    <td colspan="4" class="p-4 text-center">No matching log entries.</td>
                  </tr>
                  <tr
                    v-else
                    v-for="row in displayRows"
                    :key="row.id"
                    class="border-b border-default align-top"
                    :class="{
                      'bg-red-900/10': row.level === 'error',
                      'bg-amber-900/10': row.level === 'warn',
                    }"
                  >
                    <td class="p-2 border-r border-default whitespace-nowrap">{{ formatTs(row.timestamp) }}</td>
                    <td class="p-2 border-r border-default whitespace-nowrap uppercase">{{ row.level }}</td>
                    <td class="p-2 border-r border-default font-mono">{{ row.event }}</td>
                    <td class="p-2">
                      <div>{{ row.summary }}</div>
                      <details v-if="row.details || (row.children && row.children.length)" class="mt-1">
                        <summary class="cursor-pointer text-xs text-muted">Details</summary>
                        <div v-if="row.children && row.children.length" class="mt-1 space-y-1">
                          <div v-for="child in row.children" :key="child.id" class="text-xs">
                            <span class="text-muted">{{ formatTs(child.timestamp) }}</span>
                            <span class="font-mono ml-2">{{ child.event }}</span>
                            <span class="ml-2">{{ child.summary }}</span>
                          </div>
                        </div>
                        <pre v-if="row.details" class="mt-1 text-xs whitespace-pre-wrap break-words">{{ row.details }}</pre>
                      </details>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </CardContainer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CardContainer } from "@45drives/houston-common-ui";
import { computed, onMounted, ref } from "vue";

type ParsedLogEntry = {
  id: string;
  timestamp: string;
  level: string;
  event: string;
  summary: string;
  details?: string;
  data?: Record<string, any>;
};

type DisplayRow = {
  id: string;
  timestamp: string;
  level: string;
  event: string;
  summary: string;
  details?: string;
  children?: ParsedLogEntry[];
};

const emit = defineEmits<{
  (e: "close"): void;
}>();

const loading = ref(false);
const error = ref<string | null>(null);
const entries = ref<ParsedLogEntry[]>([]);
const meta = ref<{ file: string; logDir: string }>({ file: "", logDir: "" });

const search = ref("");
const levelFilter = ref("");
const errorsOnly = ref(true);
const groupRelated = ref(true);

const counts = computed(() => {
  const out = { error: 0, warn: 0, info: 0, debug: 0 };
  for (const e of entries.value) {
    const lvl = String(e.level || "").toLowerCase();
    if (lvl === "error") out.error += 1;
    else if (lvl === "warn") out.warn += 1;
    else if (lvl === "debug") out.debug += 1;
    else out.info += 1;
  }
  return out;
});

const filteredEntries = computed(() => {
  const q = search.value.toLowerCase();
  return entries.value.filter((entry) => {
    if (levelFilter.value && entry.level !== levelFilter.value) return false;
    if (errorsOnly.value && !["error", "warn"].includes(entry.level)) return false;
    if (!q) return true;
    return (
      entry.event.toLowerCase().includes(q) ||
      entry.summary.toLowerCase().includes(q) ||
      String(entry.details || "").toLowerCase().includes(q)
    );
  });
});

function eventRoot(event: string) {
  const suffixes = ["requested", "succeeded", "failed", "start", "done", "completed"];
  for (const s of suffixes) {
    const tail = `.${s}`;
    if (event.endsWith(tail)) return event.slice(0, -tail.length);
  }
  return event;
}

function severityRank(level: string) {
  if (level === "error") return 3;
  if (level === "warn") return 2;
  if (level === "info") return 1;
  return 0;
}

function groupedRows(items: ParsedLogEntry[]): DisplayRow[] {
  const out: DisplayRow[] = [];
  const maxGapMs = 30_000;

  for (const entry of items) {
    const root = eventRoot(entry.event);
    const entity =
      entry.data?.id ??
      entry.data?.jobId ??
      entry.data?.linkId ??
      entry.data?.assetVersionId ??
      entry.data?.fileId ??
      entry.data?.name ??
      entry.data?.dest ??
      "na";
    const key = `${root}::${entity}`;

    const prev = out[out.length - 1];
    const prevTs = prev ? new Date(prev.timestamp).getTime() : 0;
    const curTs = new Date(entry.timestamp).getTime();
    const near = Number.isFinite(prevTs) && Number.isFinite(curTs) ? Math.abs(curTs - prevTs) <= maxGapMs : false;

    if (prev && prev.id.startsWith(`group:${key}:`) && near) {
      const child = entry;
      const currentChildren = prev.children || [];
      const allChildren = [...currentChildren, child];
      const best = allChildren.reduce((acc, c) => (severityRank(c.level) > severityRank(acc) ? c.level : acc), prev.level);
      prev.children = allChildren;
      prev.level = best;
      prev.timestamp = allChildren[0].timestamp;
      prev.summary = `${root} (${allChildren.length} events)`;
      continue;
    }

    out.push({
      id: `group:${key}:${entry.id}`,
      timestamp: entry.timestamp,
      level: entry.level,
      event: root,
      summary: entry.summary,
      details: entry.details,
      children: [entry],
    });
  }

  return out.map((r) => {
    if (!r.children || r.children.length <= 1) {
      const single = r.children?.[0];
      return {
        id: single?.id || r.id,
        timestamp: single?.timestamp || r.timestamp,
        level: single?.level || r.level,
        event: single?.event || r.event,
        summary: single?.summary || r.summary,
        details: single?.details || r.details,
      };
    }
    return r;
  });
}

const displayRows = computed<DisplayRow[]>(() => {
  const rows = filteredEntries.value;
  if (!groupRelated.value) return rows.map((r) => ({ ...r }));
  return groupedRows(rows);
});

function formatTs(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

async function refresh() {
  loading.value = true;
  error.value = null;
  try {
    const res = await window.electron?.ipcRenderer.invoke("logs:read-client", { limit: 600 });
    if (!res?.ok) {
      throw new Error(res?.error || "Unable to read logs");
    }

    entries.value = Array.isArray(res.entries) ? res.entries : [];
    meta.value = {
      file: String(res.file || ""),
      logDir: String(res.logDir || ""),
    };
  } catch (e: any) {
    error.value = e?.message || String(e);
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

function close() {
  emit("close");
}

onMounted(() => {
  refresh();
});
</script>
