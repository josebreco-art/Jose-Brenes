import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Lock, 
  Unlock, 
  Printer, 
  CheckCircle2, 
  AlertCircle,
  Sliders,
  X,
  Building2,
  Receipt,
  UserCheck,
  Clock,
  Coins,
  CreditCard,
  Smartphone,
  RefreshCw,
  Info
} from 'lucide-react';
import { CashRegister, CashMovement, LocationType, Sale, HaciendaDirectConfig } from '../types/pos';
import { PosApiService } from '../services/api';
import { getCostaRicaDate } from '../utils/dateUtils';

interface CashRegisterScreenProps {
  cashRegister: CashRegister | null;
  movements: CashMovement[];
  sales?: Sale[];
  location: LocationType;
  currentUser?: { id: string; name: string; role: string } | null;
  onOpenRegister: (openingBalance: number, cashierName?: string) => Promise<void>;
  onCloseRegister: (countedCash: number, notes?: string) => Promise<void>;
  onAddMovement: (type: 'IN' | 'OUT', amount: number, reason: string) => Promise<void>;
}

interface RestaurantCompanyInfo {
  name?: string;
  commercialName?: string;
  taxId?: string;
  identificationType?: string;
  economicActivity?: string;
  location?: string;
  phone?: string;
  email?: string;
  logoBase64?: string;
}

export const CashRegisterScreen: React.FC<CashRegisterScreenProps> = ({
  cashRegister,
  movements,
  sales = [],
  location,
  currentUser,
  onOpenRegister,
  onCloseRegister,
  onAddMovement
}) => {
  const [cashierNameInput, setCashierNameInput] = useState<string>(currentUser?.name || 'Cajero Principal');
  const [openingInput, setOpeningInput] = useState<number>(50000);
  const [countedInput, setCountedInput] = useState<number>(cashRegister?.expectedCash || 0);
  const [closeNotes, setCloseNotes] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [localRegister, setLocalRegister] = useState<CashRegister | null>(cashRegister);
  const [localMovements, setLocalMovements] = useState<CashMovement[]>(movements);
  const [localSales, setLocalSales] = useState<Sale[]>(sales || []);

  useEffect(() => {
    setLocalRegister(cashRegister);
  }, [cashRegister]);

  useEffect(() => {
    setLocalMovements(movements);
  }, [movements]);

  useEffect(() => {
    if (sales) setLocalSales(sales);
  }, [sales]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [regData, salesData] = await Promise.all([
        PosApiService.getCurrentCashRegister(),
        PosApiService.getSales()
      ]);
      if (regData?.register) {
        setLocalRegister(regData.register);
        setLocalMovements(regData.movements || []);
      }
      if (Array.isArray(salesData)) {
        setLocalSales(salesData);
      }
    } catch (e) {
      console.warn('Error refreshing cash register data:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const activeRegister = localRegister || cashRegister;
  const activeMovements = localMovements && localMovements.length > 0 ? localMovements : movements;
  const activeSales = localSales && localSales.length > 0 ? localSales : sales;

  // Sincronizar el nombre si currentUser cambia
  useEffect(() => {
    if (currentUser?.name && (!cashierNameInput || cashierNameInput === 'Cajero Principal')) {
      setCashierNameInput(currentUser.name);
    }
  }, [currentUser?.name]);
  
  // Movement form modal state
  const [showMovementModal, setShowMovementModal] = useState<boolean>(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('OUT');
  const [movementAmount, setMovementAmount] = useState<number>(0);
  const [movementReason, setMovementReason] = useState<string>('');

  // Print Cierre de Caja Modal state
  const [showClosingPrintModal, setShowClosingPrintModal] = useState<boolean>(false);
  const [paperWidth, setPaperWidth] = useState<'80mm' | '56mm'>('80mm');
  const [companyInfo, setCompanyInfo] = useState<RestaurantCompanyInfo | null>(null);
  const [haciendaConfig, setHaciendaConfig] = useState<HaciendaDirectConfig | null>(null);

  const isOpen = cashRegister?.status === 'OPEN';

  // Sincronizar efectivo esperado con el input de conteo físico cuando cambie
  useEffect(() => {
    if (cashRegister) {
      if (cashRegister.countedCash !== undefined && cashRegister.countedCash !== null) {
        setCountedInput(cashRegister.countedCash);
      } else {
        setCountedInput(cashRegister.expectedCash || 0);
      }
      if (cashRegister.notes) {
        setCloseNotes(cashRegister.notes);
      }
    }
  }, [cashRegister?.expectedCash, cashRegister?.countedCash, cashRegister?.notes]);

  // Cargar información de la empresa emisora para el encabezado oficial del Cierre de Caja
  useEffect(() => {
    PosApiService.getFiscalCompanyInfo()
      .then(info => { if (info) setCompanyInfo(info); })
      .catch(err => console.warn('Error cargando info restaurante para cierre:', err));

    PosApiService.getHaciendaDirectConfig()
      .then(res => { if (res?.config) setHaciendaConfig(res.config); })
      .catch(err => console.warn('Error cargando hacienda config para cierre:', err));
  }, []);

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = (cashierNameInput || '').trim() || (currentUser?.name || 'Cajero Principal');
    await onOpenRegister(openingInput, cleanName);
  };

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCloseRegister(countedInput, closeNotes);
    setShowClosingPrintModal(true);
  };

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (movementAmount <= 0) return;
    await onAddMovement(movementType, movementAmount, movementReason);
    setShowMovementModal(false);
    setMovementAmount(0);
    setMovementReason('');
  };

  // Filtrar ventas de la jornada del día operativo en Costa Rica
  const todayCr = getCostaRicaDate();
  const regDay = activeRegister?.openTime 
    ? getCostaRicaDate(new Date(activeRegister.openTime).getTime()) 
    : todayCr;

  const currentShiftSales = (activeSales || []).filter(s => {
    if (!s) return false;
    const sDateDay = s.timestamp ? getCostaRicaDate(s.timestamp) : (s.date || '');
    // Toda venta cobrada en la fecha operativa del día pertenece a este cierre diario
    return sDateDay === regDay;
  });

  // Conteo de ventas registradas antes de la apertura de este turno
  const shiftOpenDate = activeRegister?.openTime ? new Date(activeRegister.openTime).getTime() : 0;
  const shiftCloseDate = activeRegister?.closeTime ? new Date(activeRegister.closeTime).getTime() : Infinity;
  const previousSalesCount = (activeSales || []).filter(s => {
    const sDate = new Date(s.createdAt || s.timestamp).getTime();
    return shiftOpenDate > 0 && sDate < (shiftOpenDate - 60000);
  }).length;

  // Cálculo detallado de ventas por medio de pago durante la jornada
  let cashTxCount = 0;
  let cashSalesSum = 0;
  let sinpeTxCount = 0;
  let sinpeSalesSum = 0;
  let cardTxCount = 0;
  let cardSalesSum = 0;
  let transferTxCount = 0;
  let transferSalesSum = 0;

  if (currentShiftSales.length > 0) {
    currentShiftSales.forEach(s => {
      const pays = s.payments || [];
      if (pays.length > 0) {
        pays.forEach(p => {
          const amt = Number(p.amount) || 0;
          const method = String(p.method || '').toUpperCase();
          if (method === 'CASH' || method === 'EFECTIVO' || method === '01') {
            cashTxCount += 1;
            cashSalesSum += amt;
          } else if (method === 'SINPE' || method === 'SINPE_MOVIL' || method === '06') {
            sinpeTxCount += 1;
            sinpeSalesSum += amt;
          } else if (method === 'CARD' || method === 'TARJETA' || method === '02') {
            cardTxCount += 1;
            cardSalesSum += amt;
          } else if (method === 'TRANSFER' || method === 'TRANSFERENCIA' || method === '04') {
            transferTxCount += 1;
            transferSalesSum += amt;
          } else {
            cashTxCount += 1;
            cashSalesSum += amt;
          }
        });
      } else {
        // Por defecto si no tiene desglose explícito
        cashTxCount += 1;
        cashSalesSum += (Number(s.total) || 0);
      }
    });
  } else {
    // Fallback a los acumuladores de cashRegister
    cashSalesSum = activeRegister?.cashSales || 0;
    cardSalesSum = activeRegister?.cardSales || 0;
    sinpeSalesSum = activeRegister?.sinpeSales || 0;
    transferSalesSum = activeRegister?.transferSales || 0;
    if (cashSalesSum > 0) cashTxCount = 1;
    if (sinpeSalesSum > 0) sinpeTxCount = 1;
    if (cardSalesSum > 0) cardTxCount = 1;
    if (transferSalesSum > 0) transferTxCount = 1;
  }

  // Si hay discrepancia entre acumulador de caja y conteo por lista, preferir el mayor o sincronizar
  const effectiveCashSales = activeRegister ? Math.max(activeRegister.cashSales || 0, cashSalesSum) : cashSalesSum;
  const effectiveSinpeSales = activeRegister ? Math.max(activeRegister.sinpeSales || 0, sinpeSalesSum) : sinpeSalesSum;
  const effectiveCardSales = activeRegister ? Math.max(activeRegister.cardSales || 0, cardSalesSum) : cardSalesSum;
  const effectiveTransferSales = activeRegister ? Math.max(activeRegister.transferSales || 0, transferSalesSum) : transferSalesSum;

  const totalSalesAmount = effectiveCashSales + effectiveSinpeSales + effectiveCardSales + effectiveTransferSales;
  const totalTransactionsCount = Math.max(
    currentShiftSales.length,
    cashTxCount + sinpeTxCount + cardTxCount + transferTxCount,
    activeRegister?.totalInvoicesCount || 0
  );

  // Filtrar movimientos de la jornada actual estrictamente
  const activeMovementsList = (activeMovements || []).filter(m => {
    if (m.cashRegisterId && activeRegister?.id && m.cashRegisterId === activeRegister.id) return true;
    const mDate = new Date(m.timestamp).getTime();
    return mDate >= shiftOpenDate && (activeRegister?.status !== 'CLOSED' || mDate <= shiftCloseDate + 5000);
  });
  const ingresosList = activeMovementsList.filter(m => m.type === 'IN');
  const retirosList = activeMovementsList.filter(m => m.type === 'OUT');

  const totalIngresos = activeRegister?.cashIn || ingresosList.reduce((acc, m) => acc + m.amount, 0);
  const totalRetiros = activeRegister?.cashOut || retirosList.reduce((acc, m) => acc + m.amount, 0);
  const openingBalance = activeRegister?.openingBalance || 0;

  // Resumen matemático de caja:
  // Fondo Inicial + Ventas Efectivo + Ingresos Extra - Retiros = Efectivo Esperado en Caja
  const expectedCashCalculated = openingBalance + effectiveCashSales + totalIngresos - totalRetiros;
  const effectiveExpectedCash = activeRegister?.expectedCash ?? expectedCashCalculated;

  const effectiveCountedCash = activeRegister?.status === 'CLOSED' 
    ? (activeRegister.countedCash ?? countedInput)
    : countedInput;

  const difference = effectiveCountedCash - effectiveExpectedCash;

  const formatCurrency = (amount: number) => {
    return `₡${(amount || 0).toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return new Date().toLocaleDateString('es-CR');
    return new Date(isoString).toLocaleDateString('es-CR');
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  };

  const restaurantName = haciendaConfig?.emisorCommercialName || 
                         companyInfo?.commercialName || 
                         haciendaConfig?.emisorName || 
                         companyInfo?.name || 
                         'Pollo Frito Sabor Cervanteño';

  const restaurantTaxId = haciendaConfig?.emisorTaxId || companyInfo?.taxId || '3-101-026803';
  const restaurantAddress = haciendaConfig?.emisorAddressDetail || companyInfo?.location || 'Cervantes, Alvarado, Cartago';
  const registerNumber = cashRegister?.id ? (cashRegister.id.length > 8 ? cashRegister.id.slice(-8).toUpperCase() : cashRegister.id.toUpperCase()) : '001';

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-100px)] overflow-y-auto bg-stone-50 p-4 space-y-4">
      
      {/* Top Banner */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-xs ${
            isOpen ? 'bg-emerald-600' : 'bg-stone-700'
          }`}>
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-base sm:text-lg text-stone-900">
                Control y Cierre de Caja
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
                isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
              }`}>
                {isOpen ? 'Caja Abierta' : 'Caja Cerrada'}
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Ubicación: <strong>{location}</strong> • Cajero: <strong>{cashRegister?.cashierName || 'Cajero Principal'}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* BOTÓN ACTUALIZAR DATOS */}
          <button
            type="button"
            id="refresh-cash-btn"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition-all border border-stone-200 cursor-pointer disabled:opacity-50"
            title="Actualizar datos de la caja y ventas"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-stone-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Actualizando...' : 'Actualizar'}</span>
          </button>

          {/* BOTÓN OFICIAL: IMPRIMIR CIERRE (sustituye cualquier corte) */}
          <button
            type="button"
            id="print-closing-btn"
            onClick={() => setShowClosingPrintModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            title="Imprimir Documento Oficial de Cierre de Caja"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span>Imprimir Cierre de Caja</span>
          </button>

          {isOpen && (
            <>
              <button
                type="button"
                id="add-cash-in-btn"
                onClick={() => {
                  setMovementType('IN');
                  setShowMovementModal(true);
                }}
                className="flex items-center gap-1 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Ingreso Extra</span>
              </button>
              <button
                type="button"
                id="add-cash-out-btn"
                onClick={() => {
                  setMovementType('OUT');
                  setShowMovementModal(true);
                }}
                className="flex items-center gap-1 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Retiro de Caja</span>
              </button>
            </>
          )}
        </div>
      </div>

      {!isOpen ? (
        /* OPEN SHIFT CARD */
        <div className="max-w-md mx-auto my-auto bg-white p-6 rounded-2xl border border-stone-200 shadow-lg space-y-4">
          <div className="text-center space-y-1">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
              <Unlock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-stone-900">Apertura de Turno de Caja</h3>
            <p className="text-xs text-stone-500">
              Ingrese el fondo inicial en colones (₡) para comenzar las operaciones de la jornada.
            </p>
          </div>

          <form onSubmit={handleOpen} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-stone-700 block mb-1">
                Nombre del Cajero(a) responsable:
              </label>
              <div className="relative">
                <input
                  id="cashier-name-input"
                  type="text"
                  value={cashierNameInput}
                  onChange={(e) => setCashierNameInput(e.target.value)}
                  className="w-full px-4 py-2.5 pl-10 text-sm font-bold bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  placeholder="Ej: Mario Vargas, Andrea Solano..."
                  required
                />
                <UserCheck className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
              </div>
              <p className="text-[11px] text-stone-400 mt-1">
                Este nombre aparecerá en los tiquetes, facturas DGT v4.4 y el informe de cierre de caja.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-stone-700 block mb-1">
                Monto Base de Apertura (₡ CRC):
              </label>
              <input
                id="opening-balance-input"
                type="number"
                value={openingInput}
                onChange={(e) => setOpeningInput(Number(e.target.value))}
                className="w-full px-4 py-2.5 text-base font-extrabold bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                placeholder="50000"
                min="0"
                required
              />
            </div>

            <button
              id="open-register-btn"
              type="submit"
              className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>Abrir Turno de Caja</span>
            </button>
          </form>

          {activeRegister && activeRegister.status === 'CLOSED' && (
            <div className="pt-4 border-t border-stone-200 flex flex-col items-center gap-2 bg-stone-50 p-3.5 rounded-xl text-center">
              <div className="text-xs text-stone-700 font-semibold">
                <span className="font-extrabold text-stone-900 block mb-0.5">Último Turno Registrado</span>
                {formatDate(activeRegister.closeTime || activeRegister.openTime)} {formatTime(activeRegister.closeTime || activeRegister.openTime)} • Cajero: {activeRegister.cashierName || 'Cajero Principal'}
              </div>
              <div className="text-xs font-black text-amber-800">
                Total Ventas: {formatCurrency((activeRegister.cashSales || 0) + (activeRegister.cardSales || 0) + (activeRegister.sinpeSales || 0) + (activeRegister.transferSales || 0))} ({activeRegister.totalInvoicesCount || 0} transacciones)
              </div>
              <button
                type="button"
                onClick={() => setShowClosingPrintModal(true)}
                className="mt-1 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-xs cursor-pointer transition-all active:scale-98"
              >
                <Printer className="w-3.5 h-3.5 text-amber-400" />
                <span>Ver / Reimprimir Informe de Cierre</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ACTIVE CASH SHIFT DASHBOARD */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Summary Cards */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* KPI Cards Grid: Fondo, Ventas Efectivo, Tarjetas, SINPE y Efectivo Esperado por separado */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="p-3.5 bg-white rounded-2xl border border-stone-200 shadow-xs">
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Fondo Inicial</div>
                <div className="text-base sm:text-lg font-black text-stone-800 mt-0.5">
                  {formatCurrency(openingBalance)}
                </div>
              </div>

              <div className="p-3.5 bg-white rounded-2xl border border-stone-200 shadow-xs">
                <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Ventas Efectivo</div>
                <div className="text-base sm:text-lg font-black text-emerald-700 mt-0.5">
                  {formatCurrency(effectiveCashSales)}
                </div>
              </div>

              <div className="p-3.5 bg-white rounded-2xl border border-stone-200 shadow-xs">
                <div className="text-[10px] font-bold text-teal-600 uppercase tracking-wider">Tarjetas</div>
                <div className="text-base sm:text-lg font-black text-teal-700 mt-0.5">
                  {formatCurrency(effectiveCardSales)}
                </div>
              </div>

              <div className="p-3.5 bg-white rounded-2xl border border-stone-200 shadow-xs">
                <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">SINPE Móvil</div>
                <div className="text-base sm:text-lg font-black text-blue-700 mt-0.5">
                  {formatCurrency(effectiveSinpeSales)}
                </div>
              </div>

              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 shadow-xs col-span-2 sm:col-span-1">
                <div className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">Efectivo Esperado</div>
                <div className="text-base sm:text-lg font-black text-amber-800 mt-0.5">
                  {formatCurrency(effectiveExpectedCash)}
                </div>
              </div>
            </div>

            {/* Shift Context Info Banner */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-amber-50/70 border border-amber-200/70 rounded-2xl text-xs text-amber-950">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Turno activo:</strong> Abierto el {formatDate(activeRegister?.openTime)} a las {formatTime(activeRegister?.openTime)} • Fondo base: <strong>{formatCurrency(openingBalance)}</strong>
                </span>
              </div>
              {previousSalesCount > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-stone-600 bg-white/80 px-2.5 py-1 rounded-lg border border-amber-200/50">
                  <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    Hay {previousSalesCount} venta(s) registradas antes de este turno (en <strong>Ventas & Facturas</strong>).
                  </span>
                </div>
              )}
            </div>

            {/* Sales Breakdown Table */}
            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-sm text-stone-900">
                  Desglose de Ventas por Medio de Pago
                </h3>
                <span className="text-[11px] font-semibold text-stone-500">
                  {totalTransactionsCount} transacciones en total
                </span>
              </div>

              {totalTransactionsCount === 0 && (
                <div className="p-3.5 bg-stone-50 rounded-xl border border-dashed border-stone-200 text-center space-y-1">
                  <p className="text-xs font-bold text-stone-700">
                    Aún no se han cobrado ventas desde que se abrió este turno
                  </p>
                  <p className="text-[11px] text-stone-500 max-w-md mx-auto">
                    La caja está abierta y lista. En cuanto cobre un pedido en la pestaña <strong>POS / Caja</strong>, los ingresos aparecerán aquí desglosados en Efectivo, Tarjeta o SINPE Móvil.
                  </p>
                </div>
              )}
              <div className="divide-y divide-stone-100 text-xs">
                <div className="py-2 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Coins className="w-3.5 h-3.5 text-stone-500" />
                    <span className="text-stone-700 font-medium">EFECTIVO:</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-stone-900 mr-2">
                      {formatCurrency(effectiveCashSales)}
                    </span>
                    <span className="text-[10px] text-stone-400 font-semibold">({cashTxCount} ventas)</span>
                  </div>
                </div>

                <div className="py-2 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-stone-700 font-medium">SINPE MÓVIL:</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-stone-900 mr-2">
                      {formatCurrency(effectiveSinpeSales)}
                    </span>
                    <span className="text-[10px] text-stone-400 font-semibold">({sinpeTxCount} ventas)</span>
                  </div>
                </div>

                <div className="py-2 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-stone-700 font-medium">TARJETA:</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-stone-900 mr-2">
                      {formatCurrency(effectiveCardSales)}
                    </span>
                    <span className="text-[10px] text-stone-400 font-semibold">({cardTxCount} ventas)</span>
                  </div>
                </div>

                {effectiveTransferSales > 0 && (
                  <div className="py-2 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-3.5 h-3.5 text-purple-500" />
                      <span className="text-stone-700 font-medium">TRANSFERENCIA:</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-stone-900 mr-2">
                        {formatCurrency(effectiveTransferSales)}
                      </span>
                      <span className="text-[10px] text-stone-400 font-semibold">({transferTxCount} ventas)</span>
                    </div>
                  </div>
                )}

                <div className="py-2.5 flex justify-between items-center font-extrabold text-stone-900 border-t border-stone-200">
                  <span className="uppercase tracking-wide text-xs">TOTAL GENERAL DE VENTAS:</span>
                  <div className="text-right">
                    <span className="text-amber-700 text-sm font-black mr-2">
                      {formatCurrency(totalSalesAmount)}
                    </span>
                    <span className="text-[10px] text-stone-500 font-bold">({totalTransactionsCount} transacciones)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Movements List */}
            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-sm text-stone-900">
                  Movimientos Registrados (Ingresos y Retiros de Caja)
                </h3>
                <span className="text-[11px] font-semibold text-stone-500">
                  {movements.length} movimientos
                </span>
              </div>

              {movements.length === 0 ? (
                <div className="text-center py-6 text-stone-400 text-xs font-medium">
                  No se han registrado ingresos ni retiros adicionales durante esta jornada.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {movements.map(m => (
                    <div key={m.id} className="flex items-center justify-between p-2 rounded-xl bg-stone-50 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-white ${
                          m.type === 'IN' ? 'bg-emerald-600' : 'bg-rose-600'
                        }`}>
                          {m.type === 'IN' ? '+' : '-'}
                        </span>
                        <div>
                          <div className="font-bold text-stone-900">{m.reason}</div>
                          <div className="text-[10px] text-stone-400">
                            {formatTime(m.timestamp)} • Por: {m.cashierName || 'Cajero'}
                          </div>
                        </div>
                      </div>
                      <div className={`font-black ${m.type === 'IN' ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {m.type === 'IN' ? '+' : '-'}{formatCurrency(m.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Close Shift Panel */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
                <Lock className="w-5 h-5 text-amber-600" />
                <h3 className="font-extrabold text-base text-stone-900">Arqueo y Cierre de Caja</h3>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700 block">
                  Efectivo Contado Físico en Gaveta (₡):
                </label>
                <input
                  id="cash-counted-input"
                  type="number"
                  value={countedInput === 0 ? '' : countedInput}
                  placeholder="0"
                  onChange={(e) => setCountedInput(Number(e.target.value))}
                  className="w-full px-3 py-2 font-black text-lg bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Difference card */}
              <div className={`p-3 rounded-xl border text-xs space-y-1 ${
                difference === 0 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                  : difference > 0 
                  ? 'bg-blue-50 border-blue-200 text-blue-900' 
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                <div className="flex justify-between font-medium">
                  <span>Efectivo Esperado en Caja:</span>
                  <span className="font-bold">{formatCurrency(effectiveExpectedCash)}</span>
                </div>
                <div className="flex justify-between font-black text-sm pt-1 border-t border-current/20">
                  <span>Diferencia:</span>
                  <span>
                    {difference > 0 ? `+${formatCurrency(difference)} (Sobrante)` : 
                     difference < 0 ? `-${formatCurrency(Math.abs(difference))} (Faltante)` : 
                     'Cuadre Exacto (₡0)'}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700 block">
                  Observaciones de Cierre:
                </label>
                <textarea
                  id="closing-notes-input"
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder="Notas sobre el turno, incidencias, entregas o justificaciones..."
                  rows={2}
                  className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <button
              id="confirm-shift-close-btn"
              onClick={handleClose}
              className="w-full py-3 bg-stone-900 hover:bg-stone-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <Lock className="w-4 h-4 text-amber-400" />
              <span>Realizar Cierre de Caja</span>
            </button>
          </div>
        </div>
      )}

      {/* Cash Movement Modal */}
      {showMovementModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <h3 className="font-extrabold text-base text-stone-900">
              {movementType === 'IN' ? 'Ingreso de Efectivo Extra' : 'Retiro de Efectivo de Caja'}
            </h3>

            <form onSubmit={handleSaveMovement} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">Monto (₡):</label>
                <input
                  id="movement-amount-input"
                  type="number"
                  value={movementAmount || ''}
                  onChange={(e) => setMovementAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-bold bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  placeholder="0"
                  min="1"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">Concepto / Motivo:</label>
                <input
                  id="movement-reason-input"
                  type="text"
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  placeholder="Ej: Pago a proveedor de gas, compra de hielo, cambio..."
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  id="cancel-movement-modal-btn"
                  onClick={() => setShowMovementModal(false)}
                  className="px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="save-movement-btn"
                  className="px-4 py-1.5 text-xs font-extrabold bg-amber-600 hover:bg-amber-500 text-white rounded-xl shadow-md cursor-pointer"
                >
                  Guardar Movimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL Y VISTA OFICIAL DE IMPRESIÓN: "CIERRE DE CAJA" (8 SECCIONES COMPLETAS) */}
      {/* ========================================================================= */}
      {showClosingPrintModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-stone-800 rounded-2xl max-w-xl w-full p-4 sm:p-5 shadow-2xl space-y-4 my-auto">
            
            {/* Modal Controls Header */}
            <div className="flex flex-wrap items-center justify-between text-white border-b border-stone-700 pb-3 gap-2 no-print">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Documento Oficial: CIERRE DE CAJA
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {/* Paper Width Selector */}
                <div className="flex bg-stone-900 p-1 rounded-lg text-xs items-center gap-1 border border-stone-700">
                  <span className="text-[10px] text-stone-400 font-semibold px-1">Papel:</span>
                  <button
                    type="button"
                    onClick={() => setPaperWidth('80mm')}
                    className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                      paperWidth === '80mm' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-stone-300 hover:text-white'
                    }`}
                  >
                    80 mm
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaperWidth('56mm')}
                    className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                      paperWidth === '56mm' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-stone-300 hover:text-white'
                    }`}
                  >
                    56 mm
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowClosingPrintModal(false)}
                  className="p-1.5 text-stone-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Thermal Receipt Container */}
            <div className="flex justify-center bg-stone-900/50 p-2 sm:p-4 rounded-xl max-h-[70vh] overflow-y-auto">
              <div
                id="printable-cash-closing"
                className={`bg-white text-black font-sans shadow-md ${
                  paperWidth === '56mm' ? 'paper-56mm max-w-[48mm] text-[11px] p-2' : 'paper-80mm max-w-[72mm] text-[13px] p-3'
                }`}
                style={{ fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif', width: paperWidth === '56mm' ? '48mm' : '72mm', maxWidth: paperWidth === '56mm' ? '48mm' : '72mm' }}
              >
                {/* ========================================== */}
                {/* 1. ENCABEZADO                              */}
                {/* ========================================== */}
                <div className="text-center space-y-1 border-b border-dashed border-black pb-2 mb-2">
                  <div className="font-black text-sm uppercase tracking-wider">
                    {restaurantName}
                  </div>
                  <div className="text-[10.5px] font-bold">Cédula: {restaurantTaxId}</div>
                  <div className="text-[10px] leading-tight font-medium">{restaurantAddress}</div>
                  
                  <div className="my-1.5 py-1 bg-black text-white font-black text-center text-xs tracking-widest uppercase">
                    *** CIERRE DE CAJA ***
                  </div>

                  <div className="text-left text-[10px] space-y-0.5 pt-1">
                    <div className="flex justify-between">
                      <span>TERMINAL / CAJA:</span>
                      <span className="font-bold">{location} - Caja 01</span>
                    </div>
                    <div className="flex justify-between">
                      <span>N° DE CIERRE:</span>
                      <span className="font-bold">#CC-{registerNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>FECHA:</span>
                      <span className="font-bold">{formatDate(cashRegister?.openTime)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>HORA DE APERTURA:</span>
                      <span className="font-bold">{formatTime(cashRegister?.openTime)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>HORA DE CIERRE:</span>
                      <span className="font-bold">
                        {cashRegister?.closeTime ? formatTime(cashRegister.closeTime) : (isOpen ? 'En Curso (Arqueo Actual)' : formatTime(new Date().toISOString()))}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>CAJERO / RESPONSABLE:</span>
                      <span className="font-bold truncate max-w-[140px]">{cashRegister?.cashierName || 'Cajero Principal'}</span>
                    </div>
                  </div>
                </div>

                {/* ========================================== */}
                {/* 2. FONDO DE CAJA                           */}
                {/* ========================================== */}
                <div className="border-b border-dashed border-black pb-2 mb-2">
                  <div className="font-black text-center text-[10.5px] uppercase mb-1 bg-stone-100 py-0.5 border border-black">
                    [ 1. FONDO DE CAJA ]
                  </div>
                  <div className="flex justify-between">
                    <span>Fondo Inicial:</span>
                    <span className="font-bold">{formatCurrency(openingBalance)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-black">
                    <span>Ajustes de Fondo Registrados:</span>
                    <span>{formatCurrency(0)}</span>
                  </div>
                </div>

                {/* ========================================== */}
                {/* 3. VENTAS AGRUPADAS POR MEDIO DE PAGO      */}
                {/* ========================================== */}
                <div className="border-b border-dashed border-black pb-2 mb-2">
                  <div className="font-black text-center text-[10.5px] uppercase mb-1 bg-stone-100 py-0.5">
                    [ 2. VENTAS DEL PERÍODO ]
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>EFECTIVO ({cashTxCount} trans.):</span>
                      <span className="font-bold">{formatCurrency(effectiveCashSales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SINPE MÓVIL ({sinpeTxCount} trans.):</span>
                      <span className="font-bold">{formatCurrency(effectiveSinpeSales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>TARJETA ({cardTxCount} trans.):</span>
                      <span className="font-bold">{formatCurrency(effectiveCardSales)}</span>
                    </div>
                    {effectiveTransferSales > 0 && (
                      <div className="flex justify-between">
                        <span>TRANSFERENCIA ({transferTxCount} trans.):</span>
                        <span className="font-bold">{formatCurrency(effectiveTransferSales)}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-dotted border-black mt-1.5 pt-1 flex justify-between font-black">
                    <span>TOTAL GENERAL DE VENTAS:</span>
                    <span>{formatCurrency(totalSalesAmount)}</span>
                  </div>
                  <div className="text-[9.5px] text-right font-semibold">
                    ({totalTransactionsCount} transacciones en total)
                  </div>
                </div>

                {/* ========================================== */}
                {/* 4. INGRESOS ADICIONALES                    */}
                {/* ========================================== */}
                <div className="border-b border-dashed border-black pb-2 mb-2">
                  <div className="font-black text-center text-[10.5px] uppercase mb-1 bg-stone-100 py-0.5">
                    [ 3. INGRESOS ADICIONALES ]
                  </div>

                  {ingresosList.length === 0 ? (
                    <div className="text-[10px] text-black text-center py-0.5 font-medium">
                      Sin ingresos adicionales registrados
                    </div>
                  ) : (
                    <div className="space-y-1 mb-1">
                      {ingresosList.map((ing, idx) => (
                        <div key={ing.id || idx} className="flex justify-between text-[10px] text-black">
                          <span className="truncate max-w-[150px]">
                            • {ing.reason} ({formatTime(ing.timestamp)})
                          </span>
                          <span className="font-bold">+{formatCurrency(ing.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-dotted border-black mt-1 pt-1 flex justify-between font-bold text-black">
                    <span>TOTAL DE INGRESOS:</span>
                    <span>+{formatCurrency(totalIngresos)}</span>
                  </div>
                </div>

                {/* ========================================== */}
                {/* 5. RETIROS DE CAJA                         */}
                {/* ========================================== */}
                <div className="border-b border-dashed border-black pb-2 mb-2">
                  <div className="font-black text-center text-[10.5px] uppercase mb-1 bg-stone-100 py-0.5 border border-black">
                    [ 4. RETIROS DE CAJA ]
                  </div>

                  {retirosList.length === 0 ? (
                    <div className="text-[10px] text-black text-center py-0.5 font-medium">
                      Sin retiros registrados
                    </div>
                  ) : (
                    <div className="space-y-1 mb-1">
                      {retirosList.map((ret, idx) => (
                        <div key={ret.id || idx} className="flex justify-between text-[10px] text-black">
                          <span className="truncate max-w-[150px]">
                            • {ret.reason} ({formatTime(ret.timestamp)}) [{ret.cashierName || 'Cajero'}]
                          </span>
                          <span className="font-bold">-{formatCurrency(ret.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-dotted border-black mt-1 pt-1 flex justify-between font-bold text-black">
                    <span>TOTAL DE RETIROS:</span>
                    <span>-{formatCurrency(totalRetiros)}</span>
                  </div>
                </div>

                {/* ========================================== */}
                {/* 6. RESUMEN FINAL DE CAJA                   */}
                {/* ========================================== */}
                <div className="border-b border-dashed border-black pb-2 mb-2">
                  <div className="font-black text-center text-[10.5px] uppercase mb-1 bg-stone-100 py-0.5 border border-black">
                    [ 5. RESUMEN FINAL DE CAJA ]
                  </div>
                  
                  <div className="space-y-0.5 text-[10.5px] text-black">
                    <div className="flex justify-between">
                      <span>(+) Fondo Inicial:</span>
                      <span className="font-bold">{formatCurrency(openingBalance)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>(+) Ventas en Efectivo:</span>
                      <span className="font-bold">{formatCurrency(effectiveCashSales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>(+) Ingresos Extra:</span>
                      <span className="font-bold">{formatCurrency(totalIngresos)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>(-) Retiros de Caja:</span>
                      <span className="font-bold">{formatCurrency(totalRetiros)}</span>
                    </div>
                  </div>

                  <div className="border-t-2 border-black mt-1.5 pt-1 flex justify-between font-black text-xs text-black">
                    <span>(=) EFECTIVO ESPERADO EN CAJA:</span>
                    <span>{formatCurrency(effectiveExpectedCash)}</span>
                  </div>

                  {/* Detalle informativo por separado (SINPE / Tarjeta) */}
                  <div className="mt-2 pt-1 border-t border-dotted border-black text-[9.5px] space-y-0.5 text-black">
                    <div className="font-black text-[10px]">VENTAS ELECTRÓNICAS (NO SUMAN EN GAVETA):</div>
                    <div className="flex justify-between">
                      <span>Ventas SINPE Móvil:</span>
                      <span className="font-bold">{formatCurrency(effectiveSinpeSales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ventas TARJETA:</span>
                      <span className="font-bold">{formatCurrency(effectiveCardSales)}</span>
                    </div>
                  </div>
                </div>

                {/* ========================================== */}
                {/* 7. CONTROL DEL EFECTIVO FÍSICO (ARQUEO)   */}
                {/* ========================================== */}
                <div className="border-b border-dashed border-black pb-2 mb-2">
                  <div className="font-black text-center text-[10.5px] uppercase mb-1 bg-stone-100 py-0.5 border border-black">
                    [ 6. CONTROL DEL EFECTIVO FÍSICO ]
                  </div>

                  <div className="space-y-1 text-[10.5px] text-black">
                    <div className="flex justify-between">
                      <span>Efectivo Esperado:</span>
                      <span className="font-bold">{formatCurrency(effectiveExpectedCash)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Efectivo Contado:</span>
                      <span className="font-black text-xs">{formatCurrency(effectiveCountedCash)}</span>
                    </div>
                    
                    <div className="flex justify-between font-black pt-1 border-t border-dotted border-black">
                      <span>DIFERENCIA:</span>
                      <span>
                        {difference > 0 ? `+${formatCurrency(difference)} (SOBRANTE)` : 
                         difference < 0 ? `-${formatCurrency(Math.abs(difference))} (FALTANTE)` : 
                         '₡0 (CUADRE EXACTO)'}
                      </span>
                    </div>
                  </div>

                  {closeNotes && (
                    <div className="mt-2 p-1.5 bg-stone-100 border border-black text-[9.5px] text-black font-medium">
                      <strong>Observaciones:</strong> {closeNotes}
                    </div>
                  )}
                </div>

                {/* ========================================== */}
                {/* 7. IDENTIFICACIÓN DEL DOCUMENTO Y FIRMA   */}
                {/* ========================================== */}
                <div className="text-center pt-2 space-y-4 text-black">
                  <div className="text-[10px] text-black font-bold">
                    Comprobante generado el {new Date().toLocaleDateString('es-CR')} a las {new Date().toLocaleTimeString('es-CR')}
                  </div>

                  <div className="pt-6 border-t border-black max-w-[200px] mx-auto text-center">
                    <div className="text-[10px] font-black uppercase text-black">
                      {cashRegister?.cashierName || 'Cajero Responsable'}
                    </div>
                    <div className="text-[9px] text-black font-bold">
                      Firma del Responsable / Cajero
                    </div>
                  </div>

                  <div className="text-[10px] font-black tracking-widest uppercase text-black pt-1">
                    *** CIERRE DE CAJA FINALIZADO ***
                  </div>
                </div>

              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-stone-700 gap-2 no-print">
              <div className="text-xs text-stone-400 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>Formato térmico: <strong>{paperWidth}</strong></span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  id="close-print-modal-btn"
                  onClick={() => setShowClosingPrintModal(false)}
                  className="px-4 py-2 bg-stone-700 hover:bg-stone-600 text-stone-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  id="trigger-print-closing-btn"
                  type="button"
                  onClick={() => window.print()}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold rounded-xl shadow-md flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Cierre de Caja ({paperWidth})</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
