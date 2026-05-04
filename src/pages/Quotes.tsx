import React, { useState, useEffect } from 'react';
import { FileText, Plus, Search, Trash2, Edit2, Filter, Calendar, X, Save, PlusCircle, MinusCircle, Send, Share2, AlertCircle, Percent, Mail } from 'lucide-react';
import { format } from 'date-fns';

export default function Quotes() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [recipientType, setRecipientType] = useState<'customer' | 'lead'>('customer');

  const [formData, setFormData] = useState({
    number: `QT-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
    customerId: '',
    leadId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    expiryDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    notes: '',
    paymentTerms: 'Paiement à 30 jours',
    deliveryDelay: '',
    vatRate: 19.25,
    globalDiscount: 0,
    discountType: 'percent' as 'percent' | 'fixed',
    items: [{ productId: '', description: '', quantity: 1, unitPrice: 0, discount: 0, totalPrice: 0 }]
  });

  useEffect(() => {
  }, [showModal]);

  useEffect(() => { fetchQuotes(); fetchData(); }, []);

  const fetchQuotes = async () => {
    try { const r = await fetch('/api/quotes'); if (r.ok) setQuotes(await r.json()); } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchData = async () => {
    try {
      const [c, l, p] = await Promise.all([fetch('/api/customers'), fetch('/api/leads'), fetch('/api/products')]);
      if (c.ok) setCustomers(await c.json());
      if (l.ok) setLeads(await l.json());
      if (p.ok) setProducts(await p.json());
    } catch (err) { console.error(err); }
  };

  const handleAddItem = () => {
    setFormData({ ...formData, items: [...formData.items, { productId: '', description: '', quantity: 1, unitPrice: 0, discount: 0, totalPrice: 0 }] });
  };

  const handleRemoveItem = (index: number) => {
    const items = [...formData.items]; items.splice(index, 1); setFormData({ ...formData, items });
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const items = [...formData.items];
    const item = { ...items[index], [field]: value };
    if (field === 'productId') {
      const product = products.find(p => p.id === parseInt(value));
      if (product) { item.description = product.name; item.unitPrice = Number(product.price); }
    }
    const lineTotal = Number(item.quantity) * Number(item.unitPrice);
    const lineDiscount = Number(item.discount) || 0;
    item.totalPrice = lineTotal - (lineTotal * lineDiscount / 100);
    items[index] = item;
    setFormData({ ...formData, items });
  };

  // Calculations
  const subtotal = formData.items.reduce((a, i) => a + (Number(i.quantity) * Number(i.unitPrice)), 0);
  const itemDiscounts = formData.items.reduce((a, i) => {
    const line = Number(i.quantity) * Number(i.unitPrice);
    return a + (line * (Number(i.discount) || 0) / 100);
  }, 0);
  const afterItemDiscounts = subtotal - itemDiscounts;
  const globalDiscountAmount = formData.discountType === 'percent'
    ? afterItemDiscounts * Number(formData.globalDiscount) / 100
    : Number(formData.globalDiscount);
  const afterAllDiscounts = afterItemDiscounts - globalDiscountAmount;
  const vatAmount = afterAllDiscounts * Number(formData.vatRate) / 100;
  const totalTTC = afterAllDiscounts + vatAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formData.customerId && !formData.leadId) { setError("Sélectionnez un client ou prospect."); return; }
    if (formData.items.length === 0 || formData.items.some(i => !i.description)) { setError("Ajoutez au moins un article."); return; }
    setIsSubmitting(true);
    try {
      const notesComplete = [
        formData.notes,
        formData.paymentTerms ? `Conditions de paiement: ${formData.paymentTerms}` : '',
        formData.deliveryDelay ? `Délai de livraison: ${formData.deliveryDelay}` : '',
        `TVA: ${formData.vatRate}%`,
        formData.globalDiscount ? `Remise globale: ${formData.discountType === 'percent' ? formData.globalDiscount + '%' : formData.globalDiscount + ' FCFA'}` : '',
      ].filter(Boolean).join('\n');
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, amount: totalTTC, notes: notesComplete })
      });
      if (res.ok) {
        setShowModal(false); fetchQuotes();
        setFormData({
          number: `QT-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
          customerId: '', leadId: '', date: format(new Date(), 'yyyy-MM-dd'),
          expiryDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
          notes: '', paymentTerms: 'Paiement à 30 jours', deliveryDelay: '', vatRate: 19.25, globalDiscount: 0, discountType: 'percent',
          items: [{ productId: '', description: '', quantity: 1, unitPrice: 0, discount: 0, totalPrice: 0 }]
        });
      } else { const d = await res.json(); setError(d.error || "Erreur."); }
    } catch (err) { setError("Erreur réseau."); } finally { setIsSubmitting(false); }
  };

  const handleShareLink = (quoteId: number) => {
    const publicUrl = `${window.location.origin}/public/quotes/${quoteId}`;
    navigator.clipboard.writeText(publicUrl);
    alert("Lien de signature copié !");
  };

  const [emailModal, setEmailModal] = useState<{ quoteId: number; customerName: string; customerEmail: string } | null>(null);
  const [emailForm, setEmailForm] = useState({ email: '', name: '', message: '' });
  const [sendingEmail, setSendingEmail] = useState(false);

  const handleSendEmail = async () => {
    if (!emailModal || !emailForm.email) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/quotes/${emailModal.quoteId}/send-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail: emailForm.email, recipientName: emailForm.name, message: emailForm.message })
      });
      if (res.ok) {
        alert('Devis envoyé par email !');
        setEmailModal(null);
        setEmailForm({ email: '', name: '', message: '' });
        fetchQuotes();
      } else {
        const d = await res.json();
        alert('Erreur: ' + (d.error || 'Envoi échoué'));
      }
    } catch (err) { alert('Erreur réseau'); }
    finally { setSendingEmail(false); }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Brouillon': return 'bg-slate-100 text-slate-800';
      case 'Envoyé': return 'bg-blue-100 text-blue-800';
      case 'Signé': return 'bg-emerald-100 text-emerald-800';
      case 'Accepté': return 'bg-emerald-100 text-emerald-800';
      case 'Refusé': return 'bg-red-100 text-red-800';
      case 'Expiré': return 'bg-amber-100 text-amber-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const filtered = quotes.filter(q => {
    const s = q.number?.toLowerCase().includes(searchTerm.toLowerCase()) || q.customerName?.toLowerCase().includes(searchTerm.toLowerCase());
    const f = statusFilter === 'all' || q.status === statusFilter;
    return s && f;
  });

  if (loading) return <div className="flex h-screen items-center justify-center">Chargement...</div>;

  return (
    <div className="space-y-6" data-testid="quotes-page">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Devis</h2>
          <p className="text-slate-500 text-sm">Gérez vos propositions commerciales</p>
        </div>
        <button onClick={() => setShowModal(true)} data-testid="new-quote-btn" className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-all shadow-sm font-medium">
          <Plus size={20} /> Nouveau Devis
        </button>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input type="text" placeholder="Rechercher..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
          <option value="all">Tous les statuts</option>
          <option value="Brouillon">Brouillon</option>
          <option value="Envoyé">Envoyé</option>
          <option value="Accepté">Accepté</option>
          <option value="Refusé">Refusé</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <th className="px-6 py-4">N° Devis</th>
              <th className="px-4 py-4">Client</th>
              <th className="px-4 py-4 hidden md:table-cell">Date</th>
              <th className="px-4 py-4">Montant</th>
              <th className="px-4 py-4">Statut</th>
              <th className="px-4 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(q => (
              <tr key={q.id} className="hover:bg-slate-50/50 transition-colors" data-testid={`quote-row-${q.id}`}>
                <td className="px-6 py-4 font-medium text-sm text-slate-800">{q.number}</td>
                <td className="px-4 py-4 text-sm text-slate-600">{q.customerName || 'N/A'}</td>
                <td className="px-4 py-4 text-sm text-slate-500 hidden md:table-cell">{q.date ? new Date(q.date).toLocaleDateString('fr-FR') : '-'}</td>
                <td className="px-4 py-4 text-sm font-bold text-slate-800">{Number(q.amount).toLocaleString()} FCFA</td>
                <td className="px-4 py-4"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${getStatusColor(q.status)}`}>{q.status}</span></td>
                <td className="px-4 py-4">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => {
                      const email = q.customerEmail || q.leadEmail || '';
                      setEmailForm({ email, name: q.customerName || '', message: '' });
                      setEmailModal({ quoteId: q.id, customerName: q.customerName || '', customerEmail: email });
                    }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Envoyer par email" data-testid={`email-quote-${q.id}`}><Mail size={16} /></button>
                    <button onClick={() => handleShareLink(q.id)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Lien de signature" data-testid={`share-quote-${q.id}`}><Share2 size={16} /></button>
                    {(q.status === 'Signé' || q.status === 'Accepté') && (
                      <button onClick={async () => {
                        const r = await fetch(`/api/quotes/${q.id}/convert-to-invoice`, { method: 'POST' });
                        if (r.ok) { alert('Facture créée !'); fetchQuotes(); } else { alert('Erreur'); }
                      }} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Convertir en Facture"><FileText size={16} /></button>
                    )}
                    <button onClick={async () => {
                      if (!confirm('Supprimer ce devis ?')) return;
                      await fetch(`/api/quotes/${q.id}`, { method: 'DELETE' }); fetchQuotes();
                    }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Supprimer"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-center py-12 text-slate-400">Aucun devis trouvé</div>}
      </div>

      {/* New Quote Modal - Full Width */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-start justify-center z-50 p-2 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl my-4 flex flex-col" data-testid="quote-modal">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 sticky top-0 z-10 rounded-t-2xl">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Nouveau Devis</h3>
                <p className="text-slate-500 text-sm">Créez une proposition commerciale complète</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600"><X size={24} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-8">
              {error && <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm flex items-center gap-2"><AlertCircle size={18} />{error}</div>}

              {/* Section 1: Infos générales */}
              <div>
                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Informations générales</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">N° Devis</label>
                    <input type="text" value={formData.number} readOnly className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Date</label>
                    <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Date d'expiration</label>
                    <input type="date" required value={formData.expiryDate} onChange={e => setFormData({ ...formData, expiryDate: e.target.value })} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">TVA (%)</label>
                    <input type="number" step="0.01" value={formData.vatRate} onChange={e => setFormData({ ...formData, vatRate: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                  </div>
                </div>
              </div>

              {/* Section 2: Destinataire */}
              <div>
                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Destinataire</h4>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit mb-3">
                      <button type="button" onClick={() => { setRecipientType('customer'); setFormData({ ...formData, customerId: '', leadId: '' }); }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${recipientType === 'customer' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Client</button>
                      <button type="button" onClick={() => { setRecipientType('lead'); setFormData({ ...formData, customerId: '', leadId: '' }); }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${recipientType === 'lead' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Prospect</button>
                    </div>
                    {recipientType === 'customer' ? (
                      <select required value={formData.customerId} onChange={e => setFormData({ ...formData, customerId: e.target.value, leadId: '' })}
                        className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none">
                        <option value="">Choisir un client...</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : (
                      <select required value={formData.leadId} onChange={e => setFormData({ ...formData, leadId: e.target.value, customerId: '' })}
                        className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none">
                        <option value="">Choisir un prospect...</option>
                        {leads.filter(l => l.status !== 'Converti').map(l => (
                          <option key={l.id} value={l.id}>{l.type === 'company' ? l.companyName : `${l.firstName || ''} ${l.lastName || ''}`.trim() || `Prospect #${l.id}`}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Conditions de paiement</label>
                      <select value={formData.paymentTerms} onChange={e => setFormData({ ...formData, paymentTerms: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none">
                        <option>Paiement comptant</option>
                        <option>Paiement à 30 jours</option>
                        <option>Paiement à 60 jours</option>
                        <option>Paiement à 90 jours</option>
                        <option>50% à la commande, 50% à la livraison</option>
                        <option>30% à la commande, 70% à la livraison</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Délai de livraison</label>
                      <input type="text" value={formData.deliveryDelay} onChange={e => setFormData({ ...formData, deliveryDelay: e.target.value })}
                        placeholder="Ex: 15 jours ouvrés" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Articles */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><PlusCircle size={16} className="text-indigo-600" />Articles</h4>
                  <button type="button" onClick={handleAddItem} className="text-indigo-600 hover:text-indigo-700 text-sm font-bold flex items-center gap-1"><Plus size={16} /> Ajouter</button>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[800px]">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Produit / Description</th>
                        <th className="px-4 py-3 w-24 text-center">Qté</th>
                        <th className="px-4 py-3 w-36 text-right">Prix Unit. HT</th>
                        <th className="px-4 py-3 w-24 text-center">Remise %</th>
                        <th className="px-4 py-3 w-40 text-right">Total HT</th>
                        <th className="px-4 py-3 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formData.items.map((item, i) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3">
                            <select value={item.productId} onChange={e => handleItemChange(i, 'productId', e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none mb-2">
                              <option value="">Produit du catalogue...</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.name} - {Number(p.price).toLocaleString()} FCFA</option>)}
                            </select>
                            <input type="text" placeholder="Description libre..." value={item.description} onChange={e => handleItemChange(i, 'description', e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                          </td>
                          <td className="px-4 py-3"><input type="number" min="1" value={item.quantity} onChange={e => handleItemChange(i, 'quantity', e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-indigo-500/20 outline-none" /></td>
                          <td className="px-4 py-3"><input type="number" value={item.unitPrice} onChange={e => handleItemChange(i, 'unitPrice', e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-indigo-500/20 outline-none" /></td>
                          <td className="px-4 py-3"><input type="number" min="0" max="100" value={item.discount} onChange={e => handleItemChange(i, 'discount', e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-indigo-500/20 outline-none" /></td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">{item.totalPrice.toLocaleString()} FCFA</td>
                          <td className="px-4 py-3 text-center"><button type="button" onClick={() => handleRemoveItem(i)} className="text-slate-300 hover:text-red-500"><MinusCircle size={18} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 4: Totaux + Remise globale */}
              <div className="flex flex-col lg:flex-row gap-6 justify-between">
                <div className="flex-1 space-y-4">
                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Remise globale</h4>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
                      <button type="button" onClick={() => setFormData({ ...formData, discountType: 'percent' })}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium ${formData.discountType === 'percent' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}><Percent size={14} /></button>
                      <button type="button" onClick={() => setFormData({ ...formData, discountType: 'fixed' })}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium ${formData.discountType === 'fixed' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>FCFA</button>
                    </div>
                    <input type="number" min="0" value={formData.globalDiscount} onChange={e => setFormData({ ...formData, globalDiscount: parseFloat(e.target.value) || 0 })}
                      className="w-32 px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes / Observations</label>
                    <textarea rows={4} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Conditions particulières, observations..." className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none text-sm" />
                  </div>
                </div>
                <div className="w-full lg:w-96">
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex justify-between text-sm text-slate-500"><span>Sous-total HT</span><span>{subtotal.toLocaleString()} FCFA</span></div>
                    {itemDiscounts > 0 && <div className="flex justify-between text-sm text-orange-600"><span>Remises articles</span><span>-{itemDiscounts.toLocaleString()} FCFA</span></div>}
                    {globalDiscountAmount > 0 && <div className="flex justify-between text-sm text-orange-600"><span>Remise globale {formData.discountType === 'percent' ? `(${formData.globalDiscount}%)` : ''}</span><span>-{globalDiscountAmount.toLocaleString()} FCFA</span></div>}
                    <div className="flex justify-between text-sm text-slate-500 border-t border-slate-200 pt-3"><span>Total HT</span><span>{afterAllDiscounts.toLocaleString()} FCFA</span></div>
                    <div className="flex justify-between text-sm text-slate-500"><span>TVA ({formData.vatRate}%)</span><span>{vatAmount.toLocaleString()} FCFA</span></div>
                    <div className="flex justify-between text-lg font-bold text-slate-900 border-t-2 border-slate-300 pt-3">
                      <span>TOTAL TTC</span><span className="text-indigo-600">{totalTTC.toLocaleString()} FCFA</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-3 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50">Annuler</button>
                <button type="submit" disabled={isSubmitting} data-testid="save-quote-btn"
                  className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-200 flex items-center gap-2 disabled:opacity-50">
                  <Save size={20} /> {isSubmitting ? 'Enregistrement...' : 'Enregistrer le Devis'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Email Send Modal */}
      {emailModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" data-testid="email-modal">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Envoyer le devis</h3>
                <p className="text-sm text-slate-500">Le destinataire recevra un lien de signature</p>
              </div>
              <button onClick={() => setEmailModal(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email du destinataire *</label>
                <input type="email" required value={emailForm.email} onChange={e => setEmailForm({...emailForm, email: e.target.value})} placeholder="client@exemple.com" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom du destinataire</label>
                <input type="text" value={emailForm.name} onChange={e => setEmailForm({...emailForm, name: e.target.value})} placeholder="Jean Dupont" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message personnalisé</label>
                <textarea rows={3} value={emailForm.message} onChange={e => setEmailForm({...emailForm, message: e.target.value})} placeholder="Message optionnel..." className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEmailModal(null)} className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50">Annuler</button>
                <button onClick={handleSendEmail} disabled={sendingEmail || !emailForm.email} className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm">
                  <Send size={18} /> {sendingEmail ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
