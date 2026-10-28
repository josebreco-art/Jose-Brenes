import React, { useState, useEffect } from 'react';
import { KitchenOrder, OrderStatus } from '../types/pos';
import { ChefHat, Clock, CheckCircle2, ArrowRight, RotateCcw, AlertCircle } from 'lucide-react';
import { PosApiService } from '../services/api';

interface KitchenDisplayViewProps {
  orders: KitchenOrder[];
  onOrderUpdated: (order: KitchenOrder) => void;
}

export const KitchenDisplayView: React.FC<KitchenDisplayViewProps> = ({
  orders,
  onOrderUpdated
}) => {
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'READY'>('PENDING');

  const activeOrders = orders.filter(o => {
    if (filter === 'PENDING') return o.status === 'PENDIENTE' || o.status === 'EN_PREPARACION';
    if (filter === 'READY') return o.status === 'LISTO';
    return o.status !== 'ENTREGADO' && o.status !== 'CANCELADO';
  });

  const handleAdvanceStatus = async (order: KitchenOrder) => {
    let nextStatus: OrderStatus = 'EN_PREPARACION';
    if (order.status === 'PENDIENTE') nextStatus = 'EN_PREPARACION';
    else if (order.status === 'EN_PREPARACION') nextStatus = 'LISTO';
    else if (order.status === 'LISTO') nextStatus = 'ENTREGADO';

    try {
      const res = await PosApiService.updateKitchenOrderStatus(order.id, nextStatus);
      if (res.success && res.kitchenOrder) {
        onOrderUpdated(res.kitchenOrder);
      }
    } catch (err: any) {
      alert('Error al actualizar estado: ' + err.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-stone-900 text-stone-100">
      
      {/* KDS Header */}
      <div className="p-3 bg-stone-950 border-b border-stone-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChefHat className="w-6 h-6 text-amber-400" />
          <h2 className="text-base font-black tracking-tight text-white">Cocina & Comandas (KDS)</h2>
          <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-mono font-bold">
            {activeOrders.length} activas
          </span>
        </div>

        {/* Filters */}
        <div className="flex gap-1 bg-stone-800 p-1 rounded-xl text-xs font-bold">
          <button
            onClick={() => setFilter('PENDING')}
            className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
              filter === 'PENDING' ? 'bg-amber-600 text-white' : 'text-stone-400 hover:text-white'
            }`}
          >
            Pendientes / Cocinando
          </button>
          <button
            onClick={() => setFilter('READY')}
            className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
              filter === 'READY' ? 'bg-emerald-600 text-white' : 'text-stone-400 hover:text-white'
            }`}
          >
            Listas para Servir
          </button>
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
              filter === 'ALL' ? 'bg-stone-700 text-white' : 'text-stone-400 hover:text-white'
            }`}
          >
            Todas
          </button>
        </div>
      </div>

      {/* Orders Grid */}
      <div className="flex-1 p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start">
        {activeOrders.length === 0 ? (
          <div className="col-span-full h-64 flex flex-col items-center justify-center text-stone-500">
            <CheckCircle2 className="w-12 h-12 mb-2 text-stone-600" />
            <p className="text-sm font-bold">¡Cocina al día!</p>
            <p className="text-xs text-stone-600">No hay órdenes pendientes en este momento</p>
          </div>
        ) : (
          activeOrders.map(order => {
            const isPreparing = order.status === 'EN_PREPARACION';
            const isReady = order.status === 'LISTO';
            const elapsed = Math.round((Date.now() - new Date(order.createdAt).getTime()) / 60000);

            return (
              <div
                key={order.id}
                className={`flex flex-col justify-between rounded-2xl p-4 border transition-all ${
                  isReady
                    ? 'bg-emerald-950/40 border-emerald-600 shadow-emerald-900/30'
                    : isPreparing
                    ? 'bg-blue-950/40 border-blue-600 shadow-blue-900/30'
                    : 'bg-stone-800 border-amber-600 shadow-amber-900/30'
                } shadow-lg`}
              >
                <div>
                  {/* Top: Order # & Elapsed */}
                  <div className="flex items-center justify-between pb-2 border-b border-stone-700">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black text-white font-mono">#{order.orderNumber}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-stone-700 text-amber-300">
                        {order.orderType} {order.tableNumber ? `• Mesa ${order.tableNumber}` : ''}
                      </span>
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-mono font-bold ${
                      elapsed > 15 ? 'text-rose-400 animate-pulse' : 'text-stone-400'
                    }`}>
                      <Clock className="w-3.5 h-3.5" />
                      <span>{elapsed}m</span>
                    </div>
                  </div>

                  {/* Status Banner */}
                  <div className={`my-2 py-1 px-2.5 rounded-lg text-xs font-black uppercase text-center ${
                    isReady
                      ? 'bg-emerald-600 text-white'
                      : isPreparing
                      ? 'bg-blue-600 text-white'
                      : 'bg-amber-600 text-white'
                  }`}>
                    {order.status}
                  </div>

                  {/* Item List */}
                  <div className="space-y-2 my-3">
                    {order.items.map((it, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm font-bold text-stone-200">
                        <span className="w-6 h-6 rounded bg-stone-700 text-amber-400 font-mono flex items-center justify-center shrink-0 text-xs">
                          {it.quantity}x
                        </span>
                        <div className="flex-1">
                          <div>{it.productName}</div>
                          {it.notes && (
                            <div className="text-xs text-amber-300 font-normal italic">
                              Nota: {it.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom Action Button */}
                <button
                  type="button"
                  onClick={() => handleAdvanceStatus(order)}
                  className={`w-full py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 ${
                    isReady
                      ? 'bg-stone-700 hover:bg-stone-600 text-white'
                      : isPreparing
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  <span>
                    {isReady ? 'Marcar como Entregado' : isPreparing ? 'Marcar como Listo' : 'Empezar a Cocinar'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
