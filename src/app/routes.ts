import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'server-selection', component: () => import('../renderer/views/Connect2Server.vue') },
    // { path: '/home', name: 'dashboard', component: () => import('../renderer/views/DashboardView.vue') },
    // { path: '/collabo/new', name: 'new-collabo', component: () => import('../renderer/views/Collaborators/NewCollabo.vue') },
    // { path: '/collabo/view', name: 'view-collabo', component: () => import('../renderer/views/Collaborators/ViewCollabo.vue') },
    // { path: '/collabo/manage', name: 'manage-collabo', component: () => import('../renderer/views/Collaborators/ManageCollabos.vue') },
    // { path: '/share/new', name: 'new-share', component: () => import('../renderer/views/Shares/NewShare.vue') },
    // { path: '/share/view', name: 'view-share', component: () => import('../renderer/views/Shares/ViewShare.vue') },
    // { path: '/share/manage', name: 'manage-shares', component: () => import('../renderer/views/Shares/ManageShares.vue') },
    // { path: '/link/view', name: 'view-link', component: () => import('../renderer/views/Shares/ViewLink.vue') },
    // { path: '/logs', name: 'logs', component: () => import('../renderer/views/GlobalLogs.vue') },
    // { path: '/settings', name: 'settings', component: () => import('../renderer/views/GlobalSettings.vue') },
    { path: '/select-file', name: 'select-file', component: () => import('../renderer/views/MVP/SelectAndShareFile.vue')}
  ],
})
