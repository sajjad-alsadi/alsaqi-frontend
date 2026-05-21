import React, { useEffect, useState, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UserProvider, useUser } from './context/UserContext';
import { PreferencesProvider, usePreferences } from './context/PreferencesContext';
import { NotificationProvider } from './context/NotificationContext';
import { useIdleTimeout } from './hooks/useIdleTimeout';
import { usePermissions } from './hooks/usePermissions';
import { MODULES } from './permissions';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SkipToContent } from './components/SkipToContent';
import { LiveRegion } from './components/LiveRegion';
import Login from './components/Login';
import Layout from './components/Layout';
import { Toaster } from 'react-hot-toast';
import NotificationToast from './components/NotificationToast';

// Lazy load modules for better performance
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

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full min-h-[400px]">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
  </div>
);

const AppContent: React.FC = () => {
  const { user } = useUser();
  const { language } = usePreferences();
  const { isCheckingSession } = useAuth();
  const { canView } = usePermissions();
  const location = useLocation();
  const [routeAnnouncement, setRouteAnnouncement] = useState('');
  
  // Initialize idle timeout
  useIdleTimeout();

  // Announce route changes to screen readers
  useEffect(() => {
    const pageName = location.pathname.replace('/', '') || 'dashboard';
    setRouteAnnouncement(`Navigated to ${pageName}`);
  }, [location.pathname]);

  if (isCheckingSession) {
    return <LoadingFallback />;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Layout>
      <Toaster position="top-center" reverseOrder={false} />
      <NotificationToast />
      <LiveRegion message={routeAnnouncement} politeness="polite" />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/charter" element={<AuditCharter />} />
          <Route path="/plan" element={<AuditPlan />} />
          <Route path="/tasks" element={<AuditTasks />} />
          <Route path="/library" element={<AuditProgramLibrary />} />
          <Route path="/findings" element={<AuditFindings />} />
          <Route path="/evidence" element={<AuditEvidence />} />
          <Route path="/recommendations" element={<Recommendations />} />
          <Route path="/risks" element={<RiskRegister />} />
          <Route path="/org-structure" element={<OrgStructure />} />
          <Route path="/cms" element={<CorrespondenceSystem language={language} />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/integrity" element={<IntegrityManagement />} />
          <Route path="/fraud" element={<Navigate to="/integrity" replace />} />
          <Route path="/coi" element={<Navigate to="/integrity" replace />} />
          <Route path="/compliance-matrix" element={<ComplianceMatrix />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/departments" element={<DepartmentManagement />} />
          
          {/* Permission-gated Routes */}
          <Route path="/system-logs" element={canView(MODULES.SYSTEM_LOGS) ? <SystemLogsManagement /> : <Navigate to="/dashboard" replace />} />
          <Route path="/system-errors" element={canView(MODULES.SYSTEM_LOGS) ? <Navigate to="/system-logs" replace /> : <Navigate to="/dashboard" replace />} />
          <Route path="/error-logs" element={canView(MODULES.SYSTEM_LOGS) ? <SystemErrorLogs /> : <Navigate to="/dashboard" replace />} />
          <Route path="/trail" element={canView(MODULES.SYSTEM_LOGS) ? <AuditTrail /> : <Navigate to="/dashboard" replace />} />
          <Route path="/users" element={canView(MODULES.USER_MANAGEMENT) ? <UserManagement /> : <Navigate to="/dashboard" replace />} />
          <Route path="/job-titles" element={<Navigate to="/departments" replace />} />
          
          <Route path="/settings" element={<Settings />} />
          
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <ErrorBoundary>
      <SkipToContent />
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
                <NotificationProvider>
                  <AppContent />
                </NotificationProvider>
              </AppProvider>
            </PreferencesProvider>
          </AuthProvider>
        </UserProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
