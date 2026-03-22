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

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sb-hide-sidebar', { detail: showModal }));
    return () => {
      window.dispatchEvent(new CustomEvent('sb-hide-sidebar', { detail: false }));
    };
  }, [showModal]);

  useEffect(() => {
    fetchData();
    if (profile?.role === 'admin') {
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
        {profile?.role === 'admin' && (
          <button
            onClick={() => {
              setEditingObjective(null);
              resetForm();
              setShowModal(true);
            }}
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
                          {profile?.role === 'admin' && (
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
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in duration-200">
            <div className="sticky top-0 z-10 p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur-md">
              <h3 className="text-xl font-bold text-slate-900">
                {editingObjective ? 'Modifier l\'objectif' : 'Nouvel objectif'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Agent</label>
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                >
                  <option value="">Sélectionner un agent</option>
                  {users.map(u => (
                    <option key={u.uid} value={u.uid}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Type d'objectif</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                >
                  <option value="revenue">Chiffre d'affaires (€)</option>
                  <option value="calls">Nombre d'appels</option>
                  <option value="meetings">Nombre de rendez-vous</option>
                  <option value="quotes">Nombre de devis</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Valeur cible</label>
                <input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: 10000"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Date début</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Date fin</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Période</label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as any)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                >
                  <option value="monthly">Mensuel</option>
                  <option value="quarterly">Trimestriel</option>
                  <option value="yearly">Annuel</option>
                </select>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                >
                  {editingObjective ? 'Mettre à jour' : 'Créer l\'objectif'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
