import { useContext } from "react";
import {
  BrowserRouter as Router, Routes, Route, Navigate,
} from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, AuthContext } from "@/contexts/AuthContext";
import { SocketProvider } from "@/contexts/SocketContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Enquiries from "@/pages/Enquiries";
import Bids from "@/pages/Bids";
import Marketplace from "@/pages/Marketplace";
import Reports from "@/pages/Reports";
import AuditLogs from "@/pages/AuditLogs";
import Profile from "@/pages/Profile";
import TwoFASetup from "@/pages/TwoFASetup";
import CalendarView from "@/pages/CalendarView";
import CustomerPortal from "@/pages/CustomerPortal";
import VerifyEmail from "@/pages/VerifyEmail";

const AppRoutes = () => {
  const { user, loading, twoFASetup, dismissTwoFASetup } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="min-h-screen w-full grid place-items-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-chart-2 animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading BidFlow…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {user && twoFASetup && (
        <TwoFASetup onClose={dismissTwoFASetup} />
      )}

      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" replace /> : <Login />}
        />

        <Route path="/share/:token" element={<CustomerPortal />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Dashboard />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/enquiries"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Enquiries />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/bids"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Bids />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/marketplace"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Marketplace />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <AppLayout>
                <CalendarView />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Profile />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <ProtectedRoute adminOnly>
              <AppLayout>
                <Reports />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/audit-logs"
          element={
          <ProtectedRoute>
            <AppLayout>
              <AuditLogs />
            </AppLayout>
          </ProtectedRoute>
          }
        />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <SocketProvider>
            <NotificationProvider>
              <TooltipProvider delayDuration={200}>
                <AppRoutes />
              </TooltipProvider>
            </NotificationProvider>
          </SocketProvider>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
