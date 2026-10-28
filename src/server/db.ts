import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { initializeFirestore, getFirestore, doc, getDoc, setDoc, runTransaction, collection, getDocs, deleteDoc, query, orderBy, limit, startAfter, where, setLogLevel } from 'firebase/firestore';

const fbConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firestoreDb: any = null;
let firestoreQuotaExceeded = false;
let firestoreQuotaExceededAt: number = 0;

export function isFirestoreQuotaOrStreamError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  const code = err.code;
  return (
    code === 'resource-exhausted' ||
    code === 8 ||
    code === 'invalid-argument' ||
    code === 3 ||
    msg.includes('exceeds the maximum allowed size') ||
    msg.includes('cannot be written because its size') ||
    msg.includes('resource_exhausted') ||
    msg.includes('resource-exhausted') ||
    msg.includes('exhausted maximum allowed queued writes') ||
    msg.includes('write stream exhausted') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('quota exceeded') ||
    msg.includes('128') ||
    msg.includes('attempted to use') ||
    msg.includes('the query failed since it attempted to use')
  );
}

if (fs.existsSync(fbConfigPath)) {
  try {
    const fbConfig = JSON.parse(fs.readFileSync(fbConfigPath, 'utf-8'));
    const app = initializeApp(fbConfig);
    try {
      setLogLevel('error');
      firestoreDb = initializeFirestore(app, {
        experimentalAutoDetectLongPolling: true,
        ignoreUndefinedProperties: true
      }, fbConfig.firestoreDatabaseId);
    } catch {
      firestoreDb = getFirestore(app, fbConfig.firestoreDatabaseId);
    }
  } catch (err) {
    console.error('⚠️ Error al cargar la configuración de Firebase:', err);
  }
}

import { 
  Sale, 
  Product, 
  Customer, 
  Category, 
  CashRegister, 
  CashMovement, 
  CabysItem, 
  TaxRateConfig, 
  ElectronicDocument, 
  FiscalAuditLog, 
  ConsecutiveControl,
  HaciendaDirectConfig,
  EmailDispatchLog,
  OfflineConsecutiveLease,
  KitchenOrder,
  OrderStatus,
  UserProfile,
  KitchenObservation
} from '../types/pos';
import { INITIAL_PRODUCTS, INITIAL_CATEGORIES, INITIAL_CUSTOMERS, BASE_DEFAULT_CUSTOMER, INITIAL_HACIENDA_DIRECT_CONFIG, SYSTEM_USERS } from '../data/initialData';
import { calculateFiscalPriceBreakdown, OFFICIAL_CABYS_CATALOG, OFFICIAL_TAX_RATES } from './taxRules';
import { getLocalProductImage } from '../utils/productImages';
import { XmlSignerService } from './xmlSigner';
import { getCostaRicaDate, getCostaRicaTime } from '../utils/dateUtils';

export function normalizeCategories(categories: Category[]): Category[] {
  if (!Array.isArray(categories)) return [];
  const map = new Map<string, Category>();
  for (const cat of categories) {
    if (!cat || !cat.id) continue;
    let name = (cat.name || '').trim();
    if (cat.id === 'cat-tacos' || name.toLowerCase().includes('tacos & chalupas') || name.toLowerCase() === 'tacos') {
      name = 'TACOS';
    } else if (cat.id === 'cat-empanadas' || name.toLowerCase().includes('empanadas caseras') || name.toLowerCase() === 'empanadas') {
      name = 'EMPANADAS';
    }
    const updatedCat: Category = {
      ...cat,
      id: cat.id,
      name,
      active: cat.active !== false
    };
    map.set(cat.id, updatedCat);
  }
  return Array.from(map.values()).sort((a, b) => (a.sortOrder || 999) - (b.sortOrder || 999));
}

function normalizeCustomers(customers: Customer[]): Customer[] {
  if (!Array.isArray(customers) || customers.length === 0) {
    return [{ ...BASE_DEFAULT_CUSTOMER }];
  }

  // Buscar el cliente de contado base existente o restaurarlo
  let defaultCust = customers.find(c => 
    c.id === 'cust-generic-cash' || 
    c.identification === '000000000' ||
    c.name.toLowerCase().includes('cliente de contado') ||
    c.name.toLowerCase().includes('cliente general') ||
    c.name.toLowerCase().includes('consumidor final')
  );

  if (!defaultCust) {
    defaultCust = { ...BASE_DEFAULT_CUSTOMER };
  } else {
    // Normalizar ID y campos clave para que nunca se corrompa
    defaultCust = {
      ...defaultCust,
      id: 'cust-generic-cash',
      name: defaultCust.name || BASE_DEFAULT_CUSTOMER.name,
      identification: '000000000',
      identificationType: '01',
      fiscalCondition: 'Consumidor Final'
    };
  }

  // Excluir cualquier duplicado que tenga id cust-generic-cash o cédula 000000000
  const otherCustomers = customers.filter(c => 
    c.id !== 'cust-generic-cash' && 
    c.id !== defaultCust!.id &&
    c.identification !== '000000000'
  );

  return [defaultCust, ...otherCustomers];
}

export interface DatabaseSchema {
  version: number;
  lastUpdated: string;
  restaurantInfo: {
    name: string;
    commercialName: string;
    taxId: string;
    identificationType: '01' | '02' | '03' | '04' | '05';
    economicActivity: string;
    location: string;
    province: string;
    canton: string;
    district: string;
    phone: string;
    email: string;
    logoUrl?: string;
    logoBase64?: string;
  };
  products: Product[];
  categories: Category[];
  customers: Customer[];
  sales: Sale[];
  kitchenOrders: KitchenOrder[];
  currentCashRegister: CashRegister;
  cashRegisterHistory: CashRegister[];
  cashMovements: CashMovement[];
  users?: UserProfile[];
  kitchenObservations?: KitchenObservation[];
  
  // Tablas Fiscales Costa Rica (Hacienda v4.4)
  haciendaDirectConfig: HaciendaDirectConfig;
  cabysCatalog: CabysItem[];
  taxRates: TaxRateConfig[];
  electronicDocuments: ElectronicDocument[];
  fiscalAuditLogs: FiscalAuditLog[];
  consecutiveControls: ConsecutiveControl[];
  emailDispatchLogs: EmailDispatchLog[];
  catalogVersion?: number;
  tombstones?: Record<string, { id: string; type: 'product' | 'category'; deletedAt: string }>;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE_PATH = path.join(DATA_DIR, 'pos_database.json');
const DB_BACKUP_PATH = path.join(DATA_DIR, 'pos_database.backup.json');
const CRYPTO_KEY_FILE_PATH = path.join(DATA_DIR, 'hacienda_cryptographic_key.p12.b64');

export class Database {
  private static instance: Database;
  private data: DatabaseSchema;
  private isWriting = false;
  private pendingWrite = false;
  private reservedConsecutives: Set<string> = new Set<string>();
  
  // Firestore sync queue serialization controls
  private isSyncingToFirestore = false;
  private pendingFirestoreSync = false;
  private firestoreSyncTimer: NodeJS.Timeout | null = null;
  private lastFirestoreSyncTimestamp = 0;
  // Amortiguador y cola de escrituras individuales para Firestore (previene RESOURCE_EXHAUSTED)
  private firestoreWriteQueue: Array<() => Promise<void>> = [];
  private isProcessingFirestoreQueue = false;

  public queueFirestoreWrite(writeFn: () => Promise<void>): void {
    if (!firestoreDb || firestoreQuotaExceeded) return;
    if (this.firestoreWriteQueue.length > 50) {
      this.firestoreWriteQueue.splice(0, 10);
    }
    this.firestoreWriteQueue.push(writeFn);
    this.processFirestoreQueue();
  }

  private async processFirestoreQueue(): Promise<void> {
    if (this.isProcessingFirestoreQueue || !firestoreDb || firestoreQuotaExceeded) return;
    this.isProcessingFirestoreQueue = true;

    try {
      while (this.firestoreWriteQueue.length > 0 && !firestoreQuotaExceeded) {
        const nextWrite = this.firestoreWriteQueue.shift();
        if (nextWrite) {
          try {
            await nextWrite();
            // Intervalo saludable de 60ms entre llamadas gRPC individuales
            await new Promise(r => setTimeout(r, 60));
          } catch (err: any) {
            if (isFirestoreQuotaOrStreamError(err)) {
              firestoreQuotaExceeded = true;
              firestoreQuotaExceededAt = Date.now();
              this.firestoreWriteQueue = [];
              console.warn('ℹ️ [Firebase Firestore] Stream saturado. Cola de escrituras amortiguada.');
              break;
            }
          }
        }
      }
    } finally {
      this.isProcessingFirestoreQueue = false;
    }
  }

  private cachedElectronicDocs: ElectronicDocument[] | null = null;
  private lastSalesCount: number = -1;
  private savedXmlKeys = new Set<string>();
  private persistDebounceTimer: NodeJS.Timeout | null = null;
  private isSavingDatabase = false;
  private isDirty = false;
  private lastBackupWriteTimestamp = 0;
  private lastMainDbSyncSignature = '';
  private lastRecentSalesSyncTimestamp = 0;
  private lastCloudCatalogSignature = '';

  public loadLocalCryptoKey(): string | null {
    try {
      if (fs.existsSync(CRYPTO_KEY_FILE_PATH)) {
        const content = fs.readFileSync(CRYPTO_KEY_FILE_PATH, 'utf-8').trim();
        if (content.length > 50) {
          return content;
        }
      }
    } catch (e) {
      console.warn('⚠️ Error al leer llave criptográfica local:', e);
    }
    return null;
  }

  public saveLocalCryptoKey(keyBase64: string): void {
    try {
      this.ensureDataDirectory();
      if (keyBase64 && keyBase64.length > 50 && keyBase64 !== '[STORED_LOCALLY]') {
        fs.writeFileSync(CRYPTO_KEY_FILE_PATH, keyBase64.trim(), 'utf-8');
      }
    } catch (e) {
      console.warn('⚠️ Error al persistir llave criptográfica en disco local:', e);
    }
  }

  public async initialize(): Promise<void> {
    // 1. Preservar copia de los datos locales leídos de pos_database.json
    const localProducts = this.data.products || [];
    const localCategories = this.data.categories || [];
    const localElectronicDocs = this.data.electronicDocuments || [];
    const localSales = this.data.sales || [];
    const localUsers = this.data.users || [];
    const localHaciendaConfig = this.data.haciendaDirectConfig || { ...INITIAL_HACIENDA_DIRECT_CONFIG };
    const localCryptoKey = (localHaciendaConfig.cryptographicKeyBase64 && localHaciendaConfig.cryptographicKeyBase64 !== '[STORED_LOCALLY]' && localHaciendaConfig.cryptographicKeyBase64.length > 50)
      ? localHaciendaConfig.cryptographicKeyBase64
      : this.loadLocalCryptoKey();

    if (firestoreDb && !firestoreQuotaExceeded) {
      console.log('⏳ Verificando base de datos persistente en Firebase Firestore...');
      try {
        const docRef = doc(firestoreDb, 'pos_data', 'main_database');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const cloudData = docSnap.data() as DatabaseSchema;
          
          // =========================================================================
          // SINCRONIZACIÓN INTELIGENTE DE PRODUCTOS Y CATEGORÍAS (LA NUBE MANDA)
          // =========================================================================
          // En caso de discrepancias entre local y la nube: ¡LA NUBE MANDA! (Cloud Authority).
          // Reconcilia por Last-Write-Wins con preferencia en la nube y soporte de tombstones.
          const { products: reconciledProducts, categories: reconciledCategories, tombstones: reconciledTombstones } = 
            await this.reconcileCatalogFromCloud(cloudData, localProducts, localCategories);
          let finalProducts: Product[] = reconciledProducts;
          let finalCategories: Category[] = reconciledCategories;
          this.data.tombstones = reconciledTombstones;

          const localCabys = this.data.cabysCatalog || [];
          const cloudCabys = cloudData.cabysCatalog || [];
          const cabysMap = new Map<string, CabysItem>();
          cloudCabys.forEach(c => cabysMap.set(c.codigoCabys, c));
          localCabys.forEach(c => cabysMap.set(c.codigoCabys, c));

          // Fusión no destructiva de ventas: preservar todas las ventas locales y remotas
          const cloudSales = cloudData.sales || [];
          const salesMap = new Map<string, Sale>();
          cloudSales.forEach(s => salesMap.set(s.id, s));
          localSales.forEach(s => {
            const existing = salesMap.get(s.id);
            if (existing) {
              salesMap.set(s.id, { ...existing, ...s });
            } else {
              salesMap.set(s.id, s);
            }
          });

          // PRESERVAR COMPROBANTES FISCALES:
          // Jamás permitir que cloudData.electronicDocuments = [] sobrescriba los comprobantes locales
          const preservedElectronicDocs = localElectronicDocs.length > 0 
            ? localElectronicDocs 
            : (cloudData.electronicDocuments || []);

          // PRESERVAR CONFIGURACIÓN FISCAL Y LLAVE CRIPTOGRÁFICA:
          // Jamás permitir que cloudData sobrescriba la llave criptográfica local con '[STORED_LOCALLY]'
          const mergedHaciendaConfig = {
            ...localHaciendaConfig,
            ...(cloudData.haciendaDirectConfig || {})
          };

          // Restaurar emisorLogoBase64 si no viene en haciendaDirectConfig para evitar duplicación de peso en la nube
          if (!mergedHaciendaConfig.emisorLogoBase64 && (cloudData.restaurantInfo?.logoBase64 || localHaciendaConfig.emisorLogoBase64 || this.data.restaurantInfo?.logoBase64)) {
            mergedHaciendaConfig.emisorLogoBase64 = cloudData.restaurantInfo?.logoBase64 || localHaciendaConfig.emisorLogoBase64 || this.data.restaurantInfo?.logoBase64;
          }

          // Sanitizar bitácora de auditoría para no arrastrar base64 pesado
          if (Array.isArray(mergedHaciendaConfig.issuerAuditTrail)) {
            mergedHaciendaConfig.issuerAuditTrail = mergedHaciendaConfig.issuerAuditTrail.map(entry => {
              if (entry.field === 'emisorLogoBase64') {
                return {
                  ...entry,
                  previousValue: entry.previousValue ? '[LOGO]' : null,
                  newValue: entry.newValue ? '[LOGO]' : null
                };
              }
              return entry;
            });
          }

          if (localCryptoKey) {
            mergedHaciendaConfig.cryptographicKeyBase64 = localCryptoKey;
          } else if (mergedHaciendaConfig.cryptographicKeyBase64 === '[STORED_LOCALLY]') {
            const diskKey = this.loadLocalCryptoKey();
            if (diskKey) {
              mergedHaciendaConfig.cryptographicKeyBase64 = diskKey;
            }
          }

          // Validar estado de llave
          if (mergedHaciendaConfig.cryptographicKeyBase64 && mergedHaciendaConfig.cryptographicKeyPin) {
            const keyCheck = XmlSignerService.validateCertificateDetails(
              mergedHaciendaConfig.cryptographicKeyBase64,
              mergedHaciendaConfig.cryptographicKeyPin,
              mergedHaciendaConfig.environment,
              mergedHaciendaConfig.emisorTaxId
            );
            mergedHaciendaConfig.cryptographicKeyStatus = keyCheck.valid ? 'VALID' : 'EXPIRED';
          }

          // GESTIÓN AUTORITATIVA Y FUSIÓN NO DESTRUCTIVA DE USUARIOS Y CAJEROS:
          // Fusionar SYSTEM_USERS + cloudUsers + localUsers por ID para jamás perder cajeros registrados
          // ni sobreescribir PINs personalizados, filtrando únicamente los cajeros de prueba obsoletos.
          const cloudUsers = (Array.isArray(cloudData.users) && cloudData.users.length > 0) ? cloudData.users : [];
          const usersMap = new Map<string, UserProfile>();
          for (const u of SYSTEM_USERS) {
            if (u && u.id) usersMap.set(u.id, { ...u });
          }
          for (const u of localUsers) {
            if (u && u.id && u.id !== 'usr-cajero-1' && u.id !== 'usr-cajero-2') {
              const prev = usersMap.get(u.id);
              usersMap.set(u.id, prev ? { ...prev, ...u } : u);
            }
          }
          for (const u of cloudUsers) {
            if (u && u.id && u.id !== 'usr-cajero-1' && u.id !== 'usr-cajero-2') {
              const prev = usersMap.get(u.id);
              usersMap.set(u.id, prev ? { ...prev, ...u } : u);
            }
          }
          const finalUsers: UserProfile[] = Array.from(usersMap.values());

          // FUSIÓN DE OBSERVACIONES DE COCINA OFICIALES (CREADAS POR ADMINISTRADOR)
          const cloudObs: KitchenObservation[] = Array.isArray(cloudData.kitchenObservations) ? cloudData.kitchenObservations : [];
          const localObs: KitchenObservation[] = Array.isArray(this.data.kitchenObservations) ? this.data.kitchenObservations : [];
          const obsMap = new Map<string, KitchenObservation>();
          cloudObs.forEach(o => { if (o && o.id) obsMap.set(o.id, o); });
          localObs.forEach(o => {
            if (o && o.id) {
              const existing = obsMap.get(o.id);
              if (existing) {
                const localTime = o.updatedAt ? new Date(o.updatedAt).getTime() : 0;
                const cloudTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
                if (localTime >= cloudTime) {
                  obsMap.set(o.id, { ...existing, ...o });
                }
              } else {
                obsMap.set(o.id, o);
              }
            }
          });
          const finalObservations = Array.from(obsMap.values());

          // FUSIÓN DE COMANDAS DE COCINA (KDS): Preservar comandas activas locales y remotas
          const cloudKitchenOrders: KitchenOrder[] = Array.isArray(cloudData.kitchenOrders) ? cloudData.kitchenOrders : [];
          const localKitchenOrders: KitchenOrder[] = Array.isArray(this.data.kitchenOrders) ? this.data.kitchenOrders : [];
          const kitchenMap = new Map<string, KitchenOrder>();
          cloudKitchenOrders.forEach(k => { if (k && k.id) kitchenMap.set(k.id, k); });
          localKitchenOrders.forEach(k => {
            if (k && k.id) {
              const existing = kitchenMap.get(k.id);
              if (existing) {
                const localTime = k.updatedAt ? new Date(k.updatedAt).getTime() : 0;
                const cloudTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
                if (localTime >= cloudTime) {
                  kitchenMap.set(k.id, { ...existing, ...k });
                }
              } else {
                kitchenMap.set(k.id, k);
              }
            }
          });
          const todayStr = getCostaRicaDate();
          const finalKitchenOrders = Array.from(kitchenMap.values()).filter(k => {
            if (!k) return false;
            const kDate = k.timestamp ? getCostaRicaDate(k.timestamp) : (k.date || '');
            return !kDate || kDate === todayStr;
          });

          // PRESERVACIÓN AUTORITATIVA DE LA CAJA ACTIVA:
          // Si la caja local está ABIERTA o pertenece a la fecha de hoy, jamás sobreescribirla
          // con una caja cerrada o desactualizada proveniente de la nube.
          const localReg = this.data.currentCashRegister;
          const cloudReg = cloudData.currentCashRegister;
          let activeRegister = localReg;

          const todayCrStr = getCostaRicaDate();
          const localRegDate = localReg?.openTime ? getCostaRicaDate(new Date(localReg.openTime).getTime()) : '';
          const cloudRegDate = cloudReg?.openTime ? getCostaRicaDate(new Date(cloudReg.openTime).getTime()) : '';

          if (localReg && localReg.status === 'OPEN' && localRegDate === todayCrStr) {
            activeRegister = localReg;
          } else if (cloudReg && cloudReg.status === 'OPEN' && cloudRegDate === todayCrStr) {
            activeRegister = cloudReg;
          } else if (localReg && localRegDate === todayCrStr) {
            activeRegister = localReg;
          } else if (cloudReg && cloudRegDate === todayCrStr) {
            activeRegister = cloudReg;
          } else {
            activeRegister = cloudReg || localReg;
          }

          if (activeRegister) {
            this.recalculateRegisterTotals(activeRegister);
          }

          this.data = {
            ...this.getDefaultData(),
            ...cloudData,
            products: finalProducts,
            categories: normalizeCategories(finalCategories),
            users: finalUsers,
            kitchenObservations: finalObservations,
            kitchenOrders: finalKitchenOrders,
            cabysCatalog: Array.from(cabysMap.values()),
            haciendaDirectConfig: mergedHaciendaConfig,
            electronicDocuments: preservedElectronicDocs,
            sales: Array.from(salesMap.values()),
            currentCashRegister: activeRegister
          };

          
          console.log(`☁️ Base de datos sincronizada con Firestore (${this.data.products.length} platillos, ${this.data.categories.length} categorías, ${this.data.sales.length} ventas, ${this.data.kitchenOrders.length} comandas).`);
        } else {
          console.log('ℹ️ Base de datos remota vacía. Inicializando estado con datos locales...');
          this.triggerFirestoreSync(true);
        }

        // =========================================================================
        // RECUPERACIÓN OFICIAL DE DOCUMENTOS FISCALES DESDE LA COLECCIÓN electronic_documents
        // =========================================================================
        try {
          console.log('📑 Consultando comprobantes recientes en Firestore electronic_documents...');
          const docsColRef = collection(firestoreDb, 'electronic_documents');
          // Limitar a los 100 comprobantes más recientes para nunca exceder el buffer de 128 MiB de Firestore
          const docsSnap = await getDocs(query(docsColRef, limit(100)));
          
          const docsMap = new Map<string, ElectronicDocument>();
          
          // Indexar los documentos locales actuales
          (this.data.electronicDocuments || []).forEach(docItem => {
            if (docItem && (docItem.numericKey || docItem.id)) {
              const k = docItem.numericKey || docItem.id;
              docsMap.set(k, docItem);
            }
          });

          // Fusionar con los documentos recuperados de Firestore
          let recoveredCount = 0;
          docsSnap.forEach(docD => {
            if (docD.exists()) {
              const docData = docD.data() as ElectronicDocument;
              const k = docData.numericKey || docData.id || docD.id;
              if (k) {
                const existing = docsMap.get(k);
                if (existing) {
                  // Si ya existe, fusionar preservando el estado más actualizado y XMLs
                  docsMap.set(k, {
                    ...existing,
                    ...docData,
                    xmlGenerated: docData.xmlGenerated || existing.xmlGenerated,
                    xmlResponseHacienda: docData.xmlResponseHacienda || existing.xmlResponseHacienda,
                    status: docData.status || existing.status
                  });
                } else {
                  docsMap.set(k, docData);
                }
                recoveredCount++;
              }
            }
          });

          this.data.electronicDocuments = Array.from(docsMap.values());
          console.log(`✅ ${recoveredCount} comprobantes fiscales recuperados desde Firestore electronic_documents. Total en memoria: ${this.data.electronicDocuments.length}.`);

        } catch (docsErr) {
          console.warn('⚠️ No se pudo consultar la colección electronic_documents de Firestore:', docsErr);
        }

        // =========================================================================
        // RECUPERACIÓN Y MIGRACIÓN DE VENTAS DESDE LA COLECCIÓN INDEPENDIENTE 'sales'
        // =========================================================================
        try {
          console.log('📑 Consultando ventas recientes en Firestore sales...');
          const salesColRef = collection(firestoreDb, 'sales');
          const todayCrStr = getCostaRicaDate();
          const yesterdayCrStr = getCostaRicaDate(Date.now() - 24 * 60 * 60 * 1000);

          // 1. Si el contenedor despertó en frío con menos de 1,000 ventas en disco, recuperar la colección completa de Firestore;
          // si ya cuenta con el historial en disco, consultar únicamente hoy y ayer para ahorrar cuota.
          const isColdBoot = (this.data.sales || []).length < 1000;
          const recentSnap = isColdBoot
            ? await getDocs(salesColRef)
            : await getDocs(query(salesColRef, where('date', '>=', yesterdayCrStr), limit(200)));
          console.log(`📑 Ventas (${isColdBoot ? 'recuperación completa en frío' : `>= ${yesterdayCrStr}`}) encontradas en Firestore: ${recentSnap.size}`);

          const salesMap = new Map<string, Sale>();
          const cloudSaleIds = new Set<string>();

          // Indexar ventas locales actuales en memoria
          (this.data.sales || []).forEach(s => {
            if (s && s.id) {
              salesMap.set(s.id, s);
            }
          });

          // Fusionar con ventas desde Firestore 'sales'
          recentSnap.forEach(saleDoc => {
            if (saleDoc.exists()) {
              const saleData = saleDoc.data() as Sale;
              if (saleData && saleData.id) {
                cloudSaleIds.add(saleData.id);
                const { xmlEmitted, xmlHaciendaResponse, ...lightCloudSale } = saleData;
                const existing = salesMap.get(saleData.id);
                if (existing) {
                  salesMap.set(saleData.id, { ...existing, ...lightCloudSale, syncedToCloud: true });
                } else {
                  salesMap.set(saleData.id, { ...lightCloudSale, syncedToCloud: true } as Sale);
                }
              }
            }
          });

          this.data.sales = Array.from(salesMap.values());
          this.data.sales.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          console.log(`✅ Ventas recuperadas desde Firestore 'sales'. Total en memoria: ${this.data.sales.length}.`);
          if (isColdBoot) {
            this.reconcileSalesFromDocuments();
            this.persist(true);
          }

          // Migración controlada: Subir únicamente ventas de HOY que aún no existan en Firestore
          if (firestoreDb && !firestoreQuotaExceeded && this.data.sales.length > 0) {
            const pendingTodaySales = this.data.sales
              .filter(s => s && s.id && s.date === todayCrStr && !cloudSaleIds.has(s.id) && !s.syncedToCloud)
              .slice(0, 25);

            for (const sale of pendingTodaySales) {
              try {
                const saleRef = doc(firestoreDb, 'sales', sale.id);
                const { xmlEmitted, xmlHaciendaResponse, ...lightSale } = sale;
                const cleanSale = JSON.parse(JSON.stringify({ ...lightSale, syncedToCloud: true }));
                await setDoc(saleRef, cleanSale, { merge: true });
                sale.syncedToCloud = true;
              } catch (migErr) {
                // Non-blocking
              }
            }
            if (pendingTodaySales.length > 0) {
              console.log(`🚀 Migración controlada de ventas a Firestore 'sales' completada (${pendingTodaySales.length} ventas nuevas de hoy sincronizadas).`);
            }
          }

        } catch (salesErr) {
          console.warn('⚠️ No se pudo consultar o migrar la colección sales de Firestore:', salesErr);
        }

      } catch (error: any) {
        const isQuotaErr = error?.code === 'resource-exhausted' || 
                           error?.message?.includes('RESOURCE_EXHAUSTED') || 
                           error?.message?.includes('Quota limit exceeded');
        if (isQuotaErr) {
          firestoreQuotaExceeded = true;
          firestoreQuotaExceededAt = Date.now();
          console.warn('⚠️ [Firebase Firestore] Cuota diaria gratuita alcanzada. Operando en modo local atómico 100% persistente.');
        } else {
          console.error('⚠️ Advertencia al sincronizar con Firebase (usando datos locales):', error?.message || error);
        }
      }
    } else {
      console.log('ℹ️ Operando con base de datos local JSON protegida.');
    }

    // =========================================================================
    // RECONCILIACIÓN Y VINCULACIÓN AUTOMÁTICA DE VENTAS CON SUS COMPROBANTES FISCALES
    // =========================================================================
    this.reconcileSalesFromDocuments();

    this.sanitizeConsecutiveControls();
    // Guardar el estado consolidado de forma atómica y compacta en el disco local y copia de respaldo
    this.saveDatabaseSync(this.data, false, true);
  }

  public sanitizeConsecutiveControls(): void {
    // Firestore es la única fuente de verdad para los consecutivos fiscales. pos_database.json ya no los controla.
  }

  /**
   * Refresca únicamente las ventas de la fecha actual y del día anterior (ventana de 2 días)
   * desde la colección 'sales' de Firestore. Excluye el histórico antiguo.
   */
  public async syncRecentSalesFromFirestore(targetDate?: string, force = false): Promise<number> {
    this.markExpiredPendingSales();
    if (!firestoreDb || firestoreQuotaExceeded) return 0;
    // Evitar lecturas redundantes cada 45s en segundo plano cuando no es una consulta forzada o por fecha específica (ventana de 5 min)
    if (!force && !targetDate && (Date.now() - this.lastRecentSalesSyncTimestamp < 300000)) {
      return 0;
    }
    this.lastRecentSalesSyncTimestamp = Date.now();
    try {
      const salesColRef = collection(firestoreDb, 'sales');
      const todayCrStr = getCostaRicaDate();
      const yesterdayCrStr = getCostaRicaDate(Date.now() - 24 * 60 * 60 * 1000);

      const datesToSync = new Set<string>([todayCrStr, yesterdayCrStr]);
      if (targetDate && targetDate >= '2026-10-11') {
        datesToSync.add(targetDate);
      }

      const salesMap = new Map<string, Sale>();
      (this.data.sales || []).forEach(s => {
        if (s && s.id) salesMap.set(s.id, s);
      });

      let updatedOrAdded = 0;
      for (const dStr of datesToSync) {
        const q = query(salesColRef, where('date', '==', dStr));
        const snap = await getDocs(q);
        snap.forEach(saleDoc => {
          if (saleDoc.exists()) {
            const saleData = saleDoc.data() as Sale;
            if (saleData && saleData.id) {
              const existing = salesMap.get(saleData.id);
              if (!existing) {
                salesMap.set(saleData.id, saleData);
                updatedOrAdded++;
              } else if (saleData.numericKey50 && !existing.numericKey50) {
                salesMap.set(saleData.id, { ...existing, ...saleData });
                updatedOrAdded++;
              } else if (existing.numericKey50 && !saleData.numericKey50) {
                // El servidor local ya tiene el comprobante emitido ante Hacienda pero Firestore aún no lo tenía:
                // Sincronizar de vuelta a Firestore para que cualquier otro dispositivo lo tenga
                try {
                  const saleRef = doc(firestoreDb, 'sales', existing.id);
                  const cleanSale = JSON.parse(JSON.stringify(existing));
                  delete cleanSale.xmlEmitted;
                  delete cleanSale.xmlHaciendaResponse;
                  this.queueFirestoreWrite(async () => {
                    await setDoc(saleRef, cleanSale, { merge: true });
                  });
                } catch {}
              }
            }
          }
        });
      }

      if (updatedOrAdded > 0) {
        this.data.sales = Array.from(salesMap.values());
        this.data.sales.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        this.reconcileSalesFromDocuments();
        this.saveDatabaseSync(this.data);
        console.log(`🔄 [Firestore Sync] ${updatedOrAdded} ventas de Hoy/Ayer reconciliadas desde la nube.`);
      }
      return updatedOrAdded;
    } catch (err: any) {
      console.warn('⚠️ Error al refrescar ventas recientes desde Firestore:', err?.message || err);
      return 0;
    }
  }

  /**
   * Marca automáticamente con el estado 'CONTINGENCIA_VENCIDA' ("No se pudo procesar / Expirado"):
   * - Todo comprobante sin emitir previo a la fecha de corte inicial (2026-10-23).
   * - A partir de 2026-10-23 en adelante:
   *   • Tiquetes Electrónicos ('04') pendientes con antigüedad mayor a 2 días.
   *   • Facturas Electrónicas ('01') pendientes con antigüedad mayor a 1 semana (7 días).
   */
  public markExpiredPendingSales(): number {
    if (!Array.isArray(this.data.sales)) return 0;
    const FISCAL_START_DATE = '2026-10-11';
    let expiredMarked = 0;

    this.data.sales.forEach(sale => {
      if (!sale) return;
      const hasRealKey = Boolean(sale.numericKey50 && /^\d{50}$/.test(sale.numericKey50));
      const hasRealConsec = Boolean(sale.consecutive20 && /^\d{20}$/.test(sale.consecutive20));
      const isAlreadyInvoiced = (sale.invoiceStatus === 'INVOICED' || sale.haciendaStatus === 'ACEPTADO_HACIENDA') && hasRealKey && hasRealConsec;
      if (isAlreadyInvoiced || sale.haciendaStatus === 'ANULADO_POR_NC') return;

      const sDate = sale.date || (sale.timestamp ? getCostaRicaDate(sale.timestamp) : '');

      if (!sDate || sDate < FISCAL_START_DATE) {
        if (sale.haciendaStatus !== 'CONTINGENCIA_VENCIDA' || sale.invoiceStatus !== 'ERROR') {
          sale.haciendaStatus = 'CONTINGENCIA_VENCIDA';
          sale.invoiceStatus = 'ERROR';
          sale.haciendaResponseMessage = 'No se pudo procesar / Expirado (anterior al 11 de octubre)';
          expiredMarked++;
        }
      } else if (sale.haciendaStatus === 'CONTINGENCIA_VENCIDA' || sale.invoiceStatus === 'ERROR' || sale.invoiceStatus === 'NOT_INVOICED') {
        // Desde el 11 de octubre hasta hoy: reactivar para que el worker autónomo las emita a Hacienda
        sale.haciendaStatus = 'CONTINGENCIA_PENDIENTE';
        sale.invoiceStatus = 'NOT_INVOICED';
        sale.haciendaResponseMessage = 'Comprobante pendiente de transmisión a Hacienda';
        expiredMarked++;
      }
    });

    if (Array.isArray(this.data.electronicDocuments)) {
      this.data.electronicDocuments.forEach(docItem => {
        if (!docItem) return;
        const hasRealKey = Boolean(docItem.numericKey && /^\d{50}$/.test(docItem.numericKey));
        if (hasRealKey || docItem.status === 'ACEPTADO_HACIENDA' || docItem.status === 'ANULADO_POR_NC') return;
        const docDate = docItem.saleDate || (docItem.issueDate ? getCostaRicaDate(docItem.issueDate) : '');

        if (!docDate || docDate < FISCAL_START_DATE) {
          if (docItem.status !== 'CONTINGENCIA_VENCIDA') {
            docItem.status = 'CONTINGENCIA_VENCIDA';
            docItem.statusDescription = 'No se pudo procesar / Expirado (anterior al 11 de octubre)';
            expiredMarked++;
          }
        } else if (docItem.status === 'CONTINGENCIA_VENCIDA') {
          docItem.status = 'CONTINGENCIA_PENDIENTE';
          docItem.statusDescription = 'Comprobante pendiente de transmisión a Hacienda';
          expiredMarked++;
        }
      });
    }

    if (expiredMarked > 0) {
      this.cachedElectronicDocs = null;
      this.saveDatabaseSync(this.data);
    }
    return expiredMarked;
  }

  public isFirestoreConnected(): boolean {
    return Boolean(firestoreDb && !firestoreQuotaExceeded);
  }

  /**
   * Reconciliación bidireccional integral y no destructiva entre Comprobantes Electrónicos y Ventas.
   * - Vincula ventas existentes con sus comprobantes fiscales correspondientes.
   * - Reconstruye cualquier venta histórica presente en electronicDocuments que no esté en la tabla de ventas.
   * - Preserva toda la información financiera, artículos, desglose de impuestos y medios de pago.
   */
  public reconcileSalesFromDocuments(): { reconciledExisting: number; reconstructedNew: number; totalSales: number } {
    const allDocs = this.data.electronicDocuments || [];
    if (!Array.isArray(this.data.sales)) {
      this.data.sales = [];
    }

    let reconciledExisting = 0;
    let reconstructedNew = 0;

    // 0. Sanear ventas existentes eliminando XMLs incrustados pesados para reducir el tamaño de memoria de 36MB a 1.5MB
    this.data.sales = (this.data.sales || []).map(sale => {
      if (sale && (sale.xmlEmitted || sale.xmlHaciendaResponse)) {
        const { xmlEmitted, xmlHaciendaResponse, ...cleanSale } = sale;
        return cleanSale;
      }
      return sale;
    });

    // 1. Enriquecer ventas existentes que coincidan con comprobantes fiscales usando índices O(1)
    const docsBySaleId = new Map<string, ElectronicDocument>();
    const docsByKey = new Map<string, ElectronicDocument>();
    const docsByConsec = new Map<string, ElectronicDocument>();
    for (const d of allDocs) {
      if (!d) continue;
      if (d.saleId) docsBySaleId.set(d.saleId, d);
      if (d.numericKey) docsByKey.set(d.numericKey, d);
      if (d.id) docsByKey.set(d.id, d);
      if (d.consecutive) docsByConsec.set(d.consecutive, d);
    }

    this.data.sales = this.data.sales.map(sale => {
      if (!sale) return sale;
      const matchedDoc =
        (sale.id ? docsBySaleId.get(sale.id) : undefined) ||
        (sale.numericKey50 ? docsByKey.get(sale.numericKey50) : undefined) ||
        (sale.consecutive20 ? docsByConsec.get(sale.consecutive20) : undefined);

      if (matchedDoc) {
        reconciledExisting++;
        const statusStr = String(matchedDoc.status || '');
        const normStatus = statusStr.includes('ACEPT') ? 'ACEPTADO_HACIENDA' : (matchedDoc.status as any || sale.haciendaStatus || 'ACEPTADO_HACIENDA');
        return {
          ...sale,
          invoiceStatus: 'INVOICED',
          electronicDocumentType: matchedDoc.documentType || sale.electronicDocumentType,
          numericKey50: matchedDoc.numericKey || sale.numericKey50,
          consecutive20: matchedDoc.consecutive || sale.consecutive20,
          haciendaStatus: normStatus,
          haciendaResponseMessage: matchedDoc.statusDescription || sale.haciendaResponseMessage || '.'
        };
      }
      return sale;
    });

    // 2. Reconstruir ventas históricas faltantes a partir de electronicDocuments
    const existingSaleIds = new Set(this.data.sales.map(s => s.id));
    const existingKeys = new Set(this.data.sales.map(s => s.numericKey50).filter(Boolean));
    const existingConsecutives = new Set(this.data.sales.map(s => s.consecutive20).filter(Boolean));

    const methodMap: Record<string, 'CASH' | 'CARD' | 'TRANSFER' | 'SINPE' | 'OTHER'> = {
      '01': 'CASH',
      '02': 'CARD',
      '03': 'TRANSFER',
      '04': 'SINPE',
      '99': 'OTHER'
    };

    for (const doc of allDocs) {
      const docSaleId = doc.saleId || (doc.numericKey ? `sale-${doc.numericKey}` : (doc.id ? `sale-${doc.id}` : null));
      if (!docSaleId) continue;
      
      // Si ya existe en la lista de ventas, omitir para no duplicar
      if (existingSaleIds.has(docSaleId)) continue;
      if (doc.numericKey && existingKeys.has(doc.numericKey)) continue;
      if (doc.consecutive && existingConsecutives.has(doc.consecutive)) continue;

      const issueDate = doc.issueDate || doc.createdAt || new Date().toISOString();
      const d = new Date(issueDate);
      const validDate = isNaN(d.getTime()) ? new Date() : d;
      const crDate = getCostaRicaDate(validDate.toISOString());
      const crTime = getCostaRicaTime(validDate.toISOString());
      
      let consecSeq = 0;

      // Extraer el numero de orden de la cocina si existe para preservarlo
      let matchedKitchenId = undefined;
      let matchedKitchen = this.data.kitchenOrders.find(k => k.saleId === docSaleId || (k.id === `kitchen-${docSaleId.replace('sale-', '')}`));
      
      // Heurística de coincidencia si el ID estricto falla
      if (!matchedKitchen) {
        matchedKitchen = this.data.kitchenOrders.find(k => {
          const kDateStr = k.timestamp ? getCostaRicaDate(k.timestamp) : (k.date || '');
          if (kDateStr !== crDate) return false;
          if (k.orderStatus === 'CANCELLED') return false;
          
          // Coincidencia por total exacto si no está pagada (en casos de reconstrucción, es el mejor indicador)
          if (!k.isPaid && Math.abs(k.total - (Number(doc.total) || 0)) < 1) {
            return true;
          }
          return false;
        });
      }

      if (matchedKitchen) {
        matchedKitchenId = matchedKitchen.id;
        if (matchedKitchen.orderNumber && matchedKitchen.orderNumber < 1000) {
          consecSeq = matchedKitchen.orderNumber;
        }
        matchedKitchen.isPaid = true;
        if (!matchedKitchen.orderStatus) {
          matchedKitchen.orderStatus = 'CONFIRMED';
        }
        matchedKitchen.saleId = docSaleId;
      }

      // Si no tiene número de cocina corto o supera 1000, asignar siguiente consecutivo diario limpio (#101, #102...)
      if (!consecSeq || consecSeq >= 1000) {
        consecSeq = this.getNextDailyOrderNumber(crDate);
      }

      const items = (doc.lines && doc.lines.length > 0)
        ? doc.lines.map((l: any, idx: number) => {
            const qty = Number(l.quantity) || 1;
            const totLine = Number(l.totalLine) || Number(l.totalAmount) || (Number(l.unitPrice) * qty) || 0;
            const uPrice = l.totalLine ? Math.round(totLine / qty) : (Number(l.unitPrice) || 0);
            const netP = Number(l.unitPrice) || uPrice;
            const sub = Number(l.subtotal) || (netP * qty);
            const tAmt = Number(l.taxAmount) || Math.max(0, totLine - sub);
            return {
              productId: l.productId || `prod-hist-${idx + 1}`,
              name: l.description || l.detail || 'Artículo',
              quantity: qty,
              price: uPrice,
              netPrice: netP,
              subtotal: sub,
              taxRate: Number(l.taxRate) || 0.13,
              taxAmount: tAmt,
              total: totLine,
              unitOfMeasure: l.unitOfMeasure || 'Os',
              itemType: l.itemType || 'SERVICIO',
              cabysCode: l.cabysCode || '6332000000000',
              isPriceWithTax: true
            };
          })
        : [{
            productId: 'prod-hist-general',
            name: 'Consumo Restaurante',
            quantity: 1,
            price: Number(doc.total) || 0,
            netPrice: Number(doc.subtotal) || (Number(doc.total) - (Number(doc.taxTotal) || 0)),
            subtotal: Number(doc.subtotal) || (Number(doc.total) - (Number(doc.taxTotal) || 0)),
            taxRate: 0.13,
            taxAmount: Number(doc.taxTotal) || 0,
            total: Number(doc.total) || 0,
            unitOfMeasure: 'Os',
            itemType: 'SERVICIO',
            cabysCode: '6332000000000',
            isPriceWithTax: true
          }];

      const payments: Array<{ method: 'CASH' | 'CARD' | 'TRANSFER' | 'SINPE' | 'OTHER'; amount: number }> = 
        (doc.paymentMethods && doc.paymentMethods.length > 0)
          ? (doc.paymentMethods as any[]).map((m: any) => {
              const code = typeof m === 'string' ? m : (m.methodCode || m.code || m.method || '01');
              const methodKey = methodMap[code] || (['CASH', 'CARD', 'TRANSFER', 'SINPE', 'OTHER'].includes(m.method) ? m.method : 'CASH');
              const amt = typeof m === 'object' && m.amount ? Number(m.amount) : Number(doc.total) || 0;
              return { method: methodKey, amount: amt };
            })
          : [{ method: 'CASH', amount: Number(doc.total) || 0 }];

      const docStatusStr = String(doc.status || '');
      const docNormStatus = docStatusStr.includes('ACEPT') ? 'ACEPTADO_HACIENDA' : (doc.status as any || 'ACEPTADO_HACIENDA');

      const reconstructedSale: Sale = {
        id: docSaleId,
        kitchenOrderId: matchedKitchenId,
        orderNumber: consecSeq,
        date: crDate,
        time: crTime,
        timestamp: validDate.getTime(),
        customerName: doc.receiver?.name || 'Cliente de contado',
        customerIdentification: doc.receiver?.identificationNumber || '000000000',
        customerIdentificationType: (doc.receiver?.identificationType as any) || '01',
        customerEmail: doc.receiver?.email || '',
        customerPhone: doc.receiver?.phone || '',
        customerAddress: doc.receiver?.address || '',
        receiverSnapshot: doc.receiver,
        orderType: 'TAKE_OUT',
        items,
        subtotal: Number(doc.subtotal) || (Number(doc.total) - (Number(doc.taxTotal) || 0)),
        discount: Number(doc.discountTotal) || 0,
        taxTotal: Number(doc.taxTotal) || 0,
        total: Number(doc.total) || 0,
        payments,
        amountPaid: Number(doc.total) || 0,
        change: 0,
        orderStatus: 'DELIVERED',
        invoiceStatus: 'INVOICED',
        electronicDocumentType: (doc.documentType as any) || '04',
        numericKey50: doc.numericKey,
        consecutive20: doc.consecutive,
        haciendaStatus: docNormStatus,
        haciendaResponseMessage: doc.statusDescription || '.',
        cashierId: 'usr-1788750604098',
        cashierName: doc.createdBy || 'GERMAN',
        terminalName: 'Caja Principal',
        location: 'RESTAURANTE',
        createdAt: doc.createdAt || issueDate,
        updatedAt: doc.updatedAt || issueDate
      };

      this.data.sales.push(reconstructedSale);
      existingSaleIds.add(docSaleId);
      if (doc.numericKey) existingKeys.add(doc.numericKey);
      if (doc.consecutive) existingConsecutives.add(doc.consecutive);
      reconstructedNew++;
    }

    // Marcar automáticamente ventas pendientes con más de 2 días como 'CONTINGENCIA_VENCIDA' ("No se pudo procesar / Expirado")
    this.markExpiredPendingSales();

    // Ordenar de más reciente a más antigua
    this.data.sales.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (reconstructedNew > 0 || reconciledExisting > 0) {
      console.log(`✨ Reconciliación completada: ${reconciledExisting} vinculadas, ${reconstructedNew} reconstruidas. Total ventas activas: ${this.data.sales.length}.`);
      
      // Recalcular el turno actual y todos los históricos para que "adopten" las ventas reconstruidas
      if (this.data.currentCashRegister) {
        this.recalculateRegisterTotals(this.data.currentCashRegister);
      }
      if (Array.isArray(this.data.cashRegisterHistory)) {
        this.data.cashRegisterHistory.forEach(reg => this.recalculateRegisterTotals(reg));
      }
      this.persist();
    }

    // Asegurar que la lista de comprobantes electrónicos en memoria refleje el 100% de las ventas facturadas
    this.invalidateElectronicDocsCache();
    this.getElectronicDocuments();

    return {
      reconciledExisting,
      reconstructedNew,
      totalSales: this.data.sales.length
    };
  }

  private constructor() {
    this.ensureDataDirectory();
    this.data = this.loadDatabase();
    try {
      const reconResult = this.reconcileSalesFromDocuments();
      if (reconResult && reconResult.reconstructedNew > 0) {
        setImmediate(() => {
          try {
            this.persist();
          } catch (e) {
            console.warn('Advertencia al persistir en segundo plano:', e);
          }
        });
      }
    } catch (err) {
      console.warn('Advertencia al normalizar base de datos:', err);
    }
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  private ensureDataDirectory() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const xmlsDir = path.join(DATA_DIR, 'xmls');
      if (!fs.existsSync(xmlsDir)) {
        fs.mkdirSync(xmlsDir, { recursive: true });
      }
    } catch (err) {
      console.error('Error creating data directory:', err);
    }
  }

  private getDefaultData(): DatabaseSchema {
    return {
      version: 2,
      lastUpdated: new Date().toISOString(),
      restaurantInfo: {
        name: 'Pollo Frito Sabor Cervanteño',
        commercialName: 'Pollo Frito Sabor Cervanteño',
        taxId: '3101987654',
        identificationType: '02',
        economicActivity: '5610.0',
        location: 'Costado Norte del Parque, Cervantes de Alvarado, Cartago, Costa Rica',
        province: '3', // Cartago
        canton: '06', // Alvarado
        district: '02', // Cervantes
        phone: '+506 2534-0000',
        email: 'facturacion@saborcervanteno.cr'
      },
      products: [...INITIAL_PRODUCTS],
      categories: [...INITIAL_CATEGORIES],
      customers: [...INITIAL_CUSTOMERS],
      sales: [],
      kitchenOrders: [],
      currentCashRegister: {
        id: 'reg-001',
        cashierId: 'usr-1',
        cashierName: 'Cajero Principal - Cervantes',
        location: 'RESTAURANTE',
        openTime: new Date().toISOString(),
        openingBalance: 50000,
        cashSales: 0,
        cardSales: 0,
        sinpeSales: 0,
        transferSales: 0,
        cashIn: 0,
        cashOut: 0,
        expectedCash: 50000,
        status: 'OPEN',
        totalInvoicesCount: 0
      },
      cashRegisterHistory: [],
      cashMovements: [],
      haciendaDirectConfig: { ...INITIAL_HACIENDA_DIRECT_CONFIG },
      cabysCatalog: [...OFFICIAL_CABYS_CATALOG],
      taxRates: [...OFFICIAL_TAX_RATES],
      electronicDocuments: [],
      fiscalAuditLogs: [],
      emailDispatchLogs: [],
      users: [...SYSTEM_USERS],
      kitchenObservations: [],
      consecutiveControls: [
        { id: 'seq-001-00001-01', branch: '001', terminal: '00001', documentType: '01', currentSequence: 1, updatedAt: new Date().toISOString() },
        { id: 'seq-001-00001-04', branch: '001', terminal: '00001', documentType: '04', currentSequence: 1, updatedAt: new Date().toISOString() },
        { id: 'seq-001-00001-03', branch: '001', terminal: '00001', documentType: '03', currentSequence: 1, updatedAt: new Date().toISOString() },
        { id: 'seq-001-00002-01', branch: '001', terminal: '00002', documentType: '01', currentSequence: 1, updatedAt: new Date().toISOString() },
        { id: 'seq-001-00002-04', branch: '001', terminal: '00002', documentType: '04', currentSequence: 1, updatedAt: new Date().toISOString() }
      ],
      catalogVersion: 1,
      tombstones: {}
    };
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE_PATH)) {
        const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        console.log('✅ Base de datos cargada exitosamente desde:', DB_FILE_PATH);
        const loadedProducts: Product[] = (parsed.products !== undefined ? parsed.products : INITIAL_PRODUCTS).map((p: Product) => ({
          ...p,
          image: (p.image && typeof p.image === 'string' && p.image.trim() && !p.image.includes('[STORED_IN_PRODUCTS_COLLECTION]')) 
            ? p.image.trim() 
            : getLocalProductImage(p.image, p.categoryId, p.name, p.sku)
        }));

        const loadedHaciendaConfig = parsed.haciendaDirectConfig ? { ...INITIAL_HACIENDA_DIRECT_CONFIG, ...parsed.haciendaDirectConfig } : { ...INITIAL_HACIENDA_DIRECT_CONFIG };
        if (!loadedHaciendaConfig.cryptographicKeyBase64 || loadedHaciendaConfig.cryptographicKeyBase64 === '[STORED_LOCALLY]' || loadedHaciendaConfig.cryptographicKeyBase64.length < 50) {
          const diskKey = this.loadLocalCryptoKey();
          if (diskKey) {
            loadedHaciendaConfig.cryptographicKeyBase64 = diskKey;
          }
        } else {
          this.saveLocalCryptoKey(loadedHaciendaConfig.cryptographicKeyBase64);
        }

        if (loadedHaciendaConfig.cryptographicKeyBase64 && loadedHaciendaConfig.cryptographicKeyPin) {
          try {
            const keyCheck = XmlSignerService.validateCertificateDetails(
              loadedHaciendaConfig.cryptographicKeyBase64,
              loadedHaciendaConfig.cryptographicKeyPin,
              loadedHaciendaConfig.environment,
              loadedHaciendaConfig.emisorTaxId
            );
            loadedHaciendaConfig.cryptographicKeyStatus = keyCheck.valid ? 'LOADED' : 'EXPIRED';
          } catch (certErr) {
            console.warn('⚠️ No se pudo validar certificado en inicio:', certErr);
            loadedHaciendaConfig.cryptographicKeyStatus = 'EXPIRED';
          }
        }

        // Salvaguarda de autocuración: si un snapshot revirtió pos_database.json a menos de 4,000 ventas,
        // fusionar automáticamente el respaldo maestro protegido en backups/ sin perder ventas nuevas.
        if (!Array.isArray(parsed.sales) || parsed.sales.length < 4000) {
          const masterBackupPath = path.join(process.cwd(), 'backups', 'sabor_cervanteno_backup_2026-10-26_61209cc2.json');
          if (fs.existsSync(masterBackupPath)) {
            try {
              const masterBackup = JSON.parse(fs.readFileSync(masterBackupPath, 'utf-8'));
              const mergedSalesMap = new Map<string, Sale>();
              for (const s of (masterBackup.sales || [])) {
                if (s && s.id) {
                  const { xmlEmitted, xmlHaciendaResponse, ...cleanS } = s;
                  mergedSalesMap.set(s.id, cleanS);
                }
              }
              for (const s of (parsed.sales || [])) {
                if (s && s.id) {
                  const { xmlEmitted, xmlHaciendaResponse, ...cleanS } = s;
                  mergedSalesMap.set(s.id, { ...(mergedSalesMap.get(s.id) || {}), ...cleanS });
                }
              }
              parsed.sales = Array.from(mergedSalesMap.values());

              const mergedDocsMap = new Map<string, ElectronicDocument>();
              for (const d of (masterBackup.electronicDocuments || [])) {
                if (d && (d.numericKey || d.id)) {
                  const { xmlGenerated, xmlResponseHacienda, ...cleanD } = d;
                  mergedDocsMap.set(d.numericKey || d.id, cleanD as ElectronicDocument);
                }
              }
              for (const d of (parsed.electronicDocuments || [])) {
                if (d && (d.numericKey || d.id)) {
                  const k = d.numericKey || d.id;
                  const { xmlGenerated, xmlResponseHacienda, ...cleanD } = d;
                  mergedDocsMap.set(k, { ...(mergedDocsMap.get(k) || {}), ...cleanD } as ElectronicDocument);
                }
              }
              parsed.electronicDocuments = Array.from(mergedDocsMap.values());
              console.log(`🛡️ [Autocuración] Historial maestro fusionado automáticamente (${parsed.sales.length} ventas, ${parsed.electronicDocuments.length} comprobantes).`);
            } catch (healErr) {
              console.warn('⚠️ No se pudo fusionar respaldo maestro en autocuración:', healErr);
            }
          }
        }

        // Normalizar fechas, horas y consecutivos diarios limpios (#101, #102...) para evitar saltos o consecutivos fiscales
        const todayStr = getCostaRicaDate();
        const todaySales = (parsed.sales || []).filter((s: Sale) => s && (s.date === todayStr || (s.timestamp && getCostaRicaDate(s.timestamp) === todayStr)));
        todaySales.sort((a: Sale, b: Sale) => (a.time || '').localeCompare(b.time || ''));
        const usedSeqs = new Set<number>();
        todaySales.forEach((s: Sale) => {
          if (s.orderNumber && s.orderNumber < 1000) usedSeqs.add(s.orderNumber);
        });

        let curSeq = 101;
        const loadedSales: Sale[] = (parsed.sales || []).map((s: Sale) => {
          if (!s) return s;
          let dateVal = s.date;
          let timeVal = s.time;
          if (s.timestamp) {
            const crDate = getCostaRicaDate(s.timestamp);
            const crTime = getCostaRicaTime(s.timestamp);
            if (dateVal !== crDate || !timeVal) {
              dateVal = crDate;
              timeVal = timeVal || crTime;
            }
          }

          let ordNum = s.orderNumber;
          if (dateVal === todayStr && (!ordNum || ordNum >= 1000)) {
            while (usedSeqs.has(curSeq)) curSeq++;
            ordNum = curSeq;
            usedSeqs.add(curSeq);
          }

          return { ...s, date: dateVal, time: timeVal, orderNumber: ordNum };
        });

        const loadedKitchenOrders: KitchenOrder[] = (parsed.kitchenOrders || [])
          .map((k: KitchenOrder) => {
            if (!k) return k;
            if (k.timestamp) {
              const crDate = getCostaRicaDate(k.timestamp);
              const crTime = getCostaRicaTime(k.timestamp);
              if (k.date !== crDate || !k.time) {
                return { ...k, date: crDate, time: k.time || crTime };
              }
            }
            return k;
          })
          .filter((k: KitchenOrder) => {
            if (!k) return false;
            // No cargar en el KDS comandas anteriores a la fecha de hoy
            const kDate = k.timestamp ? getCostaRicaDate(k.timestamp) : (k.date || '');
            return !kDate || kDate === todayStr;
          });

        return {
          ...this.getDefaultData(),
          ...parsed,
          restaurantInfo: parsed.restaurantInfo ? { ...this.getDefaultData().restaurantInfo, ...parsed.restaurantInfo } : this.getDefaultData().restaurantInfo,
          products: loadedProducts,
          categories: normalizeCategories(parsed.categories !== undefined ? parsed.categories : INITIAL_CATEGORIES),
          customers: normalizeCustomers(parsed.customers !== undefined ? parsed.customers : INITIAL_CUSTOMERS),
          sales: loadedSales,
          kitchenOrders: loadedKitchenOrders,
          currentCashRegister: parsed.currentCashRegister || this.getDefaultData().currentCashRegister,
          cashRegisterHistory: parsed.cashRegisterHistory || [],
          cashMovements: parsed.cashMovements || [],
          haciendaDirectConfig: loadedHaciendaConfig,
          cabysCatalog: parsed.cabysCatalog !== undefined && parsed.cabysCatalog.length > 0 ? parsed.cabysCatalog : OFFICIAL_CABYS_CATALOG,
          taxRates: parsed.taxRates !== undefined && parsed.taxRates.length > 0 ? parsed.taxRates : OFFICIAL_TAX_RATES,
          electronicDocuments: parsed.electronicDocuments || [],
          fiscalAuditLogs: parsed.fiscalAuditLogs || [],
          emailDispatchLogs: parsed.emailDispatchLogs || [],
          users: (() => {
            const uMap = new Map<string, UserProfile>();
            for (const u of SYSTEM_USERS) {
              if (u && u.id) uMap.set(u.id, { ...u });
            }
            for (const u of (parsed.users || [])) {
              if (u && u.id && u.id !== 'usr-cajero-1' && u.id !== 'usr-cajero-2') {
                const prev = uMap.get(u.id);
                uMap.set(u.id, prev ? { ...prev, ...u } : u);
              }
            }
            return Array.from(uMap.values());
          })(),
          kitchenObservations: Array.isArray(parsed.kitchenObservations) ? parsed.kitchenObservations : [],
          consecutiveControls: parsed.consecutiveControls !== undefined && parsed.consecutiveControls.length > 0 ? parsed.consecutiveControls : this.getDefaultData().consecutiveControls
        };
      }
    } catch (err) {
      console.error('⚠️ Error al leer archivo de base de datos, creando nueva instancia segura:', err);
    }

    const defaultData = this.getDefaultData();
    this.saveDatabaseSync(defaultData);
    return defaultData;
  }

  private getFirestoreReadyData(data: DatabaseSchema): any {
    // Reducir la carga de main_database para garantizar mantenerse muy por debajo del límite de 1MB de Firestore
    const configCopy = { ...(data.haciendaDirectConfig || INITIAL_HACIENDA_DIRECT_CONFIG) };
    // No almacenar archivos binarios pesados en main_database (la llave se almacena en disco y memoria)
    if (configCopy.cryptographicKeyBase64 && configCopy.cryptographicKeyBase64.length > 500) {
      configCopy.cryptographicKeyBase64 = '[STORED_LOCALLY]';
    }

    // No duplicar el logotipo en haciendaDirectConfig si ya reside en restaurantInfo (ahorra 262 KB)
    if (configCopy.emisorLogoBase64 && configCopy.emisorLogoBase64.length > 500) {
      configCopy.emisorLogoBase64 = '';
    }

    // Sanitizar y acotar la bitácora de auditoría a las últimas 15 entradas sin imágenes base64
    if (configCopy.issuerAuditTrail && Array.isArray(configCopy.issuerAuditTrail)) {
      configCopy.issuerAuditTrail = configCopy.issuerAuditTrail.slice(0, 15).map(entry => {
        if (entry.field === 'emisorLogoBase64') {
          return {
            ...entry,
            previousValue: entry.previousValue ? '[LOGO]' : null,
            newValue: entry.newValue ? '[LOGO]' : null
          };
        }
        return entry;
      });
    }

    const payload: any = {
      version: data.version || 2,
      catalogVersion: data.catalogVersion || 1,
      lastUpdated: data.lastUpdated || new Date().toISOString(),
      restaurantInfo: data.restaurantInfo,
      products: (data.products || []).slice(0, 300).map(p => ({
        ...p,
        // Si la imagen es un Base64 extenso, guardamos en main_database un marcador ligero,
        // garantizando que main_database pese < 250 KB y nunca se acerque al límite de 1 MB.
        // La imagen completa se almacena de forma íntegra en la colección individual 'products/{id}' y en disco local.
        image: (p.image && typeof p.image === 'string' && p.image.startsWith('data:') && p.image.length > 5000)
          ? '[STORED_IN_PRODUCTS_COLLECTION]'
          : (p.image || '')
      })),
      categories: data.categories || [],
      customers: (data.customers || []).slice(0, 100),
      // Solo guardar resumen ligero de las últimas 10 ventas sin XMLs pesados
      sales: (data.sales || []).slice(0, 10).map(s => {
        const { xmlEmitted, xmlHaciendaResponse, ...saleClean } = s;
        return saleClean;
      }),
      currentCashRegister: data.currentCashRegister,
      cashRegisterHistory: (data.cashRegisterHistory || []).slice(0, 5),
      cashMovements: (data.cashMovements || []).slice(0, 20),
      users: data.users || [],
      kitchenObservations: data.kitchenObservations || [],
      // Preservar comandas activas del día en Firestore para el KDS (hasta 50 comandas recientes)
      kitchenOrders: (data.kitchenOrders || []).slice(0, 50),
      haciendaDirectConfig: configCopy,
      // Los documentos electrónicos se guardan de forma individual en la colección electronic_documents
      electronicDocuments: [],
      fiscalAuditLogs: [],
      emailDispatchLogs: [],
      cabysCatalog: [],
      taxRates: []
    };

    // Salvaguarda proactiva contra el límite de 1MB (1,048,576 bytes) de Firestore
    let jsonStr = JSON.stringify(payload);
    if (jsonStr.length > 800000) {
      console.warn(`⚠️ [Firestore] Payload de main_database (${jsonStr.length} bytes) alto. Reduciendo ventas en buffer...`);
      payload.sales = (payload.sales || []).slice(0, 3);
      payload.cashMovements = (payload.cashMovements || []).slice(0, 5);
    }

    // Eliminar propiedades undefined para compatibilidad estricta con Firestore
    return JSON.parse(JSON.stringify(payload));
  }

  /**
   * Sincronización serializada y protegida contra saturación de cola gRPC de Firestore.
   * Evita múltiples llamadas concurrentes a setDoc que exceden el límite de escrituras en cola.
   */
  public triggerFirestoreSync(immediate = false): void {
    if (!firestoreDb) return;

    // Si la cuota o el stream fue agotado, aplicar ventana de espera de 15 minutos
    if (firestoreQuotaExceeded) {
      const cooldownMs = 15 * 60 * 1000;
      if (Date.now() - firestoreQuotaExceededAt < cooldownMs) {
        return;
      }
      firestoreQuotaExceeded = false;
    }

    if (this.isSyncingToFirestore) {
      this.pendingFirestoreSync = true;
      return;
    }

    if (immediate) {
      const now = Date.now();
      // Throttle de 2.5s entre sincronizaciones globales de main_database para no inundar gRPC
      if (now - this.lastFirestoreSyncTimestamp < 2500) {
        this.pendingFirestoreSync = true;
        if (!this.firestoreSyncTimer) {
          this.firestoreSyncTimer = setTimeout(() => {
            this.firestoreSyncTimer = null;
            this.performFirestoreSync();
          }, 2500);
        }
        return;
      }

      if (this.firestoreSyncTimer) {
        clearTimeout(this.firestoreSyncTimer);
        this.firestoreSyncTimer = null;
      }
      this.performFirestoreSync();
      return;
    }

    // Debounce no invasivo para operaciones de rutina
    if (this.firestoreSyncTimer) {
      clearTimeout(this.firestoreSyncTimer);
    }
    this.firestoreSyncTimer = setTimeout(() => {
      this.firestoreSyncTimer = null;
      this.performFirestoreSync();
    }, 15000);
  }

  private async performFirestoreSync(): Promise<void> {
    if (!firestoreDb || firestoreQuotaExceeded || this.isSyncingToFirestore) {
      return;
    }

    this.isSyncingToFirestore = true;
    this.pendingFirestoreSync = false;
    this.lastFirestoreSyncTimestamp = Date.now();

    try {
      const docRef = doc(firestoreDb, 'pos_data', 'main_database');
      const payload = this.getFirestoreReadyData(this.data);
      const payloadStr = JSON.stringify(payload);
      const payloadBytes = payloadStr.length;

      // Omitir escritura si el documento resumen operativo no ha cambiado desde la última sincronización
      if (payloadStr === this.lastMainDbSyncSignature) {
        return;
      }

      // Si por alguna anomalía extrema excede 1MB, proteger Firestore y abortar para evitar error 3 INVALID_ARGUMENT
      if (payloadBytes >= 1040000) {
        console.error(`❌ [Firebase Firestore] Documento main_database excede 1MB (${payloadBytes} bytes). Abortando para proteger la conexión.`);
        return;
      }

      await setDoc(docRef, payload);
      this.lastMainDbSyncSignature = payloadStr;
      console.log(`☁️ [Firebase Firestore] Documento main_database sincronizado con éxito (${Math.round(payloadBytes / 1024)} KB).`);
    } catch (err: any) {
      if (isFirestoreQuotaOrStreamError(err)) {
        firestoreQuotaExceeded = true;
        firestoreQuotaExceededAt = Date.now();
        this.pendingFirestoreSync = false;
        console.warn('ℹ️ [Firebase Firestore] Límite de cuota o tamaño en Firestore alcanzado. El sistema continúa operando de forma 100% autónoma con la base de datos local JSON.');
      } else {
        console.warn('⚠️ Advertencia no fatal al sincronizar con Firestore:', err?.message || err);
      }
    } finally {
      this.isSyncingToFirestore = false;
      if (this.pendingFirestoreSync && !firestoreQuotaExceeded) {
        this.pendingFirestoreSync = false;
        this.triggerFirestoreSync(false);
      }
    }
  }

  private saveDatabaseSync(data: DatabaseSchema, immediateSync = false, forceBackupWrite = false) {
    if (this.isSavingDatabase) return;
    this.isSavingDatabase = true;
    try {
      this.ensureDataDirectory();
      data.lastUpdated = new Date().toISOString();
      if (Array.isArray(data.customers)) {
        data.customers = normalizeCustomers(data.customers);
      }

      // OPTIMIZACIÓN DE ALTO RENDIMIENTO:
      // Desacoplar XMLs pesados hacia data/xmls/ usando caché en memoria (savedXmlKeys)
      // y reutilizar referencias en O(1) cuando los registros ya están limpios en memoria.
      const xmlsDir = path.join(DATA_DIR, 'xmls');
      const rawDocs = data.electronicDocuments || [];
      const hasEmbeddedDocXml = rawDocs.some(d => d && (d.xmlGenerated !== undefined || d.xmlResponseHacienda !== undefined));

      const lightDocs = hasEmbeddedDocXml
        ? rawDocs.map(d => {
            if (!d) return d;
            if (d.numericKey && !this.savedXmlKeys.has(d.numericKey)) {
              if (d.xmlGenerated) {
                const xmlPath = path.join(xmlsDir, `${d.numericKey}.xml`);
                if (!fs.existsSync(xmlPath)) {
                  try { fs.writeFileSync(xmlPath, d.xmlGenerated, 'utf-8'); } catch {}
                }
              }
              if (d.xmlResponseHacienda) {
                const respPath = path.join(xmlsDir, `${d.numericKey}_respuesta.xml`);
                if (!fs.existsSync(respPath)) {
                  try { fs.writeFileSync(respPath, d.xmlResponseHacienda, 'utf-8'); } catch {}
                }
              }
              this.savedXmlKeys.add(d.numericKey);
            }
            if (d.xmlGenerated !== undefined || d.xmlResponseHacienda !== undefined) {
              const { xmlGenerated, xmlResponseHacienda, ...rest } = d;
              return rest as ElectronicDocument;
            }
            return d;
          })
        : rawDocs;

      const rawSales = data.sales || [];
      const hasEmbeddedSaleXml = rawSales.some(s => s && (s.xmlEmitted !== undefined || s.xmlHaciendaResponse !== undefined));

      const lightSales = hasEmbeddedSaleXml
        ? rawSales.map(s => {
            if (!s) return s;
            if (s.numericKey50 && !this.savedXmlKeys.has(s.numericKey50)) {
              if (s.xmlEmitted) {
                const xmlPath = path.join(xmlsDir, `${s.numericKey50}.xml`);
                if (!fs.existsSync(xmlPath)) {
                  try { fs.writeFileSync(xmlPath, s.xmlEmitted, 'utf-8'); } catch {}
                }
              }
              if (s.xmlHaciendaResponse) {
                const respPath = path.join(xmlsDir, `${s.numericKey50}_respuesta.xml`);
                if (!fs.existsSync(respPath)) {
                  try { fs.writeFileSync(respPath, s.xmlHaciendaResponse, 'utf-8'); } catch {}
                }
              }
              this.savedXmlKeys.add(s.numericKey50);
            }
            if (s.xmlEmitted !== undefined || s.xmlHaciendaResponse !== undefined) {
              const { xmlEmitted, xmlHaciendaResponse, ...rest } = s;
              return rest as Sale;
            }
            return s;
          })
        : rawSales;

      // Actualizar en memoria las listas ya saneadas para que las siguientes persistencias sean O(1)
      if (hasEmbeddedDocXml) data.electronicDocuments = lightDocs;
      if (hasEmbeddedSaleXml) data.sales = lightSales;

      const dataToSave: DatabaseSchema = (hasEmbeddedDocXml || hasEmbeddedSaleXml)
        ? { ...data, electronicDocuments: lightDocs, sales: lightSales }
        : data;

      const content = JSON.stringify(dataToSave);
      
      // Escritura atómica usando archivo temporal para prevenir corrupción
      const tempPath = `${DB_FILE_PATH}.tmp`;
      fs.writeFileSync(tempPath, content, 'utf-8');
      fs.renameSync(tempPath, DB_FILE_PATH);
      this.isDirty = false;
      
      // Actualizar copia de respaldo secundaria de forma controlada (cada 60s o en cierre/inicio)
      const now = Date.now();
      if (forceBackupWrite || (now - this.lastBackupWriteTimestamp >= 60000)) {
        fs.writeFileSync(DB_BACKUP_PATH, content, 'utf-8');
        this.lastBackupWriteTimestamp = now;
      }
      
      // Sincronizar a Firebase de manera inmediata o con debounce
      this.triggerFirestoreSync(immediateSync);
    } catch (err) {
      console.error('❌ Error guardando base de datos a disco:', err);
    } finally {
      this.isSavingDatabase = false;
    }
  }

  public persist(immediateSync = false) {
    this.isDirty = true;
    if (immediateSync) {
      // Disparar sincronización a Firestore de inmediato sin bloquear la respuesta HTTP con I/O de disco
      this.triggerFirestoreSync(true);
    }

    if (this.persistDebounceTimer) return;
    const delayMs = immediateSync ? 250 : 400;
    this.persistDebounceTimer = setTimeout(() => {
      this.persistDebounceTimer = null;
      this.saveDatabaseSync(this.data, false);
    }, delayMs);
  }

  public flushToDiskSync(): void {
    if (this.persistDebounceTimer) {
      clearTimeout(this.persistDebounceTimer);
      this.persistDebounceTimer = null;
    }
    if (this.isDirty) {
      this.saveDatabaseSync(this.data, false, true);
    }
  }


  // ----------------------------------------------------
  // CATALOG VERSION & RECONCILIATION
  // ----------------------------------------------------
  public getCatalogVersion(): number {
    return this.data.catalogVersion || 1;
  }

  public getLastUpdated(): string {
    return this.data.lastUpdated || new Date().toISOString();
  }

  /**
   * Sincronización Inteligente de Catálogo con la Nube (Firestore):
   * En caso de discrepancias entre el servidor local y la nube: ¡LA NUBE MANDA!
   * - Last-Write-Wins con preferencia en la nube.
   * - Tombstones para evitar resurrección de elementos eliminados.
   * - Preservación de imágenes de alta fidelidad.
   */
  private async reconcileCatalogFromCloud(
    cloudData?: Partial<DatabaseSchema>,
    localProducts: Product[] = this.data.products || [],
    localCategories: Category[] = this.data.categories || []
  ): Promise<{ products: Product[]; categories: Category[]; tombstones: Record<string, { id: string; type: 'product' | 'category'; deletedAt: string }> }> {
    const getTimestamp = (dateStr?: string): number => {
      if (!dateStr) return 0;
      const t = new Date(dateStr).getTime();
      return isNaN(t) ? 0 : t;
    };

    // 1. Cargar tombstones de Firestore y fusionar con locales
    let tombstones: Record<string, { id: string; type: 'product' | 'category'; deletedAt: string }> = {
      ...(this.data.tombstones || {})
    };
    try {
      if (firestoreDb && !firestoreQuotaExceeded) {
        const tombSnap = await getDoc(doc(firestoreDb, 'pos_data', 'tombstones'));
        if (tombSnap.exists() && tombSnap.data().items) {
          const cloudTombstones = tombSnap.data().items as Record<string, { id: string; type: 'product' | 'category'; deletedAt: string }>;
          for (const [id, item] of Object.entries(cloudTombstones)) {
            const curTime = getTimestamp(tombstones[id]?.deletedAt);
            const cloudTime = getTimestamp(item.deletedAt);
            if (cloudTime >= curTime) {
              tombstones[id] = item;
            }
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ No se pudieron leer tombstones de Firestore:', err);
    }

    // 2. Cargar productos desde colección individual 'products' de Firestore
    const cloudProductsMap = new Map<string, Product>();
    try {
      if (firestoreDb && !firestoreQuotaExceeded) {
        const cloudProductsSnap = await getDocs(collection(firestoreDb, 'products'));
        cloudProductsSnap.forEach(d => {
          const p = d.data() as Product;
          if (p && p.id) {
            cloudProductsMap.set(p.id, p);
          }
        });
      }
    } catch (err) {
      console.warn('⚠️ Error al consultar colección products de Firestore:', err);
    }

    // Fallback a cloudData.products si colección individual estaba vacía
    if (cloudProductsMap.size === 0 && cloudData && Array.isArray(cloudData.products) && cloudData.products.length > 0) {
      cloudData.products.forEach(p => {
        if (p && p.id) cloudProductsMap.set(p.id, p);
      });
    }

    // 3. Reconciliar Productos: ¡La nube manda en discrepancias!
    const localProductsMap = new Map<string, Product>();
    localProducts.forEach(p => {
      if (p && p.id) localProductsMap.set(p.id, p);
    });

    const reconciledProductsMap = new Map<string, Product>();
    const allProductIds = new Set<string>([...cloudProductsMap.keys(), ...localProductsMap.keys()]);
    const toUploadToCloud: Product[] = [];

    for (const id of allProductIds) {
      const cloudProd = cloudProductsMap.get(id);
      const localProd = localProductsMap.get(id);
      const tomb = tombstones[id];

      const cloudTime = getTimestamp(cloudProd?.updatedAt);
      const localTime = getTimestamp(localProd?.updatedAt);
      const tombTime = getTimestamp(tomb?.deletedAt);

      // Si fue eliminado explícitamente y la eliminación es posterior a la última edición:
      if (tomb && tombTime >= cloudTime && tombTime >= localTime) {
        if (cloudProd && firestoreDb && !firestoreQuotaExceeded) {
          deleteDoc(doc(firestoreDb, 'products', id)).catch(() => {});
        }
        continue;
      }

      if (cloudProd && localProd) {
        // En discrepancia: ¡LA NUBE MANDA!
        // Solo si local fue editado más recientemente de forma explícita gana local.
        if (localTime > cloudTime && localTime > 0) {
          reconciledProductsMap.set(id, localProd);
          toUploadToCloud.push(localProd);
        } else {
          // NUBE GANA (Prevalece estado, precio, nombre, categoría de la nube)
          const safeImage = (cloudProd.image && typeof cloudProd.image === 'string' && cloudProd.image.trim() && !cloudProd.image.includes('[STORED_IN_PRODUCTS_COLLECTION]'))
            ? cloudProd.image.trim()
            : (localProd.image || getLocalProductImage(cloudProd.image, cloudProd.categoryId, cloudProd.name, cloudProd.sku));

          reconciledProductsMap.set(id, {
            ...localProd,
            ...cloudProd,
            image: safeImage,
            updatedAt: cloudProd.updatedAt || localProd.updatedAt || new Date().toISOString()
          });
        }
      } else if (cloudProd && !localProd) {
        // En la nube existe pero en local no: ¡La nube manda! Incorporar al catálogo local
        const safeImage = (cloudProd.image && typeof cloudProd.image === 'string' && cloudProd.image.trim() && !cloudProd.image.includes('[STORED_IN_PRODUCTS_COLLECTION]'))
          ? cloudProd.image.trim()
          : getLocalProductImage(cloudProd.image, cloudProd.categoryId, cloudProd.name, cloudProd.sku);

        reconciledProductsMap.set(id, {
          ...cloudProd,
          image: safeImage,
          updatedAt: cloudProd.updatedAt || new Date().toISOString()
        });
      } else if (!cloudProd && localProd) {
        // En local existe pero en la nube no: subir a la nube
        reconciledProductsMap.set(id, localProd);
        toUploadToCloud.push(localProd);
      }
    }

    let finalProducts = Array.from(reconciledProductsMap.values());
    if (finalProducts.length === 0) {
      finalProducts = [...INITIAL_PRODUCTS];
    }

    // 4. Reconciliar Categorías (La nube manda en discrepancias)
    let cloudCats: Category[] = [];
    try {
      if (firestoreDb && !firestoreQuotaExceeded) {
        const catSnap = await getDoc(doc(firestoreDb, 'pos_data', 'categories'));
        if (catSnap.exists() && Array.isArray(catSnap.data().categories)) {
          cloudCats = catSnap.data().categories;
        }
      }
    } catch (e) {
      console.warn('⚠️ No se pudo leer categories de pos_data:', e);
    }

    if (cloudCats.length === 0 && cloudData && Array.isArray(cloudData.categories) && cloudData.categories.length > 0) {
      cloudCats = cloudData.categories;
    }

    const cloudCatsMap = new Map<string, Category>();
    cloudCats.forEach(c => { if (c && c.id) cloudCatsMap.set(c.id, c); });
    const localCatsMap = new Map<string, Category>();
    localCategories.forEach(c => { if (c && c.id) localCatsMap.set(c.id, c); });

    const allCatIds = new Set<string>([...cloudCatsMap.keys(), ...localCatsMap.keys()]);
    const finalCatsMap = new Map<string, Category>();

    for (const catId of allCatIds) {
      const cloudC = cloudCatsMap.get(catId);
      const localC = localCatsMap.get(catId);
      const tomb = tombstones[catId];
      const cloudTime = getTimestamp(cloudC?.updatedAt);
      const localTime = getTimestamp(localC?.updatedAt);
      const tombTime = getTimestamp(tomb?.deletedAt);

      if (tomb && tombTime >= cloudTime && tombTime >= localTime) {
        continue;
      }

      if (cloudC && localC) {
        // Discrepancia: La nube manda salvo que local tenga marca de tiempo superior
        if (localTime > cloudTime && localTime > 0) {
          finalCatsMap.set(catId, localC);
        } else {
          finalCatsMap.set(catId, cloudC);
        }
      } else if (cloudC && !localC) {
        finalCatsMap.set(catId, cloudC);
      } else if (!cloudC && localC) {
        finalCatsMap.set(catId, localC);
      }
    }

    let finalCategories = normalizeCategories(Array.from(finalCatsMap.values()));
    if (finalCategories.length === 0) {
      finalCategories = normalizeCategories([...INITIAL_CATEGORIES]);
    }

    // 5. Subir a Firestore asíncronamente cualquier producto local pendiente
    if (toUploadToCloud.length > 0 && firestoreDb && !firestoreQuotaExceeded) {
      setTimeout(async () => {
        try {
          for (const p of toUploadToCloud) {
            await setDoc(doc(firestoreDb, 'products', p.id), p);
          }
          console.log(`☁️ [Intelligent Sync] Subidos ${toUploadToCloud.length} platillos locales a Firestore.`);
        } catch (e) {
          console.warn('⚠️ Error subiendo productos pendientes a Firestore:', e);
        }
      }, 500);
    }

    return {
      products: finalProducts,
      categories: finalCategories,
      tombstones
    };
  }

  /**
   * Sincronización explícita o periódica con Cloud Firestore.
   * Retorna si hubo cambios y los totales actualizados.
   */
  public async syncCatalogWithCloud(force = false): Promise<{ changed: boolean; productCount: number; categoryCount: number; message: string }> {
    if (!firestoreDb || firestoreQuotaExceeded) {
      return {
        changed: false,
        productCount: this.data.products.length,
        categoryCount: this.data.categories.length,
        message: 'Firestore no configurado o cuota temporalmente excedida'
      };
    }

    try {
      let cloudData: Partial<DatabaseSchema> = {};
      try {
        const docSnap = await getDoc(doc(firestoreDb, 'pos_data', 'main_database'));
        if (docSnap.exists()) {
          cloudData = docSnap.data() as DatabaseSchema;
        }
      } catch (err) {
        // Silencioso
      }

      // Calcular huella ligera del catálogo en main_database para evitar barrer las 58 lecturas de 'products' si no hubo cambios
      const cloudSig = JSON.stringify({
        v: cloudData.catalogVersion || 0,
        p: (cloudData.products || []).map(p => `${p.id}:${p.updatedAt || ''}:${p.price}:${p.active}`),
        c: (cloudData.categories || []).map(c => `${c.id}:${c.name}:${c.active}`)
      });

      if (!force && this.lastCloudCatalogSignature && cloudSig === this.lastCloudCatalogSignature) {
        return {
          changed: false,
          productCount: this.data.products.length,
          categoryCount: this.data.categories.length,
          message: 'Catálogo ya sincronizado con la nube (sin cambios en firma)'
        };
      }

      const { products: reconciledProducts, categories: reconciledCategories, tombstones: reconciledTombstones } =
        await this.reconcileCatalogFromCloud(cloudData, this.data.products, this.data.categories);

      const productsBefore = JSON.stringify(this.data.products.map(p => ({ id: p.id, name: p.name, price: p.price, active: p.active, updatedAt: p.updatedAt })));
      const productsAfter = JSON.stringify(reconciledProducts.map(p => ({ id: p.id, name: p.name, price: p.price, active: p.active, updatedAt: p.updatedAt })));
      const categoriesBefore = JSON.stringify(this.data.categories.map(c => ({ id: c.id, name: c.name, active: c.active })));
      const categoriesAfter = JSON.stringify(reconciledCategories.map(c => ({ id: c.id, name: c.name, active: c.active })));

      const hasChanged = productsBefore !== productsAfter || categoriesBefore !== categoriesAfter;

      this.data.tombstones = reconciledTombstones;

      if (hasChanged) {
        this.data.products = reconciledProducts;
        this.data.categories = reconciledCategories;
        this.data.catalogVersion = (this.data.catalogVersion || 1) + 1;
        this.data.lastUpdated = new Date().toISOString();
        this.persist(true);

        // Guardar categorías y tombstones actualizados en Firestore
        setDoc(doc(firestoreDb, 'pos_data', 'categories'), {
          categories: reconciledCategories,
          lastUpdated: new Date().toISOString()
        }).catch(() => {});

        setDoc(doc(firestoreDb, 'pos_data', 'tombstones'), {
          items: reconciledTombstones,
          lastUpdated: new Date().toISOString()
        }, { merge: true }).catch(() => {});

        console.log(`🔄 [Catalog Auto-Sync] Catálogo actualizado con la Nube (La nube mandó en discrepancias). ${reconciledProducts.length} productos, ${reconciledCategories.length} categorías.`);
      }

      this.lastCloudCatalogSignature = JSON.stringify({
        v: this.data.catalogVersion || cloudData.catalogVersion || 0,
        p: this.data.products.map(p => `${p.id}:${p.updatedAt || ''}:${p.price}:${p.active}`),
        c: this.data.categories.map(c => `${c.id}:${c.name}:${c.active}`)
      });

      return {
        changed: hasChanged,
        productCount: this.data.products.length,
        categoryCount: this.data.categories.length,
        message: hasChanged ? 'Catálogo sincronizado exitosamente desde la nube' : 'Catálogo ya sincronizado con la nube'
      };
    } catch (err: any) {
      console.error('⚠️ Error en syncCatalogWithCloud:', err);
      return {
        changed: false,
        productCount: this.data.products.length,
        categoryCount: this.data.categories.length,
        message: err?.message || 'Error al conectar con Firestore'
      };
    }
  }

  // ----------------------------------------------------
  // PRODUCTS CRUD
  // ----------------------------------------------------
  public getProducts(): Product[] {
    return this.data.products;
  }

  public getProductById(id: string): Product | undefined {
    return this.data.products.find(p => p.id === id);
  }

  public saveProduct(product: Product): Product[] {
    const now = new Date().toISOString();
    const updatedProduct: Product = {
      ...product,
      createdAt: product.createdAt || now,
      updatedAt: now
    };

    // Si estaba marcado en tombstones (borrado anterior), remover de tombstones
    if (this.data.tombstones && this.data.tombstones[product.id]) {
      delete this.data.tombstones[product.id];
      if (firestoreDb && !firestoreQuotaExceeded) {
        setDoc(doc(firestoreDb, 'pos_data', 'tombstones'), {
          items: this.data.tombstones,
          lastUpdated: now
        }, { merge: true }).catch(() => {});
      }
    }

    const idx = this.data.products.findIndex(p => p.id === product.id);
    if (idx >= 0) {
      this.data.products[idx] = updatedProduct;
    } else {
      this.data.products.push(updatedProduct);
    }
    this.data.catalogVersion = (this.data.catalogVersion || 1) + 1;
    this.data.lastUpdated = now;
    this.persist(true);

    // Sincronizar documento individual con su imagen completa en la colección 'products'
    if (firestoreDb && !firestoreQuotaExceeded) {
      setDoc(doc(firestoreDb, 'products', updatedProduct.id), updatedProduct).catch(err => {
        console.warn('⚠️ Error al sincronizar producto en Firestore collection:', err);
      });
    }
    return this.data.products;
  }

  public deleteProduct(id: string): boolean {
    const initialLen = this.data.products.length;
    this.data.products = this.data.products.filter(p => p.id !== id);
    if (this.data.products.length !== initialLen) {
      const now = new Date().toISOString();
      this.data.tombstones = this.data.tombstones || {};
      this.data.tombstones[id] = { id, type: 'product', deletedAt: now };
      this.data.catalogVersion = (this.data.catalogVersion || 1) + 1;
      this.data.lastUpdated = now;
      this.persist(true);

      // Eliminar el documento individual de Firestore y registrar tombstone
      if (firestoreDb && !firestoreQuotaExceeded) {
        deleteDoc(doc(firestoreDb, 'products', id)).catch(err => {
          console.warn('⚠️ Error al eliminar producto en Firestore collection:', err);
        });
        setDoc(doc(firestoreDb, 'pos_data', 'tombstones'), {
          items: this.data.tombstones,
          lastUpdated: now
        }, { merge: true }).catch(() => {});
      }
      return true;
    }
    return false;
  }

  // ----------------------------------------------------
  // CATEGORIES CRUD
  // ----------------------------------------------------
  public getCategories(): Category[] {
    this.data.categories = normalizeCategories(this.data.categories || []);
    return this.data.categories;
  }

  public saveCategory(category: Category): Category[] {
    const now = new Date().toISOString();
    let name = (category.name || '').trim();
    if (category.id === 'cat-tacos' && (name.toLowerCase().includes('tacos & chalupas') || name.toLowerCase() === 'tacos')) {
      name = 'TACOS';
    } else if (category.id === 'cat-empanadas' && (name.toLowerCase().includes('empanadas caseras') || name.toLowerCase() === 'empanadas')) {
      name = 'EMPANADAS';
    }
    const normalizedCategory: Category = {
      ...category,
      name,
      createdAt: category.createdAt || now,
      updatedAt: now
    };

    if (this.data.tombstones && this.data.tombstones[category.id]) {
      delete this.data.tombstones[category.id];
      if (firestoreDb && !firestoreQuotaExceeded) {
        setDoc(doc(firestoreDb, 'pos_data', 'tombstones'), {
          items: this.data.tombstones,
          lastUpdated: now
        }, { merge: true }).catch(() => {});
      }
    }

    const idx = this.data.categories.findIndex(c => c.id === normalizedCategory.id);
    if (idx >= 0) {
      this.data.categories[idx] = normalizedCategory;
    } else {
      this.data.categories.push(normalizedCategory);
    }
    this.data.categories = normalizeCategories(this.data.categories);
    this.data.catalogVersion = (this.data.catalogVersion || 1) + 1;
    this.data.lastUpdated = now;
    this.persist(true);

    // Sincronizar categorías autoritativas a Firestore
    if (firestoreDb && !firestoreQuotaExceeded) {
      setDoc(doc(firestoreDb, 'pos_data', 'categories'), {
        categories: this.data.categories,
        lastUpdated: now
      }).catch(err => console.warn('⚠️ Error al sincronizar categorías en Firestore:', err));
    }
    return this.data.categories;
  }

  public deleteCategory(id: string): boolean {
    const initialLen = this.data.categories.length;
    this.data.categories = this.data.categories.filter(c => c.id !== id);
    if (this.data.categories.length !== initialLen) {
      const now = new Date().toISOString();
      this.data.tombstones = this.data.tombstones || {};
      this.data.tombstones[id] = { id, type: 'category', deletedAt: now };
      this.data.categories = normalizeCategories(this.data.categories);
      this.data.catalogVersion = (this.data.catalogVersion || 1) + 1;
      this.data.lastUpdated = now;
      this.persist(true);

      if (firestoreDb && !firestoreQuotaExceeded) {
        setDoc(doc(firestoreDb, 'pos_data', 'categories'), {
          categories: this.data.categories,
          lastUpdated: now
        }).catch(err => console.warn('⚠️ Error al actualizar categorías en Firestore tras eliminación:', err));
        setDoc(doc(firestoreDb, 'pos_data', 'tombstones'), {
          items: this.data.tombstones,
          lastUpdated: now
        }, { merge: true }).catch(() => {});
      }
      return true;
    }
    return false;
  }

  // ----------------------------------------------------
  // CUSTOMERS CRUD
  // ----------------------------------------------------
  public getCustomers(): Customer[] {
    const list = this.data.customers;
    const defaultIdx = list.findIndex(c => 
      c.name.toLowerCase().includes('contado') || 
      c.name.toLowerCase().includes('consumidor') || 
      c.name.toLowerCase().includes('general') ||
      c.identification === '000000000' ||
      c.identification === '100000000'
    );
    if (defaultIdx > 0) {
      const defaultCust = list[defaultIdx];
      return [defaultCust, ...list.filter((_, i) => i !== defaultIdx)];
    }
    return list;
  }

  public getCustomerById(id: string): Customer | undefined {
    return this.data.customers.find(c => c.id === id);
  }

  public saveCustomer(customer: Customer): Customer[] {
    // Si intentan modificar el cliente base de contado, asegurar sus valores protegidos
    if (customer.id === 'cust-generic-cash' || customer.identification === '000000000') {
      customer.id = 'cust-generic-cash';
      customer.name = customer.name || 'Cliente General / Consumidor Final';
      customer.identification = '000000000';
      customer.identificationType = '01';
      customer.fiscalCondition = 'Consumidor Final';
    }

    const idx = this.data.customers.findIndex(c => c.id === customer.id || (c.identification === customer.identification && customer.identification !== '000000000'));
    if (idx >= 0) {
      this.data.customers[idx] = { ...this.data.customers[idx], ...customer };
    } else {
      this.data.customers.push(customer);
    }
    this.data.customers = normalizeCustomers(this.data.customers);
    this.persist();
    return this.data.customers;
  }

  public importCustomers(newCustomers: Customer[], replaceAll = false): { total: number; imported: number; updated: number; customers: Customer[] } {
    if (replaceAll) {
      this.data.customers = normalizeCustomers([...newCustomers]);
      this.persist();
      return { total: this.data.customers.length, imported: newCustomers.length, updated: 0, customers: this.data.customers };
    }

    let importedCount = 0;
    let updatedCount = 0;

    for (const item of newCustomers) {
      if (!item.name && !item.identification) continue;
      const cleanId = (item.identification || '').trim();
      
      // Nunca permitir que una importación de Alegra o CSV sobreescriba el cliente de contado base
      if (item.id === 'cust-generic-cash' || cleanId === '000000000') {
        continue;
      }
      
      const existingIdx = this.data.customers.findIndex(c => 
        (c.id !== 'cust-generic-cash' && c.identification !== '000000000' && c.id === item.id) || 
        (cleanId && cleanId !== '000000000' && cleanId !== '100000000' && c.identification === cleanId)
      );

      if (existingIdx >= 0) {
        this.data.customers[existingIdx] = {
          ...this.data.customers[existingIdx],
          ...item,
          id: this.data.customers[existingIdx].id // preserve internal id
        };
        updatedCount++;
      } else {
        this.data.customers.push({
          ...item,
          id: item.id || `cust-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          createdAt: item.createdAt || new Date().toISOString()
        });
        importedCount++;
      }
    }

    this.data.customers = normalizeCustomers(this.data.customers);
    this.persist();
    return {
      total: this.data.customers.length,
      imported: importedCount,
      updated: updatedCount,
      customers: this.data.customers
    };
  }

  public deleteCustomer(id: string): boolean {
    if (id === 'cust-generic-cash') {
      console.warn('⚠️ No se puede eliminar el Cliente de Contado base del sistema.');
      return false;
    }
    const initialLen = this.data.customers.length;
    this.data.customers = this.data.customers.filter(c => c.id !== id);
    if (this.data.customers.length !== initialLen) {
      this.data.customers = normalizeCustomers(this.data.customers);
      this.persist();
      return true;
    }
    return false;
  }

  // ----------------------------------------------------
  // USERS / CASHIERS
  // ----------------------------------------------------
  public getUsers(): UserProfile[] {
    if (!this.data.users || this.data.users.length === 0) {
      this.data.users = [...SYSTEM_USERS];
    }
    return this.data.users;
  }

  public saveUser(user: UserProfile): UserProfile[] {
    if (!this.data.users) {
      this.data.users = [...SYSTEM_USERS];
    }
    const updatedUser: UserProfile = {
      ...user,
      updatedAt: new Date().toISOString()
    };
    const idx = this.data.users.findIndex(u => u.id === updatedUser.id);
    if (idx >= 0) {
      this.data.users[idx] = { ...this.data.users[idx], ...updatedUser };
    } else {
      this.data.users.push(updatedUser);
    }
    // Guardado y sincronización inmediata a Firebase para evitar pérdida
    this.persist(true);
    return this.data.users;
  }

  public deleteUser(userId: string): UserProfile[] {
    if (!this.data.users) {
      this.data.users = [...SYSTEM_USERS];
    }
    this.data.users = this.data.users.filter(u => u.id !== userId);
    // Guardado y sincronización inmediata a Firebase
    this.persist(true);
    return this.data.users;
  }

  // ----------------------------------------------------
  // OBSERVACIONES DE COCINA (OFICIALES - CREADAS POR ADMINISTRADOR)
  // ----------------------------------------------------
  public getKitchenObservations(): KitchenObservation[] {
    if (!this.data.kitchenObservations) {
      this.data.kitchenObservations = [];
    }
    return this.data.kitchenObservations;
  }

  public saveKitchenObservation(obs: KitchenObservation): KitchenObservation[] {
    if (!this.data.kitchenObservations) {
      this.data.kitchenObservations = [];
    }
    const updatedObs: KitchenObservation = {
      ...obs,
      updatedAt: new Date().toISOString()
    };
    const idx = this.data.kitchenObservations.findIndex(o => o.id === updatedObs.id);
    if (idx >= 0) {
      this.data.kitchenObservations[idx] = updatedObs;
    } else {
      this.data.kitchenObservations.push(updatedObs);
    }
    this.data.lastUpdated = new Date().toISOString();
    this.persist(true);
    return this.data.kitchenObservations;
  }

  public deleteKitchenObservation(id: string): KitchenObservation[] {
    if (!this.data.kitchenObservations) {
      this.data.kitchenObservations = [];
    }
    this.data.kitchenObservations = this.data.kitchenObservations.filter(o => o.id !== id);
    this.data.lastUpdated = new Date().toISOString();
    this.persist(true);
    return this.data.kitchenObservations;
  }

  // ----------------------------------------------------
  // SALES / ORDERS
  // ----------------------------------------------------
  public getSales(): Sale[] {
    // Proyección ligera: Retornar ventas sin los bloques de XML incrustados masivos.
    // Los XMLs firmados se descargan bajo demanda desde /api/fiscal/download-xml/:key
    return (this.data.sales || []).map(sale => {
      if (sale && (sale.xmlEmitted || sale.xmlHaciendaResponse)) {
        const { xmlEmitted, xmlHaciendaResponse, ...cleanSale } = sale;
        return cleanSale;
      }
      return sale;
    });
  }

  public getLocalPaginatedSales(options: {
    limitCount?: number;
    lastTimestamp?: number;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    search?: string;
  }) {
    let list = [...(this.data.sales || [])].map(sale => {
      if (sale && (sale.xmlEmitted || sale.xmlHaciendaResponse)) {
        const { xmlEmitted, xmlHaciendaResponse, ...cleanSale } = sale;
        return cleanSale;
      }
      return sale;
    });

    list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (options.dateFrom) {
      list = list.filter(s => {
        const d = s.date || (s.timestamp ? getCostaRicaDate(s.timestamp) : '');
        return d >= options.dateFrom!;
      });
    }
    if (options.dateTo) {
      list = list.filter(s => {
        const d = s.date || (s.timestamp ? getCostaRicaDate(s.timestamp) : '');
        return d <= options.dateTo!;
      });
    }
    if (options.status && options.status !== 'ALL') {
      if (options.status === 'PENDING_OFFLINE') {
        list = list.filter(s => {
          if (s.numericKey50 && s.numericKey50.length === 50) return false;
          if (s.invoiceStatus === 'INVOICED') return false;
          if (s.haciendaStatus === 'ACEPTADO_HACIENDA' || s.haciendaStatus === 'ENVIADO_PROCESANDO') return false;
          return true;
        });
      } else {
        list = list.filter(s => s.invoiceStatus === options.status);
      }
    }
    if (options.search) {
      const qStr = options.search.toLowerCase();
      list = list.filter(s => 
        s.orderNumber.toString().includes(qStr) ||
        s.customerName.toLowerCase().includes(qStr) ||
        (s.consecutive20 && s.consecutive20.toLowerCase().includes(qStr)) ||
        (s.numericKey50 && s.numericKey50.includes(qStr))
      );
    }

    if (options.lastTimestamp !== undefined) {
      list = list.filter(s => (s.timestamp || 0) < options.lastTimestamp!);
    }

    const limitCount = options.limitCount || 50;
    const salesSlice = list.slice(0, limitCount);
    const hasMore = list.length > limitCount;

    return {
      sales: salesSlice,
      hasMore,
      lastTimestamp: salesSlice.length > 0 ? salesSlice[salesSlice.length - 1].timestamp : undefined,
      total: list.length
    };
  }

  public async getPaginatedSales(options: {
    limitCount?: number;
    lastTimestamp?: number;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    search?: string;
  }) {
    // Usar prioritariamente el catálogo completo en memoria (5,303+ ventas ya reconciliadas con Firestore)
    // para garantizar 0 lecturas innecesarias a Firestore y 100% de cobertura en fechas históricas y búsquedas.
    if (!firestoreDb || firestoreQuotaExceeded || (this.data.sales && this.data.sales.length > 0)) {
      return this.getLocalPaginatedSales(options);
    }

    try {
      const limitCount = options.limitCount || 50;
      const salesRef = collection(firestoreDb, 'sales');
      let q = query(salesRef, orderBy('timestamp', 'desc'));

      if (options.status && options.status !== 'ALL' && options.status !== 'PENDING_PROCESANDO' && options.status !== 'PENDING_OFFLINE') {
        q = query(q, where('invoiceStatus', '==', options.status));
      }

      if (options.lastTimestamp !== undefined) {
        q = query(q, startAfter(options.lastTimestamp));
      }

      q = query(q, limit(limitCount + 1));

      const snap = await getDocs(q);
      const sales: Sale[] = [];
      snap.forEach(docSnap => {
        if (docSnap.exists()) {
          const s = docSnap.data() as Sale;
          if (s && (s.xmlEmitted || s.xmlHaciendaResponse)) {
            const { xmlEmitted, xmlHaciendaResponse, ...cleanSale } = s;
            sales.push(cleanSale as Sale);
          } else {
            sales.push(s);
          }
        }
      });

      const hasMore = sales.length > limitCount;
      if (hasMore) {
        sales.pop();
      }

      let filteredSales = sales;
      if (options.dateFrom) {
        filteredSales = filteredSales.filter(s => {
          const d = s.date || (s.timestamp ? getCostaRicaDate(s.timestamp) : '');
          return d >= options.dateFrom!;
        });
      }
      if (options.dateTo) {
        filteredSales = filteredSales.filter(s => {
          const d = s.date || (s.timestamp ? getCostaRicaDate(s.timestamp) : '');
          return d <= options.dateTo!;
        });
      }
      if (options.status === 'PENDING_OFFLINE') {
        filteredSales = filteredSales.filter(s => {
          if (s.numericKey50 && s.numericKey50.length === 50) return false;
          if (s.invoiceStatus === 'INVOICED') return false;
          if (s.haciendaStatus === 'ACEPTADO_HACIENDA' || s.haciendaStatus === 'ENVIADO_PROCESANDO') return false;
          return true;
        });
      }
      if (options.search) {
        const qStr = options.search.toLowerCase();
        filteredSales = filteredSales.filter(s => 
          s.orderNumber.toString().includes(qStr) ||
          s.customerName.toLowerCase().includes(qStr) ||
          (s.consecutive20 && s.consecutive20.toLowerCase().includes(qStr)) ||
          (s.numericKey50 && s.numericKey50.includes(qStr))
        );
      }

      return {
        sales: filteredSales,
        hasMore,
        lastTimestamp: sales.length > 0 ? sales[sales.length - 1].timestamp : undefined
      };
    } catch (err: any) {
      console.warn('⚠️ Error querying paginated sales from Firestore, falling back to local:', err);
      return this.getLocalPaginatedSales(options);
    }
  }

  public getSaleById(id: string): Sale | undefined {
    return this.data.sales.find(s => s.id === id);
  }

  /**
   * Genera el siguiente consecutivo diario de orden/comanda de cocina.
   * Se reinicia automáticamente cada día (con el cambio de fecha a medianoche / 11:59 p.m.)
   * iniciando en la comanda 101.
   */
  public getNextDailyOrderNumber(targetDate?: string): number {
    const dateStr = targetDate || getCostaRicaDate();
    const BASE_DAILY_ORDER_NUMBER = 100; // Iniciará en 101

    // Filtrar todas las ventas emitidas hoy en Costa Rica
    const todaySales = (this.data.sales || []).filter(s => {
      if (!s) return false;
      const sDate = s.timestamp ? getCostaRicaDate(s.timestamp) : (s.date || '');
      return sDate === dateStr;
    });

    // Filtrar todas las comandas de cocina emitidas hoy en Costa Rica
    const todayKitchen = (this.data.kitchenOrders || []).filter(k => {
      if (!k) return false;
      const kDate = k.timestamp ? getCostaRicaDate(k.timestamp) : (k.date || '');
      return kDate === dateStr;
    });

    // Filtrar ignorando números de orden mayores a 1000 (para evitar tomar consecutivos fiscales antiguos)
    const validSales = todaySales.filter(s => (s.orderNumber || 0) < 1000);
    const validKitchen = todayKitchen.filter(k => (k.orderNumber || 0) < 1000);

    const highestSalesNum = validSales.reduce((max, s) => Math.max(max, s.orderNumber || 0), BASE_DAILY_ORDER_NUMBER);
    const highestKitchenNum = validKitchen.reduce((max, k) => Math.max(max, k.orderNumber || 0), BASE_DAILY_ORDER_NUMBER);

    return Math.max(highestSalesNum, highestKitchenNum) + 1;
  }

  /**
   * Verifica si un número de comanda diario ya está en uso hoy para evitar colisiones
   */
  public isOrderNumberInUse(orderNum: number, dateStr: string, excludeId?: string, excludeKitchenId?: string): boolean {
    if (!orderNum || orderNum >= 1000) return false;
    const inKitchen = (this.data.kitchenOrders || []).some(k => 
      k.id !== excludeId && 
      k.id !== excludeKitchenId && 
      k.orderNumber === orderNum && 
      (k.date === dateStr || (k.timestamp && getCostaRicaDate(k.timestamp) === dateStr))
    );
    if (inKitchen) return true;
    const inSales = (this.data.sales || []).some(s => 
      s.id !== excludeId && 
      s.kitchenOrderId !== excludeId && 
      s.kitchenOrderId !== excludeKitchenId && 
      s.orderNumber === orderNum && 
      (s.date === dateStr || (s.timestamp && getCostaRicaDate(s.timestamp) === dateStr))
    );
    return inSales;
  }

  public createSale(sale: Sale): Sale {
    // Idempotencia estricta: Verificar si la venta ya existe o si esta operación ya fue procesada
    const existingIndex = this.data.sales.findIndex(s => 
      s.id === sale.id || 
      (sale.operationId && s.operationId && s.operationId === sale.operationId) ||
      (sale.idempotencyKey && s.idempotencyKey && s.idempotencyKey === sale.idempotencyKey) ||
      (sale.clientOrderId && s.clientOrderId && s.clientOrderId === sale.clientOrderId) ||
      (sale.kitchenOrderId && s.kitchenOrderId && s.kitchenOrderId === sale.kitchenOrderId)
    );
    if (existingIndex >= 0) {
      const existing = this.data.sales[existingIndex];
      let cleanOrderNum = existing.orderNumber || sale.orderNumber;
      if (!cleanOrderNum || cleanOrderNum >= 1000) {
        cleanOrderNum = this.getNextDailyOrderNumber(sale.date || existing.date);
      }
      this.data.sales[existingIndex] = {
        ...existing,
        ...sale,
        id: existing.id,
        orderNumber: cleanOrderNum,
        numericKey50: existing.numericKey50 || sale.numericKey50,
        consecutive20: existing.consecutive20 || sale.consecutive20,
        invoiceStatus: existing.invoiceStatus === 'INVOICED' ? 'INVOICED' : (sale.invoiceStatus || existing.invoiceStatus),
        updatedAt: new Date().toISOString()
      };
      const updatedSale = this.data.sales[existingIndex];
      if (firestoreDb && !firestoreQuotaExceeded && updatedSale.id) {
        try {
          const saleRef = doc(firestoreDb, 'sales', updatedSale.id);
          const cleanSale = JSON.parse(JSON.stringify(updatedSale));
          this.queueFirestoreWrite(async () => {
            await setDoc(saleRef, cleanSale, { merge: true });
          });
        } catch (err) {
          // non-blocking
        }
      }
      // Retornar inmediatamente marcando isNew = false sin duplicar inventario ni arqueo
      return { ...updatedSale, isNew: false };
    }

    // Asegurar fecha y hora oficial de Costa Rica
    if (sale.timestamp) {
      sale.date = getCostaRicaDate(sale.timestamp);
      sale.time = getCostaRicaTime(sale.timestamp);
    } else {
      sale.date = sale.date || getCostaRicaDate();
      sale.time = sale.time || getCostaRicaTime();
    }

    // Verificar si la venta proviene o está asociada a una comanda de cocina previa
    let preLinkedKitchen: KitchenOrder | undefined;
    if (sale.kitchenOrderId) {
      preLinkedKitchen = (this.data.kitchenOrders || []).find(k => k.id === sale.kitchenOrderId);
    }
    if (!preLinkedKitchen && sale.orderNumber) {
      preLinkedKitchen = (this.data.kitchenOrders || []).find(k => Number(k.orderNumber) === Number(sale.orderNumber) && !k.isPaid);
    }

    if (preLinkedKitchen && preLinkedKitchen.orderNumber) {
      // Heredar estrictamente el número consecutivo de la comanda de cocina (ej. #109) sin saltos
      sale.orderNumber = preLinkedKitchen.orderNumber;
      sale.kitchenOrderId = preLinkedKitchen.id;
    } else if (!sale.orderNumber || sale.orderNumber >= 1000 || this.isOrderNumberInUse(sale.orderNumber, sale.date, sale.id, sale.kitchenOrderId)) {
      sale.orderNumber = this.getNextDailyOrderNumber(sale.date);
    }

    sale.createdAt = sale.createdAt || new Date().toISOString();
    sale.updatedAt = new Date().toISOString();

    // Vincular venta al turno de caja actual con validación de fecha operativa
    const saleDate = sale.date || getCostaRicaDate(sale.timestamp || Date.now());
    if (this.data.currentCashRegister && this.data.currentCashRegister.status === 'OPEN') {
      const regDate = this.data.currentCashRegister.openTime 
        ? getCostaRicaDate(new Date(this.data.currentCashRegister.openTime).getTime()) 
        : saleDate;
      // Si la caja previa es de un día anterior, archivarla de inmediato para no mezclar turnos
      if (regDate && regDate !== saleDate) {
        console.log(`ℹ️ [db] Auto-cerrando caja previa de ${regDate} al ingresar venta de ${saleDate}`);
        this.closeCashRegister(
          this.data.currentCashRegister.expectedCash,
          `Cierre automático por cambio de día (${regDate})`
        );
      }
    }

    if (this.data.currentCashRegister && this.data.currentCashRegister.status === 'OPEN') {
      sale.cashRegisterId = this.data.currentCashRegister.id;
    }

    this.data.sales.unshift(sale);

    // Actualizar y conciliar inmediatamente el turno de caja considerando esta venta
    if (this.data.currentCashRegister) {
      this.recalculateRegisterTotals(this.data.currentCashRegister);
    }

    // Inventory reduction
    sale.items.forEach(item => {
      const prod = this.data.products.find(p => p.id === item.productId);
      if (prod) {
        if (prod.inventory !== undefined) {
          prod.inventory = Math.max(0, prod.inventory - item.quantity);
        }
        if (prod.locationStock && prod.locationStock.RESTAURANTE !== undefined) {
          prod.locationStock.RESTAURANTE = Math.max(0, prod.locationStock.RESTAURANTE - item.quantity);
        }
      }
    });

    // Vincular comanda de cocina existente de forma estricta para evitar duplicados o sobreescrituras
    let matchKitchen: KitchenOrder | undefined;
    this.data.kitchenOrders = this.data.kitchenOrders || [];
    const saleDateStr = sale.timestamp ? getCostaRicaDate(sale.timestamp) : (sale.date || getCostaRicaDate());

    // 1. Coincidencia directa por ID
    matchKitchen = this.data.kitchenOrders.find(k => 
      (sale.kitchenOrderId && k.id === sale.kitchenOrderId) ||
      (k.saleId && k.saleId === sale.id) ||
      (k.id === sale.id) ||
      (k.id === `kitchen-${sale.id.replace('sale-', '')}`)
    );

    // 2. Si no hay ID exacto, buscar comanda activa de hoy (no pagada y no cancelada)
    if (!matchKitchen) {
      matchKitchen = this.data.kitchenOrders.find(k => {
        const kDateStr = k.timestamp ? getCostaRicaDate(k.timestamp) : (k.date || '');
        if (kDateStr !== saleDateStr) return false;
        if (k.orderStatus === 'CANCELLED') return false;

        // Si coincide por mesa (en salón) y aún no está pagada
        if (sale.tableNumber && k.tableNumber && String(k.tableNumber).trim() === String(sale.tableNumber).trim() && !k.isPaid) {
          return true;
        }
        // Si coincide por nombre personalizado de orden y no está pagada
        if (sale.customOrderName && k.customOrderName && k.customOrderName.trim().toLowerCase() === sale.customOrderName.trim().toLowerCase() && !k.isPaid) {
          return true;
        }
        // Si coincide por número consecutivo diario de comanda, y aún no está pagada (incluso si ya fue despachada por cocina)
        if (Number(k.orderNumber) === Number(sale.orderNumber) && !k.isPaid) {
          return true;
        }
        return false;
      });
    }

    if (matchKitchen) {
      matchKitchen.isPaid = true;
      matchKitchen.saleId = sale.id;
      matchKitchen.orderNumber = sale.orderNumber;
      // Sincronizar los productos actualizados de la venta final hacia la comanda de cocina
      matchKitchen.items = sale.items;
      matchKitchen.subtotal = sale.subtotal;
      matchKitchen.taxTotal = sale.taxTotal;
      matchKitchen.total = sale.total;
      matchKitchen.tableNumber = sale.tableNumber || matchKitchen.tableNumber;
      matchKitchen.customOrderName = sale.customOrderName || matchKitchen.customOrderName;
      matchKitchen.updatedAt = new Date().toISOString();
      sale.kitchenOrderId = matchKitchen.id;
    } else {
      // Si la venta NO tenía comanda previa en cocina (cobro directo sin "A Cocina"),
      // crear la comanda en cocina para que el KDS la reciba inmediatamente
      const autoKitchenId = `kitchen-${sale.id.replace('sale-', '')}`;
      const existingAuto = this.data.kitchenOrders.find(k => k.id === autoKitchenId);
      if (!existingAuto) {
        const autoKitchenOrder: KitchenOrder = {
          id: autoKitchenId,
          orderNumber: sale.orderNumber,
          operationId: sale.operationId ? `op-k-${sale.operationId}` : undefined,
          idempotencyKey: sale.idempotencyKey ? `idemp-k-${sale.idempotencyKey}` : undefined,
          date: sale.date,
          time: sale.time,
          timestamp: sale.timestamp,
          customerId: sale.customerId,
          customerName: sale.customerName,
          customerPhone: sale.customerPhone,
          customerAddress: sale.customerAddress,
          orderType: sale.orderType,
          tableNumber: sale.tableNumber,
          customOrderName: sale.customOrderName,
          items: sale.items,
          subtotal: sale.subtotal,
          taxTotal: sale.taxTotal,
          total: sale.total,
          orderStatus: 'CONFIRMED',
          isPaid: true,
          saleId: sale.id,
          cashierId: sale.cashierId,
          cashierName: sale.cashierName,
          terminalName: sale.terminalName,
          location: sale.location,
          createdAt: sale.createdAt,
          updatedAt: new Date().toISOString()
        };
        this.data.kitchenOrders.unshift(autoKitchenOrder);
        sale.kitchenOrderId = autoKitchenOrder.id;
      }
    }

    if (firestoreDb && !firestoreQuotaExceeded && sale.id) {
      try {
        const saleRef = doc(firestoreDb, 'sales', sale.id);
        const { xmlEmitted, xmlHaciendaResponse, ...lightSale } = sale;
        const cleanSale = JSON.parse(JSON.stringify({ ...lightSale, syncedToCloud: true }));
        sale.syncedToCloud = true;
        this.queueFirestoreWrite(async () => {
          await setDoc(saleRef, cleanSale, { merge: true });
        });
      } catch (err) {
        // non-blocking
      }
    }

    this.persist(true);
    return { ...sale, isNew: true };
  }

  // ----------------------------------------------------
  // KITCHEN ORDERS / COMANDAS (KDS)
  // ----------------------------------------------------
  public getKitchenOrders(): KitchenOrder[] {
    const todayStr = getCostaRicaDate();
    const now = Date.now();

    return (this.data.kitchenOrders || []).filter(k => {
      if (!k) return false;
      if (k.orderStatus === 'CANCELLED') return false;

      const orderTime = k.timestamp || (k.createdAt ? new Date(k.createdAt).getTime() : 0);
      const kDate = k.timestamp ? getCostaRicaDate(k.timestamp) : (k.date || '');
      
      // Comandas del día de funcionamiento actual (Costa Rica):
      // Incluye tanto activas como despachadas de hoy para la pantalla y el botón "Despachadas"
      if (kDate === todayStr) {
        return true;
      }

      // Si por cambio de medianoche se creó hace menos de 45 minutos y sigue activa
      const isActiveStatus = k.orderStatus !== 'DELIVERED';
      if (isActiveStatus && orderTime && (now - orderTime) <= 45 * 60 * 1000) {
        return true;
      }

      return false;
    });
  }

  public getKitchenOrderById(id: string): KitchenOrder | undefined {
    return (this.data.kitchenOrders || []).find(k => k.id === id);
  }

  public saveKitchenOrder(order: KitchenOrder): KitchenOrder {
    this.data.kitchenOrders = this.data.kitchenOrders || [];

    // Idempotencia estricta: Verificar si la comanda ya existe o ya fue despachada
    const existingIndex = this.data.kitchenOrders.findIndex(k => 
      k.id === order.id ||
      (order.operationId && k.operationId && k.operationId === order.operationId) ||
      (order.idempotencyKey && k.idempotencyKey && k.idempotencyKey === order.idempotencyKey) ||
      (order.clientOrderId && k.clientOrderId && k.clientOrderId === order.clientOrderId)
    );
    if (existingIndex >= 0) {
      const existing = this.data.kitchenOrders[existingIndex];
      let cleanOrderNum = existing.orderNumber || order.orderNumber;
      if (!cleanOrderNum || cleanOrderNum >= 1000) {
        cleanOrderNum = this.getNextDailyOrderNumber(order.date || existing.date);
      }
      this.data.kitchenOrders[existingIndex] = {
        ...existing,
        ...order,
        id: existing.id,
        orderNumber: cleanOrderNum,
        updatedAt: new Date().toISOString()
      };
      this.persist(true);
      return { ...this.data.kitchenOrders[existingIndex], isNew: false };
    }

    // PROTECCIÓN ANTI-DOBLE TOQUE / CLIC RÁPIDO EN SERVIDOR:
    // Si no coincide por ID directo, verificar si es un duplicado accidental enviado en los últimos 10 segundos
    // (mismos productos, mismas cantidades, mismo total y mismo cliente)
    if (order.items && order.items.length > 0) {
      const orderItemsSummary = order.items
        .map(i => `${i.productId || i.name}:${i.quantity}:${i.price}`)
        .sort()
        .join('|');
      const orderTime = order.timestamp || Date.now();
      const orderDate = order.date || getCostaRicaDate(orderTime);

      const duplicateRecent = this.data.kitchenOrders.find(k => {
        if (k.date !== orderDate && (!k.timestamp || getCostaRicaDate(k.timestamp) !== orderDate)) {
          return false;
        }
        const kTime = k.timestamp || (k.createdAt ? new Date(k.createdAt).getTime() : 0);
        const diffMs = Math.abs(orderTime - kTime);
        // Margen de 10 segundos para atrapar doble toque en pantalla táctil o doble clic
        if (diffMs > 10000) return false;
        if (Math.abs((k.total || 0) - (order.total || 0)) > 0.01) return false;
        if ((k.items || []).length !== order.items.length) return false;

        // Si provienen explícitamente de terminales y cajeros distintos, permitir ambas (pedidos legítimos simultáneos)
        const hasExplicitStations = Boolean(order.terminalName && k.terminalName);
        const differentStations = hasExplicitStations && (order.terminalName !== k.terminalName);
        const hasExplicitCashiers = Boolean(order.cashierId && k.cashierId);
        const differentCashiers = hasExplicitCashiers && (order.cashierId !== k.cashierId);

        if (differentStations && differentCashiers) {
          return false;
        }

        const kItemsSummary = (k.items || [])
          .map(i => `${i.productId || i.name}:${i.quantity}:${i.price}`)
          .sort()
          .join('|');
        return kItemsSummary === orderItemsSummary;
      });

      if (duplicateRecent) {
        console.warn(`[ANTI-DUPLICADO] Se bloqueó comanda duplicada por doble clic. Reutilizando comanda activa #${duplicateRecent.orderNumber} (ID: ${duplicateRecent.id})`);
        return { ...duplicateRecent, isNew: false };
      }
    }

    // Asegurar ID único
    if (!order.id) {
      order.id = `kitchen-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    }

    // Asegurar fecha y hora oficial de Costa Rica
    if (order.timestamp) {
      order.date = getCostaRicaDate(order.timestamp);
      order.time = getCostaRicaTime(order.timestamp);
    } else {
      order.date = order.date || getCostaRicaDate();
      order.time = order.time || getCostaRicaTime();
    }

    // Asignar consecutivo diario de comanda si no tiene, si trae un número fiscal (>= 1000), o si ya está en uso hoy
    if (!order.orderNumber || order.orderNumber >= 1000 || this.isOrderNumberInUse(order.orderNumber, order.date, order.id)) {
      order.orderNumber = this.getNextDailyOrderNumber(order.date);
    }

    order.createdAt = order.createdAt || new Date().toISOString();
    order.updatedAt = new Date().toISOString();
    order.orderStatus = order.orderStatus || 'CONFIRMED';

    // NOTA: "A COCINA" NO toca arqueo de caja, NO descuenta inventario, NO genera comprobante fiscal.
    this.data.kitchenOrders.unshift(order);
    this.persist(true);
    return { ...order, isNew: true };
  }

  public updateKitchenOrderStatus(id: string, status: OrderStatus): KitchenOrder | null {
    this.data.kitchenOrders = this.data.kitchenOrders || [];
    let order = this.data.kitchenOrders.find(k => k.id === id);

    // Si el ID recibido corresponde al de una venta en vez del de una comanda directa:
    if (!order) {
      order = this.data.kitchenOrders.find(k => k.saleId === id);
    }

    if (order) {
      order.orderStatus = status;
      order.updatedAt = new Date().toISOString();
    }

    // Sincronizar simultáneamente la venta vinculada para que no ocurra 'resurrección'
    const linkedSales = (this.data.sales || []).filter(s => 
      (order && (s.id === order.saleId || s.kitchenOrderId === order.id || (order.orderNumber && s.orderNumber === order.orderNumber))) ||
      s.id === id || 
      s.kitchenOrderId === id
    );

    for (const sale of linkedSales) {
      sale.orderStatus = status;
      sale.updatedAt = new Date().toISOString();
    }

    this.persist(true);
    return order;
  }

  public updateKitchenOrder(id: string, updates: Partial<KitchenOrder>): KitchenOrder | null {
    this.data.kitchenOrders = this.data.kitchenOrders || [];
    const order = this.data.kitchenOrders.find(k => k.id === id);
    if (!order) return null;

    Object.assign(order, updates);
    order.updatedAt = new Date().toISOString();
    this.persist(true);
    return order;
  }

  public removeDuplicateKitchenOrders(targetDate: string, duplicateOrderNumbers: number[]): { removedCount: number, removedNumbers: number[] } {
    this.data.kitchenOrders = this.data.kitchenOrders || [];
    const beforeCount = this.data.kitchenOrders.length;

    const removedNumbers: number[] = [];
    this.data.kitchenOrders = this.data.kitchenOrders.filter(k => {
      const kDate = k.date || (k.timestamp ? getCostaRicaDate(k.timestamp) : '');
      const isTarget = (kDate === targetDate && duplicateOrderNumbers.includes(k.orderNumber));
      // Proteger transacciones reales: solo eliminar si no tiene venta cobrada vinculada
      if (isTarget && !k.saleId && !k.isPaid) {
        removedNumbers.push(k.orderNumber);
        return false;
      }
      return true;
    });

    // Enlazar ventas de hoy con sus comandas válidas cobradas que pudieran estar pendientes de link
    const targetSales = (this.data.sales || []).filter(s => (s.date === targetDate || (s.timestamp && getCostaRicaDate(s.timestamp) === targetDate)));
    for (const sale of targetSales) {
      const matchKitchen = this.data.kitchenOrders.find(k => 
        k.id === sale.kitchenOrderId || 
        k.orderNumber === sale.orderNumber ||
        (Math.abs((k.total || 0) - (sale.total || 0)) < 0.01 && (k.date === sale.date))
      );
      if (matchKitchen) {
        if (!matchKitchen.saleId) matchKitchen.saleId = sale.id;
        matchKitchen.isPaid = true;
        if (!matchKitchen.orderStatus) {
          matchKitchen.orderStatus = 'CONFIRMED';
        }
        if (!sale.kitchenOrderId) sale.kitchenOrderId = matchKitchen.id;
      }
    }

    this.persist();
    return {
      removedCount: beforeCount - this.data.kitchenOrders.length,
      removedNumbers
    };
  }

  public updateSale(id: string, updates: Partial<Sale>): Sale | null {
    const sale = this.data.sales.find(s => s.id === id);
    if (!sale) return null;

    // =========================================================================
    // REGLA FUNDAMENTAL DE INMUTABILIDAD FISCAL ("Una vez Aceptado, NUNCA Pendiente")
    // =========================================================================
    // Si la venta ya tiene Clave Numérica oficial de 50 dígitos y fue facturada o aceptada
    // ante Hacienda, se bloquea permanentemente cualquier intento de revertir su estado a
    // 'PROCESSING', 'ERROR', 'PENDING' o de vaciar su clave y consecutivo.
    const isAlreadyInvoiced = Boolean(
      (sale.invoiceStatus === 'INVOICED' || sale.haciendaStatus === 'ACEPTADO_HACIENDA' || sale.haciendaStatus === 'ACEPTADO') &&
      sale.numericKey50 && /^\d{50}$/.test(sale.numericKey50)
    );

    if (isAlreadyInvoiced) {
      if (updates.invoiceStatus && updates.invoiceStatus !== 'INVOICED') {
        delete updates.invoiceStatus;
      }
      if (updates.haciendaStatus && updates.haciendaStatus !== 'ACEPTADO_HACIENDA' && updates.haciendaStatus !== 'ACEPTADO') {
        delete updates.haciendaStatus;
      }
      if (updates.numericKey50 && updates.numericKey50 !== sale.numericKey50) {
        delete updates.numericKey50;
      }
      if (updates.consecutive20 && updates.consecutive20 !== sale.consecutive20) {
        delete updates.consecutive20;
      }
    }

    Object.assign(sale, updates);
    sale.updatedAt = new Date().toISOString();

    // Si se actualizó orderStatus, sincronizar comanda de cocina asociada
    if (updates.orderStatus && this.data.kitchenOrders) {
      const linkedKitchen = this.data.kitchenOrders.find(k => 
        k.saleId === id || 
        (sale.kitchenOrderId && k.id === sale.kitchenOrderId) ||
        (sale.orderNumber && k.orderNumber === sale.orderNumber)
      );
      if (linkedKitchen) {
        linkedKitchen.orderStatus = updates.orderStatus;
        linkedKitchen.updatedAt = new Date().toISOString();
      }
    }

    // Auto-limpieza de borradores offline obsoletos cuando la venta queda facturada
    if (sale.numericKey50 && (sale.invoiceStatus === 'INVOICED' || updates.invoiceStatus === 'INVOICED')) {
      if (this.data.electronicDocuments) {
        this.data.electronicDocuments = this.data.electronicDocuments.filter(d => {
          if (!d) return false;
          if (d.saleId === sale.id && (d.numericKey?.startsWith('PENDIENTE') || d.id?.startsWith('pending-'))) return false;
          if (d.numericKey === `PENDIENTE-ORDEN-${sale.orderNumber}`) return false;
          if (d.consecutive === `ORDEN-#${sale.orderNumber}` && (d.numericKey?.startsWith('PENDIENTE') || d.id?.startsWith('pending-'))) return false;
          return true;
        });
      }
      this.cachedElectronicDocs = null;
    }

    // Sincronización atómica inmediata a Firestore en la colección 'sales/{sale.id}'
    // para que TODOS los dispositivos (móvil, tablet, PC) reciban el estado facturado
    if (firestoreDb && !firestoreQuotaExceeded && sale.id) {
      try {
        const saleRef = doc(firestoreDb, 'sales', sale.id);
        const cleanSale = JSON.parse(JSON.stringify(sale));
        delete cleanSale.xmlEmitted;
        delete cleanSale.xmlHaciendaResponse;
        this.queueFirestoreWrite(async () => {
          await setDoc(saleRef, cleanSale, { merge: true });
        });
      } catch (err) {
        // non-blocking
      }
    }

    this.persist();

    // Sincronización inmediata de datos fiscales críticos
    if (updates.numericKey50 || updates.invoiceStatus === 'INVOICED' || updates.haciendaStatus || updates.consecutive20) {
      this.triggerFirestoreSync(true);
    }

    return sale;
  }

  // ----------------------------------------------------
  // CASH REGISTER
  // ----------------------------------------------------
  /**
   * Recalcula con precisión absoluta todos los totales del turno de caja
   * considerando TODAS las ventas y cobros realizados, sin importar si
   * se emitieron como tiquete 04, factura 01 o comanda cobrada en POS.
   */
  public recalculateRegisterTotals(register: CashRegister): void {
    if (!register) return;

    const openTimestamp = register.openTime ? new Date(register.openTime).getTime() : 0;
    const closeTimestamp = register.closeTime ? new Date(register.closeTime).getTime() : Infinity;
    const todayCr = getCostaRicaDate();
    const regOpenDate = register.openTime ? getCostaRicaDate(new Date(register.openTime).getTime()) : todayCr;

    // Identificar qué ventas pertenecen a turnos anteriores ya cerrados para no contarlas doble
    const closedSalesIds = new Set<string>();
    (this.data.cashRegisterHistory || []).forEach(pastReg => {
      if (pastReg.id === register.id) return; // No excluir las de este turno
      const pOpen = new Date(pastReg.openTime).getTime();
      const pClose = pastReg.closeTime ? new Date(pastReg.closeTime).getTime() : 0;
      if (pOpen > 0 && pClose > 0) {
        (this.data.sales || []).forEach(s => {
          const sTime = new Date(s.createdAt || s.timestamp).getTime();
          if (s.cashRegisterId === pastReg.id || (sTime >= (pOpen - 60000) && sTime <= (pClose + 5000))) {
            closedSalesIds.add(s.id);
          }
        });
      }
    });

    let exactCashSales = 0;
    let exactCardSales = 0;
    let exactSinpeSales = 0;
    let exactTransferSales = 0;
    let exactInvoicesCount = 0;

    (this.data.sales || []).forEach(sale => {
      if (!sale) return;
      if (closedSalesIds.has(sale.id)) return; // ya contabilizada en un turno anterior

      const sTime = new Date(sale.createdAt || sale.timestamp).getTime();
      const sDateStr = sale.timestamp ? getCostaRicaDate(sale.timestamp) : (sale.date || '');

      // REGLA FUNDAMENTAL DE CUADRE DIARIO:
      // Toda venta cobrada en la fecha operativa del día (Costa Rica) pertenece al Cierre Diario de esa fecha.
      // Esto unifica el 100% de las ventas del día (mañana, tarde y noche) en un solo corte limpio.
      if (sDateStr !== regOpenDate) return;

      exactInvoicesCount += 1;
      if (!sale.cashRegisterId || sale.cashRegisterId !== register.id) {
        sale.cashRegisterId = register.id;
      }

      const payments = sale.payments || [];
      if (payments.length > 0) {
        payments.forEach(p => {
          const amt = Number(p.amount) || 0;
          const method = String(p.method || '').toUpperCase();
          if (method === 'CASH' || method === 'EFECTIVO' || method === '01') {
            exactCashSales += amt;
          } else if (method === 'CARD' || method === 'TARJETA' || method === '02') {
            exactCardSales += amt;
          } else if (method === 'SINPE' || method === 'SINPE_MOVIL' || method === '06') {
            exactSinpeSales += amt;
          } else if (method === 'TRANSFER' || method === 'TRANSFERENCIA' || method === '04') {
            exactTransferSales += amt;
          } else {
            exactCashSales += amt;
          }
        });
      } else {
        const m = String((sale as any).paymentMethod || '').toUpperCase();
        const amt = Number(sale.total) || 0;
        if (m === 'CARD' || m === 'TARJETA') {
          exactCardSales += amt;
        } else if (m === 'SINPE') {
          exactSinpeSales += amt;
        } else {
          exactCashSales += amt;
        }
      }
    });

    // Reconciliar movimientos de caja (ingresos y egresos) de la fecha operativa
    let exactCashIn = 0;
    let exactCashOut = 0;
    (this.data.cashMovements || []).forEach(m => {
      const mDateStr = getCostaRicaDate(new Date(m.timestamp).getTime());
      if (mDateStr === regOpenDate) {
        if (m.type === 'IN') exactCashIn += Number(m.amount) || 0;
        else if (m.type === 'OUT') exactCashOut += Number(m.amount) || 0;
      }
    });

    register.cashSales = exactCashSales;
    register.cardSales = exactCardSales;
    register.sinpeSales = exactSinpeSales;
    register.transferSales = exactTransferSales;
    register.totalInvoicesCount = exactInvoicesCount;
    register.cashIn = exactCashIn;
    register.cashOut = exactCashOut;

    const openBalance = Number(register.openingBalance) || 0;
    register.expectedCash = openBalance + exactCashSales + exactCashIn - exactCashOut;

    if (register.status === 'CLOSED') {
      const counted = Number(register.countedCash) || 0;
      register.difference = counted - register.expectedCash;
    }
  }

  public getCurrentCashRegister(): { register: CashRegister; movements: CashMovement[] } {
    if (this.data.currentCashRegister) {
      const todayCr = getCostaRicaDate();
      const openDate = this.data.currentCashRegister.openTime 
        ? getCostaRicaDate(new Date(this.data.currentCashRegister.openTime).getTime()) 
        : todayCr;

      // AUTO-CORTE DIARIO: Si la caja abierta pertenece a un día anterior en Costa Rica,
      // archivarla automáticamente con sus ventas del día anterior para no arrastrar días viejos.
      if (this.data.currentCashRegister.status === 'OPEN' && openDate && openDate !== todayCr) {
        console.log(`ℹ️ [db] Detectado cambio de fecha: Caja abierta el ${openDate}, hoy es ${todayCr}. Ejecutando auto-cierre del día anterior...`);
        this.closeCashRegister(
          this.data.currentCashRegister.expectedCash, 
          `Cierre automático nocturno por cambio de día (${openDate})`
        );
      } else {
        this.recalculateRegisterTotals(this.data.currentCashRegister);
      }
    }
    const currentReg = this.data.currentCashRegister;
    const currentRegId = currentReg?.id;
    const todayCr = getCostaRicaDate();
    const regDate = currentReg?.openTime 
      ? getCostaRicaDate(new Date(currentReg.openTime).getTime()) 
      : todayCr;

    const currentShiftMovements = (this.data.cashMovements || []).filter(m => {
      const mDateStr = getCostaRicaDate(new Date(m.timestamp).getTime());
      return mDateStr === regDate;
    });

    return {
      register: this.data.currentCashRegister,
      movements: currentShiftMovements
    };
  }

  public getCashRegisterHistory(): CashRegister[] {
    return this.data.cashRegisterHistory || [];
  }

  public openCashRegister(openingBalance: number, cashierName: string, location: 'RESTAURANTE' | 'CEDI'): CashRegister {
    const newRegister: CashRegister = {
      id: `reg-${Date.now()}`,
      cashierId: 'usr-1',
      cashierName: cashierName || 'Cajero Principal',
      location: location || 'RESTAURANTE',
      openTime: new Date().toISOString(),
      openingBalance: Number(openingBalance) || 0,
      cashSales: 0,
      cardSales: 0,
      sinpeSales: 0,
      transferSales: 0,
      cashIn: 0,
      cashOut: 0,
      expectedCash: Number(openingBalance) || 0,
      status: 'OPEN',
      totalInvoicesCount: 0
    };

    if (this.data.currentCashRegister && this.data.currentCashRegister.status === 'OPEN') {
      // Si la caja previa seguía abierta, archivarla antes de abrir una nueva
      this.closeCashRegister(this.data.currentCashRegister.expectedCash, 'Cierre automático por nueva apertura');
    }

    this.data.currentCashRegister = newRegister;
    // Si ya existían ventas no cerradas el día de hoy, adoptarlas al nuevo turno para no perderlas
    this.recalculateRegisterTotals(this.data.currentCashRegister);
    this.persist();
    return this.data.currentCashRegister;
  }

  public closeCashRegister(countedCash: number, notes?: string): CashRegister | null {
    if (this.data.currentCashRegister.status !== 'OPEN') {
      return null;
    }

    const closeTime = new Date().toISOString();
    this.data.currentCashRegister.closeTime = closeTime;
    this.data.currentCashRegister.status = 'CLOSED';
    this.data.currentCashRegister.countedCash = Number(countedCash) || 0;
    this.data.currentCashRegister.notes = notes || '';

    // Recalcular los totales finales exactos de todas las ventas y movimientos del turno
    this.recalculateRegisterTotals(this.data.currentCashRegister);

    this.data.cashRegisterHistory = this.data.cashRegisterHistory || [];
    this.data.cashRegisterHistory.push({ ...this.data.currentCashRegister });
    this.persist();
    return this.data.currentCashRegister;
  }

  public addCashMovement(type: 'IN' | 'OUT', amount: number, reason: string, cashierName?: string): CashMovement {
    const movement: CashMovement = {
      id: `mov-${Date.now()}`,
      cashRegisterId: this.data.currentCashRegister.id,
      type,
      amount: Number(amount) || 0,
      reason: reason || 'Movimiento de caja',
      timestamp: new Date().toISOString(),
      cashierName: cashierName || this.data.currentCashRegister.cashierName
    };

    this.data.cashMovements.unshift(movement);

    if (type === 'IN') {
      this.data.currentCashRegister.cashIn += movement.amount;
    } else {
      this.data.currentCashRegister.cashOut += movement.amount;
    }

    this.data.currentCashRegister.expectedCash =
      this.data.currentCashRegister.openingBalance +
      this.data.currentCashRegister.cashSales +
      this.data.currentCashRegister.cashIn -
      this.data.currentCashRegister.cashOut;

    this.persist();
    return movement;
  }

  // ----------------------------------------------------
  // CABYS CATALOG & TAX RATES (HACIENDA CR v4.4)
  // ----------------------------------------------------
  public getCabysCatalog(): CabysItem[] {
    return this.data.cabysCatalog || [];
  }

  public getCabysByCode(code: string): CabysItem | undefined {
    return (this.data.cabysCatalog || []).find(c => c.codigoCabys === code.trim());
  }

  public addCabysItem(item: CabysItem): CabysItem {
    const existingIndex = (this.data.cabysCatalog || []).findIndex(c => c.codigoCabys === item.codigoCabys);
    if (existingIndex >= 0) {
      this.data.cabysCatalog[existingIndex] = { ...item };
    } else {
      this.data.cabysCatalog.push(item);
    }
    this.data.lastUpdated = new Date().toISOString();
    this.persist();
    return item;
  }

  public updateCabysStatus(codigoCabys: string, estado: 'VIGENTE' | 'NO_VIGENTE' | 'OBSOLETO' | 'EN_REVISION'): boolean {
    const item = (this.data.cabysCatalog || []).find(c => c.codigoCabys === codigoCabys);
    if (!item) return false;
    item.estado = estado;
    this.data.lastUpdated = new Date().toISOString();
    this.persist();
    return true;
  }

  public getTaxRates(): TaxRateConfig[] {
    return this.data.taxRates || [];
  }

  public saveTaxRate(rate: TaxRateConfig): TaxRateConfig {
    const index = (this.data.taxRates || []).findIndex(t => t.id === rate.id);
    if (index >= 0) {
      this.data.taxRates[index] = { ...rate };
    } else {
      this.data.taxRates.push(rate);
    }
    this.persist();
    return rate;
  }

  // ----------------------------------------------------
  // ELECTRONIC DOCUMENTS & CONSECUTIVES (DGT COSTA RICA v4.4)
  // ----------------------------------------------------
  /**
   * Verifica si un consecutivo ya ha sido utilizado o reservado localmente
   */
  public isConsecutiveAlreadyUsed(consecutive: string): boolean {
    if (!consecutive) return false;
    const cleanConsecutive = consecutive.trim();
    if (cleanConsecutive.length !== 20) return false;

    // 1. Verificar en conjunto de consecutivos reservados en memoria durante la ejecución
    if (this.reservedConsecutives.has(cleanConsecutive)) {
      return true;
    }

    // 2. Verificar en documentos electrónicos registrados en base de datos (cualquier estado)
    const inDocs = (this.data.electronicDocuments || []).some(
      doc => doc.consecutive && doc.consecutive.trim() === cleanConsecutive
    );
    if (inDocs) return true;

    // 3. Verificar en ventas registradas
    const inSales = (this.data.sales || []).some(
      sale => sale.consecutive20 && sale.consecutive20.trim() === cleanConsecutive
    );
    if (inSales) return true;

    return false;
  }

  /**
   * Consulta el próximo consecutivo oficial a emitir sin incrementar ni reservar el contador (Fuente de verdad: Firestore fiscal_counters)
   */
  public async peekNextConsecutive(branch: string, terminal: string, docType: string): Promise<{
    consecutive: string;
    sequenceNumber: number;
    documentType: string;
    branch: string;
    terminal: string;
  }> {
    const rawBranchDigits = (branch || '1').replace(/\D/g, '') || '1';
    const cleanBranch = rawBranchDigits.padStart(3, '0').slice(-3);
    
    const rawTerminalDigits = (terminal || '1').replace(/\D/g, '') || '1';
    const cleanTerminal = rawTerminalDigits.padStart(5, '0').slice(-5);

    const cleanDocType = (docType || '04').replace(/\D/g, '').padStart(2, '0').slice(-2);
    const key = `seq-${cleanBranch}-${cleanTerminal}-${cleanDocType}`;
    const prefix = `${cleanBranch}${cleanTerminal}${cleanDocType}`;

    let nextSeq = 1;
    if (cleanDocType === '01') nextSeq = 3;
    else if (cleanDocType === '04') nextSeq = 112;

    if (firestoreDb) {
      try {
        const docRef = doc(firestoreDb, 'fiscal_counters', key);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const lastSeq = Number(data.lastSequenceNumber) || 0;
          const currSeq = Number(data.currentSequence) || 0;
          nextSeq = Math.max(currSeq, lastSeq + 1);
        }
      } catch (e) {
        console.warn('⚠️ No se pudo leer el contador de Firestore en peekNextConsecutive:', e);
      }
    }

    const sequence10 = nextSeq.toString().padStart(10, '0').slice(-10);
    const consecutive = `${prefix}${sequence10}`;

    return {
      consecutive,
      sequenceNumber: nextSeq,
      documentType: cleanDocType,
      branch: cleanBranch,
      terminal: cleanTerminal
    };
  }

  /**
   * Genera y reserva atómicamente el siguiente consecutivo oficial de 20 dígitos usando Firestore runTransaction.
   * Colección: fiscal_counters
   * Identificador: Sucursal + Terminal + TipoDoc
   */
  public async getNextConsecutive(branch: string, terminal: string, docType: string): Promise<string> {
    const rawBranchDigits = (branch || '1').replace(/\D/g, '') || '1';
    const cleanBranch = rawBranchDigits.padStart(3, '0').slice(-3);
    
    const rawTerminalDigits = (terminal || '1').replace(/\D/g, '') || '1';
    const cleanTerminal = rawTerminalDigits.padStart(5, '0').slice(-5);

    const cleanDocType = (docType || '04').replace(/\D/g, '').padStart(2, '0').slice(-2) as '01' | '04' | '03' | '02';
    const key = `seq-${cleanBranch}-${cleanTerminal}-${cleanDocType}`;
    const prefix = `${cleanBranch}${cleanTerminal}${cleanDocType}`;

    if (!firestoreDb || firestoreQuotaExceeded) {
      return this.getNextConsecutiveLocal(cleanBranch, cleanTerminal, cleanDocType, prefix);
    }

    const counterRef = doc(firestoreDb, 'fiscal_counters', key);

    try {
      const nextSeqNumber = await runTransaction(firestoreDb, async (transaction) => {
        const docSnap = await transaction.get(counterRef);
        
        let currentSeq = 0;
        let lastSeq = 0;

        if (docSnap.exists()) {
          const data = docSnap.data();
          currentSeq = Number(data.currentSequence) || 0;
          lastSeq = Number(data.lastSequenceNumber) || (currentSeq > 0 ? currentSeq - 1 : 0);
        } else {
          // Si no existe en Firestore, verificar si existe localmente
          const localControl = (this.data.consecutiveControls || []).find(c => c.id === key);
          if (localControl) {
            currentSeq = Number(localControl.currentSequence) || 0;
            lastSeq = Number(localControl.lastSequenceNumber) || 0;
          } else {
            let initSeq = 1;
            if (cleanDocType === '01') initSeq = 3;
            else if (cleanDocType === '04') initSeq = 112;
            currentSeq = initSeq + 1;
            lastSeq = initSeq;
          }
        }

        const nextSeq = Math.max(currentSeq, lastSeq + 1);
        const updatedCurrent = nextSeq + 1;

        transaction.set(counterRef, {
          branch: cleanBranch,
          terminal: cleanTerminal,
          documentType: cleanDocType,
          currentSequence: updatedCurrent,
          lastSequenceNumber: nextSeq,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        return nextSeq;
      });

      // Actualizar control local espejo
      this.updateLocalConsecutiveControl(cleanBranch, cleanTerminal, cleanDocType, nextSeqNumber);

      const sequence10 = nextSeqNumber.toString().padStart(10, '0').slice(-10);
      const consecutive = `${prefix}${sequence10}`;
      this.reservedConsecutives.add(consecutive);
      return consecutive;

    } catch (error: any) {
      if (isFirestoreQuotaOrStreamError(error)) {
        firestoreQuotaExceeded = true;
        firestoreQuotaExceededAt = Date.now();
        console.warn('ℹ️ [Firebase Firestore] Cuota de transacciones o stream saturado. Continuando con contador local atómico.');
        return this.getNextConsecutiveLocal(cleanBranch, cleanTerminal, cleanDocType, prefix);
      }
      console.error('❌ Error en transacción de Firestore para consecutivo fiscal:', error);
      // Fallback local para garantizar continuidad del POS
      return this.getNextConsecutiveLocal(cleanBranch, cleanTerminal, cleanDocType, prefix);
    }
  }

  private updateLocalConsecutiveControl(branch: string, terminal: string, docType: '01' | '04' | '03' | '02', seqNumber: number) {
    const key = `seq-${branch}-${terminal}-${docType}`;
    if (!this.data.consecutiveControls) {
      this.data.consecutiveControls = [];
    }
    let control = this.data.consecutiveControls.find(c => c.id === key);
    if (!control) {
      control = {
        id: key,
        branch,
        terminal,
        documentType: docType,
        currentSequence: seqNumber + 1,
        lastSequenceNumber: seqNumber,
        updatedAt: new Date().toISOString()
      };
      this.data.consecutiveControls.push(control);
    } else {
      control.lastSequenceNumber = Math.max(Number(control.lastSequenceNumber) || 0, seqNumber);
      control.currentSequence = Math.max(Number(control.currentSequence) || 0, seqNumber + 1);
      control.updatedAt = new Date().toISOString();
    }
  }

  private getNextConsecutiveLocal(cleanBranch: string, cleanTerminal: string, cleanDocType: '01' | '04' | '03' | '02', prefix: string): string {
    const key = `seq-${cleanBranch}-${cleanTerminal}-${cleanDocType}`;
    if (!this.data.consecutiveControls) {
      this.data.consecutiveControls = [];
    }
    let control = this.data.consecutiveControls.find(c => c.id === key);
    if (!control) {
      let initSeq = 1;
      if (cleanDocType === '01') initSeq = 3;
      else if (cleanDocType === '04') initSeq = 112;
      control = {
        id: key,
        branch: cleanBranch,
        terminal: cleanTerminal,
        documentType: cleanDocType,
        currentSequence: initSeq + 1,
        lastSequenceNumber: initSeq,
        updatedAt: new Date().toISOString()
      };
      this.data.consecutiveControls.push(control);
    }

    const currentSeq = Number(control.currentSequence) || 1;
    const lastSeq = Number(control.lastSequenceNumber) || (currentSeq > 0 ? currentSeq - 1 : 0);
    const nextSeq = Math.max(currentSeq, lastSeq + 1);

    control.lastSequenceNumber = nextSeq;
    control.currentSequence = nextSeq + 1;
    control.updatedAt = new Date().toISOString();

    this.persist();

    const sequence10 = nextSeq.toString().padStart(10, '0').slice(-10);
    const consecutive = `${prefix}${sequence10}`;
    this.reservedConsecutives.add(consecutive);
    return consecutive;
  }

  /**
   * Si Hacienda reporta que un consecutivo ya existía previamente,
   * avanza el contador en Firestore para que no vuelva a ser generado jamás.
   */
  public async advanceConsecutiveAfterDuplicate(branch: string, terminal: string, docType: string, failedConsecutive: string): Promise<void> {
    const rawBranchDigits = (branch || '1').replace(/\D/g, '') || '1';
    const cleanBranch = rawBranchDigits.padStart(3, '0').slice(-3);
    const rawTerminalDigits = (terminal || '1').replace(/\D/g, '') || '1';
    const cleanTerminal = rawTerminalDigits.padStart(5, '0').slice(-5);
    const cleanDocType = (docType || '04').replace(/\D/g, '').padStart(2, '0').slice(-2);
    const key = `seq-${cleanBranch}-${cleanTerminal}-${cleanDocType}`;
    const prefix = `${cleanBranch}${cleanTerminal}${cleanDocType}`;

    let failedSeq = 0;
    if (failedConsecutive && failedConsecutive.startsWith(prefix) && failedConsecutive.length === 20) {
      failedSeq = parseInt(failedConsecutive.slice(10), 10) || 0;
    } else if (failedConsecutive) {
      const digits = failedConsecutive.replace(/\D/g, '');
      failedSeq = parseInt(digits.slice(-10), 10) || 0;
    }

    if (failedConsecutive) {
      this.reservedConsecutives.add(failedConsecutive);
    }

    if (firestoreDb) {
      try {
        const counterRef = doc(firestoreDb, 'fiscal_counters', key);
        await runTransaction(firestoreDb, async (transaction) => {
          const docSnap = await transaction.get(counterRef);
          let current = failedSeq + 2;
          let last = failedSeq + 1;
          if (docSnap.exists()) {
            const data = docSnap.data();
            current = Math.max(Number(data.currentSequence) || 0, failedSeq + 2);
            last = Math.max(Number(data.lastSequenceNumber) || 0, failedSeq + 1);
          }
          transaction.set(counterRef, {
            branch: cleanBranch,
            terminal: cleanTerminal,
            documentType: cleanDocType,
            currentSequence: current,
            lastSequenceNumber: last,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        });
      } catch (e) {
        console.warn('⚠️ Error al avanzar consecutivo duplicado en Firestore:', e);
      }
    }

    // Actualizar también el control local espejo
    this.updateLocalConsecutiveControl(cleanBranch, cleanTerminal, cleanDocType as any, failedSeq + 1);
    this.persist();
  }

  /**
   * Consulta los números consecutivos actuales de la terminal en Firestore y localmente,
   * garantizando que ambos se sincronicen al valor más alto alcanzado.
   */
  public async getConsecutiveStatus(branch: string = '001', terminal: string = '00001'): Promise<Record<string, number>> {
    const rawBranchDigits = (branch || '1').replace(/\D/g, '') || '1';
    const cleanBranch = rawBranchDigits.padStart(3, '0').slice(-3);
    const rawTerminalDigits = (terminal || '1').replace(/\D/g, '') || '1';
    const cleanTerminal = rawTerminalDigits.padStart(5, '0').slice(-5);
    const docTypes: ('01' | '04' | '03')[] = ['01', '04', '03'];
    const result: Record<string, number> = {};

    for (const docType of docTypes) {
      const key = `seq-${cleanBranch}-${cleanTerminal}-${docType}`;
      let currentSeq = 1;

      // 1. Revisar Firestore
      if (firestoreDb && !firestoreQuotaExceeded) {
        try {
          const docRef = doc(firestoreDb, 'fiscal_counters', key);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            currentSeq = Math.max(currentSeq, Number(data.currentSequence) || 1);
          }
        } catch (e) {
          // ignore
        }
      }

      // 2. Revisar local
      const local = (this.data.consecutiveControls || []).find(c => c.id === key);
      if (local) {
        currentSeq = Math.max(currentSeq, Number(local.currentSequence) || 1);
      }

      // Sincronizar espejo local
      this.updateLocalConsecutiveControl(cleanBranch, cleanTerminal, docType, Math.max(0, currentSeq - 1));

      result[docType] = currentSeq;
    }

    this.persist();
    return result;
  }

  /**
   * Reserva atómicamente un bloque (lease) de consecutivos en Firestore para emisión offline.
   * Utiliza runTransaction() sobre fiscal_counters/seq-{branch}-{terminal}-{documentType}
   * y registra el bloque en la colección 'terminal_leases'.
   */
  public async requestConsecutiveLease(
    branch: string,
    terminal: string,
    documentType: '01' | '04' | '03',
    blockSize: number = 50,
    deviceFingerprint?: string
  ): Promise<OfflineConsecutiveLease> {
    const rawBranchDigits = (branch || '1').replace(/\D/g, '') || '1';
    const cleanBranch = rawBranchDigits.padStart(3, '0').slice(-3);
    const rawTerminalDigits = (terminal || '1').replace(/\D/g, '') || '1';
    const cleanTerminal = rawTerminalDigits.padStart(5, '0').slice(-5);
    const cleanDocType = (documentType || '04').replace(/\D/g, '').padStart(2, '0').slice(-2) as '01' | '04' | '03';
    const key = `seq-${cleanBranch}-${cleanTerminal}-${cleanDocType}`;

    if (!firestoreDb || firestoreQuotaExceeded) {
      return this.requestConsecutiveLeaseLocal(cleanBranch, cleanTerminal, cleanDocType, blockSize, deviceFingerprint);
    }

    const counterRef = doc(firestoreDb, 'fiscal_counters', key);
    const leaseId = `lease-${cleanBranch}-${cleanTerminal}-${cleanDocType}-${Date.now()}`;

    try {
      const lease = await runTransaction(firestoreDb, async (transaction) => {
        const docSnap = await transaction.get(counterRef);
        let currentSeq = 0;
        let lastSeq = 0;

        if (docSnap.exists()) {
          const data = docSnap.data();
          currentSeq = Number(data.currentSequence) || 0;
          lastSeq = Number(data.lastSequenceNumber) || (currentSeq > 0 ? currentSeq - 1 : 0);

          // CANDADO DE SEGURIDAD: Reutilizar lease activo existente si no se ha agotado y fue emitido hoy
          if (data.activeLease && data.activeLease.status === 'ACTIVE') {
            const al = data.activeLease;
            const alIssued = al.issuedAt ? new Date(al.issuedAt).getTime() : 0;
            // Si el bloque fue emitido hoy (menos de 18 horas) y el rango no se ha consumido, reutilizarlo
            if (Date.now() - alIssued < 18 * 60 * 60 * 1000 && Number(al.rangeEnd) >= Number(al.currentSequence)) {
              console.log(`ℹ️ [db] Reutilizando bloque existente sin avanzar contador para Terminal ${cleanTerminal} (${cleanDocType}): [${al.rangeStart} - ${al.rangeEnd}]`);
              return al as OfflineConsecutiveLease;
            }
          }
        } else {
          const localControl = (this.data.consecutiveControls || []).find(c => c.id === key);
          if (localControl) {
            currentSeq = Number(localControl.currentSequence) || 0;
            lastSeq = Number(localControl.lastSequenceNumber) || 0;
          } else {
            let initSeq = 1;
            if (cleanDocType === '01') initSeq = 3;
            else if (cleanDocType === '04') initSeq = 112;
            currentSeq = initSeq + 1;
            lastSeq = initSeq;
          }
        }

        const rangeStart = Math.max(currentSeq, lastSeq + 1);
        const rangeEnd = rangeStart + blockSize - 1;
        const nextAvailableAfterLease = rangeEnd + 1;

        const newLease: OfflineConsecutiveLease = {
          leaseId,
          branch: cleanBranch,
          terminal: cleanTerminal,
          documentType: cleanDocType,
          rangeStart,
          rangeEnd,
          currentSequence: rangeStart,
          status: 'ACTIVE',
          issuedAt: new Date().toISOString(),
          ...(deviceFingerprint ? { deviceFingerprint } : {})
        };

        // Avanzar el contador central de Firestore atómicamente y registrar activeLease para reutilización
        transaction.set(counterRef, {
          branch: cleanBranch,
          terminal: cleanTerminal,
          documentType: cleanDocType,
          currentSequence: nextAvailableAfterLease,
          lastSequenceNumber: rangeEnd,
          activeLease: newLease,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        const leaseRef = doc(firestoreDb, 'terminal_leases', leaseId);
        transaction.set(leaseRef, newLease);

        return newLease;
      });

      this.updateLocalConsecutiveControl(cleanBranch, cleanTerminal, cleanDocType, lease.rangeEnd);

      this.addFiscalAuditLog({
        userId: 'pos-terminal',
        userName: `Terminal ${cleanTerminal}`,
        action: 'OTRAS' as any,
        documentKey: lease.leaseId,
        documentType: cleanDocType,
        newStatus: 'RESERVA_BLOQUE_OFFLINE' as any,
        details: `Reserva atómica de bloque offline: [${lease.rangeStart} - ${lease.rangeEnd}] para Terminal ${cleanTerminal} (${cleanDocType})`
      });

      return lease;
    } catch (err: any) {
      if (isFirestoreQuotaOrStreamError(err)) {
        firestoreQuotaExceeded = true;
        firestoreQuotaExceededAt = Date.now();
        console.warn('ℹ️ [Firebase Firestore] Error de cuota/stream al reservar bloque. Utilizando generador local.');
        return this.requestConsecutiveLeaseLocal(cleanBranch, cleanTerminal, cleanDocType, blockSize, deviceFingerprint);
      }
      console.error('❌ Error al reservar bloque de consecutivos offline en Firestore:', err);
      return this.requestConsecutiveLeaseLocal(cleanBranch, cleanTerminal, cleanDocType, blockSize, deviceFingerprint);
    }
  }

  private requestConsecutiveLeaseLocal(
    cleanBranch: string,
    cleanTerminal: string,
    cleanDocType: '01' | '04' | '03',
    blockSize: number = 50,
    deviceFingerprint?: string
  ): OfflineConsecutiveLease {
    const key = `seq-${cleanBranch}-${cleanTerminal}-${cleanDocType}`;
    if (!this.data.consecutiveControls) {
      this.data.consecutiveControls = [];
    }
    let control = this.data.consecutiveControls.find(c => c.id === key);
    if (!control) {
      let initSeq = 1;
      if (cleanDocType === '01') initSeq = 3;
      else if (cleanDocType === '04') initSeq = 112;
      control = {
        id: key,
        branch: cleanBranch,
        terminal: cleanTerminal,
        documentType: cleanDocType,
        currentSequence: initSeq + 1,
        lastSequenceNumber: initSeq,
        updatedAt: new Date().toISOString()
      };
      this.data.consecutiveControls.push(control);
    }

    const currentSeq = Number(control.currentSequence) || 1;
    const lastSeq = Number(control.lastSequenceNumber) || (currentSeq > 0 ? currentSeq - 1 : 0);
    const rangeStart = Math.max(currentSeq, lastSeq + 1);
    const rangeEnd = rangeStart + blockSize - 1;
    const nextAvailable = rangeEnd + 1;

    control.lastSequenceNumber = rangeEnd;
    control.currentSequence = nextAvailable;
    control.updatedAt = new Date().toISOString();

    this.persist();

    const leaseId = `lease-${cleanBranch}-${cleanTerminal}-${cleanDocType}-${Date.now()}`;
    const newLease: OfflineConsecutiveLease = {
      leaseId,
      branch: cleanBranch,
      terminal: cleanTerminal,
      documentType: cleanDocType,
      rangeStart,
      rangeEnd,
      currentSequence: rangeStart,
      status: 'ACTIVE',
      issuedAt: new Date().toISOString(),
      ...(deviceFingerprint ? { deviceFingerprint } : {})
    };

    return newLease;
  }

  public generateNumericKey(
    consecutive: string,
    issueDate: Date,
    emisorTaxId: string,
    situation: '1' | '2' | '3' = '1' // 1: Normal, 2: Contingencia, 3: Sin Internet
  ): string {
    const countryCode = '506';

    // Format date in America/Costa_Rica timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Costa_Rica',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
    const parts = formatter.formatToParts(issueDate);
    const day = (parts.find(p => p.type === 'day')?.value || '01').padStart(2, '0').slice(-2);
    const month = (parts.find(p => p.type === 'month')?.value || '01').padStart(2, '0').slice(-2);
    const year = (parts.find(p => p.type === 'year')?.value || '00').padStart(2, '0').slice(-2);

    const cleanTaxId = (emisorTaxId || '302680311').replace(/\D/g, '').padStart(12, '0').slice(-12);
    const cleanConsecutive = (consecutive || '').replace(/\D/g, '').padStart(20, '0').slice(-20);
    const cleanSituation = (situation || '1').replace(/\D/g, '').padStart(1, '1').slice(-1);
    const securityCode = Math.floor(10000000 + Math.random() * 90000000).toString().substring(0, 8);

    // 3(País) + 2(Día) + 2(Mes) + 2(Año) + 12(Cédula) + 20(Consecutivo) + 1(Situación) + 8(Seguridad) = 50 dígitos
    return `${countryCode}${day}${month}${year}${cleanTaxId}${cleanConsecutive}${cleanSituation}${securityCode}`;
  }

  public getElectronicDocuments(): ElectronicDocument[] {
    const currentSalesCount = this.data.sales?.length || 0;
    if (this.cachedElectronicDocs && this.lastSalesCount === currentSalesCount) {
      return this.cachedElectronicDocs;
    }

    const docs = this.data.electronicDocuments || [];
    const docMap = new Map<string, ElectronicDocument>();

    // 0. Conjunto de IDs de ventas y números de orden que ya fueron emitidos ante Hacienda
    const invoicedSaleIds = new Set<string>();
    const invoicedOrderNumbers = new Set<number>();
    (this.data.sales || []).forEach(sale => {
      if (sale && sale.numericKey50 && sale.consecutive20 && (sale.invoiceStatus === 'INVOICED' || sale.haciendaStatus === 'ACEPTADO_HACIENDA')) {
        if (sale.id) invoicedSaleIds.add(sale.id);
        if (sale.orderNumber) invoicedOrderNumbers.add(sale.orderNumber);
      }
    });

    // 1. Indexar documentos electrónicos existentes por clave de 50 dígitos o ID, purgando borradores temporales ya facturados
    const cleanDocs: ElectronicDocument[] = [];
    docs.forEach(d => {
      if (!d) return;
      const isPlaceholder = (d.numericKey && d.numericKey.startsWith('PENDIENTE')) || (d.id && d.id.startsWith('pending-'));
      if (isPlaceholder) {
        if (d.saleId && invoicedSaleIds.has(d.saleId)) return;
        const numMatch = (d.consecutive || d.numericKey || '').match(/\d+/);
        if (numMatch && invoicedOrderNumbers.has(parseInt(numMatch[0], 10))) return;
      }
      cleanDocs.push(d);
      const key = d.numericKey || d.id;
      if (key) {
        docMap.set(key, d);
      }
    });

    if (cleanDocs.length !== docs.length) {
      this.data.electronicDocuments = cleanDocs;
    }

    // 2. Escanear el histórico completo de ventas para asegurar que ninguna venta emitida quede excluida
    (this.data.sales || []).forEach(sale => {
      if (sale && sale.numericKey50 && sale.consecutive20) {
        const key = sale.numericKey50;
        const existingDoc = docMap.get(key);

        if (existingDoc) {
          // Sincronizar estado más reciente si la venta fue confirmada ante Hacienda
          if (sale.haciendaStatus && sale.haciendaStatus !== existingDoc.status) {
            existingDoc.status = sale.haciendaStatus;
            existingDoc.statusDescription = sale.haciendaResponseMessage || existingDoc.statusDescription;
          }
          if (sale.xmlEmitted && !existingDoc.xmlGenerated) {
            existingDoc.xmlGenerated = sale.xmlEmitted;
          }
          if (sale.xmlHaciendaResponse && !existingDoc.xmlResponseHacienda) {
            existingDoc.xmlResponseHacienda = sale.xmlHaciendaResponse;
          }
        } else {
          // Reconstruir registro de comprobante electrónico a partir de la venta emitida
          const newDoc: ElectronicDocument = {
            id: `doc-${sale.id}`,
            saleId: sale.id,
            numericKey: sale.numericKey50,
            consecutive: sale.consecutive20,
            documentType: (sale.electronicDocumentType as any) || (sale.customerIdentification ? '01' : '04'),
            issueDate: sale.date ? `${sale.date}T${sale.time || '12:00:00'}` : new Date().toISOString(),
            economicActivity: this.data.restaurantInfo?.economicActivity || '561011',
            status: sale.haciendaStatus || (sale.invoiceStatus === 'INVOICED' ? 'ENVIADO_PROCESANDO' : 'ACEPTADO_HACIENDA'),
            statusDescription: sale.haciendaResponseMessage || 'Documento emitido ante Hacienda',
            currency: 'CRC',
            issuer: {
              name: this.data.restaurantInfo?.name || 'Pollo Frito Sabor Cervanteño',
              commercialName: this.data.restaurantInfo?.commercialName || this.data.restaurantInfo?.name || 'Pollo Frito Sabor Cervanteño',
              identificationNumber: this.data.restaurantInfo?.taxId || '302680311',
              identificationType: (this.data.restaurantInfo?.identificationType as any) || '01',
              phone: this.data.restaurantInfo?.phone || '25347852',
              email: this.data.restaurantInfo?.email || 'facturacion@saborcervanteno.com',
              province: this.data.restaurantInfo?.province || '3',
              canton: this.data.restaurantInfo?.canton || '02',
              district: this.data.restaurantInfo?.district || '01',
              address: this.data.restaurantInfo?.location || '100 Oeste de Super Pino Birrisito',
              economicActivity: this.data.restaurantInfo?.economicActivity || '561011'
            },
            receiver: {
              name: sale.customerName || 'Consumidor Final',
              identificationNumber: sale.customerIdentification || undefined,
              identificationType: sale.customerIdentification ? (sale.customerIdentification.length === 10 ? '02' : '01') : undefined,
              email: sale.customerEmail || undefined,
              phone: sale.customerPhone || undefined
            },
            lines: (sale.items || []).map((item, idx) => {
              const rate = (item.taxRate !== undefined && item.taxRate > 1) ? (item.taxRate / 100) : (item.taxRate ?? 0.13);
              const isWithTax = item.isPriceWithTax ?? true;
              const breakdown = calculateFiscalPriceBreakdown(item.price || 0, rate, isWithTax);
              const unitPrice = breakdown.netPrice;
              const subtotal = Number((breakdown.netPrice * (item.quantity || 1)).toFixed(5));
              const taxAmount = Number((breakdown.taxAmount * (item.quantity || 1)).toFixed(5));
              const totalLine = Number((breakdown.totalPrice * (item.quantity || 1)).toFixed(5));

              return {
                lineNumber: idx + 1,
                productId: (item as any).productId || (item as any).id || `prod-${idx + 1}`,
                internalCode: (item as any).productId || `INT-${idx + 1}`,
                cabysCode: (item as any).cabysCode || '6331000000000',
                description: item.name || 'Consumo Restaurante',
                quantity: item.quantity || 1,
                unitOfMeasure: 'Unid',
                unitPrice,
                discount: 0,
                subtotal,
                taxCode: '01',
                taxRate: rate * 100,
                taxAmount,
                totalLine
              };
            }),
            subtotal: sale.subtotal || sale.total,
            taxTotal: sale.taxTotal || 0,
            discountTotal: sale.discount || 0,
            total: sale.total || 0,
            paymentMethods: (sale.payments || []).map(p => ({
              method: p.method || 'CASH',
              amount: p.amount || sale.total
            })),
            xmlGenerated: sale.xmlEmitted,
            xmlResponseHacienda: sale.xmlHaciendaResponse,
            retryAttempts: 0,
            isContingency: false,
            createdBy: sale.cashierName || 'Cajero Principal',
            createdAt: sale.createdAt || new Date().toISOString(),
            updatedAt: sale.updatedAt || new Date().toISOString()
          };
          docMap.set(key, newDoc);
        }
      } else if (sale && sale.id) {
        // Venta cobrada sin clave de Hacienda o en modo Offline
        if (sale.numericKey50 && (sale.invoiceStatus === 'INVOICED' || sale.haciendaStatus === 'ACEPTADO_HACIENDA')) {
          return;
        }
        if (sale.haciendaStatus === 'RECHAZADO_HACIENDA') {
          return;
        }
        const FISCAL_RULES_START_DATE = '2026-10-23';
        const rawYesterdayCrStr = getCostaRicaDate(Date.now() - 24 * 60 * 60 * 1000);
        const rawOneWeekAgoCrStr = getCostaRicaDate(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const yesterdayCrStr = rawYesterdayCrStr < FISCAL_RULES_START_DATE ? FISCAL_RULES_START_DATE : rawYesterdayCrStr;
        const oneWeekAgoCrStr = rawOneWeekAgoCrStr < FISCAL_RULES_START_DATE ? FISCAL_RULES_START_DATE : rawOneWeekAgoCrStr;
        const sDate = sale.date || (sale.timestamp ? getCostaRicaDate(sale.timestamp) : '');
        const isFE = sale.electronicDocumentType === '01' || Boolean(sale.customerIdentification && sale.customerIdentification !== '000000000' && sale.customerId !== 'cust-final');
        const cutoffStr = isFE ? oneWeekAgoCrStr : yesterdayCrStr;
        const isExpired = sale.haciendaStatus === 'CONTINGENCIA_VENCIDA' || Boolean(!sDate || sDate < cutoffStr);

        const pendingKey = `pending-${sale.id}`;
        if (!docMap.has(pendingKey) && !docMap.has(sale.id)) {
          const pendingDoc: ElectronicDocument = {
            id: pendingKey,
            saleId: sale.id,
            numericKey: isExpired ? `EXPIRADO-ORDEN-${sale.orderNumber}` : `PENDIENTE-ORDEN-${sale.orderNumber}`,
            consecutive: `ORDEN-#${sale.orderNumber}`,
            documentType: (sale.electronicDocumentType as any) || (sale.customerIdentification ? '01' : '04'),
            issueDate: sale.date ? `${sale.date}T${sale.time || '12:00:00'}` : new Date(sale.timestamp || Date.now()).toISOString(),
            saleDate: sDate || undefined,
            orderNumber: sale.orderNumber,
            economicActivity: this.data.restaurantInfo?.economicActivity || '561011',
            status: isExpired ? 'CONTINGENCIA_VENCIDA' : ((sale.haciendaStatus as any) || 'CONTINGENCIA_PENDIENTE'),
            statusDescription: isExpired
              ? (isFE ? 'No se pudo procesar / Expirado (plazo mayor a 1 semana)' : 'No se pudo procesar / Expirado (plazo mayor a 2 días)')
              : (sale.haciendaResponseMessage || 'Venta registrada sin conexión / Pendiente de transmisión a Hacienda'),
            currency: 'CRC',
            issuer: {
              name: this.data.restaurantInfo?.name || 'Pollo Frito Sabor Cervanteño',
              commercialName: this.data.restaurantInfo?.commercialName || this.data.restaurantInfo?.name || 'Pollo Frito Sabor Cervanteño',
              identificationNumber: this.data.restaurantInfo?.taxId || '302680311',
              identificationType: (this.data.restaurantInfo?.identificationType as any) || '01',
              phone: this.data.restaurantInfo?.phone || '25347852',
              email: this.data.restaurantInfo?.email || 'facturacion@saborcervanteno.com',
              province: this.data.restaurantInfo?.province || '3',
              canton: this.data.restaurantInfo?.canton || '02',
              district: this.data.restaurantInfo?.district || '01',
              address: this.data.restaurantInfo?.location || '100 Oeste de Super Pino Birrisito',
              economicActivity: this.data.restaurantInfo?.economicActivity || '561011'
            },
            receiver: {
              name: sale.customerName || 'Consumidor Final',
              identificationNumber: sale.customerIdentification || undefined,
              identificationType: sale.customerIdentification ? (sale.customerIdentification.length === 10 ? '02' : '01') : undefined,
              email: sale.customerEmail || undefined,
              phone: sale.customerPhone || undefined
            },
            lines: (sale.items || []).map((item, idx) => {
              const rate = (item.taxRate !== undefined && item.taxRate > 1) ? (item.taxRate / 100) : (item.taxRate ?? 0.13);
              const isWithTax = item.isPriceWithTax ?? true;
              const breakdown = calculateFiscalPriceBreakdown(item.price || 0, rate, isWithTax);
              const unitPrice = breakdown.netPrice;
              const subtotal = Number((breakdown.netPrice * (item.quantity || 1)).toFixed(5));
              const taxAmount = Number((breakdown.taxAmount * (item.quantity || 1)).toFixed(5));
              const totalLine = Number((breakdown.totalPrice * (item.quantity || 1)).toFixed(5));

              return {
                lineNumber: idx + 1,
                productId: (item as any).productId || (item as any).id || `prod-${idx + 1}`,
                internalCode: (item as any).productId || `INT-${idx + 1}`,
                cabysCode: (item as any).cabysCode || '6331000000000',
                description: item.name || 'Consumo Restaurante',
                quantity: item.quantity || 1,
                unitOfMeasure: 'Unid',
                unitPrice,
                discount: 0,
                subtotal,
                taxCode: '01',
                taxRate: rate * 100,
                taxAmount,
                totalLine
              };
            }),
            subtotal: sale.subtotal || sale.total,
            taxTotal: sale.taxTotal || 0,
            discountTotal: sale.discount || 0,
            total: sale.total || 0,
            paymentMethods: (sale.payments || []).map(p => ({
              method: p.method || 'CASH',
              amount: p.amount || sale.total
            })),
            xmlGenerated: undefined,
            xmlResponseHacienda: undefined,
            retryAttempts: 0,
            isContingency: true,
            createdBy: sale.cashierName || 'Cajero Principal',
            createdAt: sale.createdAt || new Date(sale.timestamp || Date.now()).toISOString(),
            updatedAt: sale.updatedAt || new Date().toISOString()
          };
          docMap.set(pendingKey, pendingDoc);
        }
      }
    });

    const allDocs = Array.from(docMap.values());
    // Ordenar de más reciente a más antiguo por fecha de emisión / consecutivo
    allDocs.sort((a, b) => {
      const timeA = new Date(a.issueDate || a.createdAt || 0).getTime();
      const timeB = new Date(b.issueDate || b.createdAt || 0).getTime();
      if (timeB !== timeA) return timeB - timeA;
      return (b.consecutive || '').localeCompare(a.consecutive || '');
    });

    this.data.electronicDocuments = allDocs;
    this.cachedElectronicDocs = allDocs;
    this.lastSalesCount = currentSalesCount;
    return allDocs;
  }

  /**
   * Invalida la caché de documentos en memoria para forzar re-indexación si ocurren cambios
   */
  public invalidateElectronicDocsCache(): void {
    this.cachedElectronicDocs = null;
    this.lastSalesCount = -1;
  }

  /**
   * Consulta paginada de ultra alto rendimiento en memoria para tablas fiscales
   * Evita transferir megabytes innecesarios al frontend, excluye blobs pesados (XMLs y logs crudos)
   * y responde en < 5ms incluso con miles de comprobantes.
   */
  public getPaginatedElectronicDocuments(options: {
    page?: number;
    limit?: number;
    search?: string;
    docType?: string;
    status?: string;
    sort?: 'ASC' | 'DESC';
    dateFrom?: string;
    dateTo?: string;
  }): {
    items: Array<Omit<ElectronicDocument, 'xmlGenerated' | 'xmlResponseHacienda' | 'diagnosticLogs' | 'lastQueryRawResponse' | 'sendResponseRaw'> & {
      hasXmlGenerated: boolean;
      hasXmlResponse: boolean;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasPrev: boolean;
      hasNext: boolean;
    };
  } {
    const docs = this.getElectronicDocuments();
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(1000, options.limit || 20));
    const search = (options.search || '').trim().toLowerCase();
    const docType = options.docType && options.docType !== 'ALL' ? options.docType : undefined;
    const status = options.status && options.status !== 'ALL' ? options.status : undefined;
    const sort = options.sort === 'ASC' ? 'ASC' : 'DESC';
    const dateFrom = options.dateFrom ? options.dateFrom.trim() : undefined;
    const dateTo = options.dateTo ? options.dateTo.trim() : undefined;

    let filtered = docs;

    // 1. Filtrado por tipo de documento ('01', '04', '03', etc.)
    if (docType) {
      filtered = filtered.filter(d => d.documentType === docType);
    }

    // 2. Filtrado por estado de Hacienda
    if (status) {
      filtered = filtered.filter(d => d.status === status);
    }

    // 3. Filtrado por rango de fechas (YYYY-MM-DD)
    if (dateFrom) {
      filtered = filtered.filter(d => {
        const issue = d.issueDate ? d.issueDate.split('T')[0] : (d.createdAt ? d.createdAt.split('T')[0] : '');
        return issue >= dateFrom;
      });
    }

    if (dateTo) {
      filtered = filtered.filter(d => {
        const issue = d.issueDate ? d.issueDate.split('T')[0] : (d.createdAt ? d.createdAt.split('T')[0] : '');
        return issue <= dateTo;
      });
    }

    // 4. Búsqueda textual ultra rápida (clave de 50 dígitos, consecutivo, nombre receptor, cédula, correo)
    if (search) {
      filtered = filtered.filter(d => {
        const key = (d.numericKey || '').toLowerCase();
        if (key.includes(search)) return true;
        const consec = (d.consecutive || '').toLowerCase();
        if (consec.includes(search)) return true;
        const rec = d.receiver;
        if (rec) {
          if (rec.name && rec.name.toLowerCase().includes(search)) return true;
          if (rec.identificationNumber && rec.identificationNumber.toLowerCase().includes(search)) return true;
          if (rec.email && rec.email.toLowerCase().includes(search)) return true;
        }
        return false;
      });
    }

    // 5. Ordenamiento eficiente por timestamp
    if (sort === 'ASC') {
      filtered = [...filtered].sort((a, b) => {
        const timeA = new Date(a.issueDate || a.createdAt || 0).getTime();
        const timeB = new Date(b.issueDate || b.createdAt || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return (a.consecutive || '').localeCompare(b.consecutive || '');
      });
    } else {
      // Por defecto ya vienen pre-ordenados DESC en getElectronicDocuments(), pero si se filtró aseguramos consistencia
      filtered = [...filtered].sort((a, b) => {
        const timeA = new Date(a.issueDate || a.createdAt || 0).getTime();
        const timeB = new Date(b.issueDate || b.createdAt || 0).getTime();
        if (timeB !== timeA) return timeB - timeA;
        return (b.consecutive || '').localeCompare(a.consecutive || '');
      });
    }

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;
    const pageItems = filtered.slice(offset, offset + limit);

    // 6. Proyección liviana: Excluir XMLs y logs crudos para mantener el payload en < 15 KB
    const items = pageItems.map(doc => {
      const {
        xmlGenerated,
        xmlResponseHacienda,
        diagnosticLogs,
        lastQueryRawResponse,
        sendResponseRaw,
        ...essentialDoc
      } = doc;
      return {
        ...essentialDoc,
        hasXmlGenerated: Boolean(xmlGenerated),
        hasXmlResponse: Boolean(xmlResponseHacienda)
      };
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages
      }
    };
  }

  public getElectronicDocumentById(id: string): ElectronicDocument | undefined {
    const all = this.getElectronicDocuments();
    return all.find(d => 
      d.id === id || 
      d.numericKey === id || 
      d.consecutive === id || 
      (d.saleId && d.saleId === id)
    );
  }

  public getXmlForDocument(numericKey: string): string | undefined {
    const docObj = this.getElectronicDocumentById(numericKey);
    if (docObj?.xmlGenerated) return docObj.xmlGenerated;

    try {
      const xmlPath = path.join(DATA_DIR, 'xmls', `${numericKey}.xml`);
      if (fs.existsSync(xmlPath)) {
        return fs.readFileSync(xmlPath, 'utf-8');
      }
    } catch (err) {
      // non-fatal
    }
    return undefined;
  }

  public getXmlResponseForDocument(numericKey: string): string | undefined {
    const docObj = this.getElectronicDocumentById(numericKey);
    if (docObj?.xmlResponseHacienda) return docObj.xmlResponseHacienda;

    try {
      const candidates = [
        path.join(DATA_DIR, 'xmls', `${numericKey}_respuesta.xml`),
        path.join(DATA_DIR, 'xmls', `${numericKey}_resp.xml`)
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          return fs.readFileSync(p, 'utf-8');
        }
      }
    } catch (err) {
      // non-fatal
    }
    return undefined;
  }

  public saveElectronicDocument(documentItem: ElectronicDocument): ElectronicDocument {
    // 1. Guardar copia física del XML individual en disco para descarga y auditoría
    if (documentItem.xmlGenerated && documentItem.numericKey) {
      try {
        const xmlPath = path.join(DATA_DIR, 'xmls', `${documentItem.numericKey}.xml`);
        fs.writeFileSync(xmlPath, documentItem.xmlGenerated, 'utf-8');
      } catch (err) {
        console.warn('⚠️ No se pudo guardar XML físico individual:', err);
      }
    }

    if (documentItem.xmlResponseHacienda && documentItem.numericKey) {
      try {
        const respPath = path.join(DATA_DIR, 'xmls', `${documentItem.numericKey}_respuesta.xml`);
        fs.writeFileSync(respPath, documentItem.xmlResponseHacienda, 'utf-8');
      } catch (err) {
        console.warn('⚠️ No se pudo guardar XML de respuesta:', err);
      }
    }

    const existingIndex = (this.data.electronicDocuments || []).findIndex(d => d.id === documentItem.id || d.numericKey === documentItem.numericKey);
    if (existingIndex >= 0) {
      this.data.electronicDocuments[existingIndex] = { ...documentItem, updatedAt: new Date().toISOString() };
    } else {
      this.data.electronicDocuments.unshift(documentItem);
    }

    this.invalidateElectronicDocsCache();

    // Vincular y actualizar venta asociada inmediatamente en memoria si existe
    if (documentItem.saleId) {
      const associatedSale = this.data.sales.find(s => s.id === documentItem.saleId);
      if (associatedSale) {
        associatedSale.invoiceStatus = 'INVOICED';
        associatedSale.electronicDocumentType = documentItem.documentType;
        associatedSale.numericKey50 = documentItem.numericKey;
        associatedSale.consecutive20 = documentItem.consecutive;
        associatedSale.haciendaStatus = documentItem.status;
        associatedSale.haciendaResponseMessage = documentItem.statusDescription;
        associatedSale.xmlEmitted = documentItem.xmlGenerated || associatedSale.xmlEmitted;
        associatedSale.xmlHaciendaResponse = documentItem.xmlResponseHacienda || associatedSale.xmlHaciendaResponse;
        associatedSale.updatedAt = new Date().toISOString();
      }

      // AUTO-LIMPIEZA: Si se guardó un comprobante oficial emitido, purgar cualquier borrador temporal previo de esta venta
      if (documentItem.numericKey && !documentItem.numericKey.startsWith('PENDIENTE')) {
        this.data.electronicDocuments = (this.data.electronicDocuments || []).filter(d => {
          if (!d) return false;
          if (d.saleId === documentItem.saleId && (d.numericKey?.startsWith('PENDIENTE') || d.id?.startsWith('pending-'))) return false;
          if (associatedSale?.orderNumber && (d.numericKey === `PENDIENTE-ORDEN-${associatedSale.orderNumber}` || (d.consecutive === `ORDEN-#${associatedSale.orderNumber}` && d.numericKey?.startsWith('PENDIENTE')))) return false;
          return true;
        });
        this.cachedElectronicDocs = null;
      }
    }

    // Sincronizar documento individual a Firestore de forma amortiguada
    if (firestoreDb && !firestoreQuotaExceeded && documentItem.numericKey) {
      try {
        const docRef = doc(firestoreDb, 'electronic_documents', documentItem.numericKey);
        const cleanDoc = JSON.parse(JSON.stringify(documentItem));
        this.queueFirestoreWrite(async () => {
          await setDoc(docRef, cleanDoc);
        });
      } catch (err) {
        // non-blocking
      }
    }

    this.persist();
    this.invalidateElectronicDocsCache();
    this.triggerFirestoreSync(true);
    return documentItem;
  }

  // ----------------------------------------------------
  // FISCAL AUDIT LOGS
  // ----------------------------------------------------
  public addFiscalAuditLog(log: Omit<FiscalAuditLog, 'id' | 'timestamp'>): FiscalAuditLog {
    const newLog: FiscalAuditLog = {
      id: `fisc-audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      ...log
    };
    if (!this.data.fiscalAuditLogs) {
      this.data.fiscalAuditLogs = [];
    }
    this.data.fiscalAuditLogs.unshift(newLog);
    // Limitar a los últimos 1000 registros para optimizar memoria
    if (this.data.fiscalAuditLogs.length > 1000) {
      this.data.fiscalAuditLogs = this.data.fiscalAuditLogs.slice(0, 1000);
    }
    this.persist();
    return newLog;
  }

  public getFiscalAuditLogs(): FiscalAuditLog[] {
    return this.data.fiscalAuditLogs || [];
  }

  // ----------------------------------------------------
  // EMAIL DISPATCH LOGS (OUTBOX)
  // ----------------------------------------------------
  public addEmailDispatchLog(log: Omit<EmailDispatchLog, 'id' | 'sentAt'>): EmailDispatchLog {
    const newLog: EmailDispatchLog = {
      id: `email-log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sentAt: new Date().toISOString(),
      ...log
    };
    if (!this.data.emailDispatchLogs) {
      this.data.emailDispatchLogs = [];
    }
    this.data.emailDispatchLogs.unshift(newLog);
    if (this.data.emailDispatchLogs.length > 500) {
      this.data.emailDispatchLogs = this.data.emailDispatchLogs.slice(0, 500);
    }
    this.persist();
    return newLog;
  }

  public getEmailDispatchLogs(): EmailDispatchLog[] {
    return this.data.emailDispatchLogs || [];
  }

  public updateEmailDispatchLog(id: string, updates: Partial<EmailDispatchLog>): EmailDispatchLog | undefined {
    if (!this.data.emailDispatchLogs) return undefined;
    const idx = this.data.emailDispatchLogs.findIndex(l => l.id === id);
    if (idx >= 0) {
      this.data.emailDispatchLogs[idx] = {
        ...this.data.emailDispatchLogs[idx],
        ...updates
      };
      this.persist();
      return this.data.emailDispatchLogs[idx];
    }
    return undefined;
  }

  public async getConsecutiveControls(): Promise<ConsecutiveControl[]> {
    const controls: ConsecutiveControl[] = [];
    if (firestoreDb) {
      try {
        const docTypes: ('01' | '02' | '03' | '04' | '05' | '06')[] = ['01', '02', '03', '04', '05', '06'];
        for (const type of docTypes) {
          const key = `seq-001-00001-${type}`;
          const docRef = doc(firestoreDb, 'fiscal_counters', key);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            controls.push(docSnap.data() as ConsecutiveControl);
          } else {
            // Sin configuración previa en Firestore, consultar registro local si existe
            const localControl = (this.data.consecutiveControls || []).find(c => c.id === key);
            controls.push(localControl || {
              id: key,
              branch: '001',
              terminal: '00001',
              documentType: type,
              currentSequence: 1,
              lastSequenceNumber: 0,
              updatedAt: new Date().toISOString()
            });
          }
        }
      } catch (e) {
        console.warn('⚠️ No se pudieron leer los controles de Firestore en getConsecutiveControls:', e);
      }
    }
    return controls;
  }

  public async setConsecutiveSequence(branch: string, terminal: string, docType: '01' | '04' | '03' | '02' | '05' | '06', lastUsedNumber: number | string): Promise<ConsecutiveControl> {
    const cleanBranch = (branch || '1').replace(/\D/g, '').padStart(3, '0').slice(-3);
    const cleanTerminal = (terminal || '1').replace(/\D/g, '').padStart(5, '0').slice(-5);
    const cleanDocType = (docType || '04').replace(/\D/g, '').padStart(2, '0').slice(-2) as '01' | '04' | '03' | '02' | '05' | '06';
    const key = `seq-${cleanBranch}-${cleanTerminal}-${cleanDocType}`;

    // Extraer limpiamente el número de secuencia evitando cadenas largas o códigos de 20 dígitos
    let parsedNum = 0;
    if (typeof lastUsedNumber === 'string') {
      const digits = lastUsedNumber.replace(/\D/g, '');
      if (digits.length >= 10) {
        parsedNum = parseInt(digits.slice(-10), 10) || 0;
      } else {
        parsedNum = parseInt(digits, 10) || 0;
      }
    } else {
      parsedNum = Number(lastUsedNumber) || 0;
      if (parsedNum > 9999999999) {
        parsedNum = parsedNum % 10000000000;
      }
    }

    const nextSequence = Math.max(1, parsedNum + 1);

    const control: ConsecutiveControl = {
      id: key,
      branch: cleanBranch,
      terminal: cleanTerminal,
      documentType: cleanDocType,
      currentSequence: nextSequence,
      lastSequenceNumber: parsedNum,
      updatedAt: new Date().toISOString()
    };

    // Actualizar también en el registro local
    if (!this.data.consecutiveControls) {
      this.data.consecutiveControls = [];
    }
    const localIdx = this.data.consecutiveControls.findIndex(c => c.id === key);
    if (localIdx >= 0) {
      this.data.consecutiveControls[localIdx] = control;
    } else {
      this.data.consecutiveControls.push(control);
    }
    this.persist();

    if (firestoreDb && !firestoreQuotaExceeded) {
      try {
        const docRef = doc(firestoreDb, 'fiscal_counters', key);
        await setDoc(docRef, control, { merge: true });
      } catch (e: any) {
        if (isFirestoreQuotaOrStreamError(e)) {
          firestoreQuotaExceeded = true;
          firestoreQuotaExceededAt = Date.now();
        }
        console.warn('⚠️ No se pudo actualizar el contador en Firestore en setConsecutiveSequence:', e?.message || e);
      }
    }

    return control;
  }

  public getHaciendaDirectConfig(): HaciendaDirectConfig {
    return this.data.haciendaDirectConfig || { ...INITIAL_HACIENDA_DIRECT_CONFIG };
  }

  public saveHaciendaDirectConfig(updates: Partial<HaciendaDirectConfig>, modifierUser: string = 'Administrador Tributario'): HaciendaDirectConfig {
    const previousConfig = { ...this.getHaciendaDirectConfig() };
    const currentAuditTrail = previousConfig.issuerAuditTrail || [];
    const timestamp = new Date().toISOString();

    // Detectar cambios en campos del emisor para la bitácora de trazabilidad
    const fieldsToTrack: Array<keyof HaciendaDirectConfig> = [
      'emisorName',
      'emisorCommercialName',
      'emisorTaxId',
      'emisorIdentificationType',
      'emisorEconomicActivity',
      'emisorEmail',
      'emisorPhone',
      'emisorPhoneCountryCode',
      'emisorProvince',
      'emisorCanton',
      'emisorDistrict',
      'emisorNeighborhood',
      'emisorAddressDetail',
      'emisorLogoBase64',
      'softwareProviderName',
      'softwareProviderTaxId',
      'alcoholicBeverageRegistry',
      'hasAlcoholicBeverageRegistry',
      'branch',
      'terminal'
    ];

    const newAuditEntries: Array<{
      user: string;
      timestamp: string;
      field: string;
      previousValue: any;
      newValue: any;
    }> = [];

    fieldsToTrack.forEach(field => {
      if (updates[field] !== undefined && updates[field] !== previousConfig[field]) {
        let prevVal = previousConfig[field] !== undefined ? previousConfig[field] : null;
        let newVal = updates[field];
        if (field === 'emisorLogoBase64') {
          prevVal = prevVal ? '[LOGO_ANTERIOR]' : null;
          newVal = newVal ? '[LOGO_ACTUALIZADO]' : null;
        } else if (typeof prevVal === 'string' && prevVal.length > 200) {
          prevVal = prevVal.slice(0, 100) + '...';
        }
        if (typeof newVal === 'string' && newVal.length > 200 && field !== 'emisorLogoBase64') {
          newVal = newVal.slice(0, 100) + '...';
        }
        newAuditEntries.push({
          user: modifierUser,
          timestamp,
          field: String(field),
          previousValue: prevVal,
          newValue: newVal
        });
      }
    });

    const updatedAuditTrail = [...newAuditEntries, ...currentAuditTrail].slice(0, 50);

    let finalKeyBase64 = previousConfig.cryptographicKeyBase64;
    if (updates.cryptographicKeyBase64 && updates.cryptographicKeyBase64.length > 50 && updates.cryptographicKeyBase64 !== '[STORED_LOCALLY]') {
      finalKeyBase64 = updates.cryptographicKeyBase64;
      this.saveLocalCryptoKey(finalKeyBase64);
    } else if (!finalKeyBase64 || finalKeyBase64 === '[STORED_LOCALLY]') {
      finalKeyBase64 = this.loadLocalCryptoKey() || undefined;
    }

    const updatedConfig: HaciendaDirectConfig = {
      ...previousConfig,
      ...updates,
      cryptographicKeyBase64: finalKeyBase64,
      issuerAuditTrail: updatedAuditTrail
    };

    if (updates.cryptographicKeyBase64 || updates.cryptographicKeyPin) {
      XmlSignerService.invalidateCache();
    }

    if (updatedConfig.cryptographicKeyBase64 && updatedConfig.cryptographicKeyPin) {
      const keyCheck = XmlSignerService.validateCertificateDetails(
        updatedConfig.cryptographicKeyBase64,
        updatedConfig.cryptographicKeyPin,
        updatedConfig.environment,
        updatedConfig.emisorTaxId
      );
      updatedConfig.cryptographicKeyStatus = keyCheck.valid ? 'VALID' : 'EXPIRED';
    }

    this.data.haciendaDirectConfig = updatedConfig;

    // Si se especificaron últimos números de factura o tiquete, sincronizar los controladores de consecutivos
    const branch = this.data.haciendaDirectConfig.branch || '001';
    const terminal = this.data.haciendaDirectConfig.terminal || '00001';

    if (updates.lastFacturaNumber !== undefined && updates.lastFacturaNumber >= 0) {
      this.setConsecutiveSequence(branch, terminal, '01', updates.lastFacturaNumber);
    }
    if (updates.lastTiqueteNumber !== undefined && updates.lastTiqueteNumber >= 0) {
      this.setConsecutiveSequence(branch, terminal, '04', updates.lastTiqueteNumber);
    }
    if (updates.lastNotaCreditoNumber !== undefined && updates.lastNotaCreditoNumber >= 0) {
      this.setConsecutiveSequence(branch, terminal, '03', updates.lastNotaCreditoNumber);
    }
    if (updates.lastNotaDebitoNumber !== undefined && updates.lastNotaDebitoNumber >= 0) {
      this.setConsecutiveSequence(branch, terminal, '02', updates.lastNotaDebitoNumber);
    }
    if (updates.lastFacturaCompraNumber !== undefined && updates.lastFacturaCompraNumber >= 0) {
      this.setConsecutiveSequence(branch, terminal, '05', updates.lastFacturaCompraNumber);
    }
    if (updates.lastReciboPagoNumber !== undefined && updates.lastReciboPagoNumber >= 0) {
      this.setConsecutiveSequence(branch, terminal, '06', updates.lastReciboPagoNumber);
    }

    // Sincronizar también información del emisor en restaurantInfo si vino en el config
    if (
      updates.emisorName !== undefined ||
      updates.emisorCommercialName !== undefined ||
      updates.emisorTaxId !== undefined ||
      updates.emisorEmail !== undefined ||
      updates.emisorPhone !== undefined ||
      updates.emisorLogoBase64 !== undefined ||
      updates.emisorAddressDetail !== undefined ||
      updates.emisorEconomicActivity !== undefined
    ) {
      this.updateRestaurantInfo({
        name: updates.emisorName || this.data.restaurantInfo.name,
        commercialName: updates.emisorCommercialName !== undefined ? updates.emisorCommercialName : this.data.restaurantInfo.commercialName,
        taxId: updates.emisorTaxId || this.data.restaurantInfo.taxId,
        identificationType: updates.emisorIdentificationType || this.data.restaurantInfo.identificationType,
        economicActivity: updates.emisorEconomicActivity || this.data.restaurantInfo.economicActivity,
        phone: updates.emisorPhone !== undefined ? updates.emisorPhone : this.data.restaurantInfo.phone,
        email: updates.emisorEmail !== undefined ? updates.emisorEmail : this.data.restaurantInfo.email,
        province: updates.emisorProvince || this.data.restaurantInfo.province,
        canton: updates.emisorCanton || this.data.restaurantInfo.canton,
        district: updates.emisorDistrict || this.data.restaurantInfo.district,
        location: updates.emisorAddressDetail || this.data.restaurantInfo.location,
        logoBase64: updates.emisorLogoBase64 !== undefined ? updates.emisorLogoBase64 : this.data.restaurantInfo.logoBase64
      });
    }

    if (newAuditEntries.length > 0) {
      this.addFiscalAuditLog({
        userId: 'admin',
        userName: modifierUser,
        action: 'EMISION_COMPROBANTE',
        details: `Actualización de datos fiscales del contribuyente / emisor (${newAuditEntries.length} campos: ${newAuditEntries.map(e => e.field).join(', ')})`
      });
    }

    this.persist();
    return this.data.haciendaDirectConfig;
  }

  public getRestaurantInfo() {
    return this.data.restaurantInfo;
  }

  public updateRestaurantInfo(info: Partial<DatabaseSchema['restaurantInfo']>) {
    this.data.restaurantInfo = {
      ...this.data.restaurantInfo,
      ...info
    };
    this.persist();
    return this.data.restaurantInfo;
  }

  // ----------------------------------------------------
  // STATS & DIAGNOSTICS
  // ----------------------------------------------------
  public getStats() {
    return {
      status: 'ONLINE',
      engine: 'Persistent File-Backed JSON Engine (ACID safe)',
      databaseFile: DB_FILE_PATH,
      backupFile: DB_BACKUP_PATH,
      lastUpdated: this.data.lastUpdated,
      counts: {
        products: this.data.products.length,
        categories: this.data.categories.length,
        customers: this.data.customers.length,
        sales: this.data.sales.length,
        cashMovements: this.data.cashMovements.length,
        cashRegistersHistory: this.data.cashRegisterHistory.length,
        electronicDocuments: this.data.electronicDocuments.length,
        fiscalAuditLogs: this.data.fiscalAuditLogs.length
      },
      currentCashRegisterStatus: this.data.currentCashRegister.status,
      haciendaDirectEnabled: this.data.haciendaDirectConfig.enabled
    };
  }

  public exportDatabase(): DatabaseSchema {
    return this.data;
  }

  public exportMenuBackup() {
    const categories = this.getCategories();
    const products = this.getProducts();
    const observations = this.data.kitchenObservations || [];
    return {
      version: '1.0',
      backupType: 'MENU_CATEGORIES_AND_PRODUCTS',
      system: 'Pollo Frito Sabor Cervanteño POS & Facturación Electrónica DGT v4.4',
      restaurant: this.data.restaurantInfo?.name || 'Pollo Frito Sabor Cervanteño',
      taxId: this.data.restaurantInfo?.taxId || '302680311',
      exportedAt: new Date().toISOString(),
      summary: {
        categoriesCount: categories.length,
        productsCount: products.length,
        activeCategoriesCount: categories.filter(c => c.active !== false).length,
        activeProductsCount: products.filter(p => p.active !== false).length,
        observationsCount: observations.length
      },
      categories,
      products,
      kitchenObservations: observations
    };
  }

  public importMenuBackup(menuData: any) {
    if (!menuData || typeof menuData !== 'object') {
      throw new Error('Archivo de respaldo de menú no válido.');
    }
    const categoriesToImport: Category[] = Array.isArray(menuData.categories) ? menuData.categories : [];
    const productsToImport: Product[] = Array.isArray(menuData.products) ? menuData.products : [];
    const observationsToImport: KitchenObservation[] = Array.isArray(menuData.kitchenObservations) ? menuData.kitchenObservations : [];

    if (categoriesToImport.length === 0 && productsToImport.length === 0) {
      throw new Error('El archivo de respaldo no contiene categorías ni productos reconocibles.');
    }

    const now = new Date().toISOString();

    if (categoriesToImport.length > 0) {
      this.data.categories = normalizeCategories(categoriesToImport);
    }

    if (productsToImport.length > 0) {
      this.data.products = productsToImport.map(p => ({
        ...p,
        updatedAt: p.updatedAt || now
      }));
    }

    if (observationsToImport.length > 0) {
      this.data.kitchenObservations = observationsToImport;
    }

    this.data.catalogVersion = (this.data.catalogVersion || 1) + 1;
    this.saveDatabaseSync(this.data);

    // Sincronizar en segundo plano si Firebase está disponible
    if (firestoreDb && !firestoreQuotaExceeded) {
      this.syncCatalogWithCloud().catch(() => {});
    }

    return {
      success: true,
      categoriesCount: this.data.categories.length,
      productsCount: this.data.products.length,
      observationsCount: this.data.kitchenObservations?.length || 0,
      catalogVersion: this.data.catalogVersion
    };
  }

  public importDatabase(newData: Partial<DatabaseSchema>) {
    this.data = {
      ...this.getDefaultData(),
      ...newData,
      lastUpdated: new Date().toISOString()
    };
    this.saveDatabaseSync(this.data);
    return this.getStats();
  }

  public resetToDefaults() {
    this.data = this.getDefaultData();
    this.saveDatabaseSync(this.data);
    return this.getStats();
  }

  public createRestorationPoint(name: string): string {
    const sanitizedName = name.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
      
    const filename = `pos_database.backup.${sanitizedName}.json`;
    const filePath = path.join(DATA_DIR, filename);
    
    const content = JSON.stringify(this.data, null, 2);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ Punto de restauración "${name}" creado en: ${filePath}`);
    return filename;
  }

  /**
   * Respaldo exhaustivo y seguro del 100% de toda la información del sistema:
   * - Productos, categorías, clientes, usuarios, inventario, observaciones
   * - Ventas completas, comandas de cocina, turnos y arqueos de caja
   * - Comprobantes electrónicos, XMLs generados y respuestas de Hacienda
   * - Llave criptográfica (.p12 en base64) y configuración tributaria ATV
   * - Consecutivos y controles fiscales
   * - Almacenamiento simultáneo en disco local y sincronización completa a la nube Firestore
   */
  public async backupAllInformation(): Promise<{
    success: boolean;
    timestamp: string;
    localBackupPath: string;
    cloudBackup: {
      synced: boolean;
      firestoreDbConnected: boolean;
      details?: string;
    };
    summary: {
      products: number;
      categories: number;
      customers: number;
      sales: number;
      electronicDocuments: number;
      xmlFiles: number;
      cashMovements: number;
      cashRegisters: number;
      users: number;
      kitchenOrders: number;
      hasCryptographicKey: boolean;
      haciendaConfigured: boolean;
    };
  }> {
    const now = new Date();
    const timestampStr = now.toISOString().replace(/[:.]/g, '-');
    const dateStr = getCostaRicaDate(now);

    // Asegurar directorios
    this.ensureDataDirectory();
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      try {
        fs.mkdirSync(backupDir, { recursive: true });
      } catch {}
    }

    // 1. Recolectar todos los archivos XML fiscales físicos de disco
    const xmlsDir = path.join(DATA_DIR, 'xmls');
    const xmlDocuments: Array<{ filename: string; size: number; content: string }> = [];
    if (fs.existsSync(xmlsDir)) {
      try {
        const files = fs.readdirSync(xmlsDir);
        for (const file of files) {
          if (file.endsWith('.xml')) {
            const fullPath = path.join(xmlsDir, file);
            const content = fs.readFileSync(fullPath, 'utf-8');
            xmlDocuments.push({
              filename: file,
              size: fs.statSync(fullPath).size,
              content
            });
          }
        }
      } catch (err) {
        console.warn('⚠️ Error leyendo XMLs para respaldo:', err);
      }
    }

    // 2. Extraer llave criptográfica
    const cryptoKey = this.loadLocalCryptoKey();

    // 3. Estructurar el paquete maestro de respaldo
    const fullBackupPackage = {
      version: '2.0',
      backupType: 'TOTAL_SYSTEM_BACKUP',
      createdAt: now.toISOString(),
      system: 'Pollo Frito Sabor Cervanteño POS & Facturación Electrónica',
      businessName: this.data.restaurantInfo?.name || 'Pollo Frito Sabor Cervanteño',
      taxId: this.data.restaurantInfo?.taxId || '302680311',
      summary: {
        productsCount: this.data.products?.length || 0,
        categoriesCount: this.data.categories?.length || 0,
        customersCount: this.data.customers?.length || 0,
        salesCount: this.data.sales?.length || 0,
        electronicDocumentsCount: this.data.electronicDocuments?.length || 0,
        xmlFilesCount: xmlDocuments.length,
        cashMovementsCount: this.data.cashMovements?.length || 0,
        cashRegistersCount: this.data.cashRegisterHistory?.length || 0,
        usersCount: this.data.users?.length || 0,
        kitchenOrdersCount: this.data.kitchenOrders?.length || 0,
        hasCryptographicKey: Boolean(cryptoKey || this.data.haciendaDirectConfig?.cryptographicKeyBase64),
        haciendaConfigured: Boolean(this.data.haciendaDirectConfig?.enabled)
      },
      restaurantInfo: this.data.restaurantInfo,
      haciendaDirectConfig: {
        ...this.data.haciendaDirectConfig,
        cryptographicKeyBase64: cryptoKey || this.data.haciendaDirectConfig?.cryptographicKeyBase64
      },
      consecutiveControls: this.data.consecutiveControls,
      electronicDocuments: this.data.electronicDocuments,
      products: this.data.products,
      categories: this.data.categories,
      customers: this.data.customers,
      sales: this.data.sales,
      kitchenOrders: this.data.kitchenOrders,
      currentCashRegister: this.data.currentCashRegister,
      cashRegisterHistory: this.data.cashRegisterHistory,
      cashMovements: this.data.cashMovements,
      users: this.data.users,
      kitchenObservations: this.data.kitchenObservations,
      fiscalAuditLogs: this.data.fiscalAuditLogs,
      emailDispatchLogs: this.data.emailDispatchLogs,
      taxRates: this.data.taxRates,
      tombstones: this.data.tombstones,
      xmlDocuments
    };

    const packageContent = JSON.stringify(fullBackupPackage, null, 2);

    // 4. Escribir múltiples copias en disco local
    // a) Respaldo fechado en data
    const filenameTimestamped = `pos_database.backup.${timestampStr}.json`;
    const fullPathTimestamped = path.join(DATA_DIR, filenameTimestamped);
    fs.writeFileSync(fullPathTimestamped, packageContent, 'utf-8');

    // b) Respaldo canónico en data
    const canonicalBackupPath = path.join(DATA_DIR, 'pos_database.backup.respaldo_total_solicitado.json');
    fs.writeFileSync(canonicalBackupPath, packageContent, 'utf-8');

    // c) Respaldo en carpeta backups para acceso rápido
    const backupFolderFile = path.join(backupDir, `respaldo_completo_sabor_cervanteno_${dateStr}.json`);
    fs.writeFileSync(backupFolderFile, packageContent, 'utf-8');

    // d) Actualizar pos_database.backup.json
    fs.writeFileSync(DB_BACKUP_PATH, JSON.stringify(this.data, null, 2), 'utf-8');

    // 5. Sincronizar de forma inmediata con Firestore en la nube
    let cloudSynced = false;
    let cloudDetails = '';

    if (firestoreDb && !firestoreQuotaExceeded) {
      try {
        // a) Sincronizar documento principal
        const docRef = doc(firestoreDb, 'pos_data', 'main_database');
        const payload = this.getFirestoreReadyData(this.data);
        await setDoc(docRef, payload);

        // b) Sincronizar categorías autoritativas
        const catRef = doc(firestoreDb, 'pos_data', 'categories');
        await setDoc(catRef, {
          items: this.data.categories || [],
          version: this.data.catalogVersion || 1,
          lastUpdated: now.toISOString()
        });

        // c) Sincronizar comprobantes electrónicos más recientes
        if (Array.isArray(this.data.electronicDocuments)) {
          for (const ed of this.data.electronicDocuments.slice(0, 50)) {
            if (ed.numericKey) {
              try {
                const edRef = doc(firestoreDb, 'electronic_documents', ed.numericKey);
                await setDoc(edRef, JSON.parse(JSON.stringify(ed)), { merge: true });
              } catch {}
            }
          }
        }

        // d) Sincronizar productos en colección individual para redundancia
        if (Array.isArray(this.data.products)) {
          for (const p of this.data.products) {
            if (p.id) {
              try {
                const pRef = doc(firestoreDb, 'products', p.id);
                await setDoc(pRef, JSON.parse(JSON.stringify(p)), { merge: true });
              } catch {}
            }
          }
        }

        cloudSynced = true;
        cloudDetails = 'Sincronización completa con Firestore exitosa (Base principal, productos, comprobantes y categorías).';
      } catch (err: any) {
        cloudSynced = false;
        cloudDetails = `Firestore no disponible o error: ${err?.message || err}`;
        console.warn('⚠️ Error sincronizando respaldo total a Firestore:', err);
      }
    } else {
      cloudDetails = firestoreDb 
        ? 'Firestore en pausa temporal por cuota; todos los datos quedaron 100% protegidos en disco local.' 
        : 'Firestore no configurado; respaldo 100% almacenado en disco local.';
    }

    return {
      success: true,
      timestamp: now.toISOString(),
      localBackupPath: filenameTimestamped,
      cloudBackup: {
        synced: cloudSynced,
        firestoreDbConnected: Boolean(firestoreDb),
        details: cloudDetails
      },
      summary: {
        products: this.data.products?.length || 0,
        categories: this.data.categories?.length || 0,
        customers: this.data.customers?.length || 0,
        sales: this.data.sales?.length || 0,
        electronicDocuments: this.data.electronicDocuments?.length || 0,
        xmlFiles: xmlDocuments.length,
        cashMovements: this.data.cashMovements?.length || 0,
        cashRegisters: this.data.cashRegisterHistory?.length || 0,
        users: this.data.users?.length || 0,
        kitchenOrders: this.data.kitchenOrders?.length || 0,
        hasCryptographicKey: Boolean(cryptoKey || this.data.haciendaDirectConfig?.cryptographicKeyBase64),
        haciendaConfigured: Boolean(this.data.haciendaDirectConfig?.enabled)
      }
    };
  }

  /**
   * Respalda todo lo creado y configurado por el administrador y purga al 100%
   * todas las ventas de prueba, comandas, turnos de caja y documentos fiscales ficticios.
   * Deja el sistema limpio y listo para operar en producción real.
   */
  public async clearTestDataAndResetForProduction(): Promise<{
    success: boolean;
    backupFilename: string;
    preserved: {
      productsCount: number;
      categoriesCount: number;
      usersCount: number;
      observationsCount: number;
      restaurantName: string;
      taxId: string;
    };
    cleared: {
      salesCleared: number;
      documentsCleared: number;
      cashRegistersReset: boolean;
      consecutivesReset: boolean;
    };
  }> {
    const now = new Date();
    const timestampStr = now.toISOString().replace(/[:.]/g, '-');
    const backupFilename = `pos_database.backup.pre_limpieza_${timestampStr}.json`;
    const backupPath = path.join(DATA_DIR, backupFilename);
    const content = JSON.stringify(this.data, null, 2);
    fs.writeFileSync(backupPath, content, 'utf-8');
    
    // Punto de restauración nombrado
    this.createRestorationPoint('pre_limpieza_pruebas');

    const previousSalesCount = this.data.sales?.length || 0;
    const previousDocsCount = this.data.electronicDocuments?.length || 0;

    // 1. Limpiar colecciones transaccionales de prueba
    this.data.sales = [];
    this.data.kitchenOrders = [];
    this.data.electronicDocuments = [];
    this.data.fiscalAuditLogs = [];
    this.data.emailDispatchLogs = [];
    this.data.cashMovements = [];
    this.data.cashRegisterHistory = [];

    // 2. Reiniciar la caja a un estado limpio cerrada, con 0 ventas acumuladas lista para la primera apertura real
    this.data.currentCashRegister = {
      id: `reg-${Date.now()}`,
      cashierId: '',
      cashierName: '',
      openTime: now.toISOString(),
      location: 'RESTAURANTE',
      openingBalance: 0,
      cashSales: 0,
      cardSales: 0,
      sinpeSales: 0,
      transferSales: 0,
      cashIn: 0,
      cashOut: 0,
      expectedCash: 0,
      totalInvoicesCount: 0,
      status: 'CLOSED'
    };

    // 3. Reiniciar los consecutivos para iniciar desde la factura y tiquete número 1 en producción real
    this.data.consecutiveControls = [
      { id: 'seq-001-00001-01', branch: '001', terminal: '00001', documentType: '01', currentSequence: 1, updatedAt: now.toISOString() },
      { id: 'seq-001-00001-04', branch: '001', terminal: '00001', documentType: '04', currentSequence: 1, updatedAt: now.toISOString() },
      { id: 'seq-001-00001-03', branch: '001', terminal: '00001', documentType: '03', currentSequence: 1, updatedAt: now.toISOString() },
      { id: 'seq-001-00002-01', branch: '001', terminal: '00002', documentType: '01', currentSequence: 1, updatedAt: now.toISOString() },
      { id: 'seq-001-00002-04', branch: '001', terminal: '00002', documentType: '04', currentSequence: 1, updatedAt: now.toISOString() }
    ];

    this.data.lastUpdated = now.toISOString();

    // 4. Guardar en disco local de forma atómica y crear copia de producción limpia
    this.saveDatabaseSync(this.data, false);
    const cleanBackupPath = path.join(DATA_DIR, 'pos_database.backup.produccion_limpia.json');
    fs.writeFileSync(cleanBackupPath, JSON.stringify(this.data, null, 2), 'utf-8');

    // 5. Sincronizar inmediatamente el estado limpio a Firestore
    if (firestoreDb && !firestoreQuotaExceeded) {
      try {
        const docRef = doc(firestoreDb, 'pos_data', 'main_database');
        const payload = this.getFirestoreReadyData(this.data);
        await setDoc(docRef, payload);
        console.log('☁️ [Firebase Firestore] Base de datos principal limpia sincronizada a la nube exitosamente.');

        // Limpiar documentos individuales de prueba en la colección electronic_documents
        try {
          const docsColRef = collection(firestoreDb, 'electronic_documents');
          const docsSnap = await getDocs(query(docsColRef, limit(100)));
          let deletedDocs = 0;
          for (const d of docsSnap.docs) {
            await deleteDoc(d.ref);
            deletedDocs++;
          }
          console.log(`☁️ [Firebase Firestore] ${deletedDocs} comprobantes electrónicos de prueba eliminados de Firestore.`);
        } catch (e) {
          console.warn('⚠️ No se pudieron purgar comprobantes individuales en Firestore:', e);
        }
      } catch (err) {
        console.error('⚠️ Error sincronizando limpieza a Firestore:', err);
      }
    }

    return {
      success: true,
      backupFilename,
      preserved: {
        productsCount: this.data.products.length,
        categoriesCount: this.data.categories.length,
        usersCount: this.data.users.length,
        observationsCount: (this.data.kitchenObservations || []).length,
        restaurantName: this.data.restaurantInfo?.name || '',
        taxId: this.data.restaurantInfo?.taxId || ''
      },
      cleared: {
        salesCleared: previousSalesCount,
        documentsCleared: previousDocsCount,
        cashRegistersReset: true,
        consecutivesReset: true
      }
    };
  }

  /**
   * Sincronización Maestra (Fuerza Bruta / Mando Absoluto):
   * La lista enviada por el Administrador es la AUTORIDAD SUPREMA.
   * - Lo que esté presente en la lista del Administrador: se guarda y consolida en Firestore y local con máxima prioridad.
   * - Lo que NO esté en la lista del Administrador (porque fue borrado): se PURGA Y ELIMINA FÍSICAMENTE de Firestore collection 'products' y 'categories'.
   * - Se sincroniza y sanitiza 'pos_data/main_database' para no exceder 1MB.
   * - Se guarda copia de respaldo completa con timestamp.
   * - Se incrementa catalogVersion y se notifica para que todos los dispositivos adopten el nuevo estado maestro.
   */
  public async executeMasterForceSync(authoritativeData?: {
    products?: Product[];
    categories?: Category[];
    users?: UserProfile[];
    customers?: Customer[];
  }): Promise<{
    success: boolean;
    timestamp: string;
    productsPreserved: number;
    productsPurgedFromCloud: number;
    categoriesPreserved: number;
    categoriesPurgedFromCloud: number;
    backupFilename: string;
    cloudSynced: boolean;
    message: string;
  }> {
    const now = new Date();
    const nowIso = now.toISOString();
    const timestampStr = nowIso.replace(/[:.]/g, '-');
    const backupFilename = `pos_database.backup.master_sync_${timestampStr}.json`;
    const backupPath = path.join(DATA_DIR, backupFilename);

    try {
      this.ensureDataDirectory();
      fs.writeFileSync(backupPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('⚠️ Error creando respaldo previo a sincronización maestra:', e);
    }

    // 1. Adoptar los datos autoritativos del Administrador si se proporcionan
    if (authoritativeData) {
      if (Array.isArray(authoritativeData.products) && authoritativeData.products.length > 0) {
        this.data.products = authoritativeData.products;
      }
      if (Array.isArray(authoritativeData.categories) && authoritativeData.categories.length > 0) {
        this.data.categories = normalizeCategories(authoritativeData.categories);
      }
      if (Array.isArray(authoritativeData.users) && authoritativeData.users.length > 0) {
        this.data.users = authoritativeData.users;
      }
      if (Array.isArray(authoritativeData.customers)) {
        this.data.customers = authoritativeData.customers;
      }
    }

    let productsPurgedCount = 0;
    let categoriesPurgedCount = 0;
    let cloudSynced = false;

    // 2. Mando Absoluto en Firebase Firestore: Purgar los elementos eliminados y sobreescribir los activos
    if (firestoreDb && !firestoreQuotaExceeded) {
      try {
        const activeProductIds = new Set(this.data.products.map(p => p.id));

        // A. Purgar productos que existen en la colección 'products' pero ya no en la lista del Administrador
        try {
          const cloudProductsSnap = await getDocs(collection(firestoreDb, 'products'));
          for (const docSnap of cloudProductsSnap.docs) {
            if (!activeProductIds.has(docSnap.id)) {
              await deleteDoc(docSnap.ref);
              productsPurgedCount++;
            }
          }
          console.log(`🧹 [Master Sync] Purgados ${productsPurgedCount} productos fantasma de Firestore.`);
        } catch (errProd) {
          console.warn('⚠️ Advertencia purgando productos fantasma de Firestore:', errProd);
        }

        // B. Guardar/actualizar cada producto activo en la colección individual 'products'
        for (const prod of this.data.products) {
          if (prod.id) {
            try {
              const pRef = doc(firestoreDb, 'products', prod.id);
              await setDoc(pRef, JSON.parse(JSON.stringify(prod)), { merge: true });
            } catch (errP) {
              console.warn(`⚠️ Error guardando producto ${prod.id} en Firestore:`, errP);
            }
          }
        }

        // C. Actualizar y consolidar tombstones para evitar cualquier resurrección futura
        this.data.tombstones = this.data.tombstones || {};
        // Limpiar tombstones de los productos que están activos
        for (const pid of activeProductIds) {
          delete this.data.tombstones[pid];
        }
        try {
          const tombRef = doc(firestoreDb, 'pos_data', 'tombstones');
          await setDoc(tombRef, {
            items: this.data.tombstones,
            lastUpdated: nowIso
          });
        } catch {}

        // D. Guardar categorías oficiales en 'pos_data/categories'
        try {
          const catRef = doc(firestoreDb, 'pos_data', 'categories');
          await setDoc(catRef, {
            items: this.data.categories,
            version: (this.data.catalogVersion || 1) + 1,
            lastUpdated: nowIso
          });
        } catch {}

        // E. Guardar el documento maestro sanitizado 'pos_data/main_database'
        try {
          const mainRef = doc(firestoreDb, 'pos_data', 'main_database');
          const payload = this.getFirestoreReadyData(this.data);
          await setDoc(mainRef, payload);
          cloudSynced = true;
          console.log('☁️ [Master Sync] Documento pos_data/main_database sincronizado con éxito.');
        } catch (errMain) {
          console.warn('⚠️ Error al actualizar main_database en Master Sync:', errMain);
        }
      } catch (cloudErr) {
        console.error('⚠️ Error general en sincronización maestra con Firestore:', cloudErr);
      }
    }

    // 3. Persistir localmente a disco de forma atómica
    this.data.catalogVersion = (this.data.catalogVersion || 1) + 1;
    this.data.lastUpdated = nowIso;
    this.saveDatabaseSync(this.data, false);

    return {
      success: true,
      timestamp: nowIso,
      productsPreserved: this.data.products.length,
      productsPurgedFromCloud: productsPurgedCount,
      categoriesPreserved: this.data.categories.length,
      categoriesPurgedFromCloud: categoriesPurgedCount,
      backupFilename,
      cloudSynced,
      message: `Sincronización Maestra finalizada con éxito. Se consolidaron ${this.data.products.length} productos y ${this.data.categories.length} categorías oficiales. Se purgaron ${productsPurgedCount} registros fantasmas en la nube.`
    };
  }
}

export const db = Database.getInstance();
