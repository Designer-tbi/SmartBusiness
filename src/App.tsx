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
          <Route path="/public/quotes/:id" element={<QuotePublicView />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="calls" element={<Calls />} />
            <Route path="customers" element={<Customers />} />
            <Route path="users" element={<ProtectedRoute requiredRole="admin"><Users /></ProtectedRoute>} />
            <Route path="reports" element={<ProtectedRoute requiredRole="admin"><Reports /></ProtectedRoute>} />
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
            <Route path="sales-analysis" element={<SalesAnalysis />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
