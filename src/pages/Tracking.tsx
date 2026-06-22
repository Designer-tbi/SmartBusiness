import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Plus, Search, Trash2, Edit2, Filter, Calendar, Clock, CheckCircle2, AlertCircle, FileText, Receipt, User } from 'lucide-react';
import { format, isBefore, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';

export default function Tracking() {
  const { profile: currentUser } = useAuth();
  const [activities, setActivities] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [actRes, quoteRes, invRes, userRes, custRes] = await Promise.all([
          fetch('/api/activities'),
          fetch('/api/quotes'),
          fetch('/api/invoices'),
          fetch('/api/users'),
          fetch('/api/customers')
        ]);

        if (actRes.ok) setActivities(await actRes.json());
        if (quoteRes.ok) setQuotes(await quoteRes.json());
        if (invRes.ok) setInvoices(await invRes.json());
        if (userRes.ok) setUsers(await userRes.json());
        if (custRes.ok) setCustomers(await custRes.json());
      } catch (err) {
        console.error("Error fetching tracking data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  const combinedData = useMemo(() => {
    const allData = [
      ...activities.map(a => ({ ...a, dataType: 'activity' })),
      ...quotes.map(q => ({ ...q, dataType: 'quote', subject: `Devis ${q.number}`, type: 'DEVIS' })),
      ...invoices.map(i => ({ ...i, dataType: 'invoice', subject: `Facture ${i.number}`, type: 'FACTURE' }))
    ];

    return allData.filter(item => {
      const matchesSearch = (item.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (item.customerName || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesClient = clientFilter === 'all' || 
                           item.customer_id?.toString() === clientFilter || 
                           item.customerId?.toString() === clientFilter;
      
      const matchesUser = userFilter === 'all' || 
                         item.agent_id === userFilter || 
                         item.agentId === userFilter;
      
      const matchesType = typeFilter === 'all' || item.dataType === typeFilter;

      return matchesSearch && matchesClient && matchesUser && matchesType;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activities, quotes, invoices, searchTerm, clientFilter, userFilter, typeFilter]);

  const stats = useMemo(() => {
    const today = new Date();
    
    // Filtered stats based on current user/client filters (but not type filter for cards)
    const baseFilteredQuotes = quotes.filter(q => {
      const matchesClient = clientFilter === 'all' || q.customer_id?.toString() === clientFilter;
      const matchesUser = userFilter === 'all' || q.agent_id === userFilter;
      return matchesClient && matchesUser;
    });

    const baseFilteredInvoices = invoices.filter(i => {
      const matchesClient = clientFilter === 'all' || i.customer_id?.toString() === clientFilter;
      const matchesUser = userFilter === 'all' || i.agent_id === userFilter;
      return matchesClient && matchesUser;
    });

    const sentQuotes = baseFilteredQuotes.filter(q => q.status === 'Envoyé');
    const signedQuotes = baseFilteredQuotes.filter(q => q.status === 'Accepté' || q.status === 'Signé');
    const sentInvoices = baseFilteredInvoices.filter(i => i.status === 'Envoyé');
    const overdueQuotes = baseFilteredQuotes.filter(q => 
      q.status === 'Envoyé' && q.expiryDate && isBefore(parseISO(q.expiryDate), today)
    );

    const totalAmount = [...baseFilteredQuotes, ...baseFilteredInvoices].reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    return {
      sentQuotes: sentQuotes.length,
      signedQuotes: signedQuotes.length,
      sentInvoices: sentInvoices.length,
      overdueQuotes: overdueQuotes.length,
      total: combinedData.length,
      totalAmount
    };
  }, [quotes, invoices, clientFilter, userFilter, combinedData.length]);

  const getStatusColor = (status: string, dataType: string) => {
    if (dataType === 'activity') {
      switch (status) {
        case 'Terminé': return 'bg-emerald-100 text-emerald-800';
        case 'En cours': return 'bg-blue-100 text-blue-800';
        case 'À faire': return 'bg-slate-100 text-slate-800';
        case 'Annulé': return 'bg-red-100 text-red-800';
        default: return 'bg-slate-100 text-slate-800';
      }
    } else if (dataType === 'quote') {
      switch (status) {
        case 'Accepté':
        case 'Signé': return 'bg-emerald-100 text-emerald-800';
        case 'Envoyé': return 'bg-blue-100 text-blue-800';
        case 'Brouillon': return 'bg-slate-100 text-slate-800';
        case 'Refusé': return 'bg-red-100 text-red-800';
        default: return 'bg-slate-100 text-slate-800';
      }
    } else {
      switch (status) {
        case 'Payé': return 'bg-emerald-100 text-emerald-800';
        case 'Envoyé':
        case 'En attente': return 'bg-blue-100 text-blue-800';
        case 'En retard': return 'bg-red-100 text-red-800';
        default: return 'bg-slate-100 text-slate-800';
      }
    }
  };

  const getIcon = (dataType: string) => {
    switch (dataType) {
      case 'quote': return <FileText size={16} className="text-blue-600" />;
      case 'invoice': return <Receipt size={16} className="text-emerald-600" />;
      default: return <Activity size={16} className="text-indigo-600" />;
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Suivi Commercial</h2>
          <p className="text-slate-500 text-sm">Suivi des devis, factures et activités clients</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-sm">
            <Plus size={20} />
            Nouvelle Action
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <FileText size={20} className="text-blue-600" />
            <span className="text-sm font-medium">Devis Envoyés</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.sentQuotes}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <CheckCircle2 size={20} className="text-emerald-600" />
            <span className="text-sm font-medium">Devis Signés</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.signedQuotes}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <Receipt size={20} className="text-indigo-600" />
            <span className="text-sm font-medium">Factures Envoyées</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.sentInvoices}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <AlertCircle size={20} className="text-red-600" />
            <span className="text-sm font-medium">Devis en Retard</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.overdueQuotes}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <Clock size={20} className="text-slate-600" />
            <span className="text-sm font-medium">Total (Valeur)</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{stats.totalAmount.toLocaleString()} FCFA</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-slate-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">Tous les types</option>
              <option value="activity">Activités</option>
              <option value="quote">Devis</option>
              <option value="invoice">Factures</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <User size={18} className="text-slate-400" />
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">Tous les clients</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name || `${c.first_name} ${c.last_name}`}</option>
              ))}
            </select>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-slate-400" />
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="all">Tous les utilisateurs</option>
                {users.map(u => (
                  <option key={u.uid} value={u.uid}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Sujet / N°</th>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Agent</th>
                <th className="px-6 py-4">Montant</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {combinedData.map((item) => (
                <tr key={`${item.dataType}-${item.id}`} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {getIcon(item.dataType)}
                      <span className="text-xs font-medium uppercase text-slate-500">
                        {item.dataType === 'activity' ? item.type : item.dataType}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-900 font-medium">{item.subject || item.number}</td>
                  <td className="px-6 py-4 text-slate-700">{item.customerName}</td>
                  <td className="px-6 py-4 text-slate-500">{item.agentName || 'N/A'}</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">
                    {item.amount ? `${item.amount.toLocaleString()} FCFA` : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(item.status, item.dataType)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 flex items-center gap-2">
                    <Calendar size={14} className="text-slate-400" />
                    {format(new Date(item.date), 'dd/MM/yyyy', { locale: fr })}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
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
