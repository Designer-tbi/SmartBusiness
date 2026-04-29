import React, { useState, useEffect } from 'react';
import { Receipt, Plus, Search, Trash2, Edit2, Filter, DollarSign, Calendar, Download, CheckCircle2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Invoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        const response = await fetch('/api/invoices');
        if (response.ok) {
          const data = await response.json();
          setInvoices(data);
        }
      } catch (err) {
        console.error("Error fetching invoices:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Payé': return 'bg-emerald-100 text-emerald-800';
      case 'En attente': return 'bg-blue-100 text-blue-800';
      case 'En retard': return 'bg-red-100 text-red-800';
      case 'Annulé': return 'bg-slate-100 text-slate-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const filteredInvoices = invoices.filter(i => {
    const matchesSearch = (i.number || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (i.customerName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || i.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) return <div className="flex h-screen items-center justify-center">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Factures</h2>
          <p className="text-slate-500 text-sm">Gérez votre facturation et le suivi des paiements</p>
        </div>
        <button className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-sm">
          <Plus size={20} />
          Nouvelle Facture
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <CheckCircle2 size={20} className="text-emerald-600" />
            <span className="text-sm font-medium">Encaissé</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{invoices.filter(i => i.status === 'Payée').reduce((a, i) => a + Number(i.amount || 0), 0).toLocaleString()} FCFA</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <Clock size={20} className="text-blue-600" />
            <span className="text-sm font-medium">En attente</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{invoices.filter(i => i.status === 'En attente').reduce((a, i) => a + Number(i.amount || 0), 0).toLocaleString()} FCFA</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <Clock size={20} className="text-red-600" />
            <span className="text-sm font-medium">En retard</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{invoices.filter(i => i.status === 'En retard').reduce((a, i) => a + Number(i.amount || 0), 0).toLocaleString()} FCFA</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher une facture ou un client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={18} className="text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full md:w-auto px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          >
            <option value="all">Tous les statuts</option>
            <option value="Payé">Payé</option>
            <option value="En attente">En attente</option>
            <option value="En retard">En retard</option>
            <option value="Annulé">Annulé</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">N° Facture</th>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Montant</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Échéance</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-indigo-600">{invoice.number}</td>
                  <td className="px-6 py-4 text-slate-900 font-medium">{invoice.customerName}</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{invoice.amount.toLocaleString()} FCFA</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">{format(new Date(invoice.date), 'dd MMM yyyy', { locale: fr })}</td>
                  <td className="px-6 py-4">{format(new Date(invoice.dueDate), 'dd MMM yyyy', { locale: fr })}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
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
    </div>
  );
}
