import React, { useState, useEffect, useMemo } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  eachDayOfInterval, 
  startOfDay, 
  endOfDay,
  addWeeks,
  subWeeks,
  addYears,
  subYears,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  isToday,
  parseISO
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Calendar as CalendarIcon, 
  Clock, 
  Phone, 
  Mail, 
  Users, 
  MessageSquare,
  LayoutGrid,
  Columns,
  Rows,
  CalendarDays,
  PieChart
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ViewType = 'day' | 'week' | 'month' | 'year';

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>('month');
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [userFilter, setUserFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [type, setType] = useState('Appel');
  const [subject, setSubject] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [opportunityId, setOpportunityId] = useState('');
  const [status, setStatus] = useState('À faire');
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [notes, setNotes] = useState('');

  const fetchActivities = async () => {
    try {
      const [actRes, custRes, leadsRes, oppsRes, usersRes] = await Promise.all([
        fetch('/api/activities'),
        fetch('/api/customers'),
        fetch('/api/leads'),
        fetch('/api/opportunities'),
        fetch('/api/users')
      ]);
      
      if (actRes.ok) setActivities(await actRes.json());
      if (custRes.ok) setCustomers(await custRes.json());
      if (leadsRes.ok) setLeads(await leadsRes.json());
      if (oppsRes.ok) setOpportunities(await oppsRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setType('Appel');
    setSubject('');
    setCustomerId('');
    setLeadId('');
    setOpportunityId('');
    setStatus('À faire');
    setDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setNotes('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload = {
      type,
      subject,
      customerId: customerId ? parseInt(customerId) : null,
      leadId: leadId ? parseInt(leadId) : null,
      opportunityId: opportunityId ? parseInt(opportunityId) : null,
      status,
      date,
      notes
    };

    try {
      const response = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setShowModal(false);
        resetForm();
        fetchActivities();
      } else {
        const data = await response.json();
        setError(data.error || "Une erreur est survenue");
      }
    } catch (error) {
      setError("Erreur de connexion au serveur");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  const navigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }

    const amount = direction === 'next' ? 1 : -1;
    switch (view) {
      case 'day': setCurrentDate(addDays(currentDate, amount)); break;
      case 'week': setCurrentDate(addWeeks(currentDate, amount)); break;
      case 'month': setCurrentDate(addMonths(currentDate, amount)); break;
      case 'year': setCurrentDate(addYears(currentDate, amount)); break;
    }
  };

  const filteredActivities = useMemo(() => {
    return activities.filter(activity => {
      const matchesUser = userFilter === 'all' || activity.agent_id === userFilter;
      const matchesRole = roleFilter === 'all' || activity.agentRole === roleFilter;
      return matchesUser && matchesRole;
    });
  }, [activities, userFilter, roleFilter]);

  const activitiesByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    filteredActivities.forEach(act => {
      const dateKey = format(new Date(act.date), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(act);
    });
    return map;
  }, [filteredActivities]);

  const stats = useMemo(() => {
    const now = new Date();
    const startOfW = startOfWeek(now, { locale: fr });
    const endOfW = endOfWeek(now, { locale: fr });
    const startOfM = startOfMonth(now);
    const endOfM = endOfMonth(now);
    const startOfY = startOfYear(now);
    const endOfY = endOfYear(now);

    const weekActs = filteredActivities.filter(a => {
      const d = new Date(a.date);
      return d >= startOfW && d <= endOfW;
    });
    const monthActs = filteredActivities.filter(a => {
      const d = new Date(a.date);
      return d >= startOfM && d <= endOfM;
    });
    const yearActs = filteredActivities.filter(a => {
      const d = new Date(a.date);
      return d >= startOfY && d <= endOfY;
    });

    return {
      week: { total: weekActs.length, done: weekActs.filter(a => a.status === 'Terminé').length },
      month: { total: monthActs.length, done: monthActs.filter(a => a.status === 'Terminé').length },
      year: { total: yearActs.length, done: yearActs.filter(a => a.status === 'Terminé').length }
    };
  }, [filteredActivities]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Appel': return <Phone size={12} />;
      case 'Email': return <Mail size={12} />;
      case 'Réunion': return <Users size={12} />;
      case 'Message': return <MessageSquare size={12} />;
      default: return <CalendarIcon size={12} />;
    }
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { locale: fr });
    const endDate = endOfWeek(monthEnd, { locale: fr });

    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200">
          {weekDays.map(day => (
            <div key={day} className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayActs = activitiesByDate[dateKey] || [];
            const isCurrentMonth = isSameMonth(day, monthStart);

            return (
              <div 
                key={day.toString()} 
                className={cn(
                  "min-h-[120px] p-2 border-b border-r border-slate-100 transition-colors hover:bg-slate-50/50",
                  !isCurrentMonth && "bg-slate-50/30 text-slate-400"
                )}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={cn(
                    "text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full",
                    isToday(day) ? "bg-indigo-600 text-white" : "text-slate-700"
                  )}>
                    {format(day, 'd')}
                  </span>
                </div>
                <div className="space-y-1">
                  {dayActs.slice(0, 3).map(act => (
                    <div 
                      key={act.id} 
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 truncate",
                        act.status === 'Terminé' 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100 line-through opacity-60" 
                          : "bg-indigo-50 text-indigo-700 border-indigo-100"
                      )}
                      title={act.subject}
                    >
                      {getTypeIcon(act.type)}
                      <span className="truncate">{act.subject}</span>
                    </div>
                  ))}
                  {dayActs.length > 3 && (
                    <div className="text-[10px] text-slate-400 font-medium pl-1">
                      + {dayActs.length - 3} autres
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const startDate = startOfWeek(currentDate, { locale: fr });
    const endDate = endOfWeek(currentDate, { locale: fr });
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const hours = Array.from({ length: 14 }, (_, i) => i + 8); // 8h to 21h

    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-8 border-b border-slate-200">
          <div className="w-16 bg-slate-50/50 border-r border-slate-200"></div>
          {days.map(day => (
            <div key={day.toString()} className={cn(
              "px-4 py-3 text-center bg-slate-50/50",
              isToday(day) && "bg-indigo-50/50"
            )}>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{format(day, 'EEE', { locale: fr })}</div>
              <div className={cn(
                "text-lg font-bold mt-1",
                isToday(day) ? "text-indigo-600" : "text-slate-700"
              )}>{format(day, 'd')}</div>
            </div>
          ))}
        </div>
        <div className="overflow-y-auto max-h-[600px]">
          {hours.map(hour => (
            <div key={hour} className="grid grid-cols-8 border-b border-slate-100 group">
              <div className="w-16 py-4 text-center text-[10px] font-bold text-slate-400 border-r border-slate-200 bg-slate-50/30">
                {hour}:00
              </div>
              {days.map(day => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const hourActs = (activitiesByDate[dateKey] || []).filter(a => {
                  const d = new Date(a.date);
                  return d.getHours() === hour;
                });

                return (
                  <div key={day.toString()} className="relative min-h-[60px] p-1 border-r border-slate-100 group-hover:bg-slate-50/20">
                    {hourActs.map(act => (
                      <div 
                        key={act.id} 
                        className={cn(
                          "text-[10px] p-1.5 rounded border mb-1 shadow-sm",
                          act.status === 'Terminé' 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100 line-through opacity-60" 
                            : "bg-indigo-50 text-indigo-700 border-indigo-100"
                        )}
                      >
                        <div className="font-bold truncate">{act.subject}</div>
                        <div className="flex items-center gap-1 mt-0.5 opacity-70">
                          {getTypeIcon(act.type)}
                          <span>{format(new Date(act.date), 'HH:mm')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const hours = Array.from({ length: 16 }, (_, i) => i + 7); // 7h to 22h
    const dateKey = format(currentDate, 'yyyy-MM-dd');
    const dayActs = activitiesByDate[dateKey] || [];

    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden max-w-3xl mx-auto w-full">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold text-indigo-600">{format(currentDate, 'd')}</div>
            <div>
              <div className="text-sm font-bold text-slate-500 uppercase tracking-wider">{format(currentDate, 'EEEE', { locale: fr })}</div>
              <div className="text-lg font-bold text-slate-800">{format(currentDate, 'MMMM yyyy', { locale: fr })}</div>
            </div>
          </div>
          {isToday(currentDate) && (
            <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full">AUJOURD'HUI</span>
          )}
        </div>
        <div className="divide-y divide-slate-100">
          {hours.map(hour => {
            const hourActs = dayActs.filter(a => new Date(a.date).getHours() === hour);
            return (
              <div key={hour} className="flex group min-h-[80px]">
                <div className="w-24 py-4 px-4 text-right text-sm font-bold text-slate-400 border-r border-slate-200 bg-slate-50/30">
                  {hour}:00
                </div>
                <div className="flex-1 p-3 space-y-2 group-hover:bg-slate-50/20 transition-colors">
                  {hourActs.map(act => (
                    <div 
                      key={act.id} 
                      className={cn(
                        "p-3 rounded-xl border shadow-sm flex items-center justify-between",
                        act.status === 'Terminé' 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                          : "bg-white text-slate-900 border-slate-200"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "p-2 rounded-lg",
                          act.status === 'Terminé' ? "bg-emerald-100" : "bg-indigo-50 text-indigo-600"
                        )}>
                          {getTypeIcon(act.type)}
                        </div>
                        <div>
                          <div className={cn("font-bold", act.status === 'Terminé' && "line-through opacity-60")}>{act.subject}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-2">
                            <Clock size={12} /> {format(new Date(act.date), 'HH:mm')}
                            {act.customerName && <span>• {act.customerName}</span>}
                          </div>
                        </div>
                      </div>
                      <div className={cn(
                        "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                        act.status === 'Terminé' ? "bg-emerald-100 border-emerald-200" : "bg-amber-100 border-amber-200 text-amber-700"
                      )}>
                        {act.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderYearView = () => {
    const yearStart = startOfYear(currentDate);
    const months = eachMonthOfInterval({ start: yearStart, end: endOfYear(yearStart) });

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {months.map(month => {
          const monthStart = startOfMonth(month);
          const monthEnd = endOfMonth(monthStart);
          const days = eachDayOfInterval({ start: startOfWeek(monthStart, { locale: fr }), end: endOfWeek(monthEnd, { locale: fr }) });
          
          return (
            <div key={month.toString()} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h4 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider text-center border-b border-slate-100 pb-2">
                {format(month, 'MMMM', { locale: fr })}
              </h4>
              <div className="grid grid-cols-7 gap-1">
                {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                  <div key={i} className="text-[10px] font-bold text-slate-400 text-center">{d}</div>
                ))}
                {days.map((day, i) => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const hasActs = activitiesByDate[dateKey]?.length > 0;
                  const isCurrentMonth = isSameMonth(day, month);

                  return (
                    <div 
                      key={i} 
                      className={cn(
                        "w-full aspect-square flex items-center justify-center text-[10px] rounded-full relative",
                        !isCurrentMonth && "opacity-20",
                        isToday(day) && "bg-indigo-600 text-white font-bold",
                        hasActs && !isToday(day) && "bg-indigo-50 text-indigo-700 font-bold"
                      )}
                    >
                      {format(day, 'd')}
                      {hasActs && !isToday(day) && (
                        <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-600 rounded-full"></div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Calendrier</h2>
            <p className="text-slate-500 text-sm">Visualisez et organisez votre emploi du temps</p>
          </div>
          <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-slate-200 ml-4">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-1.5 text-sm bg-transparent outline-none border-none text-slate-600 font-medium cursor-pointer"
            >
              <option value="all">Tous les rôles</option>
              <option value="admin">Administrateurs</option>
              <option value="agent">Agents</option>
            </select>
            <div className="w-px h-4 bg-slate-200"></div>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="px-3 py-1.5 text-sm bg-transparent outline-none border-none text-slate-600 font-medium cursor-pointer"
            >
              <option value="all">Tous les utilisateurs</option>
              {users.map(u => (
                <option key={u.uid} value={u.uid}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-slate-200">
          <button 
            onClick={() => setView('year')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              view === 'year' ? "bg-indigo-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <LayoutGrid size={16} /> Année
          </button>
          <button 
            onClick={() => setView('month')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              view === 'month' ? "bg-indigo-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <CalendarDays size={16} /> Mois
          </button>
          <button 
            onClick={() => setView('week')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              view === 'week' ? "bg-indigo-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <Columns size={16} /> Semaine
          </button>
          <button 
            onClick={() => setView('day')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              view === 'day' ? "bg-indigo-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <Rows size={16} /> Jour
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <h3 className="text-xl font-bold text-slate-800 min-w-[200px]">
            {view === 'day' && format(currentDate, 'dd MMMM yyyy', { locale: fr })}
            {view === 'week' && `Semaine du ${format(startOfWeek(currentDate, { locale: fr }), 'dd MMM', { locale: fr })}`}
            {view === 'month' && format(currentDate, 'MMMM yyyy', { locale: fr })}
            {view === 'year' && format(currentDate, 'yyyy')}
          </h3>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => navigate('prev')}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={() => navigate('today')}
              className="px-4 py-1.5 text-sm font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
            >
              Aujourd'hui
            </button>
            <button 
              onClick={() => navigate('next')}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
        
        <button 
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
        >
          <Plus size={20} />
          Nouveau RDV
        </button>
      </div>

      <div className="min-h-[600px]">
        {view === 'month' && renderMonthView()}
        {view === 'week' && renderWeekView()}
        {view === 'day' && renderDayView()}
        {view === 'year' && renderYearView()}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-900">Nouvelle Activité / RDV</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm flex items-center gap-2">
                  <Plus size={18} className="rotate-45" />
                  {error}
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sujet</label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    placeholder="Ex: Appel de suivi, Présentation produit..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="Appel">Appel</option>
                    <option value="Email">Email</option>
                    <option value="Réunion">Réunion</option>
                    <option value="Message">Message</option>
                    <option value="Tâche">Tâche</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date & Heure</label>
                  <input
                    type="datetime-local"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Client</label>
                  <select
                    value={customerId}
                    onChange={(e) => {
                      setCustomerId(e.target.value);
                      if (e.target.value) { setLeadId(''); setOpportunityId(''); }
                    }}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="">Aucun client</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prospect (Lead)</label>
                  <select
                    value={leadId}
                    onChange={(e) => {
                      setLeadId(e.target.value);
                      if (e.target.value) { setCustomerId(''); setOpportunityId(''); }
                    }}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="">Aucun prospect</option>
                    {leads.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.type === 'company' ? l.companyName : `${l.firstName} ${l.lastName}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Opportunité</label>
                  <select
                    value={opportunityId}
                    onChange={(e) => {
                      setOpportunityId(e.target.value);
                      if (e.target.value) {
                        const opp = opportunities.find(o => o.id.toString() === e.target.value);
                        if (opp) {
                          if (opp.customerId) { setCustomerId(opp.customerId.toString()); setLeadId(''); }
                          else if (opp.leadId) { setLeadId(opp.leadId.toString()); setCustomerId(''); }
                        }
                      }
                    }}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="">Aucune opportunité</option>
                    {opportunities.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none"
                    placeholder="Détails de l'activité..."
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-all"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting ? 'Enregistrement...' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <PieChart size={20} />
            </div>
            <h4 className="font-bold text-slate-800">Récapitulatif Semaine</h4>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <div className="text-3xl font-bold text-slate-900">{stats.week.total}</div>
              <div className="text-sm text-slate-500">Activités totales</div>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-indigo-600 h-full transition-all duration-1000" 
                style={{ width: `${stats.week.total ? (stats.week.done / stats.week.total) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
              <span className="text-emerald-600">{stats.week.done} Terminées</span>
              <span className="text-slate-400">{stats.week.total - stats.week.done} À faire</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <PieChart size={20} />
            </div>
            <h4 className="font-bold text-slate-800">Récapitulatif Mois</h4>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <div className="text-3xl font-bold text-slate-900">{stats.month.total}</div>
              <div className="text-sm text-slate-500">Activités totales</div>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-amber-500 h-full transition-all duration-1000" 
                style={{ width: `${stats.month.total ? (stats.month.done / stats.month.total) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
              <span className="text-emerald-600">{stats.month.done} Terminées</span>
              <span className="text-slate-400">{stats.month.total - stats.month.done} À faire</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <PieChart size={20} />
            </div>
            <h4 className="font-bold text-slate-800">Récapitulatif Année</h4>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <div className="text-3xl font-bold text-slate-900">{stats.year.total}</div>
              <div className="text-sm text-slate-500">Activités totales</div>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full transition-all duration-1000" 
                style={{ width: `${stats.year.total ? (stats.year.done / stats.year.total) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
              <span className="text-emerald-600">{stats.year.done} Terminées</span>
              <span className="text-slate-400">{stats.year.total - stats.year.done} À faire</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
