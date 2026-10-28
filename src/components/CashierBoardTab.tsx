import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  KeyRound, 
  Percent, 
  DollarSign, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Edit3, 
  Trash2, 
  Plus, 
  Shield, 
  Lock, 
  Eye, 
  EyeOff, 
  Receipt, 
  FileText, 
  Printer, 
  Download, 
  Search, 
  Filter, 
  TrendingUp, 
  Award, 
  ShoppingBag, 
  ChefHat, 
  UtensilsCrossed, 
  BarChart3, 
  Clock, 
  AlertCircle,
  Check,
  X,
  RefreshCw,
  Loader2,
  Sparkles,
  Database
} from 'lucide-react';
import { UserProfile, UserPermissions, Sale, Product, DEFAULT_CASHIER_PERMISSIONS, DEFAULT_ADMIN_PERMISSIONS } from '../types/pos';
import { PosApiService } from '../services/api';
import { getCostaRicaDate } from '../utils/dateUtils';

interface CashierBoardTabProps {
  currentUser: UserProfile;
  sales: Sale[];
  products?: Product[];
  onRequestAdminAuth?: (onSuccess: () => void) => void;
  onElevateToAdmin?: () => void;
}

export const CashierBoardTab: React.FC<CashierBoardTabProps> = ({
  currentUser,
  sales,
  products,
  onRequestAdminAuth,
  onElevateToAdmin
}) => {
  // Navigation inside Tablero: 'performance' (comisiones) vs 'management' (cajeros y permisos)
  const [boardSection, setBoardSection] = useState<'performance' | 'management'>('performance');

  // Master Force Sync State (Mando Absoluto del Administrador)
  const [isMasterSyncing, setIsMasterSyncing] = useState<boolean>(false);
  const [showMasterSyncConfirm, setShowMasterSyncConfirm] = useState<boolean>(false);
  const [masterSyncResultModal, setMasterSyncResultModal] = useState<any>(null);

  // Local unlock state to prevent lock loops
  const [isLocallyUnlocked, setIsLocallyUnlocked] = useState<boolean>(false);
  const [lockPinInput, setLockPinInput] = useState<string>('');
  const [lockPinError, setLockPinError] = useState<string>('');

  // Users State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(true);

  // Filter states for commission calculations
  const [periodPreset, setPeriodPreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'all' | 'custom'>('month');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const todayCr = getCostaRicaDate();
    const [y, m] = todayCr.split('-');
    return `${y}-${m}-01`;
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return getCostaRicaDate();
  });
  const [selectedCashierFilter, setSelectedCashierFilter] = useState<string>('ALL');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [pinChangeUser, setPinChangeUser] = useState<UserProfile | null>(null);
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [showPinsMap, setShowPinsMap] = useState<Record<string, boolean>>({});

  // Receipt / Invoices modal state
  const [viewInvoicesCashier, setViewInvoicesCashier] = useState<{ cashier: UserProfile; sales: Sale[] } | null>(null);
  const [printCommissionVoucher, setPrintCommissionVoucher] = useState<{
    cashier: UserProfile;
    periodLabel: string;
    totalSales: number;
    cashSales: number;
    cardSinpeSales: number;
    ordersCount: number;
    rate: number;
    commissionAmount: number;
  } | null>(null);

  // New/Edit User Form State
  const [formData, setFormData] = useState<{
    id: string;
    name: string;
    email: string;
    role: 'CAJERO' | 'SUPERVISOR' | 'ADMINISTRADOR';
    pinCode: string;
    commissionRate: number;
    active: boolean;
    permissions: UserPermissions;
  }>({
    id: '',
    name: '',
    email: '',
    role: 'CAJERO',
    pinCode: '',
    commissionRate: 2.5,
    active: true,
    permissions: { ...DEFAULT_CASHIER_PERMISSIONS }
  });

  // Load users from API or LocalStorage
  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const data = await PosApiService.getUsers();
      setUsers(data || []);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Filter sales by date range
  const filteredSales = useMemo(() => {
    const todayStr = getCostaRicaDate();

    return (sales || []).filter(s => {
      if (!s) return false;
      const saleDate = s.timestamp ? getCostaRicaDate(s.timestamp) : (s.date || '');
      if (!saleDate) return false;

      if (periodPreset === 'today') {
        return saleDate === todayStr;
      }
      if (periodPreset === 'yesterday') {
        const yStr = getCostaRicaDate(Date.now() - 86400000);
        return saleDate === yStr;
      }
      if (periodPreset === 'week') {
        const wStr = getCostaRicaDate(Date.now() - (7 * 86400000));
        return saleDate >= wStr && saleDate <= todayStr;
      }
      if (periodPreset === 'month') {
        const [y, m] = todayStr.split('-');
        const startOfMonth = `${y}-${m}-01`;
        return saleDate >= startOfMonth && saleDate <= todayStr;
      }
      if (periodPreset === 'last_month') {
        const [yNum, mNum] = todayStr.split('-').map(Number);
        const lastMonthY = mNum === 1 ? yNum - 1 : yNum;
        const lastMonthM = mNum === 1 ? 12 : mNum - 1;
        const startOfLastMonth = `${lastMonthY}-${String(lastMonthM).padStart(2, '0')}-01`;
        const lastDayOfLastMonth = new Date(lastMonthY, lastMonthM, 0).getDate();
        const endOfLastMonth = `${lastMonthY}-${String(lastMonthM).padStart(2, '0')}-${String(lastDayOfLastMonth).padStart(2, '0')}`;
        return saleDate >= startOfLastMonth && saleDate <= endOfLastMonth;
      }
      if (periodPreset === 'custom') {
        return saleDate >= customStartDate && saleDate <= customEndDate;
      }
      return true; // 'all'
    });
  }, [sales, periodPreset, customStartDate, customEndDate]);

  // Period label for reports
  const periodLabel = useMemo(() => {
    switch (periodPreset) {
      case 'today': return 'Hoy';
      case 'yesterday': return 'Ayer';
      case 'week': return 'Últimos 7 días';
      case 'month': return 'Mes Actual';
      case 'last_month': return 'Mes Anterior';
      case 'all': return 'Todo el Historial';
      case 'custom': return `${customStartDate} al ${customEndDate}`;
    }
  }, [periodPreset, customStartDate, customEndDate]);

  // Performance calculations per cashier
  const cashierMetrics = useMemo(() => {
    const map: Record<string, {
      user: UserProfile;
      salesCount: number;
      totalSales: number;
      cashSales: number;
      cardSales: number;
      sinpeSales: number;
      transferSales: number;
      commissionRate: number;
      salesList: Sale[];
    }> = {};

    // Initialize map for all users in the system
    users.forEach(u => {
      map[u.id] = {
        user: u,
        salesCount: 0,
        totalSales: 0,
        cashSales: 0,
        cardSales: 0,
        sinpeSales: 0,
        transferSales: 0,
        commissionRate: u.commissionRate ?? (u.role === 'ADMINISTRADOR' ? 0 : 2.5),
        salesList: []
      };
    });

    // Also account for sales with cashier names not yet in users map
    filteredSales.forEach(s => {
      let key = s.cashierId;
      // If no cashierId or not in map, look up by cashierName or create placeholder
      if (!key || !map[key]) {
        const foundByName = users.find(u => u.name.toLowerCase() === (s.cashierName || '').toLowerCase());
        if (foundByName) {
          key = foundByName.id;
        } else {
          key = s.cashierId || (s.cashierName ? `legacy-${s.cashierName}` : 'usr-general');
          if (!map[key]) {
            map[key] = {
              user: {
                id: key,
                name: s.cashierName || 'Cajero Sin Asignar',
                email: 'cajero@saborcervanteno.cr',
                role: 'CAJERO',
                active: true,
                location: 'RESTAURANTE',
                commissionRate: 2.0
              },
              salesCount: 0,
              totalSales: 0,
              cashSales: 0,
              cardSales: 0,
              sinpeSales: 0,
              transferSales: 0,
              commissionRate: 2.0,
              salesList: []
            };
          }
        }
      }

      const entry = map[key];
      entry.salesCount += 1;
      entry.totalSales += (s.total || 0);
      entry.salesList.push(s);

      (s.payments || []).forEach(p => {
        if (p.method === 'CASH') entry.cashSales += (p.amount || 0);
        else if (p.method === 'CARD') entry.cardSales += (p.amount || 0);
        else if (p.method === 'SINPE') entry.sinpeSales += (p.amount || 0);
        else if (p.method === 'TRANSFER') entry.transferSales += (p.amount || 0);
      });
    });

    return Object.values(map);
  }, [users, filteredSales]);

  // Overall totals for the period
  const totalPeriodSales = useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
  }, [filteredSales]);

  const totalPeriodCommission = useMemo(() => {
    return cashierMetrics.reduce((sum, item) => {
      const comm = (item.totalSales * (item.commissionRate || 0)) / 100;
      return sum + comm;
    }, 0);
  }, [cashierMetrics]);

  const topCashier = useMemo(() => {
    if (cashierMetrics.length === 0) return null;
    const sorted = [...cashierMetrics].sort((a, b) => b.totalSales - a.totalSales);
    return sorted[0]?.totalSales > 0 ? sorted[0] : null;
  }, [cashierMetrics]);

  // Handlers for user management
  const handleOpenCreate = () => {
    setFormData({
      id: `usr-${Date.now()}`,
      name: '',
      email: '',
      role: 'CAJERO',
      pinCode: '',
      commissionRate: 2.5,
      active: true,
      permissions: { ...DEFAULT_CASHIER_PERMISSIONS }
    });
    setEditingUser(null);
    setPinError('');
    setIsCreateModalOpen(true);
  };

  const handleOpenEdit = (user: UserProfile) => {
    setEditingUser(user);
    setFormData({
      id: user.id,
      name: user.name,
      email: user.email,
      role: (user.role as any) || 'CAJERO',
      pinCode: user.pinCode || '',
      commissionRate: user.commissionRate ?? 2.5,
      active: user.active ?? true,
      permissions: user.permissions || (user.role === 'ADMINISTRADOR' ? { ...DEFAULT_ADMIN_PERMISSIONS } : { ...DEFAULT_CASHIER_PERMISSIONS })
    });
    setPinError('');
    setIsCreateModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setPinError('El nombre del cajero es obligatorio');
      return;
    }
    if (!formData.pinCode || formData.pinCode.length !== 4 || !/^\d{4}$/.test(formData.pinCode)) {
      setPinError('La contraseña / PIN debe ser exactamente de 4 dígitos numéricos.');
      return;
    }

    // Check PIN uniqueness against other users
    const duplicate = users.find(u => u.id !== formData.id && u.pinCode === formData.pinCode);
    if (duplicate) {
      setPinError(`El PIN ya está en uso por el usuario "${duplicate.name}". Elija un código diferente.`);
      return;
    }

    const updatedUser: UserProfile = {
      id: formData.id,
      name: formData.name.trim(),
      email: formData.email.trim() || `${formData.name.toLowerCase().replace(/\s+/g, '.')}@saborcervanteno.cr`,
      role: formData.role,
      pinCode: formData.pinCode,
      commissionRate: Number(formData.commissionRate) || 0,
      active: formData.active,
      location: 'RESTAURANTE',
      permissions: formData.permissions
    };

    try {
      const updatedList = await PosApiService.saveUser(updatedUser);
      setUsers(updatedList);
      setIsCreateModalOpen(false);
    } catch (err: any) {
      setPinError('Error al guardar: ' + (err.message || 'Desconocido'));
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (user.role === 'ADMINISTRADOR') {
      alert('No es posible eliminar el perfil de Administrador Principal.');
      return;
    }
    if (!window.confirm(`¿Está seguro de eliminar al cajero "${user.name}"? Los registros históricos de ventas no se borrarán.`)) {
      return;
    }

    try {
      const updated = await PosApiService.deleteUser(user.id);
      setUsers(updated);
    } catch (err: any) {
      alert('Error eliminando cajero: ' + err.message);
    }
  };

  const handleSaveQuickPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinChangeUser) return;
    if (!newPinInput || newPinInput.length !== 4 || !/^\d{4}$/.test(newPinInput)) {
      setPinError('El nuevo PIN debe contener 4 dígitos numéricos.');
      return;
    }

    // Uniqueness check
    const duplicate = users.find(u => u.id !== pinChangeUser.id && u.pinCode === newPinInput);
    if (duplicate) {
      setPinError(`El PIN ya está en uso por "${duplicate.name}". Seleccione otro.`);
      return;
    }

    const updated: UserProfile = {
      ...pinChangeUser,
      pinCode: newPinInput
    };

    try {
      const updatedList = await PosApiService.saveUser(updated);
      setUsers(updatedList);
      setPinChangeUser(null);
      setNewPinInput('');
      setPinError('');
    } catch (err: any) {
      setPinError('Error al actualizar PIN: ' + err.message);
    }
  };

  const togglePinVisibility = (userId: string) => {
    setShowPinsMap(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const handleExportCommissionsCSV = () => {
    const headers = ['Cajero', 'Rol', 'Estado', 'Ventas Totales (CRC)', 'Ordenes', 'Efectivo (CRC)', 'Tarjeta/SINPE (CRC)', '% Comision', 'Monto Comision (CRC)'];
    const rows = cashierMetrics.map(m => [
      `"${m.user.name}"`,
      `"${m.user.role}"`,
      m.user.active ? 'Activo' : 'Inactivo',
      m.totalSales,
      m.salesCount,
      m.cashSales,
      m.cardSales + m.sinpeSales + m.transferSales,
      `${m.commissionRate}%`,
      (m.totalSales * m.commissionRate) / 100
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `liquidacion_comisiones_${periodPreset}_${getCostaRicaDate()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintVoucher = (item: typeof cashierMetrics[0]) => {
    setPrintCommissionVoucher({
      cashier: item.user,
      periodLabel,
      totalSales: item.totalSales,
      cashSales: item.cashSales,
      cardSinpeSales: item.cardSales + item.sinpeSales + item.transferSales,
      ordersCount: item.salesCount,
      rate: item.commissionRate,
      commissionAmount: (item.totalSales * item.commissionRate) / 100
    });
  };

  const handleExecuteMasterSync = async () => {
    setIsMasterSyncing(true);
    try {
      // 1. Obtener los productos actuales del administrador
      const latestProducts = products && products.length > 0 ? products : await PosApiService.getProducts();
      const latestCategories = await PosApiService.getCategories();
      const latestCustomers = await PosApiService.getCustomers();

      const result = await PosApiService.executeMasterForceSync({
        products: latestProducts,
        categories: latestCategories,
        users: users && users.length > 0 ? users : undefined,
        customers: latestCustomers
      });

      setMasterSyncResultModal(result);
      setShowMasterSyncConfirm(false);
    } catch (err: any) {
      alert('Error ejecutando la Sincronización Maestra: ' + (err?.message || err));
    } finally {
      setIsMasterSyncing(false);
    }
  };

  // Check if admin or locally unlocked
  const isAdministrator = currentUser.role === 'ADMINISTRADOR' || isLocallyUnlocked;

  const handleDirectUnlock = (pinToTest?: string) => {
    const pin = pinToTest || lockPinInput;
    const storedAdminPin = localStorage.getItem('pos_admin_pin');
    const isValid = (storedAdminPin && pin === storedAdminPin) || 
      (!storedAdminPin && pin === '9999') || 
      users.some(u => u.role === 'ADMINISTRADOR' && u.pinCode === pin);
    
    if (isValid) {
      setLockPinError('');
      setIsLocallyUnlocked(true);
      onElevateToAdmin?.();
    } else {
      setLockPinError('PIN incorrecto. Ingrese su PIN de Administrador.');
    }
  };

  if (!isAdministrator) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white rounded-3xl border border-stone-200 shadow-sm text-center max-w-lg mx-auto my-12 space-y-5">
        <div className="w-16 h-16 rounded-3xl bg-amber-100 flex items-center justify-center text-amber-700 mx-auto shadow-inner">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-xl font-black text-stone-900">Acceso al Tablero Administrativo</h3>
          <p className="text-xs text-stone-500 max-w-sm">
            Este módulo contiene la gestión de contraseñas de cajeros, asignación de permisos de interfaz y cálculo de comisiones. Solo el <strong>Administrador</strong> tiene autorización.
          </p>
        </div>

        {/* Form to enter PIN */}
        <div className="w-full space-y-3 pt-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleDirectUnlock();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="password"
              maxLength={4}
              value={lockPinInput}
              onChange={(e) => {
                setLockPinInput(e.target.value);
                setLockPinError('');
              }}
              placeholder="Digite PIN (4 dígitos)"
              className="flex-1 px-4 py-2.5 rounded-xl border border-stone-200 text-center font-mono font-black text-sm tracking-widest bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-stone-800 hover:bg-stone-900 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Desbloquear
            </button>
          </form>

          {lockPinError && (
            <p className="text-xs text-rose-600 font-bold">{lockPinError}</p>
          )}

          {onRequestAdminAuth && (
            <button
              type="button"
              onClick={() => {
                onRequestAdminAuth(() => {
                  setIsLocallyUnlocked(true);
                  onElevateToAdmin?.();
                });
              }}
              className="text-xs text-amber-700 hover:text-amber-800 font-bold underline cursor-pointer"
            >
              Abrir teclado numérico de supervisor
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tablero Header Banner */}
      <div className="bg-gradient-to-r from-amber-900 via-stone-900 to-amber-950 text-white p-5 rounded-3xl border border-amber-800/50 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Acceso Exclusivo Administrador
            </span>
            <span className="text-stone-400 text-xs">• Sabor Cervanteño</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-amber-100 flex items-center gap-2">
            <span>👑 Tablero de Cajeros & Comisiones</span>
          </h2>
          <p className="text-xs text-amber-200/70 max-w-2xl">
            Cree perfiles de cajeros, asigne contraseñas (PIN) individuales, controle qué partes del sistema pueden ver y liquide comisiones por ventas en períodos históricos.
          </p>
        </div>

        {/* Tab Switcher: Performance vs Management */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-stone-900/80 p-1 rounded-2xl border border-stone-800 flex items-center gap-1">
            <button
              onClick={() => setBoardSection('performance')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                boardSection === 'performance'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-stone-400 hover:text-white hover:bg-stone-800'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>Ventas & Comisiones</span>
            </button>

            <button
              onClick={() => setBoardSection('management')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                boardSection === 'management'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-stone-400 hover:text-white hover:bg-stone-800'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Gestión de Cajeros ({users.length})</span>
            </button>
          </div>

          {isAdministrator && (
            <button
              id="btn-tablero-master-sync"
              onClick={() => setShowMasterSyncConfirm(true)}
              disabled={isMasterSyncing}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 text-white rounded-2xl font-black text-xs shadow-md transition-all active:scale-95 shrink-0 border border-amber-400/40 cursor-pointer disabled:opacity-50"
              title="Sincronización Maestra: Prioridad absoluta para guardar datos activos y purgar permanentemente datos eliminados en la nube y disco"
            >
              {isMasterSyncing ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-200" />
              ) : (
                <RefreshCw className="w-4 h-4 text-amber-200" />
              )}
              <span>{isMasterSyncing ? 'Sincronizando...' : 'Sincronización Maestra'}</span>
            </button>
          )}

          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-xs shadow-md transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Cajero</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: PERFORMANCE & COMMISSIONS */}
      {boardSection === 'performance' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-stone-600 flex items-center gap-1.5 mr-1">
                <Calendar className="w-4 h-4 text-amber-600" />
                <span>Período Histórico:</span>
              </span>

              {(['today', 'yesterday', 'week', 'month', 'last_month', 'all', 'custom'] as const).map(preset => {
                const labels: Record<string, string> = {
                  today: 'Hoy',
                  yesterday: 'Ayer',
                  week: '7 Días',
                  month: 'Este Mes',
                  last_month: 'Mes Anterior',
                  all: 'Todo',
                  custom: 'Personalizado'
                };
                const isActive = periodPreset === preset;
                return (
                  <button
                    key={preset}
                    onClick={() => setPeriodPreset(preset)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-amber-600 text-white shadow-2xs ring-1 ring-amber-500'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {labels[preset]}
                  </button>
                );
              })}

              {periodPreset === 'custom' && (
                <div className="flex items-center gap-2 ml-2 bg-stone-50 p-1.5 rounded-xl border border-stone-200 text-xs">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-2 py-1 bg-white border border-stone-300 rounded-lg text-stone-800 font-bold"
                  />
                  <span className="text-stone-400 font-bold">a</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-2 py-1 bg-white border border-stone-300 rounded-lg text-stone-800 font-bold"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCommissionsCSV}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold text-xs border border-stone-200 transition-colors"
                title="Descargar reporte en formato CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar CSV</span>
              </button>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-1">
              <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wide flex items-center justify-between">
                <span>Ventas Totales</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-amber-800">
                ₡{(totalPeriodSales || 0).toLocaleString('es-CR')}
              </div>
              <div className="text-[10px] text-stone-500 font-medium">
                {filteredSales.length} órdenes facturadas en {periodLabel}
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-1">
              <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wide flex items-center justify-between">
                <span>Comisiones a Liquidar</span>
                <Percent className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-blue-700">
                ₡{Math.round(totalPeriodCommission).toLocaleString('es-CR')}
              </div>
              <div className="text-[10px] text-stone-500 font-medium">
                A repartir según comisiones de cajeros
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-1">
              <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wide flex items-center justify-between">
                <span>Cajero Líder</span>
                <Award className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-base sm:text-lg font-black text-stone-900 truncate">
                {topCashier ? topCashier.user.name : 'Sin ventas'}
              </div>
              <div className="text-[10px] text-emerald-600 font-bold">
                {topCashier ? `₡${topCashier.totalSales.toLocaleString('es-CR')} (${topCashier.salesCount} ventas)` : '0 órdenes'}
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-1">
              <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wide flex items-center justify-between">
                <span>Cajeros Activos</span>
                <Users className="w-4 h-4 text-stone-500" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-stone-800">
                {users.filter(u => u.active).length}
              </div>
              <div className="text-[10px] text-stone-500 font-medium">
                {users.length} usuarios registrados en total
              </div>
            </div>
          </div>

          {/* Detailed Performance & Commission Table */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <div>
                <h3 className="font-extrabold text-sm text-stone-900">
                  Desglose de Ventas y Liquidación de Comisiones por Cajero
                </h3>
                <p className="text-xs text-stone-500">
                  Cálculo basado en las ventas reales asignadas a cada cajero durante: <strong>{periodLabel}</strong>
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-100/75 text-stone-600 uppercase font-black tracking-wider text-[10px] border-b border-stone-200">
                  <tr>
                    <th className="py-3 px-4">Cajero / Usuario</th>
                    <th className="py-3 px-4 text-center">Órdenes</th>
                    <th className="py-3 px-4 text-right">Efectivo</th>
                    <th className="py-3 px-4 text-right">Tarjetas & SINPE</th>
                    <th className="py-3 px-4 text-right font-black">Ventas Totales</th>
                    <th className="py-3 px-4 text-center">% Comisión</th>
                    <th className="py-3 px-4 text-right font-black text-blue-900">Comisión a Pagar</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {cashierMetrics.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-stone-400">
                        No hay cajeros ni registros de ventas para el período seleccionado.
                      </td>
                    </tr>
                  ) : (
                    cashierMetrics.map(item => {
                      const commissionAmount = Math.round((item.totalSales * (item.commissionRate || 0)) / 100);
                      const avgTicket = item.salesCount > 0 ? Math.round(item.totalSales / item.salesCount) : 0;

                      return (
                        <tr key={item.user.id} className="hover:bg-amber-50/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 font-black flex items-center justify-center text-xs shrink-0 shadow-2xs">
                                {item.user.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-extrabold text-stone-900 text-xs flex items-center gap-1.5">
                                  <span>{item.user.name}</span>
                                  {item.user.role === 'ADMINISTRADOR' && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                                      Admin
                                    </span>
                                  )}
                                  {!item.user.active && (
                                    <span className="px-1.5 py-0.2 rounded bg-stone-200 text-stone-600 text-[9px] font-bold">
                                      Inactivo
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-stone-400">
                                  Ticket Promedio: ₡{avgTicket.toLocaleString('es-CR')}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-center font-bold text-stone-700">
                            <span className="px-2 py-0.5 rounded-lg bg-stone-100 text-stone-800 font-black">
                              {item.salesCount}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right font-medium text-emerald-700">
                            ₡{item.cashSales.toLocaleString('es-CR')}
                          </td>

                          <td className="py-3 px-4 text-right font-medium text-blue-700">
                            ₡{(item.cardSales + item.sinpeSales + item.transferSales).toLocaleString('es-CR')}
                          </td>

                          <td className="py-3 px-4 text-right font-black text-stone-900 text-sm">
                            ₡{item.totalSales.toLocaleString('es-CR')}
                          </td>

                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center gap-0.5 font-black text-amber-900 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                              {item.commissionRate}%
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <span className="text-sm font-black text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200">
                              ₡{commissionAmount.toLocaleString('es-CR')}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setViewInvoicesCashier({ cashier: item.user, sales: item.salesList })}
                                className="p-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition-colors"
                                title="Ver facturas asociadas a este cajero"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handlePrintVoucher(item)}
                                className="flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] shadow-2xs transition-colors"
                                title="Imprimir tiquete de liquidación de comisión"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Liquidación</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {cashierMetrics.length > 0 && (
                  <tfoot className="bg-stone-100 font-extrabold border-t-2 border-stone-300 text-stone-900">
                    <tr>
                      <td className="py-3 px-4 uppercase tracking-wider text-xs">Total General ({periodLabel})</td>
                      <td className="py-3 px-4 text-center">{filteredSales.length}</td>
                      <td className="py-3 px-4 text-right text-emerald-800">
                        ₡{cashierMetrics.reduce((s, c) => s + c.cashSales, 0).toLocaleString('es-CR')}
                      </td>
                      <td className="py-3 px-4 text-right text-blue-800">
                        ₡{cashierMetrics.reduce((s, c) => s + c.cardSales + c.sinpeSales + c.transferSales, 0).toLocaleString('es-CR')}
                      </td>
                      <td className="py-3 px-4 text-right text-base text-amber-900 font-black">
                        ₡{totalPeriodSales.toLocaleString('es-CR')}
                      </td>
                      <td className="py-3 px-4 text-center">-</td>
                      <td className="py-3 px-4 text-right text-base text-blue-900 font-black">
                        ₡{Math.round(totalPeriodCommission).toLocaleString('es-CR')}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: CASHIERS, PINS & PERMISSIONS MANAGEMENT */}
      {boardSection === 'management' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-base text-stone-900">
                Directorio de Cajeros y Permisos de Interfaz
              </h3>
              <p className="text-xs text-stone-500">
                Administre claves de acceso (PINes) de 4 dígitos y seleccione con precisión qué pestañas y funciones puede ver cada cajero.
              </p>
            </div>

            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Crear Nuevo Cajero</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map(user => {
              const perms = user.permissions || (user.role === 'ADMINISTRADOR' ? DEFAULT_ADMIN_PERMISSIONS : DEFAULT_CASHIER_PERMISSIONS);
              const isShowingPin = showPinsMap[user.id];

              return (
                <div
                  key={user.id}
                  className={`bg-white rounded-3xl border transition-all p-5 space-y-4 flex flex-col justify-between shadow-xs ${
                    user.active ? 'border-stone-200' : 'border-stone-200 bg-stone-50/70 opacity-75'
                  }`}
                >
                  <div className="space-y-3">
                    {/* User Avatar, Name & Role */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-900 font-black text-lg flex items-center justify-center shadow-inner">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-stone-900 flex items-center gap-1.5">
                            <span>{user.name}</span>
                          </h4>
                          <div className="text-[11px] text-stone-400 truncate max-w-[170px]">
                            {user.email}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide ${
                              user.role === 'ADMINISTRADOR'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-stone-100 text-stone-700 border border-stone-200'
                            }`}>
                              {user.role}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              user.active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                            }`}>
                              {user.active ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* PIN & Commission Card */}
                    <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-stone-600 font-bold">
                          <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                          <span>Contraseña / PIN:</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-stone-900 bg-white px-2 py-0.5 rounded border border-stone-200 tracking-wider">
                            {isShowingPin ? (user.pinCode || '----') : '••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePinVisibility(user.id)}
                            className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition-colors"
                            title={isShowingPin ? "Ocultar PIN" : "Ver PIN"}
                          >
                            {isShowingPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-stone-200/60">
                        <div className="flex items-center gap-1.5 text-stone-600 font-bold">
                          <Percent className="w-3.5 h-3.5 text-blue-600" />
                          <span>Comisión por Venta:</span>
                        </div>
                        <span className="font-black text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {user.commissionRate ?? 2.5}%
                        </span>
                      </div>
                    </div>

                    {/* Permisos de Interfaz Badges */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-black text-stone-400 uppercase tracking-wider">
                        Elementos de la Interfaz Permitidos:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {perms.canAccessPos && (
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                            <ShoppingBag className="w-2.5 h-2.5" /> POS / Caja
                          </span>
                        )}
                        {perms.canAccessKitchen && (
                          <span className="px-2 py-0.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-[10px] font-bold flex items-center gap-1">
                            <ChefHat className="w-2.5 h-2.5" /> Cocina (KDS)
                          </span>
                        )}
                        {perms.canAccessCash && (
                          <span className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold flex items-center gap-1">
                            <DollarSign className="w-2.5 h-2.5" /> Control Caja
                          </span>
                        )}
                        {perms.canAccessSales && (
                          <span className="px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-bold flex items-center gap-1">
                            <Receipt className="w-2.5 h-2.5" /> Facturas
                          </span>
                        )}
                        {perms.canAccessProducts && (
                          <span className="px-2 py-0.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 text-[10px] font-bold flex items-center gap-1">
                            <UtensilsCrossed className="w-2.5 h-2.5" /> Menú / Prod.
                          </span>
                        )}
                        {perms.canAccessFiscal && (
                          <span className="px-2 py-0.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-bold flex items-center gap-1">
                            <Shield className="w-2.5 h-2.5" /> Hacienda DGT
                          </span>
                        )}
                        {perms.canAccessReports && (
                          <span className="px-2 py-0.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[10px] font-bold flex items-center gap-1">
                            <BarChart3 className="w-2.5 h-2.5" /> Reportes
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setPinChangeUser(user);
                        setNewPinInput('');
                        setPinError('');
                      }}
                      className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold text-xs flex items-center gap-1 transition-colors"
                      title="Cambiar o corregir la contraseña PIN"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                      <span>Cambiar PIN</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(user)}
                        className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl transition-colors"
                        title="Editar cajero y permisos"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      {user.role !== 'ADMINISTRADOR' && (
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl transition-colors"
                          title="Eliminar cajero"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT CASHIER & PERMISSIONS */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-stone-200 overflow-hidden my-6">
            <div className="p-5 bg-gradient-to-r from-amber-900 to-stone-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-600 flex items-center justify-center font-black">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base">
                    {editingUser ? 'Editar Cajero & Permisos' : 'Crear Nuevo Cajero'}
                  </h3>
                  <p className="text-[11px] text-amber-200/70">
                    Configure las credenciales de acceso y permisos de interfaz.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-stone-300 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {pinError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{pinError}</span>
                </div>
              )}

              {/* General User Data */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700 block">
                    Nombre Completo: *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Juan Pérez"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700 block">
                    Correo Electrónico (opcional):
                  </label>
                  <input
                    type="email"
                    placeholder="juan.perez@saborcervanteno.cr"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-medium text-stone-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* PIN & Commission Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700 block flex items-center justify-between">
                    <span>Contraseña (PIN): *</span>
                    <span className="text-[10px] text-amber-700 font-bold">4 dígitos</span>
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    placeholder="••••"
                    value={formData.pinCode}
                    onChange={(e) => setFormData({ ...formData, pinCode: e.target.value.replace(/\D/g, '') })}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-base font-black text-center tracking-widest text-stone-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700 block">
                    % Comisión por Venta:
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={formData.commissionRate}
                      onChange={(e) => setFormData({ ...formData, commissionRate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-black text-stone-900 focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="absolute right-3 top-2 text-xs font-black text-stone-400">%</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700 block">
                    Rol en Sistema:
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="CAJERO">Cajero</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="ADMINISTRADOR">Administrador</option>
                  </select>
                </div>
              </div>

              {/* Status active/inactive */}
              <div className="flex items-center gap-2 p-3 bg-stone-50 rounded-2xl border border-stone-200">
                <input
                  type="checkbox"
                  id="user-active-checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                />
                <label htmlFor="user-active-checkbox" className="text-xs font-bold text-stone-800 cursor-pointer">
                  Cajero Activo (Permite iniciar turno e ingresar ventas en el POS)
                </label>
              </div>

              {/* PERMISSIONS MATRIX */}
              <div className="space-y-2 pt-2 border-t border-stone-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-stone-900 uppercase tracking-wide">
                      Elementos de Interfaz y Permisos de Acceso:
                    </h4>
                    <p className="text-[11px] text-stone-500">
                      Seleccione qué pantallas y botones podrá usar este cajero.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, permissions: { ...DEFAULT_CASHIER_PERMISSIONS } })}
                      className="px-2 py-1 rounded bg-stone-100 hover:bg-stone-200 font-bold text-stone-700"
                    >
                      Cajero Estándar
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, permissions: { ...DEFAULT_ADMIN_PERMISSIONS } })}
                      className="px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 font-bold text-amber-900"
                    >
                      Total
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[
                    { key: 'canAccessPos', label: 'POS / Facturación de Caja', desc: 'Pantalla principal de cobro', icon: ShoppingBag },
                    { key: 'canAccessKitchen', label: 'Cocina (KDS)', desc: 'Monitor de comandas y preparación', icon: ChefHat },
                    { key: 'canAccessCash', label: 'Control de Caja', desc: 'Aperturas, arqueos y retiros', icon: DollarSign },
                    { key: 'canAccessSales', label: 'Historial de Ventas', desc: 'Ver facturas emitidas y reimpresión', icon: Receipt },
                    { key: 'canAccessProducts', label: 'Menú & Productos', desc: 'Editar platos, precios e inventario', icon: UtensilsCrossed },
                    { key: 'canAccessCustomers', label: 'Clientes', desc: 'Directorio de clientes y créditos', icon: Users },
                    { key: 'canAccessFiscal', label: 'Comprobantes Hacienda DGT', desc: 'Panel tributario y consecutivos', icon: Shield },
                    { key: 'canAccessReports', label: 'Reportes & Métricas', desc: 'Ver reportes gerenciales generales', icon: BarChart3 },
                    { key: 'canApplyDiscounts', label: 'Aplicar Descuentos', desc: 'Otorgar rebajas en el carrito', icon: Percent },
                    { key: 'canCancelOrders', label: 'Anular Órdenes / Comandas', desc: 'Permiso para anular ventas confirmadas', icon: XCircle }
                  ].map(perm => {
                    const isChecked = (formData.permissions as any)[perm.key] ?? false;
                    const Icon = perm.icon;
                    return (
                      <label
                        key={perm.key}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-amber-50/70 border-amber-300 text-stone-900'
                            : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => setFormData({
                            ...formData,
                            permissions: {
                              ...formData.permissions,
                              [perm.key]: e.target.checked
                            }
                          })}
                          className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 mt-0.5"
                        />
                        <div className="space-y-0.5">
                          <div className="font-bold text-xs flex items-center gap-1.5">
                            <Icon className={`w-3.5 h-3.5 ${isChecked ? 'text-amber-700' : 'text-stone-400'}`} />
                            <span>{perm.label}</span>
                          </div>
                          <div className="text-[10px] text-stone-500">
                            {perm.desc}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Form Buttons */}
              <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold shadow-sm transition-all"
                >
                  {editingUser ? 'Guardar Cambios' : 'Crear Cajero'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: QUICK PIN CHANGE */}
      {pinChangeUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-stone-200 p-5 space-y-4">
            <div className="flex items-center gap-3 border-b border-stone-100 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-stone-900">Cambiar Contraseña / PIN</h3>
                <p className="text-[11px] text-stone-500">
                  Para: <strong>{pinChangeUser.name}</strong>
                </p>
              </div>
            </div>

            {pinError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{pinError}</span>
              </div>
            )}

            <form onSubmit={handleSaveQuickPin} className="space-y-4">
              <div className="space-y-1 text-center">
                <label className="text-xs font-bold text-stone-700 block">
                  Ingrese el Nuevo PIN (4 dígitos numéricos):
                </label>
                <input
                  type="password"
                  maxLength={4}
                  autoFocus
                  required
                  placeholder="••••"
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-300 rounded-2xl text-2xl font-black text-center tracking-widest text-stone-900 focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[10px] text-stone-400">
                  El cajero usará esta clave para ingresar en la pantalla de inicio.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => {
                    setPinChangeUser(null);
                    setNewPinInput('');
                    setPinError('');
                  }}
                  className="px-4 py-2 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-sm"
                >
                  Actualizar PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CASHIER INVOICES BREAKDOWN */}
      {viewInvoicesCashier && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-stone-200 overflow-hidden my-6">
            <div className="p-4 bg-stone-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-extrabold text-sm text-white">
                    Facturas de {viewInvoicesCashier.cashier.name}
                  </h3>
                  <p className="text-[10px] text-stone-400">
                    Período: {periodLabel} • {viewInvoicesCashier.sales.length} órdenes registradas
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewInvoicesCashier(null)}
                className="p-1.5 rounded-full hover:bg-white/10 text-stone-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-100 text-stone-600 uppercase font-black text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Orden / Factura</th>
                    <th className="py-2.5 px-3">Fecha & Hora</th>
                    <th className="py-2.5 px-3">Cliente</th>
                    <th className="py-2.5 px-3">Medio Pago</th>
                    <th className="py-2.5 px-3 text-right">Total (CRC)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {viewInvoicesCashier.sales.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-stone-400">
                        No hay ventas registradas para este cajero en este período.
                      </td>
                    </tr>
                  ) : (
                    viewInvoicesCashier.sales.map(s => {
                      const payMethod = s.payments?.[0]?.method || 'CASH';
                      const payLabels: Record<string, string> = {
                        CASH: 'Efectivo',
                        CARD: 'Tarjeta',
                        SINPE: 'SINPE Móvil',
                        TRANSFER: 'Transferencia'
                      };

                      return (
                        <tr key={s.id} className="hover:bg-stone-50">
                          <td className="py-2 px-3 font-mono font-bold text-stone-900">
                            #{s.orderNumber || s.id.slice(-6)}
                          </td>
                          <td className="py-2 px-3 text-stone-600">
                            {s.date} {s.time || ''}
                          </td>
                          <td className="py-2 px-3 font-medium text-stone-800">
                            {s.customerName || 'Cliente General'}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-1.5 py-0.5 rounded bg-stone-100 text-[10px] font-bold text-stone-700">
                              {payLabels[payMethod] || payMethod}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-black text-stone-900">
                            ₡{(s.total || 0).toLocaleString('es-CR')}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs">
              <span className="text-stone-500 font-bold">
                Total acumulado: ₡{viewInvoicesCashier.sales.reduce((sum, s) => sum + (s.total || 0), 0).toLocaleString('es-CR')}
              </span>
              <button
                onClick={() => setViewInvoicesCashier(null)}
                className="px-4 py-1.5 bg-stone-800 text-white rounded-xl font-bold hover:bg-stone-900"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT VOUCHER MODAL */}
      {printCommissionVoucher && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-stone-200 overflow-hidden space-y-4 p-5 text-stone-900">
            <div className="text-center space-y-1 border-b border-stone-200 pb-3">
              <span className="text-2xl">🍗</span>
              <h3 className="font-black text-sm uppercase">Sabor Cervanteño</h3>
              <p className="text-[10px] text-stone-500">Cervantes de Alvarado, Cartago</p>
              <div className="font-bold text-xs text-amber-800 pt-1">
                COMPROBANTE DE LIQUIDACIÓN DE COMISIÓN
              </div>
            </div>

            <div className="text-xs space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-stone-500">Cajero:</span>
                <span className="font-bold">{printCommissionVoucher.cashier.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Período:</span>
                <span className="font-bold">{printCommissionVoucher.periodLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Fecha de emisión:</span>
                <span>{new Date().toLocaleDateString('es-CR')}</span>
              </div>
              <div className="border-t border-dashed border-stone-300 my-2 pt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Órdenes Facturadas:</span>
                  <span>{printCommissionVoucher.ordersCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ventas Efectivo:</span>
                  <span>₡{printCommissionVoucher.cashSales.toLocaleString('es-CR')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tarjetas / SINPE:</span>
                  <span>₡{printCommissionVoucher.cardSinpeSales.toLocaleString('es-CR')}</span>
                </div>
                <div className="flex justify-between font-bold text-stone-900 pt-1 border-t border-stone-200">
                  <span>VENTAS TOTALES:</span>
                  <span>₡{printCommissionVoucher.totalSales.toLocaleString('es-CR')}</span>
                </div>
                <div className="flex justify-between text-blue-800">
                  <span>% Comisión Aplicada:</span>
                  <span>{printCommissionVoucher.rate}%</span>
                </div>
              </div>
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex justify-between font-black text-sm text-blue-950">
                <span>TOTAL A PAGAR:</span>
                <span>₡{Math.round(printCommissionVoucher.commissionAmount).toLocaleString('es-CR')}</span>
              </div>
            </div>

            <div className="pt-6 grid grid-cols-2 gap-4 text-center text-[10px] text-stone-400">
              <div className="border-t border-stone-400 pt-1">
                Firma Cajero
              </div>
              <div className="border-t border-stone-400 pt-1">
                Firma Administrador
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
              <button
                onClick={() => setPrintCommissionVoucher(null)}
                className="flex-1 py-2 rounded-xl border border-stone-300 text-stone-700 text-xs font-bold"
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  window.print();
                }}
                className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMACIÓN DE SINCRONIZACIÓN MAESTRA */}
      {showMasterSyncConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-700 shrink-0 shadow-inner">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div>
                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-mono text-[10px] font-black uppercase tracking-wider">
                  Mando Absoluto del Administrador
                </span>
                <h3 className="text-lg font-black text-stone-900 mt-0.5">
                  ¿Ejecutar Sincronización Maestra?
                </h3>
              </div>
            </div>

            <div className="text-xs text-stone-600 space-y-2.5 leading-relaxed bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200/80">
              <p className="font-bold text-amber-950">
                Al presionar este botón, los datos actuales del Administrador tendrán prioridad 100% sobre cualquier estado anterior:
              </p>
              <ul className="space-y-1.5 list-disc pl-4 text-stone-700">
                <li>
                  <strong className="text-stone-900">Guardar en todos lados:</strong> Todos los platillos, categorías y configuraciones activas se consolidan de inmediato en el disco del servidor y en Firestore.
                </li>
                <li>
                  <strong className="text-stone-900">Borrar de todos lados:</strong> Los platillos o categorías que hayan sido borrados se purgarán físicamente de la nube para que jamás vuelvan a resucitar o duplicarse.
                </li>
                <li>
                  <strong className="text-stone-900">Respaldo Automático:</strong> Se generará una copia de seguridad fechada antes de aplicar los cambios.
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowMasterSyncConfirm(false)}
                disabled={isMasterSyncing}
                className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 text-xs font-bold hover:bg-stone-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteMasterSync}
                disabled={isMasterSyncing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-black shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {isMasterSyncing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span>{isMasterSyncing ? 'Sincronizando...' : 'Sí, Sincronizar Todo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESULTADO DE SINCRONIZACIÓN MAESTRA */}
      {masterSyncResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-black text-stone-900">
                  ¡Sincronización Maestra Exitosa!
                </h3>
                <p className="text-xs text-stone-500">
                  Los datos del Administrador son ahora la autoridad definitiva.
                </p>
              </div>
            </div>

            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 text-xs space-y-2">
              <div className="flex justify-between py-1 border-b border-stone-200">
                <span className="text-stone-600">🍔 Platillos Consolidados:</span>
                <span className="font-black text-stone-900">{masterSyncResultModal.productsPreserved}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-200">
                <span className="text-stone-600">🧹 Platillos Fantasma Purgados:</span>
                <span className="font-black text-amber-700">{masterSyncResultModal.productsPurgedFromCloud}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-200">
                <span className="text-stone-600">📁 Categorías Consolidadas:</span>
                <span className="font-black text-stone-900">{masterSyncResultModal.categoriesPreserved}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-200">
                <span className="text-stone-600">☁️ Estado en la Nube:</span>
                <span className={`font-black px-2 py-0.5 rounded-md ${masterSyncResultModal.cloudSynced ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {masterSyncResultModal.cloudSynced ? 'Sincronizado 100%' : 'Resguardado en Disco Local'}
                </span>
              </div>
              <div className="pt-1 text-[11px] text-stone-500 font-mono">
                Respaldo: {masterSyncResultModal.backupFilename}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setMasterSyncResultModal(null);
                window.location.reload();
              }}
              className="w-full py-3 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-black transition-colors shadow-sm"
            >
              Cerrar y Actualizar Pantalla
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
