import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { PhoneCall } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();

  const [showSetupGuide, setShowSetupGuide] = useState(false);

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
        if (response.status === 503) {
          setError("Erreur de connexion à la base de données.");
          setShowSetupGuide(true);
        } else {
          setError(data.error || 'Identifiants incorrects. Veuillez réessayer.');
        }
      }
    } catch (err: any) {
      console.error("Login error details:", err);
      setError("Erreur réseau. Vérifiez votre connexion internet.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-xl border border-slate-100">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-indigo-100 rounded-full flex items-center justify-center">
            <PhoneCall className="h-8 w-8 text-indigo-600" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-slate-900">
            SmartBusiness
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Connectez-vous à votre espace
          </p>
        </div>
        
        <div className="mt-8 space-y-6">
          <form className="space-y-4" onSubmit={handleLogin}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {showSetupGuide && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-sm text-amber-800 space-y-2">
                <p className="font-bold">Configuration de la base de données requise :</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Cliquez sur l'icône ⚙️ (Paramètres) en haut à droite.</li>
                  <li>Allez dans l'onglet <strong>Secrets</strong>.</li>
                  <li>Ajoutez ou modifiez <code>DATABASE_URL</code>.</li>
                  <li>Assurez-vous qu'il ne contient pas "base" comme hôte.</li>
                </ol>
                <p className="text-xs italic">L'application redémarrera automatiquement après l'enregistrement.</p>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label htmlFor="email-address" className="block text-sm font-medium text-slate-700">
                  Adresse email
                </label>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-slate-300 placeholder-slate-400 text-slate-900 rounded-lg focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="eden@tbi-center.fr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Mot de passe
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-slate-300 placeholder-slate-400 text-slate-900 rounded-lg focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Connexion en cours...' : 'Se connecter'}
              </button>
            </div>
            <div className="text-center text-sm">
              <span className="text-slate-500">Pas encore de compte ? </span>
              <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
                Créer un compte
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
