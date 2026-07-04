import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePresence } from '../hooks/usePresence';
import { PresenceIndicator } from './PresenceIndicator';
import { 
  LogOut, 
  LayoutDashboard, 
  Users, 
  PhoneCall, 
  UserCircle, 
  BarChart3, 
  Settings,
  Briefcase,
  Target,
  UserPlus,
  FileText,
  Receipt,
  DollarSign,
  Activity,
  CheckSquare,
  Calendar,
  Trophy,
  BookOpen,
  Package,
  FolderKanban,
  Files,
  PieChart,
  ChevronDown,
  ChevronRight,
  Monitor,
  CreditCard,
  Sparkles,
  Menu,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function Layout() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [forceHideSidebar, setForceHideSidebar] = React.useState(false);
  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({});

  // ─── LIVE PRESENCE ────────────────────────────────
  const { online, count } = usePresence(!!profile);
  // Exclude self from the visible list
  const others = React.useMemo(() => online.filter(u => u.user_uid !== profile?.uid), [online, profile?.uid]);
  const othersCount = others.length;

  React.useEffect(() => {
    const handleHideSidebar = (e: any) => setForceHideSidebar(e.detail);
    window.addEventListener('sb-hide-sidebar', handleHideSidebar);
    return () => window.removeEventListener('sb-hide-sidebar', handleHideSidebar);
  }, []);

  // Auto-close mobile drawer when navigating (pathname OR search)
  React.useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Tableau de bord', href: '/', icon: LayoutDashboard },
    {
      name: 'Commercial',
      icon: Briefcase,
      children: [
        { name: 'Portefeuille client', href: '/portfolio', icon: Briefcase },
        { name: 'Opportunités', href: '/opportunities', icon: Target },
        { name: 'Leads', href: '/leads', icon: UserPlus },
        { name: 'Clients', href: '/customers', icon: Users },
        { name: 'Prospection LinkedIn', href: '/ai-team?agent=alex', icon: Sparkles, aiLinked: true },
        { name: 'Contrats & Juridique', href: '/ai-team?agent=lisa', icon: Sparkles, aiLinked: true },
      ]
    },
    {
      name: 'Facturation',
      icon: FileText,
      children: [
        { name: 'Devis', href: '/quotes', icon: FileText },
        { name: 'Factures', href: '/invoices', icon: Receipt },
        { name: 'Recouvrement', href: '/ai-team?agent=kevin', icon: Sparkles, aiLinked: true },
        { name: 'Mes Paiements', href: '/payments', icon: CreditCard },
        { name: 'Commissions', href: '/commissions', icon: DollarSign },
        { name: 'Analyse Ventes', href: '/sales-analysis', icon: PieChart },
      ]
    },
    {
      name: 'Finance',
      icon: DollarSign,
      children: [
        { name: 'Comptabilité SYSCOHADA', href: '/ai-team?agent=chloe', icon: Sparkles, aiLinked: true },
        { name: 'Budget & Trésorerie', href: '/ai-team?agent=ingrid', icon: Sparkles, aiLinked: true },
        { name: 'Dashboard Financier', href: '/ai-team?agent=paul', icon: Sparkles, aiLinked: true },
      ]
    },
    {
      name: 'Ressources Humaines',
      icon: Users,
      children: [
        { name: 'Recrutement & Talents', href: '/ai-team?agent=nina', icon: Sparkles, aiLinked: true },
        { name: 'Paie & Admin', href: '/ai-team?agent=omar', icon: Sparkles, aiLinked: true },
        { name: 'Équipe TBI', href: '/ai-team?agent=flore', icon: Sparkles, aiLinked: true },
      ]
    },
    {
      name: 'Direction',
      icon: Trophy,
      children: [
        { name: 'Dashboard Exécutif', href: '/ai-team?agent=eden', icon: Sparkles, aiLinked: true },
        { name: 'Veille Stratégique', href: '/ai-team?agent=eden&cap=strategic-watch', icon: Sparkles, aiLinked: true },
        { name: 'Pipeline Commercial', href: '/ai-team?agent=timothy', icon: Sparkles, aiLinked: true },
      ]
    },
    {
      name: 'Opérations',
      icon: Activity,
      children: [
        { name: 'Suivi', href: '/tracking', icon: Activity },
        { name: 'Activités', href: '/activities', icon: CheckSquare },
        { name: 'Calendrier', href: '/calendar', icon: Calendar },
        { name: 'Objectifs', href: '/goals', icon: Trophy },
        { name: 'Appels', href: '/calls', icon: PhoneCall },
      ]
    },
    {
      name: 'Catalogue & Projets',
      icon: BookOpen,
      children: [
        { name: 'Catalogue', href: '/catalog', icon: BookOpen },
        { name: 'Produits', href: '/products', icon: Package },
        { name: 'Projets', href: '/projects', icon: FolderKanban },
        { name: 'Documents', href: '/documents', icon: Files },
      ]
    },
  ];

  // Filter AI-linked items so only superadmin sees them
  const isSuperadmin = profile?.role === 'superadmin';
  const filteredNavItems = navItems.map((item: any) => {
    if (!item.children) return item;
    const filteredChildren = item.children.filter((c: any) => !c.aiLinked || isSuperadmin);
    // If a section has ONLY aiLinked children and user is not superadmin, hide it entirely
    if (filteredChildren.length === 0) return null;
    return { ...item, children: filteredChildren };
  }).filter(Boolean);

  // Rapports visible par tous
  filteredNavItems.push({
    name: 'Mes Rapports',
    href: '/reports',
    icon: BarChart3,
  } as any);

  if (profile?.role === 'admin' || profile?.role === 'superadmin') {
    // Standalone top-level item — highly visible for admins
    filteredNavItems.push({
      name: 'Stratégies Commerciales',
      href: '/strategies',
      icon: Target,
      highlight: true,
    } as any);
    filteredNavItems.push({ 
      name: 'Administration', 
      icon: Settings,
      children: [
        { name: 'Rapports équipe', href: '/reports', icon: BarChart3 },
        { name: 'Activité agents', href: '/user-activity', icon: Activity },
        { name: 'Utilisateurs', href: '/users', icon: UserCircle },
        { name: 'Sessions', href: '/sessions', icon: Monitor },
        { name: 'Super Admin', href: '/super-admin', icon: Settings },
      ]
    } as any);
    // Super-admin only: AI Team
    if (profile?.role === 'superadmin') {
      filteredNavItems.push({
        name: 'Équipe IA',
        href: '/ai-team',
        icon: Sparkles,
        highlight: true,
      } as any);
    }
  } else {
    // Commerciaux : lecture seule
    filteredNavItems.push({
      name: 'Stratégies',
      href: '/strategies',
      icon: Target,
    } as any);
  }

  const getPageTitle = () => {
    for (const item of filteredNavItems as any[]) {
      if (item.href === location.pathname) return item.name;
      if (item.children) {
        const child = item.children.find(c => c.href === location.pathname);
        if (child) return child.name;
      }
    }
    return 'SmartBusiness';
  };

  const showSidebar = !forceHideSidebar;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed lg:relative z-50 lg:z-0 h-full bg-slate-900 text-white flex flex-col transition-all duration-300 ease-in-out overflow-hidden pt-safe",
        showSidebar ? (isSidebarOpen ? "w-72" : "w-20") : "w-0 opacity-0 pointer-events-none",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className={cn("p-6 flex items-center justify-between", !isSidebarOpen && "px-4")}>
          {isSidebarOpen ? (
            <div className="flex-1">
              <h1 className="text-2xl font-bold tracking-tight text-indigo-400">SmartBusiness</h1>
              <p className="text-xs text-slate-400 mt-1">Plateforme Call Center</p>
            </div>
          ) : (
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-xl">S</div>
          )}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden text-slate-400 hover:text-white p-2 -mr-2"
            aria-label="Fermer le menu"
            data-testid="close-mobile-menu"
          >
            <X size={22} />
          </button>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            
            if (item.children) {
              const isCollapsed = collapsedSections[item.name];
              const hasActiveChild = item.children.some(c => location.pathname === c.href);
              return (
                <div key={item.name} className="py-1">
                  {isSidebarOpen ? (
                    <button
                      onClick={() => setCollapsedSections(prev => ({ ...prev, [item.name]: !prev[item.name] }))}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-[11px] uppercase tracking-wider font-bold transition-colors",
                        hasActiveChild ? "text-indigo-400" : "text-slate-500 hover:text-slate-300"
                      )}
                      data-testid={`nav-section-${item.name}`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon size={14} />
                        <span>{item.name}</span>
                      </div>
                      <ChevronDown size={14} className={cn("transition-transform duration-200", isCollapsed && "-rotate-90")} />
                    </button>
                  ) : (
                    <div className="h-px bg-slate-800 my-4 mx-2" />
                  )}
                  {(!isCollapsed || !isSidebarOpen) && (
                    <div className="space-y-0.5 mt-0.5">
                      {item.children.map((child) => {
                        const ChildIcon = child.icon;
                        const isActive = location.pathname === child.href;
                        return (
                          <Link
                            key={child.name}
                            to={child.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm",
                              isActive 
                                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20" 
                                : "text-slate-400 hover:bg-slate-800 hover:text-white",
                              !isSidebarOpen && "justify-center px-0"
                            )}
                            title={!isSidebarOpen ? child.name : ""}
                          >
                            <ChildIcon size={18} className={(child as any).aiLinked ? "text-violet-400" : ""} />
                            {isSidebarOpen && (
                              <span className="font-medium flex-1 flex items-center gap-1.5">
                                {child.name}
                                {(child as any).aiLinked && <span className="text-[9px] font-black bg-gradient-to-r from-indigo-500 to-violet-500 text-white px-1 py-0.5 rounded uppercase">IA</span>}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const isActive = location.pathname === item.href;
            const highlight = (item as any).highlight;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm mb-1",
                  isActive 
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20" 
                    : highlight
                    ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/40 font-bold"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white",
                  !isSidebarOpen && "justify-center px-0"
                )}
                title={!isSidebarOpen ? item.name : ""}
              >
                <Icon size={18} className={highlight && !isActive ? "text-amber-400" : ""} />
                {isSidebarOpen && <span className={cn("font-medium", highlight && !isActive && "font-bold")}>{item.name}</span>}
                {isSidebarOpen && highlight && !isActive && (
                  <span className="ml-auto text-[9px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold">NEW</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className={cn("flex items-center gap-3 mb-4 px-2", !isSidebarOpen && "justify-center px-0")}>
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-sm font-bold shrink-0">
              {profile?.name.charAt(0).toUpperCase()}
            </div>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile?.name}</p>
                <p className="text-xs text-slate-400 truncate capitalize">
                  {profile?.role}
                  {profile?.zone && (
                    <span className="ml-1 px-1.5 py-0.5 bg-indigo-500/30 rounded text-[10px] font-bold tracking-wide" data-testid="user-zone-badge">
                      {profile.zone}
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-slate-800 rounded-lg transition-colors",
              !isSidebarOpen && "justify-center px-0"
            )}
            title={!isSidebarOpen ? "Déconnexion" : ""}
          >
            <LogOut size={18} />
            {isSidebarOpen && <span>Déconnexion</span>}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 md:h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 md:px-8 shrink-0 pt-safe" style={{ paddingTop: 'max(env(safe-area-inset-top), 0px)' }}>
          <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden -ml-1 p-2 text-slate-700 hover:bg-slate-100 rounded-lg"
              aria-label="Ouvrir le menu"
              data-testid="open-mobile-menu"
            >
              <Menu size={22} />
            </button>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hidden lg:flex p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {isSidebarOpen ? <ChevronDown className="rotate-90" size={20} /> : <ChevronRight size={20} />}
            </button>
            <h2 className="text-base md:text-lg font-semibold text-slate-800 truncate">
              {getPageTitle()}
            </h2>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <PresenceIndicator users={others} count={othersCount} />
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-bold text-slate-900">{profile?.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{profile?.role}</span>
            </div>
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold border border-indigo-100">
              {profile?.name.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-8 safe-bottom">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
