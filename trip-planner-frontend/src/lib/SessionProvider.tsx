import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { login, register as registerApi, type AuthResponse } from "../api/authApi";
import { getCurrentUser, updatePreferences, type UserProfile } from "../api/userApi";
import { SessionContext, type Session } from "./stores";
import { applyTheme, savedTheme, switchTheme, type AccentColor } from "./theme";
import { clearImageCache } from "./images";
import { clearFileCache } from "./tripFiles";

/** Private photos and trip files fetched with the last account's token must not show for the next one. */
const clearCaches = () => { clearImageCache(); clearFileCache(); };

const fromAuth = (a: AuthResponse): UserProfile => ({ userId: a.userId, username: a.username, email: a.email, role: a.role, accentColor: a.accentColor, createdAt: a.createdAt });

export default function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(() => !!localStorage.getItem("token"));

  const setUser = useCallback((u: UserProfile) => { setUserState(u); applyTheme(u.accentColor ?? savedTheme()); }, []);

  useEffect(() => {
    applyTheme(savedTheme());
    if (!localStorage.getItem("token")) return;
    /* Only a rejected token is thrown away; a network error or a restarting server leaves it for the next try. */
    getCurrentUser().then(setUser).catch((e) => { const s = e?.response?.status; if (s === 401 || s === 403) localStorage.removeItem("token"); }).finally(() => setLoading(false));
  }, [setUser]);

  /* A theme picked on the sign-in page wins over the one saved on the account, and is saved as the new one. */
  const begin = useCallback((a: AuthResponse, theme?: AccentColor) => {
    localStorage.setItem("token", a.token); clearCaches();
    const u = fromAuth(a);
    if (theme && theme !== u.accentColor) { setUser({ ...u, accentColor: theme }); updatePreferences(theme).catch(() => undefined); }
    else setUser(u);
  }, [setUser]);

  const value = useMemo<Session>(() => ({
    user, loading, setUser,
    signIn: async (email, password, theme) => begin(await login(email, password), theme),
    register: async (username, email, password, theme) => begin(await registerApi(username, email, password), theme),
    signOut: () => { localStorage.removeItem("token"); sessionStorage.clear(); clearCaches(); setUserState(null); },
    setTheme: async (k: AccentColor, x?: number, y?: number) => {
      if (x != null && y != null) switchTheme(k, x, y); else applyTheme(k);
      if (user) setUserState({ ...user, accentColor: k });
      if (user) await updatePreferences(k);
    },
  }), [user, loading, setUser, begin]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
