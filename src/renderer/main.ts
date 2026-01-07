import './ipc-web-shim';

// capture originals
const _origWarn = console.warn.bind(console)
const _origError = console.error.bind(console)

// override warn & error
console.warn = (...args: any[]) => {
    const msg = args.map(String).join(' ')
    if (
        msg.includes('APPIMAGE env is not defined') ||
        msg.includes('NODE_TLS_REJECT_UNAUTHORIZED') ||
        msg.includes('setup() return property "_" should not start with "$" or "_"') ||
        msg.includes('Extraneous non-props attributes')
    ) return
    _origWarn(...args)
}

console.error = (...args: any[]) => {
    const msg = args.map(String).join(' ')
    if (msg.includes('NODE_TLS_REJECT_UNAUTHORIZED')) return
    _origError(...args)
}

import { IPCRouter } from '@45drives/houston-common-lib'
IPCRouter.initRenderer()

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import "@45drives/houston-common-css/src/index.css"; 
import "@45drives/houston-common-ui/style.css"; 
import "./style.css"; 
import AppShell from '../app/AppShell.vue';
import { router } from '../app/routes';
import { enterNextDirective } from '@45drives/houston-common-ui';

document.title = `45Studio Sharing Software v${__APP_VERSION__}`;

const app = createApp(AppShell);
const pinia = createPinia();
app.use(router)
app.directive('enter-next', enterNextDirective);
app.use(pinia);
app.mount('#app');
document.documentElement.classList.add('theme-studio');
window.electron?.ipcRenderer.send('renderer-ready');