import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/authStore';
import { ROLE_DEFAULT_ROUTE, ROLE_LABELS } from '@/modules/auth/authStore';

/**
 * RoleHomePage
 * Mounted at "/" — redirects each role to their designated home screen.
 * Super Admin / Hassan land here and see full dashboard.
 * All other roles are redirected immediately.
 */
const RoleHomePage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const defaultRoute = ROLE_DEFAULT_ROUTE[user.role];

    // Super admin and hassan stay on dashboard (route = '/')
    if (!defaultRoute || defaultRoute === '/') return;

    // Everyone else redirect to their home
    navigate(defaultRoute, { replace: true });
  }, [user]);

  if (!user) return null;

  const label = ROLE_LABELS[user.role] || user.role;
  const route = ROLE_DEFAULT_ROUTE[user.role];

  // For super_admin / hassan — show the normal dashboard
  // They won't be redirected
  if (!route || route === '/') {
    // Lazy import Dashboard inline
    const Dashboard = React.lazy(() => import('@/modules/shared/pages/Dashboard'));
    return (
      <React.Suspense fallback={<div style={{ padding: '40px', color: '#94a3b8', fontSize: '13px' }}>Loading...</div>}>
        <Dashboard />
      </React.Suspense>
    );
  }

  // For others — show a brief loading state while redirect happens
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '300px',
      gap: '12px',
      color: '#64748b',
      fontFamily: '-apple-system, "Segoe UI", sans-serif',
    }}>
      <div style={{
        width: '36px', height: '36px',
        border: '2px solid #e2e8f0',
        borderTopColor: '#2563eb',
        borderRadius: '50%',
        animation: 'spin .7s linear infinite',
      }}/>
      <div style={{ fontSize: '13px', fontWeight: 600 }}>
        {user.fullName || user.email}
      </div>
      <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#94a3b8' }}>
        {label}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default RoleHomePage;
