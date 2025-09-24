import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'server-selection', component: () => import('../renderer/views/Connect2Server.vue') },
    { path: '/home', name: 'dashboard', component: () => import('../renderer/views/DashboardView.vue') },
    // { path: '/collabo/new', name: '', component: () => import('../renderer/views/View.vue') },
    // { path: '/collabo/view', name: '', component: () => import('../renderer/views/View.vue') },
    // { path: '/collabo/manage', name: '', component: () => import('../renderer/views/View.vue') },
    // { path: '/share/new', name: '', component: () => import('../renderer/views/View.vue') },
    // { path: '/share/view', name: '', component: () => import('../renderer/views/View.vue') },
    // { path: '/share/manage', name: '', component: () => import('../renderer/views/View.vue') },
    // { path: '/logs', name: '', component: () => import('../renderer/views/View.vue') },
    // { path: '/settings', name: '', component: () => import('../renderer/views/View.vue') },
    // { path: '/link/view', name: '', component: () => import('../renderer/views/View.vue') },
  ],
})
