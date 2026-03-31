import { useState } from "react";

type WeekStart = "monday" | "sunday";

function getSetting<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`jt_${key}`);
    return v !== null ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function setSetting(key: string, value: unknown) {
  localStorage.setItem(`jt_${key}`, JSON.stringify(value));
}

export function getWeekStart(): WeekStart {
  return getSetting<WeekStart>("weekStart", "monday");
}

export function Settings() {
  const [weekStart, setWeekStart] = useState<WeekStart>(() => getSetting("weekStart", "monday"));
  const [saved, setSaved] = useState(false);

  function handleWeekStart(value: WeekStart) {
    setWeekStart(value);
    setSetting("weekStart", value);
    flashSaved();
  }

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="settings-page">
      <h2 className="settings-title">Settings</h2>

      <div className="settings-section">
        <div className="settings-section-label">Date & Calendar</div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Week starts on</div>
            <div className="settings-row-desc">Choose which day begins your week in calendar views</div>
          </div>
          <div className="settings-row-control">
            <button
              className={`settings-toggle-btn ${weekStart === "monday" ? "active" : ""}`}
              onClick={() => handleWeekStart("monday")}
            >
              Monday
            </button>
            <button
              className={`settings-toggle-btn ${weekStart === "sunday" ? "active" : ""}`}
              onClick={() => handleWeekStart("sunday")}
            >
              Sunday
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-label">Appearance</div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Theme</div>
            <div className="settings-row-desc">Managed via the theme toggle in the navigation bar</div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-label">About</div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Job Tracker</div>
            <div className="settings-row-desc">Task management with dependencies, checklists, and pipeline tracking. Built with FastAPI + React + SQLite.</div>
          </div>
        </div>
      </div>

      {saved && <div className="settings-saved">Saved</div>}
    </div>
  );
}
