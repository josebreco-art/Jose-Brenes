import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  Search, 
  Printer, 
  Clock,
  Eye,
  Utensils,
  ChevronRight,
  Calendar,
  CreditCard,
  Banknote,
  Smartphone,
  Tag,
  RefreshCw,
  ShoppingBag,
  Truck,
  Send
} from 'lucide-react';
import { Sale } from '../types/pos';
import { formatPaymentMethodSpanish } from './ThermalReceiptModal';
import { getCostaRicaDate } from '../utils/dateUtils';
import { PosApiService } from '../services/api';
import { offlineStorage } from '../services/offlineStorageService';

export type SalesDateFilter = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'ALL' | 'CUSTOM';

interface SalesHistoryScreenProps {
  sales: Sale[];
  onRetryFiscalInvoice?: (sale: Sale) => Promise<void>;
  onViewReceipt: (sale: Sale, type: 'POS' | 'KITCHEN' | 'INVOICE') => void;
  isRetrying?: boolean;
}

export const SalesHistoryScreen: React.FC<SalesHistoryScreenProps> = ({
  sales,
  onViewReceipt
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<SalesDateFilter>('TODAY');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>('ALL');
  const [customDateFrom, setCustomDateFrom] = useState<string>('');
  const [customDateTo, setCustomDateTo] = useState<string>('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(20);
  const [fetchedSales, setFetchedSales] = useState<Sale[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState<boolean>(false);
  const [hasMoreSales, setHasMoreSales] = useState<boolean>(true);
  const [pageCursors, setPageCursors] = useState<(number | undefined)[]>([undefined]);

  // Precalculate Costa Rica reference dates
  const todayStr = getCostaRicaDate();
  const yesterdayStr = getCostaRicaDate(Date.now() - 86400000);
  const weekAgoStr = getCostaRicaDate(Date.now() - 7 * 86400000);
  const monthAgoStr = getCostaRicaDate(Date.now() - 30 * 86400000);

  const getDateRangeParams = () => {
    let df = customDateFrom;
    let dt = customDateTo;
    if (dateFilter === 'TODAY') {
      df = todayStr;
      dt = todayStr;
    } else if (dateFilter === 'YESTERDAY') {
      df = yesterdayStr;
      dt = yesterdayStr;
    } else if (dateFilter === 'WEEK') {
      df = weekAgoStr;
      dt = todayStr;
    } else if (dateFilter === 'MONTH') {
      df = monthAgoStr;
      dt = todayStr;
    }
    return { df, dt };
  };

  const [isBatchEmitting, setIsBatchEmitting] = useState<boolean>(false);

  const handleBatchEmit = async () => {
    if (isBatchEmitting) return;
    const { df } = getDateRangeParams();
    const confirmEmit = window.confirm(`¿Deseas emitir a Hacienda todos los comprobantes pendientes de esta fecha?`);
    if (!confirmEmit) return;

    setIsBatchEmitting(true);
    try {
      let localPendingSales: Sale[] = [];
      try {
        const localSales = await offlineStorage.getOfflineSales();
        localPendingSales = (localSales || []).filter(s => !(s.invoiceStatus === 'INVOICED' && s.numericKey50 && s.consecutive20));
      } catch (e) {}

      const res = await PosApiService.emitPendingBatch(df || undefined, localPendingSales);
      if (res.success) {
        alert(res.message);
      } else {
        alert(`Aviso: ${res.message}`);
      }
      // Re-fetch sales
      setCurrentPage(1);
      setPageCursors([undefined]);
    } catch (err: any) {
      alert(`Error de emisión: ${err.message}`);
    } finally {
      setIsBatchEmitting(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    setPageCursors([undefined]);
  }, [searchQuery, dateFilter, paymentFilter, orderTypeFilter, customDateFrom, customDateTo, itemsPerPage]);

  useEffect(() => {
    let isMounted = true;
    const fetchPaginated = async () => {
      setIsLoadingSales(true);
      try {
        const { df, dt } = getDateRangeParams();
        const cursor = pageCursors[currentPage - 1];
        const params = new URLSearchParams();
        params.set('limit', itemsPerPage.toString());
        if (cursor !== undefined) params.set('lastTimestamp', cursor.toString());
        if (df) params.set('dateFrom', df);
        if (dt) params.set('dateTo', dt);
        if (searchQuery) params.set('search', searchQuery);

        const res = await fetch(`/api/sales/paginated?${params.toString()}`);
        const data = await res.json();
        if (data.success && isMounted) {
          let list: Sale[] = data.sales || [];
          // Client-side filtering for payment method and order type if needed
          if (paymentFilter !== 'ALL') {
            list = list.filter(s => (s.payments || []).some(p => p.method === paymentFilter));
          }
          if (orderTypeFilter !== 'ALL') {
            list = list.filter(s => s.orderType === orderTypeFilter);
          }
          setFetchedSales(list);
          setHasMoreSales(data.hasMore);
          if (data.lastTimestamp !== undefined && currentPage >= pageCursors.length) {
            setPageCursors(prev => {
              const next = [...prev];
              next[currentPage] = data.lastTimestamp;
              return next;
            });
          }
        } else if (isMounted) {
          fallbackLocalFilter();
        }
      } catch (err) {
        if (isMounted) {
          fallbackLocalFilter();
        }
      } finally {
        if (isMounted) setIsLoadingSales(false);
      }
    };

    const fallbackLocalFilter = () => {
      const filtered = sales.filter(s => {
        const saleDate = s.timestamp ? getCostaRicaDate(s.timestamp) : (s.date || (s.createdAt ? getCostaRicaDate(s.createdAt) : ''));
        const { df, dt } = getDateRangeParams();
        if (df && saleDate < df) return false;
        if (dt && saleDate > dt) return false;

        if (paymentFilter !== 'ALL') {
          const hasPayment = (s.payments || []).some(p => p.method === paymentFilter);
          if (!hasPayment) return false;
        }

        if (orderTypeFilter !== 'ALL' && s.orderType !== orderTypeFilter) {
          return false;
        }

        const q = searchQuery.toLowerCase();
        const matchesSearch = s.orderNumber.toString().includes(q) ||
                              s.customerName.toLowerCase().includes(q) ||
                              (s.tableNumber && s.tableNumber.toLowerCase().includes(q)) ||
                              (s.customOrderName && s.customOrderName.toLowerCase().includes(q));
        return matchesSearch;
      });
      const start = (currentPage - 1) * itemsPerPage;
      setFetchedSales(filtered.slice(start, start + itemsPerPage));
      setHasMoreSales(start + itemsPerPage < filtered.length);
    };

    fetchPaginated();
    return () => {
      isMounted = false;
    };
  }, [currentPage, itemsPerPage, searchQuery, dateFilter, paymentFilter, orderTypeFilter, customDateFrom, customDateTo, sales]);

  const paginatedSales = fetchedSales;

  // Totales rápidos para la página actual
  const pageTotalCRC = paginatedSales.reduce((sum, s) => sum + (s.total || 0), 0);

  const getPaymentBadge = (sale: Sale) => {
    const payments = sale.payments || [];
    if (payments.length === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[11px] font-bold">
          <Banknote className="w-3 h-3 text-stone-500" />
          <span>Efectivo</span>
        </span>
      );
    }
    return (
      <div className="flex flex-wrap gap-1">
        {payments.map((p, idx) => {
          let icon = <Banknote className="w-3 h-3 text-emerald-600" />;
          let bg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
          if (p.method === 'CARD') {
            icon = <CreditCard className="w-3 h-3 text-blue-600" />;
            bg = 'bg-blue-50 text-blue-800 border-blue-200';
          } else if (p.method === 'SINPE') {
            icon = <Smartphone className="w-3 h-3 text-purple-600" />;
            bg = 'bg-purple-50 text-purple-800 border-purple-200';
          }
          return (
            <span key={idx} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${bg}`}>
              {icon}
              <span>{formatPaymentMethodSpanish(p.method)}</span>
            </span>
          );
        })}
      </div>
    );
  };

  const getOrderTypeBadge = (orderType: Sale['orderType'], tableNumber?: string) => {
    switch (orderType) {
      case 'DINE_IN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold">
            <Utensils className="w-3 h-3" />
            <span>Salón {tableNumber ? `(Mesa ${tableNumber})` : ''}</span>
          </span>
        );
      case 'TAKE_OUT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
            <ShoppingBag className="w-3 h-3" />
            <span>Para Llevar</span>
          </span>
        );
      case 'DELIVERY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold">
            <Truck className="w-3 h-3" />
            <span>Express</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-100px)] overflow-hidden bg-stone-50 p-4 space-y-4">
      
      {/* Top Bar with Clear Filters */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-base sm:text-lg text-stone-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-600" />
              <span>Historial de Ventas del Restaurante</span>
            </h2>
            <p className="text-xs text-stone-500">
              Registro comercial de comandas cobradas, formas de pago y reimpresión de comprobantes de caja.
            </p>
          </div>

          {/* Resumen rápido de la página */}
          <div className="flex items-center gap-3 bg-amber-50/80 px-3.5 py-1.5 rounded-xl border border-amber-200">
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Total en Pantalla</div>
              <div className="text-sm font-black text-amber-950">₡{pageTotalCRC.toLocaleString('es-CR')}</div>
            </div>
            <div className="h-6 w-px bg-amber-200" />
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Comandas</div>
              <div className="text-sm font-black text-amber-950">{paginatedSales.length}</div>
            </div>
          </div>
        </div>

        {/* Search & Period & Payment Filters */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 pt-2 border-t border-stone-100">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Buscar por comanda #, cliente, mesa o nota..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Selector de Período de Fecha */}
            <select
              id="sales-history-date-filter"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as SalesDateFilter)}
              className="px-3 py-2 text-xs font-bold bg-amber-50 border border-amber-300 rounded-xl text-amber-950 focus:ring-2 focus:ring-amber-500 outline-none"
              title="Período de Ventas"
            >
              <option value="TODAY">📅 Hoy</option>
              <option value="YESTERDAY">Ayer</option>
              <option value="WEEK">Últimos 7 días</option>
              <option value="MONTH">Últimos 30 días</option>
              <option value="CUSTOM">Rango personalizado...</option>
              <option value="ALL">Todo el histórico</option>
            </select>

            {dateFilter === 'CUSTOM' && (
              <div className="flex items-center gap-1 bg-stone-50 p-1 rounded-xl border border-stone-300">
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="px-2 py-1 text-xs bg-white border border-stone-200 rounded-lg text-stone-700 focus:outline-none"
                  title="Fecha Inicio"
                />
                <span className="text-stone-400 text-xs font-bold">-</span>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="px-2 py-1 text-xs bg-white border border-stone-200 rounded-lg text-stone-700 focus:outline-none"
                  title="Fecha Fin"
                />
              </div>
            )}

            {/* Selector de Método de Pago */}
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="px-3 py-2 text-xs font-bold bg-stone-50 border border-stone-300 rounded-xl text-stone-700 focus:ring-2 focus:ring-amber-500 outline-none"
              title="Filtrar por Forma de Pago"
            >
              <option value="ALL">Todas las formas de pago</option>
              <option value="CASH">💵 Efectivo</option>
              <option value="CARD">💳 Tarjeta</option>
              <option value="SINPE">📱 SINPE Móvil</option>
            </select>

            {/* Selector de Tipo de Pedido */}
            <select
              value={orderTypeFilter}
              onChange={(e) => setOrderTypeFilter(e.target.value)}
              className="px-3 py-2 text-xs font-bold bg-stone-50 border border-stone-300 rounded-xl text-stone-700 focus:ring-2 focus:ring-amber-500 outline-none"
              title="Filtrar por Modalidad de Pedido"
            >
              <option value="ALL">Todos los tipos</option>
              <option value="DINE_IN">🍽️ Salón</option>
              <option value="TAKE_OUT">🛍️ Para Llevar</option>
              <option value="DELIVERY">🛵 Express</option>
            </select>

            {/* Botón para Emitir Comprobantes Pendientes a Hacienda */}
            <button
              type="button"
              onClick={handleBatchEmit}
              disabled={isBatchEmitting}
              className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer ml-auto"
              title="Emitir automáticamente a Hacienda todos los comprobantes pendientes de esta fecha"
            >
              <Send className={`w-3.5 h-3.5 ${isBatchEmitting ? 'animate-bounce' : ''}`} />
              <span>{isBatchEmitting ? 'Emitiendo a Hacienda...' : 'Emitir Comprobantes a Hacienda'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sales List Table */}
      <div className="flex-1 bg-white rounded-2xl border border-stone-200 overflow-hidden flex flex-col shadow-xs">
        <div className="flex-1 overflow-y-auto overflow-x-auto min-h-0">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-stone-100 text-stone-600 font-bold sticky top-0 z-10 border-b border-stone-200 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="p-3">Comanda #</th>
                <th className="p-3">Fecha & Hora</th>
                <th className="p-3">Cliente / Mesa</th>
                <th className="p-3">Modalidad</th>
                <th className="p-3">Productos Consumidos</th>
                <th className="p-3">Forma de Pago</th>
                <th className="p-3">Total (CRC)</th>
                <th className="p-3 text-right">Comprobantes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {paginatedSales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-stone-400 font-medium">
                    {isLoadingSales ? 'Cargando ventas...' : 'No se encontraron registros de ventas con los filtros aplicados.'}
                  </td>
                </tr>
              ) : (
                paginatedSales.map(sale => {
                  return (
                    <tr 
                      key={sale.id} 
                      className="hover:bg-amber-50/40 transition-colors"
                    >
                      {/* Comanda # */}
                      <td className="p-3">
                        <span className="font-extrabold text-amber-900 bg-amber-100/70 border border-amber-300 px-2.5 py-1 rounded-lg text-xs">
                          #{sale.orderNumber}
                        </span>
                      </td>

                      {/* Fecha y Hora */}
                      <td className="p-3 text-stone-600 whitespace-nowrap">
                        <div className="font-medium text-stone-800">{sale.date}</div>
                        <div className="text-[10px] text-stone-400 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{sale.time}</span>
                        </div>
                      </td>

                      {/* Cliente / Mesa */}
                      <td className="p-3">
                        <div className="font-bold text-stone-900 truncate max-w-[150px]">
                          {sale.customerName || 'Cliente General'}
                        </div>
                        {sale.customOrderName && (
                          <div className="text-[10px] text-amber-800 font-semibold truncate max-w-[150px]">
                            {sale.customOrderName}
                          </div>
                        )}
                      </td>

                      {/* Modalidad */}
                      <td className="p-3 whitespace-nowrap">
                        {getOrderTypeBadge(sale.orderType, sale.tableNumber)}
                      </td>

                      {/* Productos Consumidos */}
                      <td className="p-3 text-stone-600">
                        <div className="truncate max-w-[220px]" title={(sale.items || []).map(i => `${i.quantity || 1}x ${i.name}`).join(', ')}>
                          {(sale.items || []).map(i => `${i.quantity || 1}x ${i.name}`).join(', ')}
                        </div>
                        <div className="text-[10px] text-stone-400">
                          {(sale.items || []).length} {sale.items?.length === 1 ? 'producto' : 'productos'}
                        </div>
                      </td>

                      {/* Forma de Pago */}
                      <td className="p-3 whitespace-nowrap">
                        {getPaymentBadge(sale)}
                        {sale.change && sale.change > 0 ? (
                          <div className="text-[10px] text-stone-400 mt-0.5">
                            Vuelto: ₡{sale.change.toLocaleString('es-CR')}
                          </div>
                        ) : null}
                      </td>

                      {/* Total CRC */}
                      <td className="p-3 whitespace-nowrap">
                        <div className="font-black text-stone-900 text-sm">
                          ₡{(sale.total || 0).toLocaleString('es-CR')}
                        </div>
                      </td>

                      {/* Acciones de Impresión */}
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Reimprimir Recibo Térmico de Cliente */}
                          <button
                            type="button"
                            onClick={() => onViewReceipt(sale, 'POS')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-stone-700 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-xl transition-colors"
                            title="Imprimir Tiquete de Caja (Cliente)"
                          >
                            <Printer className="w-3.5 h-3.5 text-stone-500" />
                            <span>Tiquete</span>
                          </button>

                          {/* Reimprimir Comanda de Cocina */}
                          <button
                            type="button"
                            onClick={() => onViewReceipt(sale, 'KITCHEN')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors"
                            title="Reimprimir Comanda para Cocina"
                          >
                            <Utensils className="w-3.5 h-3.5 text-amber-600" />
                            <span>Comanda</span>
                          </button>

                          {/* Ver Detalle Visual del Recibo */}
                          <button
                            type="button"
                            onClick={() => onViewReceipt(sale, 'INVOICE')}
                            className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors"
                            title="Ver vista previa del comprobante"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="bg-stone-50 px-4 py-3 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-stone-500 font-medium">Ítems por página:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 text-[11px] font-bold bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 text-stone-700 outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <span className="text-[11px] text-stone-500 font-bold">
              {isLoadingSales ? 'Cargando ventas...' : `Página ${currentPage} (${paginatedSales.length} ventas mostradas)`}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || isLoadingSales}
              className={`p-1.5 rounded-lg border transition-colors ${
                currentPage === 1 
                  ? 'bg-stone-50 text-stone-300 border-stone-200' 
                  : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50 hover:text-stone-900'
              }`}
              title="Página anterior"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
            <span className="text-[11px] font-bold text-stone-700 px-2">Página {currentPage}</span>
            <button
              type="button"
              onClick={() => setCurrentPage(prev => prev + 1)}
              disabled={!hasMoreSales || isLoadingSales}
              className={`p-1.5 rounded-lg border transition-colors ${
                !hasMoreSales 
                  ? 'bg-stone-50 text-stone-300 border-stone-200' 
                  : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50 hover:text-stone-900'
              }`}
              title="Página siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
