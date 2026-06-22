import React, { useState, useEffect } from 'react';
import { Plus, Search, Folder, Loader2, AlertCircle, ChevronLeft, Building2, Phone, Mail, Globe, MapPin, Hash, Map as MapIcon, List, UserPlus, ArrowRight, Trash2, Edit2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MapView from '../components/MapView';
import { useAuth } from '../contexts/AuthContext';
import { getZoneConfig } from '../lib/countryConfig';
import PhoneInput from '../components/PhoneInput';
import CommentsSection from '../components/CommentsSection';

interface Category {
  id: number;
  name: string;
  created_at: string;
  created_by?: string;
  createdByName?: string;
}

interface AgentOption {
  uid: string;
  name: string;
  email: string;
  role: string;
}

interface PortfolioItem {
  id: number;
  category_id: number;
  name: string;
  sub_type?: string;
  address?: string;
  city?: string;
  bp?: string;
  tel?: string;
  fax?: string;
  mail?: string;
  web?: string;
  niu?: string;
  status?: 'nouveau' | 'suivi' | 'en_cours' | 'a_recontacter' | 'gagne' | 'perdu' | 'termine';
  lost_reason?: string;
  agent_id?: string;
  agentName?: string;
  created_at: string;
}

// === Status mapping for visual badges ===
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; pulseColor: string; ring: string }> = {
  nouveau:        { label: 'Nouveau prospect', bg: 'bg-blue-500',    text: 'text-white', pulseColor: 'bg-blue-400',    ring: 'ring-blue-400/40' },
  suivi:          { label: 'En suivi',         bg: 'bg-amber-500',   text: 'text-white', pulseColor: 'bg-amber-300',   ring: 'ring-amber-400/40' },
  en_cours:       { label: 'En cours',         bg: 'bg-violet-600',  text: 'text-white', pulseColor: 'bg-violet-400',  ring: 'ring-violet-400/40' },
  a_recontacter:  { label: 'À recontacter',    bg: 'bg-cyan-500',    text: 'text-white', pulseColor: 'bg-cyan-300',    ring: 'ring-cyan-400/40' },
  gagne:          { label: 'Gagné',            bg: 'bg-emerald-600', text: 'text-white', pulseColor: 'bg-emerald-300', ring: 'ring-emerald-400/40' },
  perdu:          { label: 'Perdu',            bg: 'bg-rose-600',    text: 'text-white', pulseColor: 'bg-rose-300',    ring: 'ring-rose-400/40' },
  // legacy
  termine:        { label: 'Gagné',            bg: 'bg-emerald-600', text: 'text-white', pulseColor: 'bg-emerald-300', ring: 'ring-emerald-400/40' },
};

function StatusBadge({ status }: { status?: string }) {
  const cfg = STATUS_CONFIG[status || 'nouveau'] || STATUS_CONFIG.nouveau;
  const isStatic = status === 'gagne' || status === 'perdu' || status === 'termine';
  return (
    <div className={`absolute top-3 right-3 z-10 ${cfg.bg} ${cfg.text} px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-lg flex items-center gap-1.5 ring-2 ${cfg.ring}`}>
      {!isStatic && (
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.pulseColor} opacity-75`}></span>
          <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.pulseColor}`}></span>
        </span>
      )}
      {status === 'gagne' || status === 'termine' ? <span className="text-[12px]">✓</span> : null}
      {status === 'perdu' ? <span className="text-[12px]">✗</span> : null}
      <span>{cfg.label}</span>
    </div>
  );
}

export default function Portfolio() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';
  const zoneCfg = getZoneConfig(profile?.zone);
  const [expandedComments, setExpandedComments] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [viewAll, setViewAll] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>('all'); // admin only
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [selectedCategoryForAdd, setSelectedCategoryForAdd] = useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newItem, setNewItem] = useState({
    name: '',
    sub_type: '',
    address: '',
    city: '',
    bp: '',
    tel: '',
    fax: '',
    mail: '',
    web: '',
    niu: '',
    status: 'nouveau',
    lost_reason: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/users')
        .then(r => r.ok ? r.json() : [])
        .then((users: any[]) => setAgents(users.filter(u => u.role === 'agent' || u.role === 'admin' || u.role === 'superadmin')))
        .catch(() => {});
    }
  }, [isAdmin]);

  useEffect(() => {
    if (selectedCategory) {
      fetchItems(selectedCategory.id);
    } else if (viewAll) {
      fetchAllItems();
    }
  }, [selectedCategory, viewAll, agentFilter]);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/categories');
      if (!response.ok) throw new Error('Erreur lors du chargement des catégories');
      const data = await response.json();
      setCategories(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const buildAgentParam = () => (isAdmin && agentFilter !== 'all') ? `?userId=${encodeURIComponent(agentFilter)}` : '';

  const fetchItems = async (categoryId: number) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/categories/${categoryId}/items${buildAgentParam()}`);
      if (!response.ok) throw new Error('Erreur lors du chargement des éléments');
      const data = await response.json();
      setItems(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllItems = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/portfolio-items${buildAgentParam()}`);
      if (!response.ok) throw new Error('Erreur lors du chargement des éléments');
      const data = await response.json();
      setItems(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    try {
      setSubmitting(true);
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });

      if (!response.ok) throw new Error('Erreur lors de l\'ajout de la catégorie');
      
      await fetchCategories();
      setNewCategoryName('');
      setIsAddingCategory(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const categoryId = selectedCategory ? selectedCategory.id : selectedCategoryForAdd;
    if (!newItem.name.trim() || !categoryId) return;

    try {
      setSubmitting(true);
      const url = editingItemId ? `/api/portfolio-items/${editingItemId}` : '/api/portfolio-items';
      const method = editingItemId ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newItem, category_id: categoryId }),
      });

      if (!response.ok) throw new Error('Erreur lors de l\'enregistrement');
      
      if (selectedCategory) {
        await fetchItems(selectedCategory.id);
      } else if (viewAll) {
        await fetchAllItems();
      }
      setNewItem({
        name: '',
        sub_type: '',
        address: '',
        city: '',
        bp: '',
        tel: '',
        fax: '',
        mail: '',
        web: '',
        niu: '',
        status: 'nouveau',
        lost_reason: '',
      });
      setSelectedCategoryForAdd(null);
      setIsAddingItem(false);
      setEditingItemId(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditItem = (item: PortfolioItem) => {
    setNewItem({
      name: item.name || '',
      sub_type: item.sub_type || '',
      address: item.address || '',
      city: item.city || '',
      bp: item.bp || '',
      tel: item.tel || '',
      fax: item.fax || '',
      mail: item.mail || '',
      web: item.web || '',
      niu: item.niu || '',
      status: item.status || 'nouveau',
      lost_reason: item.lost_reason || '',
    });
    setEditingItemId(item.id);
    setSelectedCategoryForAdd(item.category_id);
    setIsAddingItem(true);
    // Scroll to top so user sees the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filteredCategories = categories.filter(cat => 
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredItems = items.filter(item => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sub_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.city?.toLowerCase().includes(searchQuery.toLowerCase());
    let itemStatus = (item.status || 'nouveau') as string;
    if (itemStatus === 'termine') itemStatus = 'gagne';
    const matchesStatus = !statusFilter || itemStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Counters for status chips (computed on UN-filtered items so users see total counts)
  // Treat legacy 'termine' as 'gagne'
  const statusCounts = items.reduce(
    (acc, it) => {
      let s = (it.status || 'nouveau') as string;
      if (s === 'termine') s = 'gagne';
      if (s in acc) acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    { nouveau: 0, suivi: 0, en_cours: 0, a_recontacter: 0, gagne: 0, perdu: 0 } as Record<string, number>
  );

  const handleConvertToOpportunity = async (item: PortfolioItem) => {
    try {
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Opportunité - ${item.name}`,
          amount: 0,
          stage: 'Prospection',
          probability: 10,
          notes: `Converti depuis le portefeuille.\nTél: ${item.tel || 'N/A'}\nEmail: ${item.mail || 'N/A'}\nAdresse: ${item.address || 'N/A'} - ${item.city || 'N/A'}\nNIU: ${item.niu || 'N/A'}\nType: ${item.sub_type || 'N/A'}`
        }),
      });
      if (res.ok) {
        alert(`"${item.name}" converti en opportunité !`);
        navigate('/opportunities');
      } else { alert("Erreur lors de la conversion."); }
    } catch (err) { alert("Erreur réseau."); }
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm('Supprimer cet établissement ?')) return;
    try {
      await fetch(`/api/portfolio-items/${id}`, { method: 'DELETE' });
      if (selectedCategory) fetchItems(selectedCategory.id);
      else if (viewAll) fetchAllItems();
    } catch (err) { console.error(err); }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('Supprimer cette catégorie et tous ses établissements ?')) return;
    try {
      await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      fetchCategories();
    } catch (err) { console.error(err); }
  };

  if (loading && categories.length === 0 && !selectedCategory && !viewAll) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-indigo-500" size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {(selectedCategory || viewAll) && (
            <button 
              onClick={() => {
                setSelectedCategory(null);
                setViewAll(false);
                setItems([]);
                setSearchQuery('');
              }}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <ChevronLeft size={24} className="text-slate-600" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {selectedCategory ? selectedCategory.name : viewAll ? 'Tous les établissements' : 'Portefeuille Client'}
            </h1>
            <p className="text-slate-500">
              {selectedCategory 
                ? `Liste des établissements dans ${selectedCategory.name.toLowerCase()}`
                : viewAll
                  ? 'Liste complète de tous les établissements'
                  : 'Gérez vos catégories de clients par secteur d\'activité.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!selectedCategory && !viewAll && (
            <button
              onClick={() => setViewAll(true)}
              className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
            >
              <Building2 size={20} />
              Voir tous les établissements
            </button>
          )}
          {!selectedCategory && !viewAll ? (
            <button
              onClick={() => setIsAddingCategory(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus size={20} />
              Nouvelle Catégorie
            </button>
          ) : selectedCategory ? (
            <button
              onClick={() => setIsAddingItem(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus size={20} />
              Ajouter un établissement
            </button>
          ) : viewAll ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAddingItem(true)}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Plus size={20} />
                Ajouter un établissement
              </button>
              <button
                onClick={() => { setViewAll(false); setIsAddingCategory(true); }}
                className="flex items-center gap-2 bg-white text-indigo-600 border border-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-50 transition-colors shadow-sm"
              >
                <Plus size={20} />
                Nouvelle Catégorie
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3">
          <AlertCircle size={20} />
          <p>{error}</p>
        </div>
      )}

      {/* Search and View Toggle */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder={(selectedCategory || viewAll) ? "Rechercher un établissement..." : "Rechercher une catégorie..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
        </div>
        {isAdmin && (
          <select
            data-testid="admin-agent-filter"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            title="Filtrer par utilisateur (admin uniquement)"
          >
            <option value="all">👥 Tous les utilisateurs</option>
            {agents.map(a => (
              <option key={a.uid} value={a.uid}>
                {a.role === 'agent' ? '🧑‍💼' : '👑'} {a.name} ({a.email})
              </option>
            ))}
          </select>
        )}
        {(selectedCategory || viewAll) && (
          <div className="flex bg-white border border-slate-200 rounded-lg p-1 shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md transition-colors ${
                viewMode === 'list' 
                  ? 'bg-indigo-50 text-indigo-700 font-medium' 
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <List size={18} />
              Liste
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md transition-colors ${
                viewMode === 'map' 
                  ? 'bg-indigo-50 text-indigo-700 font-medium' 
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <MapIcon size={18} />
              Carte
            </button>
          </div>
        )}
      </div>

      {/* Add Category Form */}
      {isAddingCategory && !selectedCategory && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <form onSubmit={handleAddCategory} className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="categoryName" className="block text-sm font-medium text-slate-700 mb-1.5">
                Nom de la catégorie
              </label>
              <input
                id="categoryName"
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Ex: IMMOBILIER"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                autoFocus
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={submitting || !newCategoryName.trim()}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {submitting && <Loader2 className="animate-spin" size={18} />}
                Ajouter
              </button>
              <button
                type="button"
                onClick={() => setIsAddingCategory(false)}
                className="px-6 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add/Edit Item Form — MODAL POPUP */}
      {isAddingItem && (selectedCategory || viewAll) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setIsAddingItem(false); setEditingItemId(null); setNewItem({ name: '', sub_type: '', address: '', city: '', bp: '', tel: '', fax: '', mail: '', web: '', niu: '', status: 'nouveau', lost_reason: '' }); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden" data-testid="portfolio-item-form">
            <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold text-slate-800">
                  {editingItemId ? '✏️ Modifier l\'établissement' : '➕ Nouvel établissement'}
                </h3>
                {editingItemId && (
                  <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-bold uppercase tracking-wider">Mode édition</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setIsAddingItem(false); setEditingItemId(null); setNewItem({ name: '', sub_type: '', address: '', city: '', bp: '', tel: '', fax: '', mail: '', web: '', niu: '', status: 'nouveau', lost_reason: '' }); }}
                className="p-2 hover:bg-white rounded-full transition-all text-slate-400"
                title="Fermer"
              >
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddItem} className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {viewAll && !selectedCategory && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Catégorie *</label>
                  <select
                    required
                    value={selectedCategoryForAdd || ''}
                    onChange={(e) => setSelectedCategoryForAdd(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  >
                    <option value="">Choisir une catégorie...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom de l'établissement *</label>
                <input
                  type="text"
                  required
                  value={newItem.name}
                  onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  data-testid="portfolio-item-name-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">📊 Suivi commercial</label>
                <select
                  value={newItem.status}
                  onChange={(e) => setNewItem({...newItem, status: e.target.value})}
                  data-testid="portfolio-item-status-select"
                  className={`w-full px-4 py-2.5 bg-white border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold ${
                    newItem.status === 'nouveau' ? 'border-blue-400 text-blue-700' :
                    newItem.status === 'suivi' ? 'border-amber-400 text-amber-700' :
                    newItem.status === 'en_cours' ? 'border-violet-400 text-violet-700' :
                    newItem.status === 'a_recontacter' ? 'border-cyan-400 text-cyan-700' :
                    newItem.status === 'perdu' ? 'border-rose-400 text-rose-700' :
                    'border-emerald-400 text-emerald-700'
                  }`}
                >
                  <option value="nouveau">🆕 Nouveau prospect</option>
                  <option value="suivi">🔔 En suivi</option>
                  <option value="en_cours">⚡ En cours</option>
                  <option value="a_recontacter">📞 À recontacter</option>
                  <option value="gagne">✅ Gagné</option>
                  <option value="perdu">❌ Perdu</option>
                </select>
                {newItem.status === 'perdu' && (
                  <div className="mt-3 p-3 bg-rose-50 border-2 border-rose-200 rounded-xl">
                    <label className="block text-xs font-bold text-rose-700 mb-1.5">Motif de la perte *</label>
                    <textarea
                      value={newItem.lost_reason}
                      onChange={(e) => setNewItem({...newItem, lost_reason: e.target.value})}
                      placeholder="Ex: Trop cher, choisi concurrent, projet annulé, pas de budget..."
                      rows={2}
                      data-testid="portfolio-lost-reason"
                      className="w-full px-3 py-2 bg-white border border-rose-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-rose-300 resize-none"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Type / Sous-catégorie</label>
                <input
                  type="text"
                  value={newItem.sub_type}
                  onChange={(e) => setNewItem({...newItem, sub_type: e.target.value})}
                  placeholder="Ex: Ambassades et consulats"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Adresse</label>
                <input
                  type="text"
                  value={newItem.address}
                  onChange={(e) => setNewItem({...newItem, address: e.target.value})}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Ville {zoneCfg.flag}</label>
                <select
                  value={newItem.city}
                  onChange={(e) => setNewItem({...newItem, city: e.target.value})}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="">Sélectionner une ville</option>
                  {zoneCfg.cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">BP</label>
                <input
                  type="text"
                  value={newItem.bp}
                  onChange={(e) => setNewItem({...newItem, bp: e.target.value})}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Téléphone</label>
                <PhoneInput
                  value={newItem.tel}
                  onChange={(v) => setNewItem({...newItem, tel: v})}
                  zone={profile?.zone}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Fax</label>
                <input
                  type="text"
                  value={newItem.fax}
                  onChange={(e) => setNewItem({...newItem, fax: e.target.value})}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={newItem.mail}
                  onChange={(e) => setNewItem({...newItem, mail: e.target.value})}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Site Web</label>
                <input
                  type="text"
                  value={newItem.web}
                  onChange={(e) => setNewItem({...newItem, web: e.target.value})}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{zoneCfg.niuLabel}</label>
                <input
                  type="text"
                  value={newItem.niu}
                  onChange={(e) => setNewItem({...newItem, niu: e.target.value})}
                  placeholder={zoneCfg.niuPlaceholder}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-sm"
                />
              </div>
            </div>
            </form>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setIsAddingItem(false); setEditingItemId(null); setNewItem({ name: '', sub_type: '', address: '', city: '', bp: '', tel: '', fax: '', mail: '', web: '', niu: '', status: 'nouveau', lost_reason: '' }); }}
                className="px-6 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleAddItem({ preventDefault: () => {} } as any)}
                disabled={submitting || !newItem.name.trim()}
                data-testid="portfolio-item-save-btn"
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {submitting && <Loader2 className="animate-spin" size={18} />}
                {editingItemId ? 'Mettre à jour' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Categories Grid */}
      {!selectedCategory && !viewAll && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCategories.map((category) => (
            <div
              key={category.id}
              onClick={() => setSelectedCategory(category)}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all group cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Folder size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-800 truncate uppercase text-sm">
                    {category.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Secteur d'activité
                  </p>
                  {isAdmin && category.createdByName && (
                    <p className="text-[10px] text-indigo-600 mt-1 truncate" title={`Créé par ${category.createdByName}`} data-testid={`category-author-${category.id}`}>
                      <span className="text-slate-400">Créé par</span> {category.createdByName}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Items List */}
      {(selectedCategory || viewAll) && (
        <div className="space-y-4">
          {/* Status Filter Chips */}
          <div className="flex flex-wrap items-center gap-2" data-testid="status-filter-chips">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">Filtrer par suivi :</span>
            <button
              onClick={() => setStatusFilter(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                statusFilter === null
                  ? 'bg-slate-800 text-white shadow-lg scale-105'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
              data-testid="chip-all"
            >
              Tous · {items.length}
            </button>
            <button
              onClick={() => setStatusFilter('nouveau')}
              data-testid="chip-nouveau"
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                statusFilter === 'nouveau'
                  ? 'bg-blue-600 text-white shadow-lg scale-105 ring-2 ring-blue-300'
                  : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
              }`}
            >
              🆕 Nouveau · {statusCounts.nouveau}
            </button>
            <button
              onClick={() => setStatusFilter('suivi')}
              data-testid="chip-suivi"
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                statusFilter === 'suivi'
                  ? 'bg-amber-500 text-white shadow-lg scale-105 ring-2 ring-amber-300'
                  : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              🔔 En suivi · {statusCounts.suivi}
            </button>
            <button
              onClick={() => setStatusFilter('en_cours')}
              data-testid="chip-en-cours"
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                statusFilter === 'en_cours'
                  ? 'bg-violet-600 text-white shadow-lg scale-105 ring-2 ring-violet-300'
                  : 'bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100'
              }`}
            >
              ⚡ En cours · {statusCounts.en_cours}
            </button>
            <button
              onClick={() => setStatusFilter('a_recontacter')}
              data-testid="chip-recontacter"
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                statusFilter === 'a_recontacter'
                  ? 'bg-cyan-500 text-white shadow-lg scale-105 ring-2 ring-cyan-300'
                  : 'bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100'
              }`}
            >
              📞 À recontacter · {statusCounts.a_recontacter}
            </button>
            <button
              onClick={() => setStatusFilter('gagne')}
              data-testid="chip-gagne"
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                statusFilter === 'gagne'
                  ? 'bg-emerald-600 text-white shadow-lg scale-105 ring-2 ring-emerald-300'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              ✅ Gagné · {statusCounts.gagne}
            </button>
            <button
              onClick={() => setStatusFilter('perdu')}
              data-testid="chip-perdu"
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                statusFilter === 'perdu'
                  ? 'bg-rose-600 text-white shadow-lg scale-105 ring-2 ring-rose-300'
                  : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
              }`}
            >
              ❌ Perdu · {statusCounts.perdu}
            </button>
          </div>
          {loading && items.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-indigo-500" size={32} />
            </div>
          ) : viewMode === 'map' ? (
            <MapView items={filteredItems} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item) => (
                <div key={item.id} className="relative bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col h-full" data-testid={`portfolio-card-${item.id}`}>
                  <StatusBadge status={item.status} />
                  <div className="flex flex-col h-full gap-4">
                    <div className="space-y-3 flex-1">
                      <div>
                        <div className="flex items-start gap-3 mb-2">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                            <Building2 size={20} />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-800 text-lg leading-tight">{item.name}</h3>
                            {item.sub_type && (
                              <span className="inline-block mt-1 px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase tracking-wider">
                                {item.sub_type}
                              </span>
                            )}
                            {isAdmin && item.agentName && (
                              <div className="mt-1 text-[10px] text-indigo-600" data-testid={`portfolio-agent-${item.id}`}>
                                <span className="text-slate-400">Agent :</span> {item.agentName}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 text-sm pt-2 border-t border-slate-100">
                        <div className="flex items-start gap-3 text-slate-600">
                          <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
                          <span className="leading-relaxed">
                            {item.address || 'Adresse non renseignée'}
                            {item.city ? ` - ${item.city}` : ''}
                          </span>
                        </div>
                        
                        {item.bp && (
                          <div className="flex items-center gap-3 text-slate-600">
                            <Hash size={16} className="shrink-0 text-slate-400" />
                            <span>BP {item.bp}</span>
                          </div>
                        )}

                        <div className="flex items-start gap-3 text-slate-600">
                          <Phone size={16} className="mt-0.5 shrink-0 text-slate-400" />
                          <div className="flex flex-col">
                            {item.tel ? item.tel.split(/[\n/]+/).map((t, i) => (
                              <span key={i}>{t.trim()}</span>
                            )) : <span>Tél non renseigné</span>}
                          </div>
                        </div>

                        {item.fax && (
                          <div className="flex items-center gap-3 text-slate-600">
                            <Phone size={16} className="shrink-0 text-slate-400" />
                            <span>Fax: {item.fax}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-3 text-slate-600">
                          <Mail size={16} className="shrink-0 text-slate-400" />
                          <span className="truncate">
                            {item.mail ? (
                              <a href={`mailto:${item.mail}`} className="hover:text-indigo-600 transition-colors">{item.mail}</a>
                            ) : 'Mail non renseigné'}
                          </span>
                        </div>

                        {item.web && (
                          <div className="flex items-center gap-3 text-slate-600">
                            <Globe size={16} className="shrink-0 text-slate-400" />
                            <span className="truncate">
                              <a href={item.web.startsWith('http') ? item.web : `https://${item.web}`} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 transition-colors">{item.web}</a>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="pt-3 border-t border-slate-100 flex gap-2">
                      <button
                        onClick={() => setExpandedComments(expandedComments === item.id ? null : item.id)}
                        className="p-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Commentaires de suivi"
                        data-testid={`portfolio-comments-${item.id}`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                      </button>
                      <button
                        onClick={() => handleConvertToOpportunity(item)}
                        data-testid={`convert-opportunity-${item.id}`}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
                      >
                        <UserPlus size={16} />
                        Convertir
                        <ArrowRight size={14} />
                      </button>
                      <button
                        onClick={() => handleEditItem(item)}
                        data-testid={`edit-item-${item.id}`}
                        className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                        title="Modifier"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        data-testid={`delete-item-${item.id}`}
                        className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {expandedComments === item.id && (
                      <div className="mt-3">
                        <CommentsSection entityType="portfolio" entityId={item.id} compact />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty States */}
      {!loading && (
        <>
          {!selectedCategory && !viewAll && filteredCategories.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
              <Folder className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-500">Aucune catégorie trouvée.</p>
            </div>
          )}
          {(selectedCategory || viewAll) && filteredItems.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
              <Building2 className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-500">Aucun établissement trouvé.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
