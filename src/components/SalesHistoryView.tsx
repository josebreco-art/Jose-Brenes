import React, { useState } from 'react';
import { Sale } from '../types/pos';
import { Search, Receipt, Calendar, CreditCard, Banknote, Smartphone, CheckCircle2, ShieldCheck, Printer } from 'lucide-react';

interface SalesHistoryViewProps {
  sales: Sale[];
}

export const SalesHistoryView: React.FC<SalesHistoryViewProps> = ({ sales }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const filteredSales = sales.filter(s => {
    const term = searchTerm.toLowerCase();
    return (
      s.orderNumber.toString().includes(term) ||
      (s.customerName && s.customerName.toLowerCase().includes(term)) ||
      (s.customerIdentification && s.customerIdentification.includes(term)) ||
      s.total.toString().includes(term)
    );
  });

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-stone-100">
      
      {/* Left List of Sales */}
      <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-stone-200">
        
        <div className="p-3 bg-white border-b border-stone-200 flex items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por # de orden, cliente, monto..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-stone-100 border border-stone-200 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <span className="text-xs font-bold text-stone-500 whitespace-nowrap">
            {filteredSales.length} ventas
          </span>
        </div>

        <div className="flex-1 p-3 overflow-y-auto space-y-2">
          {filteredSales.map(sale => {
            const isSel = selectedSale?.id === sale.id;
            return (
              <button
                key={sale.id}
                type="button"
                onClick={() => setSelectedSale(sale)}
                className={`w-full p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  isSel
                    ? 'bg-amber-50 border-amber-500 shadow-sm ring-1 ring-amber-400/50'
                    : 'bg-white border-stone-200 hover:border-amber-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-sm text-stone-900">
                      #{sale.orderNumber}
                    </span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                      {sale.orderType}
                    </span>
                  </div>
                  <span className="font-mono font-black text-sm text-amber-950">
                    ₡{Math.round(sale.total).toLocaleString('es-CR')}
                  </span>
                </div>

                <div className="mt-1 flex items-center justify-between text-xs text-stone-500">
                  <span className="truncate">{sale.customerName || 'Cliente de Contado'}</span>
                  <span>{sale.date} • {sale.time}</span>
                </div>

                <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px]">
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Tiquete Electrónico DGT
                  </span>
                  <span className="text-stone-400 font-mono">
                    {sale.items?.length || 0} productos
                  </span>
                </div>
              </button>
            );
          })}
        </div>

      </div>

      {/* Right Detail Pane */}
      <div className="w-full md:w-96 bg-white flex flex-col h-full overflow-hidden shadow-lg shrink-0">
        {selectedSale ? (
          <div className="flex-1 flex flex-col p-4 overflow-y-auto">
            
            <div className="text-center pb-4 border-b border-stone-200">
              <span className="text-3xl">🍗</span>
              <h3 className="font-black text-base text-stone-900 mt-1">Pollo Frito Sabor Cervanteño</h3>
              <p className="text-xs text-stone-500">Cervantes de Alvarado, Cartago</p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-mono font-black">
                Comprobante #{selectedSale.orderNumber}
              </div>
            </div>

            {/* Sale metadata */}
            <div className="py-3 border-b border-stone-200 space-y-1 text-xs text-stone-600">
              <div className="flex justify-between">
                <span>Fecha / Hora:</span>
                <span className="font-mono text-stone-900">{selectedSale.date} {selectedSale.time}</span>
              </div>
              <div className="flex justify-between">
                <span>Cliente:</span>
                <span className="font-bold text-stone-900">{selectedSale.customerName}</span>
              </div>
              {selectedSale.customerIdentification && (
                <div className="flex justify-between">
                  <span>Cédula:</span>
                  <span className="font-mono text-stone-900">{selectedSale.customerIdentification}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Cajero(a):</span>
                <span className="text-stone-900">{selectedSale.cashierName}</span>
              </div>
            </div>

            {/* Items */}
            <div className="flex-1 py-3 border-b border-stone-200 space-y-2 overflow-y-auto">
              <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Detalle del Pedido</div>
              {selectedSale.items?.map((it, idx) => (
                <div key={idx} className="flex justify-between items-start text-xs">
                  <div>
                    <span className="font-bold text-stone-900">{it.quantity}x {it.productName}</span>
                  </div>
                  <span className="font-mono font-bold text-stone-800">
                    ₡{Math.round(it.total || (it.unitPrice * it.quantity)).toLocaleString('es-CR')}
                  </span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="py-3 space-y-1 text-xs text-stone-600">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-mono">₡{Math.round(selectedSale.subtotal).toLocaleString('es-CR')}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA (13%):</span>
                <span className="font-mono">₡{Math.round(selectedSale.taxTotal).toLocaleString('es-CR')}</span>
              </div>
              <div className="flex justify-between text-base font-black text-amber-950 pt-1 border-t border-stone-200">
                <span>TOTAL:</span>
                <span className="font-mono">₡{Math.round(selectedSale.total).toLocaleString('es-CR')}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="w-full py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors mt-2"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Comprobante</span>
            </button>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-stone-400">
            <Receipt className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-xs font-bold text-stone-500">Selecciona una venta</p>
            <p className="text-[11px] text-stone-400 mt-0.5">Toca cualquier venta de la lista para ver su detalle fiscal</p>
          </div>
        )}
      </div>

    </div>
  );
};
