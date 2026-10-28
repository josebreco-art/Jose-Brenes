import React, { useState, useEffect } from 'react';
import { 
  KeyRound, 
  ShieldCheck, 
  Upload, 
  Download,
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  FileText, 
  Hash, 
  RefreshCw, 
  Building2, 
  Save, 
  Eye, 
  EyeOff, 
  Server, 
  AlertTriangle,
  Radio,
  FileCode,
  Check,
  Send,
  Mail,
  Inbox
} from 'lucide-react';
import { HaciendaDirectConfig, ConsecutiveControl } from '../types/pos';
import { PosApiService } from '../services/api';
import { EconomicActivityPicker } from './EconomicActivityPicker';

export const HaciendaConfigModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}> = ({ isOpen, onClose, onSaved }) => {
  const [config, setConfig] = useState<HaciendaDirectConfig | null>(null);
  const [consecutives, setConsecutives] = useState<ConsecutiveControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  
  // Test results state
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
    tokenExpiresIn?: number;
    keyValidation?: any;
  } | null>(null);

  const [emailTestResult, setEmailTestResult] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);

  // Form states for manual consecutive settings (6 tipos oficiales DGT v4.4)
  const [lastFactura, setLastFactura] = useState<number>(0);
  const [lastNotaDebito, setLastNotaDebito] = useState<number>(0);
  const [lastNotaCredito, setLastNotaCredito] = useState<number>(0);
  const [lastTiquete, setLastTiquete] = useState<number>(0);
  const [lastFacturaCompra, setLastFacturaCompra] = useState<number>(0);
  const [lastReciboPago, setLastReciboPago] = useState<number>(0);

  // File Upload State for Cryptographic Key (.p12)
  const [certFileName, setCertFileName] = useState<string>('');
  const [certBase64, setCertBase64] = useState<string>('');
  const [certError, setCertError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const sanitizeSeqInput = (val: any): number => {
    if (typeof val === 'number') {
      if (isNaN(val)) return 0;
      if (val > 9999999999) return val % 10000000000;
      return val;
    }
    const str = String(val || '').replace(/\D/g, '');
    if (!str) return 0;
    if (str.length >= 10) {
      return parseInt(str.slice(-10), 10) || 0;
    }
    return parseInt(str, 10) || 0;
  };

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await PosApiService.getHaciendaDirectConfig();
      setConfig(data.config);
      setConsecutives(data.consecutives);
      
      // Encontrar últimos números de las secuencias para los 6 comprobantes directamente de Firestore
      const feSeq = data.consecutives.find(c => c.documentType === '01');
      const ndSeq = data.consecutives.find(c => c.documentType === '02');
      const ncSeq = data.consecutives.find(c => c.documentType === '03');
      const teSeq = data.consecutives.find(c => c.documentType === '04');
      const fecSeq = data.consecutives.find(c => c.documentType === '05');
      const repSeq = data.consecutives.find(c => c.documentType === '06');

      setLastFactura(feSeq?.lastSequenceNumber !== undefined ? feSeq.lastSequenceNumber : sanitizeSeqInput(data.config.lastFacturaNumber));
      setLastNotaDebito(ndSeq?.lastSequenceNumber !== undefined ? ndSeq.lastSequenceNumber : sanitizeSeqInput(data.config.lastNotaDebitoNumber));
      setLastNotaCredito(ncSeq?.lastSequenceNumber !== undefined ? ncSeq.lastSequenceNumber : sanitizeSeqInput(data.config.lastNotaCreditoNumber));
      setLastTiquete(teSeq?.lastSequenceNumber !== undefined ? teSeq.lastSequenceNumber : sanitizeSeqInput(data.config.lastTiqueteNumber));
      setLastFacturaCompra(fecSeq?.lastSequenceNumber !== undefined ? fecSeq.lastSequenceNumber : sanitizeSeqInput(data.config.lastFacturaCompraNumber));
      setLastReciboPago(repSeq?.lastSequenceNumber !== undefined ? repSeq.lastSequenceNumber : sanitizeSeqInput(data.config.lastReciboPagoNumber));

      if (data.config.cryptographicKeyFileName) {
        setCertFileName(data.config.cryptographicKeyFileName);
      }
      if (data.config.cryptographicKeyBase64) {
        setCertBase64(data.config.cryptographicKeyBase64);
      }
    } catch (e) {
      console.warn('Error loading hacienda config:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCertError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.p12') && !file.name.toLowerCase().endsWith('.pfx')) {
      setCertError('El archivo debe ser un certificado en formato .p12 o .pfx expedido por el portal ATV del Ministerio de Hacienda.');
      return;
    }

    setCertFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      if (arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        setCertBase64(base64);
        if (config) {
          setConfig({
            ...config,
            cryptographicKeyFileName: file.name,
            cryptographicKeyBase64: base64,
            cryptographicKeyStatus: 'LOADED'
          });
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const payload: Partial<HaciendaDirectConfig> = {
        ...config,
        lastFacturaNumber: Number(lastFactura),
        lastNotaDebitoNumber: Number(lastNotaDebito),
        lastNotaCreditoNumber: Number(lastNotaCredito),
        lastTiqueteNumber: Number(lastTiquete),
        lastFacturaCompraNumber: Number(lastFacturaCompra),
        lastReciboPagoNumber: Number(lastReciboPago),
        cryptographicKeyFileName: certFileName,
        cryptographicKeyBase64: certBase64,
        cryptographicKeyStatus: certBase64 ? 'LOADED' : 'NOT_CONFIGURED'
      };

      const res = await PosApiService.saveHaciendaDirectConfig(payload);
      if (res.success) {
        // Actualizar números de los 6 tipos de consecutivos en el servidor
        await PosApiService.setConsecutives({
          branch: config.branch || '001',
          terminal: config.terminal || '00001',
          lastFacturaNumber: Number(lastFactura),
          lastNotaDebitoNumber: Number(lastNotaDebito),
          lastNotaCreditoNumber: Number(lastNotaCredito),
          lastTiqueteNumber: Number(lastTiquete),
          lastFacturaCompraNumber: Number(lastFacturaCompra),
          lastReciboPagoNumber: Number(lastReciboPago)
        });

        if (onSaved) onSaved();
        onClose();
      }
    } catch (e: any) {
      alert('Error al guardar configuración: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!config) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await PosApiService.testHaciendaConnection({
        username: config.haciendaUsername,
        password: config.haciendaPassword,
        environment: config.environment,
        p12Base64: certBase64,
        pin: config.cryptographicKeyPin
      });
      setTestResult(res);
    } catch (e: any) {
      setTestResult({
        success: false,
        message: 'Error al conectar con Hacienda: ' + e.message
      });
    } finally {
      setTesting(false);
    }
  };

  const handleTestEmailConnection = async () => {
    if (!config) return;
    setTestingEmail(true);
    setEmailTestResult(null);
    try {
      const res = await PosApiService.testEmailConnection({
        emailSmtpHost: config.emailSmtpHost,
        emailSmtpPort: config.emailSmtpPort,
        emailSmtpSecure: config.emailSmtpSecure,
        emailSmtpUser: config.emailSmtpUser,
        emailSmtpPassword: config.emailSmtpPassword,
        emailSenderAddress: config.emailSenderAddress,
        emailSenderName: config.emailSenderName
      });
      setEmailTestResult(res);
    } catch (e: any) {
      setEmailTestResult({
        success: false,
        message: 'Error al probar servidor SMTP: ' + e.message
      });
    } finally {
      setTestingEmail(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-900 via-stone-900 to-amber-950 text-white p-6 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight">Facturación Electrónica Autónoma (DGT v4.4)</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                  Costa Rica
                </span>
              </div>
              <p className="text-xs text-stone-300">
                Control total de Consecutivos (Factura / Tiquete), Llave Criptográfica (.p12), PIN y credenciales ATV
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors font-bold"
          >
            ✕
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {loading || !config ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-stone-500">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="font-bold">Cargando configuración fiscal de Hacienda...</p>
            </div>
          ) : (
            <>
              {/* Top Warning / Banner */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-emerald-900 text-sm">
                    Modo Autónomo e Independiente Habilitado
                  </p>
                  <p className="text-emerald-800 leading-relaxed">
                    Este sistema genera la Clave de 50 dígitos, estructura el XML XAdES-EPES versión 4.4 oficial de Costa Rica, controla la numeración de 20 dígitos y se comunica directamente con los servidores del Ministerio de Hacienda sin intermediarios de suscripción.
                  </p>
                </div>
              </div>

              {/* Datos del Obligado Tributario / Emisor & Actividad Económica Principal */}
              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-amber-700" />
                    <div>
                      <h3 className="font-extrabold text-stone-900 text-sm">Datos del Obligado Tributario / Emisor (Hacienda)</h3>
                      <p className="text-[11px] text-stone-500">Razón social, cédula y actividad económica principal que encabeza los XML oficiales.</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Emisor Activo
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-stone-700 block mb-1">Nombre o Razón Social:</label>
                    <input
                      type="text"
                      value={config.emisorName || ''}
                      onChange={(e) => setConfig({ ...config, emisorName: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      placeholder="Ej: Pollo Frito Sabor Cervanteño S.A."
                    />
                  </div>

                  <div>
                    <label className="font-bold text-stone-700 block mb-1">Nombre Comercial:</label>
                    <input
                      type="text"
                      value={config.emisorCommercialName || ''}
                      onChange={(e) => setConfig({ ...config, emisorCommercialName: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      placeholder="Ej: Pollo Frito Sabor Cervanteño"
                    />
                  </div>
                </div>

                {/* Progressive Economic Activity Picker for Emisor */}
                <div className="pt-1">
                  <EconomicActivityPicker
                    value={config.emisorEconomicActivity || '5610.0'}
                    onChange={(code) => setConfig({ ...config, emisorEconomicActivity: code })}
                    label="Actividad Económica Principal del Emisor (CIIU4)"
                    helperText="Código oficial de 6 dígitos con el que está registrado el emisor ante el Ministerio de Hacienda en ATV."
                  />
                </div>
              </div>

              {/* Grid 1: Consecutivos y Control de Secuencia */}
              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                  <div className="flex items-center gap-2">
                    <Hash className="w-5 h-5 text-amber-700" />
                    <div>
                      <h3 className="font-extrabold text-stone-900 text-sm">Carga de Consecutivos Oficiales (Numeración DGT)</h3>
                      <p className="text-[11px] text-stone-500">Indique el último número emitido para que el sistema continúe la secuencia correlativa exacta.</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-stone-600 bg-white px-2.5 py-1 rounded-lg border border-stone-200">
                    Sucursal: <strong className="text-amber-800">{config.branch || '001'}</strong> • Terminal: <strong className="text-amber-800">{config.terminal || '00001'}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 01 - Factura Electrónica */}
                  <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-2xs space-y-2">
                    <label className="font-black text-stone-700 block flex items-center justify-between">
                      <span>01 - Factura Electrónica</span>
                      <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">FE</span>
                    </label>
                    <input 
                      type="number"
                      min="0"
                      value={lastFactura}
                      onChange={(e) => setLastFactura(sanitizeSeqInput(e.target.value))}
                      className="w-full text-base font-black px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none text-stone-800 bg-stone-50/50"
                      placeholder="Ej: 154"
                    />
                    <p className="text-[10px] text-stone-500">
                      Siguiente a emitir: <strong className="text-blue-700 font-mono">#{Number(lastFactura) + 1}</strong>
                    </p>
                  </div>

                  {/* 02 - Nota de Débito */}
                  <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-2xs space-y-2">
                    <label className="font-black text-stone-700 block flex items-center justify-between">
                      <span>02 - Nota de Débito</span>
                      <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-bold">ND</span>
                    </label>
                    <input 
                      type="number"
                      min="0"
                      value={lastNotaDebito}
                      onChange={(e) => setLastNotaDebito(sanitizeSeqInput(e.target.value))}
                      className="w-full text-base font-black px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none text-stone-800 bg-stone-50/50"
                      placeholder="Ej: 0"
                    />
                    <p className="text-[10px] text-stone-500">
                      Siguiente a emitir: <strong className="text-indigo-700 font-mono">#{Number(lastNotaDebito) + 1}</strong>
                    </p>
                  </div>

                  {/* 03 - Nota de Crédito */}
                  <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-2xs space-y-2">
                    <label className="font-black text-stone-700 block flex items-center justify-between">
                      <span>03 - Nota de Crédito</span>
                      <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-bold">NC</span>
                    </label>
                    <input 
                      type="number"
                      min="0"
                      value={lastNotaCredito}
                      onChange={(e) => setLastNotaCredito(sanitizeSeqInput(e.target.value))}
                      className="w-full text-base font-black px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none text-stone-800 bg-stone-50/50"
                      placeholder="Ej: 12"
                    />
                    <p className="text-[10px] text-stone-500">
                      Siguiente a emitir: <strong className="text-purple-700 font-mono">#{Number(lastNotaCredito) + 1}</strong>
                    </p>
                  </div>

                  {/* 04 - Tiquete Electrónico */}
                  <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-2xs space-y-2">
                    <label className="font-black text-stone-700 block flex items-center justify-between">
                      <span>04 - Tiquete Electrónico</span>
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">TE</span>
                    </label>
                    <input 
                      type="number"
                      min="0"
                      value={lastTiquete}
                      onChange={(e) => setLastTiquete(sanitizeSeqInput(e.target.value))}
                      className="w-full text-base font-black px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none text-stone-800 bg-stone-50/50"
                      placeholder="Ej: 2850"
                    />
                    <p className="text-[10px] text-stone-500">
                      Siguiente a emitir: <strong className="text-amber-700 font-mono">#{Number(lastTiquete) + 1}</strong>
                    </p>
                  </div>

                  {/* 05 - Factura Electrónica de Compra */}
                  <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-2xs space-y-2">
                    <label className="font-black text-stone-700 block flex items-center justify-between">
                      <span>05 - Factura de Compra</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">FEC</span>
                    </label>
                    <input 
                      type="number"
                      min="0"
                      value={lastFacturaCompra}
                      onChange={(e) => setLastFacturaCompra(sanitizeSeqInput(e.target.value))}
                      className="w-full text-base font-black px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none text-stone-800 bg-stone-50/50"
                      placeholder="Ej: 0"
                    />
                    <p className="text-[10px] text-stone-500">
                      Siguiente a emitir: <strong className="text-emerald-700 font-mono">#{Number(lastFacturaCompra) + 1}</strong>
                    </p>
                  </div>

                  {/* 06 - Recibo Electrónico de Pago */}
                  <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-2xs space-y-2">
                    <label className="font-black text-stone-700 block flex items-center justify-between">
                      <span>06 - Recibo de Pago</span>
                      <span className="text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded font-bold">REP</span>
                    </label>
                    <input 
                      type="number"
                      min="0"
                      value={lastReciboPago}
                      onChange={(e) => setLastReciboPago(sanitizeSeqInput(e.target.value))}
                      className="w-full text-base font-black px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none text-stone-800 bg-stone-50/50"
                      placeholder="Ej: 0"
                    />
                    <p className="text-[10px] text-stone-500">
                      Siguiente a emitir: <strong className="text-teal-700 font-mono">#{Number(lastReciboPago) + 1}</strong>
                    </p>
                  </div>
                </div>
              </div>

              {/* Grid 2: Llave Criptográfica (.p12) y PIN de 4 dígitos */}
              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                  <div className="flex items-center gap-2">
                    <Lock className="w-5 h-5 text-emerald-700" />
                    <div>
                      <h3 className="font-extrabold text-stone-900 text-sm">Llave Criptográfica y Firma Digital (.p12)</h3>
                      <p className="text-[11px] text-stone-500">Certificado PKCS#12 generado en el portal ATV para firmar los comprobantes XML.</p>
                    </div>
                  </div>
                  {certBase64 ? (
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" /> Llave Cargada
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-700" /> Pendiente de Adjuntar
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* File Upload .p12 */}
                  <div className="space-y-2">
                    <label className="font-bold text-stone-700 block">
                      Archivo de Llave Criptográfica (.p12 / .pfx)
                    </label>
                    <div className="relative border-2 border-dashed border-stone-300 hover:border-emerald-500 rounded-xl p-4 bg-white text-center cursor-pointer transition-colors">
                      <input 
                        type="file" 
                        accept=".p12,.pfx"
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                      <Upload className="w-6 h-6 text-stone-400 mx-auto mb-1.5" />
                      {certFileName ? (
                        <div>
                          <p className="font-black text-emerald-800 text-xs truncate max-w-xs mx-auto">{certFileName}</p>
                          <p className="text-[10px] text-stone-400 mt-0.5">Click para cambiar certificado</p>
                        </div>
                      ) : (
                        <div>
                          <p className="font-bold text-stone-700 text-xs">Haga click o arrastre su archivo .p12 aquí</p>
                          <p className="text-[10px] text-stone-400 mt-0.5">Descargado desde ATV Hacienda</p>
                        </div>
                      )}
                    </div>
                    {certFileName && (
                      <div className="pt-1">
                        <a 
                          href="/api/fiscal/download-cryptographic-key"
                          download={certFileName || 'llave_hacienda.p12'}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg transition-colors w-full justify-center shadow-xs"
                          title="Descargar una copia del archivo .p12 guardado en el servidor"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-700" />
                          Descargar copia de la llave (.p12)
                        </a>
                      </div>
                    )}
                    {certError && (
                      <p className="text-rose-600 font-bold text-[10px]">{certError}</p>
                    )}
                  </div>

                  {/* PIN de la Llave */}
                  <div className="space-y-2">
                    <label className="font-bold text-stone-700 block">
                      PIN de la Llave Criptográfica (4 dígitos)
                    </label>
                    <div className="relative">
                      <input 
                        type={showPin ? 'text' : 'password'}
                        maxLength={8}
                        value={config.cryptographicKeyPin || ''}
                        onChange={(e) => setConfig({ ...config, cryptographicKeyPin: e.target.value })}
                        className="w-full text-base font-black px-3 py-2.5 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none tracking-widest text-stone-800 bg-white"
                        placeholder="••••"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="absolute right-3 top-3 text-stone-400 hover:text-stone-600"
                      >
                        {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-stone-500">
                      PIN numérico configurado al momento de descargar la llave en ATV.
                    </p>
                  </div>
                </div>
              </div>

              {/* Grid 3: Credenciales ATV y Entorno de Hacienda */}
              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                  <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-blue-700" />
                    <div>
                      <h3 className="font-extrabold text-stone-900 text-sm">Credenciales ATV y Conexión Directa a Hacienda</h3>
                      <p className="text-[11px] text-stone-500">Usuario y contraseña creados en el menú "Comprobantes Electrónicos" de ATV.</p>
                    </div>
                  </div>

                  {/* Environment Switcher */}
                  <div className="flex bg-stone-200 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, environment: 'STAGING' })}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                        config.environment === 'STAGING'
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'text-stone-700 hover:text-stone-900'
                      }`}
                    >
                      STAGING (Pruebas)
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, environment: 'PRODUCTION' })}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                        config.environment === 'PRODUCTION'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-stone-700 hover:text-stone-900'
                      }`}
                    >
                      PRODUCCIÓN (Real)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Usuario ATV */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-stone-700 block">
                      Usuario ATV (IDP Hacienda)
                    </label>
                    <input 
                      type="text"
                      value={config.haciendaUsername || ''}
                      onChange={(e) => setConfig({ ...config, haciendaUsername: e.target.value })}
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                      placeholder="cpf-03-0101-0987@stag.tribunet.hacienda.go.cr"
                    />
                    <p className="text-[10px] text-stone-500">Formato: cpf-xx-xxxx-xxxx@stag o prod.tribunet.hacienda.go.cr</p>
                  </div>

                  {/* Contraseña ATV */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-stone-700 block">
                      Contraseña ATV
                    </label>
                    <div className="relative">
                      <input 
                        type={showPassword ? 'text' : 'password'}
                        value={config.haciendaPassword || ''}
                        onChange={(e) => setConfig({ ...config, haciendaPassword: e.target.value })}
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white pr-9"
                        placeholder="Contraseña alfanumérica generada en ATV"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-stone-500">Contraseña asignada al usuario ATV en el portal de Hacienda.</p>
                  </div>
                </div>

                {/* Automation Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <label className="flex items-center gap-2 p-2.5 bg-white border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-50">
                    <input 
                      type="checkbox"
                      checked={config.autoSendToHacienda}
                      onChange={(e) => setConfig({ ...config, autoSendToHacienda: e.target.checked })}
                      className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                    />
                    <span className="font-bold text-stone-700 text-[11px]">Envío Automático a DGT</span>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 bg-white border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-50">
                    <input 
                      type="checkbox"
                      checked={config.autoSignXml}
                      onChange={(e) => setConfig({ ...config, autoSignXml: e.target.checked })}
                      className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                    />
                    <span className="font-bold text-stone-700 text-[11px]">Firmar XML con Llave</span>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 bg-white border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-50">
                    <input 
                      type="checkbox"
                      checked={config.autoCheckHaciendaStatus}
                      onChange={(e) => setConfig({ ...config, autoCheckHaciendaStatus: e.target.checked })}
                      className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                    />
                    <span className="font-bold text-stone-700 text-[11px]">Consultar Aprobación</span>
                  </label>
                </div>
              </div>

              {/* Grid 4: Envío Automático de Facturas por Correo Electrónico (XML y PDF) */}
              <div className="bg-amber-50/50 border border-amber-200/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-amber-200/60 pb-3">
                  <div className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-amber-700" />
                    <div>
                      <h3 className="font-extrabold text-stone-900 text-sm">Envío Automático de Facturas al Cliente (XML y PDF)</h3>
                      <p className="text-[11px] text-stone-500">Despacho automático del PDF Oficial, XML firmado y XML de Respuesta DGT al correo del comprador.</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-amber-300 shadow-2xs cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={config.autoSendEmailToCustomer !== false}
                      onChange={(e) => setConfig({ ...config, autoSendEmailToCustomer: e.target.checked })}
                      className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4"
                    />
                    <span className="font-black text-amber-900 text-[11px]">Envío Activo</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Servidor SMTP */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-stone-700 block">
                      Servidor SMTP (Host)
                    </label>
                    <input 
                      type="text"
                      value={config.emailSmtpHost || ''}
                      onChange={(e) => setConfig({ ...config, emailSmtpHost: e.target.value })}
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white"
                      placeholder="smtp.gmail.com / mail.saborcervanteno.cr"
                    />
                    <p className="text-[10px] text-stone-500">Servidor de correo saliente. Si se deja vacío, opera en modo autónomo/local.</p>
                  </div>

                  {/* Puerto SMTP & TLS/SSL */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="font-bold text-stone-700 block">
                        Puerto SMTP
                      </label>
                      <input 
                        type="number"
                        value={config.emailSmtpPort || 587}
                        onChange={(e) => setConfig({ ...config, emailSmtpPort: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white"
                        placeholder="587 / 465"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-bold text-stone-700 block">
                        Seguridad
                      </label>
                      <select
                        value={config.emailSmtpSecure ? 'SSL' : 'TLS'}
                        onChange={(e) => setConfig({ ...config, emailSmtpSecure: e.target.value === 'SSL' })}
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white font-medium"
                      >
                        <option value="TLS">STARTTLS (587)</option>
                        <option value="SSL">SSL / TLS (465)</option>
                      </select>
                    </div>
                  </div>

                  {/* Usuario SMTP */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-stone-700 block">
                      Usuario SMTP / Correo Emisor
                    </label>
                    <input 
                      type="text"
                      value={config.emailSmtpUser || ''}
                      onChange={(e) => setConfig({ ...config, emailSmtpUser: e.target.value })}
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white"
                      placeholder="facturacion@saborcervanteno.cr"
                    />
                  </div>

                  {/* Contraseña SMTP */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-stone-700 block">
                      Contraseña / App Password
                    </label>
                    <div className="relative">
                      <input 
                        type={showSmtpPassword ? 'text' : 'password'}
                        value={config.emailSmtpPassword || ''}
                        onChange={(e) => setConfig({ ...config, emailSmtpPassword: e.target.value })}
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white pr-9"
                        placeholder="Contraseña de aplicación SMTP"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                        className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600"
                      >
                        {showSmtpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Nombre Remitente */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-stone-700 block">
                      Nombre Mostrado del Remitente
                    </label>
                    <input 
                      type="text"
                      value={config.emailSenderName || 'Pollo Frito Sabor Cervanteño - Facturación'}
                      onChange={(e) => setConfig({ ...config, emailSenderName: e.target.value })}
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white"
                      placeholder="Pollo Frito Sabor Cervanteño"
                    />
                  </div>

                  {/* Copia Oculta o Contador (CC) */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-stone-700 block">
                      Copia a Contador / Auditoría (CC)
                    </label>
                    <input 
                      type="email"
                      value={config.emailCc || ''}
                      onChange={(e) => setConfig({ ...config, emailCc: e.target.value })}
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white"
                      placeholder="contabilidad@saborcervanteno.cr"
                    />
                  </div>
                </div>

                {/* Botón de Prueba de Correo */}
                <div className="pt-2 flex items-center justify-between">
                  <div className="text-[11px] text-stone-600">
                    Adjuntos automáticos: <strong>1. PDF Oficial</strong> • <strong>2. XML Firmado (.xml)</strong> • <strong>3. Respuesta Hacienda (.xml)</strong>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestEmailConnection}
                    disabled={testingEmail}
                    className="px-3.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-xl font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 text-xs shadow-2xs"
                  >
                    {testingEmail ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Probar Servidor de Correo</span>
                  </button>
                </div>

                {/* Email Test Result */}
                {emailTestResult && (
                  <div className={`p-3 rounded-xl border ${emailTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'} space-y-1`}>
                    <div className="flex items-center gap-2 font-bold text-xs">
                      {emailTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> : <AlertTriangle className="w-4 h-4 text-rose-700" />}
                      <span>{emailTestResult.message}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Test Connection Banner */}
              {testResult && (
                <div className={`p-4 rounded-2xl border ${testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'} space-y-1`}>
                  <div className="flex items-center gap-2 font-black text-xs">
                    {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> : <AlertTriangle className="w-4 h-4 text-rose-700" />}
                    <span>{testResult.message}</span>
                  </div>
                  {testResult.keyValidation && (
                    <p className="text-[11px] pl-6 text-stone-700 flex items-start gap-1">
                      <span>{testResult.keyValidation.valid ? '✅' : '⚠️'}</span>
                      <span>
                        <span className="font-bold">Llave Criptográfica:</span>{' '}
                        {testResult.keyValidation.message ||
                          (testResult.keyValidation.valid
                            ? 'Llave criptográfica .p12 verificada y lista para firmar.'
                            : (testResult.keyValidation.error || 'Verifique el archivo .p12 y su PIN de 4 dígitos.'))}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="bg-stone-100 p-4 border-t border-stone-200 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || loading || !config?.haciendaUsername}
            className="w-full sm:w-auto px-4 py-2.5 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-xs"
          >
            {testing ? <RefreshCw className="w-4 h-4 animate-spin text-stone-600" /> : <Radio className="w-4 h-4 text-blue-600" />}
            Probar Conexión con Hacienda
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 rounded-xl font-bold transition-colors text-xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="flex-1 sm:flex-initial px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-black flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50 text-xs"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar Configuración Fiscal
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
