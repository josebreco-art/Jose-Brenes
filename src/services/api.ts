import { Sale, KitchenOrder, OrderStatus, Product, Customer, Category, CashRegister, CashMovement, ElectronicDocumentType, HaciendaDirectConfig, ConsecutiveControl, EmailDispatchLog, UserProfile, KitchenObservation } from '../types/pos';
import { INITIAL_PRODUCTS, INITIAL_CATEGORIES, INITIAL_CUSTOMERS, INITIAL_HACIENDA_DIRECT_CONFIG, SYSTEM_USERS } from '../data/initialData';
import { getCostaRicaDate, getCostaRicaTime } from '../utils/dateUtils';
import { offlineStorage } from './offlineStorageService';

const STORAGE_KEYS = {
  SALES: 'sabor_cervanteno_sales',
  KITCHEN_ORDERS: 'sabor_cervanteno_kitchen_orders',
  PRODUCTS: 'sabor_cervanteno_products',
  CUSTOMERS: 'sabor_cervanteno_customers',
  CATEGORIES: 'sabor_cervanteno_categories',
  HACIENDA_CONFIG: 'sabor_cervanteno_hacienda_config',
  CASH_REGISTER: 'sabor_cervanteno_cash_register',
  CASH_MOVEMENTS: 'sabor_cervanteno_cash_movements',
  USERS: 'sabor_cervanteno_users',
  KITCHEN_OBSERVATIONS: 'sabor_cervanteno_kitchen_observations',
  KITCHEN_OUTBOX: 'sabor_cervanteno_kitchen_outbox'
};

export class PosApiService {
  private static lastLocalSignatures = new Map<string, string>();
  private static salesMigratedToIdb = false;

  /**
   * Helper to load from local storage or defaults
   */
  private static getLocalData<T>(key: string, defaultData: T): T {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        this.lastLocalSignatures.set(key, stored);
        const parsed = JSON.parse(stored);
        if (key === STORAGE_KEYS.PRODUCTS && Array.isArray(parsed)) {
          const validProds = parsed.filter((p: any) => p && p.id && !/^p-\d+$/.test(String(p.id)));
          if (validProds.length === 0) return defaultData;
          return validProds as unknown as T;
        }
        if (key === STORAGE_KEYS.CATEGORIES && Array.isArray(parsed)) {
          const legacyCatIds = new Set([
            'cat-pollo', 'cat-combos', 'cat-piezas', 'cat-hamburguesas',
            'cat-papas', 'cat-adicionales', 'cat-refrescos', 'cat-calientes', 'cat-express'
          ]);
          const validCats = parsed.filter((c: any) => c && c.id && !legacyCatIds.has(c.id));
          if (validCats.length === 0) return defaultData;
          return validCats as unknown as T;
        }
        return parsed;
      }
      return defaultData;
    } catch {
      return defaultData;
    }
  }

  private static setLocalData<T>(key: string, data: T): void {
    try {
      // Evitar desbordamiento de cuota: si son ventas históricas masivas, limitar caché de emergencia local a 50 registros
      const payload = (key === STORAGE_KEYS.SALES && Array.isArray(data))
        ? (data as any[]).slice(0, 50)
        : data;
      const serialized = JSON.stringify(payload);
      if (this.lastLocalSignatures.get(key) === serialized) {
        return;
      }
      localStorage.setItem(key, serialized);
      this.lastLocalSignatures.set(key, serialized);
    } catch (e) {
      console.warn('LocalStorage error (prevented quota crash):', e);
      try {
        if (key === STORAGE_KEYS.SALES) {
          localStorage.removeItem(STORAGE_KEYS.SALES);
          this.lastLocalSignatures.delete(STORAGE_KEYS.SALES);
        }
      } catch {}
    }
  }

  // ----------------------------------------------------
  // PRODUCTS & CATEGORIES
  // ----------------------------------------------------
  public static async getCategories(): Promise<Category[]> {
    try {
      const response = await fetch('/api/categories');
      if (response.ok) {
        const categories = await response.json();
        this.setLocalData(STORAGE_KEYS.CATEGORIES, categories);
        offlineStorage.cacheCatalog({ categories }).catch(() => {});
        return categories;
      }
    } catch {
      // offline fallback
    }
    try {
      const cached = await offlineStorage.getCachedCatalog();
      if (cached.categories && cached.categories.length > 0) {
        return cached.categories;
      }
    } catch {}
    return this.getLocalData<Category[]>(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES);
  }

  public static async saveCategory(category: Category): Promise<Category[]> {
    const categories = await this.getCategories();
    const existingIndex = categories.findIndex(c => c.id === category.id);
    if (existingIndex >= 0) {
      categories[existingIndex] = category;
    } else {
      categories.push(category);
    }
    this.setLocalData(STORAGE_KEYS.CATEGORIES, categories);

    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(category)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.categories) {
          this.setLocalData(STORAGE_KEYS.CATEGORIES, data.categories);
          return data.categories;
        }
      }
    } catch (e) {
      console.warn('Offline category save:', e);
    }
    return categories;
  }

  public static async deleteCategory(id: string): Promise<Category[]> {
    const categories = await this.getCategories();
    const filtered = categories.filter(c => c.id !== id);
    this.setLocalData(STORAGE_KEYS.CATEGORIES, filtered);

    try {
      const response = await fetch(`/api/categories/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        const data = await response.json();
        if (data.categories) {
          this.setLocalData(STORAGE_KEYS.CATEGORIES, data.categories);
          return data.categories;
        }
      }
    } catch (e) {
      console.warn('Offline category delete:', e);
    }
    return filtered;
  }

  public static async saveCategories(categories: Category[]): Promise<void> {
    this.setLocalData(STORAGE_KEYS.CATEGORIES, categories);
    for (const cat of categories) {
      try {
        await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cat)
        });
      } catch (e) {
        console.warn('Offline category save:', e);
      }
    }
  }

  private static memoryProductsCache: Product[] | null = null;
  private static memoryProductsEtag: string | null = null;

  public static async getProducts(forceRefresh = false): Promise<Product[]> {
    try {
      const headers: Record<string, string> = {};
      if (!forceRefresh && this.memoryProductsEtag && this.memoryProductsCache) {
        headers['If-None-Match'] = this.memoryProductsEtag;
      }
      const response = await fetch('/api/products', { headers });
      if (response.status === 304 && this.memoryProductsCache) {
        return this.memoryProductsCache;
      }
      if (response.ok) {
        const etag = response.headers.get('ETag');
        const products = await response.json();
        this.memoryProductsCache = products;
        if (etag) this.memoryProductsEtag = etag;
        this.setLocalData(STORAGE_KEYS.PRODUCTS, products);
        offlineStorage.cacheCatalog({ products }).catch(() => {});
        return products;
      }
    } catch {
      // offline fallback
    }
    if (this.memoryProductsCache) return this.memoryProductsCache;
    try {
      const cached = await offlineStorage.getCachedCatalog();
      if (cached.products && cached.products.length > 0) {
        this.memoryProductsCache = cached.products;
        return cached.products;
      }
    } catch {}
    return this.getLocalData<Product[]>(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
  }

  public static async saveProduct(product: Product): Promise<Product[]> {
    const products = await this.getProducts();
    const existingIndex = products.findIndex(p => p.id === product.id);
    if (existingIndex >= 0) {
      products[existingIndex] = product;
    } else {
      products.push(product);
    }
    this.memoryProductsCache = products;
    this.memoryProductsEtag = null;
    this.setLocalData(STORAGE_KEYS.PRODUCTS, products);

    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.products) {
          this.memoryProductsCache = data.products;
          return data.products;
        }
      }
    } catch (e) {
      console.warn('Offline product save:', e);
    }

    return products;
  }

  public static async syncCatalogWithCloud(): Promise<{ success: boolean; products: Product[]; categories: Category[]; changed: boolean; message: string }> {
    try {
      const response = await fetch('/api/catalog/sync', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        if (data.products && Array.isArray(data.products)) {
          this.memoryProductsCache = data.products;
          this.memoryProductsEtag = null;
          this.setLocalData(STORAGE_KEYS.PRODUCTS, data.products);
        }
        if (data.categories && Array.isArray(data.categories)) {
          this.setLocalData(STORAGE_KEYS.CATEGORIES, data.categories);
        }
        return data;
      }
    } catch (e: any) {
      console.warn('Offline catalog sync error:', e);
    }
    return {
      success: false,
      products: await this.getProducts(),
      categories: await this.getCategories(),
      changed: false,
      message: 'No se pudo contactar con el servidor local o la nube'
    };
  }

  public static async getCatalogVersion(): Promise<{ version: number; lastUpdated: string }> {
    try {
      const response = await fetch('/api/catalog/version');
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // offline fallback
    }
    return { version: 1, lastUpdated: '' };
  }

  public static async uploadProductImage(imageBase64: string, filename?: string): Promise<string> {
    if (!imageBase64 || typeof imageBase64 !== 'string') return '';
    // Si ya es una URL pública o ruta relativa válida
    if (imageBase64.startsWith('/uploads/') || imageBase64.startsWith('/images/') || imageBase64.startsWith('http')) {
      return imageBase64;
    }

    try {
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, filename })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.url) {
          return data.url;
        }
      }
    } catch (err) {
      console.warn('Fallo al subir imagen al servidor, se conservará Base64 local:', err);
    }
    // Fallback: conservar la imagen en Base64 para funcionamiento 100% offline
    return imageBase64;
  }

  public static async deleteProduct(id: string): Promise<Product[]> {
    const products = await this.getProducts();
    const filtered = products.filter(p => p.id !== id);
    this.memoryProductsCache = filtered;
    this.memoryProductsEtag = null;
    this.setLocalData(STORAGE_KEYS.PRODUCTS, filtered);

    try {
      const response = await fetch(`/api/products/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        const data = await response.json();
        if (data.products) {
          this.memoryProductsCache = data.products;
          return data.products;
        }
      }
    } catch (e) {
      console.warn('Offline product delete:', e);
    }

    return filtered;
  }

  // ----------------------------------------------------
  // CUSTOMERS
  // ----------------------------------------------------
  public static async getCustomers(): Promise<Customer[]> {
    try {
      const response = await fetch('/api/customers');
      if (response.ok) {
        const customers = await response.json();
        this.setLocalData(STORAGE_KEYS.CUSTOMERS, customers);
        offlineStorage.cacheCatalog({ customers }).catch(() => {});
        return customers;
      }
    } catch {
      // offline fallback
    }
    try {
      const cached = await offlineStorage.getCachedCatalog();
      if (cached.customers && cached.customers.length > 0) {
        return cached.customers;
      }
    } catch {}
    return this.getLocalData<Customer[]>(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
  }

  public static async saveCustomer(customer: Customer): Promise<Customer[]> {
    const customers = await this.getCustomers();
    const existingIndex = customers.findIndex(c => c.id === customer.id);
    if (existingIndex >= 0) {
      customers[existingIndex] = customer;
    } else {
      customers.push(customer);
    }
    this.setLocalData(STORAGE_KEYS.CUSTOMERS, customers);

    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customer)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.customers) return data.customers;
      }
    } catch (e) {
      console.warn('Offline customer save:', e);
    }

    return customers;
  }

  public static async importCustomers(customerList: Customer[], replaceAll = false): Promise<{ success: boolean; total: number; imported: number; updated: number; customers: Customer[] }> {
    let currentList = await this.getCustomers();
    
    if (replaceAll) {
      currentList = [...customerList];
    } else {
      let imp = 0;
      let upd = 0;
      for (const item of customerList) {
        const cleanId = (item.identification || '').trim();
        const existingIdx = currentList.findIndex(c => 
          c.id === item.id || 
          (cleanId && cleanId !== '000000000' && cleanId !== '100000000' && c.identification === cleanId)
        );

        if (existingIdx >= 0) {
          currentList[existingIdx] = { ...currentList[existingIdx], ...item, id: currentList[existingIdx].id };
          upd++;
        } else {
          currentList.push({
            ...item,
            id: item.id || `cust-${Date.now()}-${Math.floor(Math.random()*10000)}`,
            createdAt: item.createdAt || new Date().toISOString()
          });
          imp++;
        }
      }
    }

    this.setLocalData(STORAGE_KEYS.CUSTOMERS, currentList);

    try {
      const response = await fetch('/api/customers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customers: customerList, replaceAll })
      });
      if (response.ok) {
        const result = await response.json();
        if (result.customers) {
          this.setLocalData(STORAGE_KEYS.CUSTOMERS, result.customers);
          return result;
        }
      }
    } catch (e) {
      console.warn('Offline bulk customer import:', e);
    }

    return {
      success: true,
      total: currentList.length,
      imported: customerList.length,
      updated: 0,
      customers: currentList
    };
  }

  public static async deleteCustomer(id: string): Promise<Customer[]> {
    let customers = await this.getCustomers();
    customers = customers.filter(c => c.id !== id);
    this.setLocalData(STORAGE_KEYS.CUSTOMERS, customers);

    try {
      const response = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
      if (response.ok) {
        const data = await response.json();
        if (data.customers) {
          this.setLocalData(STORAGE_KEYS.CUSTOMERS, data.customers);
          return data.customers;
        }
      }
    } catch (e) {
      console.warn('Offline customer delete:', e);
    }
    return customers;
  }

  private static async migrateLocalStorageSalesToIndexedDB(): Promise<void> {
    if (this.salesMigratedToIdb) return;
    try {
      const migratedFlag = localStorage.getItem('sabor_cervanteno_sales_migrated');
      if (migratedFlag === 'true') {
        this.salesMigratedToIdb = true;
        return;
      }

      const storedSalesStr = localStorage.getItem(STORAGE_KEYS.SALES);
      if (storedSalesStr) {
        const oldSales: Sale[] = JSON.parse(storedSalesStr);
        if (Array.isArray(oldSales) && oldSales.length > 0) {
          console.info(`[Migration] Migrando ${oldSales.length} ventas desde localStorage a IndexedDB...`);
          await offlineStorage.saveOfflineSalesBatch(oldSales);
        }
      }
      localStorage.setItem('sabor_cervanteno_sales_migrated', 'true');
      this.salesMigratedToIdb = true;
      try {
        localStorage.removeItem(STORAGE_KEYS.SALES);
        this.lastLocalSignatures.delete(STORAGE_KEYS.SALES);
        console.info('[Migration] Limpieza exitosa de sabor_cervanteno_sales en localStorage (cuota liberada).');
      } catch {}
    } catch (e) {
      console.warn('[Migration] Error en migración de ventas a IndexedDB:', e);
    }
  }

  // ----------------------------------------------------
  // SALES (IndexedDB Offline-First)
  // ----------------------------------------------------
  public static async getSales(options?: {
    dateFrom?: string;
    dateTo?: string;
    since?: number;
    limit?: number;
    all?: boolean;
  }): Promise<Sale[]> {
    await this.migrateLocalStorageSalesToIndexedDB();

    try {
      const params = new URLSearchParams();
      if (options?.all) params.set('all', 'true');
      if (options?.dateFrom) params.set('dateFrom', options.dateFrom);
      if (options?.dateTo) params.set('dateTo', options.dateTo);
      if (options?.since && options.since > 0) params.set('since', String(options.since));
      if (options?.limit && options.limit > 0) params.set('limit', String(options.limit));
      const qs = params.toString();
      const url = qs ? `/api/sales?${qs}` : '/api/sales';

      const response = await fetch(url);
      if (response.ok) {
        const sales = await response.json();
        if (Array.isArray(sales) && sales.length > 0) {
          // Guardar en segundo plano en una única transacción IndexedDB atómica las ventas recientes
          const toCache = sales.slice(0, 50);
          offlineStorage.saveOfflineSalesBatch(toCache).catch(() => {});
        }
        return sales;
      }
    } catch {
      // offline fallback
    }
    return await offlineStorage.getOfflineSales();
  }

  public static async createSale(sale: Sale): Promise<Sale> {
    let savedSale = { ...sale };
    if (savedSale.timestamp) {
      savedSale.date = getCostaRicaDate(savedSale.timestamp);
      savedSale.time = getCostaRicaTime(savedSale.timestamp);
    } else {
      savedSale.date = savedSale.date || getCostaRicaDate();
      savedSale.time = savedSale.time || getCostaRicaTime();
    }

    // Persistir localmente de forma inmediata en IndexedDB (fuente de verdad offline)
    savedSale.offlineCreated = true;
    savedSale.syncedToCloud = false;
    await offlineStorage.saveOfflineSale(savedSale);

    try {
      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savedSale)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.sale) {
          savedSale = data.sale;
          savedSale.syncedToCloud = true;
          savedSale.offlineCreated = false;
          await offlineStorage.saveOfflineSale(savedSale);
        }
      }
    } catch (err) {
      console.warn('[Offline] Venta guardada en IndexedDB pendiente de sincronización con servidor:', err);
    }

    return savedSale;
  }

  public static async updateSaleStatus(
    saleId: string,
    updates: Partial<Sale>
  ): Promise<Sale | null> {
    const localSales = await offlineStorage.getOfflineSales();
    const existing = localSales.find(s => s.id === saleId);
    let updatedSale: Sale | null = null;
    if (existing) {
      updatedSale = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      await offlineStorage.saveOfflineSale(updatedSale);
    }

    try {
      const response = await fetch(`/api/sales/${saleId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.sale) {
          updatedSale = data.sale;
          await offlineStorage.saveOfflineSale(updatedSale);
        }
        return updatedSale;
      }
    } catch (e) {
      console.warn('Failed to update status on server:', e);
    }

    return updatedSale;
  }

  // ----------------------------------------------------
  // KITCHEN ORDERS / COMANDAS (KDS)
  // ----------------------------------------------------
  public static async getNextDailyOrderNumber(targetDate?: string): Promise<number> {
    try {
      const url = targetDate ? `/api/kitchen-orders/next-number?date=${encodeURIComponent(targetDate)}` : '/api/kitchen-orders/next-number';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (typeof data.nextNumber === 'number') {
          return data.nextNumber;
        }
      }
    } catch {
      // offline fallback: calcular con base local del día
    }

    const dateStr = targetDate || getCostaRicaDate();
    const BASE_DAILY = 100;
    const localSales = await offlineStorage.getOfflineSales();
    const localKitchen = this.getLocalData<KitchenOrder[]>(STORAGE_KEYS.KITCHEN_ORDERS, []);

    const todaySales = localSales.filter(s => (s.timestamp ? getCostaRicaDate(s.timestamp) : (s.date || '')) === dateStr && (s.orderNumber || 0) < 1000);
    const todayKitchen = localKitchen.filter(k => (k.timestamp ? getCostaRicaDate(k.timestamp) : (k.date || '')) === dateStr && (k.orderNumber || 0) < 1000);

    const highestSales = todaySales.reduce((max, s) => Math.max(max, s.orderNumber || 0), BASE_DAILY);
    const highestKitchen = todayKitchen.reduce((max, k) => Math.max(max, k.orderNumber || 0), BASE_DAILY);

    return Math.max(highestSales, highestKitchen) + 1;
  }

  public static async getKitchenOrders(): Promise<KitchenOrder[]> {
    try {
      const response = await fetch('/api/kitchen-orders');
      if (response.ok) {
        const orders = await response.json();
        this.setLocalData(STORAGE_KEYS.KITCHEN_ORDERS, orders);
        return orders;
      }
    } catch {
      // offline fallback
    }
    return this.getLocalData<KitchenOrder[]>(STORAGE_KEYS.KITCHEN_ORDERS, []);
  }

  // ----------------------------------------------------
  // KITCHEN ORDERS OUTBOX QUEUE (BANDEJA DE SALIDA OFFLINE)
  // ----------------------------------------------------
  public static enqueueKitchenOrderOutbox(order: KitchenOrder): void {
    try {
      const outbox = this.getLocalData<KitchenOrder[]>(STORAGE_KEYS.KITCHEN_OUTBOX, []);
      const existingIdx = outbox.findIndex(k => k.id === order.id);
      if (existingIdx >= 0) {
        outbox[existingIdx] = { ...outbox[existingIdx], ...order, updatedAt: new Date().toISOString() };
      } else {
        outbox.push({ ...order, updatedAt: new Date().toISOString() });
      }
      this.setLocalData(STORAGE_KEYS.KITCHEN_OUTBOX, outbox);
      console.log(`[Outbox] Comanda #${order.orderNumber || ''} (${order.id}) encolada en bandeja de salida para reintento automático.`);
    } catch (e) {
      console.warn('Error encolando comanda en outbox:', e);
    }
  }

  public static getKitchenOrderOutbox(): KitchenOrder[] {
    return this.getLocalData<KitchenOrder[]>(STORAGE_KEYS.KITCHEN_OUTBOX, []);
  }

  public static async syncKitchenOrdersOutbox(): Promise<number> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return 0;
    }
    const outbox = this.getLocalData<KitchenOrder[]>(STORAGE_KEYS.KITCHEN_OUTBOX, []);
    if (!outbox || outbox.length === 0) return 0;

    let syncedCount = 0;
    const remaining: KitchenOrder[] = [];

    for (const order of outbox) {
      try {
        const response = await fetch('/api/kitchen-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(order)
        });
        if (response.ok) {
          syncedCount++;
          console.log(`[Outbox] Comanda #${order.orderNumber || ''} (${order.id}) retransmitida y sincronizada exitosamente.`);
        } else {
          remaining.push(order);
        }
      } catch {
        remaining.push(order);
        // Interrumpir el lote actual si falla la red
        break;
      }
    }

    this.setLocalData(STORAGE_KEYS.KITCHEN_OUTBOX, remaining);
    return syncedCount;
  }

  public static async createKitchenOrder(order: KitchenOrder): Promise<KitchenOrder> {
    let savedOrder = { ...order };
    if (savedOrder.timestamp) {
      savedOrder.date = getCostaRicaDate(savedOrder.timestamp);
      savedOrder.time = getCostaRicaTime(savedOrder.timestamp);
    } else {
      savedOrder.date = savedOrder.date || getCostaRicaDate();
      savedOrder.time = savedOrder.time || getCostaRicaTime();
    }
    const localOrders = this.getLocalData<KitchenOrder[]>(STORAGE_KEYS.KITCHEN_ORDERS, []);
    
    // Idempotencia local
    const existingIdx = localOrders.findIndex(k => k.id === savedOrder.id);
    if (existingIdx >= 0) {
      localOrders[existingIdx] = { ...localOrders[existingIdx], ...savedOrder };
    } else {
      localOrders.unshift(savedOrder);
    }
    this.setLocalData(STORAGE_KEYS.KITCHEN_ORDERS, localOrders);

    try {
      const response = await fetch('/api/kitchen-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savedOrder)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.kitchenOrder) {
          savedOrder = data.kitchenOrder;
          const updated = localOrders.map(k => k.id === savedOrder.id ? savedOrder : k);
          this.setLocalData(STORAGE_KEYS.KITCHEN_ORDERS, updated);
        }
        // Disparar sincronización de cualquier comanda pendiente acumulada en outbox
        this.syncKitchenOrdersOutbox().catch(() => {});
      } else {
        // Encolar en bandeja de salida para reintento automático
        this.enqueueKitchenOrderOutbox(savedOrder);
      }
    } catch (err) {
      console.warn('[Offline] Guardado de comanda local, encolada en Outbox:', err);
      this.enqueueKitchenOrderOutbox(savedOrder);
    }

    return savedOrder;
  }

  public static async cleanupDuplicateKitchenOrders(targetDate: string, duplicateOrderNumbers: number[]): Promise<{ success: boolean; removedCount: number; removedNumbers: number[] }> {
    try {
      const response = await fetch('/api/kitchen-orders/cleanup-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDate, duplicateOrderNumbers })
      });
      if (response.ok) {
        const data = await response.json();
        // Limpiar también en localStorage
        const localOrders = this.getLocalData<KitchenOrder[]>(STORAGE_KEYS.KITCHEN_ORDERS, []);
        const updated = localOrders.filter(k => !(k.date === targetDate && duplicateOrderNumbers.includes(k.orderNumber) && !k.saleId && !k.isPaid));
        this.setLocalData(STORAGE_KEYS.KITCHEN_ORDERS, updated);
        return data;
      }
    } catch (err) {
      console.error('Error cleaning duplicate kitchen orders:', err);
    }
    return { success: false, removedCount: 0, removedNumbers: [] };
  }

  public static async updateKitchenOrderStatus(orderId: string, status: OrderStatus): Promise<KitchenOrder | null> {
    const localOrders = this.getLocalData<KitchenOrder[]>(STORAGE_KEYS.KITCHEN_ORDERS, []);
    const idx = localOrders.findIndex(k => k.id === orderId);
    if (idx !== -1) {
      localOrders[idx] = { ...localOrders[idx], orderStatus: status, updatedAt: new Date().toISOString() };
      this.setLocalData(STORAGE_KEYS.KITCHEN_ORDERS, localOrders);
    }

    try {
      const response = await fetch(`/api/kitchen-orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (response.ok) {
        const data = await response.json();
        return data.kitchenOrder;
      }
    } catch (e) {
      console.warn('Failed to update kitchen order status on server:', e);
    }

    return idx !== -1 ? localOrders[idx] : null;
  }

  public static async updateKitchenOrder(orderId: string, updates: Partial<KitchenOrder>): Promise<KitchenOrder | null> {
    const localOrders = this.getLocalData<KitchenOrder[]>(STORAGE_KEYS.KITCHEN_ORDERS, []);
    const idx = localOrders.findIndex(k => k.id === orderId);
    if (idx !== -1) {
      localOrders[idx] = { ...localOrders[idx], ...updates, updatedAt: new Date().toISOString() };
      this.setLocalData(STORAGE_KEYS.KITCHEN_ORDERS, localOrders);
    }

    try {
      const response = await fetch(`/api/kitchen-orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (response.ok) {
        const data = await response.json();
        return data.kitchenOrder;
      } else if (idx !== -1) {
        this.enqueueKitchenOrderOutbox(localOrders[idx]);
      }
    } catch (e) {
      console.warn('Failed to update kitchen order on server, enqueuing to outbox:', e);
      if (idx !== -1) {
        this.enqueueKitchenOrderOutbox(localOrders[idx]);
      }
    }

    return idx !== -1 ? localOrders[idx] : null;
  }

  // ----------------------------------------------------
  // CASH REGISTER
  // ----------------------------------------------------
  public static async getCurrentCashRegister(): Promise<{ register: CashRegister; movements: CashMovement[] }> {
    try {
      const response = await fetch('/api/cash-register/current');
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // offline
    }
    const defaultReg: CashRegister = {
      id: 'reg-local',
      cashierId: 'usr-1',
      cashierName: 'Cajero Principal',
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
    };
    return {
      register: this.getLocalData(STORAGE_KEYS.CASH_REGISTER, defaultReg),
      movements: this.getLocalData(STORAGE_KEYS.CASH_MOVEMENTS, [])
    };
  }

  public static async getCashRegisterHistory(): Promise<CashRegister[]> {
    try {
      const response = await fetch('/api/cash-register/history');
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // offline
    }
    return this.getLocalData<CashRegister[]>('sabor_pos_cash_register_history', []);
  }

  public static async openCashRegister(openingBalance: number, cashierName: string, location: 'RESTAURANTE' | 'CEDI'): Promise<CashRegister> {
    try {
      const response = await fetch('/api/cash-register/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openingBalance, cashierName, location })
      });
      if (response.ok) {
        const data = await response.json();
        return data.register;
      }
    } catch (e) {
      console.warn('Offline open register:', e);
    }
    const reg: CashRegister = {
      id: `reg-${Date.now()}`,
      cashierId: 'usr-1',
      cashierName,
      location,
      openTime: new Date().toISOString(),
      openingBalance,
      cashSales: 0,
      cardSales: 0,
      sinpeSales: 0,
      transferSales: 0,
      cashIn: 0,
      cashOut: 0,
      expectedCash: openingBalance,
      status: 'OPEN',
      totalInvoicesCount: 0
    };
    this.setLocalData(STORAGE_KEYS.CASH_REGISTER, reg);
    return reg;
  }

  public static async closeCashRegister(countedCash: number, notes?: string): Promise<CashRegister> {
    try {
      const response = await fetch('/api/cash-register/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countedCash, notes })
      });
      if (response.ok) {
        const data = await response.json();
        return data.register;
      }
    } catch (e) {
      console.warn('Offline close register:', e);
    }
    const current = await this.getCurrentCashRegister();
    const updated: CashRegister = {
      ...current.register,
      status: 'CLOSED',
      closeTime: new Date().toISOString(),
      countedCash,
      difference: countedCash - current.register.expectedCash,
      notes
    };
    this.setLocalData(STORAGE_KEYS.CASH_REGISTER, updated);
    return updated;
  }

  public static async addCashMovement(type: 'IN' | 'OUT', amount: number, reason: string): Promise<CashMovement> {
    const mov: CashMovement = {
      id: `mov-${Date.now()}`,
      cashRegisterId: 'reg-001',
      type,
      amount,
      reason,
      timestamp: new Date().toISOString(),
      cashierName: 'Cajero Principal'
    };

    try {
      await fetch('/api/cash-register/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, amount, reason, cashierName: 'Cajero Principal' })
      });
    } catch (e) {
      console.warn('Offline movement:', e);
    }

    const movements = this.getLocalData<CashMovement[]>(STORAGE_KEYS.CASH_MOVEMENTS, []);
    movements.unshift(mov);
    this.setLocalData(STORAGE_KEYS.CASH_MOVEMENTS, movements);
    return mov;
  }

  // ----------------------------------------------------
  // FISCAL & CABYS (HACIENDA COSTA RICA v4.4)
  // ----------------------------------------------------
  public static async getCabysCatalog(query?: string): Promise<any[]> {
    try {
      const url = query ? `/api/fiscal/cabys?q=${encodeURIComponent(query)}` : '/api/fiscal/cabys';
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Error fetching CABYS catalog:', e);
    }
    return [];
  }

  public static async validateCabysCode(code: string): Promise<{ valid: boolean; message: string; officialDescription?: string; suggestedTax?: number }> {
    try {
      const response = await fetch(`/api/fiscal/cabys/validate/${encodeURIComponent(code)}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Error validating CABYS:', e);
    }
    // Fallback básico
    const trimmed = (code || '').trim();
    if (/^\d{13}$/.test(trimmed)) {
      return { valid: true, message: 'Formato de 13 dígitos correcto' };
    }
    return { valid: false, message: 'Debe contener exactamente 13 dígitos numéricos.' };
  }

  public static async validateSaleFiscalPayload(payload: any): Promise<any> {
    try {
      const response = await fetch('/api/fiscal/validate-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Error validating sale payload fiscally:', e);
    }
    return { isValid: true, errors: [], warnings: [] };
  }

  public static async getTaxRates(): Promise<any[]> {
    try {
      const response = await fetch('/api/fiscal/tax-rates');
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Error fetching tax rates:', e);
    }
    return [];
  }

  public static async getFiscalCompanyInfo(): Promise<any> {
    try {
      const response = await fetch('/api/fiscal/company-info');
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Error fetching fiscal company info:', e);
    }
    return null;
  }

  public static async saveFiscalCompanyInfo(data: any): Promise<any> {
    try {
      const response = await fetch('/api/fiscal/company-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Error saving fiscal company info:', e);
    }
    return { success: false };
  }

  public static async getFiscalAuditLogs(): Promise<any[]> {
    try {
      const response = await fetch('/api/fiscal/audit-logs');
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Error fetching fiscal audit logs:', e);
    }
    return [];
  }

  public static async getElectronicDocuments(params?: {
    page?: number;
    limit?: number;
    search?: string;
    docType?: string;
    status?: string;
    sort?: 'ASC' | 'DESC';
    dateFrom?: string;
    dateTo?: string;
    dateMode?: 'saleDate' | 'issueDate';
    paginated?: boolean;
    full?: boolean;
  }): Promise<{ items: any[]; pagination?: { page: number; limit: number; total: number; totalPages: number; hasPrev: boolean; hasNext: boolean } } | any[]> {
    try {
      let url = '/api/fiscal/electronic-documents';
      if (params) {
        const query = new URLSearchParams();
        if (params.page !== undefined) query.set('page', String(params.page));
        if (params.limit !== undefined) query.set('limit', String(params.limit));
        if (params.search) query.set('search', params.search);
        if (params.docType && params.docType !== 'ALL') query.set('docType', params.docType);
        if (params.status && params.status !== 'ALL') query.set('status', params.status);
        if (params.sort) query.set('sort', params.sort);
        if (params.dateFrom) query.set('dateFrom', params.dateFrom);
        if (params.dateTo) query.set('dateTo', params.dateTo);
        if (params.dateMode) query.set('dateMode', params.dateMode);
        if (params.paginated) query.set('paginated', 'true');
        if (params.full) query.set('full', 'true');
        const qs = query.toString();
        if (qs) url += `?${qs}`;
      }

      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Error fetching electronic documents:', e);
    }
    return params?.paginated ? { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1, hasPrev: false, hasNext: false } } : [];
  }

  public static async getElectronicDocumentById(id: string): Promise<any | null> {
    try {
      const response = await fetch(`/api/fiscal/electronic-documents/${encodeURIComponent(id)}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Error fetching electronic document details:', e);
    }
    return null;
  }

  public static async emitElectronicDocument(params: {
    sale: any;
    documentType: ElectronicDocumentType;
    receiverCustomer?: any;
    branch?: string;
    terminal?: string;
    isContingency?: boolean;
    contingencyReason?: string;
    isOffline?: boolean;
    forceSituation?: '1' | '2' | '3';
    useRestaurantServiceLine?: boolean;
  }): Promise<{ success: boolean; electronicDocument?: any; validationErrors?: string[]; validationWarnings?: string[]; message: string }> {
    try {
      const response = await fetch('/api/fiscal/emit-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return { 
          success: false, 
          message: 'El servidor fiscal no devolvió una respuesta JSON válida. Asegúrese de que el backend esté publicado e iniciado correctamente.' 
        };
      }
      if (response.ok) {
        return await response.json();
      }
      const err = await response.json().catch(() => ({}));
      return { success: false, message: err.message || 'Error al emitir comprobante electrónico' };
    } catch (e: any) {
      console.warn('Error emitting electronic document:', e);
      return { success: false, message: e.message || 'Error de conexión con el motor fiscal' };
    }
  }

  public static async emitCreditNote(params: {
    originalDocumentKey: string;
    reason: string;
    referenceCode?: string;
    referenceDocumentType?: ElectronicDocumentType | string;
    customNumericKey?: string;
    cashierName: string;
    branch?: string;
    terminal?: string;
  }): Promise<{ success: boolean; electronicDocument?: any; message: string }> {
    try {
      const response = await fetch('/api/fiscal/emit-credit-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return { 
          success: false, 
          message: 'El servidor fiscal no devolvió una respuesta JSON válida. Verifique el estado del backend.' 
        };
      }
      if (response.ok) {
        return await response.json();
      }
      const err = await response.json().catch(() => ({}));
      return { success: false, message: err.message || 'Error al emitir Nota de Crédito' };
    } catch (e: any) {
      console.warn('Error emitting credit note:', e);
      return { success: false, message: e.message || 'Error de conexión con el motor fiscal' };
    }
  }

  public static async getFiscalPendingCount(date?: string): Promise<number> {
    try {
      const url = date ? `/api/fiscal/pending-count?date=${encodeURIComponent(date)}` : '/api/fiscal/pending-count';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        return Number(data.count) || 0;
      }
    } catch (e) {
      console.warn('Error fetching pending fiscal count:', e);
    }
    return 0;
  }

  public static async emitPendingBatch(params?: {
    date?: string;
    saleIds?: string[];
    sales?: any[];
  } | string, salesList?: any[]): Promise<{
    success: boolean;
    totalPending: number;
    emittedCount: number;
    failedCount: number;
    errors?: string[];
    message: string;
  }> {
    try {
      let body: any = {};
      if (typeof params === 'string') {
        body = { date: params, sales: salesList };
      } else if (params && typeof params === 'object') {
        body = { ...params };
        if (salesList && !body.sales) body.sales = salesList;
      }
      const res = await fetch('/api/fiscal/emit-pending-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        return await res.json();
      }
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        totalPending: 0,
        emittedCount: 0,
        failedCount: 0,
        message: err.message || 'Error al procesar emisión en lote'
      };
    } catch (e: any) {
      return {
        success: false,
        totalPending: 0,
        emittedCount: 0,
        failedCount: 0,
        message: e.message || 'Error de conexión'
      };
    }
  }

  // ----------------------------------------------------
  // HACIENDA DIRECT AUTONOMOUS CONFIG & SERVICES
  // ----------------------------------------------------
  public static async getHaciendaDirectConfig(): Promise<{ config: HaciendaDirectConfig; consecutives: ConsecutiveControl[] }> {
    try {
      const response = await fetch('/api/fiscal/hacienda-config');
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Error fetching direct hacienda config:', e);
    }
    const local = this.getLocalData<HaciendaDirectConfig>(STORAGE_KEYS.HACIENDA_CONFIG, INITIAL_HACIENDA_DIRECT_CONFIG);
    return {
      config: local,
      consecutives: []
    };
  }

  public static async saveHaciendaDirectConfig(config: Partial<HaciendaDirectConfig>): Promise<{ success: boolean; config: HaciendaDirectConfig; consecutives: ConsecutiveControl[] }> {
    try {
      const response = await fetch('/api/fiscal/hacienda-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (response.ok) {
        const data = await response.json();
        this.setLocalData(STORAGE_KEYS.HACIENDA_CONFIG, data.config);
        return data;
      }
    } catch (e) {
      console.warn('Error saving direct hacienda config to server, saving locally:', e);
    }
    const current = this.getLocalData<HaciendaDirectConfig>(STORAGE_KEYS.HACIENDA_CONFIG, INITIAL_HACIENDA_DIRECT_CONFIG);
    const updated = { ...current, ...config };
    this.setLocalData(STORAGE_KEYS.HACIENDA_CONFIG, updated);
    return { success: true, config: updated, consecutives: [] };
  }

  public static async testHaciendaConnection(params: {
    username: string;
    password: string;
    environment: 'STAGING' | 'PRODUCTION';
    p12Base64?: string;
    pin?: string;
  }): Promise<{ success: boolean; message: string; tokenExpiresIn?: number; keyValidation?: any }> {
    try {
      const response = await fetch('/api/fiscal/test-hacienda-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        return {
          success: false,
          message: `Error del servidor (${response.status}): ${text.substring(0, 120) || 'Service Unavailable'}`
        };
      }
      return {
        success: response.ok && data.success,
        message: data.message || (response.ok ? 'Prueba exitosa' : 'Error en la prueba'),
        tokenExpiresIn: data.tokenExpiresIn,
        keyValidation: data.keyValidation
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Error al intentar conectar: ${e.message}`
      };
    }
  }

  public static async peekNextConsecutive(
    docType: ElectronicDocumentType = '04',
    branch: string = '001',
    terminal: string = '00001'
  ): Promise<{
    success: boolean;
    consecutive: string;
    sequenceNumber: number;
    documentType: ElectronicDocumentType;
    branch: string;
    terminal: string;
    numericKeyPreview: string;
    description: string;
    isVerifiedUnique: boolean;
  }> {
    try {
      const response = await fetch(`/api/fiscal/peek-consecutive?docType=${docType}&branch=${branch}&terminal=${terminal}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Error peeking next consecutive:', e);
    }
    const cleanBranch = branch.padStart(3, '0');
    const cleanTerminal = terminal.padStart(5, '0');
    const fallbackConsecutive = `${cleanBranch}${cleanTerminal}${docType}0000000001`;
    return {
      success: true,
      consecutive: fallbackConsecutive,
      sequenceNumber: 1,
      documentType: docType,
      branch: cleanBranch,
      terminal: cleanTerminal,
      numericKeyPreview: `506${new Date().getDate().toString().padStart(2, '0')}${(new Date().getMonth() + 1).toString().padStart(2, '0')}${new Date().getFullYear().toString().substring(2)}302680311000${fallbackConsecutive}188888888`,
      description: docType === '01' ? 'Factura Electrónica' :
                   docType === '02' ? 'Nota de Débito Electrónica' :
                   docType === '03' ? 'Nota de Crédito Electrónica' :
                   docType === '04' ? 'Tiquete Electrónico' :
                   docType === '05' ? 'Factura Electrónica de Compra' :
                   'Recibo Electrónico de Pago',
      isVerifiedUnique: true
    };
  }

  public static async getConsecutivesAudit(): Promise<{
    success: boolean;
    controls: ConsecutiveControl[];
    history: any[];
    keysHistory: any[];
    totalConsecutivesUsed: number;
    totalKeysGenerated: number;
  }> {
    try {
      const response = await fetch('/api/fiscal/consecutives-audit');
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Error fetching consecutives audit:', e);
    }
    return {
      success: true,
      controls: [],
      history: [],
      keysHistory: [],
      totalConsecutivesUsed: 0,
      totalKeysGenerated: 0
    };
  }

  public static async setConsecutives(params: {
    branch?: string;
    terminal?: string;
    lastFacturaNumber?: number;
    lastNotaDebitoNumber?: number;
    lastNotaCreditoNumber?: number;
    lastTiqueteNumber?: number;
    lastFacturaCompraNumber?: number;
    lastReciboPagoNumber?: number;
  }): Promise<{ success: boolean; message: string; consecutiveControls?: ConsecutiveControl[] }> {
    try {
      const response = await fetch('/api/fiscal/set-consecutives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      if (response.ok) {
        return await response.json();
      }
      const err = await response.json().catch(() => ({}));
      return { success: false, message: err.message || 'Error al actualizar números de consecutivo' };
    } catch (e: any) {
      return { success: false, message: e.message || 'Error de conexión' };
    }
  }

  public static async queryHaciendaDocument(numericKey: string): Promise<{
    success: boolean;
    status: string;
    message: string;
    document?: any;
    raw?: any;
  }> {
    try {
      const response = await fetch(`/api/fiscal/query-document/${numericKey}`);
      if (response.ok) {
        return await response.json();
      }
      return { success: false, status: 'ERROR', message: 'No se pudo consultar el comprobante' };
    } catch (e: any) {
      return { success: false, status: 'ERROR', message: e.message };
    }
  }

  public static async reconcilePendingDocuments(): Promise<{
    success: boolean;
    message: string;
    result?: { totalChecked: number; accepted: number; rejected: number; stillProcessing: number };
  }> {
    try {
      const response = await fetch('/api/fiscal/reconcile-pending', { method: 'POST' });
      if (response.ok) {
        return await response.json();
      }
      const err = await response.json().catch(() => ({}));
      return { success: false, message: err.message || 'Error en sondeo de comprobantes' };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  public static async reissueRejectedDocument(numericKey: string, reason?: string): Promise<{
    success: boolean;
    message: string;
    oldKey?: string;
    newDocument?: any;
    haciendaStatus?: string;
  }> {
    try {
      const response = await fetch('/api/fiscal/reissue-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numericKey, reason })
      });
      if (response.ok) {
        return await response.json();
      }
      const err = await response.json().catch(() => ({}));
      return { success: false, message: err.message || 'Error al reemitir comprobante' };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  public static async emitTestTicket(): Promise<{
    success: boolean;
    message: string;
    sale?: any;
    emission?: any;
  }> {
    try {
      const response = await fetch('/api/fiscal/test-emit-ticket', { method: 'POST' });
      if (response.ok) {
        return await response.json();
      }
      const err = await response.json().catch(() => ({}));
      return { success: false, message: err.message || 'Error al emitir tiquete de prueba' };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  // ----------------------------------------------------
  // ENVÍO DE FACTURAS POR CORREO & DESCARGAS FISCALES
  // ----------------------------------------------------
  public static async sendInvoiceEmail(numericKey: string, recipientEmail?: string): Promise<{
    success: boolean;
    message: string;
    log?: EmailDispatchLog;
    recipientEmail?: string;
  }> {
    try {
      const response = await fetch('/api/fiscal/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numericKey, recipientEmail })
      });
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        return {
          success: false,
          message: `Error del servidor (${response.status}): ${text.substring(0, 120) || 'Service Unavailable'}`
        };
      }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al enviar correo' };
    }
  }

  public static async testEmailConnection(config: Partial<HaciendaDirectConfig>): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const response = await fetch('/api/fiscal/test-email-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        return {
          success: false,
          message: `Error del servidor (${response.status}): ${text.substring(0, 120) || 'Service Unavailable'}`
        };
      }
      return {
        success: response.ok && data.success,
        message: data.message || (response.ok ? 'Prueba SMTP exitosa' : 'Error en la prueba SMTP')
      };
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al conectar con servidor SMTP' };
    }
  }

  // ----------------------------------------------------
  // AUDITORÍA Y EMISOR V4.4
  // ----------------------------------------------------
  public static async validateIssuer(candidate?: any): Promise<{
    success: boolean;
    audit: {
      isValid: boolean;
      errors: string[];
      warnings: string[];
      tableRows: Array<{
        field: string;
        officialRequirement: string;
        rule: string;
        currentValue: string;
        status: 'PASS' | 'FAIL' | 'NO_APLICA' | 'NO_VERIFICABLE';
        legalReference: string;
      }>;
    };
  }> {
    try {
      const response = await fetch('/api/fiscal/validate-issuer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate || {})
      });
      return await response.json();
    } catch (e: any) {
      return {
        success: false,
        audit: {
          isValid: false,
          errors: [e.message || 'Error al validar emisor'],
          warnings: [],
          tableRows: []
        }
      };
    }
  }

  public static async generateTestFactura01(params?: {
    issuerOverride?: any;
    receiver?: any;
  }): Promise<{
    success: boolean;
    message: string;
    sampleDoc?: any;
    xml?: string;
    audit?: any;
    error?: string;
  }> {
    try {
      const response = await fetch('/api/fiscal/test-factura-01', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params || {})
      });
      return await response.json();
    } catch (e: any) {
      return {
        success: false,
        message: e.message || 'Error al generar factura de prueba'
      };
    }
  }

  public static async getEmailDispatchLogs(): Promise<EmailDispatchLog[]> {
    try {
      const response = await fetch('/api/fiscal/email-logs');
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Error al cargar logs de correo:', e);
    }
    return [];
  }

  public static getDownloadPdfUrl(numericKey: string): string {
    return `/api/fiscal/download-pdf/${numericKey}`;
  }

  public static getDownloadXmlUrl(numericKey: string): string {
    return `/api/fiscal/download-xml/${numericKey}`;
  }

  public static getDownloadHaciendaXmlUrl(numericKey: string): string {
    return `/api/fiscal/download-hacienda-xml/${numericKey}`;
  }

  // ----------------------------------------------------
  // DATABASE DIAGNOSTICS & BACKUPS
  // ----------------------------------------------------
  public static async getDatabaseStats(): Promise<any> {
    try {
      const response = await fetch('/api/db/stats');
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Failed to get database stats:', e);
    }
    return {
      status: 'LOCAL_BROWSER_FALLBACK',
      engine: 'LocalStorage Cache',
      counts: {
        products: this.getLocalData<any[]>(STORAGE_KEYS.PRODUCTS, []).length,
        categories: this.getLocalData<any[]>(STORAGE_KEYS.CATEGORIES, []).length,
        customers: this.getLocalData<any[]>(STORAGE_KEYS.CUSTOMERS, []).length,
        sales: this.getLocalData<any[]>(STORAGE_KEYS.SALES, []).length
      }
    };
  }

  public static async resetDatabase(): Promise<any> {
    try {
      const response = await fetch('/api/db/reset', { method: 'POST' });
      if (response.ok) {
        localStorage.clear();
        return await response.json();
      }
    } catch (e) {
      console.warn('Failed to reset database:', e);
    }
    return { success: false };
  }

  // ----------------------------------------------------
  // USERS & CASHIERS
  // ----------------------------------------------------
  public static async getUsers(): Promise<UserProfile[]> {
    const cachedUsers = this.getLocalData<UserProfile[]>(STORAGE_KEYS.USERS, []);
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const serverUsers = await response.json();
        if (Array.isArray(serverUsers) && serverUsers.length > 0) {
          const mergedMap = new Map<string, UserProfile>();
          for (const u of SYSTEM_USERS) {
            if (u && u.id) mergedMap.set(u.id, { ...u });
          }
          for (const u of serverUsers) {
            if (u && u.id) mergedMap.set(u.id, { ...(mergedMap.get(u.id) || {}), ...u });
          }
          // Si el navegador tiene PINs personalizados en caché local, preservarlos
          for (const localU of cachedUsers) {
            if (localU && localU.id && localU.id !== 'usr-cajero-1' && localU.id !== 'usr-cajero-2') {
              const srvU = mergedMap.get(localU.id);
              const sysU = SYSTEM_USERS.find(s => s.id === localU.id);
              if (srvU && localU.pinCode && (!srvU.pinCode || (sysU && srvU.pinCode === sysU.pinCode && localU.pinCode !== sysU.pinCode))) {
                mergedMap.set(localU.id, { ...srvU, pinCode: localU.pinCode });
              } else if (!srvU) {
                mergedMap.set(localU.id, localU);
              }
            }
          }
          const finalUsers = Array.from(mergedMap.values());
          this.setLocalData(STORAGE_KEYS.USERS, finalUsers);
          const admin = finalUsers.find(u => u.role === 'ADMINISTRADOR' && u.pinCode);
          if (admin?.pinCode) localStorage.setItem('pos_admin_pin', admin.pinCode);
          const cashier = finalUsers.find(u => u.role === 'CAJERO' && u.pinCode);
          if (cashier?.pinCode) localStorage.setItem('pos_cashier_pin', cashier.pinCode);
          return finalUsers;
        }
      }
    } catch {
      // offline fallback
    }
    return cachedUsers.length > 0 ? cachedUsers : SYSTEM_USERS;
  }

  public static async saveUser(user: UserProfile): Promise<UserProfile[]> {
    const userToSave: UserProfile = {
      ...user,
      updatedAt: new Date().toISOString()
    };

    // Actualizar llaves de autenticación rápida en localStorage si aplica
    if (userToSave.role === 'ADMINISTRADOR' && userToSave.pinCode) {
      localStorage.setItem('pos_admin_pin', userToSave.pinCode);
    }
    if (userToSave.role === 'CAJERO' && userToSave.pinCode) {
      localStorage.setItem('pos_cashier_pin', userToSave.pinCode);
    }

    // Refrescar perfil activo en la sesión actual si coincide el ID
    try {
      const currentSessionStr = localStorage.getItem('sabor_cervanteno_current_user');
      if (currentSessionStr) {
        const currentSession = JSON.parse(currentSessionStr);
        if (currentSession.id === userToSave.id) {
          localStorage.setItem('sabor_cervanteno_current_user', JSON.stringify({ ...currentSession, ...userToSave }));
        }
      }
    } catch (e) {
      console.warn('Error refrescando sesión activa:', e);
    }

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userToSave)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.users) {
          this.setLocalData(STORAGE_KEYS.USERS, data.users);
          return data.users;
        }
      }
    } catch {
      // offline fallback
    }

    const currentUsers = this.getLocalData<UserProfile[]>(STORAGE_KEYS.USERS, SYSTEM_USERS);
    const idx = currentUsers.findIndex(u => u.id === userToSave.id);
    if (idx >= 0) {
      currentUsers[idx] = { ...currentUsers[idx], ...userToSave };
    } else {
      currentUsers.push(userToSave);
    }
    this.setLocalData(STORAGE_KEYS.USERS, currentUsers);
    return currentUsers;
  }

  public static async deleteUser(userId: string): Promise<UserProfile[]> {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        const data = await response.json();
        if (data.users) {
          this.setLocalData(STORAGE_KEYS.USERS, data.users);
          return data.users;
        }
      }
    } catch {
      // offline fallback
    }

    const currentUsers = this.getLocalData<UserProfile[]>(STORAGE_KEYS.USERS, SYSTEM_USERS);
    const filtered = currentUsers.filter(u => u.id !== userId);
    this.setLocalData(STORAGE_KEYS.USERS, filtered);
    return filtered;
  }

  // ----------------------------------------------------
  // OBSERVACIONES OFICIALES DE COCINA (CREADAS POR ADMINISTRADOR)
  // ----------------------------------------------------
  public static async getKitchenObservations(): Promise<KitchenObservation[]> {
    try {
      const response = await fetch('/api/kitchen-observations');
      if (response.ok) {
        const obs = await response.json();
        if (Array.isArray(obs)) {
          this.setLocalData(STORAGE_KEYS.KITCHEN_OBSERVATIONS, obs);
          return obs;
        }
      }
    } catch {
      // offline fallback
    }
    return this.getLocalData<KitchenObservation[]>(STORAGE_KEYS.KITCHEN_OBSERVATIONS, []);
  }

  public static async saveKitchenObservation(observation: KitchenObservation): Promise<KitchenObservation[]> {
    const toSave: KitchenObservation = {
      ...observation,
      updatedAt: new Date().toISOString()
    };
    try {
      const response = await fetch('/api/kitchen-observations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSave)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.observations) {
          this.setLocalData(STORAGE_KEYS.KITCHEN_OBSERVATIONS, data.observations);
          return data.observations;
        }
      }
    } catch {
      // offline fallback
    }
    const current = this.getLocalData<KitchenObservation[]>(STORAGE_KEYS.KITCHEN_OBSERVATIONS, []);
    const idx = current.findIndex(o => o.id === toSave.id);
    if (idx >= 0) {
      current[idx] = toSave;
    } else {
      current.push(toSave);
    }
    this.setLocalData(STORAGE_KEYS.KITCHEN_OBSERVATIONS, current);
    return current;
  }

  public static async deleteKitchenObservation(id: string): Promise<KitchenObservation[]> {
    try {
      const response = await fetch(`/api/kitchen-observations/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        const data = await response.json();
        if (data.observations) {
          this.setLocalData(STORAGE_KEYS.KITCHEN_OBSERVATIONS, data.observations);
          return data.observations;
        }
      }
    } catch {
      // offline fallback
    }
    const current = this.getLocalData<KitchenObservation[]>(STORAGE_KEYS.KITCHEN_OBSERVATIONS, []);
    const filtered = current.filter(o => o.id !== id);
    this.setLocalData(STORAGE_KEYS.KITCHEN_OBSERVATIONS, filtered);
    return filtered;
  }

  // ----------------------------------------------------
  // BACKUP & RESTORE COMPLETE
  // ----------------------------------------------------
  public static async executeFullBackupNow(): Promise<{
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
    const response = await fetch('/api/backup/full-backup-now', {
      method: 'POST'
    });
    if (!response.ok) {
      throw new Error(`Error en respaldo del servidor (${response.status})`);
    }
    return await response.json();
  }

  /**
   * Sincronización Maestra (Fuerza Bruta / Mando Absoluto del Administrador)
   * Toma el catálogo actual del administrador como la autoridad suprema:
   * Guarda lo activo con máxima prioridad y purga físicamente de la nube lo eliminado.
   */
  public static async executeMasterForceSync(authoritativeData?: {
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
    const response = await fetch('/api/sync/master-force', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authoritativeData || {})
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Error en sincronización maestra (${response.status})`);
    }
    return await response.json();
  }

  // ----------------------------------------------------
  // MENU BACKUP & RESTORE (CATEGORÍAS Y PRODUCTOS)
  // ----------------------------------------------------
  public static downloadMenuBackupJson(): void {
    window.location.href = '/api/backup/menu/download';
  }

  public static downloadMenuBackupCsv(): void {
    window.location.href = '/api/backup/menu/csv';
  }

  public static async importMenuBackup(backupData: any): Promise<{
    success: boolean;
    message: string;
    stats: {
      categoriesCount: number;
      productsCount: number;
      observationsCount: number;
      catalogVersion: number;
    };
  }> {
    const response = await fetch('/api/backup/menu/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backupData)
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Error del servidor' }));
      throw new Error(err.error || `Error al restaurar menú (${response.status})`);
    }
    return await response.json();
  }

  public static async getSyncSummary(): Promise<any> {
    const res = await fetch('/api/fiscal/sync-summary');
    if (!res.ok) {
      throw new Error(`Error ${res.status}: Fallo al obtener resumen de sincronización`);
    }
    return await res.json();
  }

  public static async executeFullSync(localPendingSales?: any[]): Promise<{ success: boolean; message: string; details?: any }> {
    const res = await fetch('/api/fiscal/execute-full-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sales: localPendingSales || [] })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error del servidor' }));
      throw new Error(err.error || `Error ${res.status} al ejecutar sincronización`);
    }
    return await res.json();
  }
}
