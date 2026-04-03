import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface StripTooltipProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}

export function StripTooltip({ text, className = "dash-card-strip", style, onClick }: StripTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onEnter() {
    timer.current = setTimeout(() => {
      if (ref.current) {
        const r = ref.current.getBoundingClientRect();
        setPos({ top: r.top + r.height / 2, left: r.right + 8 });
      }
      setVisible(true);
    }, 500);
  }

  function onLeave() {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <>
      <div
        ref={ref}
        className={className}
        style={style}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onClick={onClick ?? (e => e.stopPropagation())}
      />
      {visible && createPortal(
        <div className="dash-strip-tooltip" style={{ top: pos.top, left: pos.left }}>
          {text}
        </div>,
        document.body
      )}
    </>
  );
}
