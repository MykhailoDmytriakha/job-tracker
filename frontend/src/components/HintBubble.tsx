import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export function HintBubble({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const bubbleRef = useRef<HTMLSpanElement>(null);

  // Position popup above the button using fixed coords
  function openPopup(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    if (bubbleRef.current) {
      const rect = bubbleRef.current.getBoundingClientRect();
      const popupWidth = 220;
      const margin = 8;
      // Center horizontally on button, then clamp to viewport
      let left = rect.left + rect.width / 2 - popupWidth / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - popupWidth - margin));
      setPos({ top: rect.top - 8, left });
    }
    setOpen(true);
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (bubbleRef.current && bubbleRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <span className="hint-bubble-wrap">
      <span
        ref={bubbleRef}
        className={`hint-bubble${open ? " active" : ""}`}
        onClick={openPopup}
      >
        ?
      </span>
      {open && createPortal(
        <span
          className="hint-popup"
          style={{ top: pos.top, left: pos.left }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </span>,
        document.body
      )}
    </span>
  );
}
