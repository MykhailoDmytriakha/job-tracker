import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { authApi, getAuthToken, setAuthToken, clearAuthToken } from "./api";
import type { AuthUser } from "./api";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (credential: string) => Promise<void>;
  logout: () => void;
  authRequired: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
  authRequired: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const authRequired = !!GOOGLE_CLIENT_ID;

  const checkAuth = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const me = await authApi.me();
      setUser(me);
    } catch {
      clearAuthToken();
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authRequired) {
      checkAuth();
    } else {
      // No auth configured (local dev): skip login
      setUser({ id: 0, email: "dev@localhost", name: "Local Dev", picture: null, created_at: "" });
      setLoading(false);
    }
  }, [authRequired, checkAuth]);

  const login = async (credential: string) => {
    const { access_token } = await authApi.googleLogin(credential);
    setAuthToken(access_token);
    const me = await authApi.me();
    setUser(me);
  };

  const logout = () => {
    clearAuthToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, authRequired }}>
      {children}
    </AuthContext.Provider>
  );
}
