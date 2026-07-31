import { create } from 'zustand'

interface VaultState {
  passphrase: string | null
  unlock: (passphrase: string) => void
  lock: () => void
}

export const useVaultStore = create<VaultState>((set) => ({
  passphrase: null,
  unlock: (passphrase) => set({ passphrase }),
  lock: () => set({ passphrase: null }),
}))
