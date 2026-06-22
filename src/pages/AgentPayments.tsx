import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  Mail,
  ServerCog,
  AlertCircle,
  DollarSign,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/countryConfig';

type Payment = {
  id: number;
  number: string;
  amount: number;
  date: string;
  agent_id: string;
  agent_name?: string;
  payment_status: string;
  payment_id?: string;
  payment_method?: string;
  payment_date?: string;
  payment_amount?: number;
  payment_currency?: string;
  subscription_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_company?: string;
  product_names?: string | null;
  items_count?: number;
  has_smartdesk: boolean;
  smartdesk_provisioned_at?: string | null;
  commission_amount?: number | null;
  commission_status?: string | null;
  commission_rate?: number | null;
};

export default function AgentPayments() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [provisioning, setProvisioning] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchPayments = async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const r = await fetch('/api/agent/payments');
      if (r.ok) {
        setPayments(await r.json());
        setLastUpdate(new Date());
      }
    } catch (e) {
      console.error('Erreur chargement paiements', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Real-time polling every 20s for SmartDesk status changes
  useEffect(() => {
    fetchPayments();
    const interval = setInterval(() => fetchPayments(true), 20000);
    return () => clearInterval(interval);
  }, []);

  const handleReprovision = async (quoteId: number) => {
    if (!isAdmin) return;
    setProvisioning(quoteId);
    try {
      const r = await fetch(`/api/quotes/${quoteId}/smartdesk/provision`, { method: 'POST' });
      const data = await r.json();
      if (r.ok && data.provisioned) {
        alert(`✅ Compte SmartDesk activé pour le devis #${quoteId}`);
        fetchPayments();
      } else {
        alert(`ℹ️ ${data.error || 'Provisioning impossible'}`);
      }
    } catch (e: any) {
      alert('Erreur: ' + e.message);
    } finally {
      setProvisioning(null);
    }
  };

  const filtered = payments.filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      p.number?.toLowerCase().includes(s) ||
      p.customer_name?.toLowerCase().includes(s) ||
      p.customer_email?.toLowerCase().includes(s) ||
      p.product_names?.toLowerCase().includes(s) ||
      p.agent_name?.toLowerCase().includes(s)
    );
  });

  // Stats
  const totalRevenue = payments.reduce((acc, p) => acc + Number(p.payment_amount || p.amount), 0);
  const totalCommissions = payments.reduce((acc, p) => acc + Number(p.commission_amount || 0), 0);
  const paidCommissions = payments
    .filter((p) => p.commission_status === 'Payé')
    .reduce((acc, p) => acc + Number(p.commission_amount || 0), 0);
  const pendingCommissions = totalCommissions - paidCommissions;
  const smartdeskActive = payments.filter((p) => p.has_smartdesk && p.smartdesk_provisioned_at).length;
  const smartdeskPending = payments.filter((p) => p.has_smartdesk && !p.smartdesk_provisioned_at).length;

  const renderSmartDeskBadge = (p: Payment) => {
    if (!p.has_smartdesk) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500" data-testid={`sd-status-${p.id}`}>
          —
        </span>
      );
    }
    if (p.smartdesk_provisioned_at) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700"
          title={`Activé le ${format(new Date(p.smartdesk_provisioned_at), 'dd/MM/yyyy HH:mm')}`}
          data-testid={`sd-status-${p.id}`}
        >
          <CheckCircle2 size={12} /> Compte actif
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700" data-testid={`sd-status-${p.id}`}>
        <AlertCircle size={12} /> En attente
      </span>
    );
  };

  const renderCommissionBadge = (p: Payment) => {
    if (!p.commission_amount) {
      return <span className="text-xs text-slate-400 italic">—</span>;
    }
    const color =
      p.commission_status === 'Payé'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-blue-50 text-blue-700 border-blue-200';
    return (
      <div className="space-y-0.5">
        <div className="font-semibold text-slate-900">
          {formatCurrency(Number(p.commission_amount), profile?.zone)}
        </div>
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${color}`}>
          {p.commission_status || 'En attente'} {p.commission_rate ? `· ${p.commission_rate}%` : ''}
        </span>
      </div>
    );
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">Chargement des paiements…</div>;
  }

  return (
    <div className="space-y-6" data-testid="agent-payments-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <CreditCard className="text-indigo-600" size={28} /> Mes Paiements
          </h2>
          <p className="text-slate-500 text-sm">
            {isAdmin ? 'Tous les devis encaissés par votre équipe' : 'Vos devis encaissés, commissions et activations SmartDesk'}
            <span className="ml-2 text-xs text-slate-400">
              · Dernière mise à jour : {format(lastUpdate, 'HH:mm:ss')}
            </span>
          </p>
        </div>
        <button
          onClick={() => fetchPayments()}
          disabled={refreshing}
          data-testid="refresh-payments-btn"
          className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm" data-testid="stat-revenue">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <DollarSign size={16} className="text-indigo-600" />
            <span className="text-xs font-medium">Revenu Total</span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-900">{formatCurrency(totalRevenue, profile?.zone)}</div>
          <p className="text-[10px] text-slate-400 mt-1">{payments.length} devis payés</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm" data-testid="stat-commission-total">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <TrendingUp size={16} className="text-violet-600" />
            <span className="text-xs font-medium">Commissions Totales</span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-violet-700">{formatCurrency(totalCommissions, profile?.zone)}</div>
          <p className="text-[10px] text-slate-400 mt-1">
            {formatCurrency(paidCommissions, profile?.zone)} payées · {formatCurrency(pendingCommissions, profile?.zone)} en attente
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm" data-testid="stat-smartdesk-active">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <ServerCog size={16} className="text-emerald-600" />
            <span className="text-xs font-medium">SmartDesk Actifs</span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-emerald-700">{smartdeskActive}</div>
          <p className="text-[10px] text-slate-400 mt-1">comptes provisionnés</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm" data-testid="stat-smartdesk-pending">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Clock size={16} className="text-amber-600" />
            <span className="text-xs font-medium">SmartDesk En attente</span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-amber-700">{smartdeskPending}</div>
          <p className="text-[10px] text-slate-400 mt-1">à activer manuellement</p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher par devis, client, produit, agent…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="search-payments-input"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Devis</th>
                <th className="px-4 py-3">Date paiement</th>
                <th className="px-4 py-3">Produit / Service</th>
                <th className="px-4 py-3">Client</th>
                {isAdmin && <th className="px-4 py-3">Agent</th>}
                <th className="px-4 py-3 text-right">Montant payé</th>
                <th className="px-4 py-3">Commission</th>
                <th className="px-4 py-3">SmartDesk</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors" data-testid={`payment-row-${p.id}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-indigo-600">{p.number}</div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      {p.payment_method === 'PAYPAL_SUBSCRIPTION' ? (
                        <>Abonnement · Réf. {p.subscription_id?.substring(0, 14)}…</>
                      ) : (
                        <>One-time · Réf. {p.payment_id?.substring(0, 14)}…</>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-xs whitespace-nowrap" data-testid={`payment-date-${p.id}`}>
                    {p.payment_date ? format(new Date(p.payment_date), 'dd MMM yyyy', { locale: fr }) : '—'}
                    <div className="text-[10px] text-slate-400">
                      {p.payment_date ? format(new Date(p.payment_date), 'HH:mm', { locale: fr }) : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 max-w-[260px]" data-testid={`payment-product-${p.id}`}>
                    {p.product_names ? (
                      <div className="text-sm font-medium text-slate-800 truncate" title={p.product_names}>
                        {p.product_names}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">—</span>
                    )}
                    {p.items_count && p.items_count > 1 && (
                      <div className="text-[10px] text-slate-400 mt-0.5">{p.items_count} lignes</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{p.customer_company || p.customer_name || '—'}</div>
                    {p.customer_email && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Mail size={10} /> {p.customer_email}
                      </div>
                    )}
                  </td>
                  {isAdmin && <td className="px-4 py-3 text-slate-700">{p.agent_name || '—'}</td>}
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {p.payment_amount
                      ? `${Number(p.payment_amount).toLocaleString()} ${p.payment_currency || ''}`
                      : formatCurrency(Number(p.amount), profile?.zone)}
                    <div className="text-[10px] text-slate-400">Devis : {formatCurrency(Number(p.amount), profile?.zone)}</div>
                  </td>
                  <td className="px-4 py-3">{renderCommissionBadge(p)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      {renderSmartDeskBadge(p)}
                      {p.has_smartdesk && !p.smartdesk_provisioned_at && isAdmin && (
                        <button
                          onClick={() => handleReprovision(p.id)}
                          disabled={provisioning === p.id}
                          data-testid={`provision-btn-${p.id}`}
                          className="text-[11px] text-indigo-600 hover:text-indigo-800 underline disabled:opacity-50"
                        >
                          {provisioning === p.id ? 'Activation…' : 'Activer maintenant'}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/public/quotes/${p.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:text-indigo-800"
                      title="Voir le devis"
                      data-testid={`view-quote-${p.id}`}
                    >
                      <ExternalLink size={16} />
                    </a>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="px-6 py-12 text-center text-slate-400 italic">
                    {search ? 'Aucun paiement ne correspond à votre recherche.' : 'Aucun devis payé pour le moment.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
