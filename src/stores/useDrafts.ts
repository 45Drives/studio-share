// src/stores/useDrafts.ts
import { defineStore } from 'pinia'

export const useDrafts = defineStore('drafts', {
    state: () => ({
        // where to come back after creating something
        returnTo: null as null | { name: string; params?: any; query?: any },

        // drafts
        shareDraft: null as null | {
            form: { name: string; description: string; active: boolean },
            items: { id: number; path: string }[],
            selectedUserIds: number[]
        },
        collaboratorDraft: null as null | {
            form: any,
            selectedShareIds: number[]
        },
    }),
    actions: {
        setReturnTo(route: { name: string; params?: any; query?: any }) { this.returnTo = route },
        clearReturnTo() { this.returnTo = null },

        saveShareDraft(payload: any) { this.shareDraft = payload },
        consumeShareDraft() { const p = this.shareDraft; this.shareDraft = null; return p },

        saveCollaboratorDraft(payload: any) { this.collaboratorDraft = payload },
        consumeCollaboratorDraft() { const p = this.collaboratorDraft; this.collaboratorDraft = null; return p },
    }
})
