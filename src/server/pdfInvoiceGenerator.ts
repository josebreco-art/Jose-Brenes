import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { ElectronicDocument, Sale } from '../types/pos';

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

function getPaymentMethodName(code: string): string {
  const clean = String(code || '').toUpperCase().trim();
  const methods: Record<string, string> = {
    '01': '01 - Efectivo',
    'CASH': '01 - Efectivo',
    'EFECTIVO': '01 - Efectivo',
    '02': '02 - Tarjeta (Crédito / Débito)',
    'CARD': '02 - Tarjeta (Crédito / Débito)',
    'TARJETA': '02 - Tarjeta (Crédito / Débito)',
    '03': '03 - Cheque',
    'CHECK': '03 - Cheque',
    'CHEQUE': '03 - Cheque',
    '04': '04 - Transferencia Bancaria',
    'TRANSFER': '04 - Transferencia Bancaria',
    'TRANSFERENCIA': '04 - Transferencia Bancaria',
    '05': '05 - Recaudado por Terceros (SINPE Móvil)',
    'SINPE': '05 - Recaudado por Terceros (SINPE Móvil)',
    'SINPE_MOVIL': '05 - Recaudado por Terceros (SINPE Móvil)',
    '06': '06 - A favor de terceros',
    'THIRD_PARTY': '06 - A favor de terceros',
    '99': '99 - Otros',
    'OTHER': '99 - Otros',
    'OTRO': '99 - Otros'
  };
  return methods[clean] || '01 - Efectivo';
}

export class PdfInvoiceGenerator {
  /**
   * Caché en memoria de códigos QR generados (DataURL) para comprobantes fiscales
   * Evita recalcular la matriz QR en cada descarga o reenvío
   */
  private static qrCache = new Map<string, string>();
  private static readonly MAX_QR_CACHE_SIZE = 500;

  /**
   * Caché en memoria de PDFs generados (Buffer binario) para comprobantes fiscales
   * Acelera las descargas instantáneas desde la tabla fiscal de 250ms a < 1ms
   */
  private static pdfCache = new Map<string, { buffer: Buffer; timestamp: number }>();
  private static readonly MAX_PDF_CACHE_SIZE = 200;
  private static readonly PDF_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

  /**
   * Genera o recupera de la caché el código QR oficial de Hacienda en formato DataURL
   */
  public static async getOrGenerateQrDataUrl(numericKey: string): Promise<string> {
    const cleanKey = String(numericKey || '').trim();
    if (!cleanKey) return '';

    if (this.qrCache.has(cleanKey)) {
      return this.qrCache.get(cleanKey)!;
    }

    try {
      const qrDataUrl = await QRCode.toDataURL(cleanKey, { margin: 1, width: 250, errorCorrectionLevel: 'M' });
      if (this.qrCache.size >= this.MAX_QR_CACHE_SIZE) {
        const firstKey = this.qrCache.keys().next().value;
        if (firstKey) this.qrCache.delete(firstKey);
      }
      this.qrCache.set(cleanKey, qrDataUrl);
      return qrDataUrl;
    } catch (qrErr) {
      console.warn('[PdfInvoiceGenerator] Error generando código QR:', qrErr);
      return '';
    }
  }

  /**
   * Pre-renderiza el PDF y QR en segundo plano inmediatamente tras emitir un comprobante
   */
  public static preRenderInBackground(doc: ElectronicDocument, sale?: Sale, logoBase64?: string): void {
    if (!doc || !doc.numericKey) return;
    setImmediate(async () => {
      try {
        await this.generateInvoicePdf(doc, sale, logoBase64);
        console.log(`⚡ [PdfInvoiceGenerator Pre-Render] PDF y QR cacheados para doc ${doc.consecutive} (${doc.numericKey})`);
      } catch (err: any) {
        console.warn(`[PdfInvoiceGenerator Pre-Render] Error no bloqueante al pre-renderizar: ${err?.message || err}`);
      }
    });
  }

  /**
   * Limpia o invalida la caché de un documento en particular (ej. si cambió su estado en Hacienda)
   */
  public static invalidateCacheForDocument(numericKey: string): void {
    if (numericKey) {
      this.pdfCache.delete(numericKey);
      // Nota: El QR no cambia porque depende únicamente de la clave de 50 dígitos
    }
  }

  /**
   * Vacía toda la caché de PDFs
   */
  public static clearCache(): void {
    this.pdfCache.clear();
    this.qrCache.clear();
  }

  /**
   * Obtiene estadísticas de la caché en memoria para diagnóstico
   */
  public static getCacheStats(): { pdfCacheCount: number; qrCacheCount: number } {
    return {
      pdfCacheCount: this.pdfCache.size,
      qrCacheCount: this.qrCache.size
    };
  }

  /**
   * Genera la Representación Gráfica Oficial en PDF (DGT v4.4 Costa Rica) con caché inteligente
   */
  public static async generateInvoicePdf(doc: ElectronicDocument, sale?: Sale, logoBase64?: string): Promise<Buffer> {
    const cacheKey = doc.numericKey;
    const now = Date.now();

    // 1. Verificar si ya tenemos el PDF en memoria con el mismo estado de documento
    if (cacheKey && this.pdfCache.has(cacheKey)) {
      const cached = this.pdfCache.get(cacheKey)!;
      if (now - cached.timestamp < this.PDF_CACHE_TTL_MS) {
        return cached.buffer;
      } else {
        this.pdfCache.delete(cacheKey);
      }
    }

    const docTypeNames: Record<string, string> = {
      '01': 'FACTURA ELECTRÓNICA',
      '04': 'TIQUETE ELECTRÓNICO',
      '03': 'NOTA DE CRÉDITO ELECTRÓNICA',
      '02': 'NOTA DE DÉBITO ELECTRÓNICA'
    };

    const docTitle = docTypeNames[doc.documentType] || 'COMPROBANTE ELECTRÓNICO';
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = 210;
    const margin = 14;
    const contentWidth = pageWidth - (margin * 2);
    let y = 14;

    // ---------------------------------------------------------
    // 1. ENCABEZADO SUPERIOR: LOGO DE EMPRESA, EMISOR & TÍTULO
    // ---------------------------------------------------------
    const headerHeight = 40;
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(margin, y, contentWidth, headerHeight, 2, 2, 'F');
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(margin, y, contentWidth, headerHeight, 2, 2, 'S');

    // Logo de la Empresa (Lado izquierdo)
    const logoX = margin + 3;
    const logoY = y + 3.5;
    const logoW = 28;
    const logoH = 33;

    let logoRendered = false;
    if (logoBase64 && typeof logoBase64 === 'string' && logoBase64.length > 30) {
      try {
        let format = 'PNG';
        if (logoBase64.includes('image/jpeg') || logoBase64.includes('image/jpg')) format = 'JPEG';
        else if (logoBase64.includes('image/webp')) format = 'WEBP';
        pdf.addImage(logoBase64, format, logoX, logoY, logoW, logoH, undefined, 'FAST');
        logoRendered = true;
      } catch (err) {
        console.warn('[PdfInvoiceGenerator] Error incrustando logo base64 personalizado:', err);
      }
    }

    if (!logoRendered) {
      // Emblema Corporativo Oficial
      pdf.setFillColor(30, 41, 59); // Slate-800
      pdf.roundedRect(logoX, logoY, logoW, logoH, 2, 2, 'F');
      pdf.setDrawColor(51, 65, 85);
      pdf.roundedRect(logoX, logoY, logoW, logoH, 2, 2, 'S');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(245, 158, 11);
      const nameParts = (doc.issuer.commercialName || doc.issuer.name || 'SABOR CERVANTEÑO').toUpperCase().split(' ');
      pdf.text(nameParts[0] || 'EMISOR', logoX + (logoW / 2), logoY + 14, { align: 'center' });
      if (nameParts.length > 1) {
        pdf.setFontSize(6.5);
        pdf.setTextColor(255, 255, 255);
        pdf.text(nameParts.slice(1, 3).join(' '), logoX + (logoW / 2), logoY + 20, { align: 'center' });
      }
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6);
      pdf.setTextColor(148, 163, 184);
      pdf.text('DGT v4.4', logoX + (logoW / 2), logoY + 27, { align: 'center' });
    }

    // Datos del Emisor (Columna central, junto al logo)
    const infoX = logoX + logoW + 4;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(24, 24, 27);
    pdf.text(doc.issuer.commercialName || doc.issuer.name, infoX, y + 7);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(71, 85, 105);
    pdf.text(`Razón Social: ${doc.issuer.name}`, infoX, y + 12);
    pdf.text(`Cédula: ${doc.issuer.identificationNumber}  |  Actividad: ${doc.economicActivityCode || doc.economicActivity}`, infoX, y + 17);
    pdf.text(`Dirección: ${doc.issuer.address || 'No indicada'}`, infoX, y + 22);
    pdf.text(`Tel: ${doc.issuer.phone || 'No indicado'}  |  Email: ${doc.issuer.email || 'No indicado'}`, infoX, y + 27);
    pdf.text(`Sucursal: ${doc.branch || '001'}  |  Terminal: ${doc.terminal || '00001'}`, infoX, y + 32);

    // Caja de Tipo de Documento & Consecutivo (Lado derecho)
    const rightBoxWidth = 66;
    const rightBoxX = margin + contentWidth - rightBoxWidth - 3;
    const rightBoxY = y + 3.5;
    const rightBoxHeight = 33;

    pdf.setFillColor(254, 243, 199); // Amber-100
    pdf.roundedRect(rightBoxX, rightBoxY, rightBoxWidth, rightBoxHeight, 2, 2, 'F');
    pdf.setDrawColor(245, 158, 11);
    pdf.roundedRect(rightBoxX, rightBoxY, rightBoxWidth, rightBoxHeight, 2, 2, 'S');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(180, 83, 9);
    pdf.text(docTitle, rightBoxX + (rightBoxWidth / 2), rightBoxY + 6, { align: 'center' });

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(30, 41, 59);
    pdf.text('Consecutivo Oficial DGT:', rightBoxX + (rightBoxWidth / 2), rightBoxY + 12, { align: 'center' });

    pdf.setFont('courier', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(15, 23, 42);
    pdf.text(doc.consecutive, rightBoxX + (rightBoxWidth / 2), rightBoxY + 17, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(71, 85, 105);
    const dateFormatted = doc.issueDate 
      ? new Date(doc.issueDate).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })
      : new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });
    pdf.text(`Fecha: ${dateFormatted}`, rightBoxX + (rightBoxWidth / 2), rightBoxY + 24, { align: 'center' });

    y += 44;

    // ---------------------------------------------------------
    // 2. CLAVE NUMÉRICA DE 50 DÍGITOS (HACIENDA CR)
    // ---------------------------------------------------------
    pdf.setFillColor(241, 245, 249);
    pdf.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, 'F');
    pdf.setDrawColor(203, 213, 225);
    pdf.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, 'S');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(51, 65, 85);
    pdf.text('CLAVE NUMÉRICA OFICIAL DE HACIENDA (50 DÍGITOS):', margin + 3, y + 4.5);

    pdf.setFont('courier', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(4, 120, 87); // Emerald-700
    pdf.text(doc.numericKey, margin + 3, y + 9.5);

    y += 15;

    // ---------------------------------------------------------
    // 3. DATOS DEL CLIENTE / RECEPTOR & CONDICIONES
    // ---------------------------------------------------------
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(margin, y, contentWidth, 24, 1.5, 1.5, 'F');
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(margin, y, contentWidth, 24, 1.5, 1.5, 'S');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text('DATOS DEL RECEPTOR (CLIENTE)', margin + 4, y + 5);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(71, 85, 105);

    const clientName = doc.receiver?.name || sale?.customerName || 'Cliente General / Consumidor Final';
    const clientId = doc.receiver?.identificationNumber || sale?.customerIdentification || '000000000';
    const clientEmail = doc.receiver?.email || sale?.customerEmail || 'No indicado';
    const clientPhone = doc.receiver?.phone || sale?.customerPhone || 'No indicado';
    const clientAddress = doc.receiver?.address || sale?.customerAddress || 'No indicada';

    pdf.text(`Nombre / Razón Social: ${clientName}`, margin + 4, y + 10);
    pdf.text(`Identificación: ${clientId}  |  Teléfono: ${clientPhone}`, margin + 4, y + 15);
    pdf.text(`Correo Electrónico: ${clientEmail}`, margin + 4, y + 20);

    // Helper para formatear montos en Colones Costarricenses con símbolo ¢
    const formatColon = (amount: number | undefined): string => {
      const num = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
      return `¢${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Condición de Venta y Pago (Columna derecha)
    const midX = margin + 105;
    const saleCondDesc = doc.saleCondition === '02' ? '02 - Crédito' : '01 - Contado';
    pdf.text(`Condición de Venta: ${saleCondDesc}`, midX, y + 10);
    
    const payMethods = doc.paymentMethods?.map(p => getPaymentMethodName(p.method)).join(', ') || '01 - Efectivo';
    pdf.text(`Medio de Pago: ${payMethods}`, midX, y + 15);
    pdf.text(`Moneda Oficial: Colones Costarricenses (CRC)`, midX, y + 20);

    y += 28;

    // ---------------------------------------------------------
    // 4. TABLA DE LÍNEAS DE DETALLE (CABYS, CANT, DESC, IVA, TOTAL)
    // ---------------------------------------------------------
    // Header de la tabla
    pdf.setFillColor(30, 41, 59); // Slate-800
    pdf.rect(margin, y, contentWidth, 7, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(255, 255, 255);

    const colX = {
      line: margin + 2,
      cabys: margin + 8,
      cant: margin + 33,
      desc: margin + 45,
      price: margin + 105,
      discount: margin + 125,
      tax: margin + 145,
      total: margin + contentWidth - 3
    };

    pdf.text('#', colX.line, y + 5);
    pdf.text('Cód. CABYS', colX.cabys, y + 5);
    pdf.text('Cant', colX.cant, y + 5);
    pdf.text('Descripción / Detalle', colX.desc, y + 5);
    pdf.text('Precio Unit.', colX.price, y + 5, { align: 'right' });
    pdf.text('Desc.', colX.discount, y + 5, { align: 'right' });
    pdf.text('IVA', colX.tax, y + 5, { align: 'center' });
    pdf.text('Total Línea', colX.total, y + 5, { align: 'right' });

    y += 7;

    // Filas de la tabla
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);

    doc.lines.forEach((line, index) => {
      // Evitar salto de página cortando
      if (y > 230) {
        pdf.addPage();
        y = 14;
      }

      const isEven = index % 2 === 0;
      if (isEven) {
        pdf.setFillColor(248, 250, 252);
        pdf.rect(margin, y, contentWidth, 6.5, 'F');
      }

      pdf.setDrawColor(241, 245, 249);
      pdf.line(margin, y + 6.5, margin + contentWidth, y + 6.5);

      pdf.setTextColor(30, 41, 59);
      pdf.text(String(line.lineNumber || index + 1), colX.line, y + 4.5);
      
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(7);
      pdf.text(String(line.cabysCode || '5610001000100'), colX.cabys, y + 4.5);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.text(`${line.quantity} ${line.unitOfMeasure || 'Unid'}`, colX.cant, y + 4.5);

      // Descripción truncada a ancho disponible
      const maxDescLen = 32;
      const desc = line.description.length > maxDescLen 
        ? line.description.substring(0, maxDescLen - 3) + '...' 
        : line.description;
      pdf.text(desc, colX.desc, y + 4.5);

      const discountAmt = line.discountAmount || line.discount || 0;

      pdf.text(formatColon(line.unitPrice), colX.price, y + 4.5, { align: 'right' });
      pdf.text(formatColon(discountAmt), colX.discount, y + 4.5, { align: 'right' });

      // Normalizar la tasa para mostrar el porcentaje correcto (ej: 13%, no 1300%)
      const rawRate = Number(line.taxRate !== undefined && line.taxRate !== null ? line.taxRate : 13);
      const ratePercent = rawRate > 1 ? rawRate : rawRate * 100;
      pdf.text(`${Math.round(ratePercent)}%`, colX.tax, y + 4.5, { align: 'center' });
      
      const computedLineTotal = line.totalLineAmount || line.totalLine || (line.subtotal + (line.taxAmount || 0));
      pdf.setFont('helvetica', 'bold');
      pdf.text(formatColon(computedLineTotal), colX.total, y + 4.5, { align: 'right' });
      pdf.setFont('helvetica', 'normal');

      y += 6.5;
    });

    y += 4;

    // ---------------------------------------------------------
    // 5. RESUMEN DE TOTALES, CÓDIGO QR Y DECLARACIÓN FISCAL DGT
    // ---------------------------------------------------------
    // Si no hay suficiente espacio para los totales, nueva página
    if (y > 220) {
      pdf.addPage();
      y = 14;
    }

    const summaryBoxY = y;
    const summaryBoxHeight = 58;

    // A. CAJA DERECHA: CÓDIGO QR OFICIAL DGT (ESQUINA INFERIOR DERECHA - MÍNIMO 2.5 × 2.5 CM)
    const qrBoxWidth = 52;
    const qrBoxX = margin + contentWidth - qrBoxWidth;
    
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(qrBoxX, summaryBoxY, qrBoxWidth, summaryBoxHeight, 2, 2, 'F');
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(qrBoxX, summaryBoxY, qrBoxWidth, summaryBoxHeight, 2, 2, 'S');

    // Título de la caja QR
    pdf.setFillColor(248, 250, 252);
    pdf.rect(qrBoxX, summaryBoxY, qrBoxWidth, 6, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(30, 41, 59);
    pdf.text('VERIFICACIÓN DGT HACIENDA', qrBoxX + (qrBoxWidth / 2), summaryBoxY + 4.2, { align: 'center' });

    // Generar e incrustar Código QR Oficial DGT v4.4 (Tamaño 28mm x 28mm = 2.8 x 2.8 cm, supera el mín 2.5x2.5cm)
    // El contenido codificado del QR es exactamente la clave numérica oficial de 50 dígitos del comprobante (estilo Alegra / DGT)
    const qrSize = 28; // 2.8 cm
    const qrX = qrBoxX + ((qrBoxWidth - qrSize) / 2);
    const qrY = summaryBoxY + 7.5;

    const qrData = String(doc.numericKey || '').trim();
    try {
      const qrDataUrl = await this.getOrGenerateQrDataUrl(qrData);
      if (qrDataUrl) {
        pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
      }
    } catch (qrErr) {
      console.warn('[PdfInvoiceGenerator] Error generando código QR:', qrErr);
    }

    // Leyendas oficiales bajo el QR
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(5.8);
    pdf.setTextColor(15, 23, 42);
    pdf.text('Clave Numérica (50 dígitos)', qrBoxX + (qrBoxWidth / 2), summaryBoxY + 38, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5.2);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Tamaño fiscal: 2.8 × 2.8 cm (mín. 2.5 × 2.5 cm)', qrBoxX + (qrBoxWidth / 2), summaryBoxY + 42, { align: 'center' });
    pdf.text('Esquema XML DGT v4.4 • Costa Rica', qrBoxX + (qrBoxWidth / 2), summaryBoxY + 45.5, { align: 'center' });

    if (doc.status === 'ACEPTADO_HACIENDA') {
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(4, 120, 87);
      pdf.text('✓ VALIDADO POR HACIENDA', qrBoxX + (qrBoxWidth / 2), summaryBoxY + 50, { align: 'center' });
    } else {
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(180, 83, 9);
      pdf.text('DOCUMENTO FIRMADO DGT', qrBoxX + (qrBoxWidth / 2), summaryBoxY + 50, { align: 'center' });
    }

    // B. CAJA IZQUIERDA: RESUMEN DE TOTALES Y VALIDEZ LEGAL
    const leftInfoWidth = contentWidth - qrBoxWidth - 3;
    const leftBoxX = margin;

    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(leftBoxX, summaryBoxY, leftInfoWidth, summaryBoxHeight, 2, 2, 'F');
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(leftBoxX, summaryBoxY, leftInfoWidth, summaryBoxHeight, 2, 2, 'S');

    // Subdividir caja izquierda en 2 columnas: Totales (izquierda) y Normativa/Medio de Pago (derecha)
    const colTotWidth = 62;
    const totLabelsX = leftBoxX + 3;
    const totValuesX = leftBoxX + colTotWidth - 3;
    let totY = summaryBoxY + 5;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.8);
    pdf.setTextColor(71, 85, 105);

    // Calcular montos agrupados (similar a ResumenFactura)
    let calcTotalServGravados = 0;
    let calcTotalServExentos = 0;
    let calcTotalMercGravadas = 0;
    let calcTotalMercExentas = 0;
    
    doc.lines.forEach(l => {
      const isService = l.itemType === 'SERVICIO';
      if (l.taxRate > 0) {
        if (isService) calcTotalServGravados += l.subtotal;
        else calcTotalMercGravadas += l.subtotal;
      } else {
        if (isService) calcTotalServExentos += l.subtotal;
        else calcTotalMercExentas += l.subtotal;
      }
    });
    const totalGravado = calcTotalServGravados + calcTotalMercGravadas;
    const totalExento = calcTotalServExentos + calcTotalMercExentas;

    pdf.text('Total Gravado:', totLabelsX, totY);
    pdf.text(formatColon(totalGravado), totValuesX, totY, { align: 'right' });
    totY += 4;
    
    pdf.text('Total Exento:', totLabelsX, totY);
    pdf.text(formatColon(totalExento), totValuesX, totY, { align: 'right' });
    totY += 4;

    pdf.text('Subtotal:', totLabelsX, totY);
    pdf.text(formatColon(doc.subtotal), totValuesX, totY, { align: 'right' });
    totY += 4;

    pdf.text('Descuentos:', totLabelsX, totY);
    pdf.text(formatColon(doc.discountTotal), totValuesX, totY, { align: 'right' });
    totY += 4;

    pdf.text('Impuesto IVA (13%):', totLabelsX, totY);
    pdf.text(formatColon(doc.taxTotal), totValuesX, totY, { align: 'right' });
    totY += 5;

    // TOTAL COMPROBANTE DESTACADO EN COLONES
    const totalBoxHeight = 13.5;
    pdf.setFillColor(254, 243, 199); // Amber-100
    pdf.roundedRect(totLabelsX - 1, totY - 3, colTotWidth - 4, totalBoxHeight, 1.5, 1.5, 'F');
    pdf.setDrawColor(245, 158, 11);
    pdf.roundedRect(totLabelsX - 1, totY - 3, colTotWidth - 4, totalBoxHeight, 1.5, 1.5, 'S');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(180, 83, 9);
    pdf.text('TOTAL:', totLabelsX + 1, totY + 1.5);
    pdf.setFontSize(8.5);
    pdf.text(formatColon(doc.total), totValuesX - 1, totY + 1.5, { align: 'right' });

    // Monto en letras dentro de la columna de totales con espaciado limpio
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(4.8);
    pdf.setTextColor(146, 64, 14);
    pdf.text('MONTO EN LETRAS:', totLabelsX + 1, totY + 5.2);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(4.5);
    const letrasWords = pdf.splitTextToSize(numeroALetras(doc.total), colTotWidth - 6);
    pdf.text(letrasWords, totLabelsX + 1, totY + 8);

    // Divisor vertical interno
    const dividerX = leftBoxX + colTotWidth;
    pdf.setDrawColor(226, 232, 240);
    pdf.line(dividerX, summaryBoxY + 2, dividerX, summaryBoxY + summaryBoxHeight - 2);

    // Columna Derecha de la caja izquierda: Medios de Pago en Español y Normativa Legal
    const infoColX = dividerX + 3;
    const infoColWidth = leftInfoWidth - colTotWidth - 6;
    let infoY = summaryBoxY + 5;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.8);
    pdf.setTextColor(15, 23, 42);
    pdf.text('MEDIOS DE PAGO EN ESPAÑOL:', infoColX, infoY);
    infoY += 4;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.2);
    pdf.setTextColor(51, 65, 85);

    const paymentMethodsList = doc.paymentMethods && doc.paymentMethods.length > 0 
      ? doc.paymentMethods 
      : [{ method: '01', amount: doc.total }];

    paymentMethodsList.forEach((pm) => {
      const pmName = getPaymentMethodName(pm.method);
      const pmAmt = formatColon(pm.amount || doc.total);
      pdf.text(`• ${pmName}: ${pmAmt}`, infoColX, infoY);
      infoY += 3.5;
    });

    infoY += 1.5;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text('NORMATIVA & VALIDEZ TRIBUTARIA', infoColX, infoY);
    infoY += 3.5;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5.8);
    pdf.setTextColor(71, 85, 105);
    pdf.text('• Autorizada mediante resolución DGT-R-033-2019 de la DGT.', infoColX, infoY);
    infoY += 3;
    pdf.text('• Versión de Facturación Electrónica Oficial: v4.4.', infoColX, infoY);
    infoY += 3;
    pdf.text('• Moneda Oficial: Colones Costarricenses (CRC).', infoColX, infoY);
    infoY += 3.5;

    // Estado Hacienda
    if (doc.status === 'ACEPTADO_HACIENDA') {
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(4, 120, 87);
      pdf.text('✓ Estado en Hacienda: Aceptado y Validado', infoColX, infoY);
    } else if (doc.status === 'ENVIADO_PROCESANDO') {
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(180, 83, 9);
      pdf.text('⏳ Estado en Hacienda: Enviado en Procesamiento', infoColX, infoY);
    } else if (doc.status === 'RECHAZADO_HACIENDA') {
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(185, 28, 28);
      pdf.text('✗ Estado en Hacienda: Rechazado', infoColX, infoY);
    } else {
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(217, 119, 6);
      pdf.text('⚠️ Estado: Emitido Localmente / Contingencia', infoColX, infoY);
    }

    // ---------------------------------------------------------
    // 6. PIE DE PÁGINA
    // ---------------------------------------------------------
    const footerY = 282;
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, footerY, margin + contentWidth, footerY);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(148, 163, 184);
    pdf.text('Pollo Frito Sabor Cervanteño • Sistema de Facturación Electrónica DGT v4.4 • Costa Rica', margin, footerY + 4);
    pdf.text(`Generado el ${new Date().toLocaleString('es-CR')} • Clave: ${doc.numericKey}`, margin + contentWidth, footerY + 4, { align: 'right' });

    // Retornar buffer binario y guardar en caché
    const arrayBuffer = pdf.output('arraybuffer');
    const resultBuffer = Buffer.from(arrayBuffer);

    if (cacheKey) {
      if (this.pdfCache.size >= this.MAX_PDF_CACHE_SIZE) {
        const firstKey = this.pdfCache.keys().next().value;
        if (firstKey) this.pdfCache.delete(firstKey);
      }
      this.pdfCache.set(cacheKey, {
        buffer: resultBuffer,
        timestamp: Date.now()
      });
    }

    return resultBuffer;
  }
}
