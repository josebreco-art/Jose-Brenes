import React, { useState, useEffect } from 'react';
import { 
  X, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Cloud, 
  ShieldCheck, 
  Receipt, 
  CreditCard, 
  Banknote, 
  Smartphone,
  Send,
  Calendar,
  Sparkles
} from 'lucide-react';
import { PosApiService } from '../services/api';
import { offlineStorage } from '../services/offlineStorageService';

interface SyncStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncCompleted?: () => void;
}

export const SyncStatusModal: React.FC<SyncStatusModalProps> = ({
  isOpen,
  onClose,
  onSyncCompleted
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    timestamp: number;
    todayStr: string;
    yesterdayStr: string;
    isDbConnected: boolean;
    today: {
      salesCount: number;
      totalAmount: number;
      pendingCount: number;
      acceptedCount: number;
    };
    yesterday: {
      salesCount: number;
      totalAmount: number;
      pendingCount: number;
      acceptedCount: number;
    };
    totalPendingOverall: number;
    paymentTotalsToday: {
      cash: number;
      card: number;
      sinpe: number;
      other: number;
    };
  } | null>(null);

  const fetchSummary = async () => {
    setIsLoading(true);
    setSyncResult(null);
    try {
      const data = await PosApiService.getSyncSummary();
      if (data.success) {
        setSummary(data);
      }
    } catch (err: any) {
      console.warn('⚠️ Error al consultar resumen de sincronización:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSummary();
    }
  }, [isOpen]);

  const handleExecuteSync = async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    setSyncResult(null);
    try {
      // 1. Obtener ventas locales pendientes de IndexedDB (a partir de 2026-10-23: Tiquetes 04 2 días, Facturas Electrónicas 01 1 semana)
      let localPending: any[] = [];
      try {
        const FISCAL_RULES_START_DATE = '2026-10-23';
        const local = await offlineStorage.getOfflineSales();
        const rawMinDateTE = summary?.yesterdayStr || '';
        const rawOneWeekAgoDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const minDateTE = (!rawMinDateTE || rawMinDateTE < FISCAL_RULES_START_DATE) ? FISCAL_RULES_START_DATE : rawMinDateTE;
        const minDateFE = rawOneWeekAgoDate < FISCAL_RULES_START_DATE ? FISCAL_RULES_START_DATE : rawOneWeekAgoDate;
        localPending = (local || []).filter(s => {
          if (s.invoiceStatus === 'INVOICED' && s.numericKey50 && s.consecutive20) return false;
          if (s.haciendaStatus === 'CONTINGENCIA_VENCIDA') return false;
          const isFE = s.electronicDocumentType === '01' || Boolean(s.customerIdentification && s.customerIdentification !== '000000000' && s.customerId !== 'cust-final');
          const cutoff = isFE ? minDateFE : minDateTE;
          if (!s.date || s.date < cutoff) return false;
          return true;
        });
      } catch (e) {
        // non-blocking
      }

      // 2. Disparar sincronización total y emisión inmediata en el backend
      const result = await PosApiService.executeFullSync(localPending);
      setSyncResult(result.message || 'Sincronización y emisión ejecutada exitosamente.');

      // 3. Refrescar métricas del modal
      await fetchSummary();

      // 4. Notificar al componente padre para que actualice la vista si es necesario
      if (onSyncCompleted) {
        onSyncCompleted();
      }
    } catch (err: any) {
      setSyncResult(`Error: ${err.message || 'No se pudo completar la sincronización'}`);
    } finally {
      setIsExecuting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header Modal */}
        <div className="bg-gradient-to-r from-amber-950 via-stone-900 to-amber-950 text-white px-6 py-4 flex items-center justify-between border-b border-amber-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <RefreshCw className={`w-5 h-5 ${isExecuting || isLoading ? 'animate-spin text-amber-300' : ''}`} />
            </div>
            <div>
              <h2 className="text-base font-black tracking-wide flex items-center gap-2">
                Centro de Sincronización & Hacienda
              </h2>
              <p className="text-xs text-amber-200/80">
                Auditoría en vivo de comandas, formas de pago y comprobantes electrónicos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido Principal */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Barra de Estado de Conexión de Base de Datos */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <div>
                <span className="font-bold text-stone-800">Base de Datos Central en la Nube: </span>
                <span className="font-semibold text-emerald-700">Firebase Firestore Conectado</span>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchSummary}
              disabled={isLoading || isExecuting}
              className="text-amber-700 hover:text-amber-900 font-bold flex items-center gap-1 hover:underline cursor-pointer disabled:opacity-50"
              title="Refrescar estado en vivo"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refrescar</span>
            </button>
          </div>

          {/* Mensaje de Resultado de Acción */}
          {syncResult && (
            <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 border ${
              syncResult.startsWith('Error') 
                ? 'bg-rose-50 border-rose-200 text-rose-800' 
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
              {syncResult.startsWith('Error') ? (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              )}
              <span>{syncResult}</span>
            </div>
          )}

          {/* Tarjetas Comparativas: Hoy vs Ayer */}
          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Tarjeta Hoy */}
              <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/80 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-black text-amber-950 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-amber-700" />
                    Jornada de Hoy ({summary.todayStr})
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-200/60 text-amber-900">
                    {summary.today.salesCount} comandas
                  </span>
                </div>
                <div className="text-xl font-black text-stone-900">
                  ₡{Math.round(summary.today.totalAmount).toLocaleString('es-CR')}
                </div>
                <div className="pt-2 border-t border-amber-200/60 space-y-1 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-stone-600">Aceptados Hacienda:</span>
                    <span className="font-black text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {summary.today.acceptedCount}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-stone-600">Pendientes por Emitir:</span>
                    <span className={`font-black ${summary.today.pendingCount > 0 ? 'text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md' : 'text-stone-500'}`}>
                      {summary.today.pendingCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tarjeta Ayer */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-black text-stone-800 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-stone-600" />
                    Jornada de Ayer ({summary.yesterdayStr})
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-stone-200 text-stone-800">
                    {summary.yesterday.salesCount} comandas
                  </span>
                </div>
                <div className="text-xl font-black text-stone-900">
                  ₡{Math.round(summary.yesterday.totalAmount).toLocaleString('es-CR')}
                </div>
                <div className="pt-2 border-t border-stone-200 space-y-1 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-stone-600">Aceptados Hacienda:</span>
                    <span className="font-black text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {summary.yesterday.acceptedCount}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-stone-600">Pendientes por Emitir:</span>
                    <span className={`font-black ${summary.yesterday.pendingCount > 0 ? 'text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md' : 'text-emerald-700'}`}>
                      {summary.yesterday.pendingCount === 0 ? '0 (Al Día)' : summary.yesterday.pendingCount}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Cuadre de Formas de Pago de Hoy */}
          {summary && (
            <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-xs space-y-3">
              <div className="text-xs font-black text-stone-800 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-amber-700" />
                Desglose por Formas de Pago Registradas (Hoy)
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                
                <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200">
                  <div className="flex items-center gap-1 text-emerald-800 font-bold mb-1">
                    <Banknote className="w-3.5 h-3.5" />
                    <span>Efectivo</span>
                  </div>
                  <div className="font-black text-stone-900 text-sm">
                    ₡{Math.round(summary.paymentTotalsToday.cash).toLocaleString('es-CR')}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-200">
                  <div className="flex items-center gap-1 text-blue-800 font-bold mb-1">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Tarjeta</span>
                  </div>
                  <div className="font-black text-stone-900 text-sm">
                    ₡{Math.round(summary.paymentTotalsToday.card).toLocaleString('es-CR')}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-purple-50/60 border border-purple-200">
                  <div className="flex items-center gap-1 text-purple-800 font-bold mb-1">
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>SINPE Móvil</span>
                  </div>
                  <div className="font-black text-stone-900 text-sm">
                    ₡{Math.round(summary.paymentTotalsToday.sinpe).toLocaleString('es-CR')}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Estado de Alerta General */}
          {summary && (
            <div className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
              summary.totalPendingOverall > 0 
                ? 'bg-amber-50 border-amber-300 text-amber-900' 
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}>
              <div className="flex items-center gap-3">
                {summary.totalPendingOverall > 0 ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                ) : (
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                )}
                <div>
                  <div className="font-black">
                    {summary.totalPendingOverall > 0 
                      ? `${summary.totalPendingOverall} comprobante(s) pendiente(s) de emitir a Hacienda`
                      : 'Sistema 100% al día con el Ministerio de Hacienda'}
                  </div>
                  <div className="text-[11px] opacity-80">
                    {summary.totalPendingOverall > 0 
                      ? 'Haz clic en el botón de abajo para sincronizar con la nube y transmitirlos de inmediato.'
                      : 'Todas las ventas registradas ya cuentan con su Clave Oficial de 50 dígitos.'}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer con Botón de Acción Principal */}
        <div className="bg-stone-50 border-t border-stone-200 px-6 py-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-bold cursor-pointer transition-colors"
          >
            Cerrar
          </button>

          <button
            type="button"
            onClick={handleExecuteSync}
            disabled={isExecuting || isLoading}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 active:scale-95 text-white text-xs font-black shadow-md flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isExecuting ? 'animate-spin' : ''}`} />
            <span>{isExecuting ? 'Sincronizando & Emitiendo a Hacienda...' : 'Sincronizar Todo & Emitir Pendientes'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
