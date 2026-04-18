import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Target, Plus, Search, Trash2, Edit2, Filter, DollarSign, Calendar, TrendingUp, UserCheck, UserPlus } from 'lucide-react';

export default function Opportunities() {
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('all');

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [stage, setStage] = useState('Prospection');
  const [probability, setProbability] = useState('20');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const [oppsRes, custRes, leadsRes] = await Promise.all([
        fetch('/api/opportunities'),
        fetch('/api/customers'),
        fetch('/api/leads')
      ]);
      
      if (oppsRes.ok) {
        const oppsData = await oppsRes.json();
        setOpportunities(oppsData);
      }
      
      if (custRes.ok) {
        const custData = await custRes.json();
        setCustomers(custData);
      }

      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        setLeads(leadsData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setCustomerId('');
    setLeadId('');
    setTitle('');
    setAmount('');
    setStage('Prospection');
    setProbability('20');
    setExpectedCloseDate('');
    setNotes('');
    setEditingOpportunity(null);
    setError(null);
  };

  const handleEdit = (opp: any) => {
    setEditingOpportunity(opp);
    setCustomerId(opp.customerId ? opp.customerId.toString() : '');
    setLeadId(opp.leadId ? opp.leadId.toString() : '');
    setTitle(opp.title);
    setAmount(opp.amount.toString());
    setStage(opp.stage);
    setProbability(opp.probability.toString());
    setExpectedCloseDate(opp.expectedCloseDate ? opp.expectedCloseDate.split('T')[0] : '');
    setNotes(opp.notes || '');
    setError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload = {
      customerId: customerId ? parseInt(customerId) : null,
      leadId: leadId ? parseInt(leadId) : null,
      title,
      amount: parseFloat(amount),
      stage,
      probability: parseInt(probability),
      expectedCloseDate: expectedCloseDate || null,
      notes: notes || null,
    };

    try {
      const url = editingOpportunity ? `/api/opportunities/${editingOpportunity.id}` : '/api/opportunities';
      const method = editingOpportunity ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await fetchData();
        setShowModal(false);
        resetForm();
      } else {
        const data = await response.json();
        setError(data.error || "Une erreur est survenue lors de l'enregistrement.");
      }
    } catch (error) {
      console.error("Error saving opportunity:", error);
      setError("Erreur de connexion au serveur.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette opportunité ?')) return;

    try {
      const response = await fetch(`/api/opportunities/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error deleting opportunity:", error);
    }
  };

  const handleConvertToLead = async (opp: any) => {
    if (!window.confirm(`Convertir l'opportunité "${opp.title}" en lead ?`)) return;
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'company',
          companyName: opp.title,
          source: 'Opportunité',
          status: 'Qualifié',
          notes: `Converti depuis l'opportunité "${opp.title}". Montant: ${Number(opp.amount).toLocaleString()} FCFA.`
        }),
      });
      if (res.ok) {
        await fetch(`/api/opportunities/${opp.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...opp, stage: 'negotiation', probability: 50 })
        });
        fetchData();
        alert('Lead créé depuis l\'opportunité !');
      }
    } catch (error) { console.error("Error:", error); }
  };

  const handleConvertToCustomer = async (id: number) => {
    if (!window.confirm('Gagner cette opportunité et convertir en client ?')) return;
    try {
      const response = await fetch(`/api/opportunities/${id}/convert-to-customer`, { method: 'POST' });
      if (response.ok) {
        fetchData();
        alert('Opportunité gagnée et client créé !');
      }
    } catch (error) {
      console.error("Error converting opportunity:", error);
    }
  };

  const filteredOpportunities = opportunities.filter(o => {
    const matchesSearch = (
      o.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.leadName?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesStage = stageFilter === 'all' || o.stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'Prospection': return 'bg-slate-100 text-slate-800';
      case 'Qualification': return 'bg-blue-100 text-blue-800';
      case 'Proposition': return 'bg-indigo-100 text-indigo-800';
      case 'Négociation': return 'bg-amber-100 text-amber-800';
      case 'Gagnée': return 'bg-emerald-100 text-emerald-800';
      case 'Perdue': return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const totalValue = filteredOpportunities.reduce((sum, o) => sum + o.amount, 0);
  const weightedValue = filteredOpportunities.reduce((sum, o) => sum + (o.amount * o.probability / 100), 0);

  if (loading) return <div className="flex h-screen items-center justify-center">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Opportunités</h2>
          <p className="text-slate-500 text-sm">Suivez vos ventes en cours et prévisions de revenus</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
        >
          <Plus size={20} />
          Nouvelle Opportunité
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <DollarSign size={20} className="text-indigo-600" />
            <span className="text-sm font-medium">Valeur Totale</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalValue.toLocaleString()} FCFA</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <TrendingUp size={20} className="text-emerald-600" />
            <span className="text-sm font-medium">Valeur Pondérée</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{weightedValue.toLocaleString()} FCFA</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <Target size={20} className="text-blue-600" />
            <span className="text-sm font-medium">Nombre d'opportunités</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{filteredOpportunities.length}</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher une opportunité ou un client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={18} className="text-slate-400" />
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="w-full md:w-auto px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          >
            <option value="all">Toutes les étapes</option>
            <option value="Prospection">Prospection</option>
            <option value="Qualification">Qualification</option>
            <option value="Proposition">Proposition</option>
            <option value="Négociation">Négociation</option>
            <option value="Gagnée">Gagnée</option>
            <option value="Perdue">Perdue</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Opportunité</th>
                <th className="px-6 py-4">Client / Prospect</th>
                <th className="px-6 py-4">Montant</th>
                <th className="px-6 py-4">Étape</th>
                <th className="px-6 py-4">Probabilité</th>
                <th className="px-6 py-4">Clôture prévue</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredOpportunities.map((opp) => (
                <tr key={opp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{opp.title}</div>
                    <div className="text-xs text-slate-400">ID: #{opp.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    {opp.customerName ? (
                      <div className="text-slate-700 font-medium">{opp.customerName}</div>
                    ) : opp.leadName ? (
                      <div className="text-slate-700 font-medium italic">{opp.leadName} (Prospect)</div>
                    ) : (
                      <div className="text-slate-400 italic">Non assigné</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900">{opp.amount.toLocaleString()} FCFA</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStageColor(opp.stage)}`}>
                      {opp.stage}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500" 
                          style={{ width: `${opp.probability}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-600">{opp.probability}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Calendar size={14} className="text-slate-400" />
                      {opp.expectedCloseDate ? format(new Date(opp.expectedCloseDate), 'dd MMM yyyy', { locale: fr }) : '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {opp.stage !== 'Gagnée' && (
                        <>
                          <button 
                            onClick={() => handleConvertToLead(opp)}
                            title="Convertir en Lead"
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          >
                            <UserPlus size={16} />
                          </button>
                          <button 
                            onClick={() => handleConvertToCustomer(opp.id)}
                            title="Gagner & Convertir en Client"
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                          >
                            <UserCheck size={16} />
                          </button>
                        </>
                      )}
                      <button 
                        onClick={() => handleEdit(opp)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(opp.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredOpportunities.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <Target size={40} className="text-slate-200" />
                      <p>Aucune opportunité trouvée.</p>
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
                {editingOpportunity ? 'Modifier l\'Opportunité' : 'Nouvelle Opportunité'}
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
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Titre de l'opportunité</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    placeholder="Ex: Refonte site web - TBI Center"
                  />
                </div>

                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Client</label>
                    <select
                      value={customerId}
                      onChange={(e) => {
                        setCustomerId(e.target.value);
                        if (e.target.value) setLeadId(''); // Clear lead if customer selected
                      }}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    >
                      <option value="">Sélectionner un client</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Prospect (Lead)</label>
                    <select
                      value={leadId}
                      onChange={(e) => {
                        setLeadId(e.target.value);
                        if (e.target.value) setCustomerId(''); // Clear customer if lead selected
                      }}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    >
                      <option value="">Sélectionner un prospect</option>
                      {leads.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.type === 'company' ? l.companyName : `${l.firstName} ${l.lastName}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Montant (FCFA)</label>
                  <input
                    type="number"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Probabilité (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={probability}
                    onChange={(e) => setProbability(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Étape</label>
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="Prospection">Prospection</option>
                    <option value="Qualification">Qualification</option>
                    <option value="Proposition">Proposition</option>
                    <option value="Négociation">Négociation</option>
                    <option value="Gagnée">Gagnée</option>
                    <option value="Perdue">Perdue</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Date de clôture prévue</label>
                  <input
                    type="date"
                    value={expectedCloseDate}
                    onChange={(e) => setExpectedCloseDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    placeholder="Détails de l'opportunité..."
                  />
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
                  {isSubmitting ? 'Enregistrement...' : (editingOpportunity ? 'Mettre à jour' : 'Créer l\'opportunité')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
