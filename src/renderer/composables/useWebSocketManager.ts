// src/renderer/composables/useWebSocketManager.ts
import { ref, inject, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import type { Ref } from 'vue'
import type { Server, ConnectionMeta } from '../types'
import { currentServerInjectionKey, connectionMetaInjectionKey } from '../keys/injection-keys'

type SubscriptionCallback = (data: any) => void

interface WebSocketConnection {
  ws: WebSocket
  status: 'connecting' | 'open' | 'closed' | 'error'
  authenticated: boolean
  subscriptions: Map<string, Set<SubscriptionCallback>>
  reconnectAttempts: number
  reconnectTimer?: ReturnType<typeof setTimeout>
  authFailed: boolean
  everOpened: boolean
}

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAY_BASE = 1000

let wsConn: WebSocketConnection | null = null
let _singletonInstance: ReturnType<typeof createWebSocketManager> | null = null

/**
 * Internal implementation of WebSocket manager
 */
function createWebSocketManager(
  currentServer: Ref<Server | null>,
  connectionMeta: Ref<ConnectionMeta>,
  route: ReturnType<typeof useRoute>
) {

  const serverInfo = computed(() => {
    if (!currentServer.value) return null
    const meta = connectionMeta.value
    return {
      serverIp: currentServer.value.ip,
      baseUrl: meta.apiBase || `http://${currentServer.value.ip}:${meta.port || 9095}`,
      token: meta.token || ''
    }
  })

  function makeChannelKey(channel: string, id: string | number) {
    return `${channel}:${id}`
  }

  function connect() {
    const info = serverInfo.value
    if (!info || !info.token) {
      console.warn('[ws] no server/token - skipping connection')
      return
    }

    // Don't reconnect if auth already failed
    if (wsConn?.authFailed) {
      console.warn('[ws] skipping connection - previous auth failure')
      return
    }

    // Close existing connection
    disconnect()

    const wsUrl = info.baseUrl.replace(/^http/, 'ws') + '/api/ws'
    
    try {
      const ws = new WebSocket(wsUrl)
      
      wsConn = {
        ws,
        status: 'connecting',
        authenticated: false,
        subscriptions: new Map(),
        reconnectAttempts: 0,
        authFailed: false,
        everOpened: false
      }

      ws.onopen = () => {
        if (!wsConn) return
        wsConn.status = 'open'
        wsConn.reconnectAttempts = 0
        wsConn.everOpened = true

        // Authenticate
        ws.send(JSON.stringify({
          type: 'auth',
          token: info.token
        }))

        console.log('[ws] connected to', info.serverIp)
      }

      ws.onmessage = (event) => {
        if (!wsConn) return
        
        try {
          const msg = JSON.parse(event.data)

          if (msg.type === 'auth_ok') {
            wsConn.authenticated = true
            console.log('[ws] authenticated:', msg.username)
            return
          }

          if (msg.type === 'auth_error') {
            console.error('[ws] auth failed:', msg.message)
            wsConn.authFailed = true
            wsConn.authenticated = false
            ws.close()
            return
          }

          if (msg.type === 'pong') return
          if (msg.type === 'subscribed' || msg.type === 'unsubscribed') return

          // Progress update
          if (msg.channel && msg.id !== undefined && msg.data !== undefined) {
            const key = makeChannelKey(msg.channel, msg.id)
            const callbacks = wsConn.subscriptions.get(key)
            if (callbacks) {
              callbacks.forEach(cb => {
                try {
                  cb(msg.data)
                } catch (err) {
                  console.error('[ws] subscription callback error:', err)
                }
              })
            }
          }
        } catch (err) {
          console.error('[ws] message parse error:', err)
        }
      }

      ws.onerror = (err) => {
        console.warn('[ws] error:', err)
        if (wsConn) wsConn.status = 'error'
      }

      ws.onclose = () => {
        if (!wsConn) return
        
        const wasAuthenticated = wsConn.authenticated
        const authFailed = wsConn.authFailed
        const neverOpened = !wsConn.everOpened
        const reconnectAttempts = wsConn.reconnectAttempts
        
        wsConn.status = 'closed'
        wsConn.authenticated = false

        // Don't reconnect if auth failed or connection never opened (404)
        if (authFailed) {
          console.warn('[ws] not reconnecting - authentication failed')
          return
        }

        if (neverOpened) {
          console.warn('[ws] not reconnecting - server does not support WebSocket')
          return
        }

        // Attempt reconnect with exponential backoff
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts)
          console.log(`[ws] reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`)
          
          wsConn.reconnectAttempts++
          wsConn.reconnectTimer = setTimeout(() => {
            connect()
          }, delay)
        } else {
          console.warn('[ws] max reconnect attempts reached')
        }
      }

      // Heartbeat
      const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 30000)

      ws.addEventListener('close', () => clearInterval(heartbeat), { once: true })

    } catch (err) {
      console.error('[ws] connection error:', err)
    }
  }

  function disconnect() {
    if (!wsConn) return

    if (wsConn.reconnectTimer) {
      clearTimeout(wsConn.reconnectTimer)
    }

    if (wsConn.ws.readyState === WebSocket.OPEN || wsConn.ws.readyState === WebSocket.CONNECTING) {
      wsConn.ws.close()
    }

    wsConn = null
  }

  /**
   * Subscribe to real-time progress updates
   */
  function subscribe(channel: string, id: string | number, callback: SubscriptionCallback): boolean {
    if (!wsConn || !wsConn.authenticated) {
      return false
    }

    const key = makeChannelKey(channel, id)
    
    if (!wsConn.subscriptions.has(key)) {
      wsConn.subscriptions.set(key, new Set())
      
      // Send subscribe message to server
      wsConn.ws.send(JSON.stringify({
        type: 'subscribe',
        channel,
        id: String(id)
      }))
    }

    wsConn.subscriptions.get(key)!.add(callback)
    return true
  }

  /**
   * Unsubscribe from progress updates
   */
  function unsubscribe(channel: string, id: string | number, callback: SubscriptionCallback) {
    if (!wsConn) return

    const key = makeChannelKey(channel, id)
    const callbacks = wsConn.subscriptions.get(key)
    
    if (callbacks) {
      callbacks.delete(callback)
      
      if (callbacks.size === 0) {
        wsConn.subscriptions.delete(key)
        
        // Send unsubscribe message to server
        if (wsConn.ws.readyState === WebSocket.OPEN) {
          wsConn.ws.send(JSON.stringify({
            type: 'unsubscribe',
            channel,
            id: String(id)
          }))
        }
      }
    }
  }

  /**
   * Clear auth failure flag (e.g., after re-login with new token)
   */
  function clearAuthFailure() {
    if (wsConn) {
      wsConn.authFailed = false
    }
  }

  // Watch for server changes and reconnect
  watch(serverInfo, (newInfo, oldInfo) => {
    if (!newInfo) {
      disconnect()
      return
    }

    // Reconnect if server IP or token changed
    const serverChanged = oldInfo && (
      newInfo.serverIp !== oldInfo.serverIp ||
      newInfo.token !== oldInfo.token
    )

    if (serverChanged) {
      console.log('[ws] server/token changed - reconnecting')
      clearAuthFailure()
      connect()
    } else if (!wsConn && newInfo.token) {
      // Initial connection
      connect()
    }
  }, { immediate: true })

  // Disconnect when navigating to login screen
  watch(() => route.name, (name) => {
    if (name === 'server-selection') {
      disconnect()
    }
  })

  return {
    subscribe,
    unsubscribe,
    clearAuthFailure
  }
}

/**
 * Initialize WebSocket manager singleton (call once from AppShell)
 */
export function useWebSocketManager(
  currentServerRef?: Ref<Server | null>,
  connectionMetaRef?: Ref<ConnectionMeta>
) {
  const route = useRoute()
  
  // Accept refs as parameters or fall back to injection (for child components)
  let currentServer: Ref<Server | null> | undefined
  let connectionMeta: Ref<ConnectionMeta> | undefined
  
  if (currentServerRef && connectionMetaRef) {
    currentServer = currentServerRef
    connectionMeta = connectionMetaRef
  } else {
    // Try injection - may fail if not in component context
    try {
      currentServer = inject<Ref<Server | null>>(currentServerInjectionKey)
      connectionMeta = inject<Ref<ConnectionMeta>>(connectionMetaInjectionKey)
    } catch (err) {
      // Not in injection context - return existing singleton or no-op
      return _singletonInstance || {
        subscribe: () => false,
        unsubscribe: () => {},
        clearAuthFailure: () => {}
      }
    }
  }

  // Return existing singleton or no-op if injection not available
  if (!currentServer || !connectionMeta) {
    return _singletonInstance || {
      subscribe: () => false,
      unsubscribe: () => {},
      clearAuthFailure: () => {}
    }
  }

  // Create singleton instance
  if (!_singletonInstance) {
    _singletonInstance = createWebSocketManager(currentServer, connectionMeta, route)
  }

  return _singletonInstance
}

/**
 * Get the WebSocket manager singleton (safe to call from anywhere)
 */
export function getWebSocketManager() {
  return _singletonInstance || {
    subscribe: () => false,
    unsubscribe: () => {},
    clearAuthFailure: () => {}
  }
}
