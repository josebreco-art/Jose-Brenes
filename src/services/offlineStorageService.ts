import { OfflineConsecutiveLease, OfflineFiscalQueueItem, ElectronicDocumentType, Sale, ElectronicDocument } from '../types/pos';

const DB_NAME = 'PolloFritoPOS_OfflineDB';
const DB_VERSION = 1;

class OfflineStorageService {
  private dbInstance: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  private resetConnection(): void {
    if (this.dbInstance) {
      try {
        this.dbInstance.close();
      } catch {
        // ignore close errors
      }
    }
    this.dbInstance = null;
    this.dbPromise = null;
  }

  private async getDB(): Promise<IDBDatabase> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      throw new Error('IndexedDB no está disponible en este entorno.');
    }

    if (this.dbInstance) {
      return this.dbInstance;
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          if (!db.objectStoreNames.contains('offline_sales')) {
            db.createObjectStore('offline_sales', { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains('offline_fiscal_queue')) {
            const fiscalStore = db.createObjectStore('offline_fiscal_queue', { keyPath: 'id' });
            fiscalStore.createIndex('status', 'status', { unique: false });
            fiscalStore.createIndex('saleId', 'saleId', { unique: true });
            fiscalStore.createIndex('consecutive', 'consecutive', { unique: true });
          }

          if (!db.objectStoreNames.contains('terminal_leases')) {
            db.createObjectStore('terminal_leases', { keyPath: 'leaseKey' });
          }

          if (!db.objectStoreNames.contains('terminal_config')) {
            db.createObjectStore('terminal_config', { keyPath: 'key' });
          }
        };

        request.onsuccess = () => {
          const db = request.result;
          this.dbInstance = db;

          db.onclose = () => {
            console.warn('[OfflineStorage] Conexión IndexedDB cerrada. Se reconectará en la siguiente transacción.');
            this.resetConnection();
          };

          db.onversionchange = () => {
            console.warn('[OfflineStorage] Cambio de versión en IndexedDB. Cerrando conexión previa.');
            this.resetConnection();
          };

          resolve(db);
        };

        request.onerror = () => {
          this.resetConnection();
          reject(request.error || new Error('Error al abrir IndexedDB'));
        };

        request.onblocked = () => {
          console.warn('[OfflineStorage] Apertura de IndexedDB bloqueada por otra pestaña o proceso.');
          this.resetConnection();
        };
      } catch (err) {
        this.resetConnection();
        reject(err);
      }
    });

    return this.dbPromise;
  }

  /**
   * Ejecuta una operación sobre una transacción IndexedDB con autorecuperación
   * en caso de que la conexión se haya cerrado o esté en proceso de cierre.
   */
  private async withTransaction<T>(
    storeNames: string | string[],
    mode: IDBTransactionMode,
    operation: (tx: IDBTransaction) => Promise<T> | T
  ): Promise<T> {
    const execute = async (isRetry = false): Promise<T> => {
      try {
        const db = await this.getDB();
        const tx = db.transaction(storeNames, mode);

        // Si la conexión entra en cierre durante la transacción
        tx.onabort = () => {
          if (tx.error && tx.error.name === 'QuotaExceededError') {
            console.error('[OfflineStorage] Espacio de almacenamiento lleno en IndexedDB.');
          }
        };

        return await operation(tx);
      } catch (err: any) {
        const errorMsg = String(err?.message || err || '');
        const isClosing = errorMsg.includes('closing') || errorMsg.includes('closed') || errorMsg.includes('InvalidStateError');

        if (!isRetry && isClosing) {
          console.warn('[OfflineStorage] Conexión cerrada detectada. Reiniciando conexión y reintentando operación...');
          this.resetConnection();
          return execute(true);
        }
        throw err;
      }
    };

    return execute(false);
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const db = await this.getDB();
      return !!db;
    } catch {
      return false;
    }
  }

  // ==========================================
  // CONFIGURACIÓN E IDENTIDAD DE TERMINAL
  // ==========================================

  public async getTerminalId(): Promise<string> {
    try {
      return await this.withTransaction('terminal_config', 'readonly', (tx) => {
        return new Promise<string>((resolve) => {
          const store = tx.objectStore('terminal_config');
          const req = store.get('terminalId');
          req.onsuccess = () => {
            if (req.result && req.result.value) {
              resolve(req.result.value);
            } else {
              resolve('00001');
            }
          };
          req.onerror = () => resolve('00001');
        });
      });
    } catch {
      try {
        return localStorage.getItem('pos_terminal_id') || '00001';
      } catch {
        return '00001';
      }
    }
  }

  public async setTerminalId(terminalId: string): Promise<void> {
    const formatted = terminalId.padStart(5, '0');
    try {
      localStorage.setItem('pos_terminal_id', formatted);
    } catch {
      // ignore localStorage errors
    }

    try {
      await this.withTransaction('terminal_config', 'readwrite', (tx) => {
        return new Promise<void>((resolve, reject) => {
          const store = tx.objectStore('terminal_config');
          const req = store.put({ key: 'terminalId', value: formatted });
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      });
    } catch (e) {
      console.warn('[OfflineStorage] Error guardando terminalId en IndexedDB:', e);
    }
  }

  public async getDeviceFingerprint(): Promise<string> {
    try {
      return await this.withTransaction('terminal_config', 'readwrite', (tx) => {
        return new Promise<string>((resolve) => {
          const store = tx.objectStore('terminal_config');
          const req = store.get('deviceFingerprint');
          req.onsuccess = () => {
            if (req.result && req.result.value) {
              resolve(req.result.value);
            } else {
              const newFp = `DEV-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
              store.put({ key: 'deviceFingerprint', value: newFp });
              try {
                localStorage.setItem('pos_device_fingerprint', newFp);
              } catch {}
              resolve(newFp);
            }
          };
          req.onerror = () => {
            const fallback = `DEV-${Date.now()}`;
            resolve(fallback);
          };
        });
      });
    } catch {
      try {
        const stored = localStorage.getItem('pos_device_fingerprint');
        if (stored) return stored;
        const newFp = `DEV-${Date.now()}`;
        localStorage.setItem('pos_device_fingerprint', newFp);
        return newFp;
      } catch {
        return 'DEV-FALLBACK-FINGERPRINT';
      }
    }
  }

  // ==========================================
  // GESTIÓN DE LEASES Y CONSECUTIVOS OFFLINE
  // ==========================================

  private buildLeaseKey(branch: string, terminal: string, documentType: ElectronicDocumentType): string {
    return `${branch.padStart(3, '0')}-${terminal.padStart(5, '0')}-${documentType}`;
  }

  public async getActiveLease(
    branch: string,
    terminal: string,
    documentType: ElectronicDocumentType
  ): Promise<OfflineConsecutiveLease | null> {
    const leaseKey = this.buildLeaseKey(branch, terminal, documentType);

    // 1. Intentar leer desde IndexedDB
    try {
      const idbLease = await this.withTransaction('terminal_leases', 'readonly', (tx) => {
        return new Promise<OfflineConsecutiveLease | null>((resolve, reject) => {
          const store = tx.objectStore('terminal_leases');
          const req = store.get(leaseKey);

          req.onsuccess = () => {
            const item = req.result;
            if (!item || !item.lease) {
              resolve(null);
              return;
            }

            const lease: OfflineConsecutiveLease = item.lease;
            if (lease.status === 'ACTIVE' && lease.currentSequence <= lease.rangeEnd) {
              resolve(lease);
            } else {
              resolve(null);
            }
          };

          req.onerror = () => reject(req.error);
        });
      });

      if (idbLease) {
        return idbLease;
      }
    } catch (e) {
      console.warn('[OfflineStorage] Error obteniendo active lease de IndexedDB:', e);
    }

    // 2. Respaldo inmediato en localStorage si IndexedDB no responde o está en modo privado
    try {
      const raw = localStorage.getItem(`pos_lease_${leaseKey}`);
      if (raw) {
        const lease: OfflineConsecutiveLease = JSON.parse(raw);
        if (lease && lease.status === 'ACTIVE' && lease.currentSequence <= lease.rangeEnd) {
          return lease;
        }
      }
    } catch {}

    return null;
  }

  public async saveLease(lease: OfflineConsecutiveLease): Promise<void> {
    const leaseKey = this.buildLeaseKey(lease.branch, lease.terminal, lease.documentType);

    // Guardar en localStorage inmediatamente para persistencia indestructible
    try {
      localStorage.setItem(`pos_lease_${leaseKey}`, JSON.stringify(lease));
    } catch {}

    try {
      await this.withTransaction('terminal_leases', 'readwrite', (tx) => {
        return new Promise<void>((resolve, reject) => {
          const store = tx.objectStore('terminal_leases');
          const req = store.put({
            leaseKey,
            lease,
            updatedAt: new Date().toISOString()
          });

          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      });
    } catch (e) {
      console.warn('[OfflineStorage] Error guardando lease:', e);
    }
  }

  public async invalidateLease(branch: string, terminal: string, documentType: ElectronicDocumentType): Promise<void> {
    const leaseKey = this.buildLeaseKey(branch, terminal, documentType);

    try {
      await this.withTransaction('terminal_leases', 'readwrite', (tx) => {
        return new Promise<void>((resolve, reject) => {
          const store = tx.objectStore('terminal_leases');
          const req = store.delete(leaseKey);

          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      });
    } catch (e) {
      console.warn('[OfflineStorage] Error invalidando lease:', e);
    }
  }

  public async getAllLeases(): Promise<OfflineConsecutiveLease[]> {
    try {
      return await this.withTransaction('terminal_leases', 'readonly', (tx) => {
        return new Promise((resolve, reject) => {
          const store = tx.objectStore('terminal_leases');
          const req = store.getAll();

          req.onsuccess = () => {
            const list = req.result || [];
            resolve(list.map((item: any) => item.lease).filter(Boolean));
          };
          req.onerror = () => reject(req.error);
        });
      });
    } catch {
      return [];
    }
  }

  /**
   * Consume de forma atómica el siguiente consecutivo del bloque reservado local.
   * Si el bloque se agotó, bloquea la emisión y actualiza el estado a EXHAUSTED.
   */
  public async consumeNextConsecutive(
    branch: string,
    terminal: string,
    documentType: ElectronicDocumentType
  ): Promise<{ consecutive: string; sequenceNumber: number; leaseId: string }> {
    const leaseKey = this.buildLeaseKey(branch, terminal, documentType);

    return this.withTransaction('terminal_leases', 'readwrite', (tx) => {
      return new Promise((resolve, reject) => {
        const store = tx.objectStore('terminal_leases');
        const req = store.get(leaseKey);

        req.onsuccess = () => {
          const item = req.result;
          if (!item || !item.lease) {
            reject(new Error(`No existe un bloque de reserva fiscal activo para la Terminal ${terminal} (Tipo: ${documentType}). Requiere conexión a Internet para reservar consecutivos.`));
            return;
          }

          const lease: OfflineConsecutiveLease = item.lease;
          if (lease.status !== 'ACTIVE') {
            reject(new Error(`El bloque de reserva fiscal está ${lease.status}. Requiere conexión para renovar bloque.`));
            return;
          }

          const currentSeq = lease.currentSequence;
          if (currentSeq > lease.rangeEnd) {
            lease.status = 'EXHAUSTED';
            store.put({ leaseKey, lease, updatedAt: new Date().toISOString() });
            reject(new Error(`El bloque de reserva fiscal (${lease.rangeStart}-${lease.rangeEnd}) se ha agotado por completo. Conecte la terminal a Internet para obtener un nuevo bloque.`));
            return;
          }

          // Incrementar para la siguiente venta
          const assignedSequence = currentSeq;
          lease.currentSequence = currentSeq + 1;
          if (lease.currentSequence > lease.rangeEnd) {
            lease.status = 'EXHAUSTED';
          }

          store.put({ leaseKey, lease, updatedAt: new Date().toISOString() });
          try {
            localStorage.setItem(`pos_lease_${leaseKey}`, JSON.stringify(lease));
          } catch {}

          const b3 = branch.padStart(3, '0');
          const t5 = terminal.padStart(5, '0');
          const seq10 = assignedSequence.toString().padStart(10, '0');
          const consecutive = `${b3}${t5}${documentType}${seq10}`;

          resolve({
            consecutive,
            sequenceNumber: assignedSequence,
            leaseId: lease.leaseId
          });
        };

        req.onerror = () => reject(req.error);
      });
    });
  }

  // ==========================================
  // COLA FISCAL OFFLINE (SITUACIÓN 3)
  // ==========================================

  public async enqueueOfflineDocument(item: OfflineFiscalQueueItem): Promise<void> {
    try {
      await this.withTransaction(['offline_fiscal_queue', 'offline_sales'], 'readwrite', (tx) => {
        return new Promise<void>((resolve, reject) => {
          const fiscalStore = tx.objectStore('offline_fiscal_queue');
          const salesStore = tx.objectStore('offline_sales');

          fiscalStore.put(item);
          salesStore.put(item.saleData);

          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      });
    } catch (e) {
      console.warn('[OfflineStorage] Error encolando documento offline:', e);
    }
  }

  public async getPendingOfflineDocuments(): Promise<OfflineFiscalQueueItem[]> {
    const FISCAL_RULES_START_DATE = '2026-10-23';
    const rawYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rawOneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const minDateTE = rawYesterday < FISCAL_RULES_START_DATE ? FISCAL_RULES_START_DATE : rawYesterday;
    const minDateFE = rawOneWeekAgo < FISCAL_RULES_START_DATE ? FISCAL_RULES_START_DATE : rawOneWeekAgo;
    try {
      return await this.withTransaction('offline_fiscal_queue', 'readwrite', (tx) => {
        return new Promise((resolve, reject) => {
          const store = tx.objectStore('offline_fiscal_queue');
          const req = store.getAll();

          req.onsuccess = () => {
            const all: OfflineFiscalQueueItem[] = req.result || [];
            const pending = all.filter(i => {
              if (i.status !== 'SIN_INTERNET_PENDIENTE') return false;
              const isFE = i.documentType === '01';
              const cutoff = isFE ? minDateFE : minDateTE;
              const itemDate = i.saleData?.date || (i.createdAt ? i.createdAt.slice(0, 10) : '');
              if (!itemDate || itemDate < cutoff) {
                try { store.delete(i.id); } catch {}
                return false;
              }
              return true;
            });
            resolve(pending);
          };

          req.onerror = () => reject(req.error);
        });
      });
    } catch {
      return [];
    }
  }

  public async markDocumentSynced(numericKey: string): Promise<void> {
    try {
      await this.withTransaction('offline_fiscal_queue', 'readwrite', (tx) => {
        return new Promise<void>((resolve, reject) => {
          const store = tx.objectStore('offline_fiscal_queue');
          const req = store.get(numericKey);

          req.onsuccess = () => {
            const item: OfflineFiscalQueueItem = req.result;
            if (item) {
              item.status = 'SYNCED';
              store.put(item);
            }
            resolve();
          };

          req.onerror = () => reject(req.error);
        });
      });
    } catch (e) {
      console.warn('[OfflineStorage] Error marcando documento como sincronizado:', e);
    }
  }

  public async markDocumentSyncError(numericKey: string, errorMsg: string): Promise<void> {
    try {
      await this.withTransaction('offline_fiscal_queue', 'readwrite', (tx) => {
        return new Promise<void>((resolve, reject) => {
          const store = tx.objectStore('offline_fiscal_queue');
          const req = store.get(numericKey);

          req.onsuccess = () => {
            const item: OfflineFiscalQueueItem = req.result;
            if (item) {
              item.status = 'SYNC_ERROR';
              item.syncAttempts = (item.syncAttempts || 0) + 1;
              item.lastSyncError = errorMsg;
              store.put(item);
            }
            resolve();
          };

          req.onerror = () => reject(req.error);
        });
      });
    } catch (e) {
      console.warn('[OfflineStorage] Error registrando error de sincronización:', e);
    }
  }

  // ==========================================
  // OFFLINE OUTBOX (SALES CACHE EN INDEXEDDB)
  // ==========================================

  public async saveOfflineSale(sale: Sale): Promise<void> {
    try {
      await this.withTransaction('offline_sales', 'readwrite', (tx) => {
        return new Promise<void>((resolve, reject) => {
          const store = tx.objectStore('offline_sales');
          const req = store.put(sale);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      });
    } catch (e) {
      console.warn('[OfflineStorage] Error guardando venta en outbox IndexedDB:', e);
    }
  }

  public async saveOfflineSalesBatch(sales: Sale[]): Promise<void> {
    if (!Array.isArray(sales) || sales.length === 0) return;
    try {
      await this.withTransaction('offline_sales', 'readwrite', (tx) => {
        return new Promise<void>((resolve, reject) => {
          const store = tx.objectStore('offline_sales');
          for (const sale of sales) {
            if (!sale || !sale.id) continue;
            if (sale.syncedToCloud !== false && !sale.offlineCreated && (sale.xmlEmitted || sale.xmlHaciendaResponse)) {
              const { xmlEmitted, xmlHaciendaResponse, ...lightSale } = sale;
              store.put(lightSale);
            } else {
              store.put(sale);
            }
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      });
    } catch (e) {
      console.warn('[OfflineStorage] Error guardando lote de ventas en IndexedDB:', e);
    }
  }

  public async getOfflineSales(): Promise<Sale[]> {
    const FISCAL_RULES_START_DATE = '2026-10-23';
    const rawYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rawOneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const minDateTE = rawYesterday < FISCAL_RULES_START_DATE ? FISCAL_RULES_START_DATE : rawYesterday;
    const minDateFE = rawOneWeekAgo < FISCAL_RULES_START_DATE ? FISCAL_RULES_START_DATE : rawOneWeekAgo;
    try {
      return await this.withTransaction('offline_sales', 'readwrite', (tx) => {
        return new Promise((resolve, reject) => {
          const store = tx.objectStore('offline_sales');
          const req = store.getAll();
          req.onsuccess = () => {
            const all: Sale[] = req.result || [];
            const valid = all.filter(s => {
              if (!s) return false;
              const isFE = s.electronicDocumentType === '01' || Boolean(s.customerIdentification && s.customerIdentification !== '000000000' && s.customerId !== 'cust-final');
              const cutoff = isFE ? minDateFE : minDateTE;
              const sDate = s.date || (s.createdAt ? s.createdAt.slice(0, 10) : '');
              if (!sDate || sDate < cutoff || s.haciendaStatus === 'CONTINGENCIA_VENCIDA') {
                if (s.id) {
                  try { store.delete(s.id); } catch {}
                }
                return false;
              }
              return true;
            });
            resolve(valid);
          };
          req.onerror = () => reject(req.error);
        });
      });
    } catch {
      return [];
    }
  }

  public async deleteOfflineSale(saleId: string): Promise<void> {
    try {
      await this.withTransaction('offline_sales', 'readwrite', (tx) => {
        return new Promise<void>((resolve, reject) => {
          const store = tx.objectStore('offline_sales');
          const req = store.delete(saleId);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      });
    } catch (e) {
      console.warn('[OfflineStorage] Error eliminando venta de outbox IndexedDB:', e);
    }
  }

  // ==========================================
  // FAST CATALOG CACHE (INDEXEDDB)
  // ==========================================
  public async cacheCatalog(data: { categories?: any[]; products?: any[]; customers?: any[] }): Promise<void> {
    try {
      await this.withTransaction('terminal_config', 'readwrite', (tx) => {
        const store = tx.objectStore('terminal_config');
        if (data.categories) store.put({ key: 'catalog_categories', value: data.categories, updatedAt: Date.now() });
        if (data.products) store.put({ key: 'catalog_products', value: data.products, updatedAt: Date.now() });
        if (data.customers) store.put({ key: 'catalog_customers', value: data.customers, updatedAt: Date.now() });
      });
    } catch (e) {
      console.warn('[OfflineStorage] Error guardando catálogo en caché:', e);
    }
  }

  public async getCachedCatalog(): Promise<{ categories?: any[]; products?: any[]; customers?: any[] }> {
    try {
      return await this.withTransaction('terminal_config', 'readonly', (tx) => {
        return new Promise((resolve) => {
          const store = tx.objectStore('terminal_config');
          const result: { categories?: any[]; products?: any[]; customers?: any[] } = {};
          let pending = 3;
          const checkDone = () => {
            pending--;
            if (pending <= 0) resolve(result);
          };

          const LEGACY_TEST_CAT_IDS = new Set([
            'cat-pollo', 'cat-combos', 'cat-piezas', 'cat-hamburguesas',
            'cat-papas', 'cat-adicionales', 'cat-refrescos', 'cat-calientes', 'cat-express'
          ]);

          const reqCats = store.get('catalog_categories');
          reqCats.onsuccess = () => {
            if (Array.isArray(reqCats.result?.value)) {
              const filteredCats = reqCats.result.value.filter(
                (c: any) => c && c.id && !LEGACY_TEST_CAT_IDS.has(c.id)
              );
              if (filteredCats.length > 0) result.categories = filteredCats;
            }
            checkDone();
          };
          reqCats.onerror = () => checkDone();

          const reqProds = store.get('catalog_products');
          reqProds.onsuccess = () => {
            if (Array.isArray(reqProds.result?.value)) {
              const filteredProds = reqProds.result.value.filter(
                (p: any) => p && p.id && !/^p-\d+$/.test(String(p.id))
              );
              if (filteredProds.length > 0) result.products = filteredProds;
            }
            checkDone();
          };
          reqProds.onerror = () => checkDone();

          const reqCusts = store.get('catalog_customers');
          reqCusts.onsuccess = () => {
            if (reqCusts.result?.value) result.customers = reqCusts.result.value;
            checkDone();
          };
          reqCusts.onerror = () => checkDone();
        });
      });
    } catch {
      return {};
    }
  }
}

export const offlineStorage = new OfflineStorageService();

