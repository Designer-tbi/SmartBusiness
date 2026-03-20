import React, { useState } from 'react';
import { Settings as SettingsIcon, Save, Bell, Shield, Globe, Clock } from 'lucide-react';

export default function Settings() {
  const [appName, setAppName] = useState('SmartBusiness CRM');
  const [notifications, setNotifications] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [language, setLanguage] = useState('fr');

  const handleSave = () => {
    // Mock save
    alert('Paramètres enregistrés avec succès !');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Paramètres du Système</h2>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Save size={20} />
          Enregistrer
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Globe className="text-indigo-600" size={20} />
              <h3 className="text-lg font-semibold text-slate-800">Général</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom de l'Application</label>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Langue par Défaut</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Bell className="text-indigo-600" size={20} />
              <h3 className="text-lg font-semibold text-slate-800">Notifications</h3>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900">Notifications Email</p>
                <p className="text-sm text-slate-500">Recevoir des alertes pour les nouveaux appels</p>
              </div>
              <button
                onClick={() => setNotifications(!notifications)}
                className={`w-12 h-6 rounded-full transition-colors relative ${notifications ? 'bg-indigo-600' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${notifications ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="text-indigo-600" size={20} />
              <h3 className="text-lg font-semibold text-slate-800">Sécurité</h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Mode Maintenance</span>
                <button
                  onClick={() => setMaintenanceMode(!maintenanceMode)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${maintenanceMode ? 'bg-red-500' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${maintenanceMode ? 'left-5.5' : 'left-0.5'}`} />
                </button>
              </div>
              <p className="text-xs text-slate-500">
                L'activation du mode maintenance empêchera les agents de se connecter.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Clock className="text-indigo-600" size={20} />
              <h3 className="text-lg font-semibold text-slate-800">Heures d'Ouverture</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Lundi - Vendredi</span>
                <span className="text-slate-900 font-medium">09:00 - 18:00</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Samedi</span>
                <span className="text-slate-900 font-medium">10:00 - 14:00</span>
              </div>
              <div className="flex justify-between text-sm text-red-500">
                <span>Dimanche</span>
                <span className="font-medium">Fermé</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
