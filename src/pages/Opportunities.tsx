import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Target, Plus, Search, Trash2, Edit2, Filter, DollarSign, Calendar, TrendingUp, UserCheck, UserPlus, MessageSquare, Package, X, Grid3x3, List as ListIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, getCurrencyLabel } from '../lib/countryConfig';
import CurrencySelector from '../components/CurrencySelector';
import CommentsSection from '../components/CommentsSection';

type OppItem = { productId?: number | null; description: string; quantity: number; unitPrice: number };

export default function Opportunities() {
  const { profile } = useAuth();
  const userZone = profile?.zone;
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [expandedComments, setExpandedComments] = useState<number | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<OppItem[]>([]);
  const [currency, setCurrency] = useState<string>('');
  const [stage, setStage] = useState('Prospection');
  const [probability, setProbability] = useState('20');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [notes, setNotes] = useState('');

  const totalAmount = items.reduce((acc, it) => acc + (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0), 0);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const [oppsRes, custRes, leadsRes, productsRes] = await Promise.all([
        fetch('/api/opportunities'),
        fetch('/api/customers'),
        fetch('/api/leads'),
        fetch('/api/products'),
      ]);
      if (oppsRes.ok) setOpportunities(await oppsRes.json());
      if (custRes.ok) setCustomers(await custRes.json());
      if (leadsRes.ok) setLeads(await leadsRes.json());
      if (productsRes.ok) setProducts(await productsRes.json());
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
    setItems([]);
    setCurrency('');
    setStage('Prospection');
    setProbability('20');
    setExpectedCloseDate('');
    setNotes('');
    setEditingOpportunity(null);
    setError(null);
  };

  const handleEdit = async (opp: any) => {
    setEditingOpportunity(opp);
    setCustomerId(opp.customerId ? opp.customerId.toString() : '');
    setLeadId(opp.leadId ? opp.leadId.toString() : '');
    setTitle(opp.title);
    setCurrency(opp.currency || '');
    setStage(opp.stage);
    setProbability(opp.probability.toString());
    setExpectedCloseDate(opp.expectedCloseDate ? opp.expectedCloseDate.split('T')[0] : '');
    setNotes(opp.notes || '');
    setError(null);
    setShowModal(true);
    // Fetch full opportunity (with items)
    try {
      const r = await fetch(`/api/opportunities/${opp.id}`);
      if (r.ok) {
        const data = await r.json();
        setItems((data.items || []).map((it: any) => ({
          productId: it.productId,
          description: it.description,
          quantity: Number(it.quantity) || 1,
          unitPrice: Number(it.unitPrice) || 0,
        })));
      }
    } catch (e) { console.error('Failed to load opportunity items', e); }
  };

  const addItem = (productId?: number) => {
    if (productId) {
      const p = products.find((p: any) => p.id === productId);
      if (p) {
        setItems([...items, { productId: p.id, description: p.name, quantity: 1, unitPrice: Number(p.price) || 0 }]);
        return;
      }
    }
    setItems([...items, { productId: null, description: '', quantity: 1, unitPrice: 0 }]);
  };
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, patch: Partial<OppItem>) => {
    const arr = [...items];
    arr[i] = { ...arr[i], ...patch };
    setItems(arr);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const cleanItems = items.filter(it => it.description?.trim());
    const payload = {
      customerId: customerId ? parseInt(customerId) : null,
      leadId: leadId ? parseInt(leadId) : null,
      title,
      amount: totalAmount,
      currency: currency || null,
      stage,
      probability: parseInt(probability),
      expectedCloseDate: expectedCloseDate || null,
      notes: notes || null,
      items: cleanItems,
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
      const res = await fetch(`/api/opportunities/${opp.id}/convert-to-lead`, { method: 'POST' });
      if (res.ok) {
        fetchData();
        alert('Lead créé avec les informations de l\'opportunité !');
      } else { alert('Erreur lors de la conversion.'); }
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

  const totalValue = filteredOpportunities.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
  const weightedValue = filteredOpportunities.reduce((sum, o) => sum + ((Number(o.amount) || 0) * (Number(o.probability) || 0) / 100), 0);

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
          <div className="text-2xl font-bold text-slate-900">{formatCurrency(totalValue, userZone)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <TrendingUp size={20} className="text-emerald-600" />
            <span className="text-sm font-medium">Valeur Pondérée</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{formatCurrency(weightedValue, userZone)}</div>
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
          <div className="flex items-center bg-slate-100 rounded-xl p-1" data-testid="view-mode-toggle">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              data-testid="view-grid-btn"
              className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow' : 'text-slate-500 hover:text-slate-700'}`}
              title="Vue grille"
            >
              <Grid3x3 size={18} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              data-testid="view-table-btn"
              className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white text-indigo-600 shadow' : 'text-slate-500 hover:text-slate-700'}`}
              title="Vue tableau"
            >
              <ListIcon size={18} />
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <OpportunitiesGrid
          opportunities={filteredOpportunities}
          userZone={userZone}
          getStageColor={getStageColor}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onConvertToLead={handleConvertToLead}
          onConvertToCustomer={handleConvertToCustomer}
          expandedComments={expandedComments}
          setExpandedComments={setExpandedComments}
        />
      ) : (
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
                <React.Fragment key={opp.id}>
                <tr className="hover:bg-slate-50 transition-colors">
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
                    <div className="font-semibold text-slate-900">{formatCurrency(opp.amount, userZone)}</div>
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
                      <button
                        onClick={() => setExpandedComments(expandedComments === opp.id ? null : opp.id)}
                        title="Commentaires"
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        data-testid={`opp-comments-${opp.id}`}
                      >
                        <MessageSquare size={16} />
                      </button>
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
                {expandedComments === opp.id && (
                  <tr>
                    <td colSpan={7} className="px-6 pb-4 bg-slate-50">
                      <CommentsSection entityType="opportunity" entityId={opp.id} compact />
                    </td>
                  </tr>
                )}
                </React.Fragment>
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
      )}

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

                <div className="md:col-span-2">
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border-2 border-indigo-200 p-4 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <label className="flex items-center gap-2 text-sm font-bold text-indigo-900">
                        <Package size={18} /> Sélectionner les produits / services
                      </label>
                      <div className="flex items-center gap-2">
                        <select
                          onChange={(e) => { if (e.target.value) { addItem(Number(e.target.value)); e.target.value = ''; } }}
                          data-testid="opp-product-picker"
                          className="px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        >
                          <option value="">+ Ajouter un produit du catalogue…</option>
                          {products.map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name} — {formatCurrency(p.price, userZone)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => addItem()}
                          data-testid="opp-add-custom-item-btn"
                          className="px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm hover:bg-indigo-50 text-indigo-700 font-medium"
                          title="Ligne personnalisée"
                        >
                          + Personnalisée
                        </button>
                      </div>
                    </div>

                    {items.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-sm italic">
                        Aucun produit sélectionné. Ajoutez-en un depuis le catalogue ou créez une ligne personnalisée.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {items.map((it, i) => {
                          const lineTotal = (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0);
                          return (
                            <div key={i} className="bg-white rounded-xl p-3 border border-slate-200 grid grid-cols-12 gap-2 items-center" data-testid={`opp-item-row-${i}`}>
                              <input
                                type="text"
                                value={it.description}
                                onChange={(e) => updateItem(i, { description: e.target.value })}
                                placeholder="Description"
                                className="col-span-12 md:col-span-5 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/30 outline-none"
                              />
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={it.quantity}
                                onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                                placeholder="Qté"
                                className="col-span-3 md:col-span-2 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-indigo-500/30 outline-none"
                              />
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={it.unitPrice}
                                onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
                                placeholder="P.U."
                                className="col-span-5 md:col-span-2 px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/30 outline-none"
                              />
                              <div className="col-span-3 md:col-span-2 text-right text-sm font-semibold text-slate-800">
                                {formatCurrency(lineTotal, userZone)}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeItem(i)}
                                className="col-span-1 text-red-500 hover:text-red-700 flex items-center justify-center"
                                title="Supprimer"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t-2 border-dashed border-indigo-300">
                      <span className="text-sm font-bold text-slate-700">💰 Montant total estimé</span>
                      <span className="text-2xl font-bold text-indigo-700" data-testid="opp-total-amount">
                        {formatCurrency(totalAmount, userZone)}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Devise</label>
                  <CurrencySelector value={currency} onChange={setCurrency} zone={userZone} />
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

// ============================================================================
// GRID VIEW COMPONENT
// ============================================================================
function OpportunitiesGrid({ opportunities, userZone, getStageColor, onEdit, onDelete, onConvertToLead, onConvertToCustomer, expandedComments, setExpandedComments }: any) {
  if (opportunities.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border-2 border-dashed border-slate-200 p-12 text-center">
        <Target size={48} className="mx-auto text-slate-300 mb-3" />
        <p className="text-slate-500">Aucune opportunité trouvée.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="opportunities-grid">
      {opportunities.map((opp: any) => (
        <div key={opp.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-lg hover:border-indigo-200 transition-all overflow-hidden flex flex-col" data-testid={`opp-card-${opp.id}`}>
          <div className="p-4 bg-gradient-to-br from-slate-50 to-indigo-50/40 border-b border-slate-100">
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStageColor(opp.stage)}`}>
                {opp.stage}
              </span>
              <span className="text-[10px] text-slate-400">#{opp.id}</span>
            </div>
            <h3 className="font-bold text-slate-800 text-base line-clamp-2 mb-1">{opp.title}</h3>
            <p className="text-xs text-slate-600 line-clamp-1">
              {opp.customerName ? (
                <>👤 {opp.customerName}</>
              ) : opp.leadName ? (
                <span className="italic">🌱 {opp.leadName} <span className="text-slate-400">(Prospect)</span></span>
              ) : (
                <span className="text-slate-400 italic">Non assigné</span>
              )}
            </p>
          </div>
          <div className="p-4 space-y-3 flex-1">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-500 font-medium">Montant</span>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(opp.amount, userZone)}</span>
            </div>
            {opp.itemsCount > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full w-fit">
                <Package size={12} /> {opp.itemsCount} produit{opp.itemsCount > 1 ? 's' : ''}
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Probabilité</span>
                <span className="font-bold text-slate-700">{opp.probability}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all" style={{ width: `${opp.probability}%` }} />
              </div>
            </div>
            {opp.expectedCloseDate && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Calendar size={12} className="text-slate-400" />
                Clôture : {format(new Date(opp.expectedCloseDate), 'dd MMM yyyy', { locale: fr })}
              </div>
            )}
          </div>
          <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-1.5 items-center">
            <button
              onClick={() => setExpandedComments(expandedComments === opp.id ? null : opp.id)}
              className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
              title="Commentaires"
              data-testid={`opp-grid-comments-${opp.id}`}
            >
              <MessageSquare size={15} />
            </button>
            {opp.stage !== 'Gagnée' && (
              <>
                <button onClick={() => onConvertToLead(opp)} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-white rounded-lg transition-all" title="Convertir en Lead">
                  <UserPlus size={15} />
                </button>
                <button onClick={() => onConvertToCustomer(opp.id)} className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-white rounded-lg transition-all" title="Gagner & Convertir">
                  <UserCheck size={15} />
                </button>
              </>
            )}
            <div className="ml-auto flex gap-1.5">
              <button onClick={() => onEdit(opp)} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-lg transition-all" title="Modifier" data-testid={`opp-edit-${opp.id}`}>
                <Edit2 size={15} />
              </button>
              <button onClick={() => onDelete(opp.id)} className="p-2 text-slate-500 hover:text-red-600 hover:bg-white rounded-lg transition-all" title="Supprimer">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
          {expandedComments === opp.id && (
            <div className="p-3 border-t border-slate-100 bg-slate-50/50">
              <CommentsSection entityType="opportunity" entityId={opp.id} compact />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
