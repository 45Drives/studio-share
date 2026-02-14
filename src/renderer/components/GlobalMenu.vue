<template>
    <div class="z-50">
        <button ref="menuButton" @click="toggle" class="btn bg-well hover:bg-accent text-default p-2 rounded-full">
            <Bars3Icon class="w-6 h-6" />
        </button>

        <teleport to="body">
            <div v-if="show"
                class="fixed z-[1002] right-0 mt-2 w-60 bg-well shadow-lg rounded-lg border p-4 text-left text-default"
                ref="menuRef" :style="{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }">
                <!-- Navigation -->
                <div class="mb-2 text-center items-center">
                    <p class="text-xs text-default mb-1">Navigation</p>

                    <!-- Optional Dashboard -->
                    <button class="btn btn-secondary wizard-btn w-full mb-1" :class="buttonClass('dashboard')"
                        @click="gotoHome">
                        {{ isLoggedIn ? 'Dashboard' : 'Home' }}
                    </button>
                </div>

                <div v-if="canCheckUpdates" class="mb-2 text-center items-center">
                    <p class="text-xs text-default mb-1">Application</p>
                    <button class="btn btn-secondary wizard-btn w-full mb-1" :disabled="updateBusy"
                        @click="checkForUpdates">
                        {{ updateBusy ? 'Checking...' : 'Check for Updates' }}
                    </button>
                </div>

                <!-- Themes -->
                <!-- <div class="mb-2 text-center items-center">
                    <p class="text-xs text-default mb-1">Themes</p>
                    <button class="btn theme-btn theme-btn-default w-full mb-1"
                        @click="selectTheme('theme-default')">Default</button>
                    <button class="btn theme-btn theme-btn-homelab w-full mb-1"
                        @click="selectTheme('theme-homelab')">45Homelab</button>
                    <button class="btn theme-btn theme-btn-professional w-full mb-1"
                        @click="selectTheme('theme-professional')">45Pro</button>
                    <button class="btn theme-btn theme-btn-studio w-full mb-1"
                        @click="selectTheme('theme-studio')">45Studio</button>
                </div> -->

                <!-- Dark mode -->
                <div class="mb-2 items-center">
                    <button
                        class="theme-btn text-xs w-full mb-1 flex flex-row items-center text-center justify-center space-x-2 text-default rounded-md"
                        @click="toggleDarkMode()" :class="darkModeButtonClass">
                        <transition name="fade" mode="out-in">
                            <component :is="darkMode ? SunIcon : MoonIcon" class="w-6 h-6" />
                        </transition>
                        <span class="mb-0.5 font-semibold" :class="darkMode ? 'ml-5' : 'ml-4'">{{ darkModeLabel
                        }}</span>
                    </button>
                </div>
            </div>
        </teleport>
    </div>
</template>


<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onBeforeUnmount, inject } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Bars3Icon, MoonIcon, SunIcon } from '@heroicons/vue/24/outline'
import { toggleDarkMode, useDarkModeState, pushNotification, Notification } from '@45drives/houston-common-ui'
import { useThemeFromAlias } from '../composables/useThemeFromAlias'
import { connectionMetaInjectionKey, currentServerInjectionKey } from '../keys/injection-keys'
import { useResilientNav } from '../composables/useResilientNav'
const { to } = useResilientNav()
interface GlobalMenuProps {
    server?: boolean;
}
defineProps<GlobalMenuProps>()

const router = useRouter()
const route = useRoute()

// --- Auth state (injected from AppShell) ---
const connectionMeta = inject(connectionMetaInjectionKey)!
const currentServer = inject(currentServerInjectionKey)!
const isLoggedIn = computed(() => Boolean(connectionMeta.value?.token) && Boolean(currentServer.value))

// --- Popover state & positioning ---
const show = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const menuButton = ref<HTMLElement | null>(null)
const menuPosition = ref({ top: 0, left: 0 })
const canCheckUpdates = ref(false)
const updateBusy = ref(false)

const toggle = async () => {
    show.value = !show.value
    if (show.value && menuButton.value) {
        await nextTick()
        const rect = menuButton.value.getBoundingClientRect()
        menuPosition.value = { top: rect.bottom + 8, left: rect.right - 240 }
    }
}

const handleClickOutside = (event: MouseEvent) => {
    const path = event.composedPath()
    if (show.value && menuRef.value && !path.includes(menuRef.value) && !path.includes(menuButton.value as Node)) {
        show.value = false
    }
}
const handleKeydown = (event: KeyboardEvent) => { if (event.key === 'Escape') show.value = false }

onMounted(() => {
    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', handleKeydown)

    window.electron?.ipcRenderer.invoke<boolean>('is-dev')
        .then((isDev) => { canCheckUpdates.value = !isDev })
        .catch(() => { canCheckUpdates.value = false })
})
onBeforeUnmount(() => {
    document.removeEventListener('click', handleClickOutside)
    document.removeEventListener('keydown', handleKeydown)
})

// --- Dark mode + theme buttons ---
const darkMode = useDarkModeState()
const darkModeLabel = computed(() => (darkMode.value ? 'Light Mode' : 'Dark Mode'))
const darkModeButtonClass = computed(() => (darkMode.value ? 'btn-sun' : 'btn-moon'))

const { setTheme, currentTheme } = useThemeFromAlias()

function selectTheme(theme: 'theme-default' | 'theme-homelab' | 'theme-professional' | 'theme-studio') {
    setTheme(theme) // updates currentTheme, which updates currentDivision, which updates the logo
}

function gotoHome() {
    const target = isLoggedIn.value
        ? 'dashboard'      // already authenticated → Dashboard
    : 'server-selection'  // not logged in → Login/Server select
    // router.push(target)
    to(target);
    show.value = false
}

async function checkForUpdates() {
    if (updateBusy.value) return
    updateBusy.value = true
    try {
        pushNotification(new Notification('Updater', 'Checking for updates...', 'info', 5000))
        await window.electron?.ipcRenderer.invoke('update:check')
        show.value = false
    } catch (err: any) {
        pushNotification(new Notification('Updater Error', err?.message || 'Unable to check updates', 'error', 8000))
    } finally {
        updateBusy.value = false
    }
}

const isActive = (name: string) => route.name === name
const buttonClass = (name: 'setup' | 'backup' | 'restore' | 'dashboard') =>
    ['wizard-btn', isActive(name) ? 'animate-glow' : ''].join(' ')
</script>

<style scoped>
.btn-moon {
    background-color: #374151;
    border: 1px solid #1f2937;
    color: #e5e7eb;
    transition: all 0.2s ease-in-out;
}

.btn-moon:hover {
    background-color: #1f2937;
    border-color: #111827;
    color: #ffffff;
}

.btn-sun {
    background-color: #fef9c3;
    border: 1px solid #fcd34d;
    color: #1f2937;
    transition: all 0.2s ease-in-out;
}

.btn-sun:hover {
    background-color: #fde68a;
    border-color: #fbbf24;
    color: #111827;
}

.btn-sun,
.btn-moon {
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    /* rounded-md */
    font-weight: 500;
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}



/* THEME BUTTONS: Theme Color Swatches */

.theme-btn-default {
    background-color: #D92B2F;
    border: 1px solid #D92B2F;
    color: white;
    transition: all 0.2s ease-in-out;
}

.theme-btn-default:hover {
    background-color: #b02428;
    border-color: #b02428;
}

.theme-btn-homelab {
    background-color: #2563EB;
    border: 1px solid #2563EB;
    color: white;
    transition: all 0.2s ease-in-out;
}

.theme-btn-homelab:hover {
    background-color: #1E4FCB;
    border-color: #1E4FCB;
}

.theme-btn-professional {
    background-color: #65A443;
    border: 1px solid #65A443;
    color: white;
    transition: all 0.2s ease-in-out;
}

.theme-btn-professional:hover {
    background-color: #4F8F37;
    border-color: #4F8F37;
}

.theme-btn-studio {
    background-color: #6557A5;
    border: 1px solid #6557A5;
    color: white;
    transition: all 0.2s ease-in-out;
}

.theme-btn-studio:hover {
    background-color: #504584;
    border-color: #504584;
}

.theme-btn {
    font-size: 0.75rem;
    font-weight: bold;
    padding: 0.3rem 0.5rem;
    border-radius: 0.25rem;
    opacity: 0.8;
    transition: all 0.2s ease-in-out;
}

.theme-btn:hover {
    opacity: 1;
    transform: scale(1.02);
}
</style>
