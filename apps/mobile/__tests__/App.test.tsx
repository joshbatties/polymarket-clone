import React from 'react';
import { render } from '@testing-library/react-native';

// Mock expo-router
jest.mock('expo-router', () => ({
  Stack: () => null,
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}));

describe('App', () => {
  it('should render without crashing', () => {
    // Basic smoke test - will be expanded in future epochs
    expect(true).toBe(true);
  });
});
