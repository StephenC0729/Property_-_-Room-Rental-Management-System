import { create } from 'zustand'

export type ModalType = 
  | 'edit-room' 
  | 'payment' 
  | 'terminate-lease' 
  | 'edit-lease' 
  | 'edit-property'
  | 'add-property'
  | 'add-room'
  | null

interface UIState {
  activeModal: ModalType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modalData: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openModal: (type: ModalType, data?: any) => void
  closeModal: () => void
}

export const useUIStore = create<UIState>((set) => ({
  activeModal: null,
  modalData: null,
  openModal: (type, data = null) => set({ activeModal: type, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),
}))
