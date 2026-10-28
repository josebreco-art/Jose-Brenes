import React from 'react';
import { Sale, Product } from '../types/pos';
import { BarChart3, TrendingUp, DollarSign, ShoppingBag, CreditCard, Banknote, Smartphone } from 'lucide-react';

interface DashboardViewProps {
  sales: Sale[];
  products: Product[];
}

export const DashboardView: React.FC<DashboardViewProps> = ({ sales, products }) => {
  const totalRevenue = sales.reduce((a, b) => a + b.total, 0);
  const totalSalesCount = sales.length;
  const avgTicket = totalSalesCount > 0 ? Math.round(totalRevenue / totalSalesCount) : 0;

  const cashTotal = sales.reduce((acc, s) => acc + (s.payments?.filter(p => p.method === 'EFECTIVO').reduce((a, b) => a + b.amount, 0) || 0), 0);
  const cardTotal = sales.reduce((acc, s) => acc + (s.payments?.filter(p => p.method === 'TARJETA').reduce((a, b) => a + b.amount, 0) || 0), 0);
  const sinpeTotal = sales.reduce((acc, s) => acc + (s.payments?.filter(p => p.method === 'SINPE').reduce((a, b) => a + b.amount, 0) || 0), 0);

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-stone-100">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div>
          <h2 className="text-xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-amber-700" />
            Reportes & Métricas del Restaurante
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">Estadísticas de ventas, métodos de pago y rendimiento</p>
        </div>

        {/* Top 3 KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold text-stone-500 uppercase">Ingresos Totales</span>
              <div className="text-2xl font-black font-mono text-stone-900 mt-0.5">
                ₡{Math.round(totalRevenue).toLocaleString('es-CR')}
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold text-stone-500 uppercase">Órdenes Atendidas</span>
              <div className="text-2xl font-black font-mono text-stone-900 mt-0.5">
                {totalSalesCount}
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold text-stone-500 uppercase">Ticket Promedio</span>
              <div className="text-2xl font-black font-mono text-stone-900 mt-0.5">
                ₡{avgTicket.toLocaleString('es-CR')}
              </div>
            </div>
          </div>
        </div>

        {/* Payment Methods Breakdown */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-4">
          <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider">
            Ventas por Método de Pago
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 flex items-center gap-3">
              <Banknote className="w-8 h-8 text-emerald-600" />
              <div>
                <span className="text-xs font-bold text-stone-500">Efectivo:</span>
                <div className="text-lg font-black font-mono text-stone-900">
                  ₡{Math.round(cashTotal).toLocaleString('es-CR')}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 flex items-center gap-3">
              <CreditCard className="w-8 h-8 text-blue-600" />
              <div>
                <span className="text-xs font-bold text-stone-500">Tarjeta:</span>
                <div className="text-lg font-black font-mono text-stone-900">
                  ₡{Math.round(cardTotal).toLocaleString('es-CR')}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 flex items-center gap-3">
              <Smartphone className="w-8 h-8 text-amber-600" />
              <div>
                <span className="text-xs font-bold text-stone-500">SINPE Móvil:</span>
                <div className="text-lg font-black font-mono text-stone-900">
                  ₡{Math.round(sinpeTotal).toLocaleString('es-CR')}
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
