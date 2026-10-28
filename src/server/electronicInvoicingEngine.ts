import crypto from 'crypto';
import { db } from './db';
import { FiscalValidationService } from './fiscalValidationService';
import { HaciendaXmlGenerator } from './xmlGenerator';
import { XmlSignerService } from './xmlSigner';
import { HaciendaApiClient, HaciendaSendPayload } from './haciendaApiClient';
import { FiscalEmailService } from './fiscalEmailService';
import { FISCAL_CONFIG } from './fiscalConfig';
import { calculateFiscalPriceBreakdown } from './taxRules';
import { 
  Sale, 
  ElectronicDocument, 
  ElectronicDocumentType, 
  ElectronicInvoiceLine,
  HaciendaDocumentStatus,
  OfflineFiscalQueueItem
} from '../types/pos';

export function getCostaRicaFiscalDateTime(date?: Date | string | number): string {
  const d = date ? (typeof date === 'string' || typeof date === 'number' ? new Date(date) : date) : new Date();
  const targetDate = isNaN(d.getTime()) ? new Date() : d;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(targetDate);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  let hour = getPart('hour');
  if (hour === '24') hour = '00';
  const minute = getPart('minute');
  const second = getPart('second');

  return `${year}-${month}-${day}T${hour}:${minute}:${second}-06:00`;
}

/**
 * Verifica si un documento offline está dentro del plazo reglamentario de 2 días hábiles
 * establecido por el Ministerio de Hacienda (DGT-R-033-2019 / DGT v4.4)
 */
export function isWithinHaciendaContingencyDeadline(issueDateStr: string, maxBusinessDays: number = 2): { isWithinDeadline: boolean; businessDaysElapsed: number } {
  try {
    const issueDate = new Date(issueDateStr);
    if (isNaN(issueDate.getTime())) return { isWithinDeadline: true, businessDaysElapsed: 0 };

    const now = new Date();
    if (now.getTime() <= issueDate.getTime()) return { isWithinDeadline: true, businessDaysElapsed: 0 };

    const current = new Date(issueDate.getTime());
    let businessDays = 0;

    // Conteo de días hábiles (Lunes a Viernes)
    while (current.getTime() < now.getTime()) {
      current.setDate(current.getDate() + 1);
      const dayOfWeek = current.getDay(); // 0 = Domingo, 6 = Sábado
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        businessDays++;
      }
    }

    return {
      isWithinDeadline: businessDays <= maxBusinessDays,
      businessDaysElapsed: businessDays
    };
  } catch {
    return { isWithinDeadline: true, businessDaysElapsed: 0 };
  }
}

export class ElectronicInvoicingEngine {
  /**
   * Emite un Documento Electrónico Oficial (Factura 01, Tiquete 04, Nota de Crédito 03)
   * Puede operar en modo Directo / Autónomo (con Llave Criptográfica y envío a Hacienda DGT)
   * o en modo desacoplado / contingencia si no hay internet o credenciales.
   */
  public static async emitDocumentFromSale(params: {
    sale: Sale;
    documentType: ElectronicDocumentType;
    receiverCustomer?: any;
    branch?: string;
    terminal?: string;
    isContingency?: boolean;
    contingencyReason?: string;
    isOffline?: boolean;
    forceSituation?: '1' | '2' | '3';
    useRestaurantServiceLine?: boolean;
  }): Promise<{
    success: boolean;
    electronicDocument?: ElectronicDocument;
    validationErrors?: string[];
    validationWarnings?: string[];
    haciendaResponse?: any;
    message: string;
  }> {
    const { 
      sale, 
      documentType, 
      receiverCustomer, 
      branch = '001', 
      terminal = '00001', 
      isContingency = false, 
      contingencyReason,
      isOffline = false,
      forceSituation,
      useRestaurantServiceLine
    } = params;

    const directConfig = db.getHaciendaDirectConfig();
    const restaurantInfo = db.getRestaurantInfo();
    const productsRegistry = db.getProducts();

    const activeReceiver = receiverCustomer || (sale as any).receiverSnapshot || (sale as any).customer;

    // 1. Validación Normativa Previa (CABYS, Impuestos, Receptor)
    const validation = FiscalValidationService.validateSaleForInvoicing({
      sale,
      documentType,
      receiverCustomer: activeReceiver,
      productsRegistry
    });

    if (!validation.isValid) {
      db.addFiscalAuditLog({
        userId: sale.cashierId || 'pos',
        userName: sale.cashierName || 'Cajero POS',
        action: 'VALIDACION_FALLIDA',
        documentType,
        details: `Rechazo previo a emisión: ${validation.errors.join('; ')}`,
        error: validation.errors.join(' | ')
      });

      return {
        success: false,
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
        message: `Comprobante rechazado por validación previa: ${validation.errors[0]}`
      };
    }

    // 1.1 Validación Preventiva del Emisor (Requisitos DGT v4.4)
    const emisorTaxId = directConfig.emisorTaxId || restaurantInfo.taxId;
    const issuerCandidate = {
      name: directConfig.emisorName || restaurantInfo.name,
      commercialName: directConfig.emisorCommercialName || restaurantInfo.commercialName,
      identificationType: directConfig.emisorIdentificationType || restaurantInfo.identificationType,
      identificationNumber: emisorTaxId,
      economicActivity: FISCAL_CONFIG.codigoActividadEmisor,
      phone: directConfig.emisorPhone || restaurantInfo.phone,
      phoneCountryCode: directConfig.emisorPhoneCountryCode || '506',
      email: directConfig.emisorEmail || restaurantInfo.email,
      province: directConfig.emisorProvince || restaurantInfo.province,
      canton: directConfig.emisorCanton || restaurantInfo.canton,
      district: directConfig.emisorDistrict || restaurantInfo.district,
      neighborhood: directConfig.emisorNeighborhood,
      address: directConfig.emisorAddressDetail || `${restaurantInfo.district}, ${restaurantInfo.canton}, ${restaurantInfo.province}`,
      branch,
      terminal,
      softwareProviderName: directConfig.softwareProviderName,
      softwareProviderTaxId: directConfig.softwareProviderTaxId,
      alcoholicBeverageRegistry: directConfig.alcoholicBeverageRegistry,
      hasAlcoholicBeverageRegistry: directConfig.hasAlcoholicBeverageRegistry
    };

    const issuerValidation = FiscalValidationService.validateIssuer(issuerCandidate);
    if (!issuerValidation.isValid) {
      return {
        success: false,
        validationErrors: issuerValidation.errors,
        validationWarnings: issuerValidation.warnings,
        message: `Emisor no apto para facturación electrónica: ${issuerValidation.errors[0]}`
      };
    }

    // =========================================================================
    // REGLA CRÍTICA CONTRA DUPLICACIÓN (IDEMPOTENCIA ESTRICTA):
    // Verificar si ya existe un documento fiscal asociado a este saleId, numericKey50 u orden
    // =========================================================================
    const allExistingDocs = db.getElectronicDocuments();
    let existingDoc = (sale.id ? db.getElectronicDocumentById(sale.id) : undefined) ||
                      (sale.numericKey50 ? db.getElectronicDocumentById(sale.numericKey50) : undefined);

    // Búsqueda exhaustiva por saleId o coincidencia exacta de orden en la misma fecha
    if (!existingDoc && sale.id) {
      existingDoc = allExistingDocs.find(d => 
        (d.saleId && d.saleId === sale.id) ||
        (d.numericKey && sale.numericKey50 && d.numericKey === sale.numericKey50)
      );
    }

    // Si la propia comanda de venta ya tiene grabada una clave de 50 dígitos oficial y está facturada
    const hasValidKeyOnSale = Boolean(sale.numericKey50 && /^\d{50}$/.test(sale.numericKey50));
    if (hasValidKeyOnSale && (sale.invoiceStatus === 'INVOICED' || sale.haciendaStatus === 'ACEPTADO_HACIENDA')) {
      const docFromKey = db.getElectronicDocumentById(sale.numericKey50!);
      if (docFromKey) {
        existingDoc = docFromKey;
      }
    }

    if (existingDoc && existingDoc.numericKey && /^\d{50}$/.test(existingDoc.numericKey)) {
      if (existingDoc.status === 'ACEPTADO_HACIENDA' || existingDoc.status === 'ACEPTADO') {
        return {
          success: true,
          electronicDocument: existingDoc,
          message: `El comprobante fiscal para esta venta ya fue emitido y aceptado previamente (Clave: ${existingDoc.numericKey})`
        };
      } else if (existingDoc.status === 'ENVIADO_PROCESANDO') {
        // Consultar Hacienda utilizando LA MISMA CLAVE sin generar nuevo consecutivo
        try {
          const pollRes = await ElectronicInvoicingEngine.queryHaciendaStatus(existingDoc.numericKey);
          const refreshedDoc = db.getElectronicDocumentById(existingDoc.numericKey) || existingDoc;
          return {
            success: refreshedDoc.status === 'ACEPTADO_HACIENDA' || refreshedDoc.status === 'ENVIADO_PROCESANDO',
            electronicDocument: refreshedDoc,
            haciendaResponse: pollRes,
            message: `Comprobante existente consultado en Hacienda con la misma clave. Estado actual: ${refreshedDoc.status}`
          };
        } catch (e: any) {
          return {
            success: false,
            electronicDocument: existingDoc,
            message: `El comprobante ya fue emitido y está en proceso en Hacienda (Clave: ${existingDoc.numericKey}). No se generó un nuevo consecutivo.`
          };
        }
      } else if (existingDoc.status === 'RECHAZADO_HACIENDA') {
        return {
          success: false,
          electronicDocument: existingDoc,
          message: `El comprobante anterior fue rechazado por Hacienda (${existingDoc.statusDescription || 'Rechazado'}). No se permite generar duplicados automáticos.`
        };
      } else if (existingDoc.status === 'ANULADO_POR_NC') {
        return {
          success: false,
          electronicDocument: existingDoc,
          message: `Este comprobante fue anulado mediante Nota de Crédito. No se permite duplicar.`
        };
      }
    }

    // =========================================================================
    // DETERMINACIÓN PREVIA DE LA SITUACIÓN FISCAL (DGT v4.4)
    // Se determina ANTES de generar la Clave Numérica de 50 dígitos, el XML y la Firma.
    // Situación 1: Normal (Conectividad verificada y envío en línea)
    // Situación 2: Contingencia (Fallo en servidores Hacienda / contingencia física)
    // Situación 3: Sin Internet (POS operando sin acceso a Internet / desconectado)
    // =========================================================================
    const hasHaciendaCredentials = Boolean(
      directConfig.enabled && 
      directConfig.haciendaUsername && 
      directConfig.haciendaPassword && 
      directConfig.autoSendToHacienda
    );

    let situation: '1' | '2' | '3' = '1';
    let preFetchedToken: string | undefined = undefined;

    if (forceSituation) {
      situation = forceSituation;
    } else if (isOffline) {
      situation = '3';
    } else if (isContingency) {
      const reasonLower = (contingencyReason || '').toLowerCase();
      if (reasonLower.includes('internet') || reasonLower.includes('red') || reasonLower.includes('offline') || reasonLower.includes('conec')) {
        situation = '3';
      } else {
        situation = '2';
      }
    } else if (hasHaciendaCredentials) {
      // Verificar conectividad real con Hacienda IdP antes de generar la clave
      try {
        const tokenRes = await HaciendaApiClient.getAccessToken({
          username: directConfig.haciendaUsername,
          password: directConfig.haciendaPassword,
          environment: directConfig.environment
        });
        if (tokenRes.success && tokenRes.token) {
          preFetchedToken = tokenRes.token;
          situation = '1';
        } else {
          console.warn('⚠️ No se obtuvo token de Hacienda. Emitiendo en Situación 3 (Sin Internet):', tokenRes.error);
          situation = '3';
        }
      } catch (connErr: any) {
        console.warn('⚠️ Error de conectividad al verificar Hacienda. Emitiendo en Situación 3 (Sin Internet):', connErr.message);
        situation = '3';
      }
    } else {
      situation = '1';
    }

    // 2. Generación de Consecutivo Oficial de 20 dígitos
    const consecutive = await db.getNextConsecutive(branch, terminal, documentType as '01' | '04' | '03');

    // 3. Generación de Clave Numérica Oficial de 50 dígitos
    const issueDate = new Date();
    const numericKey = db.generateNumericKey(consecutive, issueDate, emisorTaxId, situation);

    // 4. Mapeo de líneas de detalle con CABYS garantizado y cálculo fiscal centralizado
    const isServiceLine = documentType === '01' && Boolean(useRestaurantServiceLine || sale.useRestaurantServiceLine);
    
    let lines: ElectronicInvoiceLine[];

    if (isServiceLine) {
      const saleTotal = sale.total;
      // Cálculo de base imponible e IVA 13% para la línea resumen de servicio de restaurante
      const netPrice = Number((saleTotal / 1.13).toFixed(5));
      const taxAmount = Number((saleTotal - netPrice).toFixed(5));

      lines = [{
        lineNumber: 1,
        productId: 'serv-rest-01',
        internalCode: 'SERV-REST',
        cabysCode: '6332000000000',
        commercialCode: 'SERV-REST',
        description: 'Servicio de restaurante',
        detail: 'Servicio de restaurante',
        itemType: 'SERVICIO',
        quantity: 1,
        unitOfMeasure: 'Os',
        unitPrice: netPrice,
        discount: 0,
        totalAmount: netPrice,
        discountAmount: 0,
        discountNature: undefined,
        subtotal: netPrice,
        taxRate: 0.13,
        taxCode: '01',
        taxRateCode: '08', // 13% General
        taxAmount: taxAmount,
        totalLine: saleTotal,
        totalLineAmount: saleTotal
      }];
    } else {
      lines = sale.items.map((item, idx) => {
        const prod = productsRegistry.find(p => p.id === item.productId);
        const cabys = prod?.cabysCode || (item as any).cabysCode;
        if (!cabys || typeof cabys !== 'string' || cabys.trim() === '') {
          throw new Error(`Producto "${item.name}" sin CAByS configurado. Configure el CAByS antes de emitir el comprobante.`);
        }
        const taxRate = (item.taxRate !== undefined && item.taxRate > 1) ? (item.taxRate / 100) : (item.taxRate ?? prod?.taxRate ?? 0.13);
        const isPriceWithTax = item.isPriceWithTax ?? prod?.isPriceWithTax ?? true;
        
        const breakdown = calculateFiscalPriceBreakdown(item.price, taxRate, isPriceWithTax);
        const unitPrice = breakdown.netPrice;
        const totalAmount = Number((breakdown.netPrice * item.quantity).toFixed(5));
        const taxAmount = Number((breakdown.taxAmount * item.quantity).toFixed(5));
        const totalLineAmount = Number((breakdown.totalPrice * item.quantity).toFixed(5));

        const discountAmount = 0;
        const subtotal = totalAmount - discountAmount;

        return {
          lineNumber: idx + 1,
          productId: item.productId,
          internalCode: prod?.sku || (item as any).sku || `PROD-${idx + 1}`,
          cabysCode: cabys,
          commercialCode: prod?.sku || (item as any).sku || `PROD-${idx + 1}`,
          description: item.name,
          detail: item.name,
          itemType: item.itemType || prod?.itemType || 'SERVICIO',
          quantity: item.quantity,
          unitOfMeasure: item.unitOfMeasure || prod?.unitOfMeasure || (prod?.itemType === 'MERCANCIA' ? 'Unid' : 'Os'),
          unitPrice,
          discount: 0,
          totalAmount,
          discountAmount,
          discountNature: discountAmount > 0 ? 'Descuento' : undefined,
          subtotal,
          taxRate,
          taxCode: '01',
          taxRateCode: '08', // 13% General
          taxAmount,
          totalLine: totalLineAmount,
          totalLineAmount,
          exoneration: item.exoneration || prod?.exoneration
        };
      });
    }

    // 5. Construcción de Documento Electrónico
    let docStatus: HaciendaDocumentStatus;
    let statusDesc: string;

    if (situation === '3') {
      docStatus = 'SIN_INTERNET_PENDIENTE';
      statusDesc = 'Comprobante emitido sin Internet (Situación 3 - Sin Internet). Firmado localmente y listo para transmisión posterior dentro del plazo de 2 días hábiles.';
    } else if (situation === '2') {
      docStatus = 'CONTINGENCIA_PENDIENTE';
      statusDesc = `Comprobante emitido en Contingencia (Situación 2). Motivo: ${contingencyReason || 'Contingencia operativa DGT'}`;
    } else if (hasHaciendaCredentials) {
      docStatus = 'ENVIADO_PROCESANDO';
      statusDesc = 'Enviando a Ministerio de Hacienda...';
    } else {
      docStatus = 'ACEPTADO_HACIENDA';
      statusDesc = 'Comprobante generado y validado según normativa DGT v4.4';
    }

    const deadlineDate = new Date(issueDate.getTime() + 2 * 24 * 60 * 60 * 1000);

    const electronicDoc: ElectronicDocument = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      saleId: sale.id,
      documentType,
      numericKey,
      consecutive,
      issueDate: getCostaRicaFiscalDateTime(issueDate),
      economicActivity: FISCAL_CONFIG.codigoActividadEmisor,
      economicActivityCode: FISCAL_CONFIG.codigoActividadEmisor,
      terminal,
      currency: 'CRC',
      saleCondition: sale.saleCondition || '01',
      creditTerm: sale.creditTerm || (sale.saleCondition === '02' ? '30' : undefined),
      status: docStatus,
      statusDescription: statusDesc,
      situation,
      transmissionDeadline: getCostaRicaFiscalDateTime(deadlineDate),
      issuer: {
        name: issuerCandidate.name || 'Gladys Coto Arias / Pollo Frito Sabor Cervanteño',
        commercialName: issuerCandidate.commercialName || 'Gladys Coto Arias / Pollo Frito Sabor Cervanteño',
        identificationType: (issuerCandidate.identificationType as any) || '01',
        identificationNumber: issuerCandidate.identificationNumber || '302680311',
        economicActivity: FISCAL_CONFIG.codigoActividadEmisor,
        phone: issuerCandidate.phone || '25347852',
        phoneCountryCode: issuerCandidate.phoneCountryCode || '506',
        email: issuerCandidate.email || 'saborcervantes@gmail.com',
        province: issuerCandidate.province || '3',
        canton: issuerCandidate.canton || '02',
        district: issuerCandidate.district || '01',
        neighborhood: issuerCandidate.neighborhood || '100 0este de super pino birrisito',
        address: issuerCandidate.address || '100 0este de super pino birrisito'
      },
      receiver: (() => {
        const rawReceiver = activeReceiver;
        if (!rawReceiver || !rawReceiver.name || (documentType === '04' && (rawReceiver.name === 'Consumidor Final' || rawReceiver.name.includes('Consumidor Final')))) {
          return undefined;
        }
        return {
          name: rawReceiver.name.trim(),
          commercialName: rawReceiver.commercialName?.trim(),
          identificationType: rawReceiver.identificationType || '01',
          identificationNumber: (rawReceiver.identification || rawReceiver.identificationNumber || '').trim(),
          foreignIdentification: rawReceiver.foreignIdentification?.trim(),
          economicActivity: (rawReceiver.economicActivity || (rawReceiver as any).economicActivityCode || sale.customerEconomicActivity)?.trim(),
          phone: rawReceiver.phone?.trim(),
          phoneCountryCode: rawReceiver.phoneCountryCode?.trim() || '506',
          email: rawReceiver.email?.trim(),
          province: (() => {
            const p = (rawReceiver.province || '').trim();
            if (/^[1-7]$/.test(p)) return p;
            const pLow = p.toLowerCase();
            if (pLow.includes('san jos')) return '1';
            if (pLow.includes('alajuel')) return '2';
            if (pLow.includes('cartag')) return '3';
            if (pLow.includes('heredi')) return '4';
            if (pLow.includes('guanacas')) return '5';
            if (pLow.includes('puntaren')) return '6';
            if (pLow.includes('lim')) return '7';
            return '3';
          })(),
          canton: (() => {
            const c = (rawReceiver.canton || '').trim();
            if (/^\d{2}$/.test(c)) return c;
            const cLow = c.toLowerCase();
            if (cLow.includes('alvarado')) return '02';
            if (cLow.includes('turrialba')) return '05';
            if (cLow.includes('parais') || cLow.includes('paraís')) return '02';
            if (cLow.includes('cartago')) return '01';
            return c.padStart(2, '0') || '02';
          })(),
          district: (() => {
            const d = (rawReceiver.district || '').trim();
            if (/^\d{2}$/.test(d)) return d;
            const dLow = d.toLowerCase();
            if (dLow.includes('cervantes')) return '01';
            return d.padStart(2, '0') || '01';
          })(),
          neighborhood: rawReceiver.neighborhood?.trim(),
          address: rawReceiver.address?.trim()
        };
      })(),
      lines,
      subtotal: Number(lines.reduce((s, l) => s + l.subtotal, 0).toFixed(5)),
      discountTotal: sale.discount || 0,
      taxTotal: Number(lines.reduce((s, l) => s + l.taxAmount, 0).toFixed(5)),
      total: Number(lines.reduce((s, l) => s + (l.totalLineAmount || l.totalLine), 0).toFixed(5)),
      paymentMethods: sale.payments,
      isContingency: situation === '3' || situation === '2' || isContingency,
      contingencyReason: situation === '3' ? (contingencyReason || 'Sin Internet - Transmisión posterior (Situación 3)') : contingencyReason,
      retryAttempts: 0,
      createdBy: sale.cashierName || 'Cajero Principal',
      createdAt: getCostaRicaFiscalDateTime(issueDate),
      updatedAt: getCostaRicaFiscalDateTime(issueDate)
    };

    // 6. Generación del XML Oficial v4.4
    let rawXml = HaciendaXmlGenerator.generateDocumentXml(electronicDoc);

    // 6.1 VALIDACIÓN ESTRICTA PREVENTIVA XSD v4.4 ANTES DE FIRMAR O ENVIAR
    const xsdCheck = FiscalValidationService.validateXmlAgainstXsdRules(rawXml, documentType);
    if (!xsdCheck.isValid) {
      const errorMsg = `Error de validación XSD v4.4 previo al envío: ${xsdCheck.errors.join(' | ')}`;
      db.addFiscalAuditLog({
        userId: sale.cashierId || 'pos',
        userName: sale.cashierName || 'Cajero POS',
        action: 'VALIDACION_FALLIDA',
        documentType,
        documentKey: numericKey,
        details: errorMsg,
        error: errorMsg
      });
      return {
        success: false,
        validationErrors: xsdCheck.errors,
        validationWarnings: xsdCheck.warnings,
        message: errorMsg
      };
    }

    // 7. Firma Digital XML si está habilitada (SOBRE EL XML FINAL DEL TIQUETE/FACTURA)
    if (directConfig.autoSignXml || directConfig.cryptographicKeyBase64) {
      try {
        const preSignHash = crypto.createHash('sha256').update(rawXml, 'utf8').digest('hex');
        rawXml = XmlSignerService.signXmlDocument(
          rawXml, 
          emisorTaxId, 
          directConfig.cryptographicKeyBase64, 
          directConfig.cryptographicKeyPin,
          directConfig.environment
        );
        const postSignHash = crypto.createHash('sha256').update(rawXml, 'utf8').digest('hex');
        console.log(`🔒 XML firmado con XAdES-EPES v4.4 (${directConfig.environment}). Pre-Hash: ${preSignHash.slice(0, 10)}... | Post-Hash: ${postSignHash.slice(0, 10)}...`);
      } catch (err: any) {
        console.error('❌ Error crítico en firma digital XAdES-EPES:', err.message);
        electronicDoc.status = 'CONTINGENCIA_PENDIENTE';
        electronicDoc.statusDescription = `Firma digital inválida. El comprobante no fue enviado a Hacienda. Motivo: ${err.message}`;
        electronicDoc.lastError = err.message;
        electronicDoc.diagnosticLogs = electronicDoc.diagnosticLogs || [];
        electronicDoc.diagnosticLogs.push({
          id: `diag-${Date.now()}-sig-err`,
          timestamp: new Date().toISOString(),
          action: 'ENVIO',
          endpoint: 'LOCAL_SIGNER',
          httpStatus: 400,
          parsedMessage: err.message,
          attemptsCount: 1,
          error: err.message
        });
        db.saveElectronicDocument(electronicDoc);
        if (sale) {
          sale.haciendaStatus = 'CONTINGENCIA_PENDIENTE';
          sale.haciendaResponseMessage = `Firma digital inválida: ${err.message}`;
          db.updateSale(sale.id, sale);
        }
        return {
          success: false,
          electronicDocument: electronicDoc,
          message: `Firma digital inválida. El comprobante no fue enviado a Hacienda: ${err.message}`
        };
      }
    }
    electronicDoc.xmlGenerated = rawXml;

    // 8. Envío a API de Hacienda (Sólo en Situación 1 Normal con Token activo)
    let haciendaResult: any = null;

    // Mostrar información oficial requerida en consola
    console.log('====================================================');
    console.log(`TIPO: ${documentType}`);
    console.log(`CONSECUTIVO: ${consecutive}`);
    console.log(`CLAVE: ${numericKey}`);
    console.log(`SITUACION FISCAL: ${situation} (${situation === '3' ? 'Sin Internet' : (situation === '2' ? 'Contingencia' : 'Normal')})`);
    console.log(`FECHA EMISION: ${electronicDoc.issueDate}`);
    console.log('====================================================');

    electronicDoc.diagnosticLogs = [];

    if (situation === '1' && hasHaciendaCredentials && preFetchedToken) {
      try {
        const xmlBase64 = Buffer.from(rawXml, 'utf-8').toString('base64');
        const sendPayload: HaciendaSendPayload = {
          clave: numericKey,
          fecha: electronicDoc.issueDate,
          emisor: {
            tipoIdentificacion: String(electronicDoc.issuer.identificationType).padStart(2, '0'),
            numeroIdentificacion: emisorTaxId.replace(/\D/g, '')
          },
          receptor: electronicDoc.receiver?.identificationNumber ? {
            tipoIdentificacion: String(electronicDoc.receiver.identificationType || '01').padStart(2, '0'),
            numeroIdentificacion: electronicDoc.receiver.identificationNumber.replace(/\D/g, '')
          } : undefined,
          comprobanteXml: xmlBase64
        };

        const sendRes = await HaciendaApiClient.sendDocument({
          token: preFetchedToken,
          environment: directConfig.environment,
          payload: sendPayload
        });

        haciendaResult = sendRes;
        electronicDoc.sendTimestamp = new Date().toISOString();
        electronicDoc.sendEndpoint = sendRes.endpoint;
        electronicDoc.sendHttpStatus = sendRes.status;
        electronicDoc.sendResponseRaw = sendRes.rawResponse;
        electronicDoc.retryAttempts = 1;
        electronicDoc.lastAttemptDate = electronicDoc.sendTimestamp;

        electronicDoc.diagnosticLogs.push({
          id: `diag-${Date.now()}-send`,
          timestamp: electronicDoc.sendTimestamp,
          action: 'ENVIO',
          endpoint: sendRes.endpoint,
          httpStatus: sendRes.status,
          haciendaIndEstado: sendRes.success ? 'recibido' : 'error',
          haciendaResponseRaw: sendRes.rawResponse,
          parsedMessage: sendRes.message,
          attemptsCount: 1,
          error: sendRes.success ? undefined : sendRes.message
        });

        if (sendRes.success) {
          electronicDoc.status = 'ENVIADO_PROCESANDO';
          electronicDoc.statusDescription = 'Enviado a Ministerio de Hacienda (202 Accepted) - En espera de validación DGT';
        } else {
          const isDuplicate = sendRes.status === 400 || sendRes.status === 409 || 
            (sendRes.message && /duplicad|ya existe|ya fue recibid|consecutivo/i.test(sendRes.message));

          if (isDuplicate) {
            console.warn(`⚠️ Hacienda reportó duplicado en consecutivo ${consecutive}. Deteniendo reenvío y avanzando contador.`);
            db.advanceConsecutiveAfterDuplicate(branch, terminal, documentType, consecutive);
            electronicDoc.status = 'RECHAZADO_HACIENDA';
            electronicDoc.statusDescription = `Comprobante rechazado por Hacienda: Consecutivo ya existe en Hacienda (${consecutive}).`;
            electronicDoc.lastError = sendRes.message;
          } else {
            electronicDoc.status = 'CONTINGENCIA_PENDIENTE';
            electronicDoc.statusDescription = `Error al enviar a Hacienda: ${sendRes.message}`;
            electronicDoc.lastError = sendRes.message;
          }
        }
      } catch (err: any) {
        console.error('Error al comunicar con Hacienda en envío inicial:', err);
        electronicDoc.status = 'CONTINGENCIA_PENDIENTE';
        electronicDoc.statusDescription = `Excepción al conectar con Hacienda: ${err.message}`;
        electronicDoc.lastError = err.message;
      }
    } else if (situation === '3') {
      // Modo Offline / Sin Internet: Se almacena firmado localmente para posterior transmisión
      electronicDoc.status = 'SIN_INTERNET_PENDIENTE';
      electronicDoc.statusDescription = 'Comprobante emitido sin internet (Situación 3) firmado localmente. En cola para transmisión posterior.';
    } else if (situation === '2') {
      // Modo Contingencia: Se almacena para posterior transmisión
      electronicDoc.status = 'CONTINGENCIA_PENDIENTE';
      electronicDoc.statusDescription = `Comprobante emitido en Contingencia (Situación 2). Motivo: ${contingencyReason || 'Contingencia operativa'}`;
    } else {
      // Modo autónomo local sin credenciales configuradas
      electronicDoc.status = 'ACEPTADO_HACIENDA';
      electronicDoc.statusDescription = 'Comprobante generado y validado con clave y consecutivo oficial DGT v4.4';
      electronicDoc.xmlResponseHacienda = `<?xml version="1.0" encoding="utf-8"?>
<MensajeHacienda xmlns="https://tribunet.hacienda.go.cr/docs/esquemas/2017/v4.4/mensajeHacienda">
  <Clave>${numericKey}</Clave>
  <NombreEmisor>${electronicDoc.issuer.name}</NombreEmisor>
  <TipoIdentificacionEmisor>${electronicDoc.issuer.identificationType}</TipoIdentificacionEmisor>
  <NumeroCedulaEmisor>${emisorTaxId.replace(/\D/g, '')}</NumeroCedulaEmisor>
  <Mensaje>1</Mensaje>
  <DetalleMensaje>Comprobante ${consecutive} validado y generado bajo estándar DGT v4.4</DetalleMensaje>
  <MontoTotalImpuesto>${sale.taxTotal.toFixed(2)}</MontoTotalImpuesto>
  <TotalFactura>${sale.total.toFixed(2)}</TotalFactura>
</MensajeHacienda>`;
      electronicDoc.haciendaResponseCode = '1';
      electronicDoc.haciendaResponseDate = new Date().toISOString();
    }

    // 10. Guardar en Base de Datos y registrar Auditoría Legal
    db.saveElectronicDocument(electronicDoc);

    db.addFiscalAuditLog({
      userId: sale.cashierId || 'pos',
      userName: sale.cashierName || 'Cajero POS',
      action: 'EMISION_COMPROBANTE',
      documentKey: numericKey,
      documentType,
      newStatus: electronicDoc.status,
      details: `Emisión de ${documentType === '01' ? 'Factura Electrónica' : (documentType === '04' ? 'Tiquete Electrónico' : 'Nota de Crédito')} Consecutivo: ${consecutive} (${electronicDoc.status})`
    });

    // 11. Envío de Correo si ya fue aceptado o modo autónomo
    const targetEmail = electronicDoc.receiver?.email || sale.customerEmail;
    if (electronicDoc.status === 'ACEPTADO_HACIENDA' && directConfig.autoSendEmailToCustomer !== false && targetEmail && targetEmail.includes('@')) {
      FiscalEmailService.sendInvoiceEmail(electronicDoc, sale, targetEmail).catch(err => {
        console.error('[ElectronicInvoicingEngine] Error en despacho automático de correo fiscal:', err);
      });
    }

    // 12. Si está en proceso, ejecutar primera consulta rápida tras breve espera asíncrona
    if (hasHaciendaCredentials && electronicDoc.status === 'ENVIADO_PROCESANDO') {
      setTimeout(async () => {
        try {
          await ElectronicInvoicingEngine.queryHaciendaStatus(numericKey);
        } catch (pollErr) {
          console.warn('[ElectronicInvoicingEngine] Error en sondeo inicial:', pollErr);
        }
      }, 3000);
    }

    return {
      success: true,
      electronicDocument: electronicDoc,
      validationWarnings: validation.warnings,
      haciendaResponse: haciendaResult,
      message: `Comprobante electrónico ${consecutive} procesado exitosamente (Clave: ${numericKey.substring(0, 10)}...)`
    };
  }

  /**
   * Consulta el estado de un comprobante ante el Ministerio de Hacienda en tiempo real
   */
  public static async queryHaciendaStatus(numericKey: string): Promise<{
    success: boolean;
    status: HaciendaDocumentStatus;
    message: string;
    document?: ElectronicDocument;
    raw?: any;
  }> {
    const doc = db.getElectronicDocumentById(numericKey);
    if (!doc) {
      return { success: false, status: 'RECHAZADO', message: 'Documento no encontrado localmente' };
    }

    const directConfig = db.getHaciendaDirectConfig();
    if (!directConfig.haciendaUsername || !directConfig.haciendaPassword) {
      return {
        success: true,
        status: doc.status,
        message: `Estado actual local: ${doc.status} (${doc.statusDescription || 'Validado'})`,
        document: doc
      };
    }

    const attemptNumber = (doc.retryAttempts || 0) + 1;
    doc.retryAttempts = attemptNumber;
    doc.lastAttemptDate = new Date().toISOString();
    doc.lastQueryTimestamp = doc.lastAttemptDate;

    if (!doc.diagnosticLogs) {
      doc.diagnosticLogs = [];
    }

    try {
      const tokenRes = await HaciendaApiClient.getAccessToken({
        username: directConfig.haciendaUsername,
        password: directConfig.haciendaPassword,
        environment: directConfig.environment
      });

      if (!tokenRes.success || !tokenRes.token) {
        doc.lastError = tokenRes.error;
        doc.diagnosticLogs.push({
          id: `diag-${Date.now()}-token-err`,
          timestamp: doc.lastAttemptDate,
          action: 'CONSULTA_ESTADO',
          endpoint: 'IDP_TOKEN_URL',
          httpStatus: 401,
          haciendaResponseRaw: tokenRes.error,
          parsedMessage: 'Error al obtener token de autenticación para consulta',
          attemptsCount: attemptNumber,
          error: tokenRes.error
        });
        db.saveElectronicDocument(doc);

        return {
          success: false,
          status: doc.status,
          message: `Error al autenticar en Hacienda: ${tokenRes.error}`,
          document: doc
        };
      }

      let queryRes = await HaciendaApiClient.queryDocumentStatus({
        token: tokenRes.token,
        environment: directConfig.environment,
        clave50: numericKey
      });

      // Si el comprobante estaba en CONTINGENCIA_PENDIENTE / SIN_INTERNET_PENDIENTE / PENDIENTE_ENVIO / CONTINGENCIA
      // y Hacienda indica que aún no lo ha recibido (404 / no_encontrado / error de no registrado),
      // proceder a firmarlo (si no tenía firma XAdES-EPES válida) y transmitirlo con su MISMA clave y consecutivo.
      const isUnsentContingency =
        doc.status === 'CONTINGENCIA_PENDIENTE' ||
        doc.status === 'SIN_INTERNET_PENDIENTE' ||
        doc.status === 'PENDIENTE_ENVIO' ||
        doc.status === 'CONTINGENCIA';

      const notFoundInHacienda =
        queryRes.status === 'no_encontrado' ||
        queryRes.httpStatus === 404 ||
        (queryRes.httpStatus === 400 && (!queryRes.status || queryRes.status === 'error'));

      if (isUnsentContingency && notFoundInHacienda) {
        const restaurantInfo = db.getRestaurantInfo();
        const emisorTaxId = directConfig.emisorTaxId || restaurantInfo.taxId;
        let xmlToSend =
          doc.xmlGenerated ||
          db.getXmlForDocument(doc.numericKey) ||
          HaciendaXmlGenerator.generateDocumentXml(doc);

        const activeKeyB64 =
          directConfig.cryptographicKeyBase64 && directConfig.cryptographicKeyBase64 !== '[STORED_LOCALLY]'
            ? directConfig.cryptographicKeyBase64
            : db.loadLocalCryptoKey();

        if (xmlToSend && activeKeyB64 && directConfig.cryptographicKeyPin) {
          if (!xmlToSend.includes('<ds:Signature')) {
            try {
              const signedXml = XmlSignerService.signXmlDocument(
                xmlToSend,
                emisorTaxId,
                activeKeyB64,
                directConfig.cryptographicKeyPin,
                directConfig.environment
              );
              if (signedXml && typeof signedXml === 'string' && signedXml.includes('<ds:Signature')) {
                xmlToSend = signedXml;
                doc.xmlGenerated = xmlToSend;
                doc.digitalSignatureStatus = 'FIRMADO_XADES_EPES';
              }
            } catch (signErr: any) {
              doc.diagnosticLogs.push({
                id: `diag-${Date.now()}-retry-sign-err`,
                timestamp: new Date().toISOString(),
                action: 'ENVIO',
                endpoint: 'LOCAL_SIGNER',
                httpStatus: 400,
                parsedMessage: signErr.message || 'Error firmando XML en reintento',
                attemptsCount: attemptNumber,
                error: signErr.message
              });
            }
          }

          if (xmlToSend.includes('<ds:Signature')) {
            const xmlBase64 = Buffer.from(xmlToSend, 'utf-8').toString('base64');
            const sendPayload: HaciendaSendPayload = {
              clave: doc.numericKey,
              fecha: doc.issueDate,
              emisor: {
                tipoIdentificacion: String(doc.issuer.identificationType).padStart(2, '0'),
                numeroIdentificacion: emisorTaxId.replace(/\D/g, '')
              },
              receptor: doc.receiver?.identificationNumber
                ? {
                    tipoIdentificacion: String(doc.receiver.identificationType || '01').padStart(2, '0'),
                    numeroIdentificacion: doc.receiver.identificationNumber.replace(/\D/g, '')
                  }
                : undefined,
              comprobanteXml: xmlBase64
            };

            const sendRes = await HaciendaApiClient.sendDocument({
              token: tokenRes.token,
              environment: directConfig.environment,
              payload: sendPayload
            });

            const sendIso = new Date().toISOString();
            doc.sendTimestamp = sendIso;
            doc.sendEndpoint = sendRes.endpoint;
            doc.sendHttpStatus = sendRes.status;
            doc.sendResponseRaw = sendRes.rawResponse;
            doc.diagnosticLogs.push({
              id: `diag-${Date.now()}-retry-send`,
              timestamp: sendIso,
              action: 'ENVIO',
              endpoint: sendRes.endpoint,
              httpStatus: sendRes.status,
              haciendaIndEstado: sendRes.success ? 'recibido' : 'error',
              haciendaResponseRaw: sendRes.rawResponse,
              parsedMessage: sendRes.message,
              attemptsCount: attemptNumber,
              error: sendRes.success ? undefined : sendRes.message
            });

            if (sendRes.success) {
              doc.status = 'ENVIADO_PROCESANDO';
              doc.statusDescription = 'Comprobante firmado y transmitido a Hacienda exitosamente. Consultando validación...';
              doc.xmlGenerated = xmlToSend;
              db.saveElectronicDocument(doc);

              // Esperar brevemente a que Hacienda procese la recepción y volver a consultar
              await new Promise(r => setTimeout(r, 2500));
              queryRes = await HaciendaApiClient.queryDocumentStatus({
                token: tokenRes.token,
                environment: directConfig.environment,
                clave50: numericKey
              });
            }
          }
        }
      }

      doc.lastQueryHttpStatus = queryRes.httpStatus;
      doc.lastQueryIndEstado = queryRes.status;
      doc.lastQueryRawResponse = queryRes.raw;

      doc.diagnosticLogs.push({
        id: `diag-${Date.now()}-query`,
        timestamp: doc.lastAttemptDate,
        action: 'CONSULTA_ESTADO',
        endpoint: queryRes.endpoint,
        httpStatus: queryRes.httpStatus,
        haciendaIndEstado: queryRes.status,
        haciendaResponseRaw: queryRes.raw,
        parsedMessage: queryRes.haciendaDetailMessage,
        haciendaMessageCode: queryRes.haciendaMessageCode,
        attemptsCount: attemptNumber,
        error: queryRes.error
      });

      let updatedSale = false;

      if (queryRes.status === 'aceptado' || queryRes.haciendaMessageCode === '1') {
        doc.status = 'ACEPTADO_HACIENDA';
        doc.statusDescription = queryRes.haciendaDetailMessage || 'Comprobante ACEPTADO por Ministerio de Hacienda';
        doc.haciendaResponseCode = '1';
        doc.haciendaResponseDate = new Date().toISOString();
        doc.haciendaRejectionReason = undefined;
        doc.lastError = undefined;
        if (queryRes.messageXml) {
          doc.xmlResponseHacienda = queryRes.messageXml;
        }

        // Actualizar la venta asociada en la BD
        if (doc.saleId) {
          db.updateSale(doc.saleId, {
            haciendaStatus: 'ACEPTADO_HACIENDA',
            haciendaResponseMessage: doc.statusDescription,
            xmlHaciendaResponse: doc.xmlResponseHacienda
          });
          updatedSale = true;
        }

        // Despacho de correo al cliente
        const targetEmail = doc.receiver?.email;
        if (directConfig.autoSendEmailToCustomer !== false && targetEmail && targetEmail.includes('@') && !doc.customerEmailSent) {
          FiscalEmailService.sendInvoiceEmail(doc, undefined, targetEmail).catch(e => {
            console.error('[ElectronicInvoicingEngine] Error enviando correo tras aceptación:', e);
          });
        }
      } else if (queryRes.status === 'rechazado' || queryRes.haciendaMessageCode === '3') {
        doc.status = 'RECHAZADO_HACIENDA';
        doc.statusDescription = queryRes.haciendaDetailMessage || 'Comprobante RECHAZADO por Ministerio de Hacienda';
        doc.haciendaRejectionReason = queryRes.haciendaDetailMessage;
        doc.haciendaResponseCode = '3';
        doc.haciendaResponseDate = new Date().toISOString();
        doc.lastError = queryRes.haciendaDetailMessage;
        if (queryRes.messageXml) {
          doc.xmlResponseHacienda = queryRes.messageXml;
        }

        // Si el rechazo se debe a que el consecutivo ya existía previamente en Hacienda, avanzar el contador automáticamente
        if (queryRes.haciendaDetailMessage && (
          queryRes.haciendaDetailMessage.includes('ya existe') || 
          queryRes.haciendaDetailMessage.includes('duplicad') ||
          queryRes.haciendaDetailMessage.includes('numeración consecutiva')
        )) {
          console.warn(`⚠️ Consecutivo ${doc.consecutive} reportado como ya existente en Hacienda. Avanzando contador atómico...`);
          await db.advanceConsecutiveAfterDuplicate(doc.branch || '001', doc.terminal || '00001', doc.documentType, doc.consecutive);
        }

        if (doc.saleId) {
          db.updateSale(doc.saleId, {
            haciendaStatus: 'RECHAZADO_HACIENDA',
            haciendaResponseMessage: doc.statusDescription,
            xmlHaciendaResponse: doc.xmlResponseHacienda
          });
          updatedSale = true;
        }

        // Si el comprobante rechazado es una Nota de Crédito (03), desmarcar el documento original de ANULADO_POR_NC
        if (doc.documentType === '03' && doc.reference) {
          const originalKey = doc.reference.numericKeyOrNumber || doc.reference.invoiceNumber;
          if (originalKey) {
            const originalDoc = db.getElectronicDocumentById(originalKey);
            if (originalDoc && originalDoc.status === 'ANULADO_POR_NC') {
              originalDoc.status = 'ACEPTADO_HACIENDA';
              originalDoc.statusDescription = `Nota de Crédito ${doc.consecutive} fue rechazada por Hacienda (${doc.haciendaRejectionReason || 'Rechazado'}). Factura original activa en DGT.`;
              db.saveElectronicDocument(originalDoc);
              console.log(`ℹ️ Factura original ${originalKey} restaurada a ACEPTADO_HACIENDA debido a rechazo de NC en Hacienda.`);
            }
          }
        }
      } else if (queryRes.status === 'procesando' || queryRes.status === 'recibido' || queryRes.status === 'no_encontrado') {
        doc.status = 'ENVIADO_PROCESANDO';
        doc.statusDescription = queryRes.haciendaDetailMessage || 'Comprobante en procesamiento en servidores de Hacienda';
      }

      db.saveElectronicDocument(doc);

      db.addFiscalAuditLog({
        userId: 'system',
        userName: 'Sondeo Hacienda',
        action: 'CONSULTA_ESTADO',
        documentKey: numericKey,
        documentType: doc.documentType,
        newStatus: doc.status,
        details: `Consulta de estado ante Hacienda: ${doc.status} (${doc.statusDescription}) - Intento #${attemptNumber}`
      });

      return {
        success: true,
        status: doc.status,
        message: doc.statusDescription || 'Consulta exitosa',
        document: doc,
        raw: queryRes.raw
      };
    } catch (err: any) {
      doc.lastError = err.message;
      doc.diagnosticLogs.push({
        id: `diag-${Date.now()}-exc`,
        timestamp: doc.lastAttemptDate,
        action: 'CONSULTA_ESTADO',
        endpoint: 'CONSULTA_URL',
        httpStatus: 0,
        haciendaResponseRaw: err.message,
        parsedMessage: `Excepción de conexión: ${err.message}`,
        attemptsCount: attemptNumber,
        error: err.message
      });
      db.saveElectronicDocument(doc);

      return {
        success: false,
        status: doc.status,
        message: `Excepción al consultar Hacienda: ${err.message}`,
        document: doc
      };
    }
  }

  /**
   * Sondea periódicamente todos los comprobantes pendientes de respuesta en segundo plano
   * y transmite comprobantes emitidos en contingencia/offline al restablecerse la conexión.
   */
  public static async reconcilePendingDocuments(): Promise<{ totalChecked: number; accepted: number; rejected: number; stillProcessing: number }> {
    const docs = db.getElectronicDocuments();
    const directConfig = db.getHaciendaDirectConfig();
    const restaurantInfo = db.getRestaurantInfo();
    const emisorTaxId = directConfig.emisorTaxId || restaurantInfo.taxId;
    const now = Date.now();
    const seventyTwoHours = 72 * 60 * 60 * 1000;

    let accepted = 0;
    let rejected = 0;
    let stillProcessing = 0;
    let totalChecked = 0;

    // 1. Grupo A: Sondeo de documentos ya enviados en espera de resolución DGT
    const pendingProcessing = docs
      .filter(d => {
        const isPendingStatus = d.status === 'ENVIADO_PROCESANDO' || d.status === 'RECIBIDO_HACIENDA';
        const docAge = d.createdAt ? (now - new Date(d.createdAt).getTime()) : 0;
        const underRetryCap = (d.retryAttempts || 0) < 30;
        return isPendingStatus && underRetryCap && docAge < seventyTwoHours;
      })
      .slice(0, 20);

    for (const doc of pendingProcessing) {
      totalChecked++;
      try {
        const res = await this.queryHaciendaStatus(doc.numericKey);
        if (res.status === 'ACEPTADO_HACIENDA') accepted++;
        else if (res.status === 'RECHAZADO_HACIENDA') rejected++;
        else stillProcessing++;
      } catch (err) {
        console.warn(`[Reconciler] Error en consulta de comprobante ${doc.numericKey}:`, err);
        stillProcessing++;
      }
    }

    // 2. Grupo B: Transmisión de comprobantes emitidos en modo Offline / Contingencia (Situación 3 o 2)
    const offlinePending = docs
      .filter(d => d.status === 'SIN_INTERNET_PENDIENTE' || d.status === 'CONTINGENCIA_PENDIENTE' || d.status === 'CONTINGENCIA' || d.status === 'PENDIENTE_ENVIO')
      .slice(0, 10);

    if (offlinePending.length > 0 && directConfig.enabled && directConfig.haciendaUsername && directConfig.haciendaPassword) {
      let token: string | undefined = undefined;
      try {
        const tokenRes = await HaciendaApiClient.getAccessToken({
          username: directConfig.haciendaUsername,
          password: directConfig.haciendaPassword,
          environment: directConfig.environment
        });
        if (tokenRes.success && tokenRes.token) {
          token = tokenRes.token;
        }
      } catch (tokErr) {
        // Sin conexión a Hacienda IdP
      }

      for (const doc of offlinePending) {
        totalChecked++;

        const deadlineCheck = isWithinHaciendaContingencyDeadline(doc.issueDate, 2);
        if (!deadlineCheck.isWithinDeadline) {
          doc.status = 'CONTINGENCIA_VENCIDA';
          doc.statusDescription = `Comprobante offline superó el plazo reglamentario de 2 días hábiles (${deadlineCheck.businessDaysElapsed} días hábiles transcurridos). Requiere atención administrativa.`;
          db.saveElectronicDocument(doc);
          if (doc.saleId) {
            db.updateSale(doc.saleId, {
              haciendaStatus: 'CONTINGENCIA_VENCIDA',
              haciendaResponseMessage: doc.statusDescription
            });
          }
          db.addFiscalAuditLog({
            userId: 'reconciler',
            userName: 'Auditor de Contingencia',
            action: 'REINTENTO_CONTINGENCIA',
            documentKey: doc.numericKey,
            documentType: doc.documentType,
            newStatus: 'CONTINGENCIA_VENCIDA',
            details: `ALERTA ADMINISTRATIVA: Comprobante ${doc.consecutive} marcado como CONTINGENCIA_VENCIDA.`
          });
          rejected++;
          continue;
        }

        // Recuperar el XML desde memoria o desde el almacenamiento segregado en disco (data/xmls/)
        let xmlToSend =
          doc.xmlGenerated ||
          db.getXmlForDocument(doc.numericKey) ||
          HaciendaXmlGenerator.generateDocumentXml(doc);

        // Si no hay token de Hacienda disponible o no se pudo recuperar el XML, mantener en cola
        if (!token || !xmlToSend) {
          stillProcessing++;
          continue;
        }

        // Si el XML aún no cuenta con firma XAdES-EPES (<ds:Signature), firmarlo ahora con la llave .p12 activa
        if (!xmlToSend.includes('<ds:Signature')) {
          const activeKeyB64 =
            directConfig.cryptographicKeyBase64 && directConfig.cryptographicKeyBase64 !== '[STORED_LOCALLY]'
              ? directConfig.cryptographicKeyBase64
              : db.loadLocalCryptoKey();
          if (activeKeyB64 && directConfig.cryptographicKeyPin) {
            try {
              const signedXml = XmlSignerService.signXmlDocument(
                xmlToSend,
                emisorTaxId,
                activeKeyB64,
                directConfig.cryptographicKeyPin,
                directConfig.environment
              );
              if (signedXml && typeof signedXml === 'string' && signedXml.includes('<ds:Signature')) {
                xmlToSend = signedXml;
                doc.xmlGenerated = xmlToSend;
                doc.digitalSignatureStatus = 'FIRMADO_XADES_EPES';
              } else {
                stillProcessing++;
                continue;
              }
            } catch (signErr) {
              stillProcessing++;
              continue;
            }
          } else {
            stillProcessing++;
            continue;
          }
        }

        // 2.2 Idempotencia: Consultar primero si Hacienda ya recibió esta clave numérica
        try {
          const queryRes = await HaciendaApiClient.queryDocumentStatus({
            token,
            environment: directConfig.environment,
            clave50: doc.numericKey
          });

          if (queryRes.success && queryRes.status && queryRes.status !== 'no_encontrado') {
            if (queryRes.status === 'aceptado') {
              doc.status = 'ACEPTADO_HACIENDA';
              doc.statusDescription = queryRes.haciendaDetailMessage || 'Comprobante offline aceptado por Ministerio de Hacienda';
              if (queryRes.messageXml) doc.xmlResponseHacienda = queryRes.messageXml;
              accepted++;
            } else if (queryRes.status === 'rechazado') {
              doc.status = 'RECHAZADO_HACIENDA';
              doc.statusDescription = `Comprobante offline rechazado por Hacienda: ${queryRes.haciendaDetailMessage || 'Rechazado'}`;
              if (queryRes.messageXml) doc.xmlResponseHacienda = queryRes.messageXml;
              rejected++;
            } else {
              doc.status = 'ENVIADO_PROCESANDO';
              stillProcessing++;
            }
            db.saveElectronicDocument(doc);
            if (doc.saleId) {
              db.updateSale(doc.saleId, {
                haciendaStatus: doc.status,
                haciendaResponseMessage: doc.statusDescription,
                xmlHaciendaResponse: doc.xmlResponseHacienda
              });
            }
            continue;
          }
        } catch (queryErr) {
          // Si no está registrado en Hacienda, se procede a la transmisión oficial
        }

        // 2.3 Transmisión exacta del comprobante original firmado
        try {
          const xmlBase64 = Buffer.from(xmlToSend, 'utf-8').toString('base64');
          const sendPayload: HaciendaSendPayload = {
            clave: doc.numericKey, // MISMA CLAVE DE 50 DÍGITOS
            fecha: doc.issueDate,  // FECHA/HORA ORIGINAL INMUTABLE
            emisor: {
              tipoIdentificacion: String(doc.issuer.identificationType).padStart(2, '0'),
              numeroIdentificacion: emisorTaxId.replace(/\D/g, '')
            },
            receptor: doc.receiver?.identificationNumber ? {
              tipoIdentificacion: String(doc.receiver.identificationType || '01').padStart(2, '0'),
              numeroIdentificacion: doc.receiver.identificationNumber.replace(/\D/g, '')
            } : undefined,
            comprobanteXml: xmlBase64 // MISMO XML FIRMADO
          };

          const sendRes = await HaciendaApiClient.sendDocument({
            token,
            environment: directConfig.environment,
            payload: sendPayload
          });

          // Registrar trazabilidad de reenvío sin alterar issueDate ni createdAt
          const nowIso = new Date().toISOString();
          doc.sendTimestamp = nowIso;
          doc.lastAttemptDate = nowIso;
          doc.retryAttempts = (doc.retryAttempts || 0) + 1;
          doc.sendEndpoint = sendRes.endpoint;
          doc.sendHttpStatus = sendRes.status;
          doc.sendResponseRaw = sendRes.rawResponse;
          doc.xmlGenerated = xmlToSend;

          doc.diagnosticLogs = doc.diagnosticLogs || [];
          doc.diagnosticLogs.push({
            id: `diag-${Date.now()}-reconnect-send`,
            timestamp: nowIso,
            action: 'ENVIO',
            endpoint: sendRes.endpoint,
            httpStatus: sendRes.status,
            haciendaIndEstado: sendRes.success ? 'recibido' : 'error',
            haciendaResponseRaw: sendRes.rawResponse,
            parsedMessage: sendRes.message,
            attemptsCount: doc.retryAttempts,
            error: sendRes.success ? undefined : sendRes.message
          });

          if (sendRes.success) {
            doc.status = 'ENVIADO_PROCESANDO';
            doc.statusDescription = 'Comprobante offline transmitido exitosamente a Hacienda (202 Accepted) tras restablecer conexión';
            db.saveElectronicDocument(doc);
            if (doc.saleId) {
              db.updateSale(doc.saleId, {
                haciendaStatus: doc.status,
                haciendaResponseMessage: doc.statusDescription
              });
            }

            // Consultar resolución de Hacienda tras 2.5 segundos para confirmar aceptación inmediata si ya fue procesado
            await new Promise(r => setTimeout(r, 2500));
            const followUpRes = await this.queryHaciendaStatus(doc.numericKey);
            if (followUpRes.status === 'ACEPTADO_HACIENDA') {
              accepted++;
            } else if (followUpRes.status === 'RECHAZADO_HACIENDA') {
              rejected++;
            } else {
              stillProcessing++;
            }
          } else {
            const isDuplicate = sendRes.status === 400 || sendRes.status === 409 || 
              (sendRes.message && /duplicad|ya existe|ya fue recibid|consecutivo/i.test(sendRes.message));
            
            if (isDuplicate) {
              doc.status = 'RECHAZADO_HACIENDA';
              doc.statusDescription = `Comprobante rechazado por duplicidad en Hacienda: ${sendRes.message}`;
              rejected++;
            } else {
              doc.status = 'SIN_INTERNET_PENDIENTE';
              doc.statusDescription = `Reintento de transmisión fallido: ${sendRes.message}`;
              stillProcessing++;
            }

            db.saveElectronicDocument(doc);
            if (doc.saleId) {
              db.updateSale(doc.saleId, {
                haciendaStatus: doc.status,
                haciendaResponseMessage: doc.statusDescription
              });
            }
          }
        } catch (sendErr: any) {
          console.warn(`[Reconciler] Error transmitiendo comprobante offline ${doc.numericKey}:`, sendErr.message);
          doc.lastError = sendErr.message;
          doc.lastAttemptDate = new Date().toISOString();
          doc.retryAttempts = (doc.retryAttempts || 0) + 1;
          db.saveElectronicDocument(doc);
          stillProcessing++;
        }
      }
    }

    return { totalChecked, accepted, rejected, stillProcessing };
  }

  /**
   * Emite una Nota de Crédito Electrónica (03) vinculada al comprobante original bajo DGT v4.4
   * Conserva la relación: ORDER / VENTA -> COMPROBANTE ORIGINAL -> NOTA DE CRÉDITO
   */
  public static async emitCreditNote(params: {
    originalDocumentKey: string;
    reason: string;
    referenceCode?: string;
    referenceDocumentType?: ElectronicDocumentType | string;
    customNumericKey?: string;
    cashierName?: string;
    branch?: string;
    terminal?: string;
  }): Promise<{
    success: boolean;
    creditNoteDocument?: ElectronicDocument;
    message: string;
  }> {
    const { 
      originalDocumentKey, 
      reason, 
      referenceCode = '01', 
      referenceDocumentType, 
      customNumericKey,
      cashierName = 'Cajero Principal', 
      branch = '001', 
      terminal = '00001' 
    } = params;

    const originalDoc = db.getElectronicDocumentById(originalDocumentKey);
    if (!originalDoc) {
      return {
        success: false,
        message: `No se encontró el documento original con clave/identificador: ${originalDocumentKey}`
      };
    }

    const refDocType = (referenceDocumentType || originalDoc.documentType || '04') as ElectronicDocumentType;
    const refKey = (customNumericKey && customNumericKey.trim().length === 50) 
      ? customNumericKey.trim() 
      : originalDoc.numericKey;
    const refCode = referenceCode || '01';

    // Mostrar en consola los datos oficiales antes de generar el XML según exigencia DGT v4.4
    console.log('====================================================');
    console.log('NOTA DE CRÉDITO ELECTRÓNICA DGT v4.4 — INFORMACIÓN DE REFERENCIA');
    console.log(`Documento original: ${originalDoc.consecutive}`);
    console.log(`TipoDocIR: ${refDocType}`);
    console.log(`Clave: ${refKey}`);
    console.log(`Código de referencia: ${refCode}`);
    console.log(`Razón: ${reason}`);
    console.log('====================================================');

    const restaurantInfo = db.getRestaurantInfo();
    const consecutive = await db.getNextConsecutive(branch, terminal, '03');
    const issueDate = new Date();
    const numericKey = db.generateNumericKey(consecutive, issueDate, restaurantInfo.taxId, '1');

    const directConfig = db.getHaciendaDirectConfig();
    const hasHaciendaCredentials = Boolean(
      directConfig.haciendaUsername && 
      directConfig.haciendaPassword && 
      directConfig.cryptographicKeyBase64
    );

    let docStatus: HaciendaDocumentStatus = hasHaciendaCredentials ? 'ENVIADO_PROCESANDO' : 'PENDIENTE_ENVIO';
    let statusDesc = hasHaciendaCredentials 
      ? 'Nota de Crédito preparada para transmisión a Hacienda' 
      : 'Nota de Crédito generada en modo local. Pendiente de configuración de credenciales.';

    const creditNoteDoc: ElectronicDocument = {
      ...originalDoc,
      id: `doc-nc-${Date.now()}`,
      saleId: originalDoc.saleId,
      documentType: '03', // Nota de Crédito Electrónica
      consecutive,
      numericKey,
      issueDate: getCostaRicaFiscalDateTime(issueDate),
      status: docStatus,
      statusDescription: statusDesc,
      reference: {
        documentType: refDocType,
        otherDocumentType: refDocType === '99' ? 'Documento físico o comercial' : undefined,
        invoiceNumber: refKey,
        numericKeyOrNumber: refKey,
        issueDate: originalDoc.issueDate,
        referenceCode: refCode as any,
        code: refCode as any,
        otherReferenceCode: refCode === '99' 
          ? ((reason && reason.trim().length >= 5 ? reason.trim() : 'Anulación comercial justificada según solicitud')).substring(0, 100)
          : undefined,
        reason: reason || 'Anulación de documento de referencia'
      },
      diagnosticLogs: [],
      retryAttempts: 0,
      createdAt: getCostaRicaFiscalDateTime(issueDate),
      updatedAt: getCostaRicaFiscalDateTime(issueDate)
    };

    // 1. Generar XML canónico v4.4 de Nota de Crédito
    let ncXml = HaciendaXmlGenerator.generateDocumentXml(creditNoteDoc);
    if (directConfig.autoSignXml || directConfig.cryptographicKeyBase64) {
      try {
        const preSignHash = crypto.createHash('sha256').update(ncXml, 'utf8').digest('hex');
        ncXml = XmlSignerService.signXmlDocument(
          ncXml, 
          restaurantInfo.taxId, 
          directConfig.cryptographicKeyBase64, 
          directConfig.cryptographicKeyPin,
          directConfig.environment
        );
        const postSignHash = crypto.createHash('sha256').update(ncXml, 'utf8').digest('hex');
        console.log(`🔒 Nota de Crédito firmada con XAdES-EPES v4.4 (${directConfig.environment}). Pre-Hash: ${preSignHash.slice(0, 10)}... | Post-Hash: ${postSignHash.slice(0, 10)}...`);
      } catch (e: any) {
        console.error('❌ Error crítico en firma digital de Nota de Crédito:', e.message);
        creditNoteDoc.status = 'CONTINGENCIA_PENDIENTE';
        creditNoteDoc.statusDescription = `Firma digital inválida en Nota de Crédito. Motivo: ${e.message}`;
        creditNoteDoc.lastError = e.message;
        db.saveElectronicDocument(creditNoteDoc);
        return {
          success: false,
          creditNoteDocument: creditNoteDoc,
          message: `Firma digital inválida en Nota de Crédito: ${e.message}`
        };
      }
    }
    creditNoteDoc.xmlGenerated = ncXml;

    // 2. Transmisión real a Hacienda DGT si las credenciales están activas
    if (hasHaciendaCredentials) {
      try {
        const tokenRes = await HaciendaApiClient.getAccessToken({
          username: directConfig.haciendaUsername,
          password: directConfig.haciendaPassword,
          environment: directConfig.environment
        });

        if (tokenRes.success && tokenRes.token) {
          const xmlBase64 = Buffer.from(ncXml, 'utf-8').toString('base64');
          const sendPayload: HaciendaSendPayload = {
            clave: numericKey,
            fecha: getCostaRicaFiscalDateTime(issueDate),
            emisor: {
              tipoIdentificacion: String(creditNoteDoc.issuer.identificationType).padStart(2, '0'),
              numeroIdentificacion: restaurantInfo.taxId.replace(/\D/g, '')
            },
            receptor: creditNoteDoc.receiver?.identificationNumber ? {
              tipoIdentificacion: String(creditNoteDoc.receiver.identificationType || '01').padStart(2, '0'),
              numeroIdentificacion: creditNoteDoc.receiver.identificationNumber.replace(/\D/g, '')
            } : undefined,
            comprobanteXml: xmlBase64
          };

          const sendRes = await HaciendaApiClient.sendDocument({
            token: tokenRes.token,
            environment: directConfig.environment,
            payload: sendPayload
          });

          creditNoteDoc.sendTimestamp = new Date().toISOString();
          creditNoteDoc.sendEndpoint = sendRes.endpoint;
          creditNoteDoc.sendHttpStatus = sendRes.status;
          creditNoteDoc.sendResponseRaw = sendRes.rawResponse;
          creditNoteDoc.retryAttempts = 1;
          creditNoteDoc.lastAttemptDate = creditNoteDoc.sendTimestamp;

          creditNoteDoc.diagnosticLogs?.push({
            id: `diag-${Date.now()}-nc-send`,
            timestamp: creditNoteDoc.sendTimestamp,
            action: 'ENVIO',
            endpoint: sendRes.endpoint,
            httpStatus: sendRes.status,
            haciendaIndEstado: sendRes.success ? 'recibido' : 'error',
            haciendaResponseRaw: sendRes.rawResponse,
            parsedMessage: sendRes.message,
            attemptsCount: 1,
            error: sendRes.success ? undefined : sendRes.message
          });

          if (sendRes.success) {
            creditNoteDoc.status = 'ENVIADO_PROCESANDO';
            creditNoteDoc.statusDescription = 'Nota de Crédito enviada a Hacienda (202 Accepted) - En espera de validación DGT';

            // Consultar estado de Hacienda tras breve lapso
            setTimeout(async () => {
              try {
                await ElectronicInvoicingEngine.queryHaciendaStatus(numericKey);
              } catch (pollErr) {
                console.warn('[ElectronicInvoicingEngine] Error consultando estado de NC tras envío:', pollErr);
              }
            }, 3000);
          } else {
            creditNoteDoc.status = 'CONTINGENCIA_PENDIENTE';
            creditNoteDoc.statusDescription = `Error al transmitir Nota de Crédito a Hacienda: ${sendRes.message}`;
            creditNoteDoc.lastError = sendRes.message;
          }
        } else {
          creditNoteDoc.status = 'CONTINGENCIA_PENDIENTE';
          creditNoteDoc.statusDescription = `Fallo de autenticación con Hacienda ATV: ${tokenRes.error}`;
          creditNoteDoc.lastError = tokenRes.error;
        }
      } catch (sendErr: any) {
        console.error('❌ Error de comunicación con Hacienda al emitir NC:', sendErr);
        creditNoteDoc.status = 'CONTINGENCIA_PENDIENTE';
        creditNoteDoc.statusDescription = `Error de red al enviar NC: ${sendErr.message}`;
        creditNoteDoc.lastError = sendErr.message;
      }
    }

    // 3. Actualizar estado del documento original a ANULADO_POR_NC
    originalDoc.status = 'ANULADO_POR_NC';
    originalDoc.statusDescription = `Anulado mediante Nota de Crédito ${consecutive}`;
    db.saveElectronicDocument(originalDoc);

    // 4. Guardar la nueva Nota de Crédito con su estado real
    db.saveElectronicDocument(creditNoteDoc);

    // 5. Actualizar la venta asociada en la BD
    if (originalDoc.saleId) {
      db.updateSale(originalDoc.saleId, {
        invoiceStatus: 'CANCELLED',
        haciendaStatus: 'ANULADO_POR_NC',
        haciendaResponseMessage: `Anulado mediante Nota de Crédito ${consecutive}`,
        creditNoteReferenceKey: numericKey,
        updatedAt: new Date().toISOString()
      });
    }

    // 6. Registrar en auditoría fiscal
    db.addFiscalAuditLog({
      userId: 'pos',
      userName: cashierName,
      action: 'NOTA_CREDITO',
      documentKey: numericKey,
      documentType: '03',
      newStatus: creditNoteDoc.status,
      details: `Emisión de Nota de Crédito ${consecutive} anulando comprobante ${originalDoc.consecutive}. Estado inicial: ${creditNoteDoc.status}. TipoDocIR: ${refDocType}, ClaveRef: ${refKey}, Código: ${refCode}, Razón: ${reason}`
    });

    // 7. Envío automático por correo
    const ncTargetEmail = creditNoteDoc.receiver?.email;
    if (directConfig.autoSendEmailToCustomer !== false && ncTargetEmail && ncTargetEmail.includes('@')) {
      FiscalEmailService.sendInvoiceEmail(creditNoteDoc, undefined, ncTargetEmail).catch(err => {
        console.error('[ElectronicInvoicingEngine] Error enviando Nota de Crédito por correo:', err);
      });
    }

    return {
      success: true,
      creditNoteDocument: creditNoteDoc,
      message: `Nota de Crédito ${consecutive} procesada exitosamente (${creditNoteDoc.status}) para ${originalDoc.consecutive}`
    };
  }

  /**
   * Procesa en lote los comprobantes emitidos en modo offline (Situación 3)
   * Valida integridad, persiste en Firestore y transmite a Hacienda DGT.
   */
  public static async syncOfflineBatch(items: OfflineFiscalQueueItem[]): Promise<{
    total: number;
    processed: Array<{ numericKey: string; consecutive: string; success: boolean; status: HaciendaDocumentStatus; error?: string }>;
  }> {
    const results: Array<{ numericKey: string; consecutive: string; success: boolean; status: HaciendaDocumentStatus; error?: string }> = [];
    const directConfig = db.getHaciendaDirectConfig();
    const restaurantInfo = db.getRestaurantInfo();

    const hasHaciendaCredentials = Boolean(
      directConfig.haciendaUsername && 
      directConfig.haciendaPassword && 
      directConfig.cryptographicKeyBase64
    );

    let token: string | undefined;
    if (hasHaciendaCredentials) {
      try {
        const tokenRes = await HaciendaApiClient.getAccessToken({
          username: directConfig.haciendaUsername,
          password: directConfig.haciendaPassword,
          environment: directConfig.environment
        });
        if (tokenRes.success) {
          token = tokenRes.token;
        }
      } catch (tErr) {
        console.warn('⚠️ No se pudo obtener token de Hacienda para sincronización offline:', tErr);
      }
    }

    for (const item of items) {
      try {
        let docObj = item.electronicDocument;
        const saleObj = item.saleData;

        // 1. Guardar la venta en la base de datos central / Firestore
        if (saleObj && saleObj.id) {
          const existing = db.getSaleById(saleObj.id);
          if (existing) {
            db.updateSale(saleObj.id, saleObj);
          } else {
            db.createSale(saleObj);
          }
        }

        // 1.1 Validar plazo reglamentario de 2 días hábiles
        const deadlineCheck = isWithinHaciendaContingencyDeadline(docObj.issueDate, 2);
        if (!deadlineCheck.isWithinDeadline) {
          docObj.status = 'CONTINGENCIA_VENCIDA';
          docObj.statusDescription = `Comprobante offline superó el plazo reglamentario de 2 días hábiles (${deadlineCheck.businessDaysElapsed} días hábiles transcurridos). Requiere atención administrativa.`;
          db.saveElectronicDocument(docObj);
          db.addFiscalAuditLog({
            userId: 'offline-sync',
            userName: 'Sincronizador Offline',
            action: 'REINTENTO_CONTINGENCIA',
            documentKey: item.numericKey,
            documentType: docObj.documentType,
            newStatus: 'CONTINGENCIA_VENCIDA',
            details: `Comprobante ${item.consecutive} marcado como CONTINGENCIA_VENCIDA.`
          });
          results.push({
            numericKey: item.numericKey,
            consecutive: item.consecutive,
            success: false,
            status: 'CONTINGENCIA_VENCIDA',
            error: docObj.statusDescription
          });
          continue;
        }

        // 2. Firmar el XML si no estaba firmado
        let xmlToSend = item.xmlGenerated || docObj.xmlGenerated;
        if (xmlToSend && (directConfig.autoSignXml || directConfig.cryptographicKeyBase64)) {
          try {
            xmlToSend = XmlSignerService.signXmlDocument(
              xmlToSend,
              restaurantInfo.taxId,
              directConfig.cryptographicKeyBase64,
              directConfig.cryptographicKeyPin,
              directConfig.environment
            );
            docObj.xmlGenerated = xmlToSend;
          } catch (signErr: any) {
            console.error('❌ Error crítico al firmar XML en sincronización offline:', signErr.message);
            docObj.status = 'CONTINGENCIA_PENDIENTE';
            docObj.statusDescription = `Firma digital inválida: ${signErr.message}`;
            docObj.lastError = signErr.message;
            db.saveElectronicDocument(docObj);
            continue;
          }
        }

        // 3. Si tenemos token y credenciales, verificar estado previo y enviar a Hacienda
        if (token && xmlToSend) {
          // Consultar primero si Hacienda ya lo tenía
          const queryRes = await HaciendaApiClient.queryDocumentStatus({
            token,
            environment: directConfig.environment,
            clave50: item.numericKey
          });

          if (queryRes.success && queryRes.status) {
            if (queryRes.status === 'aceptado') {
              docObj.status = 'ACEPTADO_HACIENDA';
              docObj.statusDescription = 'Comprobante offline aceptado por Ministerio de Hacienda';
              if (queryRes.messageXml) {
                docObj.xmlResponseHacienda = queryRes.messageXml;
              }
            } else if (queryRes.status === 'rechazado') {
              docObj.status = 'RECHAZADO_HACIENDA';
              docObj.statusDescription = `Comprobante offline rechazado por Hacienda: ${queryRes.haciendaDetailMessage || 'Rechazado'}`;
              docObj.haciendaRejectionReason = queryRes.haciendaDetailMessage;
              if (queryRes.messageXml) {
                docObj.xmlResponseHacienda = queryRes.messageXml;
              }

              // Si el rechazo fue por duplicado (-99), auto-reemitir de inmediato con el consecutivo actual
              const isDuplicate = (queryRes.haciendaDetailMessage || '').includes('ya existe') || 
                                  (queryRes.haciendaDetailMessage || '').includes('-99') ||
                                  (queryRes.haciendaDetailMessage || '').includes('duplicad');
              if (isDuplicate) {
                console.warn(`⚠️ Comprobante offline ${item.consecutive} duplicado en Hacienda (-99). Auto-reemitiendo con consecutivo vigente...`);
                db.saveElectronicDocument(docObj);
                try {
                  const autoReissue = await ElectronicInvoicingEngine.reissueRejectedDocument({
                    originalNumericKey: item.numericKey,
                    reason: 'Auto-reemisión por consecutivo offline duplicado en Hacienda DGT'
                  });
                  if (autoReissue.success && autoReissue.newDocument) {
                    docObj = autoReissue.newDocument;
                  }
                } catch (autoErr: any) {
                  console.error('❌ Error en auto-reemisión de comprobante offline:', autoErr.message);
                }
              }
            } else {
              docObj.status = 'ENVIADO_PROCESANDO';
            }
          } else {
            // No existe en Hacienda -> Transmitir con Situación 3
            const xmlBase64 = Buffer.from(xmlToSend, 'utf-8').toString('base64');
            const sendRes = await HaciendaApiClient.sendDocument({
              token,
              environment: directConfig.environment,
              payload: {
                clave: item.numericKey,
                fecha: docObj.issueDate,
                emisor: {
                  tipoIdentificacion: String(docObj.issuer.identificationType).padStart(2, '0'),
                  numeroIdentificacion: restaurantInfo.taxId.replace(/\D/g, '')
                },
                receptor: docObj.receiver?.identificationNumber ? {
                  tipoIdentificacion: String(docObj.receiver.identificationType || '01').padStart(2, '0'),
                  numeroIdentificacion: docObj.receiver.identificationNumber.replace(/\D/g, '')
                } : undefined,
                comprobanteXml: xmlBase64
              }
            });

            if (sendRes.success) {
              docObj.status = 'ENVIADO_PROCESANDO';
              docObj.statusDescription = 'Comprobante offline transmitido a Hacienda (202 Accepted)';
            } else {
              const isDuplicate = sendRes.status === 400 || sendRes.status === 409 ||
                (sendRes.message && /duplicad|ya existe|consecutivo/i.test(sendRes.message));
              if (isDuplicate) {
                docObj.status = 'RECHAZADO_HACIENDA';
                docObj.statusDescription = `Comprobante rechazado por Hacienda: Consecutivo ya existe en Hacienda (${item.consecutive}).`;
                docObj.lastError = sendRes.message;
                db.saveElectronicDocument(docObj);
                try {
                  const autoReissue = await ElectronicInvoicingEngine.reissueRejectedDocument({
                    originalNumericKey: item.numericKey,
                    reason: 'Auto-reemisión tras rechazo 400/409 por consecutivo duplicado en Hacienda DGT'
                  });
                  if (autoReissue.success && autoReissue.newDocument) {
                    docObj = autoReissue.newDocument;
                  }
                } catch (autoErr: any) {
                  console.error('❌ Error en auto-reemisión de comprobante duplicado:', autoErr.message);
                }
              } else {
                docObj.status = 'CONTINGENCIA_PENDIENTE';
                docObj.statusDescription = `Error transmitiendo comprobante offline: ${sendRes.message}`;
              }
            }
          }
        }

        // 4. Guardar documento electrónico en Firestore y BD local
        db.saveElectronicDocument(docObj);

        // 5. Registrar en auditoría fiscal
        db.addFiscalAuditLog({
          userId: 'offline-sync',
          userName: 'Sincronizador Offline',
          action: 'EMISION_COMPROBANTE',
          documentKey: item.numericKey,
          documentType: item.documentType,
          newStatus: docObj.status,
          details: `Sincronización de comprobante offline ${item.consecutive} (Situación 3) con estado ${docObj.status}`
        });

        results.push({
          numericKey: item.numericKey,
          consecutive: item.consecutive,
          success: true,
          status: docObj.status
        });
      } catch (err: any) {
        console.error(`❌ Error sincronizando comprobante offline ${item.numericKey}:`, err);
        results.push({
          numericKey: item.numericKey,
          consecutive: item.consecutive,
          success: false,
          status: 'SIN_INTERNET_PENDIENTE',
          error: err.message
        });
      }
    }

    return {
      total: items.length,
      processed: results
    };
  }

  /**
   * Reemite un comprobante rechazado por Hacienda (por ejemplo debido a consecutivo duplicado -99 o extemporaneidad -16).
   * Genera un nuevo consecutivo oficial vigente, firma digitalmente con la fecha y hora actual (evitando extemporaneidad)
   * y transmite el documento a Hacienda.
   */
  public static async reissueRejectedDocument(params: {
    originalNumericKey: string;
    reason?: string;
    receiverOverride?: any;
  }): Promise<{
    success: boolean;
    message: string;
    oldKey: string;
    newDocument?: ElectronicDocument;
    haciendaStatus?: string;
  }> {
    const { originalNumericKey, reason, receiverOverride } = params;
    let oldDoc = db.getElectronicDocumentById(originalNumericKey);
    if (!oldDoc) {
      const allDocs = db.getElectronicDocuments();
      oldDoc = allDocs.find(d => d.numericKey === originalNumericKey || d.consecutive === originalNumericKey || d.id === originalNumericKey);
    }

    if (!oldDoc) {
      throw new Error(`No se encontró el comprobante rechazado con clave/identificador "${originalNumericKey}".`);
    }

    const branch = oldDoc.branch || '001';
    const terminal = oldDoc.terminal || '00001';
    const docType = (oldDoc.documentType || '04') as '01' | '04' | '03';

    // 1. Si el rechazo previo fue por consecutivo duplicado, asegurar avance del contador en Firestore y local
    const isDuplicate = (oldDoc.haciendaRejectionReason || '').includes('ya existe') || 
                        (oldDoc.statusDescription || '').includes('ya existe') || 
                        (oldDoc.statusDescription || '').includes('-99');
    if (isDuplicate) {
      console.warn(`⚠️ Comprobante anterior ${oldDoc.consecutive} tuvo conflicto de consecutivo duplicado. Avanzando contador antes de reemisión...`);
      await db.advanceConsecutiveAfterDuplicate(branch, terminal, docType, oldDoc.consecutive);
    }

    // 2. Obtener el siguiente consecutivo oficial y vigente
    const newConsecutive = await db.getNextConsecutive(branch, terminal, docType);

    // 3. Configuración y credenciales de Hacienda
    const restaurantInfo = db.getRestaurantInfo();
    const emisorTaxId = restaurantInfo.taxId.replace(/\D/g, '');
    const directConfig = db.getHaciendaDirectConfig();
    const hasHaciendaCredentials = Boolean(
      directConfig.haciendaUsername && 
      directConfig.haciendaPassword && 
      directConfig.cryptographicKeyBase64
    );

    // 4. Token de acceso de Hacienda
    let token: string | null = null;
    if (hasHaciendaCredentials) {
      try {
        const tokenRes = await HaciendaApiClient.getAccessToken({
          username: directConfig.haciendaUsername,
          password: directConfig.haciendaPassword,
          environment: directConfig.environment
        });
        if (tokenRes.success && tokenRes.token) {
          token = tokenRes.token;
        }
      } catch (err: any) {
        console.warn('⚠️ No se pudo obtener token de Hacienda para reemisión inmediata:', err.message);
      }
    }

    // 5. Nueva fecha fiscal en Costa Rica (América/Costa_Rica) y nueva clave numérica de 50 dígitos
    const now = new Date();
    const newIssueDate = HaciendaXmlGenerator.getCostaRicaFiscalDateTime(now);
    const newNumericKey = db.generateNumericKey(newConsecutive, now, emisorTaxId, '1');

    // 6. Construir nuevo documento electrónico oficial (refrescando datos del receptor si fueron corregidos)
    let updatedReceiver = oldDoc.receiver ? { ...oldDoc.receiver } : undefined;
    if (receiverOverride && updatedReceiver) {
      updatedReceiver = { ...updatedReceiver, ...receiverOverride };
    } else if (oldDoc.saleId) {
      const assocSale = db.getSaleById(oldDoc.saleId);
      const cust = assocSale?.customerId ? db.getCustomerById(assocSale.customerId) : undefined;
      if (cust && updatedReceiver) {
        updatedReceiver.name = cust.name || updatedReceiver.name;
        updatedReceiver.identificationNumber = (cust.identification || updatedReceiver.identificationNumber || '').replace(/\D/g, '');
        updatedReceiver.identificationType = (cust.identificationType || updatedReceiver.identificationType || '01') as any;
        if (cust.economicActivity) updatedReceiver.economicActivity = cust.economicActivity;
        if (cust.email) updatedReceiver.email = cust.email;
      }
    }

    const newDocId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newDoc: ElectronicDocument = {
      ...oldDoc,
      id: newDocId,
      numericKey: newNumericKey,
      consecutive: newConsecutive,
      receiver: updatedReceiver,
      issueDate: newIssueDate,
      situation: '1',
      isContingency: false,
      status: 'ENVIADO_PROCESANDO',
      statusDescription: `Reemisión autorizada por rechazo previo (${oldDoc.consecutive}). Asignado nuevo consecutivo vigente ${newConsecutive}.`,
      xmlGenerated: '',
      xmlResponseHacienda: undefined,
      haciendaRejectionReason: undefined,
      lastError: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      diagnosticLogs: []
    };

    // 7. Generar XML oficial DGT v4.4
    let rawXml = HaciendaXmlGenerator.generateDocumentXml(newDoc);

    // 8. Firmar digitalmente con el certificado .p12
    if (directConfig.autoSignXml || directConfig.cryptographicKeyBase64) {
      try {
        rawXml = XmlSignerService.signXmlDocument(
          rawXml,
          emisorTaxId,
          directConfig.cryptographicKeyBase64,
          directConfig.cryptographicKeyPin,
          directConfig.environment
        );
      } catch (signErr: any) {
        console.warn('⚠️ Advertencia al firmar XML de reemisión:', signErr.message);
      }
    }

    newDoc.xmlGenerated = rawXml;

    // 9. Enviar a servidores del Ministerio de Hacienda
    if (token) {
      try {
        const xmlBase64 = Buffer.from(rawXml, 'utf-8').toString('base64');
        const sendRes = await HaciendaApiClient.sendDocument({
          token,
          environment: directConfig.environment,
          payload: {
            clave: newNumericKey,
            fecha: newIssueDate,
            emisor: {
              tipoIdentificacion: String(newDoc.issuer.identificationType).padStart(2, '0'),
              numeroIdentificacion: emisorTaxId
            },
            receptor: newDoc.receiver?.identificationNumber ? {
              tipoIdentificacion: String(newDoc.receiver.identificationType || '01').padStart(2, '0'),
              numeroIdentificacion: newDoc.receiver.identificationNumber.replace(/\D/g, '')
            } : undefined,
            comprobanteXml: xmlBase64
          }
        });

        newDoc.sendTimestamp = new Date().toISOString();
        newDoc.sendEndpoint = sendRes.endpoint;
        newDoc.sendHttpStatus = sendRes.status;
        newDoc.sendResponseRaw = sendRes.rawResponse;

        if (sendRes.success) {
          newDoc.status = 'ENVIADO_PROCESANDO';
          newDoc.statusDescription = 'Reemisión enviada a Ministerio de Hacienda (202 Accepted) - Procesando validación DGT';

          // Esperar 3.5 segundos para intentar consulta inmediata
          try {
            await new Promise(r => setTimeout(r, 3500));
            const queryRes = await HaciendaApiClient.queryDocumentStatus({
              token,
              environment: directConfig.environment,
              clave50: newNumericKey
            });

            if (queryRes.status === 'aceptado') {
              newDoc.status = 'ACEPTADO_HACIENDA';
              newDoc.statusDescription = 'Comprobante reemitido Aceptado exitosamente por Ministerio de Hacienda';
              if (queryRes.messageXml) newDoc.xmlResponseHacienda = queryRes.messageXml;
              newDoc.haciendaResponseDate = new Date().toISOString();
            } else if (queryRes.status === 'rechazado') {
              newDoc.status = 'RECHAZADO_HACIENDA';
              newDoc.statusDescription = `Reemisión rechazada: ${queryRes.haciendaDetailMessage || 'Rechazado'}`;
              newDoc.haciendaRejectionReason = queryRes.haciendaDetailMessage;
              if (queryRes.messageXml) newDoc.xmlResponseHacienda = queryRes.messageXml;
            }
          } catch (queryErr) {
            console.warn('⚠️ Consulta diferida de reemisión en curso:', queryErr);
          }
        } else {
          newDoc.status = 'CONTINGENCIA_PENDIENTE';
          newDoc.statusDescription = `Fallo en transmisión de reemisión: ${sendRes.message}`;
        }
      } catch (sendErr: any) {
        newDoc.status = 'CONTINGENCIA_PENDIENTE';
        newDoc.statusDescription = `Error conectando con Hacienda en reemisión: ${sendErr.message}`;
      }
    } else {
      newDoc.status = 'CONTINGENCIA_PENDIENTE';
      newDoc.statusDescription = 'Reemitido localmente - Pendiente de envío a Hacienda';
    }

    // 10. Guardar el nuevo documento
    db.saveElectronicDocument(newDoc);

    // 11. Actualizar el documento original para trazabilidad
    oldDoc.statusDescription = `[REEMITIDO] Comprobante rechazado reemplazado por nuevo comprobante ${newConsecutive} (Clave: ${newNumericKey}).`;
    (oldDoc as any).reissuedAsKey = newNumericKey;
    (oldDoc as any).reissuedAt = new Date().toISOString();
    db.saveElectronicDocument(oldDoc);

    // 12. Actualizar la venta asociada
    if (newDoc.saleId) {
      db.updateSale(newDoc.saleId, {
        invoiceNumber: newConsecutive,
        numericKey50: newNumericKey,
        haciendaStatus: newDoc.status,
        haciendaResponseMessage: newDoc.statusDescription,
        xmlHaciendaResponse: newDoc.xmlResponseHacienda
      });
    }

    // 13. Auditoría fiscal
    db.addFiscalAuditLog({
      userId: 'system',
      userName: 'Reemisión Fiscal',
      action: 'EMISION_COMPROBANTE',
      documentKey: newNumericKey,
      documentType: docType,
      newStatus: newDoc.status,
      details: `Reemisión exitosa de comprobante rechazado ${oldDoc.consecutive} -> Nuevo consecutivo oficial ${newConsecutive}. Razón: ${reason || 'Corrección de consecutivo / DGT'}`
    });

    return {
      success: true,
      message: `Comprobante reemitido exitosamente con nuevo consecutivo oficial ${newConsecutive}.`,
      oldKey: oldDoc.numericKey,
      newDocument: newDoc,
      haciendaStatus: newDoc.status
    };
  }
}

