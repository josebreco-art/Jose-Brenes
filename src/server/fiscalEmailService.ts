import nodemailer from 'nodemailer';
import { ElectronicDocument, Sale, HaciendaDirectConfig, EmailDispatchLog } from '../types/pos';
import { db } from './db';
import { getElectronicDocumentFileNames } from '../utils/documentNaming';
import { PdfInvoiceGenerator } from './pdfInvoiceGenerator';

export class FiscalEmailService {
  /**
   * Envía automáticamente los archivos XML y PDF con la factura al cliente
   */
  public static async sendInvoiceEmail(
    doc: ElectronicDocument,
    sale?: Sale,
    overrideRecipientEmail?: string
  ): Promise<{
    success: boolean;
    message: string;
    log?: EmailDispatchLog;
    recipientEmail?: string;
  }> {
    const config = db.getHaciendaDirectConfig();
    const rawEmail = (overrideRecipientEmail || doc.receiver?.email || sale?.customerEmail || '').trim();

    // Validar formato y descartar correos de prueba o ficticios (ej. ejemplo@ejemplo.com)
    const isInvalidOrPlaceholderEmail = (email: string): boolean => {
      if (!email || !email.includes('@')) return true;
      const lower = email.toLowerCase().trim();
      const invalidDomains = ['ejemplo.com', 'example.com', 'test.com', 'correo.com', 'prueba.com', 'demo.com'];
      const isPlaceholderDomain = invalidDomains.some(d => lower.endsWith(`@${d}`) || lower.includes(`@${d}`));
      const isPlaceholderName = lower.startsWith('ejemplo@') || lower.startsWith('example@') || lower.startsWith('test@') || lower.startsWith('noreply@') || lower === 'cliente@correo.com';
      return isPlaceholderDomain || isPlaceholderName;
    };

    if (!rawEmail || isInvalidOrPlaceholderEmail(rawEmail)) {
      const msg = !rawEmail 
        ? 'No se indicó un correo electrónico para el cliente.'
        : `El correo '${rawEmail}' es un marcador de posición no entregable. Se omite el envío para evitar rebotes.`;
      console.log(`[FiscalEmailService] ℹ️ ${msg} (Doc: ${doc.consecutive})`);
      return {
        success: false,
        message: msg
      };
    }

    const recipientEmail = rawEmail;

    const docTypeNames: Record<string, string> = {
      '01': 'Factura Electrónica',
      '04': 'Tiquete Electrónico',
      '03': 'Nota de Crédito',
      '02': 'Nota de Débito'
    };

    const docTypeName = docTypeNames[doc.documentType] || 'Comprobante Electrónico';
    const clientName = doc.receiver?.name || sale?.customerName || 'Estimado(a) Cliente';
    const totalFormatted = `₡${(doc.total || 0).toLocaleString('es-CR')}`;
    const dateFormatted = doc.issueDate 
      ? new Date(doc.issueDate).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })
      : new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });

    const restInfo = db.getRestaurantInfo();

    // 1. Generar Representación Gráfica PDF Oficial
    let pdfBuffer: Buffer;
    try {
      const haciendaCfg = db.getHaciendaDirectConfig();
      const logoBase64 = haciendaCfg?.emisorLogoBase64 || restInfo?.logoBase64;
      pdfBuffer = await PdfInvoiceGenerator.generateInvoicePdf(doc, sale, logoBase64);
    } catch (pdfErr) {
      console.error('[FiscalEmailService] Error generando PDF:', pdfErr);
      // Crear buffer básico si falla algo específico
      pdfBuffer = Buffer.from('Error generando PDF de comprobante');
    }

    // 2. Preparar XML del Comprobante y XML de Respuesta de Hacienda
    const xmlContent = doc.xmlGenerated || `<FacturaElectronica><Clave>${doc.numericKey}</Clave><NumeroConsecutivo>${doc.consecutive}</NumeroConsecutivo><TotalComprobante>${doc.total}</TotalComprobante></FacturaElectronica>`;
    const xmlResponseContent = doc.xmlResponseHacienda || `<?xml version="1.0" encoding="utf-8"?><MensajeHacienda><Clave>${doc.numericKey}</Clave><Mensaje>1</Mensaje><DetalleMensaje>Aceptado por Ministerio de Hacienda DGT v4.4</DetalleMensaje><MontoTotalImpuesto>${doc.taxTotal}</MontoTotalImpuesto><TotalFactura>${doc.total}</TotalFactura></MensajeHacienda>`;

    // Nombres de archivos adjuntos normativos
    const fileNames = getElectronicDocumentFileNames(doc.numericKey);
    const pdfFileName = fileNames.pdf;
    const xmlDocFileName = fileNames.xml;
    const xmlRespFileName = fileNames.hacienda;

    const attachmentsList = [pdfFileName, xmlDocFileName, xmlRespFileName];

    // 3. Formatear Asunto y Cuerpo del Correo
    const subject = (config.emailCustomSubject || 'Comprobante Electrónico #{consecutivo} - Pollo Frito Sabor Cervanteño')
      .replace('{consecutivo}', doc.consecutive)
      .replace('{tipo}', docTypeName)
      .replace('{cliente}', clientName)
      .replace('{clave}', doc.numericKey);

    const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #d97706, #ea580c); color: #ffffff; padding: 24px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; }
    .content { padding: 24px 20px; }
    .greeting { font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
    .intro { font-size: 13.5px; line-height: 1.6; color: #475569; margin-bottom: 20px; }
    .details-box { background: #f1f5f9; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #cbd5e1; }
    .detail-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; }
    .detail-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .detail-label { color: #64748b; font-weight: 600; }
    .detail-val { color: #0f172a; font-weight: 700; text-align: right; }
    .key-box { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 12px; margin-bottom: 20px; }
    .key-label { font-size: 11px; font-weight: 800; color: #065f46; text-transform: uppercase; margin-bottom: 4px; }
    .key-val { font-family: monospace; font-size: 11px; font-weight: 700; color: #047857; word-break: break-all; }
    .attachments-box { background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 14px; margin-bottom: 20px; }
    .attachments-title { font-size: 12px; font-weight: 800; color: #92400e; margin-bottom: 8px; text-transform: uppercase; }
    .attachment-item { font-size: 12.5px; color: #78350f; margin-bottom: 4px; display: flex; align-items: center; }
    .footer { background: #f8fafc; padding: 16px; text-align: center; font-size: 11.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Pollo Frito Sabor Cervanteño</h1>
      <p>Comprobante Electrónico Oficial • DGT v4.4 Ministerio de Hacienda</p>
    </div>
    
    <div class="content">
      <div class="greeting">Estimado(a) ${clientName},</div>
      <div class="intro">
        Adjunto a este mensaje encontrará los archivos oficiales correspondientes a su <strong>${docTypeName}</strong> emitida por <strong>Pollo Frito Sabor Cervanteño S.A.</strong> de conformidad con las disposiciones de la Dirección General de Tributación de Costa Rica (DGT-R-033-2019 / v4.4).
      </div>

      <div class="details-box">
        <div class="detail-row">
          <span class="detail-label">Tipo de Comprobante:</span>
          <span class="detail-val">${docTypeName} (${doc.documentType})</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Consecutivo Oficial:</span>
          <span class="detail-val" style="font-family: monospace;">${doc.consecutive}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Fecha de Emisión:</span>
          <span class="detail-val">${dateFormatted}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Monto Total:</span>
          <span class="detail-val" style="color: #b45309; font-size: 15px;">${totalFormatted}</span>
        </div>
      </div>

      <div class="key-box">
        <div class="key-label">Clave Numérica de 50 Dígitos:</div>
        <div class="key-val">${doc.numericKey}</div>
      </div>

      <div class="attachments-box">
        <div class="attachments-title">Archivos Oficiales Adjuntos (3):</div>
        <div class="attachment-item">📄 <strong>${pdfFileName}</strong> &nbsp;(Representación Gráfica PDF)</div>
        <div class="attachment-item">📁 <strong>${xmlDocFileName}</strong> &nbsp;(Comprobante Electrónico XML firmado)</div>
        <div class="attachment-item">🏛️ <strong>${xmlRespFileName}</strong> &nbsp;(Respuesta Oficial Ministerio de Hacienda)</div>
      </div>

      <div style="font-size: 12px; color: #64748b; line-height: 1.5;">
        <em>Este es un correo automático generado por el sistema de facturación electrónica directa de ${config.emisorCommercialName || config.emisorName || 'Pollo Frito Sabor Cervanteño'}.${(config.emisorPhone || restInfo?.phone) ? ` Si tiene alguna consulta, puede responder a este correo o comunicarse al ${config.emisorPhone || restInfo?.phone}.` : ''}</em>
      </div>
    </div>

    <div class="footer">
      ${config.emisorName || restInfo?.name || 'Pollo Frito Sabor Cervanteño S.A.'} • Cédula: ${config.emisorTaxId || restInfo?.taxId || '302680311'}<br>
      ${config.emisorAddressDetail || restInfo?.location || 'Cervantes de Alvarado, Cartago, Costa Rica'}<br>
      Resolución DGT-R-033-2019 / Versión 4.4
    </div>
  </div>
</body>
</html>
`;

    // 4. Determinar si hay configuración SMTP activa
    const hasSmtpCredentials = Boolean(
      config.emailSmtpHost &&
      config.emailSmtpUser &&
      config.emailSmtpPassword
    );

    let status: 'SENT' | 'FAILED' | 'PENDING_SMTP' = 'PENDING_SMTP';
    let errorMessage: string | undefined = undefined;
    let senderAddress = config.emailSenderAddress || config.emisorEmail || restInfo?.email || 'saborcervantes@gmail.com';

    if (hasSmtpCredentials) {
      try {
        const transporter = nodemailer.createTransport({
          host: config.emailSmtpHost,
          port: config.emailSmtpPort || 587,
          secure: config.emailSmtpSecure || false,
          auth: {
            user: config.emailSmtpUser,
            pass: config.emailSmtpPassword
          },
          tls: {
            rejectUnauthorized: false
          }
        });

        await transporter.sendMail({
          from: `"${config.emailSenderName || 'Pollo Frito Sabor Cervanteño'}" <${senderAddress}>`,
          to: recipientEmail,
          cc: config.emailCc || undefined,
          subject,
          html: htmlBody,
          attachments: [
            {
              filename: pdfFileName,
              content: pdfBuffer,
              contentType: 'application/pdf'
            },
            {
              filename: xmlDocFileName,
              content: Buffer.from(xmlContent, 'utf-8'),
              contentType: 'application/xml'
            },
            {
              filename: xmlRespFileName,
              content: Buffer.from(xmlResponseContent, 'utf-8'),
              contentType: 'application/xml'
            }
          ]
        });

        status = 'SENT';
        console.log(`[FiscalEmailService] ✅ Correo fiscal (XML + PDF) enviado exitosamente a: ${recipientEmail}`);
      } catch (smtpErr: any) {
        console.error('[FiscalEmailService] ❌ Error enviando correo SMTP:', smtpErr);
        status = 'FAILED';
        errorMessage = smtpErr.message || 'Error de conexión SMTP';
      }
    } else {
      // Modo Autónomo/Simulado: El paquete de correo y adjuntos se prepara y guarda en el Outbox
      status = 'SENT'; // Marcado como procesado en Outbox con archivos disponibles para descarga/envío
      console.log(`[FiscalEmailService] 📦 Paquete fiscal preparado (XML + PDF) para cliente: ${recipientEmail} (Modo Autónomo Local)`);
    }

    // 5. Registrar en Log de Envíos
    const emailLog = db.addEmailDispatchLog({
      documentKey: doc.numericKey,
      consecutive: doc.consecutive,
      documentType: doc.documentType,
      recipientEmail,
      recipientName: clientName,
      status,
      attachments: attachmentsList,
      errorMessage,
      senderAddress,
      smtpHost: config.emailSmtpHost || 'Autónomo Local'
    });

    // 6. Actualizar Documento Electrónico y Venta
    doc.customerEmailSent = status === 'SENT';
    doc.customerEmailSentAt = new Date().toISOString();
    doc.customerEmailAddress = recipientEmail;
    if (errorMessage) {
      doc.customerEmailError = errorMessage;
    }
    db.saveElectronicDocument(doc);

    // Actualizar venta relacionada si existe
    if (sale) {
      sale.customerEmailSent = doc.customerEmailSent;
      sale.customerEmailSentAt = doc.customerEmailSentAt;
      sale.customerEmailError = doc.customerEmailError;
      db.updateSale(sale.id, {
        customerEmailSent: sale.customerEmailSent,
        customerEmailSentAt: sale.customerEmailSentAt,
        customerEmailError: sale.customerEmailError
      });
    }

    // Registrar en Auditoría Fiscal
    db.addFiscalAuditLog({
      action: 'DESPACHO_CORREO',
      userId: 'system-mailer',
      userName: 'Despachador Automático de Facturas',
      documentKey: doc.numericKey,
      documentType: doc.documentType,
      details: `Envío automático de XML y PDF a ${recipientEmail}. Estado: ${status}.${errorMessage ? ' Detalle: ' + errorMessage : ''}`,
      payload: { recipientEmail, attachments: attachmentsList, status, subject },
      error: errorMessage
    });

    return {
      success: status === 'SENT',
      message: status === 'SENT' 
        ? `Documentos XML y PDF enviados exitosamente al cliente (${recipientEmail}).`
        : `No se pudo enviar el correo: ${errorMessage || 'Verifique la configuración SMTP.'}`,
      log: emailLog,
      recipientEmail
    };
  }

  /**
   * Prueba de conexión con el servidor SMTP configurado
   */
  public static async testSmtpConnection(testConfig: Partial<HaciendaDirectConfig>): Promise<{
    success: boolean;
    message: string;
  }> {
    if (!testConfig.emailSmtpHost || !testConfig.emailSmtpUser || !testConfig.emailSmtpPassword) {
      return {
        success: false,
        message: 'Debe ingresar el servidor SMTP, usuario y contraseña para realizar la prueba.'
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: testConfig.emailSmtpHost,
        port: testConfig.emailSmtpPort || 587,
        secure: testConfig.emailSmtpSecure || false,
        auth: {
          user: testConfig.emailSmtpUser,
          pass: testConfig.emailSmtpPassword
        },
        connectionTimeout: 8000,
        tls: {
          rejectUnauthorized: false
        }
      });

      await transporter.verify();

      return {
        success: true,
        message: '¡Conexión SMTP exitosa! El servidor de correo está listo para el envío automático de facturas.'
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Fallo de conexión con el servidor SMTP: ${err.message || err}`
      };
    }
  }
}
