import { offlineStorage } from './offlineStorageService';
import { 
  ElectronicDocument, 
  ElectronicDocumentType, 
  Sale, 
  Customer,
  OfflineConsecutiveLease, 
  OfflineFiscalQueueItem 
} from '../types/pos';
import { HaciendaXmlGenerator } from '../server/xmlGenerator';
import { calculateFiscalPriceBreakdown } from '../server/taxRules';
import { FiscalValidationService } from '../server/fiscalValidationService';

export interface OfflineSyncStatus {
  isOnline: boolean;
  pendingCount: number;
  activeLeases: Record<string, { current: number; max: number; status: string }>;
  lastSyncTime?: string;
  lastSyncMessage?: string;
}

class OfflineSyncManager {
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private syncInProgress: boolean = false;
  private listeners: Array<(status: OfflineSyncStatus) => void> = [];

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));

      // Iniciar sondeo periódico de sincronización cada 30 segundos (solo documentos pendientes)
      setInterval(() => {
        if (this.isOnline) {
          this.syncPendingDocuments();
        }
      }, 30000);
    }
  }

  public subscribe(callback: (status: OfflineSyncStatus) => void): () => void {
    this.listeners.push(callback);
    this.notifyStatus();
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private async notifyStatus(message?: string): Promise<void> {
    const pending = await offlineStorage.getPendingOfflineDocuments();
    const branch = '001';
    const terminal = await offlineStorage.getTerminalId();
    
    const lease04 = await offlineStorage.getActiveLease(branch, terminal, '04');
    const lease01 = await offlineStorage.getActiveLease(branch, terminal, '01');

    const status: OfflineSyncStatus = {
      isOnline: this.isOnline,
      pendingCount: pending.length,
      activeLeases: {
        '04': lease04 ? { current: lease04.currentSequence, max: lease04.rangeEnd, status: lease04.status } : { current: 0, max: 0, status: 'NO_LEASE' },
        '01': lease01 ? { current: lease01.currentSequence, max: lease01.rangeEnd, status: lease01.status } : { current: 0, max: 0, status: 'NO_LEASE' }
      },
      lastSyncMessage: message
    };

    this.listeners.forEach(cb => cb(status));
  }

  private handleNetworkChange(online: boolean): void {
    this.isOnline = online;
    console.log(`[OfflineSyncManager] Estado de red cambiado: ${online ? 'EN LÍNEA' : 'SIN INTERNET'}`);
    this.notifyStatus(online ? 'Conexión restaurada' : 'Modo sin conexión activado');

    if (online) {
      this.syncPendingDocuments();
      this.ensureActiveLeases();
    }
  }

  // ==========================================
  // CÁLCULO NORMATIVO DE 2 DÍAS HÁBILES
  // ==========================================
  public calculateBusinessDaysDeadline(issueDate: Date, businessDays = 2): string {
    const d = new Date(issueDate.getTime());
    let added = 0;

    while (added < businessDays) {
      d.setDate(d.getDate() + 1);
      const dayOfWeek = d.getDay(); // 0 = Domingo, 6 = Sábado
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        added++;
      }
    }

    // Fijar a las 23:59:59 del segundo día hábil
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }

  // ==========================================
  // RESERVA Y RENOVACIÓN DE BLOQUES (LEASES)
  // ==========================================

  private lastLeaseCheckTime = 0;

  public async ensureActiveLeases(forceRefresh: boolean = false): Promise<void> {
    if (!this.isOnline) return;

    // Protección anti-bucle: solo verificar como máximo una vez cada hora, salvo que se fuerce explícitamente
    const now = Date.now();
    if (!forceRefresh && (now - this.lastLeaseCheckTime) < 60 * 60 * 1000) {
      return;
    }
    this.lastLeaseCheckTime = now;

    try {
      const branch = '001';
      const terminal = await offlineStorage.getTerminalId();
      const deviceFp = await offlineStorage.getDeviceFingerprint();

      // 1. Consultar estado autoritativo de contadores en el servidor
      let serverSequences: Record<string, number> = {};
      try {
        const statusRes = await fetch(`/api/fiscal/consecutive-status?branch=${branch}&terminal=${terminal}`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.success && statusData.counters) {
            serverSequences = statusData.counters;
          }
        }
      } catch (err) {
        console.warn('[OfflineSyncManager] No se pudo obtener el estado de consecutivos del servidor:', err);
      }

      for (const docType of ['04', '01'] as ElectronicDocumentType[]) {
        let activeLease = await offlineStorage.getActiveLease(branch, terminal, docType);
        const blockSize = docType === '04' ? 50 : 20;
        const currentServerSeq = serverSequences[docType] || 0;

        // El lease solo se considera agotado si se consumieron todos sus números o si se fuerza explícitamente:
        const isExhausted = activeLease && (activeLease.currentSequence > activeLease.rangeEnd);
        if (forceRefresh || isExhausted) {
          if (isExhausted) {
            console.log(`[OfflineSyncManager] Bloque de contingencia [${activeLease?.rangeStart} - ${activeLease?.rangeEnd}] para tipo ${docType} fue consumido completamente. Renovando...`);
          }
          await offlineStorage.invalidateLease(branch, terminal, docType);
          activeLease = null;
        }

        // Si no hay lease activo o quedan menos de 3 números, solicitar reserva de forma segura
        const remaining = activeLease ? (activeLease.rangeEnd - activeLease.currentSequence + 1) : 0;
        if (!activeLease || remaining <= 3) {
          await this.requestLeaseFromServer(branch, terminal, docType, blockSize, deviceFp);
        }
      }

      this.notifyStatus();
    } catch (err) {
      console.warn('[OfflineSyncManager] Error verificando reservas de consecutivos:', err);
    }
  }

  public async requestLeaseFromServer(
    branch: string,
    terminal: string,
    documentType: ElectronicDocumentType,
    blockSize: number,
    deviceFingerprint: string
  ): Promise<OfflineConsecutiveLease | null> {
    try {
      const res = await fetch('/api/fiscal/request-consecutive-lease', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch,
          terminal,
          documentType,
          blockSize,
          deviceFingerprint
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.warn(`[OfflineSyncManager] Error al solicitar bloque (${res.status}):`, errorData.message);
        return null;
      }

      const data = await res.json();
      if (data.success && data.lease) {
        await offlineStorage.saveLease(data.lease);
        console.log(`[OfflineSyncManager] Bloque de consecutivos reservado exitosamente: [${data.lease.rangeStart} - ${data.lease.rangeEnd}] para Terminal ${terminal} (${documentType})`);
        return data.lease;
      }
    } catch (err) {
      console.warn('[OfflineSyncManager] Fallo en la comunicación al solicitar lease:', err);
    }
    return null;
  }

  // ==========================================
  // EMISIÓN FISCAL EN MODO OFFLINE (SITUACIÓN 3)
  // ==========================================

  public async emitFiscalDocumentOffline(params: {
    sale: Sale;
    documentType: ElectronicDocumentType;
    receiverCustomer?: Customer | null;
    branch?: string;
    terminal?: string;
    emisorTaxId?: string;
    useRestaurantServiceLine?: boolean;
  }): Promise<{
    success: boolean;
    consecutive?: string;
    numericKey?: string;
    electronicDocument?: ElectronicDocument;
    error?: string;
  }> {
    const branch = params.branch || '001';
    const terminal = params.terminal || await offlineStorage.getTerminalId();
    const emisorTaxId = params.emisorTaxId || '302680311';
    const documentType = params.documentType;

    const rawReceiver = params.receiverCustomer || (params.sale as any).receiverSnapshot || (params.sale as any).customer;

    // Validación preventiva de receptor en modo Offline para Factura Electrónica 01
    if (documentType === '01') {
      const receiverCheck = FiscalValidationService.validateElectronicInvoiceReceiver(rawReceiver, {
        documentType: '01'
      });
      if (!receiverCheck.isValid) {
        return {
          success: false,
          error: receiverCheck.errors[0] || 'Para emitir Factura Electrónica (01) en modo sin conexión, es obligatorio ingresar el Nombre e Identificación fiscal del cliente receptor.'
        };
      }
    }

    try {
      // 1. Consumir atómicamente el siguiente consecutivo del bloque reservado local
      const { consecutive, leaseId } = await offlineStorage.consumeNextConsecutive(branch, terminal, documentType);

      // 2. Generar Clave Numérica de 50 dígitos con Situación = '3' (Sin Internet)
      const issueDate = new Date();
      const formattedDate = issueDate.getDate().toString().padStart(2, '0') +
        (issueDate.getMonth() + 1).toString().padStart(2, '0') +
        issueDate.getFullYear().toString().slice(-2);
      
      const paddedTaxId = emisorTaxId.padStart(12, '0');
      const situation = '3'; // OBLIGATORIO: Situación 3 según Decreto 44739-H
      const securityCode = Math.floor(10000000 + Math.random() * 90000000).toString();
      const numericKey = `506${formattedDate}${paddedTaxId}${consecutive}${situation}${securityCode}`;

      // 3. Calcular Plazo Legal de 2 Días Hábiles
      const transmissionDeadline = this.calculateBusinessDaysDeadline(issueDate, 2);

      // 4. Construir Documento Electrónico
      const electronicDoc: ElectronicDocument = {
        id: `doc-offline-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        saleId: params.sale.id,
        documentType,
        numericKey,
        consecutive,
        issueDate: HaciendaXmlGenerator.getCostaRicaFiscalDateTime(issueDate),
        economicActivity: '5610.0',
        economicActivityCode: '5610.0',
        branch,
        terminal,
        currency: 'CRC',
        saleCondition: params.sale.saleCondition || '01',
        status: 'SIN_INTERNET_PENDIENTE',
        statusDescription: 'Comprobante emitido sin conexión. Situación 3. Pendiente de transmisión a Hacienda.',
        situation: '3',
        transmissionDeadline,
        leaseId,
        issuer: {
          name: 'Gladys Coto Arias / Pollo Frito Sabor Cervanteño',
          commercialName: 'Gladys Coto Arias / Pollo Frito Sabor Cervanteño',
          identificationType: '01',
          identificationNumber: '302680311',
          economicActivity: '5610.0',
          phone: '25347852',
          phoneCountryCode: '506',
          email: 'saborcervantes@gmail.com',
          province: '3',
          canton: '02',
          district: '01',
          neighborhood: '100 0este de super pino birrisito',
          address: '100 0este de super pino birrisito'
        },
        receiver: (() => {
          if (!rawReceiver || !rawReceiver.name || (documentType === '04' && (rawReceiver.name === 'Consumidor Final' || rawReceiver.name.includes('Consumidor Final')))) {
            return undefined;
          }
          return {
            name: rawReceiver.name.trim(),
            commercialName: rawReceiver.commercialName?.trim(),
            identificationType: rawReceiver.identificationType || '01',
            identificationNumber: (rawReceiver.identification || rawReceiver.identificationNumber || '').trim(),
            foreignIdentification: rawReceiver.foreignIdentification?.trim(),
            economicActivity: (rawReceiver.economicActivity || (rawReceiver as any).economicActivityCode || params.sale.customerEconomicActivity)?.trim(),
            phone: rawReceiver.phone?.trim(),
            phoneCountryCode: rawReceiver.phoneCountryCode?.trim() || '506',
            email: rawReceiver.email?.trim(),
            province: rawReceiver.province?.trim(),
            canton: rawReceiver.canton?.trim(),
            district: rawReceiver.district?.trim(),
            neighborhood: rawReceiver.neighborhood?.trim(),
            address: rawReceiver.address?.trim()
          };
        })(),
        lines: (documentType === '01' && (params.useRestaurantServiceLine || params.sale.useRestaurantServiceLine)) ? [{
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
          unitPrice: Number((params.sale.total / 1.13).toFixed(5)),
          discount: 0,
          discountAmount: 0,
          subtotal: Number((params.sale.total / 1.13).toFixed(5)),
          taxCode: '01',
          taxRateCode: '08',
          taxRate: 0.13,
          taxAmount: Number((params.sale.total - Number((params.sale.total / 1.13).toFixed(5))).toFixed(5)),
          totalLine: params.sale.total,
          totalLineAmount: params.sale.total
        }] : params.sale.items.map((item, idx) => {
          let resolvedCabys = item.cabysCode || (item as any).cabysCode;
          if (!resolvedCabys) {
            try {
              if (typeof window !== 'undefined' && window.localStorage) {
                const cachedProductsStr = localStorage.getItem('sabor_cervanteno_products');
                if (cachedProductsStr) {
                  const cachedProducts = JSON.parse(cachedProductsStr);
                  if (Array.isArray(cachedProducts)) {
                    const matchedProd = cachedProducts.find((p: any) => p.id === item.productId);
                    if (matchedProd && matchedProd.cabysCode) {
                      resolvedCabys = matchedProd.cabysCode;
                    }
                  }
                }
              }
            } catch {
              // Ignore localStorage parsing issues
            }
          }

          if (!resolvedCabys || typeof resolvedCabys !== 'string' || resolvedCabys.trim() === '') {
            throw new Error(`Producto "${item.name}" sin CAByS configurado. Configure el CAByS antes de emitir el comprobante.`);
          }

          const taxRate = (item.taxRate !== undefined && item.taxRate > 1) ? (item.taxRate / 100) : (item.taxRate ?? 0.13);
          const isPriceWithTax = item.isPriceWithTax ?? true;
          const breakdown = calculateFiscalPriceBreakdown(item.price, taxRate, isPriceWithTax);
          const unitPrice = breakdown.netPrice;
          const subtotal = Number((breakdown.netPrice * item.quantity).toFixed(5));
          const taxAmount = Number((breakdown.taxAmount * item.quantity).toFixed(5));
          const totalLineAmount = Number((breakdown.totalPrice * item.quantity).toFixed(5));

          return {
            lineNumber: idx + 1,
            productId: item.productId,
            internalCode: item.productId,
            cabysCode: resolvedCabys.trim(),
            description: item.name,
            detail: item.name,
            itemType: item.itemType || 'SERVICIO',
            quantity: item.quantity,
            unitOfMeasure: item.unitOfMeasure || (item.itemType === 'MERCANCIA' ? 'Unid' : 'Os'),
            unitPrice,
            discount: 0,
            discountAmount: 0,
            subtotal,
            taxCode: '01',
            taxRateCode: '08',
            taxRate,
            taxAmount,
            totalLine: totalLineAmount,
            totalLineAmount
          };
        }),
        subtotal: (documentType === '01' && (params.useRestaurantServiceLine || params.sale.useRestaurantServiceLine)) 
          ? Number((params.sale.total / 1.13).toFixed(5))
          : Number(params.sale.items.reduce((s, item) => {
              const rate = (item.taxRate !== undefined && item.taxRate > 1) ? (item.taxRate / 100) : (item.taxRate ?? 0.13);
              const b = calculateFiscalPriceBreakdown(item.price, rate, item.isPriceWithTax ?? true);
              return s + (b.netPrice * item.quantity);
            }, 0).toFixed(5)),
        discountTotal: params.sale.discount || 0,
        taxTotal: (documentType === '01' && (params.useRestaurantServiceLine || params.sale.useRestaurantServiceLine))
          ? Number((params.sale.total - Number((params.sale.total / 1.13).toFixed(5))).toFixed(5))
          : Number(params.sale.items.reduce((s, item) => {
              const rate = (item.taxRate !== undefined && item.taxRate > 1) ? (item.taxRate / 100) : (item.taxRate ?? 0.13);
              const b = calculateFiscalPriceBreakdown(item.price, rate, item.isPriceWithTax ?? true);
              return s + (b.taxAmount * item.quantity);
            }, 0).toFixed(5)),
        total: (documentType === '01' && (params.useRestaurantServiceLine || params.sale.useRestaurantServiceLine))
          ? params.sale.total
          : Number(params.sale.items.reduce((s, item) => {
              const rate = (item.taxRate !== undefined && item.taxRate > 1) ? (item.taxRate / 100) : (item.taxRate ?? 0.13);
              const b = calculateFiscalPriceBreakdown(item.price, rate, item.isPriceWithTax ?? true);
              return s + (b.totalPrice * item.quantity);
            }, 0).toFixed(5)),
        paymentMethods: params.sale.payments,
        isContingency: true,
        contingencyReason: 'Emisión sin conexión a Internet (Situación 3)',
        retryAttempts: 0,
        createdBy: params.sale.cashierName || 'Cajero Local',
        createdAt: issueDate.toISOString(),
        updatedAt: issueDate.toISOString()
      };

      // 5. Generar XML canónico v4.4
      const xmlGenerated = HaciendaXmlGenerator.generateDocumentXml(electronicDoc);
      electronicDoc.xmlGenerated = xmlGenerated;

      // 6. Encolar en IndexedDB
      const queueItem: OfflineFiscalQueueItem = {
        id: numericKey,
        saleId: params.sale.id,
        consecutive,
        numericKey,
        documentType,
        situation: '3',
        issueDate: electronicDoc.issueDate,
        transmissionDeadline,
        saleData: params.sale,
        electronicDocument: electronicDoc,
        xmlGenerated,
        status: 'SIN_INTERNET_PENDIENTE',
        syncAttempts: 0,
        createdAt: issueDate.toISOString()
      };

      await offlineStorage.enqueueOfflineDocument(queueItem);
      this.notifyStatus('Venta guardada localmente (Situación 3)');

      return {
        success: true,
        consecutive,
        numericKey,
        electronicDocument: electronicDoc
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Error al emitir comprobante offline'
      };
    }
  }

  // ==========================================
  // SINCRONIZACIÓN AL RESTABLECERSE INTERNET
  // ==========================================

  public async syncPendingDocuments(): Promise<{ total: number; synced: number; failed: number }> {
    if (this.syncInProgress || !this.isOnline) {
      return { total: 0, synced: 0, failed: 0 };
    }

    const pending = await offlineStorage.getPendingOfflineDocuments();
    if (pending.length === 0) {
      return { total: 0, synced: 0, failed: 0 };
    }

    this.syncInProgress = true;
    let synced = 0;
    let failed = 0;

    try {
      console.log(`[OfflineSyncManager] Sincronizando ${pending.length} documentos offline con Cloud Run...`);

      const res = await fetch('/api/fiscal/sync-offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: pending })
      });

      if (!res.ok) {
        throw new Error(`Error en servidor de sincronización (${res.status})`);
      }

      const result = await res.json();
      if (result.processed && Array.isArray(result.processed)) {
        for (const itemResult of result.processed) {
          if (itemResult.success) {
            await offlineStorage.markDocumentSynced(itemResult.numericKey);
            synced++;
          } else {
            await offlineStorage.markDocumentSyncError(itemResult.numericKey, itemResult.error || 'Error de procesamiento');
            failed++;
          }
        }
      }

      this.notifyStatus(`Sincronización completada: ${synced} enviados, ${failed} con error`);
    } catch (err: any) {
      console.warn('[OfflineSyncManager] Error durante la sincronización:', err.message);
      this.notifyStatus(`Error de sincronización: ${err.message}`);
    } finally {
      this.syncInProgress = false;
    }

    return { total: pending.length, synced, failed };
  }
}

export const offlineSyncManager = new OfflineSyncManager();
