import React, { useState, useEffect } from 'react';
import { Receipt, Plus, Search, Trash2, Filter, DollarSign, CheckCircle2, Clock, X, Save, Eye, FileText, User, Calendar as CalIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getZoneConfig, formatCurrency } from '../lib/countryConfig';

export default function Invoices() {
  const { profile } = useAuth();
  const zoneCfg = getZoneConfig((profile as any)?.zone);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const due30 = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
  const initialForm = { customerId: '', quoteId: '', amount: 0, date: today, dueDate: due30, status: 'En attente', notes: '' };
  const [form, setForm] = useState(initialForm);

  const fetchInvoices = async () => {
    try { const r = await fetch('/api/invoices'); if (r.ok) setInvoices(await r.json()); } catch (e) {} finally { setLoading(false); }
  };
  const fetchCustomers = async () => {
    try { const r = await fetch('/api/customers'); if (r.ok) setCustomers(await r.json()); } catch (e) {}
  };
  const fetchQuotes = async () => {
    try { const r = await fetch('/api/quotes'); if (r.ok) setQuotes(await r.json()); } catch (e) {}
  };

  useEffect(() => { fetchInvoices(); fetchCustomers(); fetchQuotes(); }, []);

  // When user picks a quote, auto-fill customer + amount
  const handleQuoteChange = (quoteId: string) => {
    const q = quotes.find(qq => String(qq.id) === quoteId);
    if (q) setForm(f => ({ ...f, quoteId, customerId: String(q.customer_id || ''), amount: Number(q.amount || 0) }));
    else setForm(f => ({ ...f, quoteId }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) { alert('Veuillez sélectionner un client'); return; }
    if (!form.amount || form.amount <= 0) { alert('Montant invalide'); return; }
    try {
      const r = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (r.ok) { setShowForm(false); setForm(initialForm); fetchInvoices(); }
      else { const d = await r.json().catch(() => ({})); alert('❌ ' + (d.error || 'Erreur de création')); }
    } catch (e) { alert('Erreur réseau'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cette facture ? Les commissions liées seront aussi supprimées.')) return;
    const r = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
    if (r.ok) { fetchInvoices(); }
    else { const d = await r.json().catch(() => ({})); alert('❌ ' + (d.error || 'Suppression échouée')); }
  };

  const handleMarkPaid = async (id: number) => {
    if (!confirm('Marquer cette facture comme payée ? Une commission de 20% sera créée automatiquement.')) return;
    const r = await fetch(`/api/invoices/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Payée' }) });
    if (r.ok) {
      const d = await r.json();
      alert(d.commissionId ? '✅ Facture payée + commission 20% créée' : '✅ Facture marquée comme payée');
      fetchInvoices();
    } else {
      alert('Erreur');
    }
  };

  const filteredInvoices = invoices.filter(i => {
    const matchesSearch = (i.number || '').toLowerCase().includes(searchTerm.toLowerCase()) || (i.customerName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || i.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const paid = invoices.filter(i => i.status === 'Payée').reduce((a, i) => a + Number(i.amount || 0), 0);
  const pending = invoices.filter(i => i.status === 'En attente').reduce((a, i) => a + Number(i.amount || 0), 0);
  const overdue = invoices.filter(i => i.status === 'En retard').reduce((a, i) => a + Number(i.amount || 0), 0);

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-400">Chargement...</div>;

  return (
    <div className="space-y-6" data-testid="invoices-page">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h2 className="text-2xl font-bold text-slate-800">Factures</h2><p className="text-slate-500 text-sm">{invoices.length} facture{invoices.length > 1 ? 's' : ''}</p></div>
        <button onClick={() => setShowForm(true)} data-testid="new-invoice-btn" className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 font-medium shadow-sm"><Plus size={20} /> Nouvelle Facture</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><div className="flex items-center gap-3 text-slate-500 mb-2"><CheckCircle2 size={20} className="text-emerald-600" /><span className="text-sm font-medium">Encaissé</span></div><div className="text-2xl font-bold text-slate-900">{formatCurrency(paid, (profile as any)?.zone)}</div></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><div className="flex items-center gap-3 text-slate-500 mb-2"><Clock size={20} className="text-blue-600" /><span className="text-sm font-medium">En attente</span></div><div className="text-2xl font-bold text-slate-900">{formatCurrency(pending, (profile as any)?.zone)}</div></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><div className="flex items-center gap-3 text-slate-500 mb-2"><Clock size={20} className="text-red-600" /><span className="text-sm font-medium">En retard</span></div><div className="text-2xl font-bold text-slate-900">{formatCurrency(overdue, (profile as any)?.zone)}</div></div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1 w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="text" placeholder="Rechercher..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" /></div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"><option value="all">Tous</option><option value="En attente">En attente</option><option value="Payée">Payée</option><option value="En retard">En retard</option></select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b"><tr><th className="px-6 py-3">N°</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Montant</th><th className="px-4 py-3 hidden md:table-cell">Date</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filteredInvoices.map(i => (
              <tr key={i.id} className="hover:bg-slate-50/50" data-testid={`invoice-row-${i.id}`}>
                <td className="px-6 py-3 font-medium text-slate-800">{i.number}</td>
                <td className="px-4 py-3 text-slate-600">{i.customerName || 'N/A'}</td>
                <td className="px-4 py-3 font-bold text-slate-800">{formatCurrency(i.amount, (profile as any)?.zone)}</td>
                <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{i.date ? new Date(i.date).toLocaleDateString('fr-FR') : '-'}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${i.status === 'Payée' ? 'bg-emerald-100 text-emerald-700' : i.status === 'En retard' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{i.status}</span></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => window.open(`/public/invoices/${i.id}`, '_blank')} title="Aperçu" className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" data-testid={`preview-invoice-${i.id}`}><Eye size={16} /></button>
                    {i.status !== 'Payée' && (
                      <button onClick={() => handleMarkPaid(i.id)} title="Marquer comme payée (commission 20%)" className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" data-testid={`mark-paid-${i.id}`}><CheckCircle2 size={16} /></button>
                    )}
                    <button onClick={() => handleDelete(i.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredInvoices.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-400">Aucune facture</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="invoice-form-modal">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center"><Receipt className="text-indigo-600" size={20} /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Nouvelle Facture</h3>
                  <p className="text-xs text-slate-500">Devise : {zoneCfg.currency}</p>
                </div>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="bg-slate-50 p-4 rounded-xl space-y-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Source</p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1"><FileText size={14} /> Devis associé (optionnel — pré-remplit le montant)</label>
                  <select value={form.quoteId} onChange={e => handleQuoteChange(e.target.value)} className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" data-testid="invoice-quote-select">
                    <option value="">— Aucun (facture libre) —</option>
                    {quotes.filter(q => q.status === 'Signé' || q.status === 'Accepté' || q.status === 'Facturé').map(q => (
                      <option key={q.id} value={q.id}>{q.number} · {q.customerName} · {Number(q.amount).toLocaleString()} {zoneCfg.currency}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1"><User size={14} /> Client *</label>
                <select required value={form.customerId} onChange={e => setForm({...form, customerId: e.target.value})} className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" data-testid="invoice-customer-select">
                  <option value="">Sélectionner un client</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} {c.city ? `· ${c.city}` : ''}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1"><DollarSign size={14} /> Montant ({zoneCfg.currency}) *</label>
                <input type="number" required min="0" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: parseFloat(e.target.value) || 0})} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-lg font-semibold" data-testid="invoice-amount" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1"><CalIcon size={14} /> Date d'émission *</label>
                  <input type="date" required value={form.date} onChange={e => {
                    const d = new Date(e.target.value); d.setDate(d.getDate() + 30);
                    setForm({...form, date: e.target.value, dueDate: d.toISOString().split('T')[0]});
                  }} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Échéance (auto J+30)</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Statut</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: 'En attente', icon: Clock, active: 'bg-amber-500 text-white border-amber-500 shadow-sm' },
                    { v: 'Payée', icon: CheckCircle2, active: 'bg-emerald-500 text-white border-emerald-500 shadow-sm' },
                    { v: 'En retard', icon: Clock, active: 'bg-red-500 text-white border-red-500 shadow-sm' },
                  ].map(opt => (
                    <button key={opt.v} type="button" onClick={() => setForm({...form, status: opt.v})}
                      className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                        form.status === opt.v ? opt.active : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}>
                      <opt.icon size={14} /> {opt.v}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes / Conditions de paiement</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} placeholder="Ex: Paiement par virement bancaire — RIB en pied de facture" className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => { setShowForm(false); setForm(initialForm); }} className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50">Annuler</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 flex items-center justify-center gap-2 shadow-sm" data-testid="invoice-submit-btn"><Save size={18} /> Créer la facture</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
