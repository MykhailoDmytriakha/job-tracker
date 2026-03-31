import { useState, useEffect, useCallback } from "react";

// Simple global toast: dispatch custom event, Toast component listens
export function showToast(message: string, type: "error" | "info" = "error", onTaskClick?: (id: number) => void) {
  window.dispatchEvent(
    new CustomEvent("app-toast", { detail: { message, type, onTaskClick } })
  );
}

export function Toast() {
  const [toast, setToast] = useState<{ message: string; type: string; onTaskClick?: (id: number) => void } | null>(null);

  const handleToast = useCallback((e: Event) => {
    const { message, type, onTaskClick } = (e as CustomEvent).detail;
    setToast({ message, type, onTaskClick });
  }, []);

  useEffect(() => {
    window.addEventListener("app-toast", handleToast);
    return () => window.removeEventListener("app-toast", handleToast);
  }, [handleToast]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  // Linkify #ID references in message
  const parts = toast.message.split(/(#\d+)/g);
  const content = parts.map((part, i) => {
    const match = part.match(/^#(\d+)$/);
    if (match && toast.onTaskClick) {
      const id = parseInt(match[1], 10);
      return (
        <span key={i} className="toast-link" onClick={(e) => { e.stopPropagation(); setToast(null); toast.onTaskClick!(id); }}>
          {part}
        </span>
      );
    }
    return part;
  });

  return (
    <div className={`toast toast-${toast.type}`} onClick={() => setToast(null)}>
      {content}
    </div>
  );
}
