export type OrderStatus = 'PENDIENTE' | 'EN_PREPARACION' | 'LISTO' | 'ENTREGADO' | 'CANCELADO';

export type ElectronicDocumentType = '01' | '02' | '03' | '04' | '08' | '09'; // 01=FE, 04=TE, 03=NC, 02=ND

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  cost?: number;
  taxRate: number;
  cabysCode: string;
  categoryId: string;
  unit: string;
  sku?: string;
  inventory?: number;
  active: boolean;
  image?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  displayOrder?: number;
  active: boolean;
  [key: string]: any;
}

export interface Customer {
  id: string;
  name: string;
  identification: string;
  identificationType: string; // 01=Fisica, 02=Juridica, 03=DIMEX, 04=NITE
  email: string;
  phone?: string;
  province?: string;
  canton?: string;
  district?: string;
  neighborhood?: string;
  address?: string;
  economicActivity?: string;
  fiscalCondition?: string;
  createdAt?: string;
  [key: string]: any;
}

export interface SaleItem {
  id: string;
  productId: string;
  productName: string;
  name?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  cabysCode: string;
  notes?: string;
}

export interface PaymentRecord {
  method: 'EFECTIVO' | 'TARJETA' | 'SINPE' | 'OTRO';
  amount: number;
  reference?: string;
}

export interface Sale {
  id: string;
  orderNumber: number;
  timestamp: number;
  date: string;
  time: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  change: number;
  payments: PaymentRecord[];
  orderType: 'MESA' | 'LLEVAR' | 'EXPRESS';
  orderStatus: OrderStatus;
  tableNumber?: string;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerIdentification?: string;
  customerIdentificationType?: string;
  customerAddress?: string;
  customerEconomicActivity?: string;
  electronicDocumentType?: ElectronicDocumentType;
  numericKey50?: string;
  consecutive20?: string;
  haciendaStatus?: 'PENDIENTE' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO' | 'NO_APLICA' | 'ERROR';
  haciendaResponseMessage?: string;
  invoiceStatus?: 'PENDIENTE' | 'FACTURADO' | 'ANULADO';
  cashierId: string;
  cashierName: string;
  cashRegisterId?: string;
  kitchenOrderId?: string;
  location?: string;
  terminalName?: string;
  syncedToCloud?: boolean;
  offlineCreated?: boolean;
  useRestaurantServiceLine?: boolean;
  createdAt?: string;
  updatedAt?: string;
  operationId?: string;
  idempotencyKey?: string;
  receiverSnapshot?: any;
}

export interface KitchenOrder {
  id: string;
  saleId: string;
  orderNumber: number;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    notes?: string;
    completed?: boolean;
  }[];
  orderType: 'MESA' | 'LLEVAR' | 'EXPRESS';
  tableNumber?: string;
  notes?: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  elapsedMinutes?: number;
}

export interface CashRegister {
  id: string;
  cashierId: string;
  cashierName: string;
  openTime: string;
  closeTime?: string;
  status: 'OPEN' | 'CLOSED';
  openingBalance: number;
  cashSales: number;
  cardSales: number;
  sinpeSales: number;
  transferSales: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  actualCash?: number;
  difference?: number;
  totalInvoicesCount: number;
  notes?: string;
  location?: string;
}

export interface CashMovement {
  id: string;
  cashRegisterId: string;
  type: 'INGRESO' | 'EGRESO';
  amount: number;
  concept: string;
  timestamp: string;
  cashierId: string;
  cashierName: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'ADMINISTRADOR' | 'CAJERO' | 'COCINERO' | 'MESERO';
  pinCode: string;
  active: boolean;
  location?: string;
  commissionRate?: number;
  permissions?: {
    canAccessPos?: boolean;
    canAccessKitchen?: boolean;
    canAccessSales?: boolean;
    canAccessFiscal?: boolean;
    canAccessCash?: boolean;
    canAccessProducts?: boolean;
    canAccessCustomers?: boolean;
    canAccessReports?: boolean;
    canApplyDiscounts?: boolean;
    canCancelOrders?: boolean;
  };
  updatedAt?: string;
}

export interface HaciendaDirectConfig {
  enabled: boolean;
  environment: 'staging' | 'production' | 'PRODUCTION' | 'STAGING' | string;
  emisorTaxId: string;
  emisorIdentificationType: string;
  emisorName: string;
  emisorCommercialName: string;
  emisorEmail: string;
  emisorPhone: string;
  emisorProvince: string;
  emisorCanton: string;
  emisorDistrict: string;
  emisorNeighborhood?: string;
  emisorAddressDetail: string;
  emisorEconomicActivity: string;
  branch: string;
  terminal: string;
  haciendaUsername?: string;
  haciendaPassword?: string;
  cryptographicKeyBase64?: string;
  cryptographicKeyPin?: string;
  cryptographicKeyFileName?: string;
  cryptographicKeyStatus?: string;
  autoSendToHacienda: boolean;
  autoSignXml: boolean;
  autoCheckHaciendaStatus: boolean;
  autoSendEmailToCustomer: boolean;
  lastFacturaNumber: number;
  lastTiqueteNumber: number;
  lastNotaCreditoNumber: number;
  lastNotaDebitoNumber: number;
  lastFacturaCompraNumber?: number;
  lastReciboPagoNumber?: number;
  emailSmtpHost?: string;
  emailSmtpPort?: number;
  emailSmtpSecure?: boolean;
  emailSmtpUser?: string;
  emailSmtpPassword?: string;
  emailSenderAddress?: string;
  emailSenderName?: string;
  emailCc?: string;
  emailCustomSubject?: string;
  emailCustomBody?: string;
  emailTestStatus?: string;
  softwareProviderTaxId?: string;
  emisorLogoBase64?: string;
  testStatus?: string;
  lastTestMessage?: string;
  lastTestedAt?: string;
  issuerAuditTrail?: any[];
}

export interface ElectronicDocument {
  id: string;
  saleId: string;
  documentType: ElectronicDocumentType;
  numericKey50: string;
  consecutive20: string;
  date: string;
  customerName: string;
  customerIdentification: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  haciendaStatus: 'PENDIENTE' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO' | 'ERROR';
  haciendaMessage?: string;
  signedXml?: string;
  haciendaResponseXml?: string;
  emailSent?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConsecutiveControl {
  branch: string;
  terminal: string;
  documentType: string;
  lastNumber: number;
}

export interface EmailDispatchLog {
  id: string;
  saleId: string;
  recipientEmail: string;
  numericKey50: string;
  subject: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  errorMessage?: string;
  timestamp: string;
}

export interface KitchenObservation {
  id: string;
  timestamp: string;
  type: string;
  message: string;
}
