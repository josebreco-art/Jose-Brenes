import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  Printer, 
  PlusCircle, 
  Mail, 
  Send, 
  Loader2 
} from 'lucide-react';
import { Sale } from '../types/pos';
import { PosApiService } from '../services/api';
import { formatPaymentMethodSpanish } from './ThermalReceiptModal';

interface InvoiceResultModalProps {
  sale: Sale | null;
  isOpen: boolean;
  onClose: () => void;
  onPrintThermal: (type: 'POS' | 'KITCHEN' | 'INVOICE') => void;
  onNewSale: () => void;
}

export const InvoiceResultModal: React.FC<InvoiceResultModalProps> = ({
  sale,
  isOpen,
  onClose,
  onPrintThermal,
  onNewSale
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isOpen && sale) {
      setEmailInput(sale.customerEmail || '');
      setEmailFeedback(null);
      setIsSendingEmail(false);
    }
  }, [isOpen, sale?.id, sale?.customerEmail]);

  if (!isOpen || !sale) return null;

  const handleSendEmail = async () => {
    if (!sale.numericKey50) return;
    const emailToSend = emailInput || sale.customerEmail;
    if (!emailToSend || !emailToSend.includes('@')) {
      setEmailFeedback({ type: 'error', message: 'Ingrese un correo electrónico válido.' });
      return;
    }

    setIsSendingEmail(true);
    setEmailFeedback(null);
    try {
      const res = await PosApiService.sendInvoiceEmail(sale.numericKey50, emailToSend);
      if (res.success) {
        setEmailFeedback({ type: 'success', message: `¡Comprobante enviado con éxito a ${emailToSend}!` });
      } else {
        setEmailFeedback({ type: 'error', message: res.message || 'Error al enviar por correo.' });
      }
    } catch (e: any) {
      setEmailFeedback({ type: 'error', message: e.message || 'Error inesperado.' });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-center border border-stone-100 my-auto">
        
        {/* Status Icon */}
        <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner">
          <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
        </div>

        {/* Title */}
        <div>
          <h2 className="text-xl font-black text-stone-900 tracking-tight">
            ¡Venta Registrada!
          </h2>
          <p className="text-xs text-stone-500 font-medium mt-0.5">
            Comanda #{sale.orderNumber} • Pollo Frito Sabor Cervanteño
          </p>
        </div>

        {/* Resumen Limpio de la Venta */}
        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 text-left space-y-2 text-xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-stone-200">
            <span className="text-stone-500 font-medium">Cliente:</span>
            <span className="font-bold text-stone-800 truncate max-w-[200px]">
              {sale.customerName || 'Consumidor Final'}
            </span>
          </div>

          <div className="flex items-center justify-between pb-1.5 border-b border-stone-200">
            <span className="text-stone-500 font-medium">Medio de Pago:</span>
            <span className="font-bold text-stone-800">
              {(sale.payments || []).map(p => formatPaymentMethodSpanish(p.method)).join(', ') || 'Efectivo'}
            </span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-stone-600 font-bold">Total Cobrado:</span>
            <span className="text-base font-black text-amber-700">
              ₡{(sale.total || 0).toLocaleString('es-CR')}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-stone-600 font-bold">Vuelto Entregado:</span>
            <span className="text-base font-black text-emerald-700">
              ₡{(sale.change || 0).toLocaleString('es-CR')}
            </span>
          </div>
        </div>

        {/* Envío Opcional por Correo si el cliente lo requiere */}
        {sale.numericKey50 && (
          <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl text-left space-y-1.5">
            <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-stone-500" />
              <span>Enviar comprobante por correo (opcional):</span>
            </label>
            <div className="flex gap-1.5">
              <input
                id="resend-invoice-email-input"
                type="email"
                placeholder="correo@cliente.com"
                defaultValue={sale.customerEmail || ''}
                onChange={(e) => setEmailInput(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
              />
              <button
                id="resend-invoice-email-btn"
                onClick={handleSendEmail}
                disabled={isSendingEmail}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
              >
                {isSendingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Enviar</span>
              </button>
            </div>
            {emailFeedback && (
              <div className={`text-[10.5px] font-semibold p-1.5 rounded-lg ${
                emailFeedback.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
              }`}>
                {emailFeedback.message}
              </div>
            )}
          </div>
        )}

        {/* Sección de Acción Principal: TICKET POS */}
        <div className="space-y-2 pt-1">
          <button
            id="print-pos-ticket-btn"
            onClick={() => onPrintThermal('POS')}
            className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 text-white rounded-2xl text-sm font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span>TICKET POS</span>
          </button>
        </div>

        {/* Botón de Nueva Venta */}
        <div className="pt-2 border-t border-stone-100">
          <button
            id="new-sale-btn"
            onClick={onNewSale}
            className="w-full py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-2xl font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Nueva Venta</span>
          </button>
        </div>

      </div>
    </div>
  );
};
