import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, AuthContext } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Enquiries from './pages/Enquiries';
import Bids from './pages/Bids';
import Reports from './pages/Reports';

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
  const { user } = useContext(AuthContext);

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      
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
      
      <Route path="/reports" element={
        <ProtectedRoute>
          <AppLayout><Reports /></AppLayout>
        </ProtectedRoute>
      } />
      
      <Route path="/" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
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
      </Router>
    </AuthProvider>
  );
}

export default App;
