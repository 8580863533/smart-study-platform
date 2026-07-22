import { useToastContext } from '../context/ToastContext';

export function useToast() {
  const { addToast, removeToast } = useToastContext();

  const toast = {
    success: (title, message, duration) => addToast({ type: 'success', title, message, duration }),
    error: (title, message, duration) => addToast({ type: 'error', title, message, duration }),
    warning: (title, message, duration) => addToast({ type: 'warning', title, message, duration }),
    info: (title, message, duration) => addToast({ type: 'info', title, message, duration }),
    xp: (points, action) => addToast({
      type: 'xp',
      title: `+${points} XP Earned! ⚡`,
      message: action || 'Keep studying!',
      duration: 3500,
    }),
  };

  return { toast, removeToast };
}
