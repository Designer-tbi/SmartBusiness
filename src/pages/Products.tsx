import React, { useState, useEffect } from 'react';
import { Package, Plus, Search, Trash2, Edit2, Tag, Layers, Box, X, Save, Eye, RefreshCw, DollarSign, CheckCircle2, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Products() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [previewProduct, setPreviewProduct] = useState<any>(null);
  const [form, setForm] = useState({ name: '', type: 'product', category: '', price: 0, vatRate: 19.25, stock: 0, unit: 'unité', description: '', currency: 'XAF', billingType: 'one_time', billingPeriod: 'monthly' });

  const fetchProducts = async () => {
    try { const r = await fetch('/api/products'); if (r.ok) setProducts(await r.json()); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchProducts(); }, []);

  const resetForm = () => { setForm({ name: '', type: 'product', category: '', price: 0, vatRate: 19.25, stock: 0, unit: 'unité', description: '', currency: 'XAF', billingType: 'one_time', billingPeriod: 'monthly' }); setEditingProduct(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (res.ok) { setShowForm(false); resetForm(); fetchProducts(); }
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce produit ?')) return;
    try { await fetch(`/api/products/${id}`, { method: 'DELETE' }); fetchProducts(); } catch (err) { console.error(err); }
  };

  const filteredProducts = products.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalValue = products.reduce((a, p) => a + (Number(p.price) * Number(p.stock || 0)), 0);

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-400">Chargement...</div>;

  return (
    <div className="space-y-6" data-testid="products-page">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Produits & Services</h2>
          <p className="text-slate-500 text-sm">{products.length} produit{products.length > 1 ? 's' : ''} dans le catalogue</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} data-testid="new-product-btn" className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-all shadow-sm font-medium">
          <Plus size={20} /> Nouveau Produit
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2"><Box size={20} className="text-indigo-600" /><span className="text-sm font-medium">Total Produits</span></div>
          <div className="text-2xl font-bold text-slate-900">{products.length}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2"><Layers size={20} className="text-blue-600" /><span className="text-sm font-medium">Services</span></div>
          <div className="text-2xl font-bold text-slate-900">{products.filter(p => p.type === 'service').length}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2"><Tag size={20} className="text-emerald-600" /><span className="text-sm font-medium">Valeur Stock</span></div>
          <div className="text-2xl font-bold text-slate-900">{Number(totalValue || 0).toLocaleString('fr-FR')}</div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input type="text" placeholder="Rechercher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-200">
            <tr>
              <th className="px-6 py-3">Nom</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 hidden md:table-cell">Catégorie</th>
              <th className="px-4 py-3">Prix HT</th>
              <th className="px-4 py-3 hidden md:table-cell">TVA</th>
              <th className="px-4 py-3 hidden lg:table-cell">Stock</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredProducts.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/50" data-testid={`product-row-${p.id}`}>
                <td className="px-6 py-3">
                  <button onClick={() => setPreviewProduct(p)} className="text-left font-medium text-slate-800 hover:text-indigo-600 transition-colors">
                    {p.name}
                  </button>
                  {p.description && <p className="text-xs text-slate-400 truncate max-w-[200px]">{p.description}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${p.type === 'service' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{p.type === 'service' ? 'Service' : 'Produit'}</span>
                  {p.billing_type === 'subscription' && <span className="ml-1 text-xs px-2 py-1 rounded-full font-medium bg-emerald-100 text-emerald-700" title="Abonnement mensuel">🔁 Abo.</span>}
                </td>
                <td className="px-4 py-3 text-sm text-slate-500 hidden md:table-cell">{p.category || '-'}</td>
                <td className="px-4 py-3 font-bold text-slate-800">{Number(p.price).toLocaleString()} {p.currency || 'XAF'}{p.billing_type === 'subscription' ? <span className="text-xs text-slate-400 font-normal">/mois</span> : ''}</td>
                <td className="px-4 py-3 text-sm text-slate-500 hidden md:table-cell">{p.vat_rate}%</td>
                <td className="px-4 py-3 hidden lg:table-cell"><span className={`font-medium ${Number(p.stock) < 10 ? 'text-red-600' : 'text-slate-700'}`}>{p.stock} {p.unit || ''}</span></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setPreviewProduct(p)} title="Aperçu détaillé" className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" data-testid={`preview-product-${p.id}`}><Eye size={16} /></button>
                    <button onClick={() => handleDelete(p.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredProducts.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-slate-400">Aucun produit. Cliquez "Nouveau Produit" pour commencer.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Create Product Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl" data-testid="product-form-modal">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">Nouveau Produit / Service</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label>
                  <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nom du produit ou service" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Mode de facturation *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => setForm({...form, billingType: 'one_time'})}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${form.billingType === 'one_time' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                      <div className={`font-semibold text-sm mb-1 ${form.billingType === 'one_time' ? 'text-indigo-900' : 'text-slate-700'}`}>💰 Paiement unique</div>
                      <p className="text-xs text-slate-500">Le client paie une seule fois (produit ou prestation ponctuelle)</p>
                    </button>
                    <button type="button" onClick={() => setForm({...form, billingType: 'subscription'})}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${form.billingType === 'subscription' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                      <div className={`font-semibold text-sm mb-1 ${form.billingType === 'subscription' ? 'text-emerald-900' : 'text-slate-700'}`}>🔁 Abonnement mensuel</div>
                      <p className="text-xs text-slate-500">Le client est prélevé chaque mois via PayPal (renouvellement automatique)</p>
                    </button>
                  </div>
                  {form.billingType === 'subscription' && (
                    <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                      ℹ️ Un devis ne peut contenir que des produits d'abonnement OU uniquement des produits à paiement unique (pas de mélange).
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none">
                    <option value="product">Produit</option>
                    <option value="service">Service</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Catégorie</label>
                  <input value={form.category} onChange={e => setForm({...form, category: e.target.value})} placeholder="Ex: Informatique" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prix HT *</label>
                  <input type="number" required min="0" value={form.price} onChange={e => setForm({...form, price: parseFloat(e.target.value) || 0})} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Devise *</label>
                  <select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none">
                    <option value="XAF">XAF (Franc CFA CEMAC)</option>
                    <option value="CDF">CDF (Franc Congolais)</option>
                    <option value="USD">USD (Dollar US)</option>
                    <option value="XOF">XOF (Franc CFA UEMOA)</option>
                    <option value="EUR">EUR (Euro)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">TVA (%)</label>
                  <input type="number" step="0.01" value={form.vatRate} onChange={e => setForm({...form, vatRate: parseFloat(e.target.value) || 0})} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stock</label>
                  <input type="number" min="0" value={form.stock} onChange={e => setForm({...form, stock: parseInt(e.target.value) || 0})} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unité</label>
                  <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none">
                    <option value="unité">Unité</option>
                    <option value="kg">Kilogramme</option>
                    <option value="litre">Litre</option>
                    <option value="m²">Mètre carré</option>
                    <option value="heure">Heure</option>
                    <option value="jour">Jour</option>
                    <option value="mois">Mois</option>
                    <option value="lot">Lot</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <textarea rows={2} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description du produit..." className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50">Annuler</button>
                <button type="submit" className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 flex items-center gap-2 shadow-sm"><Save size={18} /> Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setPreviewProduct(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="product-preview-modal">
            <div className="relative p-8 bg-gradient-to-br from-indigo-600 to-purple-600 text-white">
              <button onClick={() => setPreviewProduct(null)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all" data-testid="close-product-preview">
                <X size={20} />
              </button>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-14 h-14 bg-white/15 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  {previewProduct.type === 'service' ? <Layers size={28} /> : <Box size={28} />}
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-1">{previewProduct.name}</h2>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs px-2 py-0.5 bg-white/20 rounded-full backdrop-blur-sm">{previewProduct.type === 'service' ? '💼 Service' : '📦 Produit'}</span>
                    {previewProduct.billing_type === 'subscription' ? (
                      <span className="text-xs px-2 py-0.5 bg-emerald-400/30 rounded-full backdrop-blur-sm font-medium">🔁 Abonnement mensuel</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 bg-amber-400/30 rounded-full backdrop-blur-sm font-medium">💰 Paiement unique</span>
                    )}
                    {previewProduct.category && <span className="text-xs px-2 py-0.5 bg-white/20 rounded-full backdrop-blur-sm">{previewProduct.category}</span>}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-4xl font-bold">{Number(previewProduct.price).toLocaleString('fr-FR')}</span>
                <span className="text-lg opacity-80">{previewProduct.currency || 'XAF'}</span>
                {previewProduct.billing_type === 'subscription' && <span className="text-sm opacity-70">/mois</span>}
              </div>
            </div>

            <div className="p-8 space-y-6">
              {previewProduct.description && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><FileText size={14} /> Description</h3>
                  <p className="text-slate-700 whitespace-pre-line">{previewProduct.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Prix HT</p>
                  <p className="text-xl font-bold text-slate-900">{Number(previewProduct.price).toLocaleString('fr-FR')} {previewProduct.currency || 'XAF'}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">TVA</p>
                  <p className="text-xl font-bold text-slate-900">{previewProduct.vat_rate}%</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Prix TTC</p>
                  <p className="text-xl font-bold text-indigo-600">
                    {Math.round(Number(previewProduct.price) * (1 + Number(previewProduct.vat_rate || 0)/100)).toLocaleString('fr-FR')} {previewProduct.currency || 'XAF'}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Stock disponible</p>
                  <p className={`text-xl font-bold ${Number(previewProduct.stock) < 10 ? 'text-red-600' : 'text-slate-900'}`}>
                    {previewProduct.stock || 0} <span className="text-sm font-normal text-slate-400">{previewProduct.unit || 'unité'}</span>
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-5 rounded-xl border border-indigo-100">
                <h3 className="text-xs font-bold text-indigo-600 uppercase mb-3 flex items-center gap-1">
                  {previewProduct.billing_type === 'subscription' ? <RefreshCw size={14} /> : <DollarSign size={14} />} Mode de paiement
                </h3>
                {previewProduct.billing_type === 'subscription' ? (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-700"><strong>🔁 Abonnement mensuel</strong> — Le client est facturé automatiquement chaque mois via PayPal.</p>
                    <ul className="text-xs text-slate-600 space-y-1 ml-4">
                      <li>• Premier prélèvement lors de la validation du devis</li>
                      <li>• Renouvellement automatique chaque mois à la même date</li>
                      <li>• Le client peut résilier à tout moment depuis son compte PayPal</li>
                      <li>• En cas d'échec : 3 tentatives PayPal puis suspension</li>
                    </ul>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-700"><strong>💰 Paiement unique</strong> — Le client paie une seule fois à la signature du devis.</p>
                    <ul className="text-xs text-slate-600 space-y-1 ml-4">
                      <li>• Paiement intégral en une fois via PayPal</li>
                      <li>• Carte bancaire (Visa, Mastercard) ou compte PayPal acceptés</li>
                      <li>• Facture émise automatiquement après paiement</li>
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center text-xs text-slate-400 pt-4 border-t border-slate-100">
                <span>ID: #{previewProduct.id}</span>
                {previewProduct.created_at && <span>Créé le {format(new Date(previewProduct.created_at), 'dd MMM yyyy', { locale: fr })}</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
