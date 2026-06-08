'use client';

import { create } from 'zustand';

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  currency: string;
  timezone: string;
  logo?: string | null;
}

interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
  tenantId?: string;
  tenant?: TenantInfo;
}

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  setToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string): Promise<boolean> => {
    try {
      set({ isLoading: true });
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      const { token, user } = data;

      if (typeof window !== 'undefined') {
        localStorage.setItem('tb_token', token);
      }

      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false,
      });

      return true;
    } catch (error: unknown) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      const { token } = get();
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('tb_token');
      }
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  fetchUser: async () => {
    try {
      const { token } = get();
      if (!token) {
        set({ isLoading: false });
        return;
      }

      const res = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('tb_token');
        }
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return;
      }

      const user = await res.json();
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      console.error('Fetch user error:', error);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('tb_token');
      }
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  setToken: (token: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('tb_token', token);
    }
    set({ token });
  },
}));

// Initialize auth state from localStorage on client
if (typeof window !== 'undefined') {
  const token = localStorage.getItem('tb_token');
  if (token) {
    useAuthStore.setState({ token, isLoading: true });
    useAuthStore.getState().fetchUser();
  } else {
    useAuthStore.setState({ isLoading: false });
  }
}
