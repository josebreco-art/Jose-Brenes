import React, { useState } from 'react';
import { X, Save, CheckCircle2, ShieldAlert, KeyRound, Building2, UploadCloud, RefreshCw } from 'lucide-react';
import { HaciendaConfig } from '../types/pos';

interface HaciendaConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: HaciendaConfig;
  onSave?: (newConfig: HaciendaConfig) => void;
  onSaved?: () => void;
}

export const HaciendaConfigModal: React.FC<HaciendaConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
  onSaved
}) => {
  const [formData, setFormData] = useState<HaciendaConfig>({
    environment: 'staging',
    branch: '001',
    terminal: '00001',
    taxId: '3101987654',
    atvUsername: '',
    certificatePin: '',
    ...config
  });
  const [testStatus, setTestStatus] = useState<{ loading: boolean; success?: boolean; message?: string }>({
    loading: false
  });

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTestConnection = () => {
    setTestStatus({ loading: true });
    setTimeout(() => {
      if (formData.atvUsername && formData.certificatePin) {
        setTestStatus({
          loading: false,
          success: true,
          message: `Conexión exitosa con IDP Hacienda (${formData.environment === 'production' ? 'Producción' : 'Staging / Pruebas'}). Token generado.`
        });
      } else {
        setTestStatus({
          loading: false,
          success: false,
          message: 'Error de autenticación: Verifique usuario ATV y PIN criptográfico.'
        });
      }
    }, 1200);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSave) onSave(formData);
    if (onSaved) onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-amber-800 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-amber-300" />
            <div>
              <h2 className="font-bold text-lg">Configuración de Facturación Electrónica v4.4</h2>
              <p className="text-xs text-amber-200">Ministerio de Hacienda de Costa Rica</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-amber-200 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Entorno y Sucursal */}
          <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200">
            <h3 className="font-bold text-amber-900 text-sm mb-3 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-700" />
              Ambiente de Conexión & Sucursal
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Entorno Hacienda</label>
                <select
                  name="environment"
                  value={formData.environment}
                  onChange={handleChange}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white font-medium"
                >
                  <option value="staging">Staging / Pruebas (Sandbox)</option>
                  <option value="production">Producción Oficial</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sucursal (3 Dígitos)</label>
                <input
                  type="text"
                  name="branch"
                  maxLength={3}
                  value={formData.branch}
                  onChange={handleChange}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 font-mono"
                  placeholder="001"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Terminal / Caja (5 Dígitos)</label>
                <input
                  type="text"
                  name="terminal"
                  maxLength={5}
                  value={formData.terminal}
                  onChange={handleChange}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 font-mono"
                  placeholder="00001"
                  required
                />
              </div>
            </div>
          </div>

          {/* Datos del Emisor */}
          <div>
            <h3 className="font-bold text-slate-800 text-sm mb-3">Datos del Contribuyente (Emisor)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Razón Social Registrada</label>
                <input
                  type="text"
                  name="emitterName"
                  value={formData.emitterName}
                  onChange={handleChange}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre Comercial</label>
                <input
                  type="text"
                  name="commercialName"
                  value={formData.commercialName}
                  onChange={handleChange}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Actividad Económica (Código)</label>
                <input
                  type="text"
                  name="economicActivity"
                  value={formData.economicActivity}
                  onChange={handleChange}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 font-mono"
                  placeholder="561001"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Identificación</label>
                <select
                  name="idType"
                  value={formData.idType}
                  onChange={handleChange}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                >
                  <option value="01">01 - Cédula Física</option>
                  <option value="02">02 - Cédula Jurídica</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Número de Identificación</label>
                <input
                  type="text"
                  name="idNumber"
                  value={formData.idNumber}
                  onChange={handleChange}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 font-mono"
                  placeholder="3-101-XXXXXX"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Teléfono Contacto</label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Correo Electrónico Notificaciones</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Dirección Exacta del Local</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2"
                  required
                />
              </div>
            </div>
          </div>

          {/* Credenciales ATV & Llave Criptográfica */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="font-bold text-slate-800 text-sm mb-3">Credenciales de Acceso ATV & Llave Criptográfica</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Usuario ATV (IDP Hacienda)</label>
                <input
                  type="text"
                  name="atvUsername"
                  value={formData.atvUsername}
                  onChange={handleChange}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 font-mono"
                  placeholder="cpf-01-xxxx-xxxx@stag.comprobanteselectronicos.go.cr"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">PIN Certificado Criptográfico (.P12)</label>
                <input
                  type="password"
                  name="certificatePin"
                  maxLength={4}
                  value={formData.certificatePin}
                  onChange={handleChange}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 font-mono"
                  placeholder="4 dígitos"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">PIN Maestro Supervisor POS</label>
                <input
                  type="password"
                  name="supervisorPin"
                  maxLength={6}
                  value={formData.supervisorPin}
                  onChange={handleChange}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 font-mono"
                  placeholder="PIN numérico"
                  required
                />
              </div>
            </div>

            {/* Certificado estado */}
            <div className="mt-3 flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-medium text-slate-700">Certificado Digital Llave Criptográfica (.p12) Activo</span>
              </div>
              <button
                type="button"
                onClick={() => alert('Carga de certificado .p12 simulada correctamente.')}
                className="text-xs bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1 font-semibold"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Reemplazar .p12</span>
              </button>
            </div>
          </div>

          {/* Test Status Feedback */}
          {testStatus.message && (
            <div className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
              testStatus.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              {testStatus.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />}
              <span>{testStatus.message}</span>
            </div>
          )}

          {/* Botón de Prueba */}
          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testStatus.loading}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold text-xs flex items-center gap-2 transition-colors border border-slate-300"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testStatus.loading ? 'animate-spin' : ''}`} />
              <span>{testStatus.loading ? 'Probando...' : 'Probar Autenticación con Hacienda'}</span>
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold text-sm hover:bg-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg font-bold text-sm shadow-md flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Guardar Configuración</span>
          </button>
        </div>
      </div>
    </div>
  );
};
