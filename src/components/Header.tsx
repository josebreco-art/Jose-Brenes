import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  ChefHat, 
  Receipt, 
  ShieldCheck, 
  DollarSign, 
  UtensilsCrossed, 
  Users, 
  BarChart3, 
  Wifi, 
  WifiOff, 
  Maximize2, 
  Minimize2, 
  LogOut, 
  CloudCheck,
  RefreshCw
} from 'lucide-react';
import { UserProfile } from '../types/pos';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: UserProfile | null;
  onLogout: () => void;
  onOpenSyncModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
  onOpenSyncModal
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  const tabs = [
    { id: 'pos', label: 'POS / Caja', icon: ShoppingBag, permKey: 'canAccessPos' },
    { id: 'kds', label: 'Cocina (KDS)', icon: ChefHat, permKey: 'canAccessKitchen' },
    { id: 'sales', label: 'Ventas & Facturas', icon: Receipt, permKey: 'canAccessSales' },
    { id: 'fiscal', label: 'Comprobantes DGT', icon: ShieldCheck, permKey: 'canAccessFiscal' },
    { id: 'cash', label: 'Control de Caja', icon: DollarSign, permKey: 'canAccessCash' },
    { id: 'products', label: 'Menú', icon: UtensilsCrossed, permKey: 'canAccessProducts' },
    { id: 'customers', label: 'Clientes', icon: Users, permKey: 'canAccessCustomers' },
    { id: 'dashboard', label: 'Reportes', icon: BarChart3, permKey: 'canAccessReports' }
  ];

  const visibleTabs = tabs.filter(tab => {
    if (!currentUser || currentUser.role === 'ADMINISTRADOR') return true;
    if (!currentUser.permissions) return true;
    return (currentUser.permissions as any)[tab.permKey] ?? true;
  });

  return (
    <header className="bg-amber-950 text-white border-b border-amber-900 sticky top-0 z-40 shrink-0 shadow-md select-none">
      <div className="px-3 py-1.5 flex items-center justify-between gap-2">
        
        {/* Brand & Version Badge */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-900/60 border border-amber-800 shrink-0">
            <span className="text-lg">🍗</span>
            <div className="flex flex-col">
              <span className="font-black text-xs text-amber-200 tracking-tight leading-none hidden sm:inline">
                SABOR CERVANTEÑO
              </span>
              <span className="text-[10px] text-amber-400 font-mono font-bold leading-none mt-0.5">
                v2.5.0 CR-DGT
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold tracking-tight transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-400/50'
                      : 'text-amber-200/80 hover:text-white hover:bg-amber-900/40'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-amber-400'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right Status Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Online/Offline status */}
          <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border ${
            isOnline 
              ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-400' 
              : 'bg-rose-950/60 border-rose-800/80 text-rose-400 animate-pulse'
          }`}>
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span className="hidden md:inline">{isOnline ? 'En Línea' : 'Sin Conexión'}</span>
          </div>

          {/* Sync Button */}
          <button
            type="button"
            onClick={onOpenSyncModal}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-900/60 border border-teal-700/80 text-teal-300 hover:bg-teal-800/60 text-[11px] font-bold cursor-pointer transition-colors shadow-sm"
            title="Centro de Sincronización y Hacienda"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden sm:inline">Sincronizado</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-md hover:bg-amber-900/60 text-amber-300 hover:text-white cursor-pointer transition-colors hidden sm:inline-flex"
            title={isFullscreen ? 'Salir de Pantalla Completa' : 'Pantalla Completa'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Current User & Logout */}
          {currentUser && (
            <div className="flex items-center gap-1.5 pl-2 border-l border-amber-900">
              <div className="text-right hidden lg:block">
                <div className="text-[11px] font-bold text-amber-100 leading-tight">{currentUser.name}</div>
                <div className="text-[9px] text-amber-400 uppercase tracking-wider">{currentUser.role}</div>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="p-1.5 rounded-md bg-amber-900/60 hover:bg-rose-900/60 border border-amber-800 text-amber-200 hover:text-rose-200 cursor-pointer transition-colors"
                title="Cerrar Sesión / Cambiar Usuario"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

        </div>

      </div>
    </header>
  );
};
