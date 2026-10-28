import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  ChefHat, 
  Receipt, 
  DollarSign, 
  Package, 
  Users, 
  BarChart3, 
  Settings, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Store, 
  Building2,
  CheckCircle2,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Radio,
  UtensilsCrossed,
  ShieldCheck,
  KeyRound,
  UserCheck,
  Shield,
  Lock,
  Volume2,
  Download
} from 'lucide-react';
import { LocationType, CashRegister, UserProfile } from '../types/pos';
import { PosApiService } from '../services/api';
import { SyncStatusModal } from './SyncStatusModal';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  location: LocationType;
  setLocation: (loc: LocationType) => void;
  isOnline: boolean;
  pendingSyncCount: number;
  onManualSync: () => void;
  isSyncing: boolean;
  cashRegister: CashRegister | null;
  isHaciendaConfigured?: boolean;
  lastSyncSeconds?: number;
  currentUser?: UserProfile | null;
  onSwitchUser?: () => void;
  onLockTerminal?: () => void;
  onOpenSoundSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  location,
  setLocation,
  isOnline,
  pendingSyncCount,
  onManualSync,
  isSyncing,
  cashRegister,
  isHaciendaConfigured = true,
  lastSyncSeconds = 5,
  currentUser,
  onSwitchUser,
  onLockTerminal,
  onOpenSoundSettings
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [fiscalPendingCount, setFiscalPendingCount] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    const checkSync = async () => {
      try {
        const summary = await PosApiService.getSyncSummary();
        if (isMounted && summary.success) {
          setFiscalPendingCount(summary.totalPendingOverall);
        }
      } catch (err) {
        // non-blocking
      }
    };
    checkSync();
    const interval = setInterval(checkSync, 20000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
        setIsAppInstalled(true);
      }

      const handler = (e: any) => {
        e.preventDefault();
        setInstallPrompt(e);
      };
      window.addEventListener('beforeinstallprompt', handler);
      window.addEventListener('appinstalled', () => {
        setIsAppInstalled(true);
        setInstallPrompt(null);
      });

      return () => {
        window.removeEventListener('beforeinstallprompt', handler);
      };
    }
  }, []);

  const handleInstallClick = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstallPrompt(null);
      }
    } else {
      alert('Para instalar la App en este dispositivo:\n1. Toca los tres puntos de Chrome (⋮) arriba a la derecha.\n2. Selecciona "Instalar aplicación" o "Agregar a la pantalla principal".');
    }
  };

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
    <header className="bg-amber-950 text-white border-b border-amber-900 sticky top-0 z-40 shrink-0 shadow-md">
      <div className="px-3 py-1 flex items-center justify-between gap-2">
        
        {/* Left: Brand Mini-Badge & Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          {/* Compact Mini Brand Logo */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-900/60 border border-amber-800 shrink-0">
            <span className="text-base">🍗</span>
            <span className="font-black text-xs text-amber-200 tracking-tight hidden sm:inline">
              SABOR CERVANTEÑO
            </span>
          </div>

          {/* Navigation tabs in the same compact row */}
          <nav className="flex items-center gap-1">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold tracking-tight transition-all whitespace-nowrap ${
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

        {/* Right: status icons + user profile */}
        <div className="flex items-center gap-2 shrink-0 text-xs">
          {/* User Profile / Role Badge with PIN Switcher */}
          {currentUser && (
            <button
              type="button"
              id="header-user-role-badge"
              onClick={onSwitchUser}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                currentUser.role === 'ADMINISTRADOR'
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                  : 'bg-stone-800/80 border-stone-700 text-stone-200 hover:bg-stone-700'
              }`}
              title={`Usuario actual: ${currentUser.name} (${currentUser.role}). Clic para cambiar de usuario o validar PIN.`}
            >
              {currentUser.role === 'ADMINISTRADOR' ? (
                <Shield className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <UserCheck className="w-3.5 h-3.5 text-stone-400" />
              )}
              <span className="hidden sm:inline truncate max-w-[140px]">
                {currentUser.role === 'ADMINISTRADOR' ? 'Administrador' : (currentUser?.name || cashRegister?.cashierName || 'Cajero')}
              </span>
            </button>
          )}

          {/* Cash Register status badge */}
          <div 
            onClick={() => setActiveTab('cash')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-colors ${
              cashRegister?.status === 'OPEN' 
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/60' 
                : 'bg-rose-950/60 border-rose-700/60 text-rose-300 hover:bg-rose-900/60'
            }`}
            title={`Caja registradora: ${cashRegister?.status === 'OPEN' ? 'Abierta (clic para ver arqueo)' : 'Cerrada (clic para abrir)'}`}
          >
            <span className={`w-2 h-2 rounded-full ${cashRegister?.status === 'OPEN' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
            <span className="font-semibold">{cashRegister?.status === 'OPEN' ? 'Caja Abierta' : 'Caja Cerrada'}</span>
          </div>

          {/* Online / Offline Internet Status */}
          <div 
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all ${
              isOnline 
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300' 
                : 'bg-rose-950/80 border-rose-600 text-rose-300'
            }`}
            title={isOnline ? 'Internet Conectado: Sistema en línea y sincronización activa' : 'Sin Conexión a Internet: Operando en Modo Offline Local'}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span>En Línea</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                <span>Sin Internet</span>
              </>
            )}
          </div>

          {/* Botón Maestro Permanente de Sincronización & Estado de Hacienda (Cajero) */}
          <button
            type="button"
            id="header-sync-status-btn"
            onClick={() => setIsSyncModalOpen(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer border ${
              fiscalPendingCount > 0
                ? 'bg-amber-500/25 border-amber-400 text-amber-200 hover:bg-amber-500/35 animate-pulse'
                : 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/60'
            }`}
            title={
              fiscalPendingCount > 0
                ? `⚠️ ${fiscalPendingCount} comprobante(s) pendiente(s) de emitir. Clic para sincronizar y emitir a Hacienda de inmediato.`
                : '🟢 Base de datos y Hacienda sincronizadas al 100%. Clic para abrir Centro de Sincronización.'
            }
          >
            {fiscalPendingCount > 0 ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-amber-300 animate-spin" />
                <span className="font-black text-amber-300">{fiscalPendingCount} Pendiente{fiscalPendingCount > 1 ? 's' : ''}</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Sincronizado</span>
              </>
            )}
          </button>

          {/* Lock Terminal Button */}
          {onLockTerminal && (
            <button
              type="button"
              id="header-lock-terminal-btn"
              onClick={onLockTerminal}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-900/60 hover:bg-rose-950 border border-amber-700/80 hover:border-rose-600 text-amber-200 hover:text-rose-200 text-xs font-semibold transition-all cursor-pointer shadow-xs"
              title="Bloquear Terminal: Regresar a la pantalla de inicio con reloj para cambio de turno o seguridad"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Bloquear</span>
            </button>
          )}

          {/* Sound & Chimes Settings */}
          {onOpenSoundSettings && (
            <button
              type="button"
              id="header-sound-settings-btn"
              onClick={onOpenSoundSettings}
              className="p-1.5 rounded-lg bg-amber-900/40 hover:bg-amber-800 text-amber-200 hover:text-white transition-colors border border-amber-800/60 cursor-pointer"
              title="Sonidos & Chimes del Sistema: Probar y configurar tonos de pedidos y cocina"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* PWA Install Button (oculto si ya está instalada como app nativa) */}
          {!isAppInstalled && (
            <button
              type="button"
              id="header-install-app-btn"
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black transition-all cursor-pointer shadow-xs active:scale-95"
              title="Instalar App en este Dispositivo Android / Tablet"
            >
              <Download className="w-3.5 h-3.5 text-stone-950" />
              <span className="hidden sm:inline">Instalar App</span>
            </button>
          )}

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg bg-amber-900/40 hover:bg-amber-800 text-amber-200 hover:text-white transition-colors border border-amber-800/60"
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa (Maximizar)"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Modal Interactivo de Sincronización y Auditoría para el Cajero */}
      <SyncStatusModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSyncCompleted={() => {
          if (onManualSync) onManualSync();
        }}
      />
    </header>
  );
};
