import React, { useEffect, useState } from 'react';
import { useToastContext } from '../context/ToastContext';

const ICONS = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  xp: '⚡',
};

function ToastItem({ toast, onRemove }) {
  const [exiting, setExiting] = useState(false);

  const handleRemove = () => {
    setExiting(true);
    setTimeout(() => onRemove(toast.id), 280);
  };

  return (
    <div className={`toast toast-${toast.type} ${exiting ? 'toast-exit' : ''}`}>
      <span className="toast-icon">{ICONS[toast.type] || 'ℹ️'}</span>
      <div className="toast-content">
        {toast.title && <div className="toast-title">{toast.title}</div>}
        {toast.message && <div className="toast-message">{toast.message}</div>}
      </div>
      <button className="toast-close" onClick={handleRemove}>✕</button>
    </div>
  );
}

export default function Toast() {
  const { toasts, removeToast } = useToastContext();

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onRemove={removeToast} />
      ))}
    </div>
  );
}
