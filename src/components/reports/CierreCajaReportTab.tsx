import React, { useState, useMemo, useEffect } from 'react';
import { 
  DollarSign, 
  Printer, 
  Download, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Coins, 
  CreditCard, 
  Smartphone, 
  UserCheck, 
  Store,
  FileText
} from 'lucide-react';
import { Sale, CashRegister, CashMovement, UserProfile } from '../../types/pos';
import { PosApiService } from '../../services/api';
import { getCostaRicaDate } from '../../utils/dateUtils';

interface CierreCajaReportTabProps {
  sales: Sale[];
  cashRegister?: CashRegister | null;
  movements?: CashMovement[];
  currentUser?: UserProfile | null;
}

export const CierreCajaReportTab: React.FC<CierreCajaReportTabProps> = ({
  sales = [],
  cashRegister = null,
  movements = [],
  currentUser
}) => {
  const [corteType, setCorteType] = useState<'CORTE_X' | 'CORTE_Z'>('CORTE_X');
  const [paperWidth, setPaperWidth] = useState<'80mm' | '56mm'>('80mm');
  const [companyInfo, setCompanyInfo] = useState<any>(null);

  useEffect(() => {
    PosApiService.getFiscalCompanyInfo()
      .then(info => { if (info) setCompanyInfo(info); })
      .catch(err => console.warn('Error al cargar datos de empresa para corte:', err));
  }, []);

  // Determinar el rango del turno
  const shiftOpenDate = cashRegister?.openTime ? new Date(cashRegister.openTime).getTime() : 0;
  const shiftCloseDate = cashRegister?.closeTime ? new Date(cashRegister.closeTime).getTime() : Infinity;

  // Filtrar ventas del turno
  const shiftSales = useMemo(() => {
    const todayCr = getCostaRicaDate();
    return (sales || []).filter(s => {
      if (!s) return false;
      const sDate = new Date(s.createdAt || s.timestamp).getTime();
      if (shiftOpenDate === 0) {
        const saleCrDate = s.timestamp ? getCostaRicaDate(s.timestamp) : (s.date || '');
        return saleCrDate === todayCr;
      }
      return sDate >= shiftOpenDate && (cashRegister?.status !== 'CLOSED' || sDate <= shiftCloseDate + 5000);
    });
  }, [sales, shiftOpenDate, shiftCloseDate, cashRegister?.status]);

  // Cálculos de medios de pago en el turno
  const financialSummary = useMemo(() => {
    let cashSales = 0;
    let cardSales = 0;
    let sinpeSales = 0;
    let transferSales = 0;
    let totalTax = 0;

    shiftSales.forEach(s => {
      totalTax += Number(s.taxTotal) || 0;
      (s.payments || []).forEach(p => {
        const amt = Number(p.amount) || 0;
        if (p.method === 'CASH') cashSales += amt;
        else if (p.method === 'CARD') cardSales += amt;
        else if (p.method === 'SINPE') sinpeSales += amt;
        else if (p.method === 'TRANSFER') transferSales += amt;
        else cashSales += amt;
      });
    });

    const openingBalance = cashRegister?.openingBalance || 0;
    
    // Entradas y salidas de caja
    let cashIn = 0;
    let cashOut = 0;

    (movements || []).forEach(m => {
      const amt = Number(m.amount) || 0;
      if (m.type === 'IN') cashIn += amt;
      if (m.type === 'OUT') cashOut += amt;
    });

    const totalSalesAmount = cashSales + cardSales + sinpeSales + transferSales;
    const expectedCash = openingBalance + cashSales + cashIn - cashOut;
    const countedCash = cashRegister?.countedCash !== undefined ? cashRegister.countedCash : expectedCash;
    const difference = cashRegister?.difference !== undefined ? cashRegister.difference : (countedCash - expectedCash);

    return {
      openingBalance,
      cashSales,
      cardSales,
      sinpeSales,
      transferSales,
      totalSalesAmount,
      cashIn,
      cashOut,
      expectedCash,
      countedCash,
      difference,
      totalTax,
      ordersCount: shiftSales.length
    };
  }, [shiftSales, cashRegister, movements]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const headers = ['Concepto', 'Monto (CRC)', 'Detalle'];
    const rows = [
      ['Tipo de Corte', corteType === 'CORTE_X' ? 'Corte X (Parcial / En Vivo)' : 'Corte Z (Cierre de Turno / Dia)', ''],
      ['Cajero / Responsable', cashRegister?.cashierName || currentUser?.name || 'Cajero Principal', ''],
      ['Estado de Caja', cashRegister?.status === 'OPEN' ? 'ABIERTA' : 'CERRADA', ''],
      ['Fecha y Hora Apertura', cashRegister?.openTime ? new Date(cashRegister.openTime).toLocaleString('es-CR') : 'N/A', ''],
      ['Fecha y Hora Cierre', cashRegister?.closeTime ? new Date(cashRegister.closeTime).toLocaleString('es-CR') : (corteType === 'CORTE_X' ? 'En Operación (En vivo)' : 'N/A'), ''],
      ['Fondo Inicial (Apertura)', financialSummary.openingBalance.toFixed(2), 'Efectivo inicial'],
      ['Ventas en Efectivo', financialSummary.cashSales.toFixed(2), 'Cobros en efectivo'],
      ['Ventas con Tarjeta (Datafono)', financialSummary.cardSales.toFixed(2), 'Vouchers'],
      ['Ventas SINPE Movil', financialSummary.sinpeSales.toFixed(2), 'Transferencias SINPE'],
      ['Ventas por Transferencia Bancaria', financialSummary.transferSales.toFixed(2), 'Cuentas bancarias'],
      ['Total Ventas Registradas', financialSummary.totalSalesAmount.toFixed(2), `${financialSummary.ordersCount} transacciones`],
      ['Total IVA Cobrado (13%)', financialSummary.totalTax.toFixed(2), 'Impuesto D-104'],
      ['Ingresos / Entradas Extra', financialSummary.cashIn.toFixed(2), 'Aportes a caja'],
      ['Retiros / Salidas de Dinero', financialSummary.cashOut.toFixed(2), 'Gastos o pagos caja chica'],
      ['Efectivo Teorico Esperado', financialSummary.expectedCash.toFixed(2), 'Saldo calculado'],
      ['Efectivo Real Contado', financialSummary.countedCash.toFixed(2), 'Arqueo fisico'],
      ['Diferencia de Caja', financialSummary.difference.toFixed(2), financialSummary.difference === 0 ? 'Cuadrada' : financialSummary.difference > 0 ? 'Sobrante' : 'Faltante']
    ];

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Cierre_${corteType}_${getCostaRicaDate()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isSquare = financialSummary.difference === 0;
  const isSurplus = financialSummary.difference > 0;

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-stone-900 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-600" />
            <span>Cierre de Caja • Corte X & Corte Z</span>
          </h3>
          <p className="text-xs text-stone-500">
            Control de arqueo, corte parcial en vivo (Corte X) o liquidación definitiva del turno (Corte Z).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Selector X vs Z */}
          <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 text-xs font-bold">
            <button
              onClick={() => setCorteType('CORTE_X')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                corteType === 'CORTE_X' ? 'bg-amber-600 text-white shadow-xs' : 'text-stone-700'
              }`}
            >
              Corte X (En Vivo)
            </button>
            <button
              onClick={() => setCorteType('CORTE_Z')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                corteType === 'CORTE_Z' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-700'
              }`}
            >
              Corte Z (Cierre Final)
            </button>
          </div>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Ticket</span>
          </button>
        </div>
      </div>

      {/* Explicación de Corte X vs Z */}
      <div className="bg-amber-50/70 border border-amber-200/80 p-3 rounded-2xl flex items-center justify-between text-xs text-amber-900">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            {corteType === 'CORTE_X' ? (
              <strong>Corte X (Lectura Parcial):</strong>
            ) : (
              <strong>Corte Z (Cierre Definitivo):</strong>
            )}{' '}
            {corteType === 'CORTE_X'
              ? 'Muestra el estado financiero y arqueo en vivo del turno actual sin bloquear la caja ni reiniciar consecutivos.'
              : 'Liquida y finaliza la jornada diaria o el turno del cajero con balance final de gaveta.'}
          </span>
        </div>
        <div className="text-[11px] font-black uppercase tracking-wider bg-white px-2.5 py-1 rounded-lg border border-amber-200">
          Caja: {cashRegister?.status === 'OPEN' ? '🟢 Abierta' : '🔴 Cerrada'}
        </div>
      </div>

      {/* Main Grid: Dashboard Cards + Thermal Ticket Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Financial breakdown cards (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Key Metric Blocks */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                Fondo Inicial (Apertura)
              </span>
              <div className="text-lg font-black text-stone-800 mt-1">
                ₡{financialSummary.openingBalance.toLocaleString('es-CR')}
              </div>
              <span className="text-[10px] text-stone-400">Base entregada al abrir</span>
            </div>

            <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                Ventas Efectivo
              </span>
              <div className="text-lg font-black text-emerald-950 mt-1">
                ₡{financialSummary.cashSales.toLocaleString('es-CR')}
              </div>
              <span className="text-[10px] text-emerald-700">Entrada a gaveta</span>
            </div>

            <div className="bg-blue-50 p-3.5 rounded-2xl border border-blue-200 shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-800">
                Total Ventas Registradas
              </span>
              <div className="text-lg font-black text-blue-950 mt-1">
                ₡{financialSummary.totalSalesAmount.toLocaleString('es-CR')}
              </div>
              <span className="text-[10px] text-blue-700">{financialSummary.ordersCount} órdenes</span>
            </div>
          </div>

          {/* Arqueo de Caja (Efectivo Esperado vs Real) */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-3">
            <h4 className="font-black text-xs text-stone-900 flex items-center justify-between">
              <span>Balance de Gaveta y Arqueo Físico</span>
              <span className="font-mono text-stone-500">Moneda: CRC (₡)</span>
            </h4>

            <div className="divide-y divide-stone-100 text-xs">
              <div className="py-2 flex justify-between items-center text-stone-700">
                <span>(+) Fondo Inicial de Caja:</span>
                <span className="font-mono font-bold">₡{financialSummary.openingBalance.toLocaleString('es-CR')}</span>
              </div>
              <div className="py-2 flex justify-between items-center text-stone-700">
                <span>(+) Ventas Cobradas en Efectivo:</span>
                <span className="font-mono font-bold text-emerald-700">+₡{financialSummary.cashSales.toLocaleString('es-CR')}</span>
              </div>
              <div className="py-2 flex justify-between items-center text-stone-700">
                <span>(+) Entradas de Efectivo (Aportes):</span>
                <span className="font-mono font-bold text-blue-700">+₡{financialSummary.cashIn.toLocaleString('es-CR')}</span>
              </div>
              <div className="py-2 flex justify-between items-center text-stone-700">
                <span>(-) Retiros / Salidas de Caja Chica:</span>
                <span className="font-mono font-bold text-rose-700">-₡{financialSummary.cashOut.toLocaleString('es-CR')}</span>
              </div>
              <div className="py-2.5 flex justify-between items-center font-black bg-stone-50 px-3 rounded-xl text-stone-900 border border-stone-200">
                <span>(=) Efectivo Teórico Esperado:</span>
                <span className="font-mono text-sm text-stone-950">₡{financialSummary.expectedCash.toLocaleString('es-CR')}</span>
              </div>
              <div className="py-2.5 flex justify-between items-center font-bold px-3 text-stone-800">
                <span>Efectivo Real Contado Físicamente:</span>
                <span className="font-mono text-sm text-stone-950">₡{financialSummary.countedCash.toLocaleString('es-CR')}</span>
              </div>
              <div className={`py-2.5 flex justify-between items-center font-black px-3 rounded-xl border ${
                isSquare 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                  : isSurplus 
                    ? 'bg-blue-50 border-blue-200 text-blue-900' 
                    : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                <span className="flex items-center gap-1.5">
                  {isSquare ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4" />}
                  <span>Diferencia de Caja:</span>
                </span>
                <span className="font-mono text-sm">
                  {isSquare ? '₡0 (CUADRADA)' : `${isSurplus ? '+₡' : '-₡'}${Math.abs(financialSummary.difference).toLocaleString('es-CR')} (${isSurplus ? 'SOBRANTE' : 'FALTANTE'})`}
                </span>
              </div>
            </div>
          </div>

          {/* Desglose por Medio de Pago en el Turno */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
            <h4 className="font-black text-xs text-stone-900 mb-3">
              Desglose de Liquidación por Canal
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-100 text-center">
                <span className="text-[10px] text-stone-500 font-bold block">Efectivo</span>
                <span className="text-xs font-black text-stone-900 font-mono mt-0.5 block">
                  ₡{financialSummary.cashSales.toLocaleString('es-CR')}
                </span>
              </div>
              <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-100 text-center">
                <span className="text-[10px] text-stone-500 font-bold block">Tarjeta / Datáfono</span>
                <span className="text-xs font-black text-stone-900 font-mono mt-0.5 block">
                  ₡{financialSummary.cardSales.toLocaleString('es-CR')}
                </span>
              </div>
              <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-100 text-center">
                <span className="text-[10px] text-stone-500 font-bold block">SINPE Móvil</span>
                <span className="text-xs font-black text-stone-900 font-mono mt-0.5 block">
                  ₡{financialSummary.sinpeSales.toLocaleString('es-CR')}
                </span>
              </div>
              <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-100 text-center">
                <span className="text-[10px] text-stone-500 font-bold block">Transferencia</span>
                <span className="text-xs font-black text-stone-900 font-mono mt-0.5 block">
                  ₡{financialSummary.transferSales.toLocaleString('es-CR')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Thermal Ticket View (1 col) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-stone-800 flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5 text-stone-600" />
              <span>Vista de Ticket Térmico</span>
            </span>

            {/* Selector de ancho */}
            <div className="flex bg-stone-100 p-0.5 rounded-lg text-[10px] font-bold">
              <button
                onClick={() => setPaperWidth('80mm')}
                className={`px-2 py-0.5 rounded ${paperWidth === '80mm' ? 'bg-white shadow-xs text-stone-900' : 'text-stone-500'}`}
              >
                80mm
              </button>
              <button
                onClick={() => setPaperWidth('56mm')}
                className={`px-2 py-0.5 rounded ${paperWidth === '56mm' ? 'bg-white shadow-xs text-stone-900' : 'text-stone-500'}`}
              >
                56mm
              </button>
            </div>
          </div>

          {/* Ticket Body */}
          <div className="bg-amber-50/20 p-3 rounded-2xl border border-stone-300 flex justify-center shadow-inner overflow-hidden">
            <div 
              id="cierre-thermal-ticket"
              className={`bg-white p-4 shadow-md rounded-lg font-mono text-stone-900 text-[11px] leading-tight select-text ${
                paperWidth === '80mm' ? 'w-[300px]' : 'w-[230px]'
              }`}
            >
              {/* Header */}
              <div className="text-center pb-2 border-b border-dashed border-stone-400">
                <div className="text-sm font-black tracking-tight">
                  {companyInfo?.commercialName || 'POLLO FRITO SABOR CERVANTEÑO'}
                </div>
                <div className="text-[10px] text-stone-600">
                  Cédula: {companyInfo?.taxId || '3-101-XXXXXX'}
                </div>
                <div className="text-[10px] text-stone-600">
                  Cervantes, Alvarado, Cartago
                </div>
                <div className="text-xs font-black mt-2 uppercase bg-stone-100 py-0.5 rounded">
                  *** {corteType === 'CORTE_X' ? 'CORTE X (PARCIAL)' : 'CORTE Z (CIERRE FINAL)'} ***
                </div>
              </div>

              {/* Shift info */}
              <div className="py-2 border-b border-dashed border-stone-400 text-[10px] space-y-0.5">
                <div className="flex justify-between">
                  <span>Cajero:</span>
                  <span className="font-bold">{cashRegister?.cashierName || currentUser?.name || 'Principal'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Apertura:</span>
                  <span>{cashRegister?.openTime ? new Date(cashRegister.openTime).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Fecha:</span>
                  <span>{new Date().toLocaleDateString('es-CR')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Hora Impresión:</span>
                  <span>{new Date().toLocaleTimeString('es-CR')}</span>
                </div>
              </div>

              {/* Financial values */}
              <div className="py-2 border-b border-dashed border-stone-400 text-[10px] space-y-1">
                <div className="flex justify-between">
                  <span>Fondo Apertura:</span>
                  <span>₡{financialSummary.openingBalance.toLocaleString('es-CR')}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Ventas Efectivo:</span>
                  <span>₡{financialSummary.cashSales.toLocaleString('es-CR')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ventas Tarjeta:</span>
                  <span>₡{financialSummary.cardSales.toLocaleString('es-CR')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ventas SINPE:</span>
                  <span>₡{financialSummary.sinpeSales.toLocaleString('es-CR')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ventas Transf:</span>
                  <span>₡{financialSummary.transferSales.toLocaleString('es-CR')}</span>
                </div>
                <div className="flex justify-between border-t border-dotted border-stone-300 pt-1 font-black">
                  <span>Total Ventas:</span>
                  <span>₡{financialSummary.totalSalesAmount.toLocaleString('es-CR')}</span>
                </div>
                <div className="flex justify-between text-[9px] text-stone-600">
                  <span>(IVA 13% Incluido):</span>
                  <span>₡{financialSummary.totalTax.toLocaleString('es-CR')}</span>
                </div>
              </div>

              {/* Movements & Balance */}
              <div className="py-2 border-b border-dashed border-stone-400 text-[10px] space-y-1">
                <div className="flex justify-between text-blue-800">
                  <span>(+) Entradas Caja:</span>
                  <span>₡{financialSummary.cashIn.toLocaleString('es-CR')}</span>
                </div>
                <div className="flex justify-between text-rose-800">
                  <span>(-) Retiros / Salidas:</span>
                  <span>₡{financialSummary.cashOut.toLocaleString('es-CR')}</span>
                </div>
                <div className="flex justify-between font-black border-t border-dotted border-stone-300 pt-1">
                  <span>Efectivo Teórico:</span>
                  <span>₡{financialSummary.expectedCash.toLocaleString('es-CR')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Efectivo Contado:</span>
                  <span>₡{financialSummary.countedCash.toLocaleString('es-CR')}</span>
                </div>
                <div className={`flex justify-between font-black ${
                  isSquare ? 'text-stone-900' : isSurplus ? 'text-blue-900' : 'text-rose-900'
                }`}>
                  <span>Diferencia:</span>
                  <span>
                    {isSquare ? '₡0.00' : `${isSurplus ? '+' : '-'}₡${Math.abs(financialSummary.difference).toLocaleString('es-CR')}`}
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-3 text-center text-[9px] text-stone-500 space-y-2">
                <div>Transacciones emitidas: {financialSummary.ordersCount}</div>
                <div className="border-t border-stone-300 pt-4 mt-6">
                  Firma del Cajero / Responsable
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
