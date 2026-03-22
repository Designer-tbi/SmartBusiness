import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { 
  Calendar, 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Filter, 
  CheckCircle2, 
  Clock, 
  Phone, 
  Mail, 
  Users, 
  MessageSquare,
  AlertCircle
} from 'lucide-react';

export default function Activities() {
  const [activities, setActivities] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Form state
  const [type, setType] = useState('Appel');
  const [subject, setSubject] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [opportunityId, setOpportunityId] = useState('');
  const [status, setStatus] = useState('À faire');
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [notes, setNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const [actRes, custRes, leadsRes, oppsRes] = await Promise.all([
        fetch('/api/activities'),
        fetch('/api/customers'),
        fetch('/api/leads'),
        fetch('/api/opportunities')
      ]);
      
      if (actRes.ok) setActivities(await actRes.json());
      if (custRes.ok) setCustomers(await custRes.json());
      if (leadsRes.ok) setLeads(await leadsRes.json());
      if (oppsRes.ok) setOpportunities(await oppsRes.json());
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sb-hide-sidebar', { detail: showModal }));
    return () => {
      window.dispatchEvent(new CustomEvent('sb-hide-sidebar', { detail: false }));
    };
  }, [showModal]);

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setType('Appel');
    setSubject('');
    setCustomerId('');
    setLeadId('');
    setOpportunityId('');
    setStatus('À faire');
    setDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setNotes('');
    setEditingActivity(null);
    setError(null);
  };

  const handleEdit = (act: any) => {
    setEditingActivity(act);
    setType(act.type);
    setSubject(act.subject);
    setCustomerId(act.customer_id ? act.customer_id.toString() : '');
    setLeadId(act.lead_id ? act.lead_id.toString() : '');
    setOpportunityId(act.opportunity_id ? act.opportunity_id.toString() : '');
    setStatus(act.status);
    setDate(act.date ? act.date.substring(0, 16) : format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setNotes(act.notes || '');
    setError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload = {
      type,
      subject,
      customerId: customerId ? parseInt(customerId) : null,
      leadId: leadId ? parseInt(leadId) : null,
      opportunityId: opportunityId ? parseInt(opportunityId) : null,
      status,
      date,
      notes
    };

    try {
      const url = editingActivity ? `/api/activities/${editingActivity.id}` : '/api/activities';
      const method = editingActivity ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setShowModal(false);
        resetForm();
        fetchData();
      } else {
        const data = await response.json();
        setError(data.error || "Une erreur est survenue");
      }
    } catch (error) {
      setError("Erreur de connexion au serveur");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette activité ?")) return;
    
    try {
      const response = await fetch(`/api/activities/${id}`, { method: 'DELETE' });
      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error deleting activity:", error);
    }
  };

  const toggleStatus = async (act: any) => {
    const newStatus = act.status === 'Terminé' ? 'À faire' : 'Terminé';
    try {
      const response = await fetch(`/api/activities/${act.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...act, status: newStatus, customerId: act.customer_id, leadId: act.lead_id, opportunityId: act.opportunity_id }),
      });
      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const filteredActivities = activities.filter(act => {
    const matchesSearch = 
      act.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (act.customerName && act.customerName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || act.status === statusFilter;
    const matchesType = typeFilter === 'all' || act.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Terminé': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'En retard': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-amber-100 text-amber-700 border-amber-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Appel': return <Phone size={16} />;
      case 'Email': return <Mail size={16} />;
      case 'Réunion': return <Users size={16} />;
      case 'Message': return <MessageSquare size={16} />;
      default: return <Calendar size={16} />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Activités</h2>
          <p className="text-slate-500 text-sm">Gérez vos appels, réunions et tâches</p>
        </div>
        <button 
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
        >
          <Plus size={20} />
          Nouvelle Activité
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher une activité..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          >
            <option value="all">Tous les statuts</option>
            <option value="À faire">À faire</option>
            <option value="Terminé">Terminé</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-slate-400" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          >
            <option value="all">Tous les types</option>
            <option value="Appel">Appel</option>
            <option value="Email">Email</option>
            <option value="Réunion">Réunion</option>
            <option value="Message">Message</option>
            <option value="Tâche">Tâche</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm font-semibold">
                <th className="px-6 py-4 w-10"></th>
                <th className="px-6 py-4">Sujet</th>
                <th className="px-6 py-4">Client / Prospect</th>
                <th className="px-6 py-4">Date & Heure</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredActivities.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Aucune activité trouvée
                  </td>
                </tr>
              ) : (
                filteredActivities.map((act) => (
                  <tr key={act.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => toggleStatus(act)}
                        className={`p-1 rounded-full transition-colors ${act.status === 'Terminé' ? 'text-emerald-500 bg-emerald-50' : 'text-slate-300 hover:text-indigo-500 hover:bg-indigo-50'}`}
                      >
                        <CheckCircle2 size={20} />
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${getStatusColor(act.status)} border`}>
                          {getTypeIcon(act.type)}
                        </div>
                        <div>
                          <div className={`font-medium ${act.status === 'Terminé' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                            {act.subject}
                          </div>
                          <div className="text-xs text-slate-500">{act.type}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-700">{act.customerName}</div>
                      {act.opportunityTitle && (
                        <div className="text-xs text-indigo-600 font-medium">Opp: {act.opportunityTitle}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Clock size={14} className="text-slate-400" />
                        {format(new Date(act.date), 'dd MMM yyyy HH:mm', { locale: fr })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(act.status)}`}>
                        {act.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEdit(act)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(act.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full sm:max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
            <div className="sticky top-0 z-10 px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur-md">
              <h3 className="text-lg font-bold text-slate-900">
                {editingActivity ? 'Modifier l\'Activité' : 'Nouvelle Activité'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm flex items-center gap-2">
                  <AlertCircle size={18} />
                  {error}
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Sujet</label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    placeholder="Ex: Appel de suivi, Présentation produit..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="Appel">Appel</option>
                    <option value="Email">Email</option>
                    <option value="Réunion">Réunion</option>
                    <option value="Message">Message</option>
                    <option value="Tâche">Tâche</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Date & Heure</label>
                  <input
                    type="datetime-local"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Client</label>
                  <select
                    value={customerId}
                    onChange={(e) => {
                      setCustomerId(e.target.value);
                      if (e.target.value) { setLeadId(''); setOpportunityId(''); }
                    }}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="">Aucun client</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Prospect (Lead)</label>
                  <select
                    value={leadId}
                    onChange={(e) => {
                      setLeadId(e.target.value);
                      if (e.target.value) { setCustomerId(''); setOpportunityId(''); }
                    }}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="">Aucun prospect</option>
                    {leads.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.type === 'company' ? l.companyName : `${l.firstName} ${l.lastName}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Opportunité</label>
                  <select
                    value={opportunityId}
                    onChange={(e) => {
                      setOpportunityId(e.target.value);
                      if (e.target.value) {
                        const opp = opportunities.find(o => o.id.toString() === e.target.value);
                        if (opp) {
                          if (opp.customerId) { setCustomerId(opp.customerId.toString()); setLeadId(''); }
                          else if (opp.leadId) { setLeadId(opp.leadId.toString()); setCustomerId(''); }
                        }
                      }
                    }}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="">Aucune opportunité</option>
                    {opportunities.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none"
                    placeholder="Détails de l'activité..."
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-all"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting ? 'Enregistrement...' : editingActivity ? 'Modifier' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
