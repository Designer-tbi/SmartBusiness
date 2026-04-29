import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, DollarSign, Users, Target } from 'lucide-react';

export default function SalesAnalysis() {
  const [stats, setStats] = useState({ revenue: 0, avgDeal: 0, newCustomers: 0, conversionRate: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [invoicesRes, customersRes, leadsRes, quotesRes] = await Promise.all([
          fetch('/api/invoices'), fetch('/api/customers'), fetch('/api/leads'), fetch('/api/quotes')
        ]);
        const invoices = invoicesRes.ok ? await invoicesRes.json() : [];
        const customers = customersRes.ok ? await customersRes.json() : [];
        const leads = leadsRes.ok ? await leadsRes.json() : [];
        const quotes = quotesRes.ok ? await quotesRes.json() : [];

        const revenue = invoices.reduce((a: number, i: any) => a + Number(i.amount || 0), 0);
        const paidInvoices = invoices.filter((i: any) => i.status === 'Payée');
        const avgDeal = paidInvoices.length > 0 ? revenue / paidInvoices.length : 0;
        const convertedLeads = leads.filter((l: any) => l.status === 'Converti').length;
        const conversionRate = leads.length > 0 ? (convertedLeads / leads.length) * 100 : 0;

        setStats({ revenue, avgDeal, newCustomers: customers.length, conversionRate });
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-400">Chargement...</div>;

  return (
    <div className="space-y-6" data-testid="sales-analysis-page">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Analyse des Ventes</h2>
        <p className="text-slate-500 text-sm">Visualisez vos performances commerciales</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2"><DollarSign size={18} className="text-emerald-600" /> Chiffre d'Affaires</div>
          <div className="text-2xl font-bold text-slate-900">{stats.revenue.toLocaleString()} FCFA</div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2"><BarChart3 size={18} className="text-blue-600" /> Panier Moyen</div>
          <div className="text-2xl font-bold text-slate-900">{Math.round(stats.avgDeal).toLocaleString()} FCFA</div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2"><Users size={18} className="text-indigo-600" /> Nouveaux Clients</div>
          <div className="text-2xl font-bold text-slate-900">{stats.newCustomers}</div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2"><Target size={18} className="text-amber-600" /> Taux de Conversion</div>
          <div className="text-2xl font-bold text-slate-900">{stats.conversionRate.toFixed(1)}%</div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center py-16">
        <TrendingUp className="w-12 h-12 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">Les graphiques s'afficheront lorsque vous aurez des données</p>
        <p className="text-sm text-slate-400 mt-1">Créez des factures et des devis pour voir l'évolution</p>
      </div>
    </div>
  );
}
