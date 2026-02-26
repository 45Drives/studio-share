<template>
    <div class="z-50">
        <button ref="menuButton" @click="toggle" class="btn bg-well hover:bg-accent text-default p-2 rounded-full">
            <Bars3Icon class="w-6 h-6" />
        </button>

        <teleport to="body">
            <div v-if="show"
                class="fixed z-[1002] right-0 mt-2 w-60 max-h-[80vh] overflow-y-auto bg-well shadow-lg rounded-lg border p-4 text-left text-default"
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

                <!-- <div v-if="canCheckUpdates" class="mb-2 text-center items-center">
                    <p class="text-xs text-default mb-1">Application</p>
                    <button class="btn btn-secondary wizard-btn w-full mb-1" :disabled="updateBusy"
                        @click="checkForUpdates">
                        {{ updateBusy ? 'Checking...' : 'Check for Updates' }}
                    </button>
                </div> -->
                <!-- <details class="menu-disclosure mb-2" open>
                    <summary class="menu-disclosure-summary">Studio Palette</summary>
                    <div class="disclosure-content">
                        <div class="palette-grid">
                            <button v-for="palette in studioPalettes" :key="palette.theme" class="btn theme-btn w-full"
                                :class="[palette.className, currentTheme === palette.theme ? 'theme-btn-active' : '']"
                                @click="selectTheme(palette.theme)">
                                {{ palette.label }}
                            </button>
                        </div>
                    </div>
                </details> -->

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
import { useRoute } from 'vue-router'
import { Bars3Icon, MoonIcon, SunIcon } from '@heroicons/vue/24/outline'
import { toggleDarkMode, useDarkModeState, pushNotification, Notification } from '@45drives/houston-common-ui'
import { useThemeFromAlias, type Theme } from '../composables/useThemeFromAlias'
import { connectionMetaInjectionKey, currentServerInjectionKey } from '../keys/injection-keys'
import { useResilientNav } from '../composables/useResilientNav'
const { to } = useResilientNav()
interface GlobalMenuProps {
    server?: boolean;
}
defineProps<GlobalMenuProps>()

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

useThemeFromAlias()

// const { setTheme, currentTheme } = useThemeFromAlias()

// const studioPalettes: Array<{ label: string; theme: Theme; className: string }> = [
//     { label: 'Original Purple', theme: 'theme-studio-original-purple', className: 'theme-btn-studio-original-purple' },
//     { label: 'Purple + Orange', theme: 'theme-studio-grad-purple-orange', className: 'theme-btn-studio-grad-purple-orange' },
//     { label: 'Purple + Pink + Orange', theme: 'theme-studio-grad-purple-pink-orange', className: 'theme-btn-studio-grad-purple-pink-orange' },
//     { label: 'Purple + Pink + Blue', theme: 'theme-studio-grad-purple-pink-blue', className: 'theme-btn-studio-grad-purple-pink-blue' },
//     { label: 'Purple + Blue', theme: 'theme-studio-grad-purple-blue', className: 'theme-btn-studio-grad-purple-blue' },
//     { label: 'Red + Purple + Blue', theme: 'theme-studio-grad-red-purple-blue', className: 'theme-btn-studio-grad-red-purple-blue' },
//     { label: 'Sunset Laser', theme: 'theme-studio-grad-sunset-laser', className: 'theme-btn-studio-grad-sunset-laser' },
//     { label: 'Neon Studio', theme: 'theme-studio-grad-neon-studio', className: 'theme-btn-studio-grad-neon-studio' },
//     { label: 'Moon-Mist', theme: 'theme-studio-grad-moon-mist', className: 'theme-btn-studio-grad-moon-mist' },
//     { label: 'Balanced Blue', theme: 'theme-studio', className: 'theme-btn-studio-balanced' },
//     { label: 'Slate', theme: 'theme-studio-slate', className: 'theme-btn-studio-slate' },
//     { label: 'Ocean', theme: 'theme-studio-ocean', className: 'theme-btn-studio-ocean' },

// ]

// function selectTheme(theme: Theme) {
//     setTheme(theme) // updates currentTheme, which updates currentDivision, which updates the logo
// }


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


.palette-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.35rem;
}

.menu-disclosure {
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 0.5rem;
    padding: 0.35rem;
    background: rgba(15, 23, 42, 0.12);
}

.menu-disclosure-summary {
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    user-select: none;
    color: currentColor;
}

.disclosure-content {
    margin-top: 0.45rem;
}

.theme-btn-studio-balanced {
    background-color: #4E6B93;
    border: 1px solid #4E6B93;
    color: white;
}

.theme-btn-studio-balanced:hover {
    background-color: #3F587A;
    border-color: #3F587A;
}

.theme-btn-studio-original-purple {
    background-color: #6557A5;
    border: 1px solid #6557A5;
    color: white;
}

.theme-btn-studio-original-purple:hover {
    background-color: #504584;
    border-color: #504584;
}

.theme-btn-studio-grad-purple-orange {
    background: linear-gradient(135deg, #6F58B8 0%, #C96E36 100%);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: white;
}

.theme-btn-studio-grad-purple-orange:hover {
    filter: brightness(1.05);
}

.theme-btn-studio-grad-purple-pink-orange {
    background: linear-gradient(135deg, #7A4FD8 0%, #D95AA5 52%, #E57A4A 100%);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: white;
}

.theme-btn-studio-grad-purple-pink-orange:hover {
    filter: brightness(1.05);
}

.theme-btn-studio-grad-purple-pink-blue {
    background: linear-gradient(135deg, #6D4FE0 0%, #D65EAE 50%, #4C7CF4 100%);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: white;
}

.theme-btn-studio-grad-purple-pink-blue:hover {
    filter: brightness(1.05);
}

.theme-btn-studio-grad-purple-blue {
    background: linear-gradient(135deg, #7A3CFF 0%, #4A7CEB 100%);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: white;
}

.theme-btn-studio-grad-purple-blue:hover {
    filter: brightness(1.05);
}

.theme-btn-studio-grad-red-purple-blue {
    background: linear-gradient(135deg, #F43F5E 0%, #8B5CF6 52%, #3B82F6 100%);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: white;
}

.theme-btn-studio-grad-red-purple-blue:hover {
    filter: brightness(1.05);
}

.theme-btn-studio-grad-sunset-laser {
    background: linear-gradient(135deg, #FF6A00 0%, #FF2D95 48%, #2CF3E9 100%);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: white;
}

.theme-btn-studio-grad-sunset-laser:hover {
    filter: brightness(1.05);
}

.theme-btn-studio-grad-neon-studio {
    background: linear-gradient(135deg, #14B8A6 0%, #6D28D9 45%, #F43F5E 100%);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: white;
}

.theme-btn-studio-grad-neon-studio:hover {
    filter: brightness(1.05);
}

.theme-btn-studio-slate {
    background-color: #5F6E82;
    border: 1px solid #5F6E82;
    color: white;
}

.theme-btn-studio-slate:hover {
    background-color: #4E5D71;
    border-color: #4E5D71;
}

.theme-btn-studio-ocean {
    background-color: #3E6D84;
    border: 1px solid #3E6D84;
    color: white;
}

.theme-btn-studio-ocean:hover {
    background-color: #31596D;
    border-color: #31596D;
}

.theme-btn-studio-grad-moon-mist {
    background: linear-gradient(135deg, #7A2CFF 0%, #2EA8FF 52%, #FFE44D 100%);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: white;
}

.theme-btn-studio-grad-moon-mist:hover {
    filter: brightness(1.05);
}

.theme-btn {
    font-size: 0.75rem;
    font-weight: bold;
    padding: 0.3rem 0.5rem;
    border-radius: 0.25rem;
    opacity: 0.88;
    transition: all 0.2s ease-in-out;
}

.theme-btn:hover {
    opacity: 1;
    transform: scale(1.02);
}

.theme-btn-active {
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.75);
}
</style>
