import { useAuth } from "../AuthContext";
import { useNavigate } from "react-router-dom";

export function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const initials = (user.name || user.email || "?")
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");

  return (
    <div className="profile-page">
      <h2 className="profile-title">Account</h2>

      <div className="profile-card">
        <div className="profile-avatar-lg">
          {user.picture ? (
            <img src={user.picture} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span>{initials}</span>
          )}
        </div>

        <div className="profile-info">
          {user.name && <div className="profile-name">{user.name}</div>}
          <div className="profile-email">{user.email}</div>
          {user.created_at && (
            <div className="profile-since">
              Member since {new Date(user.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </div>
          )}
        </div>
      </div>

      <div className="profile-section">
        <div className="profile-section-label">Preferences</div>
        <div className="profile-row">
          <div className="profile-row-label">Timezone</div>
          <div className="profile-row-value">{user.timezone || "Not set"}</div>
        </div>
      </div>

      <div className="profile-section">
        <div className="profile-section-label">Session</div>
        <button
          className="profile-logout"
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
