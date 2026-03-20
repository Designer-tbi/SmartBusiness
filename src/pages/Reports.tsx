import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format, subDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Download, Filter, Calendar } from 'lucide-react';

export default function Reports() {
  const { profile } = useAuth();
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7'); // Last 7 days

  useEffect(() => {
    const fetchCalls = async () => {
      try {
        const response = await fetch('/api/calls');
        if (response.ok) {
          const data = await response.json();
          setCalls(data);
        }
      } catch (error) {
        console.error("Error fetching calls for reports:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCalls();
  }, []);

  if (loading) return <div className="flex h-screen items-center justify-center">Chargement des rapports...</div>;

  // Filter calls by date range
  const now = new Date();
  const startDate = subDays(startOfDay(now), parseInt(dateRange));
  const filteredCalls = calls.filter(call => {
    const callDate = new Date(call.createdAt);
    return isWithinInterval(callDate, { start: startDate, end: endOfDay(now) });
  });

  // Data for Calls by Status
  const statusData = [
    { name: 'Terminés', value: filteredCalls.filter(c => c.status === 'completed').length, color: '#10b981' },
    { name: 'En attente', value: filteredCalls.filter(c => c.status === 'pending').length, color: '#f59e0b' },
    { name: 'Annulés', value: filteredCalls.filter(c => c.status === 'cancelled').length, color: '#ef4444' },
  ];

  // Data for Calls by Agent
  const agentStats: { [key: string]: number } = {};
  filteredCalls.forEach(call => {
    agentStats[call.agentName] = (agentStats[call.agentName] || 0) + 1;
  });
  const agentData = Object.entries(agentStats).map(([name, value]) => ({ name, value }));

  // Data for Calls by Day
  const dailyStats: { [key: string]: number } = {};
  for (let i = 0; i < parseInt(dateRange); i++) {
    const date = format(subDays(now, i), 'dd/MM');
    dailyStats[date] = 0;
  }
  filteredCalls.forEach(call => {
    const date = format(new Date(call.createdAt), 'dd/MM');
    if (dailyStats[date] !== undefined) {
      dailyStats[date]++;
    }
  });
  const dailyData = Object.entries(dailyStats).reverse().map(([date, count]) => ({ date, count }));

  const handleExport = () => {
    if (!filteredCalls.length) return;
    
    const headers = ['ID', 'Client', 'Téléphone', 'Agent', 'Statut', 'Notes', 'Date'];
    const csvContent = [
      headers.join(','),
      ...filteredCalls.map(call => 
        `"${call.id}","${call.customerName}","${call.customerPhone}","${call.agentName}","${call.status}","${(call.notes || '').replace(/"/g, '""')}","${format(new Date(call.createdAt), 'yyyy-MM-dd HH:mm:ss')}"`
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `rapport_appels_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Rapports & Statistiques</h2>
          <p className="text-slate-500 text-sm">Analysez les performances de votre centre d'appels</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600">
            <Calendar size={16} />
            <select 
              value={dateRange} 
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-transparent border-none focus:ring-0 p-0"
            >
              <option value="7">Derniers 7 jours</option>
              <option value="14">Derniers 14 jours</option>
              <option value="30">Derniers 30 jours</option>
            </select>
          </div>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            <Download size={16} />
            Exporter CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calls Over Time */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">Volume d'appels quotidien</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Appels" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Calls by Status */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">Répartition par statut</h3>
          <div className="h-80 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Calls by Agent */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">Performance par agent</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} name="Nombre d'appels" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
