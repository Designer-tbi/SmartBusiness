import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  Plus, 
  Target, 
  TrendingUp, 
  Calendar as CalendarIcon, 
  User, 
  MoreVertical, 
  Trash2, 
  Edit2,
  CheckCircle2,
  Clock,
  AlertCircle,
  BarChart3,
  DollarSign,
  PhoneCall,
  FileText
} from 'lucide-react';
import { format, isAfter, isBefore, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';
import { getZoneConfig } from '../lib/countryConfig';
import { cn } from '../lib/utils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';

interface Objective {
  id: number;
  agent_id: string;
  agentName: string;
  type: 'revenue' | 'calls' | 'meetings' | 'quotes';
  target_value: number;
  currentValue: number;
  period: 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string;
  status: string;
}

export default function Objectives() {
  const { profile } = useAuth();
  const zoneCfg = getZoneConfig((profile as any)?.zone);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);

  // Form state
  const [agentId, setAgentId] = useState('');
  const [type, setType] = useState<'revenue' | 'calls' | 'meetings' | 'quotes'>('revenue');
  const [targetValue, setTargetValue] = useState('');
  const [period, setPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';

  useEffect(() => {
    fetchData();
    if (isAdmin) {
      fetchUsers();
    }
  }, [profile]);

  const fetchData = async () => {
    try {
      const response = await fetch('/api/objectives/stats');
      if (response.ok) {
        const data = await response.json();
        setObjectives(data);
      }
    } catch (error) {
      console.error('Error fetching objectives:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      agentId: agentId || profile?.uid,
      type,
      targetValue: parseFloat(targetValue),
      period,
      startDate,
      endDate,
      status: 'En cours'
    };

    try {
      const url = editingObjective ? `/api/objectives/${editingObjective.id}` : '/api/objectives';
      const method = editingObjective ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setShowModal(false);
        setEditingObjective(null);
        resetForm();
        fetchData();
      }
    } catch (error) {
      console.error('Error saving objective:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet objectif ?')) return;
    try {
      const response = await fetch(`/api/objectives/${id}`, { method: 'DELETE' });
      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error deleting objective:', error);
    }
  };

  const resetForm = () => {
    setAgentId('');
    setType('revenue');
    setTargetValue('');
    setPeriod('monthly');
    setStartDate(format(new Date(), 'yyyy-MM-01'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return 'bg-emerald-500';
    if (progress >= 75) return 'bg-indigo-500';
    if (progress >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getObjectiveLabel = (type: string) => {
    switch (type) {
      case 'revenue': return 'Chiffre d\'affaires';
      case 'calls': return 'Appels effectués';
      case 'meetings': return 'Rendez-vous';
      case 'quotes': return 'Devis envoyés';
      default: return type;
    }
  };

  const getObjectiveIcon = (type: string) => {
    switch (type) {
      case 'revenue': return <DollarSign className="text-emerald-500" size={20} />;
      case 'calls': return <PhoneCall className="text-indigo-500" size={20} />;
      case 'meetings': return <CalendarIcon className="text-amber-500" size={20} />;
      case 'quotes': return <FileText className="text-blue-500" size={20} />;
      default: return <Target className="text-slate-500" size={20} />;
    }
  };

  const chartData = objectives.map(obj => ({
    name: obj.agentName || 'Moi',
    target: obj.target_value,
    current: obj.currentValue,
    progress: Math.min(100, (obj.currentValue / obj.target_value) * 100)
  }));

  if (loading) {
    return <div className="flex h-full items-center justify-center">Chargement...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Objectifs & Performance</h1>
          <p className="text-slate-500">Suivez vos indicateurs clés et dépassez vos limites</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setEditingObjective(null);
              resetForm();
              setShowModal(true);
            }}
            data-testid="new-objective-btn"
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
          >
            <Plus size={20} />
            Nouvel Objectif
          </button>
        )}
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
              <Target size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Objectifs actifs</p>
              <h3 className="text-2xl font-bold text-slate-900">{objectives.length}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock size={14} />
            <span>Période en cours</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
              <Trophy size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Objectifs atteints</p>
              <h3 className="text-2xl font-bold text-slate-900">
                {objectives.filter(o => (o.currentValue / o.target_value) >= 1).length}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
            <TrendingUp size={14} />
            <span>Bravo à l'équipe !</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Progression moyenne</p>
              <h3 className="text-2xl font-bold text-slate-900">
                {objectives.length > 0 
                  ? Math.round(objectives.reduce((acc, obj) => acc + (obj.currentValue / obj.target_value), 0) / objectives.length * 100)
                  : 0}%
              </h3>
            </div>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2">
            <div 
              className="bg-amber-500 h-full rounded-full" 
              style={{ width: `${Math.min(100, objectives.length > 0 ? objectives.reduce((acc, obj) => acc + (obj.currentValue / obj.target_value), 0) / objectives.length * 100 : 0)}%` }}
            />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">En retard</p>
              <h3 className="text-2xl font-bold text-slate-900">
                {objectives.filter(o => (o.currentValue / o.target_value) < 0.5).length}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-rose-600 font-medium">
            <span>Action requise</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Objectives List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 size={20} className="text-indigo-600" />
                Détail des objectifs
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {objectives.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Target className="text-slate-300" size={32} />
                  </div>
                  <p className="text-slate-500">Aucun objectif défini pour le moment.</p>
                </div>
              ) : (
                objectives.map((obj) => {
                  const progress = Math.round((obj.currentValue / obj.target_value) * 100);
                  return (
                    <div key={obj.id} className="p-6 hover:bg-slate-50 transition-colors group">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-4">
                          <div className="p-3 bg-slate-100 rounded-xl group-hover:bg-white transition-colors">
                            {getObjectiveIcon(obj.type)}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900">{getObjectiveLabel(obj.type)}</h4>
                            <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                              <span className="flex items-center gap-1">
                                <User size={14} />
                                {obj.agentName || 'Moi'}
                              </span>
                              <span className="flex items-center gap-1">
                                <CalendarIcon size={14} />
                                {format(parseISO(obj.end_date), 'dd MMM yyyy', { locale: fr })}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-900">
                              {obj.type === 'revenue' ? `${obj.currentValue.toLocaleString()}€` : obj.currentValue} 
                              <span className="text-slate-400 font-normal"> / {obj.type === 'revenue' ? `${obj.target_value.toLocaleString()}€` : obj.target_value}</span>
                            </p>
                            <p className={cn(
                              "text-xs font-bold mt-1",
                              progress >= 100 ? "text-emerald-600" : "text-slate-500"
                            )}>
                              {progress}% atteint
                            </p>
                          </div>
                          {isAdmin && (
                            <div className="flex gap-1">
                              <button 
                                onClick={() => handleDelete(obj.id)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full rounded-full transition-all duration-1000", getProgressColor(progress))}
                          style={{ width: `${Math.min(100, progress)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Charts / Dashboard */}
        <div className="space-y-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Comparatif Performance</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis hide />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="progress" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.progress >= 100 ? '#10b981' : '#6366f1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-indigo-600 p-6 rounded-2xl text-white shadow-lg shadow-indigo-200 relative overflow-hidden">
            <div className="relative z-10">
              <Trophy size={32} className="mb-4 text-indigo-200" />
              <h3 className="text-xl font-bold mb-2">Challenge du mois</h3>
              <p className="text-indigo-100 text-sm mb-6">
                Le meilleur agent ce mois-ci recevra un bonus exceptionnel de 500€. Continuez vos efforts !
              </p>
              <div className="flex items-center gap-2 text-sm font-bold bg-white/20 w-fit px-3 py-1 rounded-full">
                <TrendingUp size={16} />
                +12% vs mois dernier
              </div>
            </div>
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (() => {
        const typeOptions = [
          { value: 'revenue', label: 'Chiffre d\'affaires', icon: DollarSign, hint: `Total facturé payé en ${zoneCfg.currency}`, placeholder: 'Ex: 5000000', suffix: zoneCfg.currency,
            classesActive: 'border-emerald-500 bg-emerald-50 shadow-sm', iconActive: 'text-emerald-600', textActive: 'text-emerald-900' },
          { value: 'calls', label: 'Appels', icon: PhoneCall, hint: 'Nombre d\'appels effectués', placeholder: 'Ex: 30', suffix: 'appels',
            classesActive: 'border-blue-500 bg-blue-50 shadow-sm', iconActive: 'text-blue-600', textActive: 'text-blue-900' },
          { value: 'meetings', label: 'Rendez-vous', icon: CalendarIcon, hint: 'Nombre de RDV programmés', placeholder: 'Ex: 15', suffix: 'RDV',
            classesActive: 'border-violet-500 bg-violet-50 shadow-sm', iconActive: 'text-violet-600', textActive: 'text-violet-900' },
          { value: 'quotes', label: 'Devis', icon: FileText, hint: 'Nombre de devis émis', placeholder: 'Ex: 10', suffix: 'devis',
            classesActive: 'border-amber-500 bg-amber-50 shadow-sm', iconActive: 'text-amber-600', textActive: 'text-amber-900' },
        ];
        const currentType = typeOptions.find(t => t.value === type) || typeOptions[0];

        const applyPeriod = (p: string) => {
          setPeriod(p as any);
          const now = new Date();
          let start: Date, end: Date;
          if (p === 'monthly') { start = new Date(now.getFullYear(), now.getMonth(), 1); end = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
          else if (p === 'quarterly') { const q = Math.floor(now.getMonth() / 3); start = new Date(now.getFullYear(), q * 3, 1); end = new Date(now.getFullYear(), q * 3 + 3, 0); }
          else { start = new Date(now.getFullYear(), 0, 1); end = new Date(now.getFullYear(), 11, 31); }
          setStartDate(start.toISOString().split('T')[0]);
          setEndDate(end.toISOString().split('T')[0]);
        };

        return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" data-testid="objective-form-modal">
            <div className="sticky top-0 z-10 p-6 border-b border-slate-100 flex justify-between items-center bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center"><Trophy className="text-indigo-600" size={20} /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{editingObjective ? 'Modifier l\'objectif' : 'Nouvel objectif'}</h3>
                  <p className="text-xs text-slate-500">Définissez une cible mesurable pour un agent</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg">
                <Plus size={20} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1"><User size={14} /> Agent assigné *</label>
                <select value={agentId} onChange={(e) => setAgentId(e.target.value)} required
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 outline-none">
                  <option value="">Sélectionner un agent</option>
                  {users.filter(u => u.role === 'agent' || u.role === 'admin').map(u => (
                    <option key={u.uid} value={u.uid}>{u.name} {u.zone ? `· ${u.zone}` : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Type d'objectif *</label>
                <div className="grid grid-cols-2 gap-2">
                  {typeOptions.map(opt => (
                    <button key={opt.value} type="button" onClick={() => setType(opt.value as any)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        type === opt.value
                          ? opt.classesActive
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <opt.icon className={type === opt.value ? opt.iconActive : 'text-slate-400'} size={18} />
                        <span className={`font-semibold text-sm ${type === opt.value ? opt.textActive : 'text-slate-700'}`}>{opt.label}</span>
                      </div>
                      <p className="text-xs text-slate-500">{opt.hint}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1"><Target size={14} /> Valeur cible *</label>
                <div className="relative">
                  <input type="number" min="0" step={type === 'revenue' ? '1000' : '1'} value={targetValue} onChange={(e) => setTargetValue(e.target.value)} required
                    className="w-full px-4 py-3 pr-24 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 outline-none text-lg font-semibold"
                    placeholder={currentType.placeholder} data-testid="objective-target" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">{currentType.suffix}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Période *</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: 'monthly', l: 'Mensuel', d: 'Ce mois-ci' },
                    { v: 'quarterly', l: 'Trimestriel', d: 'Ce trimestre' },
                    { v: 'yearly', l: 'Annuel', d: 'Cette année' },
                  ].map(opt => (
                    <button key={opt.v} type="button" onClick={() => applyPeriod(opt.v)}
                      className={`p-2.5 rounded-xl border-2 text-center transition-all ${
                        period === opt.v ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}>
                      <div className={`font-semibold text-sm ${period === opt.v ? 'text-indigo-900' : 'text-slate-700'}`}>{opt.l}</div>
                      <div className="text-xs text-slate-500">{opt.d}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Date début *</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Date fin *</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50">Annuler</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200" data-testid="objective-submit-btn">
                  {editingObjective ? 'Mettre à jour' : 'Créer l\'objectif'}
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
