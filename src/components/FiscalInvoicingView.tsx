import React, { useState, useEffect } from 'react';
import { HaciendaDirectConfig } from '../types/pos';
import { ShieldCheck, Send, CheckCircle2, AlertTriangle, Key, Building, Mail, FileText, RefreshCw } from 'lucide-react';
import { PosApiService } from '../services/api';

export const FiscalInvoicingView: React.FC = () => {
  const [config, setConfig] = useState<HaciendaDirectConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    PosApiService.getHaciendaConfig().then(cfg => setConfig(cfg));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setIsSaving(true);
    try {
      const updated = await PosApiService.saveHaciendaConfig(config);
      setConfig(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert('Error al guardar configuración: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!config) {
    return <div className="p-8 text-center text-stone-500">Cargando configuración tributaria...</div>;
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-stone-100">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Banner */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 rounded-3xl p-6 text-white shadow-xl flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-7 h-7 text-emerald-300" />
              <h2 className="text-xl font-black tracking-tight">Facturación Electrónica DGT Costa Rica</h2>
            </div>
            <p className="text-xs text-emerald-200">
              Motor Autónomo Versión 4.4 Oficial • Firma XAdES-EPES con Llave Criptográfica .p12
            </p>
          </div>
          <div className="px-3.5 py-1.5 rounded-full bg-emerald-700/60 border border-emerald-500/50 text-xs font-mono font-bold text-emerald-100">
            {config.environment === 'production' ? '🟢 PRODUCCIÓN OFICIAL' : '🟡 MODO PRUEBAS (STAGING)'}
          </div>
        </div>

        {/* Configuration Form */}
        <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 border border-stone-200 shadow-md space-y-6">
          
          <div className="border-b border-stone-200 pb-4">
            <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider flex items-center gap-2">
              <Building className="w-4 h-4 text-amber-700" />
              Datos del Emisor Tributario (Restaurante)
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">Información registrada en el ATV del Ministerio de Hacienda</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Cédula Tributaria (Emisor):</label>
              <input
                type="text"
                value={config.emisorTaxId}
                onChange={e => setConfig({ ...config, emisorTaxId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Nombre o Razón Social:</label>
              <input
                type="text"
                value={config.emisorName}
                onChange={e => setConfig({ ...config, emisorName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Nombre Comercial:</label>
              <input
                type="text"
                value={config.emisorCommercialName}
                onChange={e => setConfig({ ...config, emisorCommercialName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Correo Notificaciones Hacienda:</label>
              <input
                type="email"
                value={config.emisorEmail}
                onChange={e => setConfig({ ...config, emisorEmail: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Código Actividad Económica:</label>
              <input
                type="text"
                value={config.emisorEconomicActivity}
                onChange={e => setConfig({ ...config, emisorEconomicActivity: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Ubicación / Sucursal:</label>
              <input
                type="text"
                value={`${config.emisorAddressDetail || 'Cervantes, Cartago'}`}
                onChange={e => setConfig({ ...config, emisorAddressDetail: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 text-xs"
              />
            </div>
          </div>

          <div className="border-t border-stone-200 pt-4">
            <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-700" />
              Credenciales ATV & Firma Digital
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">Usuario de comprobantes electrónicos y llave criptográfica</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Usuario ATV (ID Comprobante):</label>
              <input
                type="text"
                value={config.haciendaUsername || ''}
                onChange={e => setConfig({ ...config, haciendaUsername: e.target.value })}
                placeholder="cpf-03-0268-0311@stag.tribunet.hacienda.go.cr"
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">PIN Llave Criptográfica (4 dígitos):</label>
              <input
                type="password"
                maxLength={4}
                value={config.cryptographicKeyPin || ''}
                onChange={e => setConfig({ ...config, cryptographicKeyPin: e.target.value })}
                placeholder="••••"
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 text-xs font-mono"
              />
            </div>
          </div>

          {/* Consecutive Controls */}
          <div className="border-t border-stone-200 pt-4">
            <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-700" />
              Control de Consecutivos Oficiales
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="text-[11px] font-bold text-stone-500">Tiquetes (TE):</span>
                <div className="text-lg font-mono font-black text-stone-900 mt-0.5">
                  #{config.lastTiqueteNumber || 1}
                </div>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="text-[11px] font-bold text-stone-500">Facturas (FE):</span>
                <div className="text-lg font-mono font-black text-stone-900 mt-0.5">
                  #{config.lastFacturaNumber || 1}
                </div>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="text-[11px] font-bold text-stone-500">Notas de Crédito:</span>
                <div className="text-lg font-mono font-black text-stone-900 mt-0.5">
                  #{config.lastNotaCreditoNumber || 1}
                </div>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="text-[11px] font-bold text-stone-500">Notas de Débito:</span>
                <div className="text-lg font-mono font-black text-stone-900 mt-0.5">
                  #{config.lastNotaDebitoNumber || 1}
                </div>
              </div>
            </div>
          </div>

          {saveSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Configuración fiscal guardada y sincronizada correctamente.</span>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-black text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Guardando...' : 'Guardar Parámetros Fiscales'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
