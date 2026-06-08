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

// Permissions: { moduleKey: { action: boolean } }
type ModulePermissions = Record<string, boolean>;
type UserPermissions = Record<string, ModulePermissions>;

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  permissions: UserPermissions;
  permissionsLoaded: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  setToken: (token: string) => void;
  fetchPermissions: () => Promise<void>;
  hasPermission: (moduleKey: string, action: string) => boolean;
  canAccessModule: (moduleKey: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  permissions: {},
  permissionsLoaded: false,

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

      // Fetch permissions after login
      get().fetchPermissions();

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
        permissions: {},
        permissionsLoaded: false,
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

      // Fetch permissions after user is loaded
      get().fetchPermissions();
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

  fetchPermissions: async () => {
    try {
      const { token, user } = get();
      if (!token || !user) return;

      // Super admin always has all permissions
      if (user.role === 'super_admin') {
        set({ permissionsLoaded: true });
        return;
      }

      const res = await fetch('/api/rbac/my-permissions', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        set({
          permissions: data.permissions || {},
          permissionsLoaded: true,
        });
      } else {
        // If RBAC not seeded yet, fall back to role-based defaults
        set({ permissionsLoaded: true });
      }
    } catch (error) {
      console.error('Fetch permissions error:', error);
      set({ permissionsLoaded: true });
    }
  },

  hasPermission: (moduleKey: string, action: string): boolean => {
    const { user, permissions } = get();

    // Super admin always has all permissions
    if (user?.role === 'super_admin') return true;

    // Check RBAC permissions
    const modulePerms = permissions[moduleKey];
    if (modulePerms && modulePerms[action] === true) {
      return true;
    }

    return false;
  },

  canAccessModule: (moduleKey: string): boolean => {
    const { user, permissions } = get();

    // Super admin always has access
    if (user?.role === 'super_admin') return true;

    // Check if user has any permission for this module (at minimum 'view')
    const modulePerms = permissions[moduleKey];
    if (modulePerms && (modulePerms.view === true || modulePerms.read === true)) {
      return true;
    }

    // Fallback: if permissions haven't been loaded yet, allow access
    // (backward compatibility before RBAC is seeded)
    return false;
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
