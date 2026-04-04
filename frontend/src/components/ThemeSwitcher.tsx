import { useState, useEffect } from "react";

type Theme = "dark" | "auto" | "light";

function getEffective(theme: Theme): "light" | "dark" {
  if (theme !== "auto") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const THEMES: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "auto", label: "System" },
  { value: "light", label: "Light" },
];

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) || "auto"
  );

  useEffect(() => {
    const apply = () =>
      document.documentElement.setAttribute("data-theme", getEffective(theme));
    apply();
    localStorage.setItem("theme", theme);

    if (theme === "auto") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  const activeIndex = THEMES.findIndex((t) => t.value === theme);

  return (
    <div className="theme-pill" role="radiogroup" aria-label="Theme">
      <div
        className="theme-pill-indicator"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {THEMES.map((t) => (
        <button
          key={t.value}
          className={`theme-pill-btn${theme === t.value ? " theme-pill-btn--active" : ""}`}
          onClick={() => setTheme(t.value)}
          role="radio"
          aria-checked={theme === t.value}
          aria-label={t.label}
          title={t.label}
        >
          {t.value === "dark" && (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 9.5a5.5 5.5 0 01-7-7 5.5 5.5 0 107 7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {t.value === "auto" && (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M5.5 14h5M8 12v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          )}
          {t.value === "light" && (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.75 3.75l1.06 1.06M11.19 11.19l1.06 1.06M3.75 12.25l1.06-1.06M11.19 4.81l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}
