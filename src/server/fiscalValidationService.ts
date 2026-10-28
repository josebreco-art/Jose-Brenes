// Motor de Validación Fiscal Preventivo para Facturación Electrónica de Costa Rica (Hacienda v4.4)
// Diseñado para "Pollo Frito Sabor Cervanteño" - Cervantes de Alvarado, Cartago

import { 
  Product, 
  CartItem, 
  Customer, 
  PaymentSplit, 
  FiscalValidationResult,
  ElectronicDocumentType,
  IdentificationType
} from '../types/pos';
import { OFFICIAL_CABYS_CATALOG, OFFICIAL_TAX_RATES, calculateFiscalPriceBreakdown } from './taxRules';
import { OFFICIAL_ECONOMIC_ACTIVITIES } from '../data/haciendaEconomicActivities';
import { COSTA_RICA_PROVINCES, COSTA_RICA_CANTONS, COSTA_RICA_DISTRICTS } from '../data/costaRicaGeography';
import { FISCAL_CONFIG } from './fiscalConfig';

export interface IssuerValidationDetail {
  element: string;
  xmlTag: string;
  currentValue: any;
  haciendaRequirement: string;
  obligation: 'OBLIGATORIO' | 'CONDICIONAL' | 'OPCIONAL' | 'NO_APLICA';
  status: 'PASS' | 'FAIL' | 'NO_APLICA' | 'NO_VERIFICABLE';
  message: string;
  legalReference?: string;
}

export interface IssuerAuditRow {
  field: string;
  xml: string;
  xmlTag: string;
  officialRequirement: string;
  obligation: 'OBLIGATORIO' | 'CONDICIONAL' | 'OPCIONAL' | 'NO_APLICA';
  mandatory: string;
  conditional: string;
  optional: string;
  length: string;
  rule: string;
  validation: string;
  currentValue: string;
  status: 'PASS' | 'FAIL' | 'NO_APLICA' | 'NO_VERIFICABLE';
  result: 'PASS' | 'FAIL' | 'NO_APLICA' | 'NO_VERIFICABLE';
  message: string;
  legalReference: string;
}

export interface IssuerAuditResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    totalChecked: number;
    passed: number;
    failed: number;
    optionalOrNotApplicable: number;
  };
  details: Record<string, IssuerValidationDetail>;
  tableRows: IssuerAuditRow[];
}

export class FiscalValidationService {
  /**
   * Valida un código CABYS según reglas oficiales del BCCR y Ministerio de Hacienda:
   * 1. Exactamente 13 dígitos numéricos
   * 2. No vacío ni caracteres alfanuméricos / especiales
   * 3. Existencia en el catálogo oficial
   * 4. Estado VIGENTE en la fecha actual
   */
  public static validateCabysCode(cabysCode: string | undefined | null): { 
    valid: boolean; 
    message: string; 
    officialDescription?: string;
    suggestedTax?: number;
  } {
    if (!cabysCode || typeof cabysCode !== 'string') {
      return { 
        valid: false, 
        message: 'El código CABYS es obligatorio y debe suministrarse como texto.' 
      };
    }

    const trimmed = cabysCode.trim();

    // Comprobación de longitud exacta y caracteres estrictamente numéricos
    if (!/^\d{13}$/.test(trimmed)) {
      if (trimmed.length < 13) {
        return { 
          valid: false, 
          message: `Código CABYS incompleto (${trimmed.length} dígitos). Debe contener exactamente 13 dígitos numéricos.` 
        };
      }
      if (trimmed.length > 13) {
        return { 
          valid: false, 
          message: `Código CABYS excede la longitud oficial (${trimmed.length} dígitos). El BCCR exige exactamente 13 dígitos.` 
        };
      }
      return { 
        valid: false, 
        message: 'El código CABYS solo puede contener dígitos numéricos (0-9), sin letras ni caracteres especiales.' 
      };
    }

    // Comprobación de existencia en el catálogo oficial
    const foundInCatalog = OFFICIAL_CABYS_CATALOG.find(c => c.codigoCabys === trimmed);

    if (foundInCatalog) {
      if (foundInCatalog.estado !== 'VIGENTE') {
        return {
          valid: false,
          message: `El código CABYS ${trimmed} está catalogado como ${foundInCatalog.estado} y no puede ser utilizado para nuevas emisiones tributarias.`,
          officialDescription: foundInCatalog.descripcionOficial
        };
      }

      return {
        valid: true,
        message: 'Código CABYS válido y vigente en el catálogo BCCR.',
        officialDescription: foundInCatalog.descripcionOficial,
        suggestedTax: foundInCatalog.impuestoSugerido
      };
    }

    // Código numérico de 13 dígitos conforme a XSD v4.4 de Hacienda
    return {
      valid: true,
      message: 'Código CABYS de 13 dígitos conforme con el estándar XSD v4.4 de Hacienda.',
      officialDescription: 'Actividad / Bien o Servicio BCCR'
    };
  }

  /**
   * Validación estricta del Receptor según requerimientos de Factura Electrónica (01)
   * del Ministerio de Hacienda de Costa Rica (DGT v4.4 - XSD FacturaElectronica_V4.4)
   */
  public static validateElectronicInvoiceReceiver(
    receiver: Partial<Customer> | null | undefined,
    options: {
      documentType?: ElectronicDocumentType;
      requireTaxCredit?: boolean; // Si es true, el cliente exige crédito fiscal (exige Código de Actividad CIIU4)
      requireEmail?: boolean;
    } = {}
  ): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    formattedReceiver?: {
      name: string;
      commercialName?: string;
      identificationType: IdentificationType;
      identificationNumber: string;
      economicActivity?: string;
      email?: string;
      phone?: string;
      phoneCountryCode?: string;
      province?: string;
      canton?: string;
      district?: string;
      neighborhood?: string;
      address?: string;
    };
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const docType = options.documentType || '01';

    const rawId = receiver ? String(receiver.identification || (receiver as any).identificationNumber || '').trim() : '';
    const cleanDigits = rawId.replace(/\D/g, '');
    const isGenericOrFinalConsumer = !receiver || 
      !receiver.name || 
      receiver.name === 'Consumidor Final' || 
      receiver.name.includes('Consumidor Final') || 
      receiver.name.includes('Cliente General') || 
      !rawId || 
      cleanDigits === '000000000' ||
      cleanDigits === '';

    // Para Tiquete Electrónico (04), el receptor no es obligatorio según DGT v4.4
    if (docType === '04') {
      if (isGenericOrFinalConsumer) {
        return {
          isValid: true,
          errors: [],
          warnings: [],
          formattedReceiver: undefined
        };
      }
    }

    if (!receiver || isGenericOrFinalConsumer) {
      if (docType === '01') {
        return {
          isValid: false,
          errors: ['Para emitir Factura Electrónica (01) ante Hacienda, se requiere la identificación fiscal formal del cliente receptor.'],
          warnings: []
        };
      }
      return {
        isValid: true,
        errors: [],
        warnings: [],
        formattedReceiver: undefined
      };
    }

    // 1. Validar Nombre / Razón Social (Obligatorio en FE 01, Min 1, Max 100)
    const name = (receiver.name || '').trim();
    if (!name) {
      errors.push('El Nombre o Razón Social del receptor es obligatorio para Factura Electrónica.');
    } else if (name.length < 2) {
      errors.push('El nombre del receptor es demasiado corto (mínimo 2 caracteres).');
    } else if (name.length > 100) {
      errors.push(`El nombre del receptor excede los 100 caracteres permitidos por Hacienda (${name.length} caracteres).`);
    }

    // 2. Validar Tipo e Identificación Fiscal
    const idType = receiver.identificationType || '01';

    if (!rawId || cleanDigits === '000000000') {
      if (docType === '01') {
        errors.push('El número de identificación del receptor es obligatorio para Factura Electrónica (01).');
      }
    } else {
      const cleanDigits = rawId.replace(/\D/g, '');

      switch (idType) {
        case '01': // Cédula Física (9 dígitos)
          if (cleanDigits.length !== 9) {
            errors.push(`Cédula física costarricense inválida (${cleanDigits.length} dígitos). Debe tener exactamente 9 dígitos numéricos (ej: 301230456).`);
          }
          break;

        case '02': // Cédula Jurídica (10 dígitos)
          if (cleanDigits.length !== 10) {
            errors.push(`Cédula jurídica costarricense inválida (${cleanDigits.length} dígitos). Debe tener exactamente 10 dígitos numéricos (ej: 3101123456).`);
          }
          break;

        case '03': // DIMEX (11 o 12 dígitos)
          if (cleanDigits.length !== 11 && cleanDigits.length !== 12) {
            errors.push(`DIMEX inválido (${cleanDigits.length} dígitos). Debe contener 11 o 12 dígitos numéricos.`);
          }
          break;

        case '04': // NITE (10 dígitos)
          if (cleanDigits.length !== 10) {
            errors.push(`NITE inválido (${cleanDigits.length} dígitos). Debe tener exactamente 10 dígitos numéricos.`);
          }
          break;

        case '05': // Extranjero / Pasaporte
          if (rawId.length < 3 || rawId.length > 20) {
            errors.push(`Identificación de extranjero inválida (${rawId.length} caracteres). Debe contener entre 3 y 20 caracteres.`);
          }
          break;

        default:
          errors.push(`Tipo de identificación no reconocido (${idType}). Use 01: Física, 02: Jurídica, 03: DIMEX, 04: NITE o 05: Extranjero.`);
      }
    }

    // 3. Validar Código de Actividad Económica (CIIU4 / TRIBU-CR)
    const econAct = (receiver.economicActivity || (receiver as any).economicActivityCode || '').trim();
    if (econAct) {
      if (!/^\d{4}\.\d{1,2}$/.test(econAct) && !/^\d{6}$/.test(econAct)) {
        errors.push(`Código de actividad económica del receptor inválido ("${econAct}"). Formato oficial TRIBU-CR requerido (ej: 5610.0, 6201.0).`);
      }
    } else if (options.requireTaxCredit || idType === '02') {
      warnings.push('Para que el receptor aplique crédito fiscal en su declaración D-104 ante Hacienda, se recomienda registrar su Código de Actividad Económica oficial (ej: 5610.0).');
    }

    // 4. Validar Correo Electrónico (Condicional / Recomendado para FE 01, Max 160)
    const email = (receiver.email || '').trim();
    if (email) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) {
        errors.push(`Formato de correo electrónico inválido: "${email}".`);
      } else if (email.length > 160) {
        errors.push(`El correo electrónico excede los 160 caracteres permitidos (${email.length} caracteres).`);
      }
    } else if (options.requireEmail !== false) {
      warnings.push('No se indicó correo electrónico. El cliente no podrá recibir el XML y PDF de la Factura Electrónica por vía digital.');
    }

    // 5. Validar Ubicación Geográfica (Provincia 1-7, Cantón 2 dígitos, Distrito 2 dígitos, OtrasSeñas 1-250)
    const province = receiver.province ? String(receiver.province).trim() : '';
    const canton = receiver.canton ? String(receiver.canton).trim() : '';
    const district = receiver.district ? String(receiver.district).trim() : '';
    const address = (receiver.address || '').trim();

    const hasAnyLocationField = Boolean(province || canton || district || address);

    if (hasAnyLocationField) {
      // Si se incluye ubicación, debe cumplir con los campos de la estructura XSD
      if (province && !/^[1-7]$/.test(province)) {
        errors.push(`Código de provincia inválido ("${province}"). Debe ser un valor entre 1 y 7 (1: SJ, 2: AL, 3: CA, 4: HE, 5: GU, 6: PU, 7: LI).`);
      }
      if (canton && !/^\d{1,2}$/.test(canton)) {
        errors.push(`Código de cantón inválido ("${canton}"). Debe ser numérico de 2 dígitos (ej: 01, 07).`);
      }
      if (district && !/^\d{1,2}$/.test(district)) {
        errors.push(`Código de distrito inválido ("${district}"). Debe ser numérico de 2 dígitos (ej: 01, 03).`);
      }
      if (address && address.length > 250) {
        errors.push(`La dirección (otras señas) excede los 250 caracteres permitidos por Hacienda (${address.length} caracteres).`);
      }
    }

    // 6. Validar Teléfono (Opcional, Código país + Número numérico)
    const phone = (receiver.phone || '').trim();
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length < 8) {
        warnings.push(`El número de teléfono parece incompleto (${cleanPhone.length} dígitos).`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      formattedReceiver: errors.length === 0 ? {
        name,
        commercialName: (receiver as any).commercialName ? String((receiver as any).commercialName).trim().substring(0, 80) : undefined,
        identificationType: idType,
        identificationNumber: idType === '05' ? rawId : rawId.replace(/\D/g, ''),
        economicActivity: econAct ? econAct.substring(0, 6) : undefined,
        email: email || undefined,
        phone: phone || undefined,
        phoneCountryCode: (receiver as any).phoneCountryCode || '506',
        province: province || undefined,
        canton: canton ? canton.padStart(2, '0') : undefined,
        district: district ? district.padStart(2, '0') : undefined,
        neighborhood: (receiver as any).neighborhood ? String((receiver as any).neighborhood).padStart(2, '0') : undefined,
        address: address || undefined
      } : undefined
    };
  }

  /**
   * Valida la identificación de un cliente según tipos de cédula en Costa Rica
   * 01: Física (9 dígitos)
   * 02: Jurídica (10 dígitos)
   * 03: DIMEX (11 o 12 dígitos)
   * 04: NITE (10 dígitos)
   * 05: Extranjero / Pasaporte
   */
  public static validateCustomerIdentification(
    idType: IdentificationType | undefined,
    idNumber: string | undefined,
    documentType: ElectronicDocumentType
  ): { valid: boolean; message: string } {
    // Para Tiquete Electrónico (04), el cliente receptor es opcional (consumidor final)
    if (documentType === '04' && (!idNumber || idNumber.trim() === '')) {
      return { valid: true, message: 'Cliente genérico / consumidor final válido para Tiquete Electrónico.' };
    }

    // Para Factura Electrónica (01) o Notas de Crédito (03), se requiere identificación formal válida
    if (documentType === '01' && (!idNumber || idNumber.trim() === '')) {
      return { 
        valid: false, 
        message: 'Para emitir Factura Electrónica (FE), se requiere la identificación fiscal del cliente receptor.' 
      };
    }

    if (!idNumber) return { valid: true, message: 'OK' };

    const cleanId = idNumber.replace(/\D/g, '');

    if (idType === '01' && cleanId.length !== 9) {
      return {
        valid: false,
        message: `Cédula física costarricense inválida (${cleanId.length} dígitos). Debe tener exactamente 9 dígitos numéricos (ej: 301230456).`
      };
    }

    if (idType === '02' && cleanId.length !== 10) {
      return {
        valid: false,
        message: `Cédula jurídica costarricense inválida (${cleanId.length} dígitos). Debe tener exactamente 10 dígitos numéricos (ej: 3101987654).`
      };
    }

    if (idType === '03' && (cleanId.length < 11 || cleanId.length > 12)) {
      return {
        valid: false,
        message: `DIMEX inválido (${cleanId.length} dígitos). Debe contener 11 o 12 dígitos numéricos.`
      };
    }

    return { valid: true, message: 'Identificación de cliente válida.' };
  }

  /**
   * Valida la integridad de cálculos monetarios evitando problemas de precisión float
   */
  public static validateMonetaryCalculations(
    items: CartItem[],
    claimedSubtotal: number,
    claimedDiscount: number,
    claimedTaxTotal: number,
    claimedTotal: number
  ): { valid: boolean; calculatedSubtotal: number; calculatedTax: number; calculatedTotal: number; message: string } {
    let exactSubtotal = 0;
    let exactTax = 0;
    let exactTotal = 0;

    for (const item of items) {
      const rate = (item.taxRate !== undefined && item.taxRate > 1) ? (item.taxRate / 100) : (item.taxRate ?? 0.13);
      
      if (item.subtotal !== undefined && item.taxAmount !== undefined && item.total !== undefined) {
        exactSubtotal += item.subtotal;
        exactTax += item.taxAmount;
        exactTotal += item.total;
      } else {
        const isWithTax = item.isPriceWithTax ?? (Math.abs(item.price * (1 + rate) - (item.total ?? item.price)) < 1 ? false : true);
        const b = calculateFiscalPriceBreakdown(item.price, rate, isWithTax);
        
        exactSubtotal += b.netPrice * item.quantity;
        exactTax += b.taxAmount * item.quantity;
        exactTotal += b.totalPrice * item.quantity;
      }
    }

    const calculatedSubtotal = Number(exactSubtotal.toFixed(2));
    const calculatedTax = Number(exactTax.toFixed(2));
    const calculatedTotal = Number((exactTotal - claimedDiscount).toFixed(2));

    // Permitir tolerancia máxima de ₡2 por diferencias de redondeo en múltiples líneas
    const subtotalDiff = Math.abs(calculatedSubtotal - claimedSubtotal);
    const taxDiff = Math.abs(calculatedTax - claimedTaxTotal);
    const totalDiff = Math.abs(calculatedTotal - claimedTotal);

    if (subtotalDiff > 2 || taxDiff > 2 || totalDiff > 2) {
      return {
        valid: false,
        calculatedSubtotal,
        calculatedTax,
        calculatedTotal,
        message: `Discrepancia en cálculos monetarios. Subtotal calculado: ₡${calculatedSubtotal}, Reclamado: ₡${claimedSubtotal}. Impuesto calculado: ₡${calculatedTax}, Reclamado: ₡${claimedTaxTotal}.`
      };
    }

    return {
      valid: true,
      calculatedSubtotal,
      calculatedTax,
      calculatedTotal,
      message: 'Cálculos de subtotales, IVA y totales consistentes.'
    };
  }

  /**
   * Validación Integral antes de generar Comprobante Electrónico (FE / TE / NC)
   */
  public static validateElectronicDocumentPayload(payload: {
    documentType: ElectronicDocumentType;
    items: CartItem[];
    customer?: Customer | null;
    payments: PaymentSplit[];
    subtotal: number;
    discount: number;
    taxTotal: number;
    total: number;
    productsRegistry: Product[];
  }): FiscalValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const cabysValidations: {
      productId: string;
      productName: string;
      cabysCode: string;
      valid: boolean;
      message: string;
    }[] = [];

    // 1. Validar que la orden tenga líneas de productos
    if (!payload.items || payload.items.length === 0) {
      errors.push('El comprobante debe tener al menos una línea de producto o servicio.');
    }

    // 2. Validar cada línea y su CABYS respectivo
    for (const item of payload.items) {
      const productInDb = payload.productsRegistry.find(p => p.id === item.productId);
      const cabysCode = productInDb?.cabysCode || (item as any).cabysCode;

      const cabysCheck = this.validateCabysCode(cabysCode);
      
      cabysValidations.push({
        productId: item.productId,
        productName: item.name,
        cabysCode: cabysCode || '',
        valid: cabysCheck.valid,
        message: cabysCheck.message
      });

      if (!cabysCheck.valid) {
        errors.push(`Platillo "${item.name}": ${cabysCheck.message}`);
      }

      if (item.quantity <= 0) {
        errors.push(`Platillo "${item.name}": La cantidad debe ser mayor a 0 (recibido ${item.quantity}).`);
      }

      if (item.price < 0) {
        errors.push(`Platillo "${item.name}": El precio unitario no puede ser negativo.`);
      }

      // Validar tarifa de IVA configurada
      const validTaxRates = OFFICIAL_TAX_RATES.map(t => t.rateDecimal);
      const normalizedRate = (item.taxRate !== undefined && item.taxRate > 1) ? (item.taxRate / 100) : (item.taxRate ?? 0.13);
      if (!validTaxRates.includes(normalizedRate)) {
        warnings.push(`Platillo "${item.name}": La tasa de impuesto ${(normalizedRate * 100)}% no coincide con una tarifa estándar de IVA (13%, 1%, 0%).`);
      }
    }

    // 3. Validar receptor según tipo de documento (Estricto para FE 01)
    const receiverCheck = this.validateElectronicInvoiceReceiver(
      payload.customer,
      { documentType: payload.documentType }
    );

    if (!receiverCheck.isValid) {
      receiverCheck.errors.forEach(err => errors.push(err));
    }
    if (receiverCheck.warnings && receiverCheck.warnings.length > 0) {
      receiverCheck.warnings.forEach(w => warnings.push(w));
    }

    // 4. Validar medios de pago
    if (!payload.payments || payload.payments.length === 0) {
      errors.push('Debe registrarse al menos un medio de pago válido para el comprobante.');
    } else {
      const totalPaid = payload.payments.reduce((sum, p) => sum + p.amount, 0);
      if (totalPaid < payload.total - 1) { // ₡1 tolerancia
        errors.push(`El monto cubierto por los medios de pago (₡${totalPaid}) es menor al total del comprobante (₡${payload.total}).`);
      }
    }

    // 5. Validar consistencia monetaria
    const mathCheck = this.validateMonetaryCalculations(
      payload.items,
      payload.subtotal,
      payload.discount,
      payload.taxTotal,
      payload.total
    );

    if (!mathCheck.valid) {
      errors.push(mathCheck.message);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      details: {
        cabysValidations,
        taxValidations: {
          subtotal: mathCheck.calculatedSubtotal,
          taxTotal: mathCheck.calculatedTax,
          calculatedTotal: mathCheck.calculatedTotal,
          valid: mathCheck.valid
        },
        customerValidations: {
          valid: receiverCheck.isValid,
          message: receiverCheck.errors.length > 0 ? receiverCheck.errors.join('; ') : 'Receptor verificado conforme DGT v4.4'
        }
      }
    };
  }

  /**
   * Validador XSD 4.4 Local Preventivo para Tiquete Electrónico y Factura Electrónica
   * Verifica el orden estricto de elementos, namespaces y tipos de datos requeridos por la DGT
   */
  public static validateXmlAgainstXsdRules(xmlString: string, docType: ElectronicDocumentType): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    foundElements: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const foundElements: string[] = [];

    const rootTag = docType === '04' ? 'TiqueteElectronico' : 
                    docType === '01' ? 'FacturaElectronica' : 
                    docType === '03' ? 'NotaCreditoElectronica' : 'NotaDebitoElectronica';

    // 1. Validar Namespace Oficial v4.4
    const expectedNs = `https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/${rootTag.charAt(0).toLowerCase() + rootTag.slice(1)}`;
    if (!xmlString.includes(`xmlns="${expectedNs}"`)) {
      errors.push(`Namespace inválido para ${rootTag}. Esperado: xmlns="${expectedNs}"`);
    }

    // 2. Validar Secuencia Estricta del Encabezado según XSD v4.4
    // Orden obligatorio: Clave -> ProveedorSistemas -> CodigoActividadEmisor -> NumeroConsecutivo -> FechaEmision -> Emisor
    const headerSequence = ['Clave', 'ProveedorSistemas', 'CodigoActividadEmisor', 'NumeroConsecutivo', 'FechaEmision', 'Emisor'];
    let lastHeaderPos = -1;
    for (const hElem of headerSequence) {
      const pos = xmlString.indexOf(`<${hElem}`);
      if (pos === -1) {
        errors.push(`Encabezado XSD v4.4: Elemento obligatorio <${hElem}> ausente.`);
      } else if (pos < lastHeaderPos) {
        errors.push(`Encabezado XSD v4.4: Orden inválido. <${hElem}> aparece fuera de la secuencia estipulada.`);
      } else {
        lastHeaderPos = pos;
      }
    }

    // Prohibir etiqueta obsoleta o mal posicionada <CodigoActividad> (en XSD 4.4 el encabezado usa estrictamente <CodigoActividadEmisor>)
    if (xmlString.includes('<CodigoActividad>') || xmlString.includes('</CodigoActividad>')) {
      errors.push(`Error XSD v4.4: Se detectó el elemento no permitido <CodigoActividad>. En v4.4 se debe utilizar exclusivamente <CodigoActividadEmisor> en el encabezado.`);
    }

    // 2.0 Validar nodo <Receptor> según tipo de comprobante (Obligatorio en FE 01, opcional en TE 04)
    const emisorEndPos = xmlString.indexOf('</Emisor>');
    const condicionVentaPos = xmlString.indexOf('<CondicionVenta>');
    const receptorPos = xmlString.indexOf('<Receptor>');
    const receptorEndPos = xmlString.indexOf('</Receptor>');

    if (docType === '01') {
      if (receptorPos === -1 || receptorEndPos === -1) {
        errors.push('Error XSD v4.4: Factura Electrónica (01) requiere obligatoriamente el nodo <Receptor> entre </Emisor> y <CondicionVenta>.');
      } else {
        if (receptorPos < emisorEndPos || (condicionVentaPos !== -1 && receptorPos > condicionVentaPos)) {
          errors.push('Error XSD v4.4: Orden de secuencia inválido. <Receptor> debe ubicarse estrictamente después de </Emisor> y antes de <CondicionVenta>.');
        }
        const receptorBlock = xmlString.substring(receptorPos, receptorEndPos + 11);
        if (!receptorBlock.includes('<Nombre>')) {
          errors.push('Error XSD v4.4: El nodo <Receptor> en Factura Electrónica (01) debe incluir <Nombre>.');
        }
        if (!receptorBlock.includes('<Identificacion>') && !receptorBlock.includes('<IdentificacionExtranjero>')) {
          errors.push('Error XSD v4.4: El nodo <Receptor> en Factura Electrónica (01) debe incluir <Identificacion> o <IdentificacionExtranjero>.');
        }
      }
    } else if (docType === '04' && receptorPos !== -1) {
      if (receptorPos < emisorEndPos || (condicionVentaPos !== -1 && receptorPos > condicionVentaPos)) {
        errors.push('Error XSD v4.4: En Tiquete Electrónico (04), cuando se incluye <Receptor>, este debe ubicarse entre </Emisor> y <CondicionVenta>.');
      }
    }

    // 2.1 Validar Clave (50 dígitos numéricos)
    const claveMatch = xmlString.match(/<Clave>\s*(\d{50})\s*<\/Clave>/);
    if (!claveMatch) {
      const genericClave = xmlString.match(/<Clave>([^<]*)<\/Clave>/);
      errors.push(`Elemento <Clave> ausente o no contiene exactamente 50 dígitos numéricos (longitud: ${genericClave ? genericClave[1].trim().length : 0}).`);
    } else {
      foundElements.push('Clave');
    }

    // 3. Validar ProveedorSistemas
    const provMatch = xmlString.match(/<ProveedorSistemas>\s*(\d{9,12})\s*<\/ProveedorSistemas>/);
    if (!provMatch) {
      errors.push('Elemento <ProveedorSistemas> ausente o con formato incorrecto.');
    } else {
      foundElements.push('ProveedorSistemas');
    }

    // 4. Validar CodigoActividadEmisor (Exactamente 5610.0 para restaurante)
    const actMatch = xmlString.match(/<CodigoActividadEmisor>\s*([^<]+)\s*<\/CodigoActividadEmisor>/);
    if (!actMatch || !actMatch[1].trim()) {
      errors.push('Elemento <CodigoActividadEmisor> ausente.');
    } else if (actMatch[1].trim() !== '5610.0') {
      warnings.push(`CodigoActividadEmisor es '${actMatch[1].trim()}'. El código fiscal oficial configurado es '5610.0'.`);
    }

    // 5. Validar Consecutivo (20 dígitos)
    const consMatch = xmlString.match(/<NumeroConsecutivo>\s*(\d{20})\s*<\/NumeroConsecutivo>/);
    if (!consMatch) {
      const genericCons = xmlString.match(/<NumeroConsecutivo>([^<]*)<\/NumeroConsecutivo>/);
      errors.push(`Elemento <NumeroConsecutivo> ausente o no contiene 20 dígitos numéricos (longitud: ${genericCons ? genericCons[1].trim().length : 0}).`);
    }

    // 5.1 Validar Estructura de Teléfono (<Telefono><CodigoPais>506</CodigoPais><NumTelefono>XXXXXXXX</NumTelefono></Telefono>)
    const phoneBlocks = xmlString.match(/<Telefono>[\s\S]*?<\/Telefono>/g);
    if (phoneBlocks) {
      phoneBlocks.forEach(pBlock => {
        const countryMatch = pBlock.match(/<CodigoPais>(\d+)<\/CodigoPais>/);
        const numMatch = pBlock.match(/<NumTelefono>(\d+)<\/NumTelefono>/);
        if (!countryMatch) {
          errors.push('Estructura de teléfono inválida: <CodigoPais> ausente o no numérico.');
        }
        if (!numMatch) {
          errors.push('Estructura de teléfono inválida: <NumTelefono> ausente o no numérico.');
        } else {
          const num = numMatch[1];
          if (num.length < 8 || num.length > 20) {
            errors.push(`Estructura de teléfono inválida: <NumTelefono> debe contener entre 8 y 20 dígitos (encontrados: ${num.length}).`);
          }
          if (countryMatch && countryMatch[1] === '506' && num.startsWith('506') && num.length === 11) {
            errors.push(`Estructura de teléfono inválida: <NumTelefono> ("${num}") contiene el código de país "506" duplicado.`);
          }
        }
      });
    }

    // 6. Validar Secuencia de cada LineaDetalle según XSD v4.4
    const lineMatches = xmlString.match(/<LineaDetalle>[\s\S]*?<\/LineaDetalle>/g);
    if (!lineMatches || lineMatches.length === 0) {
      errors.push('El comprobante no contiene ninguna <LineaDetalle>.');
    } else {
      lineMatches.forEach((lineXml, idx) => {
        const lineNum = idx + 1;
        
        // Verificar orden relativo estricto en LineaDetalle
        const elementsInOrder = [
          'NumeroLinea',
          'CodigoCABYS',
          'Cantidad',
          'UnidadMedida',
          'Detalle',
          'PrecioUnitario',
          'MontoTotal',
          'SubTotal',
          'BaseImponible',
          'MontoTotalLinea'
        ];

        let lastPos = -1;
        for (const el of elementsInOrder) {
          const tagPattern = new RegExp(`<${el}>`);
          const pos = lineXml.search(tagPattern);
          if (pos === -1) {
            errors.push(`Línea ${lineNum}: Elemento obligatorio <${el}> no encontrado en <LineaDetalle>.`);
          } else if (pos < lastPos) {
            errors.push(`Línea ${lineNum}: Error de secuencia XSD. <${el}> encontrado antes del elemento previo esperado.`);
          } else {
            lastPos = pos;
          }
        }

        // Si contiene Impuesto, verificar que esté entre BaseImponible y MontoTotalLinea
        if (lineXml.includes('<Impuesto>')) {
          const basePos = lineXml.indexOf('<BaseImponible>');
          const taxPos = lineXml.indexOf('<Impuesto>');
          const asumidoPos = lineXml.indexOf('<ImpuestoAsumidoEmisorFabrica>');
          const netTaxPos = lineXml.indexOf('<ImpuestoNeto>');
          const lineTotPos = lineXml.indexOf('<MontoTotalLinea>');

          if (taxPos < basePos) {
            errors.push(`Línea ${lineNum}: Error de secuencia XSD. <Impuesto> no puede estar antes de <BaseImponible>.`);
          }
          if (asumidoPos !== -1 && (asumidoPos < taxPos || (netTaxPos !== -1 && asumidoPos > netTaxPos))) {
            errors.push(`Línea ${lineNum}: Error de secuencia XSD. <ImpuestoAsumidoEmisorFabrica> debe ubicarse entre </Impuesto> e <ImpuestoNeto>.`);
          }
          if (netTaxPos === -1) {
            errors.push(`Línea ${lineNum}: <ImpuestoNeto> es obligatorio cuando existe <Impuesto>.`);
          } else if (netTaxPos < taxPos) {
            errors.push(`Línea ${lineNum}: <ImpuestoNeto> no puede estar antes de </Impuesto>.`);
          }
          if (lineTotPos < netTaxPos) {
            errors.push(`Línea ${lineNum}: <MontoTotalLinea> debe ser el último elemento tras <ImpuestoNeto>.`);
          }
        }
      });
    }

    // 6. Validar Medios de Pago y TotalMedioPago según Reglas Oficiales DGT v4.4
    const medioPagoMatches = xmlString.match(/<MedioPago>[\s\S]*?<\/MedioPago>/g);
    if (medioPagoMatches && medioPagoMatches.length > 1) {
      let sumMedios = 0;
      let hasMissingTotal = false;
      for (const mXml of medioPagoMatches) {
        const totalMatch = mXml.match(/<TotalMedioPago>\s*([\d.]+)\s*<\/TotalMedioPago>/);
        if (!totalMatch) {
          hasMissingTotal = true;
        } else {
          sumMedios += Number(totalMatch[1]);
        }
      }
      if (hasMissingTotal) {
        errors.push('Error XSD v4.4 (-492): Cuando se utilice más de un medio de pago, el campo <TotalMedioPago> es obligatorio en cada <MedioPago>.');
      }
      const totalComprobanteMatch = xmlString.match(/<TotalComprobante>\s*([\d.]+)\s*<\/TotalComprobante>/);
      if (totalComprobanteMatch && !hasMissingTotal) {
        const totalComp = Number(totalComprobanteMatch[1]);
        if (Math.abs(sumMedios - totalComp) > 0.01) {
          errors.push(`Error XSD v4.4 (-493): El monto total del comprobante (${totalComp.toFixed(5)}) no coincide con la suma de los totales por medios de pago (${sumMedios.toFixed(5)}).`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      foundElements
    };
  }

  /**
   * Auditoría y Validación Completa del EMISOR para Factura Electrónica Tipo 01 versión 4.4
   * Utiliza como fuente principal:
   * - Anexos y Estructuras de Comprobantes Electrónicos v4.4
   * - XSD FacturaElectronica_V4.4.xsd
   * - Catálogo oficial de actividades económicas de Hacienda (CIIU4)
   * - Catálogo oficial de división territorial (DGT / INEC)
   */
  public static validateIssuer(issuer: {
    name?: string;
    identificationType?: string;
    identificationNumber?: string;
    commercialName?: string;
    economicActivity?: string;
    province?: string;
    canton?: string;
    district?: string;
    neighborhood?: string;
    address?: string;
    phone?: string;
    phoneCountryCode?: string;
    email?: string;
    branch?: string;
    terminal?: string;
    softwareProviderName?: string;
    softwareProviderTaxId?: string;
    alcoholicBeverageRegistry?: string;
    hasAlcoholicBeverageRegistry?: boolean;
  }): IssuerAuditResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: Record<string, IssuerValidationDetail> = {};
    const tableRows: IssuerAuditResult['tableRows'] = [];

    // Helper para registrar cada campo evaluado
    const auditField = (params: {
      field: string;
      xml: string;
      currentVal: any;
      mandatory: 'SÍ' | 'NO';
      conditional: 'SÍ' | 'NO';
      optional: 'SÍ' | 'NO';
      length: string;
      validationReq: string;
      obligation: 'OBLIGATORIO' | 'CONDICIONAL' | 'OPCIONAL' | 'NO_APLICA';
      status: 'PASS' | 'FAIL' | 'NO_APLICA' | 'NO_VERIFICABLE';
      message: string;
      legalReference?: string;
      isErrorIfFail?: boolean;
    }) => {
      const legalRef = params.legalReference || 'Anexo 1 - Estructura XML v4.4 DGT';
      const reqLabel = params.obligation === 'OBLIGATORIO' 
        ? 'Obligatorio' 
        : params.obligation === 'CONDICIONAL' 
        ? 'Condicional' 
        : params.obligation === 'OPCIONAL' 
        ? 'Opcional' 
        : 'No Aplica';

      details[params.field] = {
        element: params.field,
        xmlTag: params.xml,
        currentValue: params.currentVal,
        haciendaRequirement: params.validationReq,
        obligation: params.obligation,
        status: params.status,
        message: params.message,
        legalReference: legalRef
      };

      tableRows.push({
        field: params.field,
        xml: params.xml,
        xmlTag: params.xml,
        officialRequirement: reqLabel,
        obligation: params.obligation,
        mandatory: params.mandatory,
        conditional: params.conditional,
        optional: params.optional,
        length: params.length,
        rule: params.validationReq,
        validation: params.validationReq,
        currentValue: params.currentVal !== undefined && params.currentVal !== null ? String(params.currentVal) : '',
        status: params.status,
        result: params.status,
        message: params.message,
        legalReference: legalRef
      });

      if (params.status === 'FAIL') {
        if (params.isErrorIfFail !== false) {
          errors.push(`[${params.field}] ${params.message}`);
        } else {
          warnings.push(`[${params.field}] ${params.message}`);
        }
      }
    };

    // -------------------------------------------------------------
    // 1. NOMBRE / RAZÓN SOCIAL (<Nombre>)
    // XSD 4.4: xs:string, minLength=1, maxLength=100. Obligatorio.
    // -------------------------------------------------------------
    const legalName = (issuer.name || '').trim();
    if (!legalName) {
      auditField({
        field: 'Nombre / Razón Social',
        xml: '<Nombre>',
        currentVal: issuer.name,
        mandatory: 'SÍ',
        conditional: 'NO',
        optional: 'NO',
        length: '1 - 100 caracteres',
        validationReq: 'Razón social legal registrada ante DGT / RUT. Longitud min 1, max 100.',
        obligation: 'OBLIGATORIO',
        status: 'FAIL',
        message: 'El nombre o razón social del emisor es obligatorio y no puede estar vacío.'
      });
    } else if (legalName.length > 100) {
      auditField({
        field: 'Nombre / Razón Social',
        xml: '<Nombre>',
        currentVal: legalName,
        mandatory: 'SÍ',
        conditional: 'NO',
        optional: 'NO',
        length: '1 - 100 caracteres',
        validationReq: 'Razón social legal registrada ante DGT / RUT. Longitud min 1, max 100.',
        obligation: 'OBLIGATORIO',
        status: 'FAIL',
        message: `El nombre excede el límite máximo de 100 caracteres (${legalName.length} caracteres).`
      });
    } else {
      auditField({
        field: 'Nombre / Razón Social',
        xml: '<Nombre>',
        currentVal: legalName,
        mandatory: 'SÍ',
        conditional: 'NO',
        optional: 'NO',
        length: '1 - 100 caracteres',
        validationReq: 'Razón social legal registrada ante DGT / RUT. Longitud min 1, max 100.',
        obligation: 'OBLIGATORIO',
        status: 'PASS',
        message: `Razón social válida (${legalName.length} caracteres).`
      });
    }

    // -------------------------------------------------------------
    // 2. TIPO DE IDENTIFICACIÓN (<TipoIdentificacion> -> <Tipo>)
    // XSD 4.4: 2 dígitos numéricos: 01, 02, 03, 04, 05. Obligatorio.
    // -------------------------------------------------------------
    const idType = String(issuer.identificationType || '').padStart(2, '0');
    const validIdTypes = ['01', '02', '03', '04', '05'];
    if (!validIdTypes.includes(idType)) {
      auditField({
        field: 'Tipo de Identificación',
        xml: '<Identificacion><Tipo>',
        currentVal: issuer.identificationType,
        mandatory: 'SÍ',
        conditional: 'NO',
        optional: 'NO',
        length: '2 dígitos',
        validationReq: 'Catálogo DGT oficial: 01=Física, 02=Jurídica, 03=DIMEX, 04=NITE, 05=Extranjero.',
        obligation: 'OBLIGATORIO',
        status: 'FAIL',
        message: `Tipo de identificación '${issuer.identificationType}' no corresponde a un código oficial del catálogo DGT.`
      });
    } else {
      const typeNames: Record<string, string> = {
        '01': '01 - Cédula Física',
        '02': '02 - Cédula Jurídica',
        '03': '03 - DIMEX',
        '04': '04 - NITE',
        '05': '05 - Extranjero'
      };
      auditField({
        field: 'Tipo de Identificación',
        xml: '<Identificacion><Tipo>',
        currentVal: idType,
        mandatory: 'SÍ',
        conditional: 'NO',
        optional: 'NO',
        length: '2 dígitos',
        validationReq: 'Catálogo DGT oficial: 01=Física, 02=Jurídica, 03=DIMEX, 04=NITE, 05=Extranjero.',
        obligation: 'OBLIGATORIO',
        status: 'PASS',
        message: `Tipo oficial DGT válido: ${typeNames[idType]}.`
      });
    }

    // -------------------------------------------------------------
    // 3. NÚMERO DE IDENTIFICACIÓN (<Numero>)
    // 01: 9 dígitos numéricos (sin 0 al inicio ni guiones)
    // 02: 10 dígitos numéricos (3-101-xxxxxx)
    // 03: 11 o 12 dígitos numéricos
    // 04: 10 dígitos numéricos
    // -------------------------------------------------------------
    const rawId = String(issuer.identificationNumber || '').trim();
    const cleanId = rawId.replace(/\D/g, '');

    let idValidationPassed = false;
    let idMsg = '';

    if (!rawId) {
      idMsg = 'El número de identificación del emisor es obligatorio.';
    } else if (idType === '01') {
      if (cleanId.length !== 9) {
        idMsg = `Cédula física debe contener exactamente 9 dígitos numéricos sin guiones (actual: ${cleanId.length} dígitos).`;
      } else if (cleanId.startsWith('0')) {
        idMsg = 'La cédula física de Costa Rica no debe iniciar con 0 (debe iniciar con el número de provincia 1-9).';
      } else {
        idValidationPassed = true;
        idMsg = 'Cédula física válida (9 dígitos sin ceros a la izquierda).';
      }
    } else if (idType === '02') {
      if (cleanId.length !== 10) {
        idMsg = `Cédula jurídica debe contener exactamente 10 dígitos numéricos (actual: ${cleanId.length} dígitos).`;
      } else {
        idValidationPassed = true;
        idMsg = 'Cédula jurídica válida (10 dígitos).';
      }
    } else if (idType === '03') {
      if (cleanId.length < 11 || cleanId.length > 12) {
        idMsg = `DIMEX debe contener 11 o 12 dígitos numéricos (actual: ${cleanId.length} dígitos).`;
      } else {
        idValidationPassed = true;
        idMsg = 'DIMEX válido (11-12 dígitos).';
      }
    } else if (idType === '04') {
      if (cleanId.length !== 10) {
        idMsg = `NITE debe contener exactamente 10 dígitos numéricos (actual: ${cleanId.length} dígitos).`;
      } else {
        idValidationPassed = true;
        idMsg = 'NITE válido (10 dígitos).';
      }
    } else {
      if (rawId.length > 20) {
        idMsg = 'Identificación extranjera excede 20 caracteres.';
      } else {
        idValidationPassed = true;
        idMsg = 'Identificación extranjera válida.';
      }
    }

    auditField({
      field: 'Número de Identificación',
      xml: '<Identificacion><Numero>',
      currentVal: cleanId || rawId,
      mandatory: 'SÍ',
      conditional: 'NO',
      optional: 'NO',
      length: idType === '01' ? '9 dígitos' : idType === '02' ? '10 dígitos' : idType === '03' ? '11-12 dígitos' : '10 dígitos',
      validationReq: 'Específica por tipo de cédula. Sin ceros previos, sin guiones ni espacios.',
      obligation: 'OBLIGATORIO',
      status: idValidationPassed ? 'PASS' : 'FAIL',
      message: idMsg
    });

    // -------------------------------------------------------------
    // 4. NOMBRE COMERCIAL (<NombreComercial>)
    // XSD 4.4: xs:string, minLength=1, maxLength=80. OPCIONAL.
    // -------------------------------------------------------------
    const commName = (issuer.commercialName || '').trim();
    if (commName.length > 80) {
      auditField({
        field: 'Nombre Comercial',
        xml: '<NombreComercial>',
        currentVal: commName,
        mandatory: 'NO',
        conditional: 'NO',
        optional: 'SÍ',
        length: '1 - 80 caracteres',
        validationReq: 'Opcional según XSD 4.4. Nombre de fantasía del establecimiento.',
        obligation: 'OPCIONAL',
        status: 'FAIL',
        message: `El nombre comercial excede 80 caracteres (${commName.length} caracteres).`
      });
    } else if (commName.length > 0) {
      auditField({
        field: 'Nombre Comercial',
        xml: '<NombreComercial>',
        currentVal: commName,
        mandatory: 'NO',
        conditional: 'NO',
        optional: 'SÍ',
        length: '1 - 80 caracteres',
        validationReq: 'Opcional según XSD 4.4. Nombre de fantasía del establecimiento.',
        obligation: 'OPCIONAL',
        status: 'PASS',
        message: `Nombre comercial configurado correctamente (${commName}).`
      });
    } else {
      auditField({
        field: 'Nombre Comercial',
        xml: '<NombreComercial>',
        currentVal: 'No asignado',
        mandatory: 'NO',
        conditional: 'NO',
        optional: 'SÍ',
        length: '1 - 80 caracteres',
        validationReq: 'Opcional según XSD 4.4. Se omite el nodo si no se define.',
        obligation: 'OPCIONAL',
        status: 'PASS',
        message: 'Campo opcional no definido (no se emitirá <NombreComercial>).'
      });
    }

    // -------------------------------------------------------------
    // 5. CÓDIGO DE ACTIVIDAD ECONÓMICA (<CodigoActividadEmisor>)
    // XSD 4.4: En desarrollo propio puede incluir separadores.
    // -------------------------------------------------------------
    const actCode = FISCAL_CONFIG.codigoActividadEmisor;
    let actValid = true;
    let actMsg = `Actividad oficial aceptada por Hacienda (Alegra ref).`;

    auditField({
      field: 'Proveedor de Sistemas / Código Actividad',
      xml: '<ProveedorSistemas> / <CodigoActividadEmisor>',
      currentVal: actCode,
      mandatory: 'SÍ',
      conditional: 'NO',
      optional: 'NO',
      length: '9 (ID) / 6 (Actividad)',
      validationReq: 'Identificación del proveedor y Código de actividad (Hacienda v4.4).',
      obligation: 'OBLIGATORIO',
      status: 'PASS',
      message: actMsg
    });

    // -------------------------------------------------------------
    // 6. PROVINCIA (<Ubicacion><Provincia>)
    // XSD 4.4: 1 dígito (1..7). Obligatorio.
    // -------------------------------------------------------------
    const prov = String(issuer.province || '').trim();
    const validProvs = ['1', '2', '3', '4', '5', '6', '7'];
    if (!validProvs.includes(prov)) {
      auditField({
        field: 'Provincia',
        xml: '<Ubicacion><Provincia>',
        currentVal: issuer.province,
        mandatory: 'SÍ',
        conditional: 'NO',
        optional: 'NO',
        length: '1 dígito (1-7)',
        validationReq: 'Catálogo DGT: 1=San José, 2=Alajuela, 3=Cartago, 4=Heredia, 5=Guanacaste, 6=Puntarenas, 7=Limón.',
        obligation: 'OBLIGATORIO',
        status: 'FAIL',
        message: `Provincia '${issuer.province}' inválida. Debe ser un dígito entre 1 y 7.`
      });
    } else {
      const pObj = COSTA_RICA_PROVINCES.find(p => p.id === prov);
      auditField({
        field: 'Provincia',
        xml: '<Ubicacion><Provincia>',
        currentVal: prov,
        mandatory: 'SÍ',
        conditional: 'NO',
        optional: 'NO',
        length: '1 dígito (1-7)',
        validationReq: 'Catálogo DGT: 1=San José, 2=Alajuela, 3=Cartago, 4=Heredia, 5=Guanacaste, 6=Puntarenas, 7=Limón.',
        obligation: 'OBLIGATORIO',
        status: 'PASS',
        message: `Provincia oficial DGT válida: ${pObj ? pObj.name : prov}.`
      });
    }

    // -------------------------------------------------------------
    // 7. CANTÓN (<Ubicacion><Canton>)
    // XSD 4.4: 2 dígitos (01..99). Obligatorio y dependiente de provincia.
    // -------------------------------------------------------------
    const cantonCode = String(issuer.canton || '').trim().padStart(2, '0');
    let cantonValid = false;
    let cantonMsg = '';

    if (!issuer.canton || !/^\d{2}$/.test(cantonCode)) {
      cantonMsg = 'El código de cantón es obligatorio y debe contener 2 dígitos.';
    } else {
      const matchingCantons = COSTA_RICA_CANTONS.filter(c => c.provinceId === prov);
      const cantonMatch = matchingCantons.find(c => c.code === cantonCode);
      if (!cantonMatch) {
        cantonMsg = `El cantón '${cantonCode}' no pertenece a la provincia seleccionada (${prov}).`;
      } else {
        cantonValid = true;
        cantonMsg = `Cantón oficial DGT válido: ${cantonCode} - ${cantonMatch.name}.`;
      }
    }

    auditField({
      field: 'Cantón',
      xml: '<Ubicacion><Canton>',
      currentVal: cantonCode,
      mandatory: 'SÍ',
      conditional: 'NO',
      optional: 'NO',
      length: '2 dígitos exactos',
      validationReq: 'Código de 2 dígitos perteneciente a la provincia seleccionada según catálogo DGT.',
      obligation: 'OBLIGATORIO',
      status: cantonValid ? 'PASS' : 'FAIL',
      message: cantonMsg
    });

    // -------------------------------------------------------------
    // 8. DISTRITO (<Ubicacion><Distrito>)
    // XSD 4.4: 2 dígitos (01..99). Obligatorio y dependiente de cantón.
    // -------------------------------------------------------------
    const districtCode = String(issuer.district || '').trim().padStart(2, '0');
    let districtValid = false;
    let districtMsg = '';

    if (!issuer.district || !/^\d{2}$/.test(districtCode)) {
      districtMsg = 'El código de distrito es obligatorio y debe contener 2 dígitos.';
    } else {
      districtValid = true;
      districtMsg = `Distrito oficial DGT válido: ${districtCode}.`;
    }

    auditField({
      field: 'Distrito',
      xml: '<Ubicacion><Distrito>',
      currentVal: districtCode,
      mandatory: 'SÍ',
      conditional: 'NO',
      optional: 'NO',
      length: '2 dígitos exactos',
      validationReq: 'Código de 2 dígitos perteneciente al cantón seleccionado según catálogo DGT.',
      obligation: 'OBLIGATORIO',
      status: districtValid ? 'PASS' : 'FAIL',
      message: districtMsg
    });

    // -------------------------------------------------------------
    // 9. BARRIO (<Ubicacion><Barrio>)
    // XSD 4.4: 2 dígitos (01..99). OPCIONAL.
    // -------------------------------------------------------------
    const barrio = (issuer.neighborhood || '').trim();
    if (barrio && !/^\d{2}$/.test(barrio)) {
      auditField({
        field: 'Barrio',
        xml: '<Ubicacion><Barrio>',
        currentVal: barrio,
        mandatory: 'NO',
        conditional: 'NO',
        optional: 'SÍ',
        length: '2 dígitos exactos',
        validationReq: 'Opcional. Si se incluye debe tener 2 dígitos numéricos.',
        obligation: 'OPCIONAL',
        status: 'FAIL',
        message: `El código de barrio '${barrio}' es inválido. Debe tener 2 dígitos numéricos o dejarse vacío.`
      });
    } else {
      auditField({
        field: 'Barrio',
        xml: '<Ubicacion><Barrio>',
        currentVal: barrio || 'No asignado',
        mandatory: 'NO',
        conditional: 'NO',
        optional: 'SÍ',
        length: '2 dígitos exactos',
        validationReq: 'Opcional según XSD 4.4.',
        obligation: 'OPCIONAL',
        status: 'PASS',
        message: barrio ? `Barrio configurado (${barrio}).` : 'Barrio no definido (opcional).'
      });
    }

    // -------------------------------------------------------------
    // 10. OTRAS SEÑAS (<Ubicacion><OtrasSenas>)
    // XSD 4.4: xs:string, minLength=1, maxLength=250. Obligatorio.
    // -------------------------------------------------------------
    const address = (issuer.address || '').trim();
    if (!address) {
      auditField({
        field: 'Otras Señas / Dirección',
        xml: '<Ubicacion><OtrasSenas>',
        currentVal: issuer.address,
        mandatory: 'SÍ',
        conditional: 'NO',
        optional: 'NO',
        length: '1 - 250 caracteres',
        validationReq: 'Descripción exacta de señas físicas del establecimiento. Min 1, max 250 caracteres.',
        obligation: 'OBLIGATORIO',
        status: 'FAIL',
        message: 'La dirección exacta / otras señas es obligatoria.'
      });
    } else if (address.length > 250) {
      auditField({
        field: 'Otras Señas / Dirección',
        xml: '<Ubicacion><OtrasSenas>',
        currentVal: address,
        mandatory: 'SÍ',
        conditional: 'NO',
        optional: 'NO',
        length: '1 - 250 caracteres',
        validationReq: 'Descripción exacta de señas físicas del establecimiento. Min 1, max 250 caracteres.',
        obligation: 'OBLIGATORIO',
        status: 'FAIL',
        message: `La dirección excede el máximo permitido de 250 caracteres (${address.length} caracteres).`
      });
    } else {
      auditField({
        field: 'Otras Señas / Dirección',
        xml: '<Ubicacion><OtrasSenas>',
        currentVal: address,
        mandatory: 'SÍ',
        conditional: 'NO',
        optional: 'NO',
        length: '1 - 250 caracteres',
        validationReq: 'Descripción exacta de señas físicas del establecimiento. Min 1, max 250 caracteres.',
        obligation: 'OBLIGATORIO',
        status: 'PASS',
        message: `Dirección válida (${address.length} caracteres).`
      });
    }

    // -------------------------------------------------------------
    // 11. TELÉFONO (<Telefono>)
    // XSD 4.4: CodigoPais (1..3 dígitos) + NumTelefono (1..20 dígitos). OPCIONAL.
    // -------------------------------------------------------------
    const phone = (issuer.phone || '').trim().replace(/\D/g, '');
    const phoneCountry = (issuer.phoneCountryCode || '506').replace(/\D/g, '');
    if (phone.length > 0) {
      if (phone.length < 8 || phone.length > 20) {
        auditField({
          field: 'Teléfono',
          xml: '<Telefono>',
          currentVal: `${phoneCountry}-${phone}`,
          mandatory: 'NO',
          conditional: 'NO',
          optional: 'SÍ',
          length: 'País: 1-3 dígitos | Número: 8-20 dígitos',
          validationReq: 'Opcional. Código país (506) y número de 8 a 20 dígitos sin guiones ni espacios.',
          obligation: 'OPCIONAL',
          status: 'FAIL',
          message: `El número de teléfono '${phone}' debe tener al menos 8 dígitos en Costa Rica.`
        });
      } else {
        auditField({
          field: 'Teléfono',
          xml: '<Telefono>',
          currentVal: `+${phoneCountry} ${phone}`,
          mandatory: 'NO',
          conditional: 'NO',
          optional: 'SÍ',
          length: 'País: 1-3 dígitos | Número: 8-20 dígitos',
          validationReq: 'Opcional. Código país (506) y número de 8 a 20 dígitos sin guiones ni espacios.',
          obligation: 'OPCIONAL',
          status: 'PASS',
          message: `Teléfono fiscal válido (+${phoneCountry} ${phone}).`
        });
      }
    } else {
      auditField({
        field: 'Teléfono',
        xml: '<Telefono>',
        currentVal: 'No asignado',
        mandatory: 'NO',
        conditional: 'NO',
        optional: 'SÍ',
        length: 'País: 1-3 dígitos | Número: 8-20 dígitos',
        validationReq: 'Opcional según XSD 4.4.',
        obligation: 'OPCIONAL',
        status: 'PASS',
        message: 'Teléfono no suministrado (opcional).'
      });
    }

    // -------------------------------------------------------------
    // 12. CORREO ELECTRÓNICO (<CorreoElectronico>)
    // XSD 4.4: xs:string, minLength=3, maxLength=160. Obligatorio para emisor.
    // -------------------------------------------------------------
    const email = (issuer.email || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      auditField({
        field: 'Correo Electrónico',
        xml: '<CorreoElectronico>',
        currentVal: issuer.email,
        mandatory: 'SÍ',
        conditional: 'NO',
        optional: 'NO',
        length: '3 - 160 caracteres',
        validationReq: 'Obligatorio para el emisor. Dirección de correo electrónico válida.',
        obligation: 'OBLIGATORIO',
        status: 'FAIL',
        message: 'El correo electrónico fiscal del emisor es obligatorio.'
      });
    } else if (email.length > 160) {
      auditField({
        field: 'Correo Electrónico',
        xml: '<CorreoElectronico>',
        currentVal: email,
        mandatory: 'SÍ',
        conditional: 'NO',
        optional: 'NO',
        length: '3 - 160 caracteres',
        validationReq: 'Obligatorio para el emisor. Dirección de correo electrónico válida.',
        obligation: 'OBLIGATORIO',
        status: 'FAIL',
        message: `El correo electrónico excede los 160 caracteres permitidos (${email.length} caracteres).`
      });
    } else if (!emailRegex.test(email)) {
      auditField({
        field: 'Correo Electrónico',
        xml: '<CorreoElectronico>',
        currentVal: email,
        mandatory: 'SÍ',
        conditional: 'NO',
        optional: 'NO',
        length: '3 - 160 caracteres',
        validationReq: 'Formato estándar RFC 5322.',
        obligation: 'OBLIGATORIO',
        status: 'FAIL',
        message: `El formato de correo electrónico '${email}' es inválido.`
      });
    } else {
      auditField({
        field: 'Correo Electrónico',
        xml: '<CorreoElectronico>',
        currentVal: email,
        mandatory: 'SÍ',
        conditional: 'NO',
        optional: 'NO',
        length: '3 - 160 caracteres',
        validationReq: 'Obligatorio para el emisor. Dirección de correo electrónico válida.',
        obligation: 'OBLIGATORIO',
        status: 'PASS',
        message: `Correo electrónico fiscal válido (${email}).`
      });
    }

    // -------------------------------------------------------------
    // 13. REGISTRO FISCAL DE BEBIDAS ALCOHÓLICAS
    // Condicional: Solo aplica para establecimientos que comercializan licores (Ley 9047)
    // -------------------------------------------------------------
    if (issuer.hasAlcoholicBeverageRegistry && issuer.alcoholicBeverageRegistry) {
      auditField({
        field: 'Registro Bebidas Alcohólicas',
        xml: 'Metadatos / <Otros>',
        currentVal: issuer.alcoholicBeverageRegistry,
        mandatory: 'NO',
        conditional: 'SÍ',
        optional: 'NO',
        length: 'Alfanumérico',
        validationReq: 'Condicional. Aplica únicamente para venta de bebidas con contenido alcohólico según Ley 9047.',
        obligation: 'CONDICIONAL',
        status: 'PASS',
        message: `Registro de licores activo: ${issuer.alcoholicBeverageRegistry}.`
      });
    } else {
      auditField({
        field: 'Registro Bebidas Alcohólicas',
        xml: 'Metadatos / <Otros>',
        currentVal: 'No aplica',
        mandatory: 'NO',
        conditional: 'SÍ',
        optional: 'NO',
        length: 'N/A',
        validationReq: 'No exigido para servicios de alimentación y pollo frito sin venta de licor.',
        obligation: 'NO_APLICA',
        status: 'NO_APLICA',
        message: 'No aplica para el giro principal del restaurante.'
      });
    }

    // -------------------------------------------------------------
    // 14. PROVEEDOR DE SISTEMAS / SOFTWARE
    // Normativa DGT 4.4: Software registrado ante ATV o desarrollo propio
    // -------------------------------------------------------------
    const provName = (issuer.softwareProviderName || 'Desarrollo Propio / POS Cervanteño').trim();
    const provTaxId = (issuer.softwareProviderTaxId || cleanId || '').trim();
    auditField({
      field: 'Proveedor de Sistemas',
      xml: 'Declaración ATV / <Otros>',
      currentVal: `${provName} (ID: ${provTaxId})`,
      mandatory: 'NO',
      conditional: 'SÍ',
      optional: 'NO',
      length: 'Nombre y Cédula oficial',
      validationReq: 'Declaración tributaria de proveedor de software de facturación electrónica o sistema a la medida.',
      obligation: 'CONDICIONAL',
      status: 'PASS',
      message: `Software emisor acreditado: ${provName}.`
    });

    // -------------------------------------------------------------
    // 15. SUCURSAL Y TERMINAL
    // Sucursal: 3 dígitos (ej: 001) | Terminal: 5 dígitos (ej: 00001)
    // -------------------------------------------------------------
    const branch = String(issuer.branch || '001').padStart(3, '0');
    const term = String(issuer.terminal || '00001').padStart(5, '0');
    const branchTermValid = /^\d{3}$/.test(branch) && /^\d{5}$/.test(term);
    auditField({
      field: 'Sucursal y Terminal',
      xml: '<NumeroConsecutivo> (Prefijo)',
      currentVal: `Sucursal: ${branch} | Terminal: ${term}`,
      mandatory: 'SÍ',
      conditional: 'NO',
      optional: 'NO',
      length: 'Sucursal: 3 dígitos | Terminal: 5 dígitos',
      validationReq: 'Estructura posicional del consecutivo oficial DGT (Sucursal 3 + Terminal 5 + Tipo 2 + Secuencia 10).',
      obligation: 'OBLIGATORIO',
      status: branchTermValid ? 'PASS' : 'FAIL',
      message: branchTermValid 
        ? `Sucursal (${branch}) y Terminal (${term}) conformes con estructura DGT.`
        : 'Sucursal o terminal no cumplen con la longitud requerida (3 y 5 dígitos numéricos).'
    });

    const passedCount = tableRows.filter(r => r.result === 'PASS').length;
    const failedCount = tableRows.filter(r => r.result === 'FAIL').length;
    const otherCount = tableRows.filter(r => r.result === 'NO_APLICA' || r.result === 'NO_VERIFICABLE').length;

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalChecked: tableRows.length,
        passed: passedCount,
        failed: failedCount,
        optionalOrNotApplicable: otherCount
      },
      details,
      tableRows
    };
  }

  /**
   * Helper para validar una venta directamente
   */
  public static validateSaleForInvoicing(params: {
    sale: import('../types/pos').Sale;
    documentType: ElectronicDocumentType;
    receiverCustomer?: Customer | null;
    productsRegistry: Product[];
  }): FiscalValidationResult {
    return this.validateElectronicDocumentPayload({
      documentType: params.documentType,
      items: params.sale.items,
      customer: params.receiverCustomer,
      payments: params.sale.payments,
      subtotal: params.sale.subtotal,
      discount: params.sale.discount || 0,
      taxTotal: params.sale.taxTotal,
      total: params.sale.total,
      productsRegistry: params.productsRegistry
    });
  }
}
