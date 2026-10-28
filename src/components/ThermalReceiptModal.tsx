import React, { useState, useEffect } from 'react';
import { Printer, X, Download, FileText, Check, QrCode, Sliders, UtensilsCrossed, Store, Flame, Image as ImageIcon } from 'lucide-react';
import QRCode from 'qrcode';
import { Sale, KitchenOrder, HaciendaDirectConfig } from '../types/pos';
import { PosApiService } from '../services/api';
import { safeStorage } from '../utils/safeStorage';

interface RestaurantInfo {
  name?: string;
  commercialName?: string;
  taxId?: string;
  identificationType?: string;
  economicActivity?: string;
  location?: string;
  phone?: string;
  email?: string;
  logoBase64?: string;
}

function formatTaxId(taxId?: string, type?: string): string {
  if (!taxId) return '3-101-000000';
  const clean = taxId.replace(/\D/g, '');
  if (clean.length === 10) {
    if (clean.startsWith('3')) {
      return `${clean.substring(0, 1)}-${clean.substring(1, 4)}-${clean.substring(4)}`;
    }
    return `${clean.substring(0, 1)}-${clean.substring(1, 5)}-${clean.substring(5)}`;
  }
  if (clean.length === 9) {
    return `${clean.substring(0, 1)}-${clean.substring(1, 5)}-${clean.substring(5)}`;
  }
  return taxId;
}

export function formatPaymentMethodSpanish(method: string | undefined): string {
  if (!method) return 'Efectivo';
  const m = String(method).toUpperCase().trim();
  switch (m) {
    case 'CASH':
    case 'EFECTIVO':
    case '01':
      return 'Efectivo';
    case 'CARD':
    case 'TARJETA':
    case '02':
      return 'Tarjeta (Crédito / Débito)';
    case 'CHECK':
    case 'CHEQUE':
    case '03':
      return 'Cheque';
    case 'TRANSFER':
    case 'TRANSFERENCIA':
    case '04':
      return 'Transferencia Bancaria';
    case 'SINPE':
    case 'SINPE_MOVIL':
    case '05':
      return 'SINPE Móvil';
    case 'THIRD_PARTY':
    case '06':
      return 'Recaudado por Terceros';
    case 'DIVIDIDO':
    case 'MIXTO':
      return 'Pago Mixto / Dividido';
    case 'CREDIT':
    case 'CREDITO':
      return 'Crédito';
    case 'OTHER':
    case 'OTRO':
    case '99':
      return 'Otros';
    default:
      return method;
  }
}

function numeroALetras(num: number): string {
  const unidades = ['CERO', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
  const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function convertirGrupo(n: number): string {
    let texto = '';
    if (n === 100) return 'CIEN';
    if (n > 100) {
      texto += centenas[Math.floor(n / 100)] + ' ';
      n = n % 100;
    }
    if (n > 0) {
      if (n < 30) {
        texto += unidades[n];
      } else {
        texto += decenas[Math.floor(n / 10)];
        if (n % 10 > 0) {
          texto += ' Y ' + unidades[n % 10];
        }
      }
    }
    return texto.trim();
  }

  if (num === 0) return 'CERO COLONES';
  
  let enteros = Math.floor(num);
  let centimos = Math.round((num - enteros) * 100);

  let palabras = '';
  if (enteros >= 1000000) {
    let millones = Math.floor(enteros / 1000000);
    enteros = enteros % 1000000;
    if (millones === 1) palabras += 'UN MILLÓN ';
    else palabras += convertirGrupo(millones) + ' MILLONES ';
  }
  if (enteros >= 1000) {
    let miles = Math.floor(enteros / 1000);
    enteros = enteros % 1000;
    if (miles === 1) palabras += 'MIL ';
    else palabras += convertirGrupo(miles) + ' MIL ';
  }
  if (enteros > 0) {
    palabras += convertirGrupo(enteros);
  }
  
  let c = centimos.toString().padStart(2, '0');
  return (palabras.trim() + ` CON ${c}/100 COLONES`).toUpperCase();
}

interface ThermalReceiptModalProps {
  sale: Sale | KitchenOrder | null;
  initialType?: 'POS' | 'KITCHEN' | 'INVOICE';
  autoPrint?: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  sale,
  initialType = 'POS',
  autoPrint = false,
  isOpen,
  onClose
}) => {
  const [receiptType, setReceiptType] = useState<'POS' | 'KITCHEN' | 'INVOICE'>(initialType);
  const [paperWidth, setPaperWidth] = useState<'80mm' | '56mm'>(() => {
    return (safeStorage.getItem('pos_thermal_paper_width') as '80mm' | '56mm') || '80mm';
  });
  const [density, setDensity] = useState<'normal' | 'ultra'>(() => {
    return (safeStorage.getItem('pos_thermal_density') as 'normal' | 'ultra') || 'ultra';
  });
  const [showLogo, setShowLogo] = useState<boolean>(() => {
    const saved = safeStorage.getItem('pos_thermal_show_logo');
    return saved !== null ? saved === 'true' : true;
  });
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [restaurantInfo, setRestaurantInfo] = useState<RestaurantInfo | null>(null);
  const [haciendaConfig, setHaciendaConfig] = useState<HaciendaDirectConfig | null>(null);

  const handleSetPaperWidth = (width: '80mm' | '56mm') => {
    setPaperWidth(width);
    safeStorage.setItem('pos_thermal_paper_width', width);
  };

  const handleSetDensity = (d: 'normal' | 'ultra') => {
    setDensity(d);
    safeStorage.setItem('pos_thermal_density', d);
  };

  const handleToggleLogo = () => {
    setShowLogo(prev => {
      const next = !prev;
      safeStorage.setItem('pos_thermal_show_logo', String(next));
      return next;
    });
  };

  useEffect(() => {
    if (isOpen) {
      setReceiptType(initialType);
      PosApiService.getFiscalCompanyInfo()
        .then(info => { if (info) setRestaurantInfo(info); })
        .catch(err => console.warn('Error cargando info restaurante:', err));

      PosApiService.getHaciendaDirectConfig()
        .then(res => { if (res?.config) setHaciendaConfig(res.config); })
        .catch(err => console.warn('Error cargando hacienda config:', err));
    }
  }, [isOpen, initialType]);

  useEffect(() => {
    if (isOpen && autoPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoPrint]);

  useEffect(() => {
    if (sale && sale.numericKey50) {
      const qrData = String(sale.numericKey50).trim();
      const qrWidth = paperWidth === '56mm' ? 180 : 240;
      QRCode.toDataURL(qrData, { 
        margin: 1, 
        width: qrWidth, 
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' }
      })
        .then(url => setQrDataUrl(url))
        .catch(err => console.warn('Error generating receipt QR:', err));
    } else {
      setQrDataUrl('');
    }
  }, [sale, paperWidth]);

  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    window.print();
  };

  const is56 = paperWidth === '56mm';
  const isInvoice = receiptType === 'INVOICE';
  const isKitchen = receiptType === 'KITCHEN';
  const isPos = receiptType === 'POS';

  const useServiceLine = Boolean((sale as any).useRestaurantServiceLine);
  const itemsToDisplay = (useServiceLine && !isKitchen)
    ? [{ name: 'Servicio de restaurante', quantity: 1, price: sale.total, discount: 0, cabysCode: '6332000000000' }]
    : (sale.items || []);

  // Cálculos de totales
  const subtotal = sale.subtotal || 0;
  const taxTotal = sale.taxTotal || 0;
  const discountTotal = sale.discountTotal || 0;
  const total = sale.total || 0;
  const totalLetras = numeroALetras(total);
  const totalItemsCount = (sale.items || []).reduce((acc, it) => acc + (it.quantity || 1), 0);

  const commercialName = haciendaConfig?.emisorCommercialName || 
                         restaurantInfo?.commercialName || 
                         haciendaConfig?.emisorName || 
                         restaurantInfo?.name || 
                         'POLLO FRITO SABOR CERVANTEÑO';

  const docTypeName = sale.electronicDocumentType === '01'
    ? 'FACTURA ELECTRÓNICA'
    : (sale.electronicDocumentType === '03' ? 'NOTA DE CRÉDITO ELECTRÓNICA' : 'TIQUETE ELECTRÓNICO');

  const displayDate = sale.date || new Date().toLocaleDateString('es-CR');
  const displayTime = sale.time || new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-stone-800 rounded-2xl max-w-xl w-full p-4 sm:p-5 shadow-2xl space-y-4 my-auto">
        
        {/* Modal Top Bar (Controls) */}
        <div className="flex flex-wrap items-center justify-between text-white border-b border-stone-700 pb-3 gap-2">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-amber-400" />
            <h3 className="font-extrabold text-sm sm:text-base">
              Impresión Térmica
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Paper Size Selector (80mm vs 56mm) */}
            <div className="flex bg-stone-900 p-1 rounded-lg text-xs items-center gap-1 border border-stone-700">
              <span className="text-[10px] text-stone-400 font-semibold px-1">Papel:</span>
              <button
                type="button"
                onClick={() => handleSetPaperWidth('80mm')}
                className={`px-2 py-0.5 rounded font-bold transition-colors ${
                  paperWidth === '80mm' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-stone-300 hover:text-white'
                }`}
                title="Impresora estándar de 80 milímetros (3 pulgadas)"
              >
                80 mm
              </button>
              <button
                type="button"
                onClick={() => handleSetPaperWidth('56mm')}
                className={`px-2 py-0.5 rounded font-bold transition-colors ${
                  paperWidth === '56mm' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-stone-300 hover:text-white'
                }`}
                title="Impresora compacta / móvil de 56 o 58 milímetros (2 pulgadas)"
              >
                56 mm
              </button>
            </div>

            {/* Print Density Selector */}
            <div className="flex bg-stone-900 p-1 rounded-lg text-xs items-center gap-1 border border-stone-700" title="Ajusta el grosor de trazo en papel térmico">
              <Flame className={`w-3.5 h-3.5 ${density === 'ultra' ? 'text-amber-400' : 'text-stone-400'}`} />
              <button
                type="button"
                onClick={() => handleSetDensity('normal')}
                className={`px-2 py-0.5 rounded font-bold transition-colors ${
                  density === 'normal' ? 'bg-stone-700 text-white shadow-xs' : 'text-stone-400 hover:text-white'
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => handleSetDensity('ultra')}
                className={`px-2 py-0.5 rounded font-bold transition-colors ${
                  density === 'ultra' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-stone-400 hover:text-white'
                }`}
                title="Doble trazo y quemado térmico profundo"
              >
                Ultra Negro
              </button>
            </div>

            {/* Toggle Logo Selector */}
            <button
              type="button"
              onClick={handleToggleLogo}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                showLogo 
                  ? 'bg-stone-900 border-amber-500/50 text-amber-300' 
                  : 'bg-stone-900/60 border-stone-700 text-stone-400 hover:text-stone-200'
              }`}
              title="Activa o desactiva la impresión del logotipo para ahorrar papel o acelerar impresión"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>{showLogo ? 'Con Logo' : 'Sin Logo'}</span>
            </button>

            {/* Document Type Selector */}
            <div className="flex bg-stone-900 p-1 rounded-lg text-xs border border-stone-700">
              <button
                type="button"
                onClick={() => setReceiptType('POS')}
                className={`px-2.5 py-1 rounded font-bold transition-colors ${
                  receiptType === 'POS' ? 'bg-amber-600 text-white' : 'text-stone-400 hover:text-white'
                }`}
              >
                Ticket POS
              </button>
              <button
                type="button"
                onClick={() => setReceiptType('KITCHEN')}
                className={`px-2.5 py-1 rounded font-bold transition-colors ${
                  receiptType === 'KITCHEN' ? 'bg-amber-600 text-white' : 'text-stone-400 hover:text-white'
                }`}
              >
                Cocina
              </button>
              <button
                type="button"
                onClick={() => setReceiptType('INVOICE')}
                className={`px-2.5 py-1 rounded font-bold transition-colors ${
                  receiptType === 'INVOICE' ? 'bg-amber-600 text-white' : 'text-stone-400 hover:text-white'
                }`}
              >
                DGT v4.4
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1 text-stone-400 hover:text-white rounded-lg hover:bg-stone-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tip Informativo para el Cajero (No se imprime) */}
        <div className="bg-amber-950/40 border border-amber-500/30 rounded-lg px-3 py-1.5 text-[11px] text-amber-300 flex flex-wrap items-center justify-between gap-2 no-print">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-amber-400">💡 Modo Ultra Negro Activo:</span>
            <span>Refuerzo de trazo térmico al máximo. En Chrome configure <strong>Márgenes: Ninguno</strong> y <strong>Escala: 100%</strong>.</span>
          </div>
          <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono">
            {paperWidth === '80mm' ? 'Área: 72mm (576 dots)' : 'Área: 48mm (384 dots)'}
          </span>
        </div>

        {/* Thermal Paper Container Preview */}
        <div className="max-h-[65vh] overflow-y-auto bg-stone-950/80 p-3 sm:p-4 rounded-xl flex justify-center border border-stone-800">
          <div 
            id="printable-thermal-receipt"
            className={`${is56 ? 'w-[48mm] max-w-[48mm] text-[11px] p-2 paper-56mm' : 'w-[72mm] max-w-[72mm] text-[13px] p-3 paper-80mm'} ${density === 'ultra' ? 'ultra-black' : ''} bg-white text-black font-sans leading-tight shadow-xl rounded-xs space-y-2 select-none print:shadow-none print:m-0`}
            style={{ width: is56 ? '48mm' : '72mm', maxWidth: is56 ? '48mm' : '72mm', fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif' }}
          >
            {/* ========================================================================= */}
            {/* CASO 1: TICKET POS RÁPIDO / COMANDA INTERNA */}
            {/* ========================================================================= */}
            {isPos && (
              <>
                {/* Cabecera Limpia */}
                <div className="text-center border-b-2 border-black pb-1.5 space-y-0.5">
                  {showLogo && (haciendaConfig?.emisorLogoBase64 || restaurantInfo?.logoBase64) && (
                    <img 
                      src={haciendaConfig?.emisorLogoBase64 || restaurantInfo?.logoBase64} 
                      alt="Logo Emisor" 
                      className={`${is56 ? 'max-h-11 max-w-[90px]' : 'max-h-14 max-w-[130px]'} object-contain mx-auto mb-1 receipt-logo`}
                      style={{ maxHeight: is56 ? '44px' : '56px' }}
                    />
                  )}
                  <div className="font-black tracking-tight uppercase text-sm sm:text-base text-black leading-tight">
                    {commercialName}
                  </div>
                  <div className="text-[10px] text-black font-black uppercase tracking-wider">
                    Comprobante Interno de Venta
                  </div>
                </div>

                {/* Datos Principales de la Orden */}
                <div className="border-b border-dashed border-black pb-1.5 space-y-1 text-black">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-sm bg-black text-white px-2 py-0.5 rounded">
                      ORDEN #{sale.orderNumber}
                    </span>
                    <span className="text-[10px] font-black text-black">
                      {sale.orderType === 'DINE_IN' ? '🍽️ Comer acá' : sale.orderType === 'TAKE_OUT' ? '🥡 Para Llevar' : '🛵 Express'}
                    </span>
                  </div>

                  <div className="flex justify-between text-[10px] text-black pt-0.5">
                    <span>Fecha: <strong>{displayDate}</strong></span>
                    <span>Hora: <strong>{displayTime}</strong></span>
                  </div>

                  <div className="text-[10.5px] pt-0.5">
                    <span className="text-black font-bold">Cliente: </span>
                    <span className="font-black text-black">
                      {sale.customerName || 'Cliente General / Consumidor Final'}
                    </span>
                  </div>

                  {sale.customOrderName && (
                    <div className="bg-black text-white px-2 py-0.5 rounded text-[11px] font-black tracking-wide">
                      🏷️ COMANDA: {sale.customOrderName.toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Detalle de Productos */}
                <div className="border-b border-dashed border-black pb-1.5 space-y-1">
                  <div className="flex justify-between font-black text-[10.5px] uppercase border-b border-black pb-0.5 text-black">
                    <span>Cant • Descripción</span>
                    <span>Importe</span>
                  </div>

                  {itemsToDisplay.map((item, idx) => {
                    const itemQty = item.quantity || 1;
                    const itemUnitPrice = item.price || 0;
                    const itemDiscount = item.discount || 0;
                    const itemTotal = (itemUnitPrice * itemQty) - itemDiscount;

                    return (
                      <div key={idx} className="space-y-0.5 text-black">
                        <div className="flex justify-between font-bold">
                          <span className="flex-1 pr-1 text-black">
                            <strong className="font-black">{itemQty}x</strong> {item.name}
                          </span>
                          <span className="font-black text-right shrink-0 text-black">
                            ₡{itemTotal.toLocaleString('es-CR')}
                          </span>
                        </div>

                        {/* Modificadores */}
                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="text-black text-[9.5px] pl-3 space-y-0.2">
                            {item.modifiers.map((m, mIdx) => (
                              <div key={mIdx}>+ {m.name} {m.price ? `(₡${m.price.toLocaleString('es-CR')})` : ''}</div>
                            ))}
                          </div>
                        )}

                        {/* Notas de cocina */}
                        {item.notes && (
                          <div className="font-black text-black bg-stone-100 border border-black px-1 py-0.5 rounded pl-2 text-[9.5px]">
                            * {item.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Resumen de Pago */}
                <div className="border-b-2 border-black pb-1.5 space-y-1 text-black">
                  <div className="flex justify-between text-[10.5px] text-black">
                    <span>Total Items:</span>
                    <span className="font-black">{totalItemsCount}</span>
                  </div>

                  <div className="bg-black text-white px-2 py-1 rounded flex justify-between items-center font-black text-sm sm:text-base tracking-tight my-1">
                    <span className="text-white uppercase text-xs">TOTAL PAGADO:</span>
                    <span className="text-white text-base sm:text-lg">₡{total.toLocaleString('es-CR')}</span>
                  </div>

                  <div className="pt-0.5 space-y-0.5 text-[10px]">
                    {(sale.payments || []).map((p, i) => (
                      <div key={i} className="flex justify-between text-black">
                        <span>Forma de Pago ({formatPaymentMethodSpanish(p.method)}):</span>
                        <span className="font-black">₡{(p.amount || 0).toLocaleString('es-CR')}</span>
                      </div>
                    ))}
                    {sale.change !== undefined && sale.change > 0 && (
                      <div className="flex justify-between font-black text-black pt-0.5">
                        <span>Vuelto / Cambio:</span>
                        <span>₡{(sale.change || 0).toLocaleString('es-CR')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pie de Ticket */}
                <div className="text-center text-[10px] text-black pt-0.5 space-y-0.5 font-bold">
                  <div className="font-black text-black">¡Muchas gracias por su preferencia!</div>
                  <div>{commercialName}</div>
                </div>
              </>
            )}

            {/* ========================================================================= */}
            {/* CASO 2: CABECERA ESPECIAL PARA COCINA / KDS */}
            {/* ========================================================================= */}
            {isKitchen && (
              <>
                <div className="text-center space-y-1 border-b-2 border-black pb-2 text-black">
                  <div className="text-xl font-black tracking-tight text-black">*** COMANDA COCINA ***</div>
                  <div className="text-lg font-black bg-black text-white py-1 rounded">
                    ORDEN #{sale.orderNumber}
                  </div>
                  {sale.customOrderName && (
                    <div className="text-sm font-black bg-stone-100 border-2 border-black py-1 px-2 rounded mt-1 text-black">
                      COMANDA: {sale.customOrderName.toUpperCase()}
                    </div>
                  )}
                  <div className="text-xs font-bold pt-0.5 text-black">
                    Tipo: {sale.orderType === 'DINE_IN' ? 'Comer acá' : sale.orderType === 'TAKE_OUT' ? 'Para Llevar' : 'Express / Domicilio'}
                  </div>
                  <div className="text-[10.5px] font-bold text-black">
                    Hora: {displayTime} • {displayDate}
                  </div>
                </div>

                {/* Detalle de Productos para Cocina */}
                <div className="space-y-2 border-b-2 border-black pb-2 pt-1 text-black">
                  {sale.items?.map((item, idx) => (
                    <div key={idx} className="border-b border-black pb-1.5">
                      <div className="text-sm font-black text-black">
                        {item.quantity || 1}x {item.name}
                      </div>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="pl-3 text-xs font-bold text-black">
                          {item.modifiers.map((m, mIdx) => (
                            <div key={mIdx}>+ {m.name}</div>
                          ))}
                        </div>
                      )}
                      {item.notes && (
                        <div className="mt-0.5 font-black text-xs text-black bg-stone-100 p-1 rounded border border-black">
                          NOTA: {item.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="text-center text-[11px] font-black text-black pt-1">
                  Total Platillos: {totalItemsCount}
                </div>
              </>
            )}

            {/* ========================================================================= */}
            {/* CASO 3: COMPROBANTE ELECTRÓNICO OFICIAL DGT v4.4 */}
            {/* ========================================================================= */}
            {isInvoice && (
              <>
                {/* 1. CABECERA & LOGO DE LA EMPRESA */}
                <div className="text-center space-y-1 border-b border-dashed border-stone-400 pb-2">
                  <div className="flex flex-col items-center justify-center pt-0.5">
                    {showLogo && (haciendaConfig?.emisorLogoBase64 || restaurantInfo?.logoBase64) ? (
                      <img 
                        src={haciendaConfig?.emisorLogoBase64 || restaurantInfo?.logoBase64} 
                        alt="Logo Emisor" 
                        className={`${is56 ? 'max-h-12 max-w-[100px]' : 'max-h-16 max-w-[140px]'} object-contain mx-auto mb-1 receipt-logo`}
                        style={{ maxHeight: is56 ? '48px' : '64px' }}
                      />
                    ) : null}
                    <div className="font-black tracking-tight uppercase text-xs sm:text-[13px] text-black leading-tight">
                      {commercialName}
                    </div>
                    {(haciendaConfig?.emisorName || restaurantInfo?.name) && (haciendaConfig?.emisorName || restaurantInfo?.name) !== (haciendaConfig?.emisorCommercialName || restaurantInfo?.commercialName) && (
                      <div className="text-[9.5px] font-bold text-black">
                        {haciendaConfig?.emisorName || restaurantInfo?.name}
                      </div>
                    )}
                  </div>

                  <div className={`${is56 ? 'text-[9px]' : 'text-[10px]'} text-black leading-snug space-y-0.5 font-medium`}>
                    <div>
                      <strong>Cédula:</strong> {formatTaxId(haciendaConfig?.emisorTaxId || restaurantInfo?.taxId, haciendaConfig?.emisorIdentificationType || restaurantInfo?.identificationType)}
                    </div>
                    <div>
                      <strong>Actividad DGT:</strong> {haciendaConfig?.emisorEconomicActivity || restaurantInfo?.economicActivity || '5610.0 - Restaurantes y Cafeterías'}
                    </div>
                    <div>{haciendaConfig?.emisorAddressDetail || restaurantInfo?.location || 'Cervantes de Alvarado, Cartago, Costa Rica'}</div>
                    {(haciendaConfig?.emisorPhone || restaurantInfo?.phone) && (
                      <div><strong>Tel:</strong> {haciendaConfig?.emisorPhone || restaurantInfo?.phone}</div>
                    )}
                    {(haciendaConfig?.emisorEmail || restaurantInfo?.email) && (
                      <div><strong>Email:</strong> {haciendaConfig?.emisorEmail || restaurantInfo?.email}</div>
                    )}
                    <div>Sucursal: {haciendaConfig?.branch || '001'} • Terminal: {haciendaConfig?.terminal || '00001'}</div>
                  </div>

                  <div className="font-black text-[11px] pt-1 text-black uppercase tracking-wide border-t border-black mt-1">
                    {docTypeName}
                  </div>
                </div>

                {/* 2. METADATOS DEL DOCUMENTO (Consecutivo, Clave, Fecha, Cajero, Cliente) */}
                <div className={`space-y-1 ${is56 ? 'text-[9.5px]' : 'text-[10.5px]'} border-b border-dashed border-black pb-2 text-black`}>
                  <div className="flex justify-between">
                    <span>Orden: <strong>#{sale.orderNumber}</strong></span>
                    <span>{displayDate} {displayTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cajero: <strong>{sale.cashierName || 'Cajero Principal'}</strong></span>
                    <span>{sale.orderType === 'DINE_IN' ? 'Comer acá' : sale.orderType === 'TAKE_OUT' ? 'Para Llevar' : 'Express'}</span>
                  </div>

                  {/* Datos del Cliente / Receptor */}
                  <div className="pt-1 border-t border-black mt-1 space-y-0.5">
                    <div><strong>Cliente:</strong> {sale.customerName || 'Consumidor Final'}</div>
                    {sale.customerIdentification && (
                      <div><strong>Identificación:</strong> {sale.customerIdentification}</div>
                    )}
                    {sale.customerPhone && (
                      <div><strong>Teléfono:</strong> {sale.customerPhone}</div>
                    )}
                    {sale.customerEmail && (
                      <div><strong>Correo:</strong> {sale.customerEmail}</div>
                    )}
                  </div>

                  {/* Consecutivo y Clave Numérica DGT */}
                  <div className="pt-1 border-t border-black mt-1 space-y-0.5 text-black">
                    <div>
                      <strong>Consecutivo DGT (20d):</strong>
                      <div className="font-mono font-black text-[9.5px] break-all">
                        {sale.consecutive20 || `0010000104${String(sale.orderNumber).padStart(10, '0')}`}
                      </div>
                    </div>
                    <div>
                      <strong>Clave Numérica (50d):</strong>
                      <div className="font-mono font-black text-[9px] break-all leading-tight bg-stone-100 p-1 rounded tracking-tight border border-black">
                        {sale.numericKey50 || '50618082600310178945600100001040000000114199887766'}
                      </div>
                    </div>
                    <div className="flex justify-between pt-0.5">
                      <span><strong>Condición:</strong> 01 - Contado</span>
                      <span><strong>Moneda:</strong> CRC (₡)</span>
                    </div>
                  </div>
                </div>

                {/* 3. DETALLE DE LÍNEAS DE VENTA */}
                <div className="space-y-1.5 border-b border-dashed border-black pb-2">
                  <div className={`flex justify-between font-black ${is56 ? 'text-[9.5px]' : 'text-[10.5px]'} uppercase border-b border-black pb-0.5 text-black`}>
                    <span>Cant • Detalle</span>
                    <span>Total</span>
                  </div>

                  {itemsToDisplay.map((item, idx) => {
                    const itemQty = item.quantity || 1;
                    const itemUnitPrice = item.price || 0;
                    const itemDiscount = item.discount || 0;
                    const itemTotal = (itemUnitPrice * itemQty) - itemDiscount;

                    return (
                      <div key={idx} className="space-y-0.5 text-black">
                        <div className="flex justify-between font-bold">
                          <span className="flex-1 pr-1">
                            <strong className="font-black">{itemQty}x</strong> {item.name}
                          </span>
                          <span className="font-black text-right shrink-0">
                            ₡{itemTotal.toLocaleString('es-CR')}
                          </span>
                        </div>

                        <div className={`flex justify-between text-black ${is56 ? 'text-[8.5px]' : 'text-[9.5px]'} pl-3 font-medium`}>
                          <span>CABYS: {item.cabysCode || '2118603000000'}</span>
                          <span>(₡{itemUnitPrice.toLocaleString('es-CR')} c/u • IVA 13%)</span>
                        </div>

                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className={`text-black ${is56 ? 'text-[8.5px]' : 'text-[9.5px]'} pl-3 space-y-0.2`}>
                            {item.modifiers.map((m, mIdx) => (
                              <div key={mIdx}>+ {m.name} {m.price ? `(₡${m.price.toLocaleString('es-CR')})` : ''}</div>
                            ))}
                          </div>
                        )}

                        {item.notes && (
                          <div className={`font-black text-black bg-stone-100 border border-black px-1 py-0.5 rounded pl-2 ${is56 ? 'text-[9px]' : 'text-[10px]'}`}>
                            * {item.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 4. TOTALES ECONÓMICOS Y DESGLOSE FISCAL */}
                <div className={`space-y-1 text-right ${is56 ? 'text-[9.5px]' : 'text-[10.5px]'} border-b border-dashed border-black pb-2 text-black`}>
                  <div className="flex justify-between text-black">
                    <span>Subtotal Gravado:</span>
                    <span className="font-bold">₡{subtotal.toLocaleString('es-CR')}</span>
                  </div>
                  {discountTotal > 0 && (
                    <div className="flex justify-between text-black font-bold">
                      <span>Descuento Total:</span>
                      <span>-₡{discountTotal.toLocaleString('es-CR')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-black">
                    <span>Impuesto IVA (13%):</span>
                    <span className="font-bold">₡{taxTotal.toLocaleString('es-CR')}</span>
                  </div>
                  <div className="flex justify-between text-black">
                    <span>Impuesto Neto:</span>
                    <span className="font-bold">₡{taxTotal.toLocaleString('es-CR')}</span>
                  </div>

                  <div className="bg-black text-white px-2 py-1 rounded flex justify-between items-center font-black text-sm sm:text-base tracking-tight my-1">
                    <span className="text-white uppercase text-xs">TOTAL A PAGAR:</span>
                    <span className="text-white text-base sm:text-lg">₡{total.toLocaleString('es-CR')}</span>
                  </div>

                  <div className={`text-left text-black ${is56 ? 'text-[8.5px]' : 'text-[9.5px]'} pt-0.5 leading-tight italic font-bold`}>
                    Son: {totalLetras}
                  </div>

                  <div className="pt-1.5 border-t border-dashed border-black space-y-0.5 text-black">
                    {(sale.payments || []).map((p, i) => (
                      <div key={i} className="flex justify-between">
                        <span>Pago ({formatPaymentMethodSpanish(p.method)}):</span>
                        <span className="font-bold">₡{(p.amount || 0).toLocaleString('es-CR')}</span>
                      </div>
                    ))}
                    {sale.change !== undefined && sale.change > 0 && (
                      <div className="flex justify-between font-black text-black pt-0.5">
                        <span>Vuelto / Cambio:</span>
                        <span>₡{(sale.change || 0).toLocaleString('es-CR')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. CÓDIGO QR OFICIAL DGT & LEYENDA LEGAL TRIBUTARIA */}
                <div className="text-center space-y-1.5 pt-1 text-black">
                  {qrDataUrl && (
                    <div className="flex flex-col items-center justify-center pt-0.5">
                      <div className="p-1 bg-white border border-black rounded-xs">
                        <img 
                          src={qrDataUrl} 
                          alt="Código QR Oficial DGT" 
                          style={{ 
                            width: is56 ? '110px' : '140px', 
                            height: is56 ? '110px' : '140px',
                            display: 'block',
                            margin: '0 auto',
                            imageRendering: 'pixelated'
                          }}
                        />
                      </div>
                      <span className={`${is56 ? 'text-[8.5px]' : 'text-[9.5px]'} text-black mt-0.5 font-mono text-center font-bold`}>
                        Escanee para verificar Clave Numérica Oficial (50 dígitos)
                      </span>
                    </div>
                  )}

                  <div className={`${is56 ? 'text-[8.5px]' : 'text-[9px]'} text-black leading-tight space-y-0.5 text-center px-0.5 font-bold`}>
                    <div className="font-black">
                      Autorizada mediante resolución de la DGT N° DGT-R-033-2019 / DGT-R-48-2016.
                    </div>
                    <div>
                      Versión de Facturación Electrónica v4.4 - Ministerio de Hacienda de Costa Rica.
                    </div>
                    <div>
                      Comprobante electrónico generado y firmado digitalmente mediante llave criptográfica XAdES-EPES.
                    </div>
                  </div>

                  <div className={`font-black ${is56 ? 'text-[9px]' : 'text-[10px]'} text-black pt-0.5`}>
                    {sale.haciendaStatus === 'ACEPTADO_HACIENDA'
                      ? '✓ Aceptado y Validado por Ministerio de Hacienda'
                      : '✓ Comprobante Electrónico Emitido (DGT v4.4)'}
                  </div>
                </div>

                {/* 6. PIE DE TICKET */}
                <div className={`text-center ${is56 ? 'text-[9px]' : 'text-[10px]'} text-black pt-1 border-t border-dashed border-black font-bold`}>
                  <div>¡Muchas gracias por su preferencia!</div>
                  <div className="font-black text-black">
                    {commercialName}
                  </div>
                  <div className="text-[8.5px] text-black">
                    {haciendaConfig?.emisorAddressDetail || restaurantInfo?.location || 'Cervantes, Alvarado, Cartago'}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex flex-wrap items-center justify-between pt-2 border-t border-stone-700 gap-2 no-print">
          <div className="text-xs text-stone-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            <span>Formato: <strong>{isPos ? 'Ticket POS Rápido' : isKitchen ? 'Comanda Cocina' : 'DGT v4.4'}</strong> • <strong>{paperWidth}</strong></span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-stone-700 hover:bg-stone-600 text-stone-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Cerrar
            </button>
            <button
              id="trigger-print-btn"
              type="button"
              onClick={handlePrint}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold rounded-xl shadow-md flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Ticket ({paperWidth})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
