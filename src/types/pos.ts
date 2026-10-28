export type KitchenStation = 'ALL' | 'FRITURA' | 'PLANCHA_ARMADO' | 'BEBIDAS_EXTRAS' | 'EXPRESS_DESPACHO';

// ==========================================
// CABYS & TRIBUTACIÓN COSTA RICA (HACIENDA v4.4)
// ==========================================

export type CabysStatus = 'VIGENTE' | 'NO_VIGENTE' | 'OBSOLETO' | 'EN_REVISION';

export interface CabysItem {
  id: string;
  codigoCabys: string; // Exactamente 13 dígitos numéricos como string
  descripcionOficial: string;
  nivel: number;
  categoria: string;
  subcategoria: string;
  estado: CabysStatus;
  impuestoSugerido?: number; // Ej: 13, 1, 0
  fechaInicioVigencia: string; // YYYY-MM-DD
  fechaFinVigencia?: string; // YYYY-MM-DD
  versionCatalogo: string; // Ej: CABYS_VIGENTE_2024_2026_CR
  fuente: string; // Banco Central de Costa Rica (BCCR)
  observaciones?: string;
}

export enum CostaRicaTaxType {
  IVA = '01',
  IVA_CALCULO_ESPECIAL = '07',
  IVA_REDUCIDA_1 = '02',
  IVA_REDUCIDA_2 = '03',
  IVA_REDUCIDA_4 = '04',
  IVA_REDUCIDA_8 = '05',
  IVA_EXENTO = '08'
}

export interface TaxRateConfig {
  id: string;
  code: string; // '01', '02', '08'
  taxType: CostaRicaTaxType;
  name: string;
  percentage: number; // 13, 1, 0
  rateDecimal: number; // 0.13, 0.01, 0.00
  active: boolean;
  description: string;
  startDate: string;
  endDate?: string;
}

export interface EconomicActivity {
  code: string; // Ej: '561001'
  description: string;
  main: boolean;
}

export type ElectronicDocumentType = 
  | '01' // Factura Electrónica (FE)
  | '02' // Nota de Débito Electrónica (ND)
  | '03' // Nota de Crédito Electrónica (NC)
  | '04' // Tiquete Electrónico (TE)
  | '05' // Factura Electrónica de Compra / Nota de Despacho
  | '06' // Recibo Electrónico de Pago
  | '08' // Factura Electrónica de Compra (FEC)
  | '09' // Factura Electrónica de Exportación (FEE)
  | '99'; // Otros documentos de referencia / Físicos

export type HaciendaDocumentStatus = 
  | 'BORRADOR'
  | 'PENDIENTE_ENVIO'
  | 'ENVIANDO'
  | 'ENVIADO_PROCESANDO'
  | 'RECIBIDO_HACIENDA'
  | 'ACEPTADO'
  | 'ACEPTADO_HACIENDA'
  | 'RECHAZADO'
  | 'RECHAZADO_HACIENDA'
  | 'CONTINGENCIA'
  | 'CONTINGENCIA_PENDIENTE'
  | 'SIN_INTERNET_PENDIENTE'
  | 'CONTINGENCIA_VENCIDA'
  | 'ANULADO'
  | 'ANULADO_POR_NC'
  | 'ERROR_VALIDACION_PREVIA';

export interface OfflineConsecutiveLease {
  leaseId: string;
  branch: string; // 3 dígitos ej: '001'
  terminal: string; // 5 dígitos ej: '00001'
  documentType: ElectronicDocumentType; // '01' | '04' | '03'
  rangeStart: number;
  rangeEnd: number;
  currentSequence: number;
  status: 'ACTIVE' | 'EXHAUSTED' | 'REVOKED' | 'EXPIRED';
  issuedAt: string;
  expiresAt?: string;
  deviceFingerprint?: string;
  hmacSignature?: string;
}

export interface OfflineFiscalQueueItem {
  id: string;
  saleId: string;
  consecutive: string;
  numericKey: string;
  documentType: ElectronicDocumentType;
  situation: '3';
  issueDate: string;
  transmissionDeadline: string; // 2 días hábiles
  saleData: Sale;
  electronicDocument: ElectronicDocument;
  xmlGenerated: string;
  status: 'SIN_INTERNET_PENDIENTE' | 'SYNCED' | 'SYNC_ERROR';
  syncAttempts: number;
  lastSyncError?: string;
  createdAt: string;
}

export interface LineExoneration {
  documentType: '01' | '02' | '03' | '04' | '05' | '99'; // 01: Compras autorizadas, 02: Ventas exentas a diplomáticos, etc.
  documentNumber: string;
  institutionalName: string;
  issueDate: string;
  exemptPercentage: number;
  exemptAmount: number;
}

export interface ElectronicInvoiceLine {
  lineNumber: number;
  productId: string;
  internalCode: string; // SKU / Código Interno restaurante
  commercialCode?: string;
  cabysCode: string; // 13 dígitos
  cabysDescriptionOfficial?: string;
  description: string;
  detail?: string;
  itemType?: 'MERCANCIA' | 'SERVICIO'; // Clasificación tributaria Hacienda 4.4
  quantity: number;
  unitOfMeasure: string; // 'Unid', 'Os', 'Sp', etc.
  unitPrice: number; // CRC
  totalAmount?: number;
  discount: number;
  discountAmount?: number;
  discountNature?: string;
  discountReason?: string;
  subtotal: number;
  taxCode: string; // '01' (IVA)
  taxRateCode?: string; // '08'
  taxRate: number; // e.g. 13%
  taxAmount: number;
  totalLine: number;
  totalLineAmount?: number;
  exoneration?: LineExoneration;
}

export interface ElectronicDocumentReference {
  documentType: ElectronicDocumentType;
  otherDocumentType?: string; // Obligatorio en DGT v4.4 cuando TipoDocIR es '99' (mín 5, máx 100 caracteres)
  invoiceNumber: string; // Clave 50 dígitos o número consecutivo
  numericKeyOrNumber?: string;
  issueDate: string;
  referenceCode: '01' | '02' | '03' | '04' | '05' | '06' | '13' | '16' | '99' | string; // 01: Anula, 02: Corrige, 06: Devolución, 13: Error material, 16: Sustituye rechazado, 99: Otros
  code?: '01' | '02' | '03' | '04' | '05' | '06' | '13' | '16' | '99' | string;
  otherReferenceCode?: string; // Obligatorio en DGT v4.4 cuando Codigo es '99' (mín 5, máx 100 caracteres)
  reason: string; // Motivo de anulación / Nota de crédito
}

export interface ElectronicDocument {
  id: string;
  saleId: string;
  documentType: ElectronicDocumentType;
  consecutive: string; // 20 dígitos: Sucursal (3) + Terminal (5) + Tipo (2) + Secuencia (10)
  numericKey: string; // 50 dígitos oficiales Ministerio de Hacienda
  economicActivity: string; // Ej: 561001
  economicActivityCode?: string;
  branch?: string; // 3 dígitos ej: '001'
  terminal?: string;
  currency?: string;
  saleCondition?: '01' | '02' | '03' | '04' | '05' | '99'; // 01: Contado, 02: Crédito
  creditTerm?: string; // Plazo en días si es a crédito
  status: HaciendaDocumentStatus;
  statusMessage?: string;
  statusDescription?: string;
  issueDate: string; // ISO 8601
  saleDate?: string; // Fecha original de la venta en el POS (YYYY-MM-DD)
  orderNumber?: number; // Número de comanda asociado
  
  // Emisor (Restaurante Pollo Frito Sabor Cervanteño)
  issuer: {
    name: string;
    commercialName: string;
    identificationType: IdentificationType;
    identificationNumber: string;
    economicActivity?: string;
    phone: string;
    phoneCountryCode?: string;
    email: string;
    province: string;
    canton: string;
    district: string;
    neighborhood?: string;
    address: string;
  };

  // Receptor
  receiver?: {
    name: string;
    commercialName?: string;
    identificationType?: IdentificationType;
    identificationNumber?: string;
    foreignIdentification?: string;
    economicActivity?: string; // 6 dígitos actividad económica del receptor para FE (01)
    phone?: string;
    phoneCountryCode?: string;
    email?: string;
    province?: string;
    canton?: string;
    district?: string;
    neighborhood?: string;
    address?: string;
  };

  lines: ElectronicInvoiceLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  paymentMethods: PaymentSplit[];
  
  // Referencias (para Notas de Crédito / Débito)
  reference?: ElectronicDocumentReference;

  // Almacenamiento XML oficial
  xmlGenerated?: string;
  xmlResponseHacienda?: string;
  haciendaResponseCode?: string;
  haciendaResponseDate?: string;
  haciendaResponseMessage?: string;
  haciendaRejectionReason?: string;

  // Trazabilidad y Logs de Diagnóstico Detallados
  diagnosticLogs?: HaciendaDiagnosticLog[];
  sendTimestamp?: string;
  sendEndpoint?: string;
  sendHttpStatus?: number;
  sendResponseRaw?: any;
  lastQueryTimestamp?: string;
  lastQueryHttpStatus?: number;
  lastQueryIndEstado?: string;
  lastQueryRawResponse?: any;
  lastError?: string;

  // Control de Envío de Correo Electrónico con XML y PDF
  customerEmailSent?: boolean;
  customerEmailSentAt?: string;
  customerEmailAddress?: string;
  customerEmailError?: string;

  retryAttempts: number;
  lastAttemptDate?: string;
  situation?: '1' | '2' | '3';
  transmissionDeadline?: string;
  leaseId?: string;
  isContingency: boolean;
  contingencyReason?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface HaciendaDiagnosticLog {
  id: string;
  timestamp: string;
  action: 'ENVIO' | 'CONSULTA_ESTADO' | 'REINTENTO';
  step?: string;
  endpoint: string;
  httpStatus: number;
  haciendaIndEstado?: string; // 'recibido' | 'procesando' | 'aceptado' | 'rechazado' | 'no_encontrado'
  haciendaResponseRaw?: any;
  rawResponse?: any;
  details?: string;
  parsedMessage?: string;
  haciendaMessageCode?: string;
  attemptsCount: number;
  error?: string;
}

export interface ConsecutiveControl {
  id: string;
  branch: string; // 3 dígitos ej: '001'
  terminal: string; // 5 dígitos ej: '00001'
  documentType: ElectronicDocumentType; // '01', '04', '03'
  currentSequence: number;
  lastSequenceNumber?: number; // Para configuración manual del último número utilizado
  updatedAt: string;
}

export type HaciendaEnvironment = 'STAGING' | 'PRODUCTION';

export interface HaciendaDirectConfig {
  enabled: boolean;
  environment: HaciendaEnvironment;
  
  // Datos del Contribuyente / Emisor
  emisorTaxId: string; // Cédula física (9), jurídica (10), DIMEX (11-12), NITE (10)
  emisorIdentificationType: IdentificationType;
  emisorName: string;
  emisorCommercialName: string;
  emisorEconomicActivity: string; // 6 dígitos ej. 561001
  emisorEmail: string;
  emisorPhone: string;
  emisorPhoneCountryCode?: string; // 506
  emisorProvince: string; // 1-7
  emisorCanton: string; // 2 dígitos
  emisorDistrict: string; // 2 dígitos
  emisorNeighborhood?: string; // 2 dígitos (opcional según XSD 4.4)
  emisorAddressDetail: string; // 1 a 250 caracteres
  emisorLogoBase64?: string; // Logotipo oficial de la empresa para facturas / PDF
  emisorLogoUrl?: string;
  
  // Proveedor de Software / Sistema (Declaración DGT v4.4)
  softwareProviderName?: string; // Nombre / Razón social del proveedor de software
  softwareProviderTaxId?: string; // Cédula del desarrollador / proveedor registrado
  
  // Datos Especiales y Normativos
  hasAlcoholicBeverageRegistry?: boolean;
  alcoholicBeverageRegistry?: string; // Registro fiscal de expendio de licores (Ley 9047)

  // Bitácora de Auditoría de Cambios de Configuración del Emisor
  issuerAuditTrail?: Array<{
    user: string;
    timestamp: string;
    field: string;
    previousValue: any;
    newValue: any;
  }>;

  // Credenciales ATV / IdP Hacienda (Comprobantes Electrónicos)
  haciendaUsername: string; // Usuario generado en ATV (ej. cpf-03-0101-0987@stag.tribunet.hacienda.go.cr o prod)
  haciendaPassword: string; // Contraseña ATV asignada al usuario
  
  // Llave Criptográfica (.p12 / .pfx)
  cryptographicKeyFileName?: string;
  cryptographicKeyBase64?: string; // Archivo .p12 codificado en base64
  cryptographicKeyPin: string; // PIN de 4 dígitos de la llave criptográfica generada en ATV
  cryptographicKeyExpiresAt?: string; // Fecha de expiración del certificado
  cryptographicKeyStatus?: 'VALID' | 'EXPIRED' | 'NOT_CONFIGURED' | 'LOADED';

  // Configuración de Sucursal y Terminal
  branch: string; // '001'
  terminal: string; // '00001'

  // Configuración de Últimos Consecutivos (Inicio de Secuencia)
  lastFacturaNumber: number; // Último número emitido de Factura Electrónica (01)
  lastTiqueteNumber: number; // Último número emitido de Tiquete Electrónico (04)
  lastNotaCreditoNumber: number; // Último número emitido de Nota de Crédito (03)
  lastNotaDebitoNumber: number; // Último número emitido de Nota de Débito (02)
  lastFacturaCompraNumber?: number; // Último número emitido de Factura Electrónica de Compra (05/08)
  lastReciboPagoNumber?: number; // Último número emitido de Recibo Electrónico de Pago (06/09)

  // Modos de Operación
  autoSendToHacienda: boolean; // Enviar inmediatamente al emitir venta
  autoCheckHaciendaStatus: boolean; // Consultar estado en segundo plano
  autoSignXml: boolean; // Firmar digitalmente con XAdES-EPES / RSA-SHA256
  
  // Envío Automático de Correo Electrónico (XML y PDF)
  autoSendEmailToCustomer: boolean; // Enviar automáticamente al cliente al facturar
  emailSmtpHost?: string; // ej: smtp.gmail.com, mail.saborcervanteno.cr
  emailSmtpPort?: number; // 587, 465, 25
  emailSmtpSecure?: boolean; // true para 465, false para 587 con STARTTLS
  emailSmtpUser?: string; // usuario SMTP
  emailSmtpPassword?: string; // contraseña o App Password
  emailSenderName?: string; // ej: Pollo Frito Sabor Cervanteño - Facturación
  emailSenderAddress?: string; // ej: facturacion@saborcervanteno.cr
  emailCc?: string; // Copia a contador o administración
  emailCustomSubject?: string; // Asunto personalizado
  emailCustomBody?: string; // Plantilla de texto para el cuerpo del correo
  emailTestStatus?: 'SUCCESS' | 'ERROR' | 'UNTESTED';
  emailLastTestedAt?: string;
  emailLastTestMessage?: string;

  // Estado de Conexión y Pruebas
  testStatus?: 'SUCCESS' | 'ERROR' | 'UNTESTED';
  lastTestedAt?: string;
  lastTestMessage?: string;
  tokenExpiresAt?: string;
}

export interface EmailDispatchLog {
  id: string;
  documentKey: string;
  numericKey?: string;
  consecutive: string;
  documentType: ElectronicDocumentType;
  recipientEmail: string;
  recipientName?: string;
  subject?: string;
  sentAt: string;
  status: 'SENT' | 'FAILED' | 'PENDING_SMTP';
  attachments: string[];
  errorMessage?: string;
  senderAddress?: string;
  smtpHost?: string;
}

export interface FiscalValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    cabysValidations: {
      productId: string;
      productName: string;
      cabysCode: string;
      valid: boolean;
      message: string;
    }[];
    taxValidations: {
      subtotal: number;
      taxTotal: number;
      calculatedTotal: number;
      valid: boolean;
    };
    customerValidations?: {
      valid: boolean;
      message?: string;
    };
  };
}

export interface FiscalAuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: 'EMISION_COMPROBANTE' | 'NOTA_CREDITO' | 'RESPUESTA_HACIENDA' | 'REINTENTO_CONTINGENCIA' | 'CAMBIO_CABYS' | 'CAMBIO_IMPUESTO' | 'VALIDACION_FALLIDA' | 'DESPACHO_CORREO' | 'CONSULTA_ESTADO';
  documentKey?: string; // Clave 50 dígitos
  documentType?: ElectronicDocumentType;
  previousStatus?: HaciendaDocumentStatus;
  newStatus?: HaciendaDocumentStatus;
  details: string;
  ipAddress?: string;
  payload?: any;
  error?: string;
}

export interface ProductModifier {
  id: string;
  name: string;
  price: number;
}

export interface KitchenObservation {
  id: string;
  text: string;
  categoryId?: string; // Si se define, aplica solo a una categoría; si no, aplica a todo el menú
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  sku: string;
  commercialCode?: string; // Código comercial interno / Código emisor (ej: '117', '078')
  cabysCode: string; // Exactamente 13 dígitos numéricos válidos en el catálogo oficial
  cabysDescriptionOfficial?: string;
  categoryId: string;
  itemType?: 'MERCANCIA' | 'SERVICIO'; // Tipo de ítem fiscal Hacienda v4.4 (Mercancía o Servicio)
  price: number; // Precio total de venta al cliente en Colones (CRC ₡)
  netPrice?: number; // Base imponible antes de IVA (₡)
  taxAmount?: number; // Monto calculado del impuesto (₡)
  cost: number;
  taxRate: number; // e.g. 0.13 (13% IVA Costa Rica), 0.01, 0.00
  taxCode?: string; // '01' (IVA)
  taxRateCode?: string; // '08' (13%), '01' (1%), '02' (2%), '04' (4%), '07' (8%)
  unitOfMeasure?: string; // 'Os' (Servicio), 'Unid' (Unidad), 'Sp' (Servicios profesionales), 'kg', 'L', etc.
  isPriceWithTax?: boolean; // Indica si el precio de venta configurado ya incluye IVA
  exoneration?: LineExoneration; // Configuración de exoneración tributaria
  inventory: number;
  unit: string;
  image: string;
  barcode?: string;
  active: boolean;
  station?: KitchenStation; // Estación de cocina para múltiples monitores KDS
  modifiers?: ProductModifier[];
  askModifiersOnSelection?: boolean; // Si es true, abre modal de adicionales de receta al tocar el producto en el POS
  locationStock?: {
    RESTAURANTE: number;
    CEDI: number;
  };
  productType?: 'PRODUCTO_SIMPLE' | 'PRODUCTO_COMPUESTO_COMBO';
  compositeItems?: {
    productId: string;
    quantity: number;
    name: string;
  }[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  iconName: string;
  sortOrder: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
}

export type IdentificationType = '01' | '02' | '03' | '04' | '05'; 
// 01: Cédula Física (9 dígitos), 02: Cédula Jurídica (10 dígitos), 03: DIMEX (11 o 12 dígitos), 04: NITE (10 dígitos), 05: Extranjero / Pasaporte

export interface Customer {
  id: string;
  name: string;
  commercialName?: string;
  identification: string;
  identificationType: IdentificationType;
  economicActivity?: string; // 6 dígitos actividad económica para FE 01
  phone: string;
  email: string;
  address: string;
  province: string;
  canton: string;
  district: string;
  neighborhood?: string;
  fiscalCondition?: string;
  createdAt: string;
}

export type PaymentMethodType = 
  | 'CASH'             // 01: Efectivo
  | 'CARD'             // 02: Tarjeta
  | 'CHECK'            // 03: Cheque
  | 'TRANSFER'         // 04: Transferencia / depósito bancario
  | 'THIRD_PARTY'      // 05: Recaudado por terceros
  | 'SINPE'            // 06: SINPE Móvil
  | 'DIGITAL_PLATFORM' // 07: Plataforma Digital
  | 'OTHER';           // 99: Otros

export interface PaymentSplit {
  method: PaymentMethodType;
  amount: number;
  reference?: string;
}

export interface CartItemModifier {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  productId: string;
  name: string;
  cabysCode?: string;
  price: number;
  quantity: number;
  taxRate: number;
  isPriceWithTax?: boolean;
  netPrice?: number;
  discount?: number;
  notes?: string;
  modifiers?: CartItemModifier[];
  station?: KitchenStation; // Estación de cocina a la que pertenece
  itemType?: 'MERCANCIA' | 'SERVICIO';
  unitOfMeasure?: string;
  exoneration?: LineExoneration;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export type OrderStatus = 'CREATED' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
export type InvoiceStatus = 'NOT_INVOICED' | 'PROCESSING' | 'INVOICED' | 'ERROR' | 'PENDING_OFFLINE' | 'CANCELLED';
export type OrderType = 'DINE_IN' | 'TAKE_OUT' | 'DELIVERY';
export type LocationType = 'RESTAURANTE' | 'CEDI';

export interface Sale {
  id: string; // localSaleId (UUID único para idempotencia)
  orderNumber: number;
  invoiceNumber?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  timestamp: number;
  customerId?: string;
  customerName: string;
  customerIdentification?: string;
  customerIdentificationType?: IdentificationType;
  customerEconomicActivity?: string; // 6 dígitos actividad económica
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  receiverSnapshot?: {
    name: string;
    commercialName?: string;
    identificationType?: IdentificationType;
    identification?: string;
    identificationNumber?: string;
    foreignIdentification?: string;
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
  orderType: OrderType;
  tableNumber?: string;
  customOrderName?: string; // Nombre o identificador interno de la comanda (ej: "Terraza Mesa 4", "Cumpleaños", "Para Llevar Carlos")
  items: CartItem[];
  subtotal: number;
  discount: number;
  discountTotal?: number;
  taxTotal: number;
  total: number;
  payments: PaymentSplit[];
  amountPaid: number;
  change: number; // Vuelto
  saleCondition?: '01' | '02' | '03' | '04' | '05' | '99'; // 01: Contado, 02: Crédito
  creditTerm?: string; // Días de plazo
  orderStatus: OrderStatus;
  invoiceStatus: InvoiceStatus;
  paymentStatus?: 'PAID' | 'PENDING' | 'CANCELLED';
  
  // Facturación Electrónica Costa Rica (Hacienda v4.4)
  electronicDocumentType?: ElectronicDocumentType; // '01': Factura Electrónica, '04': Tiquete Electrónico, '03': Nota de Crédito
  numericKey50?: string; // Clave 50 dígitos Hacienda
  consecutive20?: string; // Consecutivo 20 dígitos
  haciendaStatus?: HaciendaDocumentStatus;
  haciendaResponseMessage?: string;
  xmlEmitted?: string;
  xmlHaciendaResponse?: string;
  creditNoteReferenceKey?: string; // Referencia en caso de anulación
  
  // Control de Envío de Factura por Correo
  customerEmailSent?: boolean;
  customerEmailSentAt?: string;
  customerEmailError?: string;
  
  // Opción de Facturación Resumida como Servicio de Restaurante
  useRestaurantServiceLine?: boolean;
  
  // Vinculación unívoca con la comanda de cocina previa (evita duplicidad en KDS)
  kitchenOrderId?: string;
  
  // Control de Idempotencia y Prevención de Duplicados
  operationId?: string;
  idempotencyKey?: string;
  clientOrderId?: string;
  isNew?: boolean;
  
  // Vinculación con el turno de caja
  cashRegisterId?: string;
  
  cashierId: string;
  cashierName: string;
  terminalName?: string; // e.g. "Tablet Salonero 1", "Móvil 2", "Caja Principal"
  location: LocationType;
  offlineCreated?: boolean;
  syncedToCloud?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KitchenOrder {
  id: string; // e.g. "korder-1725118800000-abcde"
  orderNumber: number;
  date: string;
  time: string;
  timestamp: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerIdentification?: string;
  customerEmail?: string;
  orderType: OrderType;
  tableNumber?: string;
  customOrderName?: string;
  items: CartItem[];
  subtotal: number;
  discount?: number;
  discountTotal?: number;
  taxTotal: number;
  total: number;
  payments?: PaymentSplit[];
  amountPaid?: number;
  change?: number;
  invoiceNumber?: string;
  consecutive20?: string;
  numericKey50?: string;
  electronicDocumentType?: ElectronicDocumentType;
  haciendaStatus?: HaciendaDocumentStatus;
  orderStatus: OrderStatus;
  isPaid?: boolean;
  saleId?: string;
  operationId?: string;
  idempotencyKey?: string;
  clientOrderId?: string;
  isNew?: boolean;
  cashierId?: string;
  cashierName?: string;
  terminalName?: string;
  location: LocationType;
  createdAt: string;
  updatedAt: string;
}

export interface PausedOrder {
  id: string;
  orderNumber?: number;
  kitchenOrderId?: string;
  customOrderName?: string;
  customer: Customer;
  orderType: OrderType;
  tableNumber?: string;
  items: CartItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  createdAt: string;
  terminalName?: string;
  notes?: string;
}

export interface CashRegister {
  id: string;
  cashierId: string;
  cashierName: string;
  location: LocationType;
  openTime: string;
  closeTime?: string;
  openingBalance: number;
  cashSales: number;
  cardSales: number;
  sinpeSales: number;
  transferSales: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  countedCash?: number;
  difference?: number;
  status: 'OPEN' | 'CLOSED';
  notes?: string;
  totalInvoicesCount: number;
}

export interface CashMovement {
  id: string;
  cashRegisterId: string;
  type: 'IN' | 'OUT';
  amount: number;
  reason: string;
  timestamp: string;
  cashierName: string;
}

export interface SyncQueueItem {
  id: string;
  saleId: string;
  type: 'CREATE_SALE' | 'EMIT_FISCAL_DOCUMENT' | 'QUERY_HACIENDA_STATUS' | 'UPDATE_STATUS';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  attempts: number;
  lastAttempt?: string;
  error?: string;
  payload: any;
  createdAt: string;
  processedAt?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  timestamp: string;
  details: string;
  ipAddress?: string;
  location: LocationType;
  saleId?: string;
  documentKey?: string;
}

export interface UserPermissions {
  canAccessPos: boolean;          // POS / Facturación
  canAccessKitchen: boolean;      // Cocina / KDS
  canAccessSales: boolean;        // Historial de Ventas & Facturas
  canAccessFiscal: boolean;       // Comprobantes Hacienda DGT
  canAccessCash: boolean;         // Control de Caja (Apertura y Cierre)
  canAccessProducts: boolean;     // Menú & Inventario de Productos
  canAccessCustomers: boolean;    // Directorio de Clientes
  canAccessReports: boolean;      // Reportes y Tableros
  canApplyDiscounts: boolean;     // Aplicar Descuentos / Modificadores
  canCancelOrders: boolean;       // Anular Órdenes o Comandas
}

export const DEFAULT_CASHIER_PERMISSIONS: UserPermissions = {
  canAccessPos: true,
  canAccessKitchen: true,
  canAccessSales: true,
  canAccessFiscal: false,
  canAccessCash: true,
  canAccessProducts: false,
  canAccessCustomers: true,
  canAccessReports: false,
  canApplyDiscounts: true,
  canCancelOrders: false
};

export const DEFAULT_ADMIN_PERMISSIONS: UserPermissions = {
  canAccessPos: true,
  canAccessKitchen: true,
  canAccessSales: true,
  canAccessFiscal: true,
  canAccessCash: true,
  canAccessProducts: true,
  canAccessCustomers: true,
  canAccessReports: true,
  canApplyDiscounts: true,
  canCancelOrders: true
};

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'ADMINISTRADOR' | 'CAJERO' | 'COCINA' | 'SUPERVISOR' | 'DELIVERY';
  pinCode?: string;
  active: boolean;
  location: LocationType;
  commissionRate?: number; // Porcentaje de comisión asignado (ej. 2 = 2%, 3.5 = 3.5%)
  permissions?: UserPermissions;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
}

