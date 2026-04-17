import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, ArrowRight, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        await refreshProfile();
        navigate('/');
      } else {
        const data = await response.json();
        setError(data.error || 'Identifiants incorrects.');
      }
    } catch (err) {
      setError("Erreur serveur. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" data-testid="login-page">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-indigo-500 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-center px-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <span className="text-3xl font-bold text-white tracking-tight">SmartBusiness</span>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Votre CRM intelligent<br />
            <span className="text-indigo-400">pour l'Afrique</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-md leading-relaxed">
            Gérez vos clients, prospects, devis et factures avec une plateforme conçue pour les entreprises africaines.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">100%</p>
              <p className="text-xs text-slate-500 mt-1">Cloud Sécurisé</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">FCFA</p>
              <p className="text-xs text-slate-500 mt-1">Devise Locale</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">24/7</p>
              <p className="text-xs text-slate-500 mt-1">Disponibilité</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-10">
            <div className="w-14 h-14 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">SmartBusiness</h2>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Connexion</h2>
            <p className="text-slate-500 mt-1">Accédez à votre espace de travail</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5" data-testid="login-form">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm flex items-center gap-2" data-testid="login-error">
                <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Adresse email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  data-testid="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  data-testid="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Votre mot de passe"
                  className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            <button
              data-testid="login-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Se connecter <ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-10">
            SmartBusiness CRM &copy; {new Date().getFullYear()} &mdash; TBI Center
          </p>
        </div>
      </div>
    </div>
  );
}
