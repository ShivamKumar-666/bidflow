import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, AuthContext } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Enquiries from './pages/Enquiries';
import Bids from './pages/Bids';
import Reports from './pages/Reports';
import AuditLogs from './pages/AuditLogs';
import Profile from './pages/Profile';
import TwoFASetup from './pages/TwoFASetup';
import CalendarView from './pages/CalendarView';
import CustomerPortal from './pages/CustomerPortal';
import VerifyEmail from './pages/VerifyEmail';

const AppLayout = ({ children }) => {
  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        <Navbar />
        <div className="page-container">
          {children}
        </div>
      </div>
    </div>
  );
};

const AppRoutes = () => {
  const { user, twoFASetup, dismissTwoFASetup } = useContext(AuthContext);

  return (
    <>
      {/* 2FA Setup modal for Admin users on first login */}
      {user && twoFASetup && (
        <TwoFASetup onClose={dismissTwoFASetup} />
      )}
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
        
        <Route path="/share/:token" element={<CustomerPortal />} />
        <Route path="/verify-email" element={<VerifyEmail />} />


        <Route path="/dashboard" element={
          <ProtectedRoute>
            <AppLayout><Dashboard /></AppLayout>
          </ProtectedRoute>
        } />
        
        <Route path="/enquiries" element={
          <ProtectedRoute>
            <AppLayout><Enquiries /></AppLayout>
          </ProtectedRoute>
        } />
        
        <Route path="/bids" element={
          <ProtectedRoute>
            <AppLayout><Bids /></AppLayout>
          </ProtectedRoute>
        } />
        
        <Route path="/calendar" element={
          <ProtectedRoute>
            <AppLayout><CalendarView /></AppLayout>
          </ProtectedRoute>
        } />
        
        <Route path="/profile" element={
          <ProtectedRoute>
            <AppLayout><Profile /></AppLayout>
          </ProtectedRoute>
        } />
        
        <Route path="/reports" element={
          <ProtectedRoute>
            <AppLayout><Reports /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/audit-logs" element={
          <ProtectedRoute>
            <AppLayout><AuditLogs /></AppLayout>
          </ProtectedRoute>
        } />
        
        <Route path="/" element={<Navigate to="/dashboard" />} />
      </Routes>
    </>
  );
};


function App() {
  return (
    <AuthProvider>
      <Router>
        <NotificationProvider>
          <Toaster 
            position="top-right"
            toastOptions={{
              style: {
                background: '#1e293b',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.1)'
              },
              success: {
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#fff',
                },
              },
            }}
          />
          <AppRoutes />
        </NotificationProvider>
      </Router>
    </AuthProvider>
  );
}

export default App;
