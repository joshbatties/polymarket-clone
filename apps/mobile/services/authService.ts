import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001') + '/api/v1';

// Token storage keys
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  role: string;
  emailVerified: boolean;
  emailVerifiedAt?: string;
  mfaEnabled: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: User;
}

class AuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<string> | null = null;

  /**
   * Initialize auth service by loading stored tokens
   */
  async initialize(): Promise<boolean> {
    try {
      const [storedAccessToken, storedRefreshToken] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
      ]);

      if (storedAccessToken && storedRefreshToken) {
        this.accessToken = storedAccessToken;
        this.refreshToken = storedRefreshToken;
        
        // Verify token is still valid
        try {
          await this.getProfile();
          return true;
        } catch (error) {
          // Token might be expired, try to refresh
          try {
            await this.refreshAccessToken();
            return true;
          } catch (refreshError) {
            // Refresh failed, clear tokens
            await this.clearTokens();
            return false;
          }
        }
      }
      return false;
    } catch (error) {
      console.error('Auth initialization failed:', error);
      return false;
    }
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Registration failed');
    }

    return response.json();
  }

  /**
   * Login user
   */
  async login(data: LoginData): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const result = await response.json();

    if (result.accessToken && result.refreshToken) {
      await this.storeTokens(result.accessToken, result.refreshToken);
    }

    return result;
  }

  /**
   * Verify email address
   */
  async verifyEmail(token: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Email verification failed');
    }

    return response.json();
  }

  /**
   * Resend email verification
   */
  async resendEmailVerification(email: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to resend verification email');
    }

    return response.json();
  }

  /**
   * Get current user profile
   */
  async getProfile(): Promise<User> {
    const token = await this.getValidAccessToken();
    
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get profile');
    }

    const result = await response.json();
    return result.user;
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      if (this.refreshToken) {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.accessToken}`,
          },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });
      }
    } catch (error) {
      console.warn('Logout request failed:', error);
    } finally {
      await this.clearTokens();
    }
  }

  /**
   * Logout from all devices
   */
  async logoutAll(): Promise<void> {
    try {
      const token = await this.getValidAccessToken();
      
      await fetch(`${API_BASE_URL}/auth/logout-all`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
    } catch (error) {
      console.warn('Logout all request failed:', error);
    } finally {
      await this.clearTokens();
    }
  }

  /**
   * Get valid access token (auto-refresh if needed)
   */
  async getValidAccessToken(): Promise<string> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    // Check if token is likely expired (simple check - could be enhanced)
    if (this.isTokenLikelyExpired(this.accessToken)) {
      return this.refreshAccessToken();
    }

    return this.accessToken;
  }

  /**
   * Refresh access token
   */
  private async refreshAccessToken(): Promise<string> {
    // Prevent multiple simultaneous refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    this.refreshPromise = this.performTokenRefresh();
    
    try {
      const newToken = await this.refreshPromise;
      return newToken;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Perform the actual token refresh
   */
  private async performTokenRefresh(): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });

    if (!response.ok) {
      await this.clearTokens();
      throw new Error('Token refresh failed');
    }

    const result = await response.json();
    
    if (result.accessToken && result.refreshToken) {
      await this.storeTokens(result.accessToken, result.refreshToken);
      return result.accessToken;
    }

    throw new Error('Invalid refresh response');
  }

  /**
   * Store tokens securely
   */
  private async storeTokens(accessToken: string, refreshToken: string): Promise<void> {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;

    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
    ]);
  }

  /**
   * Clear stored tokens
   */
  private async clearTokens(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;

    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!(this.accessToken && this.refreshToken);
  }

  /**
   * Simple check if token is likely expired (based on JWT structure)
   * Note: This is a best-effort check without full JWT parsing
   */
  private isTokenLikelyExpired(token: string): boolean {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return true;

      const payload = JSON.parse(atob(parts[1]));
      const exp = payload.exp;
      
      if (!exp) return false;
      
      // Check if token expires in next 2 minutes (buffer for refresh)
      const expirationTime = exp * 1000;
      const bufferTime = 2 * 60 * 1000; // 2 minutes
      
      return Date.now() >= (expirationTime - bufferTime);
    } catch (error) {
      return true; // Assume expired if can't parse
    }
  }
}

export const authService = new AuthService();