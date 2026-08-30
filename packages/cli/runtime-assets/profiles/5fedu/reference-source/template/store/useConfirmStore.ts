import React from 'react';
import { create } from 'zustand';

type ConfirmVariant = 'danger' | 'warning' | 'info';

interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  variant?: ConfirmVariant;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

interface ConfirmState {
  isOpen: boolean;
  isLoading: boolean;
  options: ConfirmOptions;
  confirm: (options: ConfirmOptions) => void;
  close: () => void;
  setLoading: (loading: boolean) => void;
}

const defaultOptions: ConfirmOptions = {
  title: 'Xác nhận',
  message: 'Bạn có chắc chắn muốn thực hiện hành động này?',
  variant: 'warning',
  confirmText: 'Xác nhận',
  cancelText: 'Hủy bỏ',
  onConfirm: () => {},
};

export const useConfirmStore = create<ConfirmState>((set) => ({
  isOpen: false,
  isLoading: false,
  options: defaultOptions,
  confirm: (options) => set({ 
    isOpen: true, 
    options: { ...defaultOptions, ...options } 
  }),
  close: () => set({ isOpen: false, isLoading: false }),
  setLoading: (loading) => set({ isLoading: loading }),
}));