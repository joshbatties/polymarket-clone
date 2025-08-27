import { create } from 'zustand';
import { authService, User, RegisterData, LoginData } from '../services/authService';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  
  // Actions
  initialize: () => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  login: (data: LoginData) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setUser: (user: User | null) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    set({ isLoading: true });
    
    try {
      const isAuthenticated = await authService.initialize();
      
      if (isAuthenticated) {
        // Get user profile
        const user = await authService.getProfile();
        set({ 
          user, 
          isAuthenticated: true, 
          isInitialized: true,
          isLoading: false 
        });
      } else {
        set({ 
          user: null, 
          isAuthenticated: false, 
          isInitialized: true,
          isLoading: false 
        });
      }
    } catch (error) {
      console.error('Auth initialization failed:', error);
      set({ 
        user: null, 
        isAuthenticated: false, 
        isInitialized: true,
        isLoading: false 
      });
    }
  },

  register: async (data: RegisterData) => {
    set({ isLoading: true });
    
    try {
      await authService.register(data);
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  login: async (data: LoginData) => {
    set({ isLoading: true });
    
    try {
      await authService.login(data);
      
      // Get user profile after successful login
      const user = await authService.getProfile();
      
      set({ 
        user, 
        isAuthenticated: true, 
        isLoading: false 
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  verifyEmail: async (token: string) => {
    set({ isLoading: true });
    
    try {
      const result = await authService.verifyEmail(token);
      
      // Update user if verification was successful
      if (result.user) {
        set(state => ({
          user: state.user ? { ...state.user, ...result.user } : result.user,
          isLoading: false
        }));
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  resendVerification: async (email: string) => {
    set({ isLoading: true });
    
    try {
      await authService.resendEmailVerification(email);
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    
    try {
      await authService.logout();
      set({ 
        user: null, 
        isAuthenticated: false, 
        isLoading: false 
      });
    } catch (error) {
      // Even if logout request fails, clear local state
      console.error('Logout failed:', error);
      set({ 
        user: null, 
        isAuthenticated: false, 
        isLoading: false 
      });
    }
  },

  logoutAll: async () => {
    set({ isLoading: true });
    
    try {
      await authService.logoutAll();
      set({ 
        user: null, 
        isAuthenticated: false, 
        isLoading: false 
      });
    } catch (error) {
      // Even if logout request fails, clear local state
      console.error('Logout all failed:', error);
      set({ 
        user: null, 
        isAuthenticated: false, 
        isLoading: false 
      });
    }
  },

  refreshProfile: async () => {
    if (!get().isAuthenticated) return;
    
    try {
      const user = await authService.getProfile();
      set({ user });
    } catch (error) {
      console.error('Failed to refresh profile:', error);
      // If profile refresh fails due to auth error, logout
      if (error instanceof Error && error.message.includes('401')) {
        get().logout();
      }
    }
  },

  setUser: (user: User | null) => {
    set({ user, isAuthenticated: !!user });
  },

  setLoading: (isLoading: boolean) => {
    set({ isLoading });
  },
}));
