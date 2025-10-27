import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'server-selection', component: () => import('../renderer/views/Connect2Server.vue') },
    { path: '/home', name: 'dashboard', component: () => import('../renderer/views/DashboardView.vue') },
    // { path: '/logs', name: 'logs', component: () => import('../renderer/views/GlobalLogs.vue') },
    // { path: '/settings', name: 'settings', component: () => import('../renderer/views/GlobalSettings.vue') },
    { path: '/select-file', name: 'select-file', component: () => import('../renderer/views/SelectAndShareFile.vue')},
    { path: '/upload-file', name: 'upload-file', component: () => import('../renderer/views/LocalUploadPanel.vue')},
    { path: '/create-upload-link', name: 'create-upload-link', component: () => import('../renderer/views/LinkUploadPanel.vue') },
  ],
})
