import { useState } from "react";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../AuthContext";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export function Login() {
  const { login } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="login">
        <div className="login-ambient" />
        <div className="login-card">
          <div className="login-mark">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="6" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="2" />
              <path d="M2 12h28" stroke="currentColor" strokeWidth="2" />
              <circle cx="7" cy="9" r="1.5" fill="currentColor" />
              <circle cx="12" cy="9" r="1.5" fill="currentColor" />
              <rect x="6" y="16" width="10" height="2" rx="1" fill="currentColor" opacity="0.4" />
              <rect x="6" y="20" width="7" height="2" rx="1" fill="currentColor" opacity="0.25" />
            </svg>
          </div>
          <h1 className="login-title">Job Tracker</h1>
          <p className="login-sub">Sign in to access your pipeline</p>

          <div className="login-divider" />

          <div className={`login-btn-wrap${loading ? " login-btn-wrap--loading" : ""}`}>
            {loading ? (
              <div className="login-spinner">
                <div className="login-spinner-ring" />
                <span>Signing in...</span>
              </div>
            ) : (
              <GoogleLogin
                onSuccess={async (response) => {
                  if (!response.credential) {
                    setError("No credential received from Google");
                    return;
                  }
                  setLoading(true);
                  setError("");
                  try {
                    await login(response.credential);
                  } catch {
                    setError("Login failed. Please try again.");
                    setLoading(false);
                  }
                }}
                onError={() => {
                  setError("Google sign-in was cancelled or failed.");
                }}
                theme={document.documentElement.getAttribute("data-theme") === "dark" ? "filled_black" : "outline"}
                size="large"
                width="300"
                text="signin_with"
                shape="pill"
              />
            )}
          </div>

          {error && (
            <div className="login-error">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {error}
            </div>
          )}

          <p className="login-footer">
            Your data stays private. We only use Google to verify your identity.
          </p>
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}
