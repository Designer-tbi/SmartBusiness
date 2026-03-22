import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
  ChevronRight
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function Layout() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [forceHideSidebar, setForceHideSidebar] = React.useState(false);

  React.useEffect(() => {
    const handleHideSidebar = (e: any) => setForceHideSidebar(e.detail);
    window.addEventListener('sb-hide-sidebar', handleHideSidebar);
    return () => window.removeEventListener('sb-hide-sidebar', handleHideSidebar);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Tableau de bord', href: '/', icon: LayoutDashboard },
    { 
      name: 'CRM', 
      icon: Users,
      children: [
        { name: 'Portefeuille client', href: '/portfolio', icon: Briefcase },
        { name: 'Opportunités', href: '/opportunities', icon: Target },
        { name: 'Leads', href: '/leads', icon: UserPlus },
        { name: 'Clients', href: '/customers', icon: Users },
      ]
    },
    { 
      name: 'Ventes & Facturation', 
      icon: FileText,
      children: [
        { name: 'Devis', href: '/quotes', icon: FileText },
        { name: 'Factures', href: '/invoices', icon: Receipt },
        { name: 'Commissions', href: '/commissions', icon: DollarSign },
        { name: 'Analyse Ventes', href: '/sales-analysis', icon: PieChart },
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
    { name: 'Appels', href: '/calls', icon: PhoneCall },
  ];

  if (profile?.role === 'admin') {
    navItems.push({ 
      name: 'Administration', 
      icon: Settings,
      children: [
        { name: 'Rapports', href: '/reports', icon: BarChart3 },
        { name: 'Utilisateurs', href: '/users', icon: UserCircle },
        { name: 'Paramètres', href: '/settings', icon: Settings },
      ]
    });
  }

  const getPageTitle = () => {
    for (const item of navItems) {
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
        "fixed lg:relative z-50 lg:z-0 h-full bg-slate-900 text-white flex flex-col transition-all duration-300 ease-in-out overflow-hidden",
        showSidebar ? (isSidebarOpen ? "w-72" : "w-20") : "w-0 opacity-0 pointer-events-none",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className={cn("p-6 flex items-center justify-between", !isSidebarOpen && "px-4")}>
          {isSidebarOpen ? (
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-indigo-400">SmartBusiness</h1>
              <p className="text-xs text-slate-400 mt-1">Plateforme Call Center</p>
            </div>
          ) : (
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-xl">S</div>
          )}
        </div>
        
        <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            
            if (item.children) {
              return (
                <div key={item.name} className="py-2">
                  {isSidebarOpen ? (
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold px-3 mb-2">
                      {item.name}
                    </p>
                  ) : (
                    <div className="h-px bg-slate-800 my-4 mx-2" />
                  )}
                  <div className="space-y-1">
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
                          <ChildIcon size={18} />
                          {isSidebarOpen && <span className="font-medium">{child.name}</span>}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }

            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm mb-1",
                  isActive 
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20" 
                    : "text-slate-400 hover:bg-slate-800 hover:text-white",
                  !isSidebarOpen && "justify-center px-0"
                )}
                title={!isSidebarOpen ? item.name : ""}
              >
                <Icon size={18} />
                {isSidebarOpen && <span className="font-medium">{item.name}</span>}
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
                <p className="text-xs text-slate-400 truncate capitalize">{profile?.role}</p>
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
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <LayoutDashboard size={20} />
            </button>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hidden lg:flex p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {isSidebarOpen ? <ChevronDown className="rotate-90" size={20} /> : <ChevronRight size={20} />}
            </button>
            <h2 className="text-lg font-semibold text-slate-800 truncate">
              {getPageTitle()}
            </h2>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-bold text-slate-900">{profile?.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{profile?.role}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold border border-indigo-100">
              {profile?.name.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
