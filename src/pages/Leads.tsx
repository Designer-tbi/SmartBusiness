import React, { useState, useEffect } from 'react';
import { UserPlus, Plus, Building2, User, Search, Trash2, Edit2, Filter, UserCheck, Target, MessageSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getZoneConfig } from '../lib/countryConfig';
import PhoneInput from '../components/PhoneInput';
import CurrencySelector from '../components/CurrencySelector';
import CommentsSection from '../components/CommentsSection';
import { useLivePoll } from '../hooks/useLivePoll';
import { LiveBadge } from '../components/LiveBadge';

export default function Leads() {
  const { profile } = useAuth();
  const zoneCfg = getZoneConfig(profile?.zone);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLeadIds, setNewLeadIds] = useState<Set<number>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editingLead, setEditingLead] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Form state
  const [type, setType] = useState<'individual' | 'company'>('individual');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('Nouveau');
  const [notes, setNotes] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [niu, setNiu] = useState('');
  const [currency, setCurrency] = useState<string>('');
  const [expandedComments, setExpandedComments] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchLeads = async () => {
    try {
      const response = await fetch('/api/leads');
      if (response.ok) {
        const data = await response.json();
        setLeads(data);
      }
    } catch (error) {
      console.error("Error fetching leads:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  // ─── LIVE POLLING (3s) — detect new leads and flag them ───────
  useLivePoll<any[]>('/api/leads', {
    intervalMs: 3000,
    onNewData: (fresh, prev) => {
      if (!Array.isArray(fresh) || !Array.isArray(prev)) return;
      const prevIds = new Set(prev.map((l: any) => l.id));
      const additions = fresh.filter((l: any) => !prevIds.has(l.id)).map((l: any) => l.id);
      if (additions.length > 0) {
        setNewLeadIds(current => {
          const next = new Set(current);
          additions.forEach((id: number) => next.add(id));
          return next;
        });
        // Auto-clear NEW badge after 15s
        setTimeout(() => {
          setNewLeadIds(current => {
            const next = new Set(current);
            additions.forEach((id: number) => next.delete(id));
            return next;
          });
        }, 15000);
      }
      setLeads(fresh);
      setLoading(false);
    },
  });

  const resetForm = () => {
    setType('individual');
    setFirstName('');
    setLastName('');
    setCompanyName('');
    setPhone('');
    setEmail('');
    setSource('');
    setStatus('Nouveau');
    setNotes('');
    setAddress('');
    setCity('');
    setNiu('');
    setEditingLead(null);
    setError(null);
  };

  const handleEdit = (lead: any) => {
    setEditingLead(lead);
    setType(lead.type);
    setFirstName(lead.firstName || '');
    setLastName(lead.lastName || '');
    setCompanyName(lead.companyName || '');
    setPhone(lead.phone || '');
    setEmail(lead.email || '');
    setSource(lead.source || '');
    setStatus(lead.status || 'Nouveau');
    setNotes(lead.notes || '');
    setAddress(lead.address || '');
    setCity(lead.city || '');
    setNiu(lead.niu || '');
    setError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload = {
      type,
      firstName: type === 'individual' ? firstName : null,
      lastName: type === 'individual' ? lastName : null,
      companyName: type === 'company' ? companyName : null,
      phone: phone || null,
      email: email || null,
      source: source || null,
      status,
      notes: notes ? `${niu ? `NIU: ${niu}\n` : ''}${notes}` : (niu ? `NIU: ${niu}` : null),
      address: address || null,
      city: city || null,
      currency: currency || null,
    };

    try {
      const url = editingLead ? `/api/leads/${editingLead.id}` : '/api/leads';
      const method = editingLead ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await fetchLeads();
        setShowModal(false);
        resetForm();
      } else {
        const data = await response.json();
        setError(data.error || "Une erreur est survenue lors de l'enregistrement.");
      }
    } catch (error) {
      console.error("Error saving lead:", error);
      setError("Erreur de connexion au serveur.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce lead ?')) return;

    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchLeads();
      }
    } catch (error) {
      console.error("Error deleting lead:", error);
    }
  };

  const handleConvertToCustomer = async (id: number) => {
    if (!window.confirm('Convertir ce prospect en client ? Le prospect sera marqué "Converti" et un nouveau client sera créé avec les infos du prospect.')) return;
    try {
      const response = await fetch(`/api/leads/${id}/convert-to-customer`, { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        fetchLeads();
        alert(`✅ Prospect converti en client (ID #${data.customerId}) ! Une activité d'onboarding a été programmée à J+2.`);
      } else {
        alert(`❌ Erreur: ${data.error || 'Conversion échouée'}`);
      }
    } catch (error: any) {
      alert(`❌ Erreur réseau: ${error.message}`);
      console.error("Error converting lead:", error);
    }
  };

  const handleConvertToOpportunity = async (lead: any) => {
    const title = window.prompt('Titre de l\'opportunité :', `Opportunité - ${lead.type === 'company' ? lead.companyName : lead.lastName}`);
    if (title === null) return;

    try {
      const response = await fetch(`/api/leads/${lead.id}/convert-to-opportunity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (response.ok) {
        fetchLeads();
        alert('Opportunité créée avec succès !');
      }
    } catch (error) {
      console.error("Error creating opportunity:", error);
    }
  };

  const filteredLeads = leads.filter(l => {
    const matchesSearch = (
      (l.firstName + ' ' + l.lastName).toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.phone?.includes(searchTerm)
    );
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Nouveau': return 'bg-blue-100 text-blue-800';
      case 'Contacté': return 'bg-amber-100 text-amber-800';
      case 'Qualifié': return 'bg-emerald-100 text-emerald-800';
      case 'Converti': return 'bg-purple-100 text-purple-800';
      case 'Perdu': return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">Leads (Prospects) <LiveBadge /></h2>
          <p className="text-slate-500 text-sm">Gérez vos prospects avant qu'ils ne deviennent des clients</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
        >
          <Plus size={20} />
          Nouveau Lead
        </button>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher un lead..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={18} className="text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full md:w-auto px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          >
            <option value="all">Tous les statuts</option>
            <option value="Nouveau">Nouveau</option>
            <option value="Contacté">Contacté</option>
            <option value="Qualifié">Qualifié</option>
            <option value="Converti">Converti</option>
            <option value="Perdu">Perdu</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Nom / Entreprise</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Source</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredLeads.map((lead) => (
                <React.Fragment key={lead.id}>
                <tr className={`hover:bg-slate-50 transition-colors ${newLeadIds.has(lead.id) ? 'bg-emerald-50/70' : ''}`} data-testid={`lead-row-${lead.id}`}>
                  <td className="px-6 py-4">
                    {newLeadIds.has(lead.id) && (
                      <span className="inline-block mr-2 text-[9px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider" data-testid={`lead-new-badge-${lead.id}`}>Nouveau</span>
                    )}
                    {lead.type === 'company' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        <Building2 size={12} />
                        Entreprise
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        <User size={12} />
                        Particulier
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">
                      {lead.type === 'company' ? lead.companyName : `${lead.firstName} ${lead.lastName}`}
                    </div>
                    <div className="text-xs text-slate-400">ID: #{lead.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-700">{lead.phone || '-'}</div>
                    <div className="text-xs text-slate-500">{lead.email || 'Pas d\'email'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-slate-600">{lead.source || '-'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(lead.status)}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandedComments(expandedComments === lead.id ? null : lead.id)}
                        title="Commentaires"
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        data-testid={`lead-comments-${lead.id}`}
                      >
                        <MessageSquare size={16} />
                      </button>
                      <button 
                        onClick={() => handleConvertToCustomer(lead.id)}
                        title="Convertir en Client"
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                      >
                        <UserCheck size={16} />
                      </button>
                      <button 
                        onClick={() => handleEdit(lead)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(lead.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedComments === lead.id && (
                  <tr>
                    <td colSpan={6} className="px-6 pb-4 bg-slate-50">
                      <CommentsSection entityType="lead" entityId={lead.id} compact />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
              {filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <UserPlus size={40} className="text-slate-200" />
                      <p>Aucun lead trouvé.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full sm:max-w-3xl lg:max-w-5xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
            <div className="sticky top-0 z-10 px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur-md">
              <h3 className="text-lg font-bold text-slate-900">
                {editingLead ? 'Modifier le Lead' : 'Nouveau Lead'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
                  {error}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Type de prospect</label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setType('individual')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 transition-all ${
                        type === 'individual' 
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                          : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                      }`}
                    >
                      <User size={18} />
                      Particulier
                    </button>
                    <button
                      type="button"
                      onClick={() => setType('company')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 transition-all ${
                        type === 'company' 
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                          : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                      }`}
                    >
                      <Building2 size={18} />
                      Entreprise
                    </button>
                  </div>
                </div>

                {type === 'individual' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Civilité</label>
                      <select className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all">
                        <option value="">-</option>
                        <option value="M.">M.</option>
                        <option value="Mme">Mme</option>
                        <option value="Mlle">Mlle</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Prénom *</label>
                      <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="Ex: Jean" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom *</label>
                      <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="Ex: Dupont" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Raison sociale *</label>
                      <input type="text" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="Ex: TBI Center SARL" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">NIU / RCCM</label>
                      <input type="text" value={niu} onChange={(e) => setNiu(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="Ex: M012345678901A" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Secteur d'activité</label>
                      <select className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all">
                        <option value="">Sélectionner...</option>
                        <option>BTP / Construction</option>
                        <option>Commerce / Distribution</option>
                        <option>Télécommunications</option>
                        <option>Banque / Finance</option>
                        <option>Transport / Logistique</option>
                        <option>Hôtellerie / Restauration</option>
                        <option>Santé / Pharmacie</option>
                        <option>Informatique / Tech</option>
                        <option>Services / Conseil</option>
                        <option>Autre</option>
                      </select>
                    </div>
                  </>
                )}

                <div className="md:col-span-2 border-t border-slate-100 pt-4 mt-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Contact</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Téléphone</label>
                  <PhoneInput value={phone} onChange={setPhone} zone={profile?.zone} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="contact@exemple.com" />
                </div>

                <div className="md:col-span-2 border-t border-slate-100 pt-4 mt-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Localisation</p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Adresse / Quartier</label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="Quartier, avenue, numéro..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Ville {zoneCfg.flag}</label>
                  <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all">
                    <option value="">Sélectionner une ville</option>
                    {zoneCfg.cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{zoneCfg.niuLabel}</label>
                  <input type="text" value={niu} onChange={(e) => setNiu(e.target.value)} placeholder={zoneCfg.niuPlaceholder} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono text-sm" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Devise prévue pour le devis</label>
                  <CurrencySelector value={currency} onChange={setCurrency} zone={profile?.zone} />
                </div>

                <div className="md:col-span-2 border-t border-slate-100 pt-4 mt-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Qualification</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Source</label>
                  <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all">
                    <option value="">Sélectionner une source</option>
                    <option value="Site Web">Site Web</option>
                    <option value="Recommandation">Recommandation</option>
                    <option value="Réseaux Sociaux">Réseaux Sociaux</option>
                    <option value="Publicité">Publicité</option>
                    <option value="Portefeuille">Portefeuille</option>
                    <option value="Appel entrant">Appel entrant</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Statut</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all">
                    <option value="Nouveau">Nouveau</option>
                    <option value="Contacté">Contacté</option>
                    <option value="Qualifié">Qualifié</option>
                    <option value="Converti">Converti</option>
                    <option value="Perdu">Perdu</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="Informations complémentaires..." />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2.5 text-sm font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Enregistrement...' : (editingLead ? 'Mettre à jour' : 'Créer le lead')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
