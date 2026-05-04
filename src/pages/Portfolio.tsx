import React, { useState, useEffect } from 'react';
import { Plus, Search, Folder, Loader2, AlertCircle, ChevronLeft, Building2, Phone, Mail, Globe, MapPin, Hash, Map as MapIcon, List, UserPlus, ArrowRight, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MapView from '../components/MapView';
import { useAuth } from '../contexts/AuthContext';
import { getZoneConfig } from '../lib/countryConfig';

interface Category {
  id: number;
  name: string;
  created_at: string;
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
  created_at: string;
}

export default function Portfolio() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const zoneCfg = getZoneConfig((profile as any)?.zone);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [viewAll, setViewAll] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
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
    niu: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      fetchItems(selectedCategory.id);
    } else if (viewAll) {
      fetchAllItems();
    }
  }, [selectedCategory, viewAll]);

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

  const fetchItems = async (categoryId: number) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/categories/${categoryId}/items`);
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
      const response = await fetch('/api/portfolio-items');
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
      const response = await fetch('/api/portfolio-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newItem, category_id: categoryId }),
      });

      if (!response.ok) throw new Error('Erreur lors de l\'ajout de l\'élément');
      
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
        niu: ''
      });
      setSelectedCategoryForAdd(null);
      setIsAddingItem(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCategories = categories.filter(cat => 
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sub_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.city?.toLowerCase().includes(searchQuery.toLowerCase())
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

      {/* Add Item Form */}
      {isAddingItem && (selectedCategory || viewAll) && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <form onSubmit={handleAddItem} className="space-y-4">
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
                />
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
                <input
                  type="text"
                  value={newItem.tel}
                  onChange={(e) => setNewItem({...newItem, tel: e.target.value})}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
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
            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={() => setIsAddingItem(false)}
                className="px-6 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting || !newItem.name.trim()}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {submitting && <Loader2 className="animate-spin" size={18} />}
                Enregistrer
              </button>
            </div>
          </form>
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Items List */}
      {(selectedCategory || viewAll) && (
        <div className="space-y-4">
          {loading && items.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-indigo-500" size={32} />
            </div>
          ) : viewMode === 'map' ? (
            <MapView items={filteredItems} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item) => (
                <div key={item.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col h-full">
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
                        onClick={() => handleConvertToOpportunity(item)}
                        data-testid={`convert-opportunity-${item.id}`}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
                      >
                        <UserPlus size={16} />
                        Convertir
                        <ArrowRight size={14} />
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
