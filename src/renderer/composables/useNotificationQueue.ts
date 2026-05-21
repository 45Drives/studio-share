// src/renderer/composables/useNotificationQueue.ts
import { ref, reactive } from 'vue'
import { pushNotification as houstonPushNotification, Notification } from '@45drives/houston-common-ui'

const MAX_VISIBLE_NOTIFICATIONS = 3
const notificationQueue = ref<Notification[]>([])
const activeNotifications = ref<Notification[]>([])

function processQueue() {
  while (activeNotifications.value.length < MAX_VISIBLE_NOTIFICATIONS && notificationQueue.value.length > 0) {
    const nextNotif = notificationQueue.value.shift()
    if (nextNotif) {
      showNotification(nextNotif)
    }
  }
}

function showNotification(notif: Notification) {
  // Push to houston-common first, which sets up the remove function
  const pushedNotif = houstonPushNotification(notif)
  
  // Track it in our active list
  activeNotifications.value.push(pushedNotif)
  
  // Wrap the remove function to process queue after removal
  const originalRemove = pushedNotif.remove
  pushedNotif.remove = () => {
    // Call original remove
    originalRemove()
    // Remove from our tracking
    activeNotifications.value = activeNotifications.value.filter((n) => n.key !== pushedNotif.key)
    // Process next in queue
    processQueue()
  }
  
  return pushedNotif
}

/**
 * Push a notification with queue management
 * Limits visible notifications to MAX_VISIBLE_NOTIFICATIONS and queues the rest
 */
export function pushNotification(notif: Notification): Notification {
  // Check if there's already a notification with the same group
  if (notif.group) {
    // Check active notifications
    const existing = activeNotifications.value.find((n) => n.group === notif.group)
    if (existing) {
      existing.groupCount++
      existing.body = notif.body
      // Restart the dismiss timer
      existing.stopRemoveTimeout()
      existing.startRemoveTimeout()
      return existing
    }
    
    // Check queued notifications
    const queuedExisting = notificationQueue.value.find((n) => n.group === notif.group)
    if (queuedExisting) {
      queuedExisting.groupCount++
      queuedExisting.body = notif.body
      return queuedExisting
    }
  }

  notif = reactive(notif)

  // Add to active list if under limit, otherwise queue it
  if (activeNotifications.value.length < MAX_VISIBLE_NOTIFICATIONS) {
    return showNotification(notif)
  } else {
    notificationQueue.value.push(notif)
    return notif
  }
}

export function useNotificationQueue() {
  return {
    notificationQueue,
    activeNotifications,
    maxVisible: MAX_VISIBLE_NOTIFICATIONS,
    pushNotification,
  }
}
