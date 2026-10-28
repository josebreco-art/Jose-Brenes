import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Clock, 
  CheckCircle2, 
  Utensils, 
  Truck,
  ShoppingBag,
  RotateCcw,
  Check,
  ChevronLeft,
  ChevronRight,
  CheckCheck,
  Monitor,
  Flame,
  Layers,
  Coffee,
  Sparkles,
  Printer,
  Bell
} from 'lucide-react';
import { Sale, KitchenOrder, OrderStatus, KitchenStation } from '../types/pos';
import { getCostaRicaDate } from '../utils/dateUtils';
import { playOrderChime } from '../utils/audioChime';

interface KdsScreenProps {
  sales: Array<Sale | KitchenOrder>;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  onPrintOrder?: (order: Sale | KitchenOrder) => void;
  chimeOnlyInKitchen?: boolean;
  onToggleChimeOnlyInKitchen?: () => void;
}

const STATIONS: { id: KitchenStation; name: string; icon: any; color: string; desc: string }[] = [
  { id: 'ALL', name: 'General / Todo', icon: Monitor, color: 'text-amber-400 bg-amber-950/60 border-amber-800', desc: 'Muestra todos los productos y órdenes' },
  { id: 'FRITURA', name: 'Monitor 1: Freidoras', icon: Flame, color: 'text-yellow-400 bg-yellow-950/60 border-yellow-800', desc: 'Pollo crujiente, empanadas y papas' },
  { id: 'PLANCHA_ARMADO', name: 'Monitor 2: Plancha & Armado', icon: Layers, color: 'text-cyan-400 bg-cyan-950/60 border-cyan-800', desc: 'Hamburguesas, tacos, chalupas y nachos' },
  { id: 'BEBIDAS_EXTRAS', name: 'Monitor 3: Bebidas & Despacho', icon: Coffee, color: 'text-purple-400 bg-purple-950/60 border-purple-800', desc: 'Refrescos, gaseosas y salsas' },
  { id: 'EXPRESS_DESPACHO', name: 'Monitor 4: Express & Empaque', icon: Truck, color: 'text-orange-400 bg-orange-950/60 border-orange-800', desc: 'Órdenes para llevar y entregas express' }
];

export const KdsScreen: React.FC<KdsScreenProps> = ({
  sales,
  onUpdateOrderStatus,
  onPrintOrder,
  chimeOnlyInKitchen = true,
  onToggleChimeOnlyInKitchen
}) => {
  // Monitor de Cocina Unificado (General / Todo)
  const activeStation = 'ALL';

  const [activeFilter, setActiveFilter] = useState<'ALL' | 'DINE_IN' | 'TAKE_OUT' | 'DELIVERY'>('ALL');
  const [viewArchived, setViewArchived] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [localStatusOverrides, setLocalStatusOverrides] = useState<Record<string, OrderStatus>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleAction = (orderId: string, status: OrderStatus) => {
    // Actualización visual instantánea en el mismo frame (0 ms)
    setLocalStatusOverrides(prev => ({ ...prev, [orderId]: status }));
    onUpdateOrderStatus(orderId, status);
  };

  // Auto-refresh timer every 10 seconds to update elapsed time badges
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  const getElapsedTimeInMinutes = (timestamp: number | string) => {
    const created = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
    const now = Date.now();
    return Math.max(0, Math.floor((now - created) / 60000));
  };

  const toggleItemCheck = (key: string) => {
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Chronological sorting and filtering memoized to prevent screen flash/jitter
  const displayedSales = useMemo(() => {
    const sorted = [...sales].sort((a, b) => {
      const timeA = a.timestamp || new Date(a.createdAt || 0).getTime();
      const timeB = b.timestamp || new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    });

    return sorted.filter(s => {
      if (!s) return false;

      const currentStatus = localStatusOverrides[s.id] || s.orderStatus;

      if (currentStatus === 'CANCELLED') return false;
      
      if (!viewArchived && currentStatus === 'DELIVERED') return false;
      if (viewArchived && currentStatus !== 'DELIVERED') return false;

      // Filter by order type tab
      if (activeFilter !== 'ALL' && s.orderType !== activeFilter) return false;

      // Filter by kitchen station monitor
      if (activeStation === 'ALL') return true;
      if (activeStation === 'EXPRESS_DESPACHO') {
        return s.orderType === 'DELIVERY' || s.orderType === 'TAKE_OUT';
      }

      // Check if this sale has items matching the station
      return s.items.some(item => {
        const itemStation = item.station || 'PLANCHA_ARMADO';
        return itemStation === activeStation || itemStation === 'ALL';
      });
    });
  }, [sales, localStatusOverrides, viewArchived, activeFilter]);

  // Color schemes requested:
  // - ROJO: COMER ACÁ (DINE_IN)
  // - VERDE: DESPACHO O LLEVAR (TAKE_OUT)
  // - NARANJA: EXPRESS (DELIVERY)
  const getTheme = (orderType: Sale['orderType']) => {
    switch (orderType) {
      case 'DINE_IN': // ROJO
        return {
          cardBorder: 'border-red-600',
          headerBg: 'bg-red-600 text-white',
          badgeBg: 'bg-red-500/20 text-red-300 border border-red-500/30',
          actionBtn: 'bg-red-600 hover:bg-red-500 text-white shadow-red-950',
          label: 'COMER ACÁ',
          icon: Utensils
        };
      case 'TAKE_OUT': // VERDE
        return {
          cardBorder: 'border-emerald-600',
          headerBg: 'bg-emerald-600 text-white',
          badgeBg: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
          actionBtn: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950',
          label: 'LLEVAR',
          icon: ShoppingBag
        };
      case 'DELIVERY': // NARANJA
      default:
        return {
          cardBorder: 'border-orange-500',
          headerBg: 'bg-orange-600 text-white',
          badgeBg: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
          actionBtn: 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-950',
          label: 'EXPRESS',
          icon: Truck
        };
    }
  };

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const offset = direction === 'left' ? -380 : 380;
      scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  const activeCount = sales.filter(s => s.orderStatus !== 'DELIVERED' && s.orderStatus !== 'CANCELLED').length;
  const dineInCount = sales.filter(s => s.orderStatus !== 'DELIVERED' && s.orderStatus !== 'CANCELLED' && s.orderType === 'DINE_IN').length;
  const takeOutCount = sales.filter(s => s.orderStatus !== 'DELIVERED' && s.orderStatus !== 'CANCELLED' && s.orderType === 'TAKE_OUT').length;
  const deliveryCount = sales.filter(s => s.orderStatus !== 'DELIVERED' && s.orderStatus !== 'CANCELLED' && s.orderType === 'DELIVERY').length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-stone-950 text-stone-100 p-2 sm:p-3 space-y-2">
      
      {/* ----------------- TOP CONTROLS & MONITOR SELECTOR ----------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-stone-900 px-3 py-2 rounded-xl border border-stone-800 shrink-0">
        
        {/* Left: Monitor Badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-black text-xs tracking-wide">
            <Monitor className="w-4 h-4 text-amber-400 shrink-0" />
            <span>COCINA GENERAL (MONITOR UNIFICADO)</span>
          </div>
        </div>

        {/* Right: Type Filters & Action Buttons */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Quick Filter Pills */}
          <div className="flex items-center gap-1 text-xs">
            <button
              id="kds-filter-all"
              onClick={() => setActiveFilter('ALL')}
              className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                activeFilter === 'ALL' ? 'bg-stone-700 text-white' : 'text-stone-400 hover:text-white'
              }`}
            >
              TODAS ({activeCount})
            </button>

            <button
              id="kds-filter-dine-in"
              onClick={() => setActiveFilter('DINE_IN')}
              className={`px-2 py-0.5 rounded-md font-bold transition-all flex items-center gap-1 border ${
                activeFilter === 'DINE_IN' 
                  ? 'bg-red-600 text-white border-red-500' 
                  : 'bg-red-950/40 text-red-400 border-red-900/60 hover:bg-red-900/50'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
              <span>Comer acá ({dineInCount})</span>
            </button>

            <button
              id="kds-filter-take-out"
              onClick={() => setActiveFilter('TAKE_OUT')}
              className={`px-2 py-0.5 rounded-md font-bold transition-all flex items-center gap-1 border ${
                activeFilter === 'TAKE_OUT' 
                  ? 'bg-emerald-600 text-white border-emerald-500' 
                  : 'bg-emerald-950/40 text-emerald-400 border-emerald-900/60 hover:bg-emerald-900/50'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>Llevar ({takeOutCount})</span>
            </button>

            <button
              id="kds-filter-delivery"
              onClick={() => setActiveFilter('DELIVERY')}
              className={`px-2 py-0.5 rounded-md font-bold transition-all flex items-center gap-1 border ${
                activeFilter === 'DELIVERY' 
                  ? 'bg-orange-600 text-white border-orange-500' 
                  : 'bg-orange-950/40 text-orange-400 border-orange-900/60 hover:bg-orange-900/50'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
              <span>Express ({deliveryCount})</span>
            </button>
          </div>

          {/* Sound Chime Toggle & Test */}
          <div className="flex items-center gap-1">
            {onToggleChimeOnlyInKitchen && (
              <button
                id="kds-chime-scope-toggle"
                onClick={onToggleChimeOnlyInKitchen}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 ${
                  chimeOnlyInKitchen
                    ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900'
                    : 'bg-stone-900 border-stone-700 text-stone-300 hover:bg-stone-800'
                }`}
                title={chimeOnlyInKitchen ? "Campana configurada para sonar SOLAMENTE cuando estás en la pantalla de Cocina (KDS). Clic para permitir en todas las pantallas." : "Campana sonando en todas las pantallas. Clic para restringir solo a Cocina."}
              >
                <span className={`w-2 h-2 rounded-full ${chimeOnlyInKitchen ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                <span className="hidden md:inline">{chimeOnlyInKitchen ? 'Solo en Cocina' : 'En todo el POS'}</span>
              </button>
            )}

            <button
              id="kds-test-chime"
              onClick={() => playOrderChime()}
              className="px-2 py-1 rounded-lg text-xs font-bold transition-all border bg-stone-900 border-amber-500/40 text-amber-400 hover:bg-amber-950/70 hover:border-amber-400 flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
              title="Probar sonido de campana de comanda"
            >
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Probar Campana</span>
            </button>
          </div>

          {/* History Toggle */}
          <button
            id="kds-toggle-archived"
            onClick={() => setViewArchived(!viewArchived)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border ${
              viewArchived 
                ? 'bg-stone-700 text-white border-stone-500' 
                : 'bg-stone-950 text-stone-400 border-stone-800 hover:text-white'
            }`}
          >
            {viewArchived ? '← Activas' : 'Despachadas'}
          </button>

          {/* Scroll arrows */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              id="kds-scroll-left"
              onClick={() => handleScroll('left')}
              className="p-1 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors border border-stone-700"
              title="Desplazar a la izquierda"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              id="kds-scroll-right"
              onClick={() => handleScroll('right')}
              className="p-1 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors border border-stone-700"
              title="Desplazar a la derecha"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ----------------- MAIN KDS AREA: LEFT-TO-RIGHT ORDERS STREAM ----------------- */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-x-auto overflow-y-hidden pb-1 scrollbar-thin scrollbar-thumb-stone-700 scrollbar-track-stone-900"
      >
        {displayedSales.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-stone-900/30 rounded-2xl border-2 border-dashed border-stone-800 space-y-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <h3 className="font-black text-base text-stone-300">
              {viewArchived ? 'Sin comandas en historial' : '¡Sin órdenes pendientes en cocina!'}
            </h3>
            <p className="text-xs text-stone-500">
              Los nuevos pedidos aparecerán aquí automáticamente en tiempo real.
            </p>
          </div>
        ) : (
          <div className="flex flex-row items-stretch gap-3 h-full min-w-max pr-4">
            {displayedSales.map((order, idx) => {
              const theme = getTheme(order.orderType);
              const Icon = theme.icon;
              const elapsed = getElapsedTimeInMinutes(order.createdAt || order.timestamp);

              // Filter items to show according to active monitor
              const stationItems = order.items.filter(item => {
                if (activeStation === 'ALL' || activeStation === 'EXPRESS_DESPACHO') return true;
                const itemStation = item.station || 'PLANCHA_ARMADO';
                return itemStation === activeStation || itemStation === 'ALL';
              });

              return (
                <div
                  key={order.id}
                  id={`kds-card-${order.id}`}
                  className={`w-[320px] sm:w-[350px] shrink-0 bg-stone-900 rounded-2xl border-2 ${theme.cardBorder} flex flex-col overflow-hidden shadow-xl transition-all duration-300 ease-out`}
                >
                  {/* 1. Header: Color-coded bar with #Number, Type, Mesa, and Elapsed Time */}
                  <div className={`px-3.5 py-2 ${theme.headerBg} flex items-center justify-between shrink-0 font-black`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg tracking-tight bg-black/25 px-2 py-0.5 rounded-lg">
                        #{order.orderNumber || (idx + 101)}
                      </span>
                      <div className="flex items-center gap-1 text-xs uppercase tracking-wide bg-black/25 px-2 py-0.5 rounded-lg">
                        <Icon className="w-3.5 h-3.5" />
                        <span>
                          {theme.label}
                        </span>
                      </div>
                    </div>

                    {/* Actions in Header: Print + Time Counter */}
                    <div className="flex items-center gap-1.5">
                      {onPrintOrder && (
                        <button
                          type="button"
                          onClick={() => onPrintOrder(order)}
                          className="p-1 bg-black/35 hover:bg-black/60 rounded-lg text-white transition-colors"
                          title="Imprimir Comanda de Cocina (56mm / 80mm)"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <div className="flex items-center gap-1 text-xs bg-black/35 px-2 py-0.5 rounded-lg">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{elapsed}m</span>
                      </div>
                    </div>
                  </div>

                  {/* 2. Customer, Comanda Name & Device Origin Sub-bar */}
                  <div className="px-3 py-1.5 bg-stone-950 text-xs font-bold text-stone-300 border-b border-stone-800 flex flex-col gap-1">
                    {order.updatedAt && order.createdAt && (new Date(order.updatedAt).getTime() - new Date(order.createdAt).getTime() > 1500) && (
                      <div className="flex items-center gap-1.5 bg-cyan-950/90 border border-cyan-500/50 text-cyan-300 px-2 py-0.5 rounded-lg text-xs font-black shadow-2xs">
                        <span className="shrink-0 text-cyan-400">🔄</span>
                        <span className="truncate uppercase">Comanda Actualizada (+ Productos)</span>
                      </div>
                    )}
                    {order.customOrderName && (
                      <div className="flex items-center gap-1.5 bg-amber-950/80 border border-amber-500/40 text-amber-300 px-2 py-0.5 rounded-lg text-xs font-black truncate shadow-2xs">
                        <span className="shrink-0 text-amber-400">🏷️</span>
                        <span className="truncate">{order.customOrderName}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-1 truncate">
                      <span className="truncate text-stone-400 text-[11px]">
                        {order.customerName && order.customerName !== 'Cliente General' ? `👤 ${order.customerName}` : '👤 Cliente General'}
                      </span>
                      <span className="text-[10px] text-amber-400/90 font-mono bg-stone-900 px-1.5 py-0.2 rounded border border-stone-800 shrink-0">
                        📱 {order.terminalName || 'Caja'}
                      </span>
                    </div>
                  </div>

                  {/* 3. Items List - Dedicated space for food products */}
                  <div className="flex-1 p-2.5 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-stone-800">
                    {stationItems.map((item, idx) => {
                      const checkKey = `${order.id}-${item.productId}-${idx}`;
                      const isDone = checkedItems[checkKey];

                      return (
                        <div
                          key={idx}
                          id={`kds-item-${order.id}-${idx}`}
                          onClick={() => toggleItemCheck(checkKey)}
                          className={`flex items-start gap-2.5 p-2 rounded-xl cursor-pointer transition-all border select-none ${
                            isDone 
                              ? 'bg-stone-950/40 border-stone-900 text-stone-600 line-through' 
                              : 'bg-stone-950 border-stone-800/90 text-stone-100 hover:border-stone-700'
                          }`}
                        >
                          {/* Checkbox */}
                          <span className={`w-5 h-5 rounded-lg mt-0.5 flex items-center justify-center shrink-0 border transition-all ${
                            isDone 
                              ? 'bg-emerald-600 border-emerald-500 text-white' 
                              : 'border-stone-700 bg-stone-900 text-transparent'
                          }`}>
                            <Check className="w-3.5 h-3.5" />
                          </span>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className={`px-1.5 py-0.5 rounded font-black text-sm shrink-0 ${theme.badgeBg}`}>
                                {item.quantity}x
                              </span>
                              <span className="font-black text-sm tracking-tight text-stone-100 leading-snug">
                                {item.name}
                              </span>
                            </div>

                            {/* Kitchen Notes */}
                            {item.notes && (
                              <div className="mt-1 text-xs text-amber-300 font-bold bg-amber-950/80 border border-amber-800/40 px-2 py-0.5 rounded-md">
                                * {item.notes}
                              </div>
                            )}

                            {/* Modifiers */}
                            {item.modifiers && item.modifiers.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-stone-300">
                                {item.modifiers.map(m => (
                                  <span key={m.id} className="bg-stone-800 px-1.5 py-0.5 rounded border border-stone-700">
                                    + {m.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 4. Action Button: DESPACHAR */}
                  <div className="p-2.5 bg-stone-950 border-t border-stone-800 shrink-0">
                    {(localStatusOverrides[order.id] || order.orderStatus) !== 'DELIVERED' ? (
                      <button
                        id={`kds-btn-deliver-${order.id}`}
                        onClick={() => handleAction(order.id, 'DELIVERED')}
                        className={`w-full py-2.5 ${theme.actionBtn} rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-md active:scale-[0.98] uppercase tracking-wide`}
                      >
                        <CheckCheck className="w-4 h-4" />
                        <span>DESPACHAR</span>
                      </button>
                    ) : (
                      <button
                        id={`kds-btn-reopen-${order.id}`}
                        onClick={() => handleAction(order.id, 'CONFIRMED')}
                        className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 border border-stone-700"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reabrir</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
