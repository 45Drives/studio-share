import { defineStore } from 'pinia'

// stores/transfer.ts
export const useTransferStore = defineStore('transfer', {
    state: () => ({
      localFiles: [] as Array<{ path:string; name:string; size:number }>,
      destDir: '' as string,
    }),
    actions: {
      setFiles(f){ this.localFiles = f },
      setDest(d){ this.destDir = d },
      clear(){ this.localFiles=[]; this.destDir='' }
    }
  })
  