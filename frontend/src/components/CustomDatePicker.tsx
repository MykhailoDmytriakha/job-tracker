import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { getWeekStart } from "../pages/Settings";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function CustomDatePicker({
  value,
  onSave,
  onCancel,
  anchorRef,
}: {
  value: string | null;
  onSave: (v: string) => void;
  onCancel: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  
  // Parse date string as local (split YYYY-MM-DD to avoid UTC midnight offset)
  const parseLocalDate = (s: string) => {
    const [y, m, d] = s.split("T")[0].split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const initialDate = value ? parseLocalDate(value) : new Date();
  
  // 25-month runway around `baseDate`. 12 is center.
  const [baseDate, setBaseDate] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const [scrollIdx, setScrollIdx] = useState(12);

  const pickerRef = useRef<HTMLDivElement>(null);

  // Calculate position
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const popupWidth = 240;
      let left = rect.left;
      // Prevent overflow off right side
      if (left + popupWidth > window.innerWidth) {
        left = window.innerWidth - popupWidth - 16;
      }
      setPos({ top: rect.bottom + 4, left });
    }
  }, [anchorRef]);

  // Click outside to cancel
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onCancel();
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onCancel, anchorRef]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
  };

  const weekStart = getWeekStart();
  const daysOfWeek =
    weekStart === "monday"
      ? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
      : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const [view, setView] = useState<"days" | "months">("days");
  const sliderRef = useRef<HTMLDivElement>(null);
  
  useLayoutEffect(() => {
    if (sliderRef.current && view === "days") {
      sliderRef.current.style.scrollBehavior = "auto";
      sliderRef.current.scrollLeft = 12 * sliderRef.current.clientWidth;
      sliderRef.current.style.scrollBehavior = "smooth";
      setScrollIdx(12);
    }
  }, [baseDate.getTime(), view]);

  const handleScroll = () => {
    if (!sliderRef.current) return;
    const w = sliderRef.current.clientWidth;
    const sl = sliderRef.current.scrollLeft;

    // determine index based on snapping physically scrolling to
    const idx = Math.round(sl / w);
    if (idx !== scrollIdx && idx >= 0 && idx < 25) {
      setScrollIdx(idx);
    }
  };

  const activeDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + (scrollIdx - 12), 1);
  const activeY = activeDate.getFullYear();
  const activeM = activeDate.getMonth();

  const prevMonth = (e: React.MouseEvent) => {
    e?.stopPropagation();
    if (sliderRef.current) {
      sliderRef.current.scrollBy({ left: -sliderRef.current.clientWidth, behavior: "smooth" });
    }
  };

  const nextMonth = (e: React.MouseEvent) => {
    e?.stopPropagation();
    if (sliderRef.current) {
      sliderRef.current.scrollBy({ left: sliderRef.current.clientWidth, behavior: "smooth" });
    }
  };

  const prevYear = (e: React.MouseEvent) => {
    e?.stopPropagation();
    setBaseDate(new Date(activeY - 1, activeM, 1));
  };

  const nextYear = (e: React.MouseEvent) => {
    e?.stopPropagation();
    setBaseDate(new Date(activeY + 1, activeM, 1));
  };

  const selectDay = (selYear: number, selMonth: number, day: number) => {
    const m = String(selMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    onSave(`${selYear}-${m}-${d}`);
  };

  return createPortal(
    <div
      className="dp-popover"
      style={{ top: pos.top, left: pos.left }}
      ref={pickerRef}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      autoFocus
    >
      <div className="dp-header">
        <button onClick={view === "days" ? prevMonth : prevYear} className="dp-arrow">&larr;</button>
        <button 
          onClick={(e) => { e.stopPropagation(); setView(v => v === "days" ? "months" : "days"); }} 
          className="dp-title dp-title-btn"
        >
          {view === "days" ? `${MONTHS[activeM]} ${activeY}` : activeY}
        </button>
        <button onClick={view === "days" ? nextMonth : nextYear} className="dp-arrow">&rarr;</button>
      </div>

      {view === "months" ? (
        <div className="dp-months-grid">
          {MONTHS.map((m, i) => (
            <button 
              key={m} 
              className={`dp-month-btn ${i === activeM && view === "months" ? "current" : ""}`} 
              onClick={(e) => {
                e.stopPropagation();
                setBaseDate(new Date(activeY, i, 1));
                setView("days");
              }}
            >
              {m.slice(0, 3)}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="dp-grid dp-weekdays">
            {daysOfWeek.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div 
            className="dp-slider" 
            ref={sliderRef} 
            onScroll={handleScroll}
            onWheel={(e) => e.stopPropagation()} 
          >
            {Array.from({ length: 25 }).map((_, offsetIdx) => {
              const offset = offsetIdx - 12;
              const mDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1);
              const mYear = mDate.getFullYear();
              const mM = mDate.getMonth();
              
              let stOffset = mDate.getDay();
              if (weekStart === "monday") {
                stOffset = stOffset === 0 ? 6 : stOffset - 1;
              }
              const mDays = new Date(mYear, mM + 1, 0).getDate();

              return (
                <div key={offsetIdx} className="dp-slide">
                  <div className="dp-grid dp-days">
                    {Array.from({ length: stOffset }).map((_, i) => (
                      <span key={`empty-${i}`} className="dp-empty" />
                    ))}
                    {Array.from({ length: mDays }).map((_, i) => {
                      const day = i + 1;
                      let isSelected = false;
                      if (value) {
                        const vDate = parseLocalDate(value);
                        if (
                          vDate.getFullYear() === mYear &&
                          vDate.getMonth() === mM &&
                          vDate.getDate() === day
                        ) {
                          isSelected = true;
                        }
                      }
                      const today = new Date();
                      const isToday =
                        today.getFullYear() === mYear &&
                        today.getMonth() === mM &&
                        today.getDate() === day;

                      return (
                        <button
                          key={day}
                          className={`dp-day ${isSelected ? "selected" : ""} ${isToday && !isSelected ? "today" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectDay(mYear, mM, day);
                          }}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="dp-footer">
        <button onClick={(e) => { e.stopPropagation(); onSave(""); }} className="dp-btn dp-btn-clear">
          Clear
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const now = new Date();
            const m = String(now.getMonth() + 1).padStart(2, "0");
            const d = String(now.getDate()).padStart(2, "0");
            onSave(`${now.getFullYear()}-${m}-${d}`);
          }}
          className="dp-btn dp-btn-today"
        >
          Today
        </button>
      </div>
    </div>,
    document.body
  );
}
