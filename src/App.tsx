import React, { useEffect, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useAppContext } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UserProvider } from './context/UserContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { NotificationProvider } from './context/NotificationContext';
import { useIdleTimeout } from './hooks/useIdleTimeout';
import { ErrorBoundary } from './components/ErrorBoundary';
import Login from './components/Login';
import Layout from './components/Layout';
import { Toaster } from 'react-hot-toast';

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
  const { user, language } = useAppContext();
  const { isCheckingSession } = useAuth();
  
  // Initialize idle timeout
  useIdleTimeout();

  if (isCheckingSession) {
    return <LoadingFallback />;
  }

  if (!user) {
    return <Login />;
  }

  const isAdmin = user.role === 'Admin' || user.role === 'Administrator';

  return (
    <Layout>
      <Toaster position="top-center" reverseOrder={false} />
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
          
          {/* Admin Routes */}
          <Route path="/system-logs" element={isAdmin ? <SystemLogsManagement /> : <Navigate to="/dashboard" replace />} />
          <Route path="/system-errors" element={isAdmin ? <Navigate to="/system-logs" replace /> : <Navigate to="/dashboard" replace />} />
          <Route path="/error-logs" element={isAdmin ? <SystemErrorLogs /> : <Navigate to="/dashboard" replace />} />
          <Route path="/trail" element={isAdmin ? <AuditTrail /> : <Navigate to="/dashboard" replace />} />
          <Route path="/users" element={isAdmin ? <UserManagement /> : <Navigate to="/dashboard" replace />} />
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
      <QueryClientProvider client={queryClient}>
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
