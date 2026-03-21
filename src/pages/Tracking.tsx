import React, { useState, useEffect } from 'react';
import { Activity, Plus, Search, Trash2, Edit2, Filter, Calendar, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Tracking() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const response = await fetch('/api/activities');
        if (response.ok) {
          const data = await response.json();
          setActivities(data);
        }
      } catch (err) {
        console.error("Error fetching activities:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchActivities();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Terminé': return 'bg-emerald-100 text-emerald-800';
      case 'En cours': return 'bg-blue-100 text-blue-800';
      case 'À faire': return 'bg-slate-100 text-slate-800';
      case 'Annulé': return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const filteredActivities = activities.filter(a => {
    return a.subject.toLowerCase().includes(searchTerm.toLowerCase()) || 
           a.customerName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (loading) return <div className="flex h-screen items-center justify-center">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Suivi d'activités</h2>
          <p className="text-slate-500 text-sm">Historique et planification des interactions clients</p>
        </div>
        <button className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-sm">
          <Plus size={20} />
          Nouvelle Activité
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <CheckCircle2 size={20} className="text-emerald-600" />
            <span className="text-sm font-medium">Terminées</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">12</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <Clock size={20} className="text-blue-600" />
            <span className="text-sm font-medium">À venir</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">5</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <AlertCircle size={20} className="text-red-600" />
            <span className="text-sm font-medium">En retard</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">2</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <Activity size={20} className="text-indigo-600" />
            <span className="text-sm font-medium">Total</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">19</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher une activité..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Sujet</th>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4">Date & Heure</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredActivities.map((activity) => (
                <tr key={activity.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="inline-flex px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded uppercase">
                      {activity.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-900 font-medium">{activity.subject}</td>
                  <td className="px-6 py-4 text-slate-700">{activity.customerName}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(activity.status)}`}>
                      {activity.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 flex items-center gap-2">
                    <Calendar size={14} className="text-slate-400" />
                    {activity.date}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                        <Edit2 size={16} />
                      </button>
                      <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
