import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  CreditCard, 
  Smartphone, 
  Building, 
  Check, 
  Receipt, 
  Building2, 
  UserCheck, 
  ChevronDown, 
  ChevronUp,
  AlertCircle,
  Coins,
  Banknote,
  RotateCcw,
  Layers,
  PlusCircle,
  Trash2,
  CheckCircle2,
  Sparkles,
  ArrowLeftRight
} from 'lucide-react';
import { PaymentSplit, PaymentMethodType, Customer, CartItem, ElectronicDocumentType } from '../types/pos';
import { PosApiService } from '../services/api';
import { FiscalReceiverForm } from './FiscalReceiverForm';
import { FiscalValidationService } from '../server/fiscalValidationService';

interface PaymentModalProps {
  totalAmount: number;
  customer: Customer;
  customers?: Customer[];
  cart: CartItem[];
  isOpen: boolean;
  onClose: () => void;
  onConfirmPayment: (
    payments: PaymentSplit[], 
    generateFiscalDoc: boolean, 
    amountPaid: number, 
    change: number,
    electronicDocumentType: ElectronicDocumentType,
    receiverOverride?: Customer,
    useRestaurantServiceLine?: boolean
  ) => Promise<void>;
  isProcessing: boolean;
  isHaciendaConfigured?: boolean;
}

// Denominaciones oficiales de billetes de Costa Rica
const COSTA_RICA_BILLS = [
  { label: '₡1.000', value: 1000, color: 'bg-red-50 text-red-900 border-red-200 hover:bg-red-100' },
  { label: '₡2.000', value: 2000, color: 'bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100' },
  { label: '₡5.000', value: 5000, color: 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100' },
  { label: '₡10.000', value: 10000, color: 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100' },
  { label: '₡20.000', value: 20000, color: 'bg-orange-50 text-orange-900 border-orange-200 hover:bg-orange-100' },
  { label: '₡50.000', value: 50000, color: 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100' },
];

const COSTA_RICA_COINS = [
  { label: '₡5', value: 5 },
  { label: '₡10', value: 10 },
  { label: '₡25', value: 25 },
  { label: '₡50', value: 50 },
  { label: '₡100', value: 100 },
  { label: '₡500', value: 500 },
];

function isGenericCashCustomer(c?: Partial<Customer>): boolean {
  if (!c) return true;
  const name = (c.name || '').toLowerCase();
  const id = (c.identification || '').trim();
  return (
    name.includes('contado') ||
    name.includes('consumidor') ||
    name.includes('general') ||
    id === '000000000' ||
    id === '100000000' ||
    !id
  );
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  totalAmount,
  customer,
  customers = [],
  cart,
  isOpen,
  onClose,
  onConfirmPayment,
  isProcessing,
  isHaciendaConfigured = true
}) => {
  // Modo de pago: único vs mixto
  const [isSplitMode, setIsSplitMode] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('CASH');
  const [payments, setPayments] = useState<PaymentSplit[]>([
    { method: 'CASH', amount: totalAmount }
  ]);
  const [cashTendered, setCashTendered] = useState<number>(0);
  const [documentType, setDocumentType] = useState<ElectronicDocumentType>(
    !isGenericCashCustomer(customer) ? '01' : '04'
  );
  const [useRestaurantServiceLine, setUseRestaurantServiceLine] = useState<boolean>(false);
  const [reference, setReference] = useState<string>('');
  const cashInputRef = React.useRef<HTMLInputElement>(null);
  const isSubmittingRef = React.useRef<boolean>(false);
  const [localSubmitting, setLocalSubmitting] = useState<boolean>(false);
  
  // Estado local para los datos del receptor fiscal (FE 01)
  const [receiverData, setReceiverData] = useState<Partial<Customer>>({ ...customer });
  const [showReceiverDetails, setShowReceiverDetails] = useState<boolean>(true);

  const [fiscalValidation, setFiscalValidation] = useState<{ isValid: boolean; errors: string[]; warnings: string[] }>({
    isValid: true,
    errors: [],
    warnings: []
  });

  // Re-sincronizar al abrir el modal o cambiar monto/cliente
  useEffect(() => {
    if (isOpen) {
      isSubmittingRef.current = false;
      setLocalSubmitting(false);
      setIsSplitMode(false);
      setPayments([{ method: 'CASH', amount: totalAmount }]);
      setCashTendered(0);
      setPaymentMethod('CASH');
      setReference('');
      setUseRestaurantServiceLine(false);
      const isReceptorIdentificado = !isGenericCashCustomer(customer);
      setDocumentType(isReceptorIdentificado ? '01' : '04');
      setReceiverData({ ...customer });

      setTimeout(() => {
        cashInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, totalAmount, customer]);

  // Cálculos en modo único
  const isCashPayment = payments.some(p => p.method === 'CASH');
  const missingAmount = Math.max(0, totalAmount - cashTendered);
  const change = Math.max(0, cashTendered - totalAmount);
  const isExactPayment = cashTendered === totalAmount;

  // Cálculos en modo mixto (split)
  const totalAssignedInSplit = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  const remainingSplit = Math.max(0, totalAmount - totalAssignedInSplit);
  const excessSplit = Math.max(0, totalAssignedInSplit - totalAmount);
  const isSplitCovered = totalAssignedInSplit >= totalAmount;

  const cashSplitItem = payments.find(p => p.method === 'CASH');
  const cashSplitRequired = cashSplitItem ? Number(cashSplitItem.amount) || 0 : 0;
  const cashSplitMissing = Math.max(0, cashSplitRequired - cashTendered);
  const cashSplitChange = Math.max(0, cashTendered - cashSplitRequired);

  // Validación fiscal en segundo plano
  useEffect(() => {
    if (!isOpen) return;

    const subtotal = cart.reduce((s, i) => s + (i.subtotal ?? (i.price * i.quantity)), 0);
    const taxTotal = cart.reduce((s, i) => s + (i.taxAmount ?? 0), 0);
    const total = cart.reduce((s, i) => s + (i.total ?? (i.price * i.quantity)), 0);

    PosApiService.validateSaleFiscalPayload({
      documentType,
      items: cart,
      customer: documentType === '01' ? receiverData : customer,
      payments,
      subtotal,
      discount: 0,
      taxTotal,
      total
    }).then(res => {
      setFiscalValidation(res);
    });
  }, [isOpen, documentType, customer, receiverData, payments, cart]);

  if (!isOpen) return null;

  const paymentMethodsList: Array<{ type: PaymentMethodType; label: string; icon: any }> = [
    { type: 'CASH', label: 'Efectivo', icon: DollarSign },
    { type: 'CARD', label: 'Tarjeta', icon: CreditCard },
    { type: 'SINPE', label: 'SINPE Móvil', icon: Smartphone },
    { type: 'TRANSFER', label: 'Transferencia', icon: Building }
  ];

  const setSinglePaymentMethod = (method: PaymentMethodType) => {
    setPaymentMethod(method);
    setPayments([{ method, amount: totalAmount, reference: reference || undefined }]);
    if (method === 'CASH') {
      setTimeout(() => {
        cashInputRef.current?.focus();
      }, 50);
    }
  };

  // Activación del Modo Mixto
  const handleToggleSplitMode = () => {
    if (!isSplitMode) {
      // Iniciar pago mixto con dos líneas sugeridas: Efectivo (mitad o saldo) y SINPE
      const half = Math.round(totalAmount / 2);
      setPayments([
        { method: 'CASH', amount: half },
        { method: 'SINPE', amount: totalAmount - half, reference: '' }
      ]);
      setCashTendered(half);
      setIsSplitMode(true);
    } else {
      // Regresar a pago único
      setIsSplitMode(false);
      setPayments([{ method: paymentMethod, amount: totalAmount, reference }]);
      setCashTendered(paymentMethod === 'CASH' ? totalAmount : 0);
    }
  };

  const handleAddSplitMethod = (method: PaymentMethodType = 'SINPE') => {
    const nextAmount = remainingSplit > 0 ? remainingSplit : 0;
    setPayments(prev => [...prev, { method, amount: nextAmount, reference: '' }]);
  };

  const handleUpdateSplitPayment = (index: number, updates: Partial<PaymentSplit>, syncOther = true) => {
    setPayments(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };

      // Sincronización simultánea en tiempo real para 2 métodos de pago (Efectivo + Otro método)
      // Al modificar un campo, el otro campo se ajusta automáticamente al mismo tiempo
      if (syncOther && updates.amount !== undefined && next.length === 2) {
        const otherIndex = index === 0 ? 1 : 0;
        const currentAmount = Math.max(0, Number(updates.amount) || 0);
        const complementAmount = Math.max(0, totalAmount - currentAmount);

        next[otherIndex] = {
          ...next[otherIndex],
          amount: complementAmount
        };

        // Si uno de los métodos es efectivo, sincronizar automáticamente el efectivo entregado para que coincida por defecto
        const cashItem = next.find(p => p.method === 'CASH');
        if (cashItem) {
          setCashTendered(cashItem.amount);
        }
      }

      return next;
    });
  };

  // Función para aplicar montos rápidos predefinidos en Pago Mixto
  const handleApplySplitPreset = (cashAmount: number) => {
    const safeCash = Math.min(totalAmount, Math.max(0, cashAmount));
    const complement = Math.max(0, totalAmount - safeCash);

    setPayments(prev => {
      if (prev.length === 2) {
        const cashIdx = prev.findIndex(p => p.method === 'CASH');
        const firstIdx = cashIdx !== -1 ? cashIdx : 0;
        const secondIdx = firstIdx === 0 ? 1 : 0;
        const next = [...prev];
        next[firstIdx] = { ...next[firstIdx], amount: safeCash };
        next[secondIdx] = { ...next[secondIdx], amount: complement };
        return next;
      } else {
        return [
          { method: 'CASH', amount: safeCash },
          { method: 'SINPE', amount: complement, reference: '' }
        ];
      }
    });
    setCashTendered(safeCash);
  };

  // Función para intercambiar montos entre ambos métodos (⇄ Invertir)
  const handleSwapSplitAmounts = () => {
    setPayments(prev => {
      if (prev.length !== 2) return prev;
      const next = [...prev];
      const tempAmount = next[0].amount;
      next[0] = { ...next[0], amount: next[1].amount };
      next[1] = { ...next[1], amount: tempAmount };

      const cashItem = next.find(p => p.method === 'CASH');
      if (cashItem) {
        setCashTendered(cashItem.amount);
      }
      return next;
    });
  };

  const handleRemoveSplitPayment = (index: number) => {
    if (payments.length <= 1) return;
    setPayments(prev => prev.filter((_, i) => i !== index));
  };

  const handleQuickAddRemaining = (method: PaymentMethodType) => {
    if (remainingSplit <= 0) return;
    const existingIndex = payments.findIndex(p => p.method === method);
    if (existingIndex !== -1) {
      handleUpdateSplitPayment(existingIndex, {
        amount: (Number(payments[existingIndex].amount) || 0) + remainingSplit
      });
    } else {
      setPayments(prev => [...prev, { method, amount: remainingSplit, reference: '' }]);
    }
  };

  // Función para sumar denominaciones de efectivo de Costa Rica
  const handleAddCashDenomination = (val: number) => {
    setCashTendered(prev => {
      const current = typeof prev === 'number' && !isNaN(prev) ? prev : 0;
      return current + val;
    });
  };

  const handleSetExactCash = () => {
    const target = isSplitMode ? cashSplitRequired : totalAmount;
    setCashTendered(target);
  };

  const handleClearCash = () => {
    setCashTendered(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isProcessing || localSubmitting) return;

    // Validaciones según modo
    if (!isSplitMode) {
      if (isCashPayment && cashTendered < totalAmount) return;
    } else {
      if (!isSplitCovered) return;
      if (cashSplitItem && cashTendered < cashSplitRequired) return;
    }

    // Validación si es Factura Electrónica (01)
    if (documentType === '01') {
      const receiverCheck = FiscalValidationService.validateElectronicInvoiceReceiver(receiverData, {
        documentType: '01',
        requireEmail: true
      });
      if (!receiverCheck.isValid) {
        setFiscalValidation({
          isValid: false,
          errors: receiverCheck.errors,
          warnings: receiverCheck.warnings
        });
        return;
      }
    }

    // Bloqueo instantáneo para anular toques repetidos o doble clic
    isSubmittingRef.current = true;
    setLocalSubmitting(true);

    let finalAmountPaid = 0;
    let finalChange = 0;

    if (!isSplitMode) {
      finalAmountPaid = isCashPayment ? cashTendered : totalAmount;
      finalChange = isCashPayment ? change : 0;
    } else {
      const nonCashTotal = payments
        .filter(p => p.method !== 'CASH')
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      finalAmountPaid = nonCashTotal + (cashSplitItem ? cashTendered : 0);
      finalChange = cashSplitItem ? cashSplitChange : 0;
    }
    
    // Preparar objeto de receptor validado
    const fullReceiver: Customer = {
      id: receiverData.id || `cust-${Date.now()}`,
      name: receiverData.name || 'Cliente',
      identification: receiverData.identification || '',
      identificationType: receiverData.identificationType || '01',
      economicActivity: receiverData.economicActivity,
      email: receiverData.email,
      phone: receiverData.phone,
      address: receiverData.address || 'Costa Rica',
      province: receiverData.province || '3',
      canton: receiverData.canton || '06',
      district: receiverData.district || '02',
      createdAt: receiverData.createdAt || new Date().toISOString()
    };

    try {
      await onConfirmPayment(
        payments, 
        true, 
        finalAmountPaid, 
        finalChange, 
        documentType,
        documentType === '01' ? fullReceiver : undefined,
        documentType === '01' ? useRestaurantServiceLine : false
      );
    } catch (err) {
      console.error('Error procesando pago:', err);
      isSubmittingRef.current = false;
      setLocalSubmitting(false);
    }
  };

  const isSubmitDisabled = isProcessing || localSubmitting ||
    (!isSplitMode && isCashPayment && cashTendered < totalAmount) ||
    (isSplitMode && (!isSplitCovered || (cashSplitItem && cashTendered < cashSplitRequired))) ||
    (documentType === '01' && !fiscalValidation.isValid);

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[96vh] overflow-y-auto border border-stone-100">
        
        {/* Header simplificado y enfocado en el total */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Cierre de Venta</span>
              {isSplitMode && (
                <span className="text-[10px] font-black bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Pago Mixto Activo
                </span>
              )}
            </div>
            <h2 className="text-lg font-black text-stone-900">
              Cobrar Orden
            </h2>
            <p className="text-xs text-stone-500 font-medium truncate max-w-[200px] sm:max-w-xs">
              Cliente: <strong className="text-stone-800">{customer.name}</strong>
            </p>
          </div>

          <div className="text-right bg-amber-50/80 px-4 py-2 rounded-2xl border border-amber-200/70">
            <div className="text-[10px] font-extrabold text-amber-900/70 uppercase tracking-wider">Total a Pagar</div>
            <div className="text-2xl sm:text-3xl font-black text-amber-700 tracking-tight">
              ₡{(totalAmount || 0).toLocaleString('es-CR')}
            </div>
          </div>
        </div>

        {/* Selector Rápido de Comprobante (Tiquete vs Factura) */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            id="doc-type-tiquete-btn"
            onClick={() => setDocumentType('04')}
            className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer ${
              documentType === '04'
                ? 'bg-amber-600 text-white border-amber-600 shadow-sm font-bold'
                : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100 font-medium'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5 text-xs">
              <Receipt className="w-3.5 h-3.5" />
              <span>Tiquete (04)</span>
            </div>
          </button>

          <button
            type="button"
            id="doc-type-factura-btn"
            onClick={() => {
              setDocumentType('01');
              setShowReceiverDetails(true);
            }}
            className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer ${
              documentType === '01'
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm font-bold'
                : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100 font-medium'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5 text-xs">
              <Building2 className="w-3.5 h-3.5" />
              <span>Factura Electrónica (01)</span>
            </div>
          </button>
        </div>

        {/* Datos del Receptor Fiscal si es Factura Electrónica */}
        {documentType === '01' && (
          <div className="p-3.5 bg-emerald-50/70 border-2 border-emerald-300 rounded-2xl space-y-2.5 shadow-sm">
            {/* Opción destacada: Servicio de Restaurante */}
            <label 
              htmlFor="use-restaurant-service-line-chk" 
              className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                useRestaurantServiceLine 
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-300' 
                  : 'bg-white border-emerald-200 text-stone-800 hover:bg-emerald-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="use-restaurant-service-line-chk"
                  checked={useRestaurantServiceLine}
                  onChange={(e) => setUseRestaurantServiceLine(e.target.checked)}
                  className="w-5 h-5 text-emerald-600 rounded border-stone-300 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="text-left select-none">
                  <span className={`text-xs font-black uppercase tracking-wide block ${useRestaurantServiceLine ? 'text-white' : 'text-emerald-950'}`}>
                    🍽️ Cambiar a servicio de restaurante
                  </span>
                  <span className={`text-[11px] block leading-tight ${useRestaurantServiceLine ? 'text-emerald-100' : 'text-stone-500'}`}>
                    {useRestaurantServiceLine 
                      ? '✓ Factura agrupada en 1 sola línea fiscal: "Servicio de restaurante" (CAByS 6332000000000)' 
                      : 'Agrupa todo el detalle en 1 línea fiscal: "Servicio de restaurante" (CAByS 6332000000000, 13% IVA)'}
                  </span>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                useRestaurantServiceLine ? 'bg-white text-emerald-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {useRestaurantServiceLine ? 'ACTIVADO' : 'OPCIONAL'}
              </span>
            </label>

            <div className="flex items-center justify-between border-t border-emerald-200/80 pt-2 pb-0.5">
              <div className="flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-bold text-emerald-950">Datos del Receptor</span>
              </div>
              <button
                type="button"
                onClick={() => setShowReceiverDetails(!showReceiverDetails)}
                className="text-emerald-800 hover:text-emerald-950 text-xs font-semibold flex items-center gap-0.5"
              >
                <span>{showReceiverDetails ? 'Contraer' : 'Editar'}</span>
                {showReceiverDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {showReceiverDetails && (
              <FiscalReceiverForm
                receiver={receiverData}
                onChangeReceiver={(updated) => setReceiverData(updated)}
                availableCustomers={customers}
                onSelectExistingCustomer={(cust) => setReceiverData({ ...cust })}
                documentType="01"
                showCustomerSelector={true}
              />
            )}
          </div>
        )}

        {/* Barra superior de Modo: Pago Único vs Pago Mixto */}
        <div className="flex items-center justify-between pt-1">
          <label className="text-[11px] font-bold text-stone-600 uppercase tracking-wide">
            Forma de Pago
          </label>
          <button
            type="button"
            id="toggle-split-payment-btn"
            onClick={handleToggleSplitMode}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
              isSplitMode
                ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isSplitMode ? 'Volver a Pago Único' : '🔀 Pago Mixto (Dividir Cuenta)'}</span>
          </button>
        </div>

        {/* -------------------- MODO PAGO ÚNICO -------------------- */}
        {!isSplitMode && (
          <>
            {/* Botones de Selección Rápida */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {paymentMethodsList.map(method => {
                const Icon = method.icon;
                const isSelected = payments.length === 1 && payments[0].method === method.type;
                return (
                  <button
                    key={method.type}
                    type="button"
                    id={`pay-method-${method.type.toLowerCase()}`}
                    onClick={() => setSinglePaymentMethod(method.type)}
                    className={`flex items-center justify-center gap-1.5 p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-300'
                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{method.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Referencia si es Tarjeta / SINPE / Transferencia */}
            {paymentMethod !== 'CASH' && (
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-600 uppercase tracking-wide">
                  Referencia / Comprobante (Opcional)
                </label>
                <input
                  id="payment-reference-input"
                  type="text"
                  placeholder="Ej: Teléfono SINPE, # de autorización o voucher bancario"
                  value={reference}
                  onChange={(e) => {
                    setReference(e.target.value);
                    setPayments([{ method: paymentMethod, amount: totalAmount, reference: e.target.value }]);
                  }}
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden bg-white"
                />
              </div>
            )}
          </>
        )}

        {/* -------------------- MODO PAGO MIXTO (SPLIT) -------------------- */}
        {isSplitMode && (
          <div className="space-y-3 bg-purple-50/50 p-3.5 rounded-2xl border border-purple-200">
            {/* Resumen de Asignación y Saldo Restante */}
            <div className="grid grid-cols-3 gap-2 text-center p-2.5 bg-white rounded-xl border border-purple-200 shadow-xs">
              <div>
                <div className="text-[10px] font-bold text-stone-500 uppercase">Total Orden</div>
                <div className="text-sm font-black text-stone-900">
                  ₡{totalAmount.toLocaleString('es-CR')}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-purple-700 uppercase">Cubierto</div>
                <div className="text-sm font-black text-purple-900">
                  ₡{totalAssignedInSplit.toLocaleString('es-CR')}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-stone-500 uppercase">
                  {remainingSplit > 0 ? 'Falta' : 'Estado'}
                </div>
                <div className={`text-sm font-black ${remainingSplit > 0 ? 'text-rose-600' : 'text-emerald-600 flex items-center justify-center gap-1'}`}>
                  {remainingSplit > 0 ? (
                    `-₡${remainingSplit.toLocaleString('es-CR')}`
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 inline" />
                      <span>Completo</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Accesos rápidos para completar saldo restante */}
            {remainingSplit > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[11px] font-bold text-stone-600">Completar con:</span>
                <button
                  type="button"
                  onClick={() => handleQuickAddRemaining('SINPE')}
                  className="px-2 py-1 bg-sky-100 hover:bg-sky-200 text-sky-800 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                >
                  + ₡{remainingSplit.toLocaleString('es-CR')} SINPE
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAddRemaining('CARD')}
                  className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                >
                  + ₡{remainingSplit.toLocaleString('es-CR')} Tarjeta
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAddRemaining('CASH')}
                  className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                >
                  + ₡{remainingSplit.toLocaleString('es-CR')} Efectivo
                </button>
              </div>
            )}

            {/* Sincronización Simultánea & Accesos Rápidos de Monto (cuando hay 2 métodos) */}
            {payments.length === 2 && (
              <div className="bg-purple-50/90 border border-purple-200/80 rounded-xl p-2.5 space-y-1.5 shadow-2xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-purple-900">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>Sincronización simultánea activa: al modificar un monto, el otro se ajusta automáticamente.</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSwapSplitAmounts}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-purple-100 text-purple-800 border border-purple-300 rounded-lg text-[11px] font-bold transition-colors cursor-pointer shadow-2xs shrink-0"
                    title="Intercambiar montos entre métodos"
                  >
                    <ArrowLeftRight className="w-3 h-3 text-purple-600" />
                    <span>Invertir montos</span>
                  </button>
                </div>

                {/* Chips de montos sugeridos */}
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wide mr-1">Rápidos:</span>
                  <button
                    type="button"
                    onClick={() => handleApplySplitPreset(Math.round(totalAmount / 2))}
                    className="px-2 py-0.5 bg-white hover:bg-purple-200 text-purple-900 border border-purple-200 rounded-lg text-[11px] font-extrabold transition-colors cursor-pointer"
                  >
                    50/50 (₡{Math.round(totalAmount / 2).toLocaleString('es-CR')})
                  </button>

                  {totalAmount > 1000 && (
                    <button
                      type="button"
                      onClick={() => handleApplySplitPreset(1000)}
                      className="px-2 py-0.5 bg-white hover:bg-amber-100 text-stone-800 border border-stone-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      ₡1.000 Efec / Resto
                    </button>
                  )}

                  {totalAmount > 2000 && (
                    <button
                      type="button"
                      onClick={() => handleApplySplitPreset(2000)}
                      className="px-2 py-0.5 bg-white hover:bg-amber-100 text-stone-800 border border-stone-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      ₡2.000 Efec / Resto
                    </button>
                  )}

                  {totalAmount > 5000 && (
                    <button
                      type="button"
                      onClick={() => handleApplySplitPreset(5000)}
                      className="px-2 py-0.5 bg-white hover:bg-amber-100 text-stone-800 border border-stone-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      ₡5.000 Efec / Resto
                    </button>
                  )}

                  {totalAmount > 10000 && (
                    <button
                      type="button"
                      onClick={() => handleApplySplitPreset(10000)}
                      className="px-2 py-0.5 bg-white hover:bg-amber-100 text-stone-800 border border-stone-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      ₡10.000 Efec / Resto
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Lista de Líneas de Pago Dividido */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {payments.map((p, index) => (
                <div key={index} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 bg-white rounded-xl border border-stone-200 shadow-xs">
                  {/* Selector de Método */}
                  <select
                    value={p.method}
                    onChange={(e) => handleUpdateSplitPayment(index, { method: e.target.value as PaymentMethodType })}
                    className="px-2 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs font-bold text-stone-800 focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  >
                    <option value="CASH">💵 Efectivo</option>
                    <option value="CARD">💳 Tarjeta</option>
                    <option value="SINPE">📱 SINPE Móvil</option>
                    <option value="TRANSFER">🏦 Transferencia</option>
                  </select>

                  {/* Input de Monto */}
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-xs font-black text-stone-500">₡</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Monto"
                      value={p.amount === 0 ? '' : p.amount}
                      onChange={(e) => {
                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                        handleUpdateSplitPayment(index, { amount: isNaN(val) ? 0 : val });
                      }}
                      className="w-full px-2.5 py-1.5 text-xs font-black text-stone-900 border border-stone-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Referencia si no es efectivo */}
                  {p.method !== 'CASH' ? (
                    <input
                      type="text"
                      placeholder="Ref / Comprobante"
                      value={p.reference || ''}
                      onChange={(e) => handleUpdateSplitPayment(index, { reference: e.target.value })}
                      className="w-full sm:w-36 px-2 py-1.5 text-xs border border-stone-200 rounded-lg focus:ring-1 focus:ring-purple-500 placeholder:text-stone-400"
                    />
                  ) : (
                    <span className="text-[11px] text-amber-700 font-semibold px-2 py-1 bg-amber-50 rounded-lg text-center">
                      Pago en Efectivo
                    </span>
                  )}

                  {/* Eliminar método */}
                  {payments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSplitPayment(index)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors self-end sm:self-auto"
                      title="Eliminar este método"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Botón Agregar Método Adicional */}
            <div className="flex justify-between items-center pt-1">
              <button
                type="button"
                onClick={() => handleAddSplitMethod('SINPE')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Agregar otro método</span>
              </button>
              
              {excessSplit > 0 && (
                <span className="text-xs font-bold text-amber-700">
                  Excedente asignado: +₡{excessSplit.toLocaleString('es-CR')}
                </span>
              )}
            </div>
          </div>
        )}

        {/* -------------------- SECCIÓN EFECTIVO (Denominaciones y Vuelto) -------------------- */}
        {(isCashPayment || (isSplitMode && cashSplitItem)) && (
          <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200/70 space-y-3">
            
            {/* Input Manual y Botones de Acción Rápida */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                  {isSplitMode ? `Efectivo Entregado (Para cubrir ₡${cashSplitRequired.toLocaleString('es-CR')}):` : 'Efectivo Recibido:'}
                </span>
                <button
                  type="button"
                  id="quick-exact-cash-btn"
                  onClick={handleSetExactCash}
                  className="px-2 py-0.5 text-[10.5px] font-bold bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-md transition-colors cursor-pointer"
                >
                  Exacto
                </button>
                <button
                  type="button"
                  id="clear-cash-btn"
                  onClick={handleClearCash}
                  className="px-2 py-0.5 text-[10.5px] font-bold bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                  title="Borrar monto"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Borrar</span>
                </button>
                {isSplitMode && payments.length === 2 && cashTendered > 0 && cashTendered !== cashSplitRequired && (
                  <button
                    type="button"
                    onClick={() => handleApplySplitPreset(cashTendered)}
                    className="px-2.5 py-0.5 text-[10.5px] font-extrabold bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 rounded-md transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                    title="Ajustar pago mixto a este monto en efectivo"
                  >
                    <Sparkles className="w-2.5 h-2.5 text-purple-700" />
                    <span>Fijar ₡{cashTendered.toLocaleString('es-CR')} al pago</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <span className="text-base font-black text-amber-900">₡</span>
                <input
                  ref={cashInputRef}
                  id="cash-tendered-input"
                  type="number"
                  min="0"
                  step="1"
                  autoFocus
                  value={cashTendered === 0 ? '' : cashTendered}
                  placeholder="0"
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : Number(e.target.value);
                    setCashTendered(isNaN(val) ? 0 : val);
                  }}
                  className="w-36 px-3 py-1.5 bg-white border-2 border-amber-400 rounded-xl font-black text-right text-lg text-stone-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden shadow-inner placeholder:text-stone-300"
                />
              </div>
            </div>

            {/* Denominaciones de Billetes de Costa Rica */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10.5px] font-bold text-stone-600 uppercase tracking-wide">
                <Banknote className="w-3.5 h-3.5 text-stone-500" />
                <span>Billetes de Costa Rica</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {COSTA_RICA_BILLS.map(bill => (
                  <button
                    key={bill.value}
                    type="button"
                    id={`bill-btn-${bill.value}`}
                    onClick={() => handleAddCashDenomination(bill.value)}
                    className={`py-1.5 px-2 text-xs font-black rounded-xl border transition-all active:scale-95 shadow-xs cursor-pointer ${bill.color}`}
                  >
                    +{bill.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Denominaciones de Monedas de Costa Rica */}
            <div className="space-y-1 pt-1">
              <div className="flex items-center gap-1 text-[10.5px] font-bold text-stone-600 uppercase tracking-wide">
                <Coins className="w-3.5 h-3.5 text-stone-500" />
                <span>Monedas de Costa Rica</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {COSTA_RICA_COINS.map(coin => (
                  <button
                    key={coin.value}
                    type="button"
                    id={`coin-btn-${coin.value}`}
                    onClick={() => handleAddCashDenomination(coin.value)}
                    className="py-1.5 px-2 text-xs font-bold rounded-xl border border-stone-300 bg-white hover:bg-amber-100/60 text-stone-800 transition-all active:scale-95 shadow-xs cursor-pointer"
                  >
                    +{coin.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Estado del Cambio / Faltante de Efectivo */}
            <div className="pt-2.5 border-t border-amber-200/80 flex items-center justify-between">
              <div>
                {!isSplitMode ? (
                  missingAmount > 0 ? (
                    <span className="text-xs font-bold text-rose-700 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Faltan:</span>
                    </span>
                  ) : isExactPayment ? (
                    <span className="text-xs font-bold text-emerald-800">
                      Monto Exacto:
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-emerald-800">
                      Cambio / Vuelto a Entregar:
                    </span>
                  )
                ) : (
                  cashSplitMissing > 0 ? (
                    <span className="text-xs font-bold text-rose-700 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Falta en efectivo:</span>
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-emerald-800">
                      Vuelto de la porción en efectivo:
                    </span>
                  )
                )}
              </div>

              <div className="text-right">
                {!isSplitMode ? (
                  missingAmount > 0 ? (
                    <span className="text-lg font-black text-rose-600">
                      -₡{missingAmount.toLocaleString('es-CR')}
                    </span>
                  ) : (
                    <span className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight">
                      ₡{change.toLocaleString('es-CR')}
                    </span>
                  )
                ) : (
                  cashSplitMissing > 0 ? (
                    <span className="text-lg font-black text-rose-600">
                      -₡{cashSplitMissing.toLocaleString('es-CR')}
                    </span>
                  ) : (
                    <span className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight">
                      ₡{cashSplitChange.toLocaleString('es-CR')}
                    </span>
                  )
                )}
              </div>
            </div>

          </div>
        )}

        {/* Errores de validación fiscal si aplica */}
        {fiscalValidation.errors.length > 0 && (
          <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-800 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-rose-900">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>Verifique los datos:</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] pl-1">
              {fiscalValidation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Botones de Acción */}
        <div className="flex items-center justify-between pt-2 border-t border-stone-100 gap-3">
          <button
            type="button"
            id="cancel-payment-modal-btn"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2.5 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          
          <button
            type="button"
            id="confirm-payment-btn"
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className="flex-1 py-3 px-5 text-sm font-black bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 disabled:opacity-40 text-white rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isProcessing || localSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Procesando venta...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>
                  {isSplitMode ? `Confirmar Pago Mixto (₡${totalAmount.toLocaleString('es-CR')})` : 'Confirmar Venta'}
                </span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
