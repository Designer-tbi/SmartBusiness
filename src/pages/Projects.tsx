import React, { useState, useEffect } from 'react';
import { FolderKanban, Plus, Trash2, X, Save, Calendar } from 'lucide-react';

export default function Projects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', customerId: '', status: 'En cours', startDate: '', endDate: '', description: '' });

  const fetchData = async () => {
    try {
      const [p, c] = await Promise.all([fetch('/api/projects'), fetch('/api/customers')]);
      if (p.ok) setProjects(await p.json());
      if (c.ok) setCustomers(await c.json());
    } catch (e) {} finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (r.ok) { setShowForm(false); setForm({ name: '', customerId: '', status: 'En cours', startDate: '', endDate: '', description: '' }); fetchData(); }
    } catch (e) {}
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce projet ?')) return;
    await fetch(`/api/projects/${id}`, { method: 'DELETE' }); fetchData();
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-400">Chargement...</div>;

  return (
    <div className="space-y-6" data-testid="projects-page">
      <div className="flex justify-between items-center">
        <div><h2 className="text-2xl font-bold text-slate-800">Projets</h2><p className="text-slate-500 text-sm">{projects.length} projet{projects.length > 1 ? 's' : ''}</p></div>
        <button onClick={() => setShowForm(true)} data-testid="new-project-btn" className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 font-medium shadow-sm"><Plus size={20} /> Nouveau Projet</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(p => (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" data-testid={`project-card-${p.id}`}>
            <div className="flex justify-between items-start mb-3">
              <div><p className="font-bold text-slate-800">{p.name}</p><p className="text-xs text-slate-400">{p.customerName || 'Pas de client'}</p></div>
              <button onClick={() => handleDelete(p.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${p.status === 'Terminé' ? 'bg-emerald-100 text-emerald-700' : p.status === 'En pause' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{p.status}</span>
            {p.description && <p className="text-sm text-slate-500 mt-3 line-clamp-2">{p.description}</p>}
            {(p.startDate || p.endDate) && <p className="text-xs text-slate-400 mt-2 flex items-center gap-1"><Calendar size={12} />{p.startDate ? new Date(p.startDate).toLocaleDateString('fr-FR') : '?'} → {p.endDate ? new Date(p.endDate).toLocaleDateString('fr-FR') : '?'}</p>}
          </div>
        ))}
        {projects.length === 0 && <div className="col-span-3 text-center py-16 text-slate-400">Aucun projet</div>}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" data-testid="project-form-modal">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center"><h3 className="text-lg font-bold text-slate-800">Nouveau Projet</h3><button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-400" /></button></div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Nom du projet *</label><input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ex: Refonte site web" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Client</label><select value={form.customerId} onChange={e => setForm({...form, customerId: e.target.value})} className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-200 rounded-xl outline-none"><option value="">Aucun client</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Statut</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none"><option>En cours</option><option>En pause</option><option>Terminé</option><option>Annulé</option></select></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Date début</label><input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Date fin</label><input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Description</label><textarea rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description..." className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none resize-none" /></div>
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50">Annuler</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 flex items-center justify-center gap-2"><Save size={18} /> Créer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
