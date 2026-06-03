import React, { useState, useEffect } from 'react';
import {
  Target,
  Plus,
  Trash2,
  Edit2,
  Eye,
  X,
  Save,
  ChevronRight,
  ChevronLeft,
  Upload,
  FileText,
  Download,
  Lightbulb,
  Calendar,
  MapPin,
  Users,
  TrendingUp,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Lock,
  FileType,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, getZoneConfig, getCurrencyLabel } from '../lib/countryConfig';
import { uploadFileChunked } from '../lib/chunkedUpload';

type StrategyAction = {
  id?: number;
  action: string;
  responsible?: string;
  dueDate?: string;
  status?: string;
};

type Strategy = {
  id: number;
  title: string;
  period: string;
  start_date?: string;
  end_date?: string;
  zone: string;
  city?: string;
  target_segment?: string;
  target_industry?: string;
  target_revenue: number;
  currency: string;
  kpis?: string;
  risks?: string;
  description?: string;
  status: string;
  agent_visible: boolean;
  created_by_name?: string;
  created_at: string;
  actions_count?: number;
  documents_count?: number;
  actions?: any[];
  documents?: any[];
};

const SEGMENTS = ['PME / TPE', 'Grandes Entreprises', 'Administrations / Ministères', 'ONG / Associations', 'Particuliers VIP', 'Start-ups'];
const INDUSTRIES = ['Banque & Finance', 'Télécoms', 'Pétrole & Gaz', 'Mines', 'BTP & Construction', 'Distribution', 'Hôtellerie & Tourisme', 'Santé', 'Éducation', 'Agriculture', 'Transport & Logistique', 'Industrie manufacturière', 'Services aux entreprises'];
const PERIODS = [
  { value: 'monthly', label: 'Mensuelle' },
  { value: 'quarterly', label: 'Trimestrielle' },
  { value: 'semester', label: 'Semestrielle' },
  { value: 'yearly', label: 'Annuelle' },
];

export default function Strategies() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';
  const userZone = profile?.zone || 'CG';
  const zoneCfg = getZoneConfig(userZone);

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/strategies');
      if (r.ok) setStrategies(await r.json());
    } finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer définitivement cette stratégie et tous ses documents ?')) return;
    const r = await fetch(`/api/strategies/${id}`, { method: 'DELETE' });
    if (r.ok) { fetchAll(); }
    else { const e = await r.json(); alert('Erreur: ' + (e.error || 'inconnue')); }
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-slate-500">Chargement des stratégies…</div>;

  return (
    <div className="space-y-6" data-testid="strategies-page">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Target size={32} className="text-yellow-300" /> Stratégies Commerciales
            </h2>
            <p className="text-indigo-100 text-sm mt-1">
              {isAdmin ? 'Pilotez la performance commerciale de votre équipe' : 'Consultez les stratégies validées par la direction'}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => { setEditingId(null); setShowWizard(true); }}
              data-testid="create-strategy-btn"
              className="flex items-center gap-2 bg-white text-indigo-700 px-5 py-3 rounded-xl font-bold hover:bg-yellow-50 transition-all shadow-lg hover:scale-105"
            >
              <Plus size={20} /> Créer ma stratégie
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {strategies.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border-2 border-dashed border-slate-200 p-12 text-center">
          <Target size={56} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-xl font-bold text-slate-700 mb-2">Aucune stratégie pour le moment</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">
            {isAdmin
              ? 'Définissez votre première stratégie commerciale. Vous serez guidé étape par étape.'
              : 'Aucune stratégie ne vous a encore été partagée. Revenez plus tard.'}
          </p>
          {isAdmin && (
            <button
              onClick={() => { setEditingId(null); setShowWizard(true); }}
              className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all"
            >
              <Plus size={18} className="inline mr-2" /> Commencer
            </button>
          )}
        </div>
      )}

      {/* Strategies grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {strategies.map(s => (
          <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg transition-all" data-testid={`strategy-card-${s.id}`}>
            <div className={`p-4 ${s.status === 'published' ? 'bg-emerald-50' : 'bg-amber-50'}`}>
              <div className="flex justify-between items-start gap-2">
                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${s.status === 'published' ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}`}>
                  {s.status === 'published' ? '● Publiée' : '⏸ Brouillon'}
                </span>
                <span className="text-[10px] text-slate-500">{PERIODS.find(p => p.value === s.period)?.label || s.period}</span>
              </div>
              <h3 className="font-bold text-slate-800 text-lg mt-2 line-clamp-2">{s.title}</h3>
            </div>
            <div className="p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <MapPin size={14} className="text-indigo-500 flex-shrink-0" />
                <span>{s.city || 'Toutes villes'} · {getZoneConfig(s.zone).flag}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Users size={14} className="text-violet-500 flex-shrink-0" />
                <span className="line-clamp-1">{s.target_segment || 'Tous segments'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <TrendingUp size={14} className="text-emerald-500 flex-shrink-0" />
                <span>{formatCurrency(s.target_revenue, s.zone)}</span>
              </div>
              <div className="flex gap-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                <span>🎯 {s.actions_count || 0} actions</span>
                <span>📎 {s.documents_count || 0} documents</span>
              </div>
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-between gap-2">
              <button
                onClick={() => setViewingId(s.id)}
                data-testid={`view-strategy-${s.id}`}
                className="flex-1 flex items-center justify-center gap-1 text-indigo-600 hover:bg-indigo-50 py-2 rounded-lg transition-all text-sm font-medium"
              >
                <Eye size={14} /> Voir
              </button>
              {isAdmin && (
                <>
                  <button
                    onClick={() => { setEditingId(s.id); setShowWizard(true); }}
                    data-testid={`edit-strategy-${s.id}`}
                    className="flex-1 flex items-center justify-center gap-1 text-blue-600 hover:bg-blue-50 py-2 rounded-lg transition-all text-sm font-medium"
                  >
                    <Edit2 size={14} /> Modifier
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    data-testid={`delete-strategy-${s.id}`}
                    className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all"
                    title="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {showWizard && (
        <StrategyWizard
          strategyId={editingId}
          zone={userZone}
          zoneCfg={zoneCfg}
          onClose={() => setShowWizard(false)}
          onSaved={() => { setShowWizard(false); fetchAll(); }}
        />
      )}
      {viewingId !== null && (
        <StrategyViewer
          strategyId={viewingId}
          canEdit={isAdmin}
          onClose={() => setViewingId(null)}
          onEdit={() => { setEditingId(viewingId); setViewingId(null); setShowWizard(true); }}
        />
      )}
    </div>
  );
}

// ============================================================================
// WIZARD — 4-step strategy creation/edition with contextual help
// ============================================================================
function StrategyWizard({ strategyId, zone, zoneCfg, onClose, onSaved }: any) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    title: '',
    period: 'quarterly',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(new Date().setMonth(new Date().getMonth() + 3)), 'yyyy-MM-dd'),
    zone: zone,
    city: '',
    targetSegment: '',
    targetIndustry: '',
    targetRevenue: '',
    currency: zoneCfg.currency,
    kpis: '',
    risks: '',
    description: '',
    status: 'draft',
    agentVisible: true,
    actions: [{ action: '', responsible: '', dueDate: '', status: 'todo' }],
  });
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ pct: number; label: string } | null>(null);

  useEffect(() => {
    if (strategyId) {
      fetch(`/api/strategies/${strategyId}`).then(r => r.json()).then(s => {
        setForm({
          title: s.title,
          period: s.period,
          startDate: s.start_date ? s.start_date.split('T')[0] : '',
          endDate: s.end_date ? s.end_date.split('T')[0] : '',
          zone: s.zone || zone,
          city: s.city || '',
          targetSegment: s.target_segment || '',
          targetIndustry: s.target_industry || '',
          targetRevenue: s.target_revenue || '',
          currency: s.currency || zoneCfg.currency,
          kpis: s.kpis || '',
          risks: s.risks || '',
          description: s.description || '',
          status: s.status,
          agentVisible: s.agent_visible,
          actions: s.actions?.length > 0 ? s.actions.map((a: any) => ({ action: a.action, responsible: a.responsible || '', dueDate: a.due_date ? a.due_date.split('T')[0] : '', status: a.status })) : [{ action: '', responsible: '', dueDate: '', status: 'todo' }],
        });
        setDocuments(s.documents || []);
      });
    }
  }, [strategyId]);

  const addAction = () => setForm({ ...form, actions: [...form.actions, { action: '', responsible: '', dueDate: '', status: 'todo' }] });
  const removeAction = (i: number) => setForm({ ...form, actions: form.actions.filter((_: any, idx: number) => idx !== i) });
  const updateAction = (i: number, field: string, val: string) => {
    const arr = [...form.actions];
    arr[i] = { ...arr[i], [field]: val };
    setForm({ ...form, actions: arr });
  };

  const handleSave = async () => {
    if (!form.title) { alert('Le titre est obligatoire'); setStep(1); return; }
    setSaving(true);
    try {
      const cleanActions = form.actions.filter((a: any) => a.action?.trim()).map((a: any) => ({
        action: a.action,
        responsible: a.responsible || null,
        dueDate: a.dueDate || null,
        status: a.status,
      }));
      const payload = { ...form, targetRevenue: Number(form.targetRevenue) || 0, actions: cleanActions };
      const url = strategyId ? `/api/strategies/${strategyId}` : '/api/strategies';
      const method = strategyId ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json()).error || 'Erreur enregistrement');
      const saved = await r.json();
      // For new strategy with pending uploaded files, attach them now via chunked upload
      if (!strategyId && documents.length > 0) {
        const pending = documents.filter((d: any) => !d.id && d._pendingFile instanceof File);
        let failed = 0;
        for (const d of pending) {
          try {
            await uploadFileChunked(d._pendingFile, { name: d._pendingFile.name, strategyId: saved.id });
          } catch (e) { failed++; console.error('[Strategy] Upload doc failed', e); }
        }
        if (failed > 0) {
          alert(`⚠️ La stratégie a été créée mais ${failed} document(s) n'ont pas pu être uploadés.\nOuvrez la stratégie pour réessayer.`);
        }
      }
      onSaved();
    } catch (e: any) { alert('Erreur: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 100 MB limit (Postgres can hold it, but practical UX max)
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert(`⚠️ Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(2)} MB).\n\nMaximum 100 MB par fichier.`);
      e.target.value = '';
      return;
    }
    setUploading(true);
    setUploadProgress({ pct: 0, label: 'Préparation…' });
    try {
      if (strategyId) {
        // Persist immediately via chunked upload
        const saved = await uploadFileChunked(file, { name: file.name, strategyId }, (pct, label) => {
          setUploadProgress({ pct, label });
        });
        setDocuments([...documents, saved]);
      } else {
        // Defer until strategy created — store File ref locally
        setDocuments([...documents, {
          _pendingFile: file,
          name: file.name,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
        }]);
      }
    } catch (err: any) {
      console.error('[Upload] Exception', err);
      alert('Erreur upload: ' + err.message);
    } finally {
      setUploading(false);
      setUploadProgress(null);
      e.target.value = '';
    }
  };

  const removeDoc = async (doc: any, idx: number) => {
    if (doc.id) {
      if (!confirm('Supprimer ce document ?')) return;
      const r = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
      if (r.ok) setDocuments(documents.filter(d => d.id !== doc.id));
    } else {
      setDocuments(documents.filter((_, i) => i !== idx));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" data-testid="strategy-wizard">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header with stepper */}
        <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-slate-800">
              {strategyId ? '✏️ Modifier la stratégie' : '🎯 Créer ma stratégie commerciale'}
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-all text-slate-400"><X size={24} /></button>
          </div>
          <div className="flex items-center gap-1 text-xs">
            {['Objectif', 'Cible', 'Actions', 'Documents'].map((label, i) => {
              const n = i + 1;
              const active = step === n;
              const done = step > n;
              return (
                <React.Fragment key={n}>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${active ? 'bg-indigo-600 text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-400 border border-slate-200'}`}>
                    {done ? <CheckCircle2 size={14} /> : <span className="w-4 text-center">{n}</span>}
                    <span className="hidden sm:inline">{label}</span>
                  </div>
                  {n < 4 && <div className={`flex-1 h-0.5 ${done ? 'bg-emerald-200' : 'bg-slate-200'}`} />}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {step === 1 && (
            <Step1Objectif form={form} setForm={setForm} zoneCfg={zoneCfg} />
          )}
          {step === 2 && (
            <Step2Cible form={form} setForm={setForm} zoneCfg={zoneCfg} />
          )}
          {step === 3 && (
            <Step3Actions form={form} addAction={addAction} removeAction={removeAction} updateAction={updateAction} />
          )}
          {step === 4 && (
            <Step4Documents documents={documents} uploading={uploading} uploadProgress={uploadProgress} handleFile={handleFile} removeDoc={removeDoc} form={form} setForm={setForm} />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className="flex items-center gap-1 px-4 py-2 text-slate-600 disabled:opacity-30"
          >
            <ChevronLeft size={18} /> Précédent
          </button>
          <span className="text-xs text-slate-400">Étape {step} / 4</span>
          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-1 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
            >
              Suivant <ChevronRight size={18} />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              data-testid="save-strategy-btn"
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
            >
              <Save size={18} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// === STEP 1: OBJECTIF ===
function Step1Objectif({ form, setForm, zoneCfg }: any) {
  return (
    <div className="space-y-4">
      <HelpBox icon={<Lightbulb size={16} />} title="Conseil — Définir un objectif SMART">
        Un bon objectif est <strong>Spécifique</strong>, <strong>Mesurable</strong>, <strong>Atteignable</strong>, <strong>Réaliste</strong> et <strong>Temporellement défini</strong>.<br />
        Exemple Congo : <em>"Conquérir 20 nouveaux clients PME à Pointe-Noire d'ici fin Q2 — chiffre d'affaires visé : 50M FCFA"</em>
      </HelpBox>
      <Field label="Titre de la stratégie" required>
        <input
          type="text"
          required
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
          placeholder="Ex: Conquête PME Pointe-Noire Q2 2026"
          data-testid="strategy-title-input"
          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Période">
          <select value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none">
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Date de début">
          <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none" />
        </Field>
        <Field label="Date de fin">
          <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none" />
        </Field>
      </div>
      <Field label="Description / Contexte" hint="Pourquoi cette stratégie ? Quel est le contexte du marché ?">
        <textarea
          rows={3}
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          placeholder="Le secteur des télécoms à Pointe-Noire montre une forte croissance avec l'arrivée de la fibre. Nous visons les PME qui ont besoin de digitaliser leur facturation…"
          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none resize-none"
        />
      </Field>
      <Field label="Zone géographique" hint={`Pays cible — ${zoneCfg.name} (${zoneCfg.flag}) par défaut`}>
        <select value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value, city: '' })} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none">
          <option value="CG">🇨🇬 République du Congo</option>
          <option value="CD">🇨🇩 RDC</option>
          <option value="CM">🇨🇲 Cameroun</option>
          <option value="GA">🇬🇦 Gabon</option>
          <option value="FR">🇫🇷 France</option>
        </select>
      </Field>
      <Field label="Ville cible" hint="Ville prioritaire pour cette stratégie (optionnel)">
        <select value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none">
          <option value="">Toutes les villes</option>
          {getZoneConfig(form.zone).cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
    </div>
  );
}

// === STEP 2: CIBLE ===
function Step2Cible({ form, setForm, zoneCfg }: any) {
  return (
    <div className="space-y-4">
      <HelpBox icon={<Users size={16} />} title="Conseil — Bien cibler son audience">
        Un ciblage précis multiplie par 3 le taux de conversion. Au Congo, segmentez par <strong>taille d'entreprise</strong>, <strong>secteur d'activité</strong> et <strong>ville</strong> pour optimiser vos déplacements commerciaux.
      </HelpBox>
      <Field label="Segment client" hint="Type d'entreprises ou de particuliers visés">
        <select value={form.targetSegment} onChange={e => setForm({ ...form, targetSegment: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none">
          <option value="">Choisir un segment...</option>
          {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Secteur d'activité" hint="Industrie cible (banque, télécoms, BTP...)">
        <select value={form.targetIndustry} onChange={e => setForm({ ...form, targetIndustry: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none">
          <option value="">Tous secteurs</option>
          {INDUSTRIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Field label="Chiffre d'affaires visé" hint="Objectif de revenu sur la période">
            <input
              type="number"
              value={form.targetRevenue}
              onChange={e => setForm({ ...form, targetRevenue: e.target.value })}
              placeholder="50000000"
              data-testid="strategy-revenue-input"
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none"
            />
          </Field>
        </div>
        <Field label="Devise">
          <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none">
            <option value="XAF">FCFA (XAF)</option>
            <option value="CDF">FC (CDF)</option>
            <option value="USD">$ (USD)</option>
            <option value="EUR">€ (EUR)</option>
          </select>
        </Field>
      </div>
      <Field label="Indicateurs clés (KPI)" hint="Comment mesurer le succès ?">
        <textarea
          rows={2}
          value={form.kpis}
          onChange={e => setForm({ ...form, kpis: e.target.value })}
          placeholder="• Nombre de nouveaux clients signés&#10;• Taux de conversion devis → factures&#10;• Panier moyen par client"
          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none resize-none"
        />
      </Field>
      <Field label="Risques identifiés" hint="Quels obstacles anticipez-vous ?">
        <textarea
          rows={2}
          value={form.risks}
          onChange={e => setForm({ ...form, risks: e.target.value })}
          placeholder="• Concurrence locale agressive&#10;• Saisonnalité des paiements&#10;• Instabilité du réseau internet"
          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none resize-none"
        />
      </Field>
    </div>
  );
}

// === STEP 3: ACTIONS ===
function Step3Actions({ form, addAction, removeAction, updateAction }: any) {
  return (
    <div className="space-y-4">
      <HelpBox icon={<Activity size={16} />} title="Conseil — Plan d'action concret">
        Listez 3 à 8 actions <strong>concrètes</strong> avec une <strong>échéance</strong> et un <strong>responsable</strong>. Évitez les actions trop vagues comme "améliorer les ventes" — préférez "organiser 10 rendez-vous avec les directeurs financiers de banques à Brazzaville d'ici le 30 mars".
      </HelpBox>
      <div className="space-y-3">
        {form.actions.map((a: any, i: number) => (
          <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-600 uppercase">Action #{i + 1}</span>
              {form.actions.length > 1 && (
                <button onClick={() => removeAction(i)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
              )}
            </div>
            <input
              type="text"
              value={a.action}
              onChange={e => updateAction(i, 'action', e.target.value)}
              placeholder="Ex: Organiser un déjeuner réseau avec 5 DSI à Pointe-Noire"
              data-testid={`action-input-${i}`}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                type="text"
                value={a.responsible}
                onChange={e => updateAction(i, 'responsible', e.target.value)}
                placeholder="Responsable"
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none"
              />
              <input
                type="date"
                value={a.dueDate}
                onChange={e => updateAction(i, 'dueDate', e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none"
              />
              <select value={a.status} onChange={e => updateAction(i, 'status', e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none">
                <option value="todo">À faire</option>
                <option value="in_progress">En cours</option>
                <option value="done">Terminé</option>
              </select>
            </div>
          </div>
        ))}
        <button onClick={addAction} className="w-full border-2 border-dashed border-indigo-300 text-indigo-600 py-3 rounded-xl hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 font-medium" data-testid="add-action-btn">
          <Plus size={18} /> Ajouter une action
        </button>
      </div>
    </div>
  );
}

// === STEP 4: DOCUMENTS + PUBLISH ===
function Step4Documents({ documents, uploading, uploadProgress, handleFile, removeDoc, form, setForm }: any) {
  return (
    <div className="space-y-5">
      <HelpBox icon={<Upload size={16} />} title="Documents joints">
        Ajoutez vos supports : <strong>PDF</strong>, <strong>Word</strong>, <strong>Excel</strong>, <strong>PowerPoint</strong>, <strong>images</strong>, vidéos (jusqu'à <strong>100 MB</strong> par fichier).<br />
        Les gros fichiers sont automatiquement découpés en morceaux de 2 MB et stockés dans PostgreSQL.
      </HelpBox>

      <div className="border-2 border-dashed border-indigo-300 rounded-xl p-6 text-center bg-indigo-50/40">
        <Upload size={36} className="mx-auto text-indigo-400 mb-2" />
        <label className="cursor-pointer inline-block">
          <input type="file" onChange={handleFile} disabled={uploading} className="hidden" data-testid="strategy-upload-input" />
          <span className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all inline-block">
            {uploading ? 'Upload en cours...' : '📎 Sélectionner un fichier'}
          </span>
        </label>
        <p className="text-xs text-slate-500 mt-3">PDF, DOCX, XLSX, PPTX, JPG, PNG, MP4 — jusqu'à 100 MB / fichier</p>
        {uploading && uploadProgress && (
          <div className="mt-4 space-y-1 bg-white border border-indigo-200 rounded-lg p-3 text-left">
            <p className="text-xs text-indigo-700 font-medium">{uploadProgress.label}</p>
            <div className="h-2 bg-indigo-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 transition-all" style={{ width: `${uploadProgress.pct}%` }} />
            </div>
            <p className="text-right text-[10px] text-indigo-500">{uploadProgress.pct}%</p>
          </div>
        )}
      </div>

      {documents.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-bold text-sm text-slate-700">Documents joints ({documents.length})</h4>
          {documents.map((d: any, i: number) => (
            <div key={d.id || i} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl">
              <FileType size={20} className="text-indigo-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{d.name || d.fileName}</p>
                <p className="text-xs text-slate-500">{((d.file_size || d.fileSize) / 1024).toFixed(1)} KB · {d.file_type || d.fileType}</p>
              </div>
              {d.id && (
                <a
                  href={`/api/documents/${d.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                  title="Prévisualiser"
                >
                  <Eye size={16} />
                </a>
              )}
              <button onClick={() => removeDoc(d, i)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Supprimer">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
        <h4 className="font-bold text-sm text-amber-900 flex items-center gap-2"><AlertTriangle size={16} /> Publication</h4>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={form.status === 'published'} onChange={e => setForm({ ...form, status: e.target.checked ? 'published' : 'draft' })} className="w-4 h-4 accent-indigo-600" data-testid="publish-checkbox" />
          <span className="text-sm text-amber-900">Publier la stratégie (visible par les commerciaux en lecture seule)</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={form.agentVisible} onChange={e => setForm({ ...form, agentVisible: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
          <span className="text-sm text-amber-900">Visible par tous les commerciaux</span>
        </label>
      </div>
    </div>
  );
}

// ============================================================================
// VIEWER — Read-only preview (used by commercial OR admin pour aperçu rapide)
// ============================================================================
function StrategyViewer({ strategyId, canEdit, onClose, onEdit }: any) {
  const [s, setS] = useState<any>(null);
  useEffect(() => { fetch(`/api/strategies/${strategyId}`).then(r => r.json()).then(setS); }, [strategyId]);
  if (!s) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" data-testid="strategy-viewer">
        <div className="p-6 bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
          <div className="flex justify-between items-start">
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/20">
                {s.status === 'published' ? '● Publiée' : 'Brouillon'} · {PERIODS.find(p => p.value === s.period)?.label}
              </span>
              <h2 className="text-2xl font-bold mt-2">{s.title}</h2>
              <p className="text-indigo-100 text-sm mt-1">Par {s.created_by_name} · {format(new Date(s.created_at), 'dd MMM yyyy', { locale: fr })}</p>
            </div>
            <div className="flex gap-2">
              {canEdit && (
                <button onClick={onEdit} className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1">
                  <Edit2 size={14} /> Modifier
                </button>
              )}
              <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg"><X size={20} /></button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {!canEdit && (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg text-xs text-slate-600">
              <Lock size={12} /> Lecture seule — Cette stratégie est validée par la direction.
            </div>
          )}
          <ViewBlock icon={<Calendar size={16} className="text-indigo-500" />} title="Période">
            {s.start_date && format(new Date(s.start_date), 'dd MMM yyyy', { locale: fr })} → {s.end_date && format(new Date(s.end_date), 'dd MMM yyyy', { locale: fr })}
          </ViewBlock>
          {s.description && <ViewBlock icon={<Lightbulb size={16} className="text-amber-500" />} title="Contexte">{s.description}</ViewBlock>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Stat icon={<MapPin size={16} className="text-indigo-500" />} label="Zone" value={`${getZoneConfig(s.zone).flag} ${s.city || 'Toutes villes'}`} />
            <Stat icon={<Users size={16} className="text-violet-500" />} label="Segment" value={s.target_segment || 'Tous'} />
            <Stat icon={<TrendingUp size={16} className="text-emerald-500" />} label="Objectif CA" value={formatCurrency(s.target_revenue, s.zone)} />
          </div>
          {s.kpis && <ViewBlock icon={<Activity size={16} className="text-blue-500" />} title="KPIs">{s.kpis}</ViewBlock>}
          {s.risks && <ViewBlock icon={<AlertTriangle size={16} className="text-orange-500" />} title="Risques">{s.risks}</ViewBlock>}
          {s.actions?.length > 0 && (
            <div>
              <h4 className="font-bold text-sm text-slate-700 mb-2 flex items-center gap-2"><Target size={16} className="text-indigo-500" /> Plan d'action ({s.actions.length})</h4>
              <div className="space-y-2">
                {s.actions.map((a: any, i: number) => (
                  <div key={a.id || i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${a.status === 'done' ? 'bg-emerald-500' : a.status === 'in_progress' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                    <div className="flex-1 text-sm">
                      <p className="text-slate-800 font-medium">{a.action}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {a.responsible && <>👤 {a.responsible} · </>}
                        {a.due_date && <>📅 {format(new Date(a.due_date), 'dd/MM/yyyy')}</>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {s.documents?.length > 0 && (
            <div>
              <h4 className="font-bold text-sm text-slate-700 mb-2 flex items-center gap-2"><FileText size={16} className="text-indigo-500" /> Documents ({s.documents.length})</h4>
              <div className="space-y-2">
                {s.documents.map((d: any) => (
                  <a key={d.id} href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                    <FileType size={20} className="text-indigo-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{d.name}</p>
                      <p className="text-xs text-slate-500">{((d.file_size || 0) / 1024).toFixed(1)} KB</p>
                    </div>
                    <Download size={16} className="text-slate-400" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SHARED MICRO-COMPONENTS
// ============================================================================
function Field({ label, hint, required, children }: any) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-bold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 italic">💡 {hint}</p>}
    </div>
  );
}

function HelpBox({ icon, title, children }: any) {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-l-4 border-indigo-400 rounded-r-xl p-4">
      <h4 className="flex items-center gap-2 font-bold text-indigo-900 text-sm mb-1">
        {icon} {title}
      </h4>
      <p className="text-xs text-indigo-800 leading-relaxed">{children}</p>
    </div>
  );
}

function ViewBlock({ icon, title, children }: any) {
  return (
    <div>
      <h4 className="font-bold text-sm text-slate-700 mb-1 flex items-center gap-2">{icon} {title}</h4>
      <div className="text-sm text-slate-600 whitespace-pre-wrap pl-6">{children}</div>
    </div>
  );
}

function Stat({ icon, label, value }: any) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <p className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium uppercase tracking-wider">{icon} {label}</p>
      <p className="text-sm font-bold text-slate-800 mt-1">{value}</p>
    </div>
  );
}
