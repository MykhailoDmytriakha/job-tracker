import { useState, useRef, useEffect } from "react";

type Theme = "light" | "dark" | "auto";

const options: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "\u2600\uFE0F" },
  { value: "dark", label: "Dark", icon: "\uD83C\uDF19" },
  { value: "auto", label: "System", icon: "\uD83D\uDCBB" },
];

function getEffective(theme: Theme): "light" | "dark" {
  if (theme !== "auto") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) || "auto"
  );
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const current = options.find((o) => o.value === theme)!;

  return (
    <div className="theme-switcher" ref={ref}>
      <button className="theme-toggle" onClick={() => setOpen(!open)}>
        {current.icon}
      </button>
      {open && (
        <div className="theme-dropdown">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`theme-option ${theme === opt.value ? "theme-option-active" : ""}`}
              onClick={() => {
                setTheme(opt.value);
                setOpen(false);
              }}
            >
              <span className="theme-option-icon">{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
