import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService, User } from '../services/auth';
import { ApiError } from '../services/api';
import { organizationsService, Org } from '../services/organizations';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  org: Org | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  createOrg: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchOrgSafe(): Promise<Org | null> {
  try {
    return await organizationsService.getMyOrg();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const [storedToken, storedUser] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));

        try {
          const me = await authService.me();
          setUser(me as User);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(me));
          const fetchedOrg = await fetchOrgSafe();
          setOrg(fetchedOrg);
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            await clearSession();
          }
        }
      }
    } catch (err) {
      console.error('Failed to restore session:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const clearSession = async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setToken(null);
    setUser(null);
    setOrg(null);
  };

  const login = useCallback(async (email: string, password: string) => {
    const response = await authService.login({ email, password });
    await AsyncStorage.setItem(TOKEN_KEY, response.access_token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(response.user));
    setToken(response.access_token);
    setUser(response.user);
    const fetchedOrg = await fetchOrgSafe();
    setOrg(fetchedOrg);
  }, []);

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const response = await authService.register({ email, password, name });
      await AsyncStorage.setItem(TOKEN_KEY, response.access_token);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(response.user));
      setToken(response.access_token);
      setUser(response.user);
      const fetchedOrg = await fetchOrgSafe();
      setOrg(fetchedOrg);
    },
    []
  );

  const logout = useCallback(async () => {
    await clearSession();
  }, []);

  const createOrg = useCallback(async (name: string) => {
    const newOrg = await organizationsService.create(name);
    setOrg(newOrg);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        org,
        isLoading,
        isAuthenticated: !!token && !!user,
        login,
        register,
        logout,
        createOrg,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return ctx;
}
