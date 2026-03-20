import React, { useState, useEffect } from 'react';
import { Plus, Search, Folder, Loader2, AlertCircle, ChevronLeft, Building2, Phone, Mail, Globe, MapPin, Hash } from 'lucide-react';

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
  created_at: string;
}

export default function Portfolio() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
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
    web: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      fetchItems(selectedCategory.id);
    }
  }, [selectedCategory]);

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
    if (!newItem.name.trim() || !selectedCategory) return;

    try {
      setSubmitting(true);
      const response = await fetch('/api/portfolio-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newItem, category_id: selectedCategory.id }),
      });

      if (!response.ok) throw new Error('Erreur lors de l\'ajout de l\'élément');
      
      await fetchItems(selectedCategory.id);
      setNewItem({
        name: '',
        sub_type: '',
        address: '',
        city: '',
        bp: '',
        tel: '',
        fax: '',
        mail: '',
        web: ''
      });
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

  if (loading && categories.length === 0 && !selectedCategory) {
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
          {selectedCategory && (
            <button 
              onClick={() => {
                setSelectedCategory(null);
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
              {selectedCategory ? selectedCategory.name : 'Portefeuille Client'}
            </h1>
            <p className="text-slate-500">
              {selectedCategory 
                ? `Liste des établissements dans ${selectedCategory.name.toLowerCase()}`
                : 'Gérez vos catégories de clients par secteur d\'activité.'}
            </p>
          </div>
        </div>
        {!selectedCategory ? (
          <button
            onClick={() => setIsAddingCategory(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus size={20} />
            Nouvelle Catégorie
          </button>
        ) : (
          <button
            onClick={() => setIsAddingItem(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus size={20} />
            Ajouter un établissement
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3">
          <AlertCircle size={20} />
          <p>{error}</p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder={selectedCategory ? "Rechercher un établissement..." : "Rechercher une catégorie..."}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
      </div>

      {/* Add Category Form */}
      {isAddingCategory && !selectedCategory && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <form onSubmit={handleAddCategory} className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="categoryName" className="block text-sm font-medium text-slate-700 mb-1">
                Nom de la catégorie
              </label>
              <input
                id="categoryName"
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Ex: IMMOBILIER"
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
      {isAddingItem && selectedCategory && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <form onSubmit={handleAddItem} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom de l'établissement *</label>
                <input
                  type="text"
                  required
                  value={newItem.name}
                  onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type / Sous-catégorie</label>
                <input
                  type="text"
                  value={newItem.sub_type}
                  onChange={(e) => setNewItem({...newItem, sub_type: e.target.value})}
                  placeholder="Ex: Ambassades et consulats"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Adresse</label>
                <input
                  type="text"
                  value={newItem.address}
                  onChange={(e) => setNewItem({...newItem, address: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ville</label>
                <input
                  type="text"
                  value={newItem.city}
                  onChange={(e) => setNewItem({...newItem, city: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">BP</label>
                <input
                  type="text"
                  value={newItem.bp}
                  onChange={(e) => setNewItem({...newItem, bp: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
                <input
                  type="text"
                  value={newItem.tel}
                  onChange={(e) => setNewItem({...newItem, tel: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fax</label>
                <input
                  type="text"
                  value={newItem.fax}
                  onChange={(e) => setNewItem({...newItem, fax: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newItem.mail}
                  onChange={(e) => setNewItem({...newItem, mail: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Site Web</label>
                <input
                  type="text"
                  value={newItem.web}
                  onChange={(e) => setNewItem({...newItem, web: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
      {!selectedCategory && (
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
      {selectedCategory && (
        <div className="space-y-4">
          {loading && items.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-indigo-500" size={32} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredItems.map((item) => (
                <div key={item.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Building2 size={18} className="text-indigo-600" />
                          <h3 className="font-bold text-slate-800 text-lg">{item.name}</h3>
                        </div>
                        {item.sub_type && (
                          <span className="inline-block px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded uppercase">
                            {item.sub_type}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                        {item.address && (
                          <div className="flex items-start gap-2 text-slate-600">
                            <MapPin size={16} className="mt-0.5 shrink-0" />
                            <span>{item.address}{item.city ? `, ${item.city}` : ''}</span>
                          </div>
                        )}
                        {item.bp && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <Hash size={16} className="shrink-0" />
                            <span>BP: {item.bp}</span>
                          </div>
                        )}
                        {item.tel && (
                          <div className="flex items-start gap-2 text-slate-600">
                            <Phone size={16} className="mt-0.5 shrink-0" />
                            <div className="flex flex-col">
                              {item.tel.split('\n').map((t, i) => (
                                <span key={i}>{t}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {item.fax && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <Phone size={16} className="shrink-0" />
                            <span>Fax: {item.fax}</span>
                          </div>
                        )}
                        {item.mail && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <Mail size={16} className="shrink-0" />
                            <a href={`mailto:${item.mail}`} className="hover:text-indigo-600 transition-colors">{item.mail}</a>
                          </div>
                        )}
                        {item.web && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <Globe size={16} className="shrink-0" />
                            <a href={item.web.startsWith('http') ? item.web : `https://${item.web}`} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 transition-colors">{item.web}</a>
                          </div>
                        )}
                      </div>
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
          {!selectedCategory && filteredCategories.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
              <Folder className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-500">Aucune catégorie trouvée.</p>
            </div>
          )}
          {selectedCategory && filteredItems.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
              <Building2 className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-500">Aucun établissement trouvé dans cette catégorie.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
