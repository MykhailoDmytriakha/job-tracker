import { useState, useEffect } from "react";
import { useAuth } from "../AuthContext";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api";
import type { ApiToken } from "../api";

export function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [newTokenName, setNewTokenName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);

  if (!user) return null;

  const initials = (user.name || user.email || "?")
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");

  function loadTokens() {
    authApi.listTokens().then(setTokens).catch(() => {});
  }

  useEffect(() => { loadTokens(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTokenName.trim() || creating) return;
    setCreating(true);
    try {
      const result = await authApi.createToken(newTokenName.trim());
      setCreatedToken(result.token);
      setNewTokenName("");
      loadTokens();
    } catch {
      // error handled by api.ts
    }
    setCreating(false);
  }

  async function handleDelete(id: number) {
    await authApi.deleteToken(id);
    loadTokens();
  }

  function handleCopy() {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

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
        <div className="profile-section-label">API Tokens</div>
        <p className="profile-token-desc">
          Tokens let CLI and scripts access your data. Each token is shown only once at creation.
        </p>

        {createdToken && (
          <div className="profile-token-created">
            <div className="profile-token-created-label">New token created. Copy it now - you won't see it again.</div>
            <div className="profile-token-created-row">
              <code className="profile-token-value">{createdToken}</code>
              <button className="profile-token-copy" onClick={handleCopy}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button className="profile-token-dismiss" onClick={() => setCreatedToken(null)}>
              Done
            </button>
          </div>
        )}

        <div className="profile-token-list">
          {tokens.map((t) => (
            <div key={t.id} className="profile-token-item">
              <div className="profile-token-item-info">
                <div className="profile-token-item-name">{t.name}</div>
                <div className="profile-token-item-meta">
                  <code>{t.token_prefix}...</code>
                  {t.last_used_at ? (
                    <span>Last used {new Date(t.last_used_at).toLocaleDateString()}</span>
                  ) : (
                    <span>Never used</span>
                  )}
                </div>
              </div>
              <button className="profile-token-delete" onClick={() => handleDelete(t.id)}>Revoke</button>
            </div>
          ))}
          {tokens.length === 0 && !createdToken && (
            <div className="profile-token-empty">No API tokens yet</div>
          )}
        </div>

        <form className="profile-token-form" onSubmit={handleCreate}>
          <input
            value={newTokenName}
            onChange={(e) => setNewTokenName(e.target.value)}
            placeholder="Token name (e.g. CLI laptop)"
            className="profile-token-input"
          />
          <button type="submit" className="profile-token-btn" disabled={creating || !newTokenName.trim()}>
            {creating ? "Creating..." : "Generate Token"}
          </button>
        </form>
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
