import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { http } from './http';

// Cookie-based auth. The session lives in an HttpOnly cookie the worker sets on
// login, so JS can't read it - we ask the worker who we are (a probe against the
// admin health route, which is gated by session + admin role). 200 => authed,
// any error => show login. A mid-session 401 from any API call broadcasts
// `auth:unauthorized`, which drops us back to the login screen.

type Me = { ok: true; email: string; role: string };
type LoginResponse = { ok: true; role: string; fullName: string; email: string };
type Status = 'loading' | 'authed' | 'guest';

type AuthCtx = {
  status: Status;
  authed: boolean;
  email: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AuthCtx>({
  status: 'loading', authed: false, email: null, login: async () => {}, logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    http.get<Me>('/api/admin/health')
      .then((me) => { if (!cancelled) { setEmail(me.email); setStatus('authed'); } })
      .catch(() => { if (!cancelled) setStatus('guest'); });

    const onUnauth = () => { setStatus('guest'); setEmail(null); };
    window.addEventListener('auth:unauthorized', onUnauth);
    return () => { cancelled = true; window.removeEventListener('auth:unauthorized', onUnauth); };
  }, []);

  const login = async (e: string, password: string) => {
    const data = await http.post<LoginResponse>('/api/login', { email: e, password });
    if (data.role !== 'admin') throw new Error(`Account role "${data.role}" - admin access only.`);
    setEmail(data.email);
    setStatus('authed');
  };

  const logout = () => {
    http.post('/api/logout').catch(() => {});
    setStatus('guest');
    setEmail(null);
  };

  return (
    <Ctx.Provider value={{ status, authed: status === 'authed', email, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
