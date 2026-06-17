import React, { useEffect, useState, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QUERY_STALE_TIMES } from './lib/queryDefaults';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UserProvider, useUser } from './context/UserContext';
import { PreferencesProvider, usePreferences } from './context/PreferencesContext';
import { NotificationProvider } from './context/NotificationContext';
import { PermissionsProvider } from './context/PermissionsContext';
import { useIdleTimeout } from './hooks/useIdleTimeout';
import { MODULES } from './permissions';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ModuleErrorBoundary } from './components/ModuleErrorBoundary';
import { RequirePermission } from './components/RequirePermission';
import { SkipToContent } from './components/SkipToContent';
import { LiveRegion } from './components/LiveRegion';
import Login from './components/Login';
import AppShellSkeleton from './components/AppShellSkeleton';
import { UpdateNotification } from './components/UpdateNotification';
import { UNAUTHORIZED_EVENT } from './api';

// Auth-gated imports: Layout, Toaster, and NotificationToast are only imported
// after authentication is confirmed, keeping vendor-toast out of the critical path.
const Layout = lazy(() => import('./components/Layout'));

// Lazy load modules — these only load when their route activates (authenticated)
const Dashboard = lazy(() => import('./modules/Dashboard'));
const AuditPlan = lazy(() => import('./modules/AuditPlan'));
const RiskRegister = lazy(() => import('./modules/RiskRegister'));
const AuditFindings = lazy(() => import('./modules/AuditFindings'));
const AuditEvidence = lazy(() => import('./modules/AuditEvidence'));
const UserManagement = lazy(() => import('./modules/UserManagement'));
const JobTitles = lazy(() => import('./modules/JobTitles'));
const AuditTrail = lazy(() => import('./modules/AuditTrail'));
const Notifications = lazy(() => import('./modules/Notifications'));
const Settings = lazy(() => import('./modules/Settings'));
const AuditCharter = lazy(() => import('./modules/AuditCharter'));
const AuditTasks = lazy(() => import('./modules/AuditTasks'));
const Recommendations = lazy(() => import('./modules/Recommendations'));
const DepartmentManagement = lazy(() => import('./modules/DepartmentManagement'));
const Reports = lazy(() => import('./modules/Reports'));
const IntegrityManagement = lazy(() => import('./modules/IntegrityManagement'));
const SystemLogsManagement = lazy(() => import('./modules/SystemLogsManagement'));
const ComplianceMatrix = lazy(() => import('./modules/ComplianceMatrix'));
const OrgStructure = lazy(() => import('./modules/OrgStructure'));
const CorrespondenceSystem = lazy(() => import('./modules/Correspondence/CorrespondenceSystem'));
const SystemErrorLogs = lazy(() => import('./modules/SystemErrorLogs'));
const AuditProgramLibrary = lazy(() => import('./modules/AuditProgramLibrary'));

// Deferred imports for vendor-toast: loaded only after authentication is confirmed.
const Toaster = lazy(() => import('react-hot-toast').then(m => ({ default: m.Toaster })));
const NotificationToast = lazy(() => import('./components/NotificationToast'));

/**
 * Route-level loading skeleton shown inside Layout's Suspense boundary
 * while lazy route chunks are being fetched (authenticated state only).
 */
const RouteSkeleton = () => (
  <div className="flex items-center justify-center h-full min-h-[400px]">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
  </div>
);

const AppContent: React.FC = () => {
  const { user } = useUser();
  const { language } = usePreferences();
  const { isCheckingSession } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [routeAnnouncement, setRouteAnnouncement] = useState('');

  // Initialize idle timeout
  useIdleTimeout();

  // SPA-internal unauthorized handling (Req 23): the API client dispatches an
  // in-app `app:unauthorized` event instead of reloading the document via
  // `window.location.href`. Listen here (inside the Router context) and perform
  // a client-side navigation to the reachable `/login` route.
  useEffect(() => {
    const handleUnauthorized = () => {
      if (location.pathname !== '/login') {
        navigate('/login');
      }
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [navigate, location.pathname]);

  // Announce route changes to screen readers
  useEffect(() => {
    const pageName = location.pathname.replace('/', '') || 'dashboard';
    setRouteAnnouncement(`Navigated to ${pageName}`);
  }, [location.pathname]);

  // Phase 1: Session check — render CSS-only skeleton from critical CSS
  // No external dependencies needed; renders instantly from inlined styles.
  if (isCheckingSession) {
    return <AppShellSkeleton />;
  }

  // Phase 2: Unauthenticated — render only Login.
  // No Layout, no lazy routes, no vendor-forms, no vendor-toast chunks fetched.
  if (!user) {
    return <Login />;
  }

  // Phase 3: Authenticated — full App Shell with Layout, deferred providers,
  // and lazy routes. vendor-toast (Toaster) and Layout load here.
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Layout>
        <Toaster position="top-center" reverseOrder={false} />
        <NotificationToast />
        <LiveRegion message={routeAnnouncement} politeness="polite" />
        <Suspense fallback={<RouteSkeleton />}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
            <Route path="/dashboard" element={<ModuleErrorBoundary moduleName="Dashboard"><Dashboard /></ModuleErrorBoundary>} />
            <Route path="/charter" element={<ModuleErrorBoundary moduleName="AuditCharter"><AuditCharter /></ModuleErrorBoundary>} />
            <Route path="/plan" element={<ModuleErrorBoundary moduleName="AuditPlan"><AuditPlan /></ModuleErrorBoundary>} />
            <Route path="/tasks" element={<ModuleErrorBoundary moduleName="AuditTasks"><AuditTasks /></ModuleErrorBoundary>} />
            <Route path="/library" element={<ModuleErrorBoundary moduleName="AuditProgramLibrary"><AuditProgramLibrary /></ModuleErrorBoundary>} />
            <Route path="/findings" element={<ModuleErrorBoundary moduleName="AuditFindings"><AuditFindings /></ModuleErrorBoundary>} />
            <Route path="/evidence" element={<ModuleErrorBoundary moduleName="AuditEvidence"><AuditEvidence /></ModuleErrorBoundary>} />
            <Route path="/recommendations" element={<ModuleErrorBoundary moduleName="Recommendations"><Recommendations /></ModuleErrorBoundary>} />
            <Route path="/risks" element={<ModuleErrorBoundary moduleName="RiskRegister"><RiskRegister /></ModuleErrorBoundary>} />
            <Route path="/org-structure" element={<ModuleErrorBoundary moduleName="OrgStructure"><OrgStructure /></ModuleErrorBoundary>} />
            <Route path="/cms" element={<ModuleErrorBoundary moduleName="Correspondence"><CorrespondenceSystem language={language} /></ModuleErrorBoundary>} />
            <Route path="/reports" element={<ModuleErrorBoundary moduleName="Reports"><Reports /></ModuleErrorBoundary>} />
            <Route path="/integrity" element={<ModuleErrorBoundary moduleName="FraudLog"><IntegrityManagement /></ModuleErrorBoundary>} />
            <Route path="/fraud" element={<Navigate to="/integrity" replace />} />
            <Route path="/coi" element={<Navigate to="/integrity" replace />} />
            <Route path="/compliance-matrix" element={<ModuleErrorBoundary moduleName="ComplianceMatrix"><ComplianceMatrix /></ModuleErrorBoundary>} />
            <Route path="/notifications" element={<ModuleErrorBoundary moduleName="Notifications"><Notifications /></ModuleErrorBoundary>} />
            <Route path="/departments" element={<DepartmentManagement />} />
            
            {/* Permission-gated Routes */}
            <Route path="/system-logs" element={<RequirePermission module={MODULES.SYSTEM_LOGS}><SystemLogsManagement /></RequirePermission>} />
            <Route path="/system-errors" element={<RequirePermission module={MODULES.SYSTEM_LOGS}><Navigate to="/system-logs" replace /></RequirePermission>} />
            <Route path="/error-logs" element={<RequirePermission module={MODULES.SYSTEM_LOGS}><SystemErrorLogs /></RequirePermission>} />
            <Route path="/trail" element={<RequirePermission module={MODULES.SYSTEM_LOGS}><AuditTrail /></RequirePermission>} />
            <Route path="/users" element={<RequirePermission module={MODULES.USER_MANAGEMENT}><ModuleErrorBoundary moduleName="UserManagement"><UserManagement /></ModuleErrorBoundary></RequirePermission>} />
            <Route path="/job-titles" element={<Navigate to="/departments" replace />} />
            
            <Route path="/settings" element={<ModuleErrorBoundary moduleName="Settings"><Settings /></ModuleErrorBoundary>} />
            
            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </Suspense>
  );
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIMES.referenceData, // 5 min — global default (reference-data tier)
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <ErrorBoundary>
      <SkipToContent />
      <UpdateNotification />
      <QueryClientProvider client={queryClient}>
        {/* 
          Provider order is critical:
          UserProvider MUST wrap AuthProvider because AuthProvider calls useUser().
          Do NOT reorder these providers without updating the dependency chain.
        */}
        <UserProvider>
          <AuthProvider>
            <PreferencesProvider>
              <AppProvider>
                <PermissionsProvider>
                  <NotificationProvider>
                    <AppContent />
                  </NotificationProvider>
                </PermissionsProvider>
              </AppProvider>
            </PreferencesProvider>
          </AuthProvider>
        </UserProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
