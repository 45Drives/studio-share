import { ref } from 'vue'

/** Shared counter that increments whenever a new link is created outside ManageLinks. */
const linkVersion = ref(0)

export function signalLinkCreated() {
  linkVersion.value++
}

export function useLinkRefreshSignal() {
  return { linkVersion }
}
