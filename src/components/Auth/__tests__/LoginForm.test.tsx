import { render, screen, fireEvent } from '@solidjs/testing-library';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Router, useNavigate, useLocation } from '@solidjs/router';
import { createSignal, Component } from 'solid-js';
import LoginForm from '../LoginForm';
import { AuthProvider } from '../../../contexts/AuthContext';

// Mock the auth context
const mockLogin = vi.fn();
const mockLogout = vi.fn();

// Mock the useAuth hook
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    login: mockLogin,
    logout: mockLogout,
    isInitialized: () => true,
  }),
}));

// Mock window.location
const originalLocation = window.location;

// Mock the router
const mockNavigate = vi.fn();
const mockLocation = {
  pathname: '/login',
  search: '?returnUrl=/game',
  hash: '',
  state: null,
  key: 'test',
};

// Mock the router hooks
vi.mock('@solidjs/router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
  A: (props: any) => {
    // Mock the A component to avoid router context issues
    const href = props.href || '';
    return (
      <a 
        {...props} 
        onClick={(e) => {
          e.preventDefault();
          mockNavigate(href);
        }}
      >
        {props.children}
      </a>
    );
  },
}));

// Set up the test environment
beforeEach(() => {
  // Mock window.location
  Object.defineProperty(window, 'location', {
    value: {
      pathname: '/login',
      search: '?returnUrl=/game',
      href: 'http://localhost/login',
      assign: vi.fn(),
      replace: vi.fn(),
    },
    writable: true,
  });
  
  // Reset mocks
  vi.clearAllMocks();
  mockLogin.mockReset();
  mockNavigate.mockReset();
});

// Clean up after tests
afterEach(() => {
  vi.clearAllMocks();
});

const renderLoginForm = (props = {}) => {
  return render(() => <LoginForm {...props} />);
};

describe('LoginForm', () => {
  it('renders the login form', async () => {
    renderLoginForm();
    
    // Check for the main heading
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    
    // Check for input fields
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    
    // Check for submit button
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    
    // Check for register link
    expect(screen.getByText(/register here/i)).toBeInTheDocument();
  });

  it('shows error message on login failure', async () => {
    const errorMessage = 'Invalid credentials';
    mockLogin.mockRejectedValueOnce(new Error(errorMessage));
    
    renderLoginForm();
    
    // Fill in the form
    fireEvent.input(screen.getByLabelText('Username'), { target: { value: 'testuser' } });
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'wrongpassword' } });
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    // Check if error message is displayed
    expect(await screen.findByText(errorMessage)).toBeInTheDocument();
  });

  it('redirects to game page on successful login', async () => {
    mockLogin.mockResolvedValueOnce({});
    
    renderLoginForm();
    
    // Fill in the form
    fireEvent.input(screen.getByLabelText('Username'), { target: { value: 'testuser' } });
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    // Check if login was called with correct credentials
    expect(mockLogin).toHaveBeenCalledWith('testuser', 'password123');
    
    // Wait for navigation to complete
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Check if navigation occurred
    expect(mockNavigate).toHaveBeenCalledWith('/game', { replace: true });
  });
});
