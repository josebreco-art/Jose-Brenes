import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  Unlock, 
  X, 
  FileCheck, 
  Info,
  RefreshCw,
  Tag,
  Calendar,
  User,
  DollarSign
} from 'lucide-react';
import { ElectronicDocument, Sale, ElectronicDocumentType } from '../types/pos';
import { PosApiService } from '../services/api';

export interface CreditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Puede recibir un comprobante electrónico o una venta
  targetDoc?: ElectronicDocument | null;
  targetSale?: Sale | null;
  cashierName?: string;
  onSuccess?: () => void;
}

// Códigos de Referencia (Nota 9 DGT) vigentes para Notas de Crédito
export type CreditNotePresetReason = 
  | 'ERROR_MATERIAL_ANULA'      // 13: Anula documento de referencia por error material
  | 'ERROR_MATERIAL_MONTO'      // 14: Corrige monto por error material
  | 'ERROR_MATERIAL_SUSTITUYE'  // 15: Sustituye comprobante electrónico por error material
  | 'SUSTITUCION_RECHAZADO'     // 16: Sustituye comprobante electrónico rechazado
  | 'EXONERACION_POSTERIOR';    // 12: Nota de crédito financiera por exoneración posterior

interface ReasonConfig {
  id: CreditNotePresetReason;
  label: string;
  sublabel: string;
  dgtCode: string; // Código de Referencia — Nota 9 DGT v4.4
  dgtCodeName: string;
  defaultReason: string;
  iconBg: string;
  badgeColor: string;
}

const PRESET_REASONS: ReasonConfig[] = [
  {
    id: 'ERROR_MATERIAL_ANULA',
    label: '13. Anula por error material (Predeterminado)',
    sublabel: 'Anula documento de referencia por error material (efecto contable en período original)',
    dgtCode: '13',
    dgtCodeName: '13 = Anula documento de referencia por error material',
    defaultReason: 'Anula documento de referencia por error material',
    iconBg: 'bg-rose-50 text-rose-700 border-rose-200',
    badgeColor: 'bg-rose-100 text-rose-800'
  },
  {
    id: 'ERROR_MATERIAL_MONTO',
    label: '14. Corrige monto por error material',
    sublabel: 'Corrige monto por error material (efecto contable en período del comprobante modificado)',
    dgtCode: '14',
    dgtCodeName: '14 = Corrige monto por error material',
    defaultReason: 'Corrige monto por error material',
    iconBg: 'bg-blue-50 text-blue-700 border-blue-200',
    badgeColor: 'bg-blue-100 text-blue-800'
  },
  {
    id: 'ERROR_MATERIAL_SUSTITUYE',
    label: '15. Sustituye por error material',
    sublabel: 'Sustituye comprobante electrónico por error material',
    dgtCode: '15',
    dgtCodeName: '15 = Sustituye comprobante electrónico por error material',
    defaultReason: 'Sustituye comprobante electrónico por error material',
    iconBg: 'bg-purple-50 text-purple-700 border-purple-200',
    badgeColor: 'bg-purple-100 text-purple-800'
  },
  {
    id: 'SUSTITUCION_RECHAZADO',
    label: '16. Sustituye comprobante rechazado',
    sublabel: 'Sustituye comprobante electrónico rechazado ante la DGT',
    dgtCode: '16',
    dgtCodeName: '16 = Sustituye comprobante electrónico rechazado',
    defaultReason: 'Sustituye comprobante electrónico rechazado',
    iconBg: 'bg-amber-50 text-amber-700 border-amber-200',
    badgeColor: 'bg-amber-100 text-amber-800'
  },
  {
    id: 'EXONERACION_POSTERIOR',
    label: '12. Exoneración posterior a la facturación',
    sublabel: 'Nota de crédito financiera por exoneración posterior (efecto en período de emisión de NC)',
    dgtCode: '12',
    dgtCodeName: '12 = NC financiera por exoneración posterior a la facturación',
    defaultReason: 'Nota de crédito financiera por exoneración posterior a la facturación',
    iconBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    badgeColor: 'bg-emerald-100 text-emerald-800'
  }
];

export const CreditNoteModal: React.FC<CreditNoteModalProps> = ({
  isOpen,
  onClose,
  targetDoc,
  targetSale,
  cashierName = 'Cajero Principal',
  onSuccess
}) => {
  // 1. Detección automática de los datos del documento original
  const originalConsecutive = targetDoc?.consecutive || targetSale?.consecutive20 || (targetSale?.orderNumber ? `0010000104${String(targetSale.orderNumber).padStart(10, '0')}` : 'No especificado');
  
  const originalNumericKey = targetDoc?.numericKey || targetSale?.numericKey50 || '';
  
  const originalDocType: ElectronicDocumentType = (
    targetDoc?.documentType || 
    (targetSale?.electronicDocumentType as ElectronicDocumentType) || 
    (targetSale?.customerIdentification ? '01' : '04')
  );

  const originalIssueDate = targetDoc?.issueDate || (targetSale?.date ? `${targetSale.date}T${targetSale.time || '12:00:00'}` : new Date().toISOString());

  const originalTotal = targetDoc?.total ?? targetSale?.total ?? 0;
  const originalCustomer = targetDoc?.receiver?.name || targetSale?.customerName || 'Consumidor Final';
  const orderRef = targetSale?.orderNumber ? `Orden #${targetSale.orderNumber}` : (targetDoc?.saleId ? `Venta Ref: ${targetDoc.saleId}` : 'Venta en Mostrador');

  // Helper para nombre legible de TipoDocIR
  const getDocTypeName = (type: string) => {
    switch (type) {
      case '01': return '01 - Factura Electrónica';
      case '04': return '04 - Tiquete Electrónico';
      case '02': return '02 - Nota de Débito Electrónica';
      case '03': return '03 - Nota de Crédito Electrónica';
      case '08': return '08 - Comprobante emitido en contingencia';
      case '10': return '10 - Comprobante electrónico rechazado por Hacienda';
      case '99': return '99 - Otros';
      default: return `${type} - Comprobante Electrónico`;
    }
  };

  // 2. Estados locales del flujo simplificado
  const [selectedReasonId, setSelectedReasonId] = useState<CreditNotePresetReason>('ERROR_MATERIAL_ANULA');
  const [customReasonText, setCustomReasonText] = useState<string>('Anula documento de referencia por error material');
  
  // Clave precargada automáticamente y protegida
  const [keyInput, setKeyInput] = useState<string>('');
  const [isKeyUnlocked, setIsKeyUnlocked] = useState<boolean>(false);
  const [isEmitting, setIsEmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sincronizar estado cuando se abre el modal con un nuevo documento
  useEffect(() => {
    if (isOpen) {
      setSelectedReasonId('ERROR_MATERIAL_ANULA');
      setCustomReasonText('Anula documento de referencia por error material');
      setKeyInput(originalNumericKey);
      setIsKeyUnlocked(false);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, originalNumericKey]);

  // Manejar cambio de motivo predeterminado
  const handleSelectReason = (reason: ReasonConfig) => {
    setSelectedReasonId(reason.id);
    setCustomReasonText(reason.defaultReason);
  };

  const activeReasonConfig = PRESET_REASONS.find(r => r.id === selectedReasonId) || PRESET_REASONS[0];

  // Advertencia de discrepancia de clave
  const hasKeyDiscrepancy = Boolean(
    originalNumericKey && 
    keyInput.trim() !== '' && 
    keyInput.trim() !== originalNumericKey.trim()
  );

  const handleEmit = async () => {
    setErrorMessage(null);
    setIsEmitting(true);

    const docKeyToUse = (keyInput.trim() || originalNumericKey || originalConsecutive).trim();
    if (!docKeyToUse) {
      setErrorMessage('No se encontró la clave o consecutivo del comprobante original.');
      setIsEmitting(false);
      return;
    }

    const reasonToSubmit = (customReasonText.trim() || activeReasonConfig.defaultReason).trim();
    if (reasonToSubmit.length < 3) {
      setErrorMessage('Debe indicar una justificación válida para la Nota de Crédito.');
      setIsEmitting(false);
      return;
    }

    try {
      const res = await PosApiService.emitCreditNote({
        originalDocumentKey: docKeyToUse,
        reason: reasonToSubmit,
        referenceCode: activeReasonConfig.dgtCode,
        referenceDocumentType: originalDocType,
        customNumericKey: keyInput.trim() || undefined,
        cashierName
      });

      if (res.success) {
        setSuccessMessage(res.message || 'Nota de Crédito emitida y registrada exitosamente.');
        setTimeout(() => {
          if (onSuccess) onSuccess();
          onClose();
        }, 1500);
      } else {
        setErrorMessage(res.message || 'Ocurrió un error al emitir la Nota de Crédito.');
      }
    } catch (e: any) {
      setErrorMessage(e.message || 'Error de comunicación con el motor fiscal.');
    } finally {
      setIsEmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto border border-stone-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-stone-900 leading-tight">
                Emisión de Nota de Crédito Electrónica (03)
              </h3>
              <p className="text-xs text-stone-500 font-medium">
                Normativa DGT v4.4 — Información de Referencia Automatizada
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isEmitting}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Traceability Relationship Badge */}
        <div className="bg-stone-50 rounded-xl p-2.5 border border-stone-200 flex flex-wrap items-center justify-between text-xs text-stone-600 gap-2 font-semibold">
          <div className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-amber-600" />
            <span>Relación Fiscal:</span>
            <span className="bg-white px-2 py-0.5 rounded-md border border-stone-200 font-mono text-[11px] text-stone-900 font-bold">
              {orderRef}
            </span>
            <span>→</span>
            <span className="bg-white px-2 py-0.5 rounded-md border border-stone-200 font-mono text-[11px] text-emerald-800 font-bold">
              {getDocTypeName(originalDocType).slice(0, 15)}...
            </span>
            <span>→</span>
            <span className="bg-rose-100 px-2 py-0.5 rounded-md border border-rose-200 font-mono text-[11px] text-rose-900 font-bold">
              NC (03)
            </span>
          </div>
          <div className="text-stone-400 text-[11px]">
            Cajero: <strong className="text-stone-700">{cashierName}</strong>
          </div>
        </div>

        {/* 1. SELECCIÓN RÁPIDA DEL MOTIVO POR EL CAJERO */}
        <div className="space-y-2">
          <label className="text-xs font-black text-stone-800 uppercase tracking-wide flex items-center justify-between">
            <span>Paso 1: Seleccione el Motivo de la Nota de Crédito</span>
            <span className="text-[11px] font-normal text-amber-700 lowercase">
              (el sistema asigna el código DGT automáticamente)
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PRESET_REASONS.map((reason) => {
              const isSelected = selectedReasonId === reason.id;
              return (
                <button
                  key={reason.id}
                  type="button"
                  onClick={() => handleSelectReason(reason)}
                  className={`p-3 rounded-xl text-left border transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'border-rose-500 bg-rose-50/70 shadow-xs ring-2 ring-rose-500/20'
                      : 'border-stone-200 hover:border-stone-300 bg-white hover:bg-stone-50'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className={`text-xs font-bold ${isSelected ? 'text-rose-900' : 'text-stone-900'}`}>
                      {reason.label}
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-sm border ${reason.badgeColor}`}>
                      Cód. {reason.dgtCode}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 line-clamp-1 leading-snug">
                    {reason.sublabel}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Campo de Razón Legal / Detalle (Precargado con el motivo) */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-700 flex items-center justify-between">
            <span>Razón / Justificación Legal:</span>
            <span className="text-[10px] text-stone-400 font-normal">Máximo 160 caracteres DGT</span>
          </label>
          <input
            type="text"
            value={customReasonText}
            onChange={(e) => setCustomReasonText(e.target.value)}
            maxLength={160}
            placeholder="Indique la justificación de la Nota de Crédito..."
            className="w-full p-2.5 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-rose-500 font-medium bg-stone-50/50"
          />
          <div className="p-2 bg-stone-50 border border-stone-200 rounded-lg text-[11px] text-stone-600 flex items-center justify-between">
            <span className="font-semibold text-stone-700">
              Código de Referencia DGT: <strong className="font-mono text-rose-700">{activeReasonConfig.dgtCode}</strong>
            </span>
            <span className="text-[10px] text-stone-500 font-mono">
              {activeReasonConfig.dgtCodeName}
            </span>
          </div>
        </div>

        {/* 2. PROTECCIÓN Y VALIDACIÓN AUTOMÁTICA DE LA CLAVE NUMÉRICA ORIGINAL */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label className="font-bold text-stone-700 flex items-center gap-1.5">
              <span>Clave Numérica Oficial del Documento Original (50 dígitos):</span>
              {originalNumericKey && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-3 h-3" />
                  Detectada en la Venta
                </span>
              )}
            </label>
            <button
              type="button"
              onClick={() => setIsKeyUnlocked(!isKeyUnlocked)}
              className="text-[11px] text-stone-500 hover:text-stone-800 flex items-center gap-1 font-semibold underline"
              title="Por seguridad la clave está protegida"
            >
              {isKeyUnlocked ? (
                <>
                  <Unlock className="w-3 h-3 text-amber-600" />
                  <span>Bloquear clave</span>
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3 text-stone-400" />
                  <span>Modificar clave</span>
                </>
              )}
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              disabled={!isKeyUnlocked}
              placeholder="506XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              className={`w-full p-2.5 text-xs font-mono rounded-xl border transition-colors ${
                !isKeyUnlocked 
                  ? 'bg-stone-100 text-stone-700 border-stone-300 cursor-not-allowed' 
                  : 'bg-white text-stone-900 border-amber-400 ring-2 ring-amber-200'
              }`}
            />
            {!isKeyUnlocked && (
              <div className="absolute right-3 top-2.5 text-stone-400" title="Protegido automáticamente">
                <Lock className="w-4 h-4" />
              </div>
            )}
          </div>

          {/* Advertencia de discrepancia si la clave manual es diferente a la original */}
          {hasKeyDiscrepancy && (
            <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 font-bold flex items-start gap-2 animate-in slide-in-from-top-1">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div>⚠️ Advertencia de Discrepancia Fiscal:</div>
                <div className="font-normal text-[11px] text-rose-800 mt-0.5">
                  La clave ingresada difiere de la clave registrada en la venta original (<strong>{originalNumericKey}</strong>). 
                  Asegúrese de que corresponda al comprobante emitido ante Hacienda.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. RESUMEN OBLIGATORIO ANTES DE GENERAR EL XML */}
        <div className="p-3.5 bg-stone-900 text-stone-100 rounded-xl space-y-2 border border-stone-800 shadow-inner">
          <div className="flex items-center justify-between text-[11px] text-stone-400 border-b border-stone-800 pb-1.5 font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <FileCheck className="w-3.5 h-3.5" />
              Información de Referencia a Generar (DGT v4.4)
            </span>
            <span className="text-amber-400">Nota 9 & 10</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div>
              <span className="text-stone-400">Documento original:</span>{' '}
              <strong className="text-white font-mono">{originalConsecutive}</strong>
            </div>
            <div>
              <span className="text-stone-400">TipoDocIR:</span>{' '}
              <strong className="text-amber-300 font-mono">{originalDocType}</strong>{' '}
              <span className="text-stone-400 text-[11px]">({getDocTypeName(originalDocType)})</span>
            </div>
            <div className="sm:col-span-2 truncate">
              <span className="text-stone-400">Clave:</span>{' '}
              <strong className="text-emerald-300 font-mono text-[11px]" title={keyInput || originalNumericKey}>
                {keyInput || originalNumericKey || 'No registrada'}
              </strong>
            </div>
            <div>
              <span className="text-stone-400">Código de referencia:</span>{' '}
              <strong className="text-rose-300 font-mono">{activeReasonConfig.dgtCode}</strong>{' '}
              <span className="text-stone-300 text-[11px]">({activeReasonConfig.dgtCodeName.split('=')[1]?.trim()})</span>
            </div>
            <div>
              <span className="text-stone-400">Razón:</span>{' '}
              <strong className="text-white">{customReasonText || activeReasonConfig.defaultReason}</strong>
            </div>
            <div>
              <span className="text-stone-400">Cliente:</span>{' '}
              <strong className="text-white">{originalCustomer}</strong>
            </div>
            <div>
              <span className="text-stone-400">Monto a Reversar:</span>{' '}
              <strong className="text-amber-400 font-black">₡{(originalTotal || 0).toLocaleString('es-CR')}</strong>
            </div>
          </div>
        </div>

        {/* Feedback Messages */}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-bold flex items-center gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-stone-100">
          <div className="text-[11px] text-stone-500 font-medium">
            El documento original no será eliminado, su estado cambiará a <strong>ANULADO_POR_NC</strong>.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isEmitting}
              className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleEmit}
              disabled={isEmitting || Boolean(successMessage)}
              className="px-5 py-2.5 text-xs font-black bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isEmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Generando XML y Emitiendo NC...</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4" />
                  <span>Generar y Emitir Nota de Crédito</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
