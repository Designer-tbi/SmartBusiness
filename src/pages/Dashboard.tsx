import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PhoneCall, Users, CheckCircle2, Clock, BarChart3, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

export default function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    const fetchStats = async () => {
      try {
        const url = profile.role === 'admin' ? '/api/admin/stats' : '/api/calls';
        const response = await fetch(url);
        
        if (response.ok) {
          const data = await response.json();
          if (profile.role === 'admin') {
            setStats(data);
          } else {
            // Basic stats for agents
            const customersRes = await fetch('/api/customers');
            const customers = await customersRes.json();
            setStats({
              totalCalls: data.length,
              completedCalls: data.filter((c: any) => c.status === 'completed').length,
              pendingCalls: data.filter((c: any) => c.status === 'pending').length,
              totalCustomers: customers.length,
            });
          }
        }
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [profile]);

  if (loading || !stats) return <div className="flex h-64 items-center justify-center">Chargement des statistiques...</div>;

  const statCards = [
    { name: 'Appels Totaux', value: stats.totalCalls, icon: PhoneCall, color: 'bg-blue-500' },
    { name: 'Appels Terminés', value: stats.completedCalls, icon: CheckCircle2, color: 'bg-emerald-500' },
    { name: 'Appels en Attente', value: stats.pendingCalls, icon: Clock, color: 'bg-amber-500' },
    { name: 'Clients', value: stats.totalCustomers, icon: Users, color: 'bg-indigo-500' },
  ];

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444'];

  const pieData = [
    { name: 'Terminés', value: stats.completedCalls },
    { name: 'En attente', value: stats.pendingCalls },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Tableau de bord</h2>
        <div className="text-sm text-slate-500 flex items-center gap-2">
          <TrendingUp size={16} />
          <span>Mise à jour en temps réel</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.name} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4 transition-transform hover:scale-[1.02]">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-white ${stat.color}`}>
                <Icon size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">{stat.name}</p>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {profile?.role === 'admin' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 className="text-indigo-600" size={20} />
              <h3 className="text-lg font-semibold text-slate-800">Performance des Agents</h3>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.agentPerformance}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="calls" name="Total Appels" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" name="Terminés" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-6">
              <CheckCircle2 className="text-indigo-600" size={20} />
              <h3 className="text-lg font-semibold text-slate-800">Répartition des Appels</h3>
            </div>
            <div className="h-80 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Informations de session</h3>
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl">
            {profile?.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-slate-900 font-medium">{profile?.name}</p>
            <p className="text-sm text-slate-500 capitalize">{profile?.role === 'admin' ? 'Administrateur' : 'Agent'}</p>
          </div>
          <div className="ml-auto">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              profile?.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            }`}>
              Accès {profile?.role === 'admin' ? 'Total' : 'Limité'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
