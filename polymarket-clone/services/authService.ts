import { Alert } from 'react-native';

export interface User {
  id: string;
  email: string;
  username: string;
  profileImage?: string;
  walletAddress?: string;
  createdAt: Date;
  isEmailVerified: boolean;
  preferences: {
    notifications: boolean;
    emailAlerts: boolean;
    darkMode: boolean;
    currency: 'USD' | 'EUR' | 'GBP';
  };
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface SignupCredentials {
  email: string;
  password: string;
  username: string;
  confirmPassword: string;
}

interface WalletConnection {
  address: string;
  type: 'metamask' | 'walletconnect' | 'coinbase';
}

// Mock user storage
let currentUser: User | null = null;
let authState: AuthState = {
  isAuthenticated: false,
  user: null,
  isLoading: false,
};

// Mock users database
const mockUsers: User[] = [
  {
    id: 'user_1',
    email: 'demo@polymarket.com',
    username: 'DemoTrader',
    profileImage: undefined,
    walletAddress: '0x1234...5678',
    createdAt: new Date('2024-01-01'),
    isEmailVerified: true,
    preferences: {
      notifications: true,
      emailAlerts: false,
      darkMode: false,
      currency: 'USD',
    },
  },
];

// Auth state subscribers
type AuthSubscriber = (authState: AuthState) => void;
let authSubscribers: AuthSubscriber[] = [];

export class AuthService {
  static subscribe(callback: AuthSubscriber): () => void {
    authSubscribers.push(callback);
    
    // Return unsubscribe function
    return () => {
      authSubscribers = authSubscribers.filter(sub => sub !== callback);
    };
  }

  private static notifySubscribers(): void {
    authSubscribers.forEach(callback => callback({ ...authState }));
  }

  static getAuthState(): AuthState {
    return { ...authState };
  }

  static getCurrentUser(): User | null {
    return currentUser ? { ...currentUser } : null;
  }

  static async login(credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> {
    authState.isLoading = true;
    this.notifySubscribers();

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Validate credentials
      if (!credentials.email || !credentials.password) {
        return { success: false, error: 'Email and password are required' };
      }

      if (!this.isValidEmail(credentials.email)) {
        return { success: false, error: 'Please enter a valid email address' };
      }

      // Demo login - accept demo@polymarket.com with any password
      if (credentials.email === 'demo@polymarket.com') {
        currentUser = mockUsers[0];
        authState.isAuthenticated = true;
        authState.user = currentUser;
        
        // Store in localStorage for persistence (web)
        if (typeof window !== 'undefined') {
          localStorage.setItem('polymarket_user', JSON.stringify(currentUser));
        }

        return { success: true };
      }

      // Check if user exists
      const user = mockUsers.find(u => u.email === credentials.email);
      if (!user) {
        return { success: false, error: 'Account not found' };
      }

      // In real app, would verify password hash
      currentUser = user;
      authState.isAuthenticated = true;
      authState.user = currentUser;

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Login failed. Please try again.' };
    } finally {
      authState.isLoading = false;
      this.notifySubscribers();
    }
  }

  static async signup(credentials: SignupCredentials): Promise<{ success: boolean; error?: string }> {
    authState.isLoading = true;
    this.notifySubscribers();

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Validate input
      const validation = this.validateSignupCredentials(credentials);
      if (!validation.isValid) {
        return { success: false, error: validation.error };
      }

      // Check if user already exists
      const existingUser = mockUsers.find(u => 
        u.email === credentials.email || u.username === credentials.username
      );
      if (existingUser) {
        return { 
          success: false, 
          error: existingUser.email === credentials.email 
            ? 'Email already registered' 
            : 'Username already taken' 
        };
      }

      // Create new user
      const newUser: User = {
        id: `user_${Date.now()}`,
        email: credentials.email,
        username: credentials.username,
        createdAt: new Date(),
        isEmailVerified: false,
        preferences: {
          notifications: true,
          emailAlerts: false,
          darkMode: false,
          currency: 'USD',
        },
      };

      mockUsers.push(newUser);
      currentUser = newUser;
      authState.isAuthenticated = true;
      authState.user = currentUser;

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Signup failed. Please try again.' };
    } finally {
      authState.isLoading = false;
      this.notifySubscribers();
    }
  }

  static async connectWallet(connection: WalletConnection): Promise<{ success: boolean; error?: string }> {
    try {
      if (!currentUser) {
        return { success: false, error: 'Please log in first' };
      }

      // Simulate wallet connection
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Validate wallet address
      if (!this.isValidWalletAddress(connection.address)) {
        return { success: false, error: 'Invalid wallet address' };
      }

      // Update user with wallet address
      currentUser.walletAddress = connection.address;
      authState.user = currentUser;
      this.notifySubscribers();

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to connect wallet' };
    }
  }

  static async disconnectWallet(): Promise<{ success: boolean }> {
    if (currentUser) {
      currentUser.walletAddress = undefined;
      authState.user = currentUser;
      this.notifySubscribers();
    }
    return { success: true };
  }

  static async logout(): Promise<void> {
    currentUser = null;
    authState.isAuthenticated = false;
    authState.user = null;
    
    // Clear storage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('polymarket_user');
    }
    
    this.notifySubscribers();
  }

  static async updateProfile(updates: Partial<User>): Promise<{ success: boolean; error?: string }> {
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Validate updates
      if (updates.email && !this.isValidEmail(updates.email)) {
        return { success: false, error: 'Invalid email address' };
      }

      if (updates.username && updates.username.length < 3) {
        return { success: false, error: 'Username must be at least 3 characters' };
      }

      // Check for conflicts
      if (updates.email && updates.email !== currentUser.email) {
        const existingUser = mockUsers.find(u => u.email === updates.email && u.id !== currentUser.id);
        if (existingUser) {
          return { success: false, error: 'Email already in use' };
        }
      }

      if (updates.username && updates.username !== currentUser.username) {
        const existingUser = mockUsers.find(u => u.username === updates.username && u.id !== currentUser.id);
        if (existingUser) {
          return { success: false, error: 'Username already taken' };
        }
      }

      // Apply updates
      Object.assign(currentUser, updates);
      authState.user = currentUser;
      this.notifySubscribers();

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to update profile' };
    }
  }

  static async sendPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.isValidEmail(email)) {
        return { success: false, error: 'Please enter a valid email address' };
      }

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      const user = mockUsers.find(u => u.email === email);
      if (!user) {
        // Don't reveal if email exists for security
        return { success: true };
      }

      // In real app, would send email
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to send reset email' };
    }
  }

  static async verifyEmail(token: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!currentUser) {
        return { success: false, error: 'Not authenticated' };
      }

      // Simulate verification
      await new Promise(resolve => setTimeout(resolve, 1000));

      currentUser.isEmailVerified = true;
      authState.user = currentUser;
      this.notifySubscribers();

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Email verification failed' };
    }
  }

  // Utility methods
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private static isValidWalletAddress(address: string): boolean {
    // Basic Ethereum address validation
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  private static validateSignupCredentials(credentials: SignupCredentials): { isValid: boolean; error?: string } {
    if (!credentials.email || !credentials.password || !credentials.username || !credentials.confirmPassword) {
      return { isValid: false, error: 'All fields are required' };
    }

    if (!this.isValidEmail(credentials.email)) {
      return { isValid: false, error: 'Please enter a valid email address' };
    }

    if (credentials.username.length < 3) {
      return { isValid: false, error: 'Username must be at least 3 characters' };
    }

    if (credentials.username.length > 20) {
      return { isValid: false, error: 'Username must be less than 20 characters' };
    }

    if (!/^[a-zA-Z0-9_]+$/.test(credentials.username)) {
      return { isValid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }

    if (credentials.password.length < 8) {
      return { isValid: false, error: 'Password must be at least 8 characters' };
    }

    if (credentials.password !== credentials.confirmPassword) {
      return { isValid: false, error: 'Passwords do not match' };
    }

    return { isValid: true };
  }

  // Auto-login on app start (if user was previously logged in)
  static async initializeAuth(): Promise<void> {
    try {
      // Check for stored user (web only for demo)
      if (typeof window !== 'undefined') {
        const storedUser = localStorage.getItem('polymarket_user');
        if (storedUser) {
          const user = JSON.parse(storedUser);
          currentUser = user;
          authState.isAuthenticated = true;
          authState.user = user;
          this.notifySubscribers();
        }
      }
    } catch (error) {
      // Ignore errors during initialization
    }
  }

  // Demo helper
  static async loginAsDemo(): Promise<{ success: boolean; error?: string }> {
    return this.login({
      email: 'demo@polymarket.com',
      password: 'demo123',
    });
  }
}

// Initialize auth on service load
AuthService.initializeAuth(); 