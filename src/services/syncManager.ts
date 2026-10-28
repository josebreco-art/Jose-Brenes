import { SyncQueueItem, Sale } from '../types/pos';
import { PosApiService } from './api';

const QUEUE_STORAGE_KEY = 'sabor_cervanteno_sync_queue';
const FISCAL_RULES_START_DATE = '2026-10-23';

export class SyncManager {
  private static listeners: Array<(isOnline: boolean, queueCount: number) => void> = [];
  private static isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private static isSyncing: boolean = false;

  public static init() {
    if (typeof window !== 'undefined') {
      // Limpiar inmediatamente cualquier elemento anterior a la fecha de inicio de reglas (2026-10-23) o vencido
      this.purgeExpiredFromQueue();

      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notifyListeners();
        this.processQueue();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notifyListeners();
      });

      // Periodic retry and check every 25 seconds (Fiscal Retry Loop)
      setInterval(() => {
        if (this.isOnline && !this.isSyncing) {
          this.processQueue();
        }
      }, 25000);
    }
  }

  public static subscribe(listener: (isOnline: boolean, queueCount: number) => void) {
    this.listeners.push(listener);
    const activeCount = this.getQueue().filter(q => q.status === 'PENDING' || q.status === 'FAILED').length;
    listener(this.isOnline, activeCount);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private static notifyListeners() {
    const count = this.getQueue().filter(q => q.status === 'PENDING' || q.status === 'FAILED').length;
    this.listeners.forEach(l => l(this.isOnline, count));
  }

  private static isQueueItemValid(item: SyncQueueItem): boolean {
    if (!item || item.status === 'COMPLETED') return false;
    const cutoffDate = '2026-10-11';

    const saleObj = item.payload?.sale || item.payload;
    const itemDate = saleObj?.date || (item.createdAt ? item.createdAt.slice(0, 10) : '');
    if (!itemDate || itemDate < cutoffDate) return false;
    return true;
  }

  public static purgeExpiredFromQueue(): void {
    try {
      const data = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (!data) return;
      const parsed: SyncQueueItem[] = JSON.parse(data);
      const valid = (parsed || []).filter(item => this.isQueueItemValid(item));
      if (valid.length !== parsed.length) {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(valid));
      }
    } catch {
      // ignore
    }
  }

  public static getQueue(): SyncQueueItem[] {
    try {
      const data = localStorage.getItem(QUEUE_STORAGE_KEY);
      const list: SyncQueueItem[] = data ? JSON.parse(data) : [];
      return list.filter(item => this.isQueueItemValid(item));
    } catch {
      return [];
    }
  }

  private static saveQueue(queue: SyncQueueItem[]): void {
    try {
      const valid = queue.filter(item => this.isQueueItemValid(item));
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(valid));
      this.notifyListeners();
    } catch (e) {
      console.warn('Sync queue storage error:', e);
    }
  }

  public static addToQueue(saleId: string, type: 'CREATE_SALE' | 'EMIT_FISCAL_DOCUMENT', payload: any) {
    const queue = this.getQueue();
    // Avoid duplicate queue items for the same sale and type
    const existingIndex = queue.findIndex(q => q.saleId === saleId && q.type === type && q.status !== 'COMPLETED');
    
    if (existingIndex >= 0) {
      queue[existingIndex].payload = payload;
      queue[existingIndex].status = 'PENDING';
      queue[existingIndex].attempts = 0;
      queue[existingIndex].error = undefined;
    } else {
      const item: SyncQueueItem = {
        id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        saleId,
        type,
        status: 'PENDING',
        attempts: 0,
        payload,
        createdAt: new Date().toISOString()
      };
      queue.push(item);
    }

    this.saveQueue(queue);

    if (this.isOnline) {
      this.processQueue();
    }
  }

  public static async processQueue(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const queue = this.getQueue();
      // Reintentar hasta 10 veces automáticamente con backoff
      const pendingItems = queue.filter(item => item.status === 'PENDING' || (item.status === 'FAILED' && item.attempts < 10));

      for (const item of pendingItems) {
        // Backoff exponencial suave: si falló recientemente, esperar antes de insistir
        if (item.status === 'FAILED' && item.lastAttempt) {
          const elapsedMs = Date.now() - new Date(item.lastAttempt).getTime();
          const waitNeededMs = Math.min(60000, Math.pow(2, Math.min(item.attempts, 5)) * 1000);
          if (elapsedMs < waitNeededMs) {
            continue;
          }
        }

        item.status = 'PROCESSING';
        item.attempts += 1;
        item.lastAttempt = new Date().toISOString();
        this.saveQueue(queue);

        try {
          if (item.type === 'EMIT_FISCAL_DOCUMENT') {
            const sale: Sale = item.payload.sale;
            const docType = item.payload.documentType || '04';

            // Si la venta ya fue emitida y cuenta con su clave oficial de 50 dígitos (ej. emitida por el worker del servidor)
            if (sale && sale.numericKey50 && /^\d{50}$/.test(sale.numericKey50) && (sale.invoiceStatus === 'INVOICED' || (sale as any).haciendaStatus === 'ACEPTADO_HACIENDA')) {
              item.status = 'COMPLETED';
              item.processedAt = new Date().toISOString();
              item.error = undefined;
              this.saveQueue(queue);
              continue;
            }

            const result = await PosApiService.emitElectronicDocument({
              sale,
              documentType: docType,
              receiverCustomer: item.payload.receiver,
              useRestaurantServiceLine: item.payload.useRestaurantServiceLine
            });

            if (result.success && result.electronicDocument) {
              item.status = 'COMPLETED';
              item.processedAt = new Date().toISOString();
              item.error = undefined;

              // Actualizar la venta en la base de datos y memoria
              await PosApiService.updateSaleStatus(sale.id, {
                invoiceStatus: 'INVOICED',
                electronicDocumentType: result.electronicDocument.documentType,
                numericKey50: result.electronicDocument.numericKey,
                consecutive20: result.electronicDocument.consecutive,
                haciendaStatus: result.electronicDocument.status,
                haciendaResponseMessage: result.electronicDocument.statusDescription,
                xmlEmitted: result.electronicDocument.xmlGenerated,
                xmlHaciendaResponse: result.electronicDocument.xmlResponseHacienda
              });
            } else if (result.message && result.message.includes('en proceso de emisión')) {
              // El worker del servidor ya está emitiendo esta venta: no penalizar como fallo
              item.status = 'PENDING';
              item.attempts = Math.max(0, item.attempts - 1);
            } else {
              item.status = 'FAILED';
              item.error = result.message || 'Error en emisión de comprobante electrónico';
            }
          } else if (item.type === 'CREATE_SALE') {
            const sale: Sale = item.payload;
            const saved = await PosApiService.createSale(sale);
            if (saved && saved.id) {
              item.status = 'COMPLETED';
              item.processedAt = new Date().toISOString();
              item.error = undefined;
            } else {
              item.status = 'FAILED';
              item.error = 'Error sincronizando venta local';
            }
          }
        } catch (err: any) {
          item.status = 'FAILED';
          item.error = err.message || 'Error de red o procesamiento';
        }

        this.saveQueue(queue);
      }
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  public static clearCompleted() {
    const queue = this.getQueue().filter(q => q.status !== 'COMPLETED');
    this.saveQueue(queue);
  }
}
