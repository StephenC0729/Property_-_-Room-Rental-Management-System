import { create } from 'zustand'
import type { Room, Property, RoomBillingStatus } from '@/types'

// ─── Modal data types ────────────────────────────────────────────────────────
//
// Each modal type maps to a specific data payload. `null` means no data is
// needed. This discriminated mapping removes the need for `any` in the store
// and gives explicit documentation of what each modal expects.

export type ModalType =
  | 'edit-room'
  | 'payment'
  | 'terminate-lease'
  | 'edit-lease'
  | 'edit-property'
  | 'add-property'
  | 'add-room'
  | null

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

/** Union of all possible modal data values. */
export type ModalData = ModalDataMap[keyof ModalDataMap]

// ─── Store interface ─────────────────────────────────────────────────────────

interface UIState {
  activeModal: ModalType
  modalData: ModalData
  /**
   * Open a modal. For modals that require data (e.g. 'edit-room', 'payment',
   * 'edit-property'), pass the typed payload as the second argument.
   * For data-free modals, the second argument can be omitted.
   */
  openModal: (type: ModalType, data?: ModalData) => void
  closeModal: () => void
}

export const useUIStore = create<UIState>((set) => ({
  activeModal: null,
  modalData: null,
  openModal: (type, data = null) => set({ activeModal: type, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),
}))
