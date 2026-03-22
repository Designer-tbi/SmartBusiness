import React, { useState, useEffect } from 'react';
import { Briefcase, Plus, Search, Trash2, Edit2, Filter, Calendar, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Projects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch('/api/projects');
        if (response.ok) {
          const data = await response.json();
          setProjects(data);
        }
      } catch (err) {
        console.error("Error fetching projects:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Terminé': return 'bg-emerald-100 text-emerald-800';
      case 'En cours': return 'bg-blue-100 text-blue-800';
      case 'En attente': return 'bg-slate-100 text-slate-800';
      case 'Annulé': return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const filteredProjects = projects.filter(p => {
    return p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
           (p.customerName && p.customerName.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  if (loading) return <div className="flex h-screen items-center justify-center">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Projets</h2>
          <p className="text-slate-500 text-sm">Suivi et gestion des projets clients</p>
        </div>
        <button className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-sm">
          <Plus size={20} />
          Nouveau Projet
        </button>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher un projet..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Nom du Projet</th>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4">Date Début</th>
                <th className="px-6 py-4">Date Fin</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredProjects.map((project) => (
                <tr key={project.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-slate-900 font-medium">{project.name}</td>
                  <td className="px-6 py-4 text-slate-700">{project.customerName || 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                      {project.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">{project.startDate ? format(new Date(project.startDate), 'dd MMM yyyy', { locale: fr }) : '-'}</td>
                  <td className="px-6 py-4">{project.endDate ? format(new Date(project.endDate), 'dd MMM yyyy', { locale: fr }) : '-'}</td>
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
              {filteredProjects.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Aucun projet trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
