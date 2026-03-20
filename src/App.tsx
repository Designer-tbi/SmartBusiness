import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Calls from './pages/Calls';
import Customers from './pages/Customers';
import Users from './pages/Users';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Portfolio from './pages/Portfolio';
import Placeholder from './pages/Placeholder';
import Layout from './components/Layout';

const ProtectedRoute = ({ children, requiredRole }: { children: React.ReactNode, requiredRole?: 'admin' | 'agent' }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Chargement...</div>;
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && profile.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="calls" element={<Calls />} />
            <Route path="customers" element={<Customers />} />
            <Route path="users" element={<ProtectedRoute requiredRole="admin"><Users /></ProtectedRoute>} />
            <Route path="reports" element={<ProtectedRoute requiredRole="admin"><Reports /></ProtectedRoute>} />
            <Route path="settings" element={<ProtectedRoute requiredRole="admin"><Settings /></ProtectedRoute>} />
            
            {/* New Modules */}
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="opportunities" element={<Placeholder />} />
            <Route path="leads" element={<Placeholder />} />
            <Route path="quotes" element={<Placeholder />} />
            <Route path="invoices" element={<Placeholder />} />
            <Route path="commissions" element={<Placeholder />} />
            <Route path="tracking" element={<Placeholder />} />
            <Route path="activities" element={<Placeholder />} />
            <Route path="calendar" element={<Placeholder />} />
            <Route path="goals" element={<Placeholder />} />
            <Route path="catalog" element={<Placeholder />} />
            <Route path="products" element={<Placeholder />} />
            <Route path="projects" element={<Placeholder />} />
            <Route path="documents" element={<Placeholder />} />
            <Route path="sales-analysis" element={<Placeholder />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
