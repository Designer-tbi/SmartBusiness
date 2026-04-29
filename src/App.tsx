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
import Leads from './pages/Leads';
import Opportunities from './pages/Opportunities';
import Quotes from './pages/Quotes';
import Activities from './pages/Activities';
import Calendar from './pages/Calendar';
import Catalog from './pages/Catalog';
import QuotePublicView from './pages/QuotePublicView';
import Invoices from './pages/Invoices';
import Commissions from './pages/Commissions';
import Tracking from './pages/Tracking';
import Products from './pages/Products';
import Projects from './pages/Projects';
import Objectives from './pages/Objectives';
import SalesAnalysis from './pages/SalesAnalysis';
import Placeholder from './pages/Placeholder';
import Documents from './pages/Documents';
import Sessions from './pages/Sessions';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import UserActivity from './pages/UserActivity';
import Layout from './components/Layout';

const ProtectedRoute = ({ children, requiredRole }: { children: React.ReactNode, requiredRole?: 'admin' | 'agent' | 'superadmin' }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Chargement...</div>;
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole) {
    if (profile.role === 'superadmin') return <>{children}</>;
    if (requiredRole === 'superadmin') return <Navigate to="/" replace />;
    if (requiredRole === 'admin' && profile.role !== 'admin') return <Navigate to="/" replace />;
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
          <Route path="/public/quotes/:id" element={<QuotePublicView />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="calls" element={<Calls />} />
            <Route path="customers" element={<Customers />} />
            <Route path="users" element={<ProtectedRoute requiredRole="admin"><Users /></ProtectedRoute>} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<ProtectedRoute requiredRole="admin"><Settings /></ProtectedRoute>} />
            
            {/* New Modules */}
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="opportunities" element={<Opportunities />} />
            <Route path="leads" element={<Leads />} />
            <Route path="quotes" element={<Quotes />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="commissions" element={<Commissions />} />
            <Route path="tracking" element={<Tracking />} />
            <Route path="activities" element={<Activities />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="goals" element={<Objectives />} />
            <Route path="catalog" element={<Catalog />} />
            <Route path="products" element={<Products />} />
            <Route path="projects" element={<Projects />} />
            <Route path="documents" element={<Documents />} />
            <Route path="sessions" element={<ProtectedRoute requiredRole="admin"><Sessions /></ProtectedRoute>} />
            <Route path="super-admin" element={<ProtectedRoute requiredRole="superadmin"><SuperAdminDashboard /></ProtectedRoute>} />
            <Route path="user-activity" element={<ProtectedRoute requiredRole="admin"><UserActivity /></ProtectedRoute>} />
            <Route path="sales-analysis" element={<SalesAnalysis />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
