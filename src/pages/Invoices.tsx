import React, { useState, useEffect } from 'react';
import { Receipt, Plus, Search, Trash2, Filter, DollarSign, CheckCircle2, Clock, X, Save, Eye } from 'lucide-react';

export default function Invoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerId: '', amount: 0, date: new Date().toISOString().split('T')[0], dueDate: '', status: 'En attente' });

  const fetchInvoices = async () => {
    try { const r = await fetch('/api/invoices'); if (r.ok) setInvoices(await r.json()); } catch (e) {} finally { setLoading(false); }
  };
  const fetchCustomers = async () => {
    try { const r = await fetch('/api/customers'); if (r.ok) setCustomers(await r.json()); } catch (e) {}
  };

  useEffect(() => { fetchInvoices(); fetchCustomers(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (r.ok) { setShowForm(false); setForm({ customerId: '', amount: 0, date: new Date().toISOString().split('T')[0], dueDate: '', status: 'En attente' }); fetchInvoices(); }
    } catch (e) {}
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cette facture ?')) return;
    await fetch(`/api/invoices/${id}`, { method: 'DELETE' }); fetchInvoices();
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
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><div className="flex items-center gap-3 text-slate-500 mb-2"><CheckCircle2 size={20} className="text-emerald-600" /><span className="text-sm font-medium">Encaissé</span></div><div className="text-2xl font-bold text-slate-900">{paid.toLocaleString()} FCFA</div></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><div className="flex items-center gap-3 text-slate-500 mb-2"><Clock size={20} className="text-blue-600" /><span className="text-sm font-medium">En attente</span></div><div className="text-2xl font-bold text-slate-900">{pending.toLocaleString()} FCFA</div></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><div className="flex items-center gap-3 text-slate-500 mb-2"><Clock size={20} className="text-red-600" /><span className="text-sm font-medium">En retard</span></div><div className="text-2xl font-bold text-slate-900">{overdue.toLocaleString()} FCFA</div></div>
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
                <td className="px-4 py-3 font-bold text-slate-800">{Number(i.amount).toLocaleString()} FCFA</td>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" data-testid="invoice-form-modal">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center"><h3 className="text-lg font-bold text-slate-800">Nouvelle Facture</h3><button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-400" /></button></div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Client</label><select value={form.customerId} onChange={e => setForm({...form, customerId: e.target.value})} className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"><option value="">Aucun client</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Montant (FCFA) *</label><input type="number" required min="0" value={form.amount} onChange={e => setForm({...form, amount: parseFloat(e.target.value) || 0})} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Date *</label><input type="date" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Échéance</label><input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Statut</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none"><option>En attente</option><option>Payée</option><option>En retard</option></select></div>
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50">Annuler</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 flex items-center justify-center gap-2"><Save size={18} /> Créer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
