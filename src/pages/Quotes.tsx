import React, { useState, useEffect } from 'react';
import { FileText, Plus, Search, Trash2, Edit2, Filter, DollarSign, Calendar, Download, X, Save, PlusCircle, MinusCircle, Send, CheckCircle, Share2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Quotes() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
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
    items: [{ productId: '', description: '', quantity: 1, unitPrice: 0, totalPrice: 0 }]
  });

  useEffect(() => {
    fetchQuotes();
    fetchData();
  }, []);

  const fetchQuotes = async () => {
    try {
      const response = await fetch('/api/quotes');
      if (response.ok) {
        const data = await response.json();
        setQuotes(data);
      }
    } catch (err) {
      console.error("Error fetching quotes:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const [custRes, leadRes, prodRes] = await Promise.all([
        fetch('/api/customers'),
        fetch('/api/leads'),
        fetch('/api/products')
      ]);
      if (custRes.ok) setCustomers(await custRes.json());
      if (leadRes.ok) setLeads(await leadRes.json());
      if (prodRes.ok) setProducts(await prodRes.json());
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { productId: '', description: '', quantity: 1, unitPrice: 0, totalPrice: 0 }]
    });
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...formData.items];
    newItems.splice(index, 1);
    setFormData({ ...formData, items: newItems });
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    const item = { ...newItems[index], [field]: value };
    
    if (field === 'productId') {
      const product = products.find(p => p.id === parseInt(value));
      if (product) {
        item.description = product.name;
        item.unitPrice = Number(product.price);
      }
    }
    
    item.totalPrice = Number(item.quantity) * Number(item.unitPrice);
    newItems[index] = item;
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalAmount = formData.items.reduce((acc, item) => acc + item.totalPrice, 0);
    
    try {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, amount: totalAmount })
      });

      if (response.ok) {
        setShowModal(false);
        fetchQuotes();
        setFormData({
          number: `QT-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
          customerId: '',
          leadId: '',
          date: format(new Date(), 'yyyy-MM-dd'),
          expiryDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
          notes: '',
          items: [{ productId: '', description: '', quantity: 1, unitPrice: 0, totalPrice: 0 }]
        });
      }
    } catch (err) {
      console.error("Error saving quote:", err);
    }
  };

  const handleShareLink = (quoteId: number) => {
    const publicUrl = `${window.location.origin}/public/quotes/${quoteId}`;
    navigator.clipboard.writeText(publicUrl);
    alert("Lien de signature copié dans le presse-papier ! Vous pouvez l'envoyer par email à votre client.");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Brouillon': return 'bg-slate-100 text-slate-800';
      case 'Envoyé': return 'bg-blue-100 text-blue-800';
      case 'Accepté': return 'bg-emerald-100 text-emerald-800';
      case 'Refusé': return 'bg-red-100 text-red-800';
      case 'Expiré': return 'bg-amber-100 text-amber-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const filteredQuotes = quotes.filter(q => {
    const matchesSearch = q.number.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         q.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || q.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) return <div className="flex h-screen items-center justify-center">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Devis</h2>
          <p className="text-slate-500 text-sm">Gérez vos propositions commerciales et devis clients</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
        >
          <Plus size={20} />
          Nouveau Devis
        </button>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher un devis ou un client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={18} className="text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full md:w-auto px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          >
            <option value="all">Tous les statuts</option>
            <option value="Brouillon">Brouillon</option>
            <option value="Envoyé">Envoyé</option>
            <option value="Accepté">Accepté</option>
            <option value="Refusé">Refusé</option>
            <option value="Expiré">Expiré</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">N° Devis</th>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Montant</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Expiration</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredQuotes.map((quote) => (
                <tr key={quote.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-indigo-600">{quote.number}</td>
                  <td className="px-6 py-4 text-slate-900 font-medium">{quote.customerName}</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{Number(quote.amount).toLocaleString()} FCFA</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(quote.status)}`}>
                      {quote.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">{format(new Date(quote.date), 'dd MMM yyyy', { locale: fr })}</td>
                  <td className="px-6 py-4">{quote.expiryDate ? format(new Date(quote.expiryDate), 'dd MMM yyyy', { locale: fr }) : '-'}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleShareLink(quote.id)}
                        title="Partager le lien de signature"
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <Share2 size={16} />
                      </button>
                      <button className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                        <Download size={16} />
                      </button>
                      <button className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                        <Edit2 size={16} />
                      </button>
                      <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Quote Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Nouveau Devis</h3>
                <p className="text-slate-500 text-sm">Créez une proposition commerciale détaillée</p>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">N° Devis</label>
                  <input
                    type="text"
                    value={formData.number}
                    readOnly
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 outline-none"
                  />
                </div>
                <div className="space-y-4">
                  <label className="text-sm font-semibold text-slate-700 block">Type de destinataire</label>
                  <div className="flex gap-4 p-1 bg-slate-100 rounded-lg w-fit">
                    <button
                      type="button"
                      onClick={() => {
                        setRecipientType('customer');
                        setFormData({ ...formData, customerId: '', leadId: '' });
                      }}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${recipientType === 'customer' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Client
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRecipientType('lead');
                        setFormData({ ...formData, customerId: '', leadId: '' });
                      }}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${recipientType === 'lead' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Prospect
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {recipientType === 'customer' ? (
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Sélectionner un Client</label>
                        <select
                          required={recipientType === 'customer'}
                          value={formData.customerId}
                          onChange={(e) => setFormData({ ...formData, customerId: e.target.value, leadId: '' })}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        >
                          <option value="">Choisir un client...</option>
                          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Sélectionner un Prospect (Lead)</label>
                        <select
                          required={recipientType === 'lead'}
                          value={formData.leadId}
                          onChange={(e) => setFormData({ ...formData, leadId: e.target.value, customerId: '' })}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        >
                          <option value="">Choisir un prospect...</option>
                          {leads.filter(l => l.status !== 'Converti').map(l => (
                            <option key={l.id} value={l.id}>
                              {l.type === 'company' 
                                ? l.companyName 
                                : `${l.firstName || ''} ${l.lastName || ''}`.trim() || l.email || `Prospect #${l.id}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Date d'expiration</label>
                  <input
                    type="date"
                    required
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <PlusCircle size={20} className="text-indigo-600" />
                    Articles du Devis
                  </h4>
                  <button 
                    type="button"
                    onClick={handleAddItem}
                    className="text-indigo-600 hover:text-indigo-700 text-sm font-bold flex items-center gap-1"
                  >
                    <Plus size={16} /> Ajouter un article
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Produit / Description</th>
                        <th className="px-4 py-3 w-24 text-center">Qté</th>
                        <th className="px-4 py-3 w-40 text-right">Prix Unitaire</th>
                        <th className="px-4 py-3 w-40 text-right">Total</th>
                        <th className="px-4 py-3 w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formData.items.map((item, index) => (
                        <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="space-y-2">
                              <select
                                value={item.productId}
                                onChange={(e) => handleItemChange(index, 'productId', e.target.value)}
                                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none"
                              >
                                <option value="">Sélectionner un produit...</option>
                                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                              <input
                                type="text"
                                placeholder="Description personnalisée..."
                                value={item.description}
                                onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-center outline-none"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              value={item.unitPrice}
                              onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-right outline-none"
                            />
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            {item.totalPrice.toLocaleString()} FCFA
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button 
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              className="text-slate-300 hover:text-red-500 transition-all"
                            >
                              <MinusCircle size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 w-full max-w-xs space-y-2">
                    <div className="flex justify-between text-slate-500 text-sm">
                      <span>Sous-total</span>
                      <span>{formData.items.reduce((acc, item) => acc + item.totalPrice, 0).toLocaleString()} FCFA</span>
                    </div>
                    <div className="flex justify-between text-slate-500 text-sm">
                      <span>TVA (0%)</span>
                      <span>0 FCFA</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200">
                      <span>TOTAL</span>
                      <span className="text-indigo-600">{formData.items.reduce((acc, item) => acc + item.totalPrice, 0).toLocaleString()} FCFA</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Notes / Conditions</label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Conditions de paiement, délais de livraison..."
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold hover:bg-slate-50 transition-all"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  className="px-8 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
                >
                  <Save size={20} />
                  Enregistrer le Devis
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
