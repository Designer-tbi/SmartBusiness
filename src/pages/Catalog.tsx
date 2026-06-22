import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, 
  Plus, 
  Search, 
  Filter, 
  Package, 
  Tag, 
  FileText, 
  Eye, 
  Edit2, 
  Trash2, 
  ChevronRight, 
  Layers,
  CheckCircle2,
  XCircle,
  FileDown,
  Info,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

interface Catalog {
  id: number;
  name: string;
  description: string;
  is_active: number;
  created_at: string;
}

interface Category {
  id: number;
  name: string;
  description?: string;
}

interface Product {
  id: number;
  name: string;
  type: 'product' | 'service';
  category: string;
  category_id: number;
  catalog_id: number;
  price: number;
  vat_rate: number;
  vat_rate_id?: number;
  stock: number;
  unit: string;
  description: string;
  categoryName?: string;
  catalogName?: string;
}

interface VatRate {
  id: number;
  label: string;
  rate: number;
}

export default function Catalog() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'list' | 'manage'>('list');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  
  const [catalogues, setCatalogues] = useState<Catalog[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vatRates, setVatRates] = useState<VatRate[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCatalog, setSelectedCatalog] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [showVatModal, setShowVatModal] = useState(false);

  // Form states
  const [catalogForm, setCatalogForm] = useState({ name: '', description: '', is_active: 1 });
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });
  const [vatForm, setVatForm] = useState({ label: '', rate: '' });
  const [productForm, setProductForm] = useState({
    name: '',
    type: 'product' as 'product' | 'service',
    categoryId: '',
    catalogId: '',
    price: '',
    vatRate: '20',
    vatRateId: '',
    stock: '',
    unit: 'unité',
    description: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [catRes, categRes, prodRes, vatRes] = await Promise.all([
        fetch('/api/catalogues'),
        fetch('/api/categories'),
        fetch('/api/products'),
        fetch('/api/vat-rates')
      ]);
      
      if (catRes.ok) setCatalogues(await catRes.json());
      if (categRes.ok) setCategories(await categRes.json());
      if (prodRes.ok) setProducts(await prodRes.json());
      if (vatRes.ok) setVatRates(await vatRes.json());
    } catch (error) {
      console.error("Error fetching catalog data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const isAnyModalOpen = showCatalogModal || showProductModal || showCategoryModal || showVatModal;
    return () => {
    };
  }, [showCatalogModal, showProductModal, showCategoryModal, showVatModal]);

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/catalogues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(catalogForm)
      });
      if (res.ok) {
        setShowCatalogModal(false);
        setCatalogForm({ name: '', description: '', is_active: 1 });
        fetchData();
      }
    } catch (error) {
      console.error("Error creating catalog:", error);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryForm)
      });
      if (res.ok) {
        setShowCategoryModal(false);
        setCategoryForm({ name: '', description: '' });
        fetchData();
      }
    } catch (error) {
      console.error("Error creating category:", error);
    }
  };

  const handleCreateVat = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/vat-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vatForm)
      });
      if (res.ok) {
        setShowVatModal(false);
        setVatForm({ label: '', rate: '' });
        fetchData();
      }
    } catch (error) {
      console.error("Error creating VAT rate:", error);
    }
  };



  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingProductId ? `/api/products/${editingProductId}` : '/api/products';
      const method = editingProductId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...productForm,
          price: parseFloat(productForm.price),
          vatRate: parseFloat(productForm.vatRate),
          vatRateId: productForm.vatRateId ? parseInt(productForm.vatRateId) : null,
          stock: parseInt(productForm.stock) || 0,
          categoryId: parseInt(productForm.categoryId),
          catalogId: parseInt(productForm.catalogId)
        })
      });
      if (res.ok) {
        setShowProductModal(false);
        setEditingProductId(null);
        setProductForm({
          name: '',
          type: 'product',
          categoryId: '',
          catalogId: '',
          price: '',
          vatRate: '20',
          vatRateId: '',
          stock: '',
          unit: 'unité',
          description: ''
        });
        fetchData();
      } else {
        const err = await res.json();
        alert('Erreur: ' + (err.error || 'inconnue'));
      }
    } catch (error) {
      console.error("Error saving product:", error);
    }
  };

  const handleEditProduct = (product: any) => {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name || '',
      type: product.type || 'product',
      categoryId: product.category_id ? String(product.category_id) : (product.categoryId ? String(product.categoryId) : ''),
      catalogId: product.catalog_id ? String(product.catalog_id) : (product.catalogId ? String(product.catalogId) : ''),
      price: product.price != null ? String(product.price) : '',
      vatRate: product.vat_rate != null ? String(product.vat_rate) : (product.vatRate != null ? String(product.vatRate) : '20'),
      vatRateId: product.vat_rate_id ? String(product.vat_rate_id) : (product.vatRateId ? String(product.vatRateId) : ''),
      stock: product.stock != null ? String(product.stock) : '',
      unit: product.unit || 'unité',
      description: product.description || ''
    });
    setShowProductModal(true);
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm('Supprimer définitivement ce produit/service ?')) return;
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
      else alert('Erreur lors de la suppression');
    } catch (e: any) { alert('Erreur: ' + e.message); }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           p.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCatalog = selectedCatalog === 'all' || p.catalog_id?.toString() === selectedCatalog;
      const matchesCategory = selectedCategory === 'all' || p.category_id?.toString() === selectedCategory;
      return matchesSearch && matchesCatalog && matchesCategory;
    });
  }, [products, searchTerm, selectedCatalog, selectedCategory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Catalogue Produits & Services</h2>
          <p className="text-slate-500 text-sm">Gérez vos offres commerciales et dossiers techniques</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPreviewMode(!isPreviewMode)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm border",
              isPreviewMode ? "bg-indigo-50 text-indigo-600 border-indigo-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            )}
          >
            <Eye size={18} />
            {isPreviewMode ? "Mode Édition" : "Prévisualiser"}
          </button>
          
          {(profile?.role === 'admin' || profile?.role === 'superadmin') && !isPreviewMode && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCatalogModal(true)}
                className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-all shadow-sm"
              >
                <BookOpen size={18} />
                Nouveau Catalogue
              </button>
              <button
                onClick={() => setShowProductModal(true)}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
              >
                <Plus size={18} />
                Nouveau Produit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters & Tabs */}
      {!isPreviewMode && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Rechercher un produit..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedCatalog}
                onChange={(e) => setSelectedCatalog(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="all">Tous les catalogues</option>
                {catalogues.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="all">Toutes les catégories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-1.5 rounded-md transition-all",
                viewMode === 'grid' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Layers size={18} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                "p-1.5 rounded-md transition-all",
                viewMode === 'table' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Filter size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {isPreviewMode ? (
        <div className="space-y-12">
          {catalogues.filter(c => c.is_active).map(catalog => {
            const catalogProducts = products.filter(p => p.catalog_id === catalog.id);
            if (catalogProducts.length === 0) return null;

            return (
              <div key={catalog.id} className="space-y-6">
                <div className="border-b-2 border-indigo-600 pb-2">
                  <h3 className="text-3xl font-bold text-slate-900">{catalog.name}</h3>
                  <p className="text-slate-500 mt-1">{catalog.description}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {catalogProducts.map(product => (
                    <div key={product.id} className="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden flex flex-col hover:shadow-xl transition-all duration-300">
                      <div className="h-48 bg-slate-100 flex items-center justify-center relative">
                        <Package size={64} className="text-slate-300" />
                        <div className="absolute top-4 right-4 px-3 py-1 bg-white/90 backdrop-blur-sm rounded-full text-xs font-bold text-indigo-600 shadow-sm">
                          {product.categoryName}
                        </div>
                      </div>
                      <div className="p-6 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="text-xl font-bold text-slate-900">{product.name}</h4>
                          <div className="text-right">
                            <div className="text-2xl font-black text-indigo-600">{product.price.toLocaleString()}€</div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold">HT / {product.unit}</div>
                          </div>
                        </div>
                        <p className="text-slate-600 text-sm line-clamp-3 mb-6 flex-1">
                          {product.description}
                        </p>
                        <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                            <Info size={14} />
                            TVA: {product.vat_rate}%
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6">
              {filteredProducts.map(product => (
                <div key={product.id} className="group bg-slate-50 rounded-xl border border-slate-200 overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all">
                  <div className="h-32 bg-slate-200 flex items-center justify-center relative">
                    <Package size={32} className="text-slate-400" />
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEditProduct(product)} data-testid={`edit-product-${product.id}`} className="p-1.5 bg-white text-slate-600 rounded-md hover:text-indigo-600 shadow-sm border border-slate-200" title="Modifier">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteProduct(product.id)} data-testid={`delete-product-${product.id}`} className="p-1.5 bg-white text-slate-600 rounded-md hover:text-rose-600 shadow-sm border border-slate-200" title="Supprimer">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-slate-800 truncate">{product.name}</h4>
                      <span className="text-xs font-bold text-indigo-600">{product.price}€</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-3">
                      <Tag size={10} />
                      {product.categoryName || "Sans catégorie"}
                      <span className="mx-1">•</span>
                      <BookOpen size={10} />
                      {product.catalogName || "Sans catalogue"}
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2 mb-4 h-8">
                      {product.description}
                    </p>
                    <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                        <Layers size={12} />
                        Stock: {product.stock}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Produit</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Catégorie</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Catalogue</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Prix HT</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">TVA</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Stock</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map(product => (
                    <tr key={product.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-slate-100 rounded-lg text-slate-400">
                            <Package size={18} />
                          </div>
                          <div>
                            <div className="font-bold text-slate-800">{product.name}</div>
                            <div className="text-xs text-slate-500 truncate max-w-[200px]">{product.description}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-wider">
                          {product.categoryName || "N/A"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600">{product.catalogName || "N/A"}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="font-bold text-slate-800">{product.price.toLocaleString()}€</div>
                        <div className="text-[10px] text-slate-400">par {product.unit}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm text-slate-600">{product.vat_rate}%</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className={cn(
                          "text-sm font-bold",
                          product.stock <= 5 ? "text-rose-600" : "text-slate-600"
                        )}>
                          {product.stock}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                            <Edit2 size={16} />
                          </button>
                          <button className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCatalogModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in duration-200">
            <div className="sticky top-0 z-10 px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur-md">
              <h3 className="text-lg font-bold text-slate-900">Nouveau Catalogue</h3>
              <button onClick={() => setShowCatalogModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={24} />
              </button>
            </div>
            <form onSubmit={handleCreateCatalog} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom du catalogue</label>
                <input
                  type="text"
                  required
                  value={catalogForm.name}
                  onChange={(e) => setCatalogForm({ ...catalogForm, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  placeholder="Ex: Catalogue Printemps 2026"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                <textarea
                  rows={3}
                  value={catalogForm.description}
                  onChange={(e) => setCatalogForm({ ...catalogForm, description: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all resize-none"
                  placeholder="Détails du catalogue..."
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={catalogForm.is_active === 1}
                  onChange={(e) => setCatalogForm({ ...catalogForm, is_active: e.target.checked ? 1 : 0 })}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-slate-700">Catalogue actif</label>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCatalogModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-sm font-bold"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProductModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full sm:max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto animate-in zoom-in duration-200">
            <div className="sticky top-0 z-10 px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur-md">
              <h3 className="text-lg font-bold text-slate-900">Nouveau Produit / Service</h3>
              <button onClick={() => setShowProductModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={24} />
              </button>
            </div>
            <form onSubmit={handleCreateProduct} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="type"
                        value="product"
                        checked={productForm.type === 'product'}
                        onChange={() => setProductForm({ ...productForm, type: 'product' })}
                        className="w-4 h-4 text-indigo-600"
                      />
                      <span className="text-sm font-medium text-slate-700">Produit</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="type"
                        value="service"
                        checked={productForm.type === 'service'}
                        onChange={() => setProductForm({ ...productForm, type: 'service' })}
                        className="w-4 h-4 text-indigo-600"
                      />
                      <span className="text-sm font-medium text-slate-700">Service</span>
                    </label>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom du produit / service</label>
                  <input
                    type="text"
                    required
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    placeholder="Ex: Licence Logiciel CRM"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Catalogue</label>
                  <select
                    required
                    value={productForm.catalogId}
                    onChange={(e) => setProductForm({ ...productForm, catalogId: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  >
                    <option value="">Sélectionner un catalogue</option>
                    {catalogues.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Catégorie</label>
                  <div className="flex gap-2 items-stretch">
                    <select
                      required
                      value={productForm.categoryId}
                      onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })}
                      className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    >
                      <option value="">Sélectionner une catégorie</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowCategoryModal(true)}
                      className="aspect-square bg-slate-100 text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center flex-shrink-0"
                      title="Créer une catégorie"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Prix HT (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Taux TVA (%)</label>
                  <div className="flex gap-2 items-stretch">
                    <select
                      value={productForm.vatRateId}
                      onChange={(e) => {
                        const selectedVat = vatRates.find(v => v.id.toString() === e.target.value);
                        setProductForm({ 
                          ...productForm, 
                          vatRateId: e.target.value,
                          vatRate: selectedVat ? selectedVat.rate.toString() : productForm.vatRate
                        });
                      }}
                      className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    >
                      <option value="">Choisir un taux...</option>
                      {vatRates.map(v => <option key={v.id} value={v.id}>{v.label} ({v.rate}%)</option>)}
                      <option value="20">20% (Standard)</option>
                      <option value="10">10% (Intermédiaire)</option>
                      <option value="5.5">5.5% (Réduit)</option>
                      <option value="2.1">2.1% (Particulier)</option>
                      <option value="0">0% (Exonéré)</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowVatModal(true)}
                      className="aspect-square bg-slate-100 text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center flex-shrink-0"
                      title="Créer un taux de TVA"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>

                {productForm.type === 'product' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Stock initial</label>
                    <input
                      type="number"
                      value={productForm.stock}
                      onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                      placeholder="0"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Unité</label>
                  <input
                    type="text"
                    value={productForm.unit}
                    onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    placeholder="Ex: unité, heure, jour..."
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                  <textarea
                    rows={4}
                    value={productForm.description}
                    onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all resize-none"
                    placeholder="Description détaillée du produit ou service..."
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-sm font-bold"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in duration-200">
            <div className="sticky top-0 z-10 px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur-md">
              <h3 className="text-lg font-bold text-slate-900">Nouvelle Catégorie</h3>
              <button onClick={() => setShowCategoryModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={24} />
              </button>
            </div>
            <form onSubmit={handleCreateCategory} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom de la catégorie</label>
                <input
                  type="text"
                  required
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  placeholder="Ex: Logiciels, Services Cloud..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                <textarea
                  rows={3}
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all resize-none"
                  placeholder="Détails de la catégorie..."
                />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-sm font-bold"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showVatModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in duration-200">
            <div className="sticky top-0 z-10 px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur-md">
              <h3 className="text-lg font-bold text-slate-900">Nouveau Taux TVA</h3>
              <button onClick={() => setShowVatModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={24} />
              </button>
            </div>
            <form onSubmit={handleCreateVat} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Libellé</label>
                <input
                  type="text"
                  required
                  value={vatForm.label}
                  onChange={(e) => setVatForm({ ...vatForm, label: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  placeholder="Ex: TVA Standard"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Taux (%)</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={vatForm.rate}
                  onChange={(e) => setVatForm({ ...vatForm, rate: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  placeholder="20.0"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowVatModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-sm font-bold"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
