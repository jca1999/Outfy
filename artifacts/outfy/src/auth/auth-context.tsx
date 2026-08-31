import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as authApi from './auth-api';
import type { AuthUser } from './auth-api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (input: { username: string; password: string }) => Promise<AuthUser>;
  signUp: (input: {
    username: string;
    email: string;
    password: string;
    invitationCode: string;
  }) => Promise<authApi.AuthMessageResponse>;
  verifyEmail: (input: {
    email: string;
    token: string;
  }) => Promise<AuthUser>;
  resendVerificationCode: (
    input: { email: string },
  ) => Promise<authApi.AuthMessageResponse>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void authApi
      .getSession()
      .then((session) => {
        if (mounted) setUser(session.authenticated ? session.user : null);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async signIn(input) {
        const session = await authApi.signIn(input);
        const nextUser = session.user;
        if (!nextUser) throw new Error('La sesión no contiene un usuario.');
        setUser(nextUser);
        return nextUser;
      },
      signUp: authApi.signUp,
      async verifyEmail(input) {
        const session = await authApi.verifyEmail(input);
        const nextUser = session.user;
        if (!nextUser) throw new Error('La verificación no ha iniciado una sesión.');
        setUser(nextUser);
        return nextUser;
      },
      resendVerificationCode: authApi.resendVerificationCode,
      async signOut() {
        await authApi.signOut();
        setUser(null);
      },
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe utilizarse dentro de AuthProvider.');
  }
  return context;
}