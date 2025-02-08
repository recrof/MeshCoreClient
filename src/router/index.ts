import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import TabsPage from '@/views/TabsPage.vue'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/tabs/devices'
  },
  {
    path: '/chat/:publicKey',
    component: () => import('@/views/Chat.vue'),
  },
  {
    path: '/tabs/',
    component: TabsPage,
    children: [
      {
        path: '',
        redirect: '/tabs/devices'
      },
      {
        path: 'devices',
        component: () => import('@/views/Devices.vue')
      },
      {
        path: 'discover',
        component: () => import('@/views/Discover.vue')
      },
      {
        path: 'chats',
        component: () => import('@/views/ChatList.vue')
      },
      {
        path: 'settings',
        component: () => import('@/views/Settings.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
