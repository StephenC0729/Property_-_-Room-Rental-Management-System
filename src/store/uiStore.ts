import { create } from 'zustand'
import type { Room, Property, RoomBillingStatus } from '@/types'

// ─── Modal data types ────────────────────────────────────────────────────────
//
// Each modal type maps to a specific data payload. `null` means no data is
// needed. ModalSlice is a discriminated union so checking activeModal narrows
// modalData to the correct payload type.

/**
 * Maps each modal type to the data it requires.
 * `null` means no data payload is needed to open the modal.
 */
export type ModalDataMap = {
  'edit-room':       Room
  'payment':         RoomBillingStatus
  'edit-property':   Property
  'terminate-lease': null
  'edit-lease':      null
  'add-property':    null
  'add-room':        null
}

export type ModalType = keyof ModalDataMap | null

/** Union of all possible modal data values. */
export type ModalData = ModalDataMap[keyof ModalDataMap]

/** Correlated activeModal + modalData pairs for type-safe narrowing. */
export type ModalSlice =
  | { activeModal: null; modalData: null }
  | {
      [K in keyof ModalDataMap]: ModalDataMap[K] extends null
        ? { activeModal: K; modalData: null }
        : { activeModal: K; modalData: ModalDataMap[K] }
    }[keyof ModalDataMap]

type OpenModal = {
  <T extends keyof ModalDataMap>(
    type: T,
    ...args: ModalDataMap[T] extends null ? [data?: null] : [data: ModalDataMap[T]]
  ): void
}

export type UIState = ModalSlice & {
  openModal: OpenModal
  closeModal: () => void
}

const closedState: ModalSlice = { activeModal: null, modalData: null }

export const useUIStore = create<UIState>((set) => ({
  ...closedState,
  openModal: (type, data?) => {
    set({ activeModal: type, modalData: data ?? null } as ModalSlice)
  },
  closeModal: () => set(closedState),
}))
