import React, { useState, useEffect } from 'react';
import { CashRegister, CashMovement, UserProfile } from '../types/pos';
import { DollarSign, ArrowDownRight, ArrowUpRight, Lock, Unlock, CheckCircle2, AlertCircle } from 'lucide-react';
import { PosApiService } from '../services/api';

interface CashRegisterViewProps {
  currentUser: UserProfile | null;
}

export const CashRegisterView: React.FC<CashRegisterViewProps> = ({ currentUser }) => {
  const [register, setRegister] = useState<CashRegister | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [openingBalance, setOpeningBalance] = useState('');
  const [closeActualCash, setCloseActualCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [movAmount, setMovAmount] = useState('');
  const [movConcept, setMovConcept] = useState('');
  const [movType, setMovType] = useState<'INGRESO' | 'EGRESO'>('INGRESO');
  const [isLoading, setIsLoading] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const reg = await PosApiService.getCurrentCashRegister();
      setRegister(reg);
      const movs = await PosApiService.getCashMovements();
      setMovements(movs);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(openingBalance) || 0;
    try {
      const reg = await PosApiService.openCashRegister({
        cashierId: currentUser?.id || 'usr-admin',
        cashierName: currentUser?.name || 'Administrador',
        openingBalance: amount
      });
      setRegister(reg);
      setOpeningBalance('');
    } catch (err: any) {
      alert('Error al abrir caja: ' + err.message);
    }
  };

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(closeActualCash) || 0;
    if (!confirm(`¿Confirmas el arqueo y cierre de caja con ₡${amount.toLocaleString('es-CR')}?`)) return;
    try {
      await PosApiService.closeCashRegister({
        actualCash: amount,
        notes: closeNotes
      });
      setRegister(null);
      setCloseActualCash('');
      setCloseNotes('');
      alert('Caja cerrada exitosamente.');
    } catch (err: any) {
      alert('Error al cerrar caja: ' + err.message);
    }
  };

  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(movAmount) || 0;
    if (amount <= 0 || !movConcept) return;
    try {
      await PosApiService.addCashMovement({
        type: movType,
        amount,
        concept: movConcept,
        cashierId: currentUser?.id || 'usr-admin',
        cashierName: currentUser?.name || 'Administrador'
      });
      setMovAmount('');
      setMovConcept('');
      loadData();
    } catch (err: any) {
      alert('Error al registrar movimiento: ' + err.message);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-stone-100">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-stone-900 tracking-tight flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-amber-700" />
              Control & Arqueo de Caja
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">Gestión de turnos, efectivo inicial, ingresos y salidas</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono ${
            register?.status === 'OPEN'
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              : 'bg-stone-200 text-stone-700'
          }`}>
            {register?.status === 'OPEN' ? '🟢 CAJA ABIERTA' : '🔴 CAJA CERRADA'}
          </span>
        </div>

        {register?.status === 'OPEN' ? (
          <div className="space-y-6">
            
            {/* Live Totals Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
                <span className="text-[11px] font-bold text-stone-500 uppercase">Monto Inicial</span>
                <div className="text-lg font-mono font-black text-stone-900 mt-1">
                  ₡{Math.round(register.openingBalance).toLocaleString('es-CR')}
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
                <span className="text-[11px] font-bold text-stone-500 uppercase">Ventas Efectivo</span>
                <div className="text-lg font-mono font-black text-emerald-700 mt-1">
                  ₡{Math.round(register.cashSales).toLocaleString('es-CR')}
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
                <span className="text-[11px] font-bold text-stone-500 uppercase">Ventas Tarjeta / SINPE</span>
                <div className="text-lg font-mono font-black text-blue-700 mt-1">
                  ₡{Math.round(register.cardSales + register.sinpeSales).toLocaleString('es-CR')}
                </div>
              </div>
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 shadow-xs">
                <span className="text-[11px] font-bold text-amber-800 uppercase">Efectivo Esperado</span>
                <div className="text-xl font-mono font-black text-amber-950 mt-1">
                  ₡{Math.round(register.expectedCash).toLocaleString('es-CR')}
                </div>
              </div>
            </div>

            {/* In/Out Movement Form & Close Box */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Add movement */}
              <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider">
                  Registrar Movimiento de Caja
                </h3>
                <form onSubmit={handleAddMovement} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMovType('INGRESO')}
                      className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                        movType === 'INGRESO'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-stone-100 text-stone-700'
                      }`}
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      <span>Ingreso Extra</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovType('EGRESO')}
                      className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                        movType === 'EGRESO'
                          ? 'bg-rose-600 text-white'
                          : 'bg-stone-100 text-stone-700'
                      }`}
                    >
                      <ArrowDownRight className="w-4 h-4" />
                      <span>Salida / Gasto</span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Monto (₡):</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={movAmount}
                      onChange={e => setMovAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 text-xs font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Concepto / Motivo:</label>
                    <input
                      type="text"
                      placeholder="Ej. Compra de bolsas, cambio, etc."
                      value={movConcept}
                      onChange={e => setMovConcept(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs cursor-pointer transition-colors"
                  >
                    Guardar Movimiento
                  </button>
                </form>
              </div>

              {/* Close Register */}
              <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-rose-900 uppercase tracking-wider flex items-center gap-2">
                  <Lock className="w-4 h-4 text-rose-600" />
                  Cierre de Turno & Arqueo
                </h3>
                <form onSubmit={handleClose} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Efectivo Real en Gaveta (₡):</label>
                    <input
                      type="number"
                      placeholder="Cuenta física del efectivo..."
                      value={closeActualCash}
                      onChange={e => setCloseActualCash(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 text-xs font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Notas del Cierre:</label>
                    <textarea
                      rows={2}
                      placeholder="Observaciones de turno..."
                      value={closeNotes}
                      onChange={e => setCloseNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs cursor-pointer transition-colors shadow-md"
                  >
                    Confirmar Arqueo y Cerrar Caja
                  </button>
                </form>
              </div>

            </div>

          </div>
        ) : (
          /* Open Register Form */
          <div className="max-w-md mx-auto bg-white p-6 rounded-3xl border border-stone-200 shadow-lg text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-800 mx-auto flex items-center justify-center">
              <Unlock className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-black text-stone-900">Abrir Turno de Caja</h3>
              <p className="text-xs text-stone-500 mt-1">Ingresa el fondo inicial de cambio para comenzar a facturar</p>
            </div>
            <form onSubmit={handleOpen} className="space-y-3 text-left">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Fondo Inicial de Efectivo (₡):</label>
                <input
                  type="number"
                  placeholder="Ej. 25000"
                  value={openingBalance}
                  onChange={e => setOpeningBalance(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-sm font-mono font-bold"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs shadow-md transition-all cursor-pointer"
              >
                Abrir Caja Ahora
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
};
