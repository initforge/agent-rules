import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuthStore } from '@/store/useStore';

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      _hasHydrated: true,
    });
  });

  it('redirects to login when not authenticated', () => {
    render(
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route path="/dang-nhap" element={<div>login-page</div>} />
          <Route
            path="/secret"
            element={
              <ProtectedRoute>
                <div>protected</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('login-page')).toBeInTheDocument();
    expect(screen.queryByText('protected')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      _hasHydrated: true,
      user: {
        id: 'u1',
        email: 'a@test.com',
        full_name: 'Test',
        role: 'admin',
        created_at: new Date().toISOString(),
      },
    });
    render(
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route path="/dang-nhap" element={<div>login-page</div>} />
          <Route
            path="/secret"
            element={
              <ProtectedRoute>
                <div>protected</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('protected')).toBeInTheDocument();
    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
  });
});
