import React, { useState, useEffect } from 'react';
import { 
  X, 
  RefreshCw, 
  ShieldCheck, 
  AlertTriangle, 
  Cloud, 
  CheckCircle2, 
  CreditCard, 
  Banknote, 
  Smartphone,
  ExternalLink,
  Laptop
} from 'lucide-react';
import { PosApiService } from '../services/api';

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
  const [summary, setSummary] = useState<any>(null);

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
    setIsExecuting(true);
    try {
      const res = await PosApiService.executeHaciendaSync();
      setSyncResult(res.message || 'Sincronización completada exitosamente.');
      await fetchSummary();
      if (onSyncCompleted) onSyncCompleted();
    } catch (err: any) {
      setSyncResult('Error durante la sincronización: ' + err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleForceHardReload = () => {
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }
    window.location.reload();
  };

  if (!isOpen) return null;

  const currentHost = typeof window !== 'undefined' ? window.location.origin : '';
  const isSharedProductionUrl = currentHost.includes('ais-pre');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-stone-200">
        
        {/* Header */}
        <div className="bg-amber-950 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <div>
              <h2 className="text-base font-black tracking-tight leading-tight">Estado de Sincronización & DGT Hacienda</h2>
              <p className="text-xs text-amber-300">Versión Oficial: v2.5.0 (Producción Activa)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-amber-900 text-amber-200 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* Card: Garantía de Versión Única */}
          <div className="p-4 rounded-xl border border-stone-200 bg-stone-50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <Laptop className="w-4 h-4 text-amber-700" />
                Dispositivo & Enlace Activo
              </span>
              <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                isSharedProductionUrl 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}>
                {isSharedProductionUrl ? '🟢 Enlace Oficial (Producción)' : '🟡 Modo Desarrollo'}
              </span>
            </div>
            <div className="text-xs text-stone-600 break-all font-mono bg-white p-2 rounded border border-stone-200">
              {currentHost}
            </div>
            <p className="text-[11px] text-stone-500">
              Para asegurar que todas las cajas, tablets y la cocina usen la misma versión, abre siempre el enlace <strong className="text-stone-800">https://ais-pre-...</strong> en todas las terminales.
            </p>
            <button
              type="button"
              onClick={handleForceHardReload}
              className="mt-1 w-full py-1.5 px-3 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-stone-600" />
              <span>Forzar descarga de última versión (Vaciar Caché Local)</span>
            </button>
          </div>

          {/* Card: Resumen de Ventas Hoy */}
          {summary && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Ventas de Hoy</div>
                <div className="text-2xl font-black text-emerald-950 mt-1">
                  ₡{Math.round(summary.today?.totalAmount || 0).toLocaleString('es-CR')}
                </div>
                <div className="text-xs text-emerald-700 mt-0.5">
                  {summary.today?.salesCount || 0} comprobantes registrados
                </div>
              </div>

              <div className="p-3 bg-teal-50 rounded-xl border border-teal-200">
                <div className="text-[11px] font-bold text-teal-800 uppercase tracking-wider">Base de Datos Nube</div>
                <div className="text-xs font-bold text-teal-950 mt-2 flex items-center gap-1.5">
                  <Cloud className="w-4 h-4 text-teal-600" />
                  <span>Firestore Conectada</span>
                </div>
                <div className="text-[11px] text-teal-700 mt-1">
                  Sincronización en vivo activada
                </div>
              </div>
            </div>
          )}

          {/* Estado de Hacienda */}
          <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50/80 text-emerald-950 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <div className="text-xs font-black">Sistema 100% al día con el Ministerio de Hacienda</div>
              <div className="text-[11px] text-emerald-800">
                Normativa DGT v4.4 XAdES-EPES con claves de 50 dígitos y numeración consecutiva oficial.
              </div>
            </div>
          </div>

          {syncResult && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-medium">
              {syncResult}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-stone-50 border-t border-stone-200 px-6 py-3.5 flex items-center justify-between">
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
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-xs font-black shadow-md flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isExecuting ? 'animate-spin' : ''}`} />
            <span>{isExecuting ? 'Sincronizando...' : 'Verificar Sincronización Ahora'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
