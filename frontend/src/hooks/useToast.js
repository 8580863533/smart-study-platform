import { useToastContext } from '../context/ToastContext';

export function useToast() {
  const { addToast: contextAddToast, removeToast } = useToastContext();

  const addToast = (msgOrObj, type = 'info', title = '') => {
    if (!contextAddToast) return;
    if (typeof msgOrObj === 'object' && msgOrObj !== null) {
      return contextAddToast(msgOrObj);
    }
    return contextAddToast({
      message: String(msgOrObj || ''),
      type: type || 'info',
      title: title || (type === 'error' ? 'Notice' : type === 'success' ? 'Success' : 'Information')
    });
  };

  const toast = {
    success: (title, message, duration) => contextAddToast({ type: 'success', title, message, duration }),
    error: (title, message, duration) => contextAddToast({ type: 'error', title, message, duration }),
    warning: (title, message, duration) => contextAddToast({ type: 'warning', title, message, duration }),
    info: (title, message, duration) => contextAddToast({ type: 'info', title, message, duration }),
    xp: (points, action) => contextAddToast({
      type: 'xp',
      title: `+${points} XP Earned! ⚡`,
      message: action || 'Keep studying!',
      duration: 3500,
    }),
  };

  return { toast, addToast, removeToast };
}
