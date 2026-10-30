import { ElectronicDocument, ElectronicDocumentType } from '../types/pos';

/**
 * Generador Oficial de XML según especificación del Ministerio de Hacienda de Costa Rica v4.4
 * Esquemas soportados:
 * - Factura Electronica (01)
 * - Nota de Credito Electronica (03)
 * - Tiquete Electronico (04)
 */
export class HaciendaXmlGenerator {
  
  public static getCostaRicaFiscalDateTime(dateStr: string | Date): string {
    const d = new Date(dateStr);
    const tzOffset = -6 * 60;
    const localDate = new Date(d.getTime() + tzOffset * 60 * 1000);
    const cleanDate = localDate.toISOString().substring(0, 19);
    return `${cleanDate}-06:00`;
  }

  public static generateDocumentXml(doc: ElectronicDocument): string {
    const rootTag = this.getRootTag(doc.documentType);
    const namespace = this.getNamespace(doc.documentType);
    const schemaLocation = `${namespace} ${namespace}.xsd`;

    // Ensure issueDate retains its timezone offset
    const issueDateISO = doc.issueDate;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<${rootTag} xmlns="${namespace}" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${schemaLocation}">\n`;
    
    // 1. Clave y Consecutivo
    const rawActCode = doc.economicActivityCode || doc.economicActivity || doc.issuer.economicActivity || '5610.0';
    const actCode = (typeof rawActCode === 'string' ? rawActCode.trim() : '5610.0') || '5610.0';
    const proveedorSistemas = '302680311'; // Identificación del emisor para desarrollo propio
    
    xml += `  <Clave>${doc.numericKey}</Clave>\n`;
    xml += `  <ProveedorSistemas>${proveedorSistemas}</ProveedorSistemas>\n`;
    xml += `  <CodigoActividadEmisor>${actCode}</CodigoActividadEmisor>\n`;
    xml += `  <NumeroConsecutivo>${doc.consecutive}</NumeroConsecutivo>\n`;
    xml += `  <FechaEmision>${issueDateISO}</FechaEmision>\n`;

    // 2. Emisor (Contribuyente obligado tributario - DGT v4.4)
    xml += `  <Emisor>\n`;
    xml += `    <Nombre>${this.escapeXml(doc.issuer.name.trim().substring(0, 100))}</Nombre>\n`;
    xml += `    <Identificacion>\n`;
    xml += `      <Tipo>${String(doc.issuer.identificationType).padStart(2, '0')}</Tipo>\n`;
    xml += `      <Numero>${doc.issuer.identificationNumber.replace(/\D/g, '')}</Numero>\n`;
    xml += `    </Identificacion>\n`;
    if (doc.issuer.commercialName && doc.issuer.commercialName.trim()) {
      xml += `    <NombreComercial>${this.escapeXml(doc.issuer.commercialName.trim().substring(0, 80))}</NombreComercial>\n`;
    }
    xml += `    <Ubicacion>\n`;
    xml += `      <Provincia>${doc.issuer.province || '3'}</Provincia>\n`;
    xml += `      <Canton>${String(doc.issuer.canton || '06').padStart(2, '0')}</Canton>\n`;
    xml += `      <Distrito>${String(doc.issuer.district || '02').padStart(2, '0')}</Distrito>\n`;
    if (doc.issuer.neighborhood && doc.issuer.neighborhood.trim()) {
      xml += `      <Barrio>${String(doc.issuer.neighborhood).padStart(2, '0')}</Barrio>\n`;
    }
    xml += `      <OtrasSenas>${this.escapeXml(doc.issuer.address.trim().substring(0, 250))}</OtrasSenas>\n`;
    xml += `    </Ubicacion>\n`;
    if (doc.issuer.phone && doc.issuer.phone.trim()) {
      let cleanPhone = doc.issuer.phone.replace(/\D/g, '');
      let phoneCountry = (doc.issuer.phoneCountryCode || '506').replace(/\D/g, '') || '506';
      phoneCountry = phoneCountry.substring(0, 3) || '506';
      if (phoneCountry === '506' && cleanPhone.startsWith('506') && cleanPhone.length >= 11) {
        cleanPhone = cleanPhone.substring(3);
      }
      if (cleanPhone.length >= 8 && cleanPhone.length <= 20) {
        xml += `    <Telefono>\n`;
        xml += `      <CodigoPais>${phoneCountry}</CodigoPais>\n`;
        xml += `      <NumTelefono>${cleanPhone}</NumTelefono>\n`;
        xml += `    </Telefono>\n`;
      }
    }
    if (doc.issuer.email && doc.issuer.email.trim() !== '') {
      xml += `    <CorreoElectronico>${this.escapeXml(doc.issuer.email.trim().substring(0, 160))}</CorreoElectronico>\n`;
    }
    xml += `  </Emisor>\n`;

    // 3. Receptor (Obligatorio en Factura Electrónica 01 y Notas 03/02, Opcional en Tiquete 04)
    const isFactura = doc.documentType === '01';
    const isTiquete = doc.documentType === '04';

    const rawReceiver = doc.receiver;
    const hasReceiverName = !!(rawReceiver && rawReceiver.name && rawReceiver.name.trim() !== '' && 
      rawReceiver.name !== 'Cliente General / Consumidor Final' &&
      rawReceiver.name !== 'Consumidor Final' &&
      !rawReceiver.name.includes('Consumidor Final'));

    const hasIdentification = !!(rawReceiver && (
      (rawReceiver.identificationNumber && rawReceiver.identificationNumber.trim() !== '' && rawReceiver.identificationNumber.replace(/\D/g, '') !== '000000000') ||
      (rawReceiver as any).foreignIdentification
    ));

    if (isFactura && (!rawReceiver || !hasReceiverName || !hasIdentification)) {
      throw new Error('Estructura DGT v4.4 inválida: Factura Electrónica (01) requiere obligatoriamente el nodo <Receptor> con Nombre e Identificación fiscal válida.');
    }

    if (rawReceiver && (isFactura || (isTiquete && hasReceiverName && hasIdentification) || (!isTiquete && hasReceiverName))) {
      const rec = rawReceiver;
      xml += `  <Receptor>\n`;
      xml += `    <Nombre>${this.escapeXml(rec.name.trim().substring(0, 100))}</Nombre>\n`;
      
      // Identificación (Nacional / DIMEX / NITE / Extranjero con ID) o IdentificacionExtranjero
      if (rec.identificationType && rec.identificationNumber && rec.identificationNumber !== '000000000' && rec.identificationNumber !== '000000000000') {
        const idType = String(rec.identificationType).padStart(2, '0');
        const cleanIdNum = (rec.identificationNumber || '').trim();
        
        if (idType === '05' && /[^0-9]/.test(cleanIdNum)) {
          // Identificación de extranjero no domiciliado alfanumérica
          xml += `    <IdentificacionExtranjero>${this.escapeXml(cleanIdNum.substring(0, 20))}</IdentificacionExtranjero>\n`;
        } else {
          const numDigits = cleanIdNum.replace(/\D/g, '');
          let formattedNum = numDigits;
          if (idType === '01' && numDigits.length === 9) formattedNum = numDigits;
          else if (idType === '02' && numDigits.length === 10) formattedNum = numDigits;
          else if (idType === '03' && (numDigits.length === 11 || numDigits.length === 12)) formattedNum = numDigits;
          else if (idType === '04' && numDigits.length === 10) formattedNum = numDigits;
          else if (idType === '05') formattedNum = cleanIdNum.substring(0, 20);

          xml += `    <Identificacion>\n`;
          xml += `      <Tipo>${idType}</Tipo>\n`;
          xml += `      <Numero>${formattedNum}</Numero>\n`;
          xml += `    </Identificacion>\n`;
        }
      } else if ((rec as any).foreignIdentification) {
        xml += `    <IdentificacionExtranjero>${this.escapeXml(String((rec as any).foreignIdentification).trim().substring(0, 20))}</IdentificacionExtranjero>\n`;
      }

      // Nombre Comercial del Receptor (Opcional según XSD 4.4, max 80 chars)
      if ((rec as any).commercialName && (rec as any).commercialName.trim() !== '') {
        xml += `    <NombreComercial>${this.escapeXml((rec as any).commercialName.trim().substring(0, 80))}</NombreComercial>\n`;
      }

      // Ubicación del Receptor (Opcional / Condicional según XSD 4.4)
      // Solo se incluye si se cuenta con la información geográfica válida (Provincia 1-7, Cantón, Distrito y Señas)
      if (rec.province && rec.canton && rec.district && (rec.address || (rec as any).otherSigns)) {
        const prov = String(rec.province).trim();
        const cant = String(rec.canton).trim().padStart(2, '0');
        const dist = String(rec.district).trim().padStart(2, '0');
        const addressDetail = (rec.address || (rec as any).otherSigns || '').trim().substring(0, 250);

        if (/^[1-7]$/.test(prov) && /^\d{2}$/.test(cant) && /^\d{2}$/.test(dist) && addressDetail.length > 0) {
          xml += `    <Ubicacion>\n`;
          xml += `      <Provincia>${prov}</Provincia>\n`;
          xml += `      <Canton>${cant}</Canton>\n`;
          xml += `      <Distrito>${dist}</Distrito>\n`;
          if ((rec as any).neighborhood && /^\d{2}$/.test(String((rec as any).neighborhood).trim())) {
            xml += `      <Barrio>${String((rec as any).neighborhood).trim().padStart(2, '0')}</Barrio>\n`;
          }
          xml += `      <OtrasSenas>${this.escapeXml(addressDetail)}</OtrasSenas>\n`;
          xml += `    </Ubicacion>\n`;
        }
      }

      // Teléfono del Receptor (Opcional según XSD 4.4: 506 + número de 8 a 20 dígitos)
      if (rec.phone && rec.phone.trim() !== '') {
        let cleanPhone = rec.phone.replace(/\D/g, '');
        let countryCode = ((rec as any).phoneCountryCode || '506').replace(/\D/g, '') || '506';
        countryCode = countryCode.substring(0, 3) || '506';
        if (countryCode === '506' && cleanPhone.startsWith('506') && cleanPhone.length >= 11) {
          cleanPhone = cleanPhone.substring(3);
        }
        if (cleanPhone.length >= 8 && cleanPhone.length <= 20) {
          xml += `    <Telefono>\n`;
          xml += `      <CodigoPais>${countryCode}</CodigoPais>\n`;
          xml += `      <NumTelefono>${cleanPhone}</NumTelefono>\n`;
          xml += `    </Telefono>\n`;
        }
      }

      // Correo Electrónico del Receptor (Condicional / Opcional según XSD 4.4, max 160 chars)
      if (rec.email && rec.email.trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec.email.trim())) {
        xml += `    <CorreoElectronico>${this.escapeXml(rec.email.trim().substring(0, 160))}</CorreoElectronico>\n`;
      }

      xml += `  </Receptor>\n`;
    }

    // 4. Condición de Venta
    const saleCond = doc.saleCondition || '01'; // 01: Contado, 02: Crédito
    xml += `  <CondicionVenta>${saleCond}</CondicionVenta>\n`;
    if (saleCond === '02') {
      xml += `  <PlazoCredito>${doc.creditTerm || '30'}</PlazoCredito>\n`;
    }

    // 5. Detalle del Servicio o Mercancía (Líneas con CABYS)
    let calcTotalServGravados = 0;
    let calcTotalServExentos = 0;
    let calcTotalServExonerado = 0;
    let calcTotalMercGravadas = 0;
    let calcTotalMercExentas = 0;
    let calcTotalMercExoneradas = 0;

    xml += `  <DetalleServicio>\n`;
    for (const line of doc.lines) {
      const lineDetail = line.detail || line.description;
      const lineTotalAmount = line.totalAmount !== undefined ? line.totalAmount : (line.unitPrice * line.quantity);
      const lineDiscountAmount = line.discountAmount !== undefined ? line.discountAmount : (line.discount || 0);
      const lineTotalLineAmount = line.totalLineAmount !== undefined ? line.totalLineAmount : (line.totalLine || (line.subtotal + line.taxAmount));
      const isServiceType = line.itemType === 'SERVICIO';
      const rawUom = line.unitOfMeasure || (isServiceType ? 'Os' : 'Unid');
      const validUnits = ['Unid', 'Sp', 'Os', 'Al', 'Alc', 'Cm', 'I', 'Spe', 'St', 'Ts', 'kg', 'g', 'L', 'mL', 'm', 'cm', 'km', 'h', 'd', 's'];
      const uom = validUnits.includes(rawUom) ? rawUom : (isServiceType ? 'Os' : 'Unid');
      
      // Hacienda clasifica según la Unidad de Medida en la línea para el Resumen
      const serviceUnits = ['Al', 'Alc', 'Cm', 'I', 'Os', 'Sp', 'Spe', 'St', 'Ts'];
      const isService = serviceUnits.includes(uom);
      
      // Hacienda requiere que los totales del resumen coincidan exactamente con la suma de los valores
      // redondeados que se imprimen en cada línea (SubTotal y MontoExoneracion).
      const lineSubtotalRounded = Number(line.subtotal.toFixed(5));

      // Computar acumuladores para ResumenFactura
      if (line.exoneration && line.exoneration.exemptAmount > 0) {
        const exemptAmountRounded = Number(line.exoneration.exemptAmount.toFixed(5));
        if (isService) {
          calcTotalServExonerado += exemptAmountRounded;
          if (line.taxAmount > 0) calcTotalServGravados += lineSubtotalRounded;
        } else {
          calcTotalMercExoneradas += exemptAmountRounded;
          if (line.taxAmount > 0) calcTotalMercGravadas += lineSubtotalRounded;
        }
      } else if (line.taxRate > 0) {
        if (isService) {
          calcTotalServGravados += lineSubtotalRounded;
        } else {
          calcTotalMercGravadas += lineSubtotalRounded;
        }
      } else {
        if (isService) {
          calcTotalServExentos += lineSubtotalRounded;
        } else {
          calcTotalMercExentas += lineSubtotalRounded;
        }
      }

      xml += `    <LineaDetalle>\n`;
      xml += `      <NumeroLinea>${line.lineNumber}</NumeroLinea>\n`;
      xml += `      <CodigoCABYS>${line.cabysCode}</CodigoCABYS>\n`;
      
      const internalCode = line.commercialCode || line.internalCode;
      if (internalCode) {
        xml += `      <CodigoComercial>\n`;
        xml += `        <Tipo>01</Tipo>\n`;
        xml += `        <Codigo>${this.escapeXml(internalCode.substring(0, 20))}</Codigo>\n`;
        xml += `      </CodigoComercial>\n`;
      }
      
      xml += `      <Cantidad>${line.quantity.toFixed(3)}</Cantidad>\n`;
      xml += `      <UnidadMedida>${uom}</UnidadMedida>\n`;
      xml += `      <Detalle>${this.escapeXml(lineDetail)}</Detalle>\n`;
      xml += `      <PrecioUnitario>${line.unitPrice.toFixed(5)}</PrecioUnitario>\n`;
      xml += `      <MontoTotal>${lineTotalAmount.toFixed(5)}</MontoTotal>\n`;
      
      if (lineDiscountAmount > 0) {
        xml += `      <Descuento>\n`;
        xml += `        <MontoDescuento>${lineDiscountAmount.toFixed(5)}</MontoDescuento>\n`;
        xml += `        <NaturalezaDescuento>${this.escapeXml(line.discountNature || line.discountReason || 'Descuento Comercial')}</NaturalezaDescuento>\n`;
        xml += `      </Descuento>\n`;
      }

      xml += `      <SubTotal>${line.subtotal.toFixed(5)}</SubTotal>\n`;

      // BaseImponible es obligatorio según XSD v4.4 después de SubTotal (y antes de Impuesto)
      const baseImponibleValue = (line as any).baseImponible !== undefined && (line as any).baseImponible !== null
        ? Number((line as any).baseImponible)
        : line.subtotal;
      xml += `      <BaseImponible>${baseImponibleValue.toFixed(5)}</BaseImponible>\n`;

      // Impuesto (0..unbounded) según XSD 4.4
      const hasTax = (line.taxAmount > 0) || (line.taxRate > 0) || Boolean(line.exoneration);
      if (hasTax) {
        const rawRate = Number(line.taxRate !== undefined && line.taxRate !== null ? line.taxRate : 0.13);
        const ratePercent = rawRate > 1 ? rawRate : rawRate * 100;
        let tariffCode = line.taxRateCode;
        if (!tariffCode) {
          const rounded = Math.round(ratePercent);
          if (rounded === 13) tariffCode = '08';
          else if (rounded === 8) tariffCode = '07';
          else if (rounded === 4) tariffCode = '04';
          else if (rounded === 2) tariffCode = '03';
          else if (rounded === 1) tariffCode = '02';
          else if (rounded === 0) tariffCode = '01';
          else tariffCode = '08';
        }

        xml += `      <Impuesto>\n`;
        xml += `        <Codigo>${line.taxCode || '01'}</Codigo>\n`; // 01: IVA
        xml += `        <CodigoTarifaIVA>${tariffCode}</CodigoTarifaIVA>\n`;
        xml += `        <Tarifa>${ratePercent.toFixed(2)}</Tarifa>\n`;
        xml += `        <Monto>${(line.taxAmount + (line.exoneration?.exemptAmount || 0)).toFixed(5)}</Monto>\n`;
        
        if (line.exoneration) {
          xml += `        <Exoneracion>\n`;
          xml += `          <TipoDocumento>${line.exoneration.documentType}</TipoDocumento>\n`;
          xml += `          <NumeroDocumento>${this.escapeXml(line.exoneration.documentNumber)}</NumeroDocumento>\n`;
          xml += `          <NombreInstitucion>${this.escapeXml(line.exoneration.institutionalName)}</NombreInstitucion>\n`;
          xml += `          <FechaEmision>${this.getCostaRicaFiscalDateTime(line.exoneration.issueDate)}</FechaEmision>\n`;
          xml += `          <PorcentajeExoneracion>${line.exoneration.exemptPercentage}</PorcentajeExoneracion>\n`;
          xml += `          <MontoExoneracion>${line.exoneration.exemptAmount.toFixed(5)}</MontoExoneracion>\n`;
          xml += `        </Exoneracion>\n`;
        }

        xml += `      </Impuesto>\n`;
        xml += `      <ImpuestoAsumidoEmisorFabrica>0.00000</ImpuestoAsumidoEmisorFabrica>\n`;
        xml += `      <ImpuestoNeto>${line.taxAmount.toFixed(5)}</ImpuestoNeto>\n`;
      }

      xml += `      <MontoTotalLinea>${lineTotalLineAmount.toFixed(5)}</MontoTotalLinea>\n`;
      xml += `    </LineaDetalle>\n`;
    }
    xml += `  </DetalleServicio>\n`;

    // 6. Resumen de Factura
    const totalGravado = calcTotalServGravados + calcTotalMercGravadas;
    const totalExento = calcTotalServExentos + calcTotalMercExentas;
    const totalExonerado = calcTotalServExonerado + calcTotalMercExoneradas;
    const totalVenta = totalGravado + totalExento + totalExonerado;
    const totalDescuentos = doc.discountTotal || 0;
    const totalVentaNeta = totalVenta - totalDescuentos;

    xml += `  <ResumenFactura>\n`;
    xml += `    <CodigoTipoMoneda>\n`;
    xml += `      <CodigoMoneda>${doc.currency || 'CRC'}</CodigoMoneda>\n`;
    xml += `      <TipoCambio>1.00000</TipoCambio>\n`;
    xml += `    </CodigoTipoMoneda>\n`;
    xml += `    <TotalServGravados>${calcTotalServGravados.toFixed(5)}</TotalServGravados>\n`;
    xml += `    <TotalServExentos>${calcTotalServExentos.toFixed(5)}</TotalServExentos>\n`;
    xml += `    <TotalServExonerado>${calcTotalServExonerado.toFixed(5)}</TotalServExonerado>\n`;
    xml += `    <TotalMercanciasGravadas>${calcTotalMercGravadas.toFixed(5)}</TotalMercanciasGravadas>\n`;
    xml += `    <TotalMercanciasExentas>${calcTotalMercExentas.toFixed(5)}</TotalMercanciasExentas>\n`;
    xml += `    <TotalMercExonerada>${calcTotalMercExoneradas.toFixed(5)}</TotalMercExonerada>\n`;
    xml += `    <TotalGravado>${totalGravado.toFixed(5)}</TotalGravado>\n`;
    xml += `    <TotalExento>${totalExento.toFixed(5)}</TotalExento>\n`;
    xml += `    <TotalExonerado>${totalExonerado.toFixed(5)}</TotalExonerado>\n`;
    xml += `    <TotalVenta>${totalVenta.toFixed(5)}</TotalVenta>\n`;
    xml += `    <TotalDescuentos>${totalDescuentos.toFixed(5)}</TotalDescuentos>\n`;
    xml += `    <TotalVentaNeta>${totalVentaNeta.toFixed(5)}</TotalVentaNeta>\n`;

    if (doc.taxTotal > 0) {
      xml += `    <TotalDesgloseImpuesto>\n`;
      xml += `      <Codigo>01</Codigo>\n`;
      xml += `      <CodigoTarifaIVA>08</CodigoTarifaIVA>\n`;
      xml += `      <TotalMontoImpuesto>${doc.taxTotal.toFixed(5)}</TotalMontoImpuesto>\n`;
      xml += `    </TotalDesgloseImpuesto>\n`;
    }

    xml += `    <TotalImpuesto>${doc.taxTotal.toFixed(5)}</TotalImpuesto>\n`;
    xml += `    <TotalIVADevuelto>0.00000</TotalIVADevuelto>\n`;
    xml += `    <TotalOtrosCargos>0.00000</TotalOtrosCargos>\n`;

    // Medios de pago dentro de ResumenFactura (DGT v4.4)
    const rawPaymentList = (doc.paymentMethods && doc.paymentMethods.length > 0) 
      ? doc.paymentMethods 
      : [{ method: 'CASH' as const, amount: doc.total }];

    const paymentList = rawPaymentList.slice(0, 4);
    let runningPaymentTotal = 0;

    for (let i = 0; i < paymentList.length; i++) {
      const payment = paymentList[i];
      let medioCode = '01';
      switch (payment.method) {
        case 'CASH': medioCode = '01'; break;
        case 'CARD': medioCode = '02'; break;
        case 'CHECK': medioCode = '03'; break;
        case 'TRANSFER': medioCode = '04'; break;
        case 'THIRD_PARTY': medioCode = '05'; break;
        case 'SINPE': medioCode = '04'; break;
        case 'DIGITAL_PLATFORM': medioCode = '05'; break;
        case 'OTHER': medioCode = '99'; break;
        default: medioCode = '01'; break;
      }

      // Cálculo exacto del monto por medio de pago (DGT v4.4)
      // Cuando se utiliza más de un medio de pago, el campo TotalMedioPago es estrictamente obligatorio
      // y la suma de todos los medios de pago debe coincidir exactamente con TotalComprobante.
      let paymentAmount = Number(payment.amount) || 0;
      if (i === paymentList.length - 1) {
        // Garantizar cuadre exacto al centavo/decimal con doc.total
        paymentAmount = Math.max(0, Number((doc.total - runningPaymentTotal).toFixed(5)));
      } else {
        paymentAmount = Math.max(0, Number(paymentAmount.toFixed(5)));
        runningPaymentTotal += paymentAmount;
      }

      xml += `    <MedioPago>\n`;
      xml += `      <TipoMedioPago>${medioCode}</TipoMedioPago>\n`;
      xml += `      <TotalMedioPago>${paymentAmount.toFixed(5)}</TotalMedioPago>\n`;
      xml += `    </MedioPago>\n`;
    }

    xml += `    <TotalComprobante>${doc.total.toFixed(5)}</TotalComprobante>\n`;
    xml += `  </ResumenFactura>\n`;

    // 7. Información de Referencia (Obligatorio en Notas de Crédito / Débito)
    if (doc.reference) {
      const refNumber = doc.reference.numericKeyOrNumber || doc.reference.invoiceNumber || doc.numericKey;
      const refCode = String(doc.reference.code || doc.reference.referenceCode || '13').padStart(2, '0');
      const refDocType = String(doc.reference.documentType || '04').padStart(2, '0');
      const refReason = (doc.reference.reason || 'Anula documento de referencia por error material').trim().substring(0, 180);

      xml += `  <InformacionReferencia>\n`;
      xml += `    <TipoDocIR>${refDocType}</TipoDocIR>\n`;
      // En DGT v4.4: TipoDocumentoRefOTRO es obligatorio si TipoDocIR es '99' (mín 5, máx 100 caracteres)
      if (refDocType === '99') {
        let otherDoc = (doc.reference.otherDocumentType || 'Documento físico o comercial').trim();
        if (otherDoc.length < 5) otherDoc = `${otherDoc} comercial`;
        xml += `    <TipoDocumentoRefOTRO>${this.escapeXml(otherDoc.substring(0, 100))}</TipoDocumentoRefOTRO>\n`;
      }
      xml += `    <Numero>${refNumber}</Numero>\n`;
      xml += `    <FechaEmisionIR>${this.getCostaRicaFiscalDateTime(doc.reference.issueDate)}</FechaEmisionIR>\n`;
      xml += `    <Codigo>${refCode}</Codigo>\n`; // 01: Anula Documento de Referencia, 99: Otros
      // En DGT v4.4: CodigoReferenciaOTRO es OBLIGATORIO cuando Codigo es '99' (mínimo 5 y máximo 100 caracteres)
      if (refCode === '99') {
        let otherCode = (doc.reference.otherReferenceCode || doc.reference.reason || 'Anulación por motivo comercial o administrativo').trim();
        if (otherCode.length < 5) otherCode = `${otherCode} comercial justificado`;
        xml += `    <CodigoReferenciaOTRO>${this.escapeXml(otherCode.substring(0, 100))}</CodigoReferenciaOTRO>\n`;
      }
      xml += `    <Razon>${this.escapeXml(refReason)}</Razon>\n`;
      xml += `  </InformacionReferencia>\n`;
    }

    // 8. Otros (Normativa y leyendas de comprobante)
    xml += `  <Otros>\n`;
    xml += `    <OtroTexto codigo="SISTEMA">POS Sabor Cervanteno v4.4 - Cumplimiento DGT Costa Rica</OtroTexto>\n`;
    xml += `    <OtroTexto codigo="TERMINAL">${doc.terminal || '00001'}</OtroTexto>\n`;
    xml += `  </Otros>\n`;

    xml += `</${rootTag}>\n`;

    return xml;
  }

  private static getRootTag(type: ElectronicDocumentType): string {
    switch (type) {
      case '01': return 'FacturaElectronica';
      case '04': return 'TiqueteElectronico';
      case '03': return 'NotaCreditoElectronica';
      case '02': return 'NotaDebitoElectronica';
      default: return 'FacturaElectronica';
    }
  }

  private static getNamespace(type: ElectronicDocumentType): string {
    switch (type) {
      case '01': return 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica';
      case '04': return 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/tiqueteElectronico';
      case '03': return 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/notaCreditoElectronica';
      case '02': return 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/notaDebitoElectronica';
      case '08': return 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronicaCompra';
      case '09': return 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronicaExportacion';
      default: return 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/tiqueteElectronico';
    }
  }

  private static escapeXml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
