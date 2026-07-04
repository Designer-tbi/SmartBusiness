import React, { useState, useEffect } from 'react';
import { FileText, Plus, Eye, Download, MessageSquare, Send, X, Clock, CheckCircle, AlertCircle, ChevronDown, BarChart3, Phone, Users, Target, DollarSign, Calendar } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, getCurrencyLabel } from '../lib/countryConfig';

interface Report {
  id: number; agent_id: string; agent_name: string; title: string;
  period_start: string; period_end: string;
  calls_count: number; meetings_count: number; quotes_count: number; quotes_amount: number;
  new_leads: number; new_customers: number; invoices_amount: number;
  summary: string; challenges: string; next_actions: string;
  status: string; commentsCount: number; created_at: string;
}

interface Comment { id: number; author_name: string; author_role: string; content: string; created_at: string; }

export default function ReportsPage() {
  const { profile } = useAuth();
  const userZone = profile?.zone;
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewReport, setViewReport] = useState<(Report & { comments: Comment[] }) | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: `Rapport du ${new Date().toLocaleDateString('fr-FR')}`, 
    periodStart: new Date().toISOString().split('T')[0], 
    periodEnd: new Date().toISOString().split('T')[0],
    callsCount: 0, meetingsCount: 0, quotesCount: 0, quotesAmount: 0,
    newLeads: 0, newCustomers: 0, invoicesAmount: 0,
    summary: '', challenges: '', nextActions: ''
  });

  const fetchReports = async () => {
    try { const r = await fetch('/api/reports'); if (r.ok) setReports(await r.json()); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchReports(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      const r = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (r.ok) { setShowForm(false); setForm({ title: '', periodStart: '', periodEnd: '', callsCount: 0, meetingsCount: 0, quotesCount: 0, quotesAmount: 0, newLeads: 0, newCustomers: 0, invoicesAmount: 0, summary: '', challenges: '', nextActions: '' }); fetchReports(); }
    } catch (err) { console.error(err); } finally { setSubmitting(false); }
  };

  const openReport = async (id: number) => {
    try { const r = await fetch(`/api/reports/${id}`); if (r.ok) setViewReport(await r.json()); } catch (err) { console.error(err); }
  };

  const addComment = async () => {
    if (!comment.trim() || !viewReport) return;
    try {
      await fetch(`/api/reports/${viewReport.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: comment }) });
      setComment('');
      openReport(viewReport.id);
      fetchReports();
    } catch (err) { console.error(err); }
  };

  const updateStatus = async (id: number, status: string) => {
    await fetch(`/api/reports/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (viewReport?.id === id) openReport(id);
    fetchReports();
  };

  const statusStyle = (s: string) => {
    if (s === 'approved') return 'bg-emerald-100 text-emerald-700';
    if (s === 'rejected') return 'bg-red-100 text-red-700';
    if (s === 'reviewed') return 'bg-blue-100 text-blue-700';
    return 'bg-amber-100 text-amber-700';
  };
  const statusLabel = (s: string) => {
    if (s === 'approved') return 'Approuvé';
    if (s === 'rejected') return 'Rejeté';
    if (s === 'reviewed') return 'Examiné';
    return 'Soumis';
  };

  const downloadReport = (r: Report) => {
    const text = `RAPPORT D'ACTIVITÉ\n${'='.repeat(40)}\n\nAgent: ${r.agent_name}\nTitre: ${r.title}\nPériode: ${r.period_start} au ${r.period_end}\nDate: ${new Date(r.created_at).toLocaleDateString('fr-FR')}\n\nSTATISTIQUES\n${'-'.repeat(20)}\nAppels: ${r.calls_count}\nRéunions: ${r.meetings_count}\nDevis: ${r.quotes_count} (${formatCurrency(r.quotes_amount, userZone)})\nNouveaux leads: ${r.new_leads}\nNouveaux clients: ${r.new_customers}\nFacturation: ${formatCurrency(r.invoices_amount, userZone)}\n\nRÉSUMÉ\n${'-'.repeat(20)}\n${r.summary || 'N/A'}\n\nDIFFICULTÉS\n${'-'.repeat(20)}\n${r.challenges || 'N/A'}\n\nACTIONS À VENIR\n${'-'.repeat(20)}\n${r.next_actions || 'N/A'}`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `rapport_${r.agent_name.replace(/\s/g, '_')}_${r.period_start}.txt`; a.click();
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-400">Chargement...</div>;

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3"><FileText className="w-7 h-7 text-indigo-600" /> Rapports d'activité</h1>
          <p className="text-sm text-slate-500 mt-1">{isAdmin ? 'Consultez les rapports de votre équipe' : 'Soumettez vos rapports d\'activité'}</p>
        </div>
        <button onClick={() => setShowForm(true)} data-testid="new-report-btn" className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium text-sm shadow-sm">
          <Plus className="w-4 h-4" /> Nouveau Rapport
        </button>
      </div>

      {/* Reports List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full">
          <thead><tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
            <th className="text-left px-6 py-4">Rapport</th>
            {isAdmin && <th className="text-left px-4 py-4">Agent</th>}
            <th className="text-left px-4 py-4 hidden md:table-cell">Période</th>
            <th className="text-left px-4 py-4 hidden lg:table-cell">Chiffres clés</th>
            <th className="text-left px-4 py-4">Statut</th>
            <th className="text-right px-6 py-4">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {reports.map(r => {
              const isAI = r.agent_id?.startsWith('ai_') || r.agent_name?.includes('🤖');
              return (
              <tr key={r.id} className={`hover:bg-slate-50/50 ${isAI ? 'bg-indigo-50/30' : ''}`} data-testid={`report-row-${r.id}`}>
                <td className="px-6 py-4">
                  <p className="font-medium text-sm text-slate-800 flex items-center gap-1.5">
                    {isAI && <span className="inline-block bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">IA</span>}
                    {r.title}
                  </p>
                  <p className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString('fr-FR')}</p>
                </td>
                {isAdmin && <td className="px-4 py-4 text-sm text-slate-600">{r.agent_name}</td>}
                <td className="px-4 py-4 text-sm text-slate-500 hidden md:table-cell">{new Date(r.period_start).toLocaleDateString('fr-FR')} - {new Date(r.period_end).toLocaleDateString('fr-FR')}</td>
                <td className="px-4 py-4 hidden lg:table-cell">
                  <div className="flex gap-3 text-xs text-slate-500">
                    <span>{r.calls_count} appels</span>
                    <span>{r.quotes_count} devis</span>
                    <span>{formatCurrency(r.invoices_amount, userZone)}</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusStyle(r.status)}`}>{statusLabel(r.status)}</span>
                  {r.commentsCount > 0 && <span className="ml-2 text-xs text-slate-400"><MessageSquare className="w-3 h-3 inline" /> {r.commentsCount}</span>}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openReport(r.id)} className="p-2 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600" title="Voir"><Eye className="w-4 h-4" /></button>
                    <button onClick={() => downloadReport(r)} className="p-2 hover:bg-emerald-50 rounded-lg text-slate-400 hover:text-emerald-600" title="Télécharger"><Download className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {reports.length === 0 && <div className="text-center py-16 text-slate-400">{isAdmin ? 'Aucun rapport reçu' : 'Aucun rapport soumis'}</div>}
      </div>

      {/* New Report Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-2 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-4" data-testid="report-form-modal">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white rounded-t-2xl z-10">
              <h3 className="text-lg font-bold text-slate-800">Nouveau Rapport d'Activité</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Informations</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Titre du rapport *</label>
                    <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Ex: Rapport Semaine 15" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" /></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Début période *</label>
                    <input type="date" required value={form.periodStart} onChange={e => setForm({...form, periodStart: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" /></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Fin période *</label>
                    <input type="date" required value={form.periodEnd} onChange={e => setForm({...form, periodEnd: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" /></div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Statistiques de la période</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Appels effectués', key: 'callsCount', icon: Phone },
                    { label: 'Réunions / RDV', key: 'meetingsCount', icon: Users },
                    { label: 'Devis envoyés', key: 'quotesCount', icon: Target },
                    { label: `Montant devis (${getCurrencyLabel(userZone)})`, key: 'quotesAmount', icon: DollarSign },
                    { label: 'Nouveaux leads', key: 'newLeads', icon: Users },
                    { label: 'Nouveaux clients', key: 'newCustomers', icon: Users },
                    { label: `Facturation (${getCurrencyLabel(userZone)})`, key: 'invoicesAmount', icon: DollarSign },
                  ].map(({ label, key, icon: Icon }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1"><Icon className="w-3 h-3" />{label}</label>
                      <input type="number" min="0" value={(form as any)[key]} onChange={e => setForm({...form, [key]: parseFloat(e.target.value) || 0})}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm" />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Détails</h4>
                <div className="space-y-4">
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Résumé des activités</label>
                    <textarea rows={3} value={form.summary} onChange={e => setForm({...form, summary: e.target.value})} placeholder="Décrivez vos principales réalisations..." className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none text-sm" /></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Difficultés rencontrées</label>
                    <textarea rows={2} value={form.challenges} onChange={e => setForm({...form, challenges: e.target.value})} placeholder="Obstacles, problèmes..." className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none text-sm" /></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Actions prévues</label>
                    <textarea rows={2} value={form.nextActions} onChange={e => setForm({...form, nextActions: e.target.value})} placeholder="Prochaines étapes..." className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none text-sm" /></div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50">Annuler</button>
                <button type="submit" disabled={submitting} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50">
                  <Send className="w-4 h-4" /> {submitting ? 'Envoi...' : 'Soumettre le rapport'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Report Modal */}
      {viewReport && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-2 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-4" data-testid="report-view-modal">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{viewReport.title}</h3>
                <p className="text-sm text-slate-500">Par {viewReport.agent_name} - {new Date(viewReport.period_start).toLocaleDateString('fr-FR')} au {new Date(viewReport.period_end).toLocaleDateString('fr-FR')}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => downloadReport(viewReport as Report)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-emerald-600"><Download className="w-5 h-5" /></button>
                <button onClick={() => setViewReport(null)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Appels', value: viewReport.calls_count, color: 'text-blue-600 bg-blue-50' },
                  { label: 'RDV', value: viewReport.meetings_count, color: 'text-purple-600 bg-purple-50' },
                  { label: 'Devis', value: viewReport.quotes_count, color: 'text-indigo-600 bg-indigo-50' },
                  { label: 'Leads', value: viewReport.new_leads, color: 'text-amber-600 bg-amber-50' },
                  { label: 'Clients', value: viewReport.new_customers, color: 'text-emerald-600 bg-emerald-50' },
                  { label: 'Montant devis', value: formatCurrency(viewReport.quotes_amount, userZone), color: 'text-cyan-600 bg-cyan-50' },
                  { label: 'Facturation', value: formatCurrency(viewReport.invoices_amount, userZone), color: 'text-green-600 bg-green-50' },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`p-3 rounded-xl ${color}`}>
                    <p className="text-xs font-medium opacity-75">{label}</p>
                    <p className="text-xl font-bold">{value}</p>
                  </div>
                ))}
              </div>

              {viewReport.summary && <div><h4 className="text-sm font-bold text-slate-700 mb-2">Résumé</h4><p className="text-sm text-slate-600 bg-slate-50 p-4 rounded-xl whitespace-pre-wrap">{viewReport.summary}</p></div>}
              {viewReport.challenges && <div><h4 className="text-sm font-bold text-slate-700 mb-2">Difficultés</h4><p className="text-sm text-slate-600 bg-amber-50 p-4 rounded-xl whitespace-pre-wrap">{viewReport.challenges}</p></div>}
              {viewReport.next_actions && <div><h4 className="text-sm font-bold text-slate-700 mb-2">Actions à venir</h4><p className="text-sm text-slate-600 bg-emerald-50 p-4 rounded-xl whitespace-pre-wrap">{viewReport.next_actions}</p></div>}

              {/* Admin Actions */}
              {isAdmin && (
                <div className="flex gap-2 border-t border-slate-100 pt-4">
                  <button onClick={() => updateStatus(viewReport.id, 'approved')} className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-200 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Approuver</button>
                  <button onClick={() => updateStatus(viewReport.id, 'reviewed')} className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 flex items-center gap-1"><Eye className="w-4 h-4" /> Marquer examiné</button>
                  <button onClick={() => updateStatus(viewReport.id, 'rejected')} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Rejeter</button>
                </div>
              )}

              {/* Comments */}
              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Commentaires ({viewReport.comments?.length || 0})</h4>
                <div className="space-y-3 mb-4">
                  {viewReport.comments?.map(c => (
                    <div key={c.id} className="flex gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c.author_role === 'admin' || c.author_role === 'superadmin' ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'}`}>{c.author_name.charAt(0)}</div>
                      <div className="flex-1 bg-slate-50 p-3 rounded-xl">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium text-slate-800">{c.author_name} <span className="text-xs text-slate-400">({c.author_role})</span></span>
                          <span className="text-xs text-slate-400">{new Date(c.created_at).toLocaleString('fr-FR')}</span>
                        </div>
                        <p className="text-sm text-slate-600">{c.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()} placeholder="Ajouter un commentaire..."
                    className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none" data-testid="comment-input" />
                  <button onClick={addComment} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700" data-testid="send-comment-btn"><Send className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
