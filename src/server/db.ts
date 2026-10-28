import fs from 'fs';
import path from 'path';
import { 
  Product, 
  Category, 
  Customer, 
  Sale, 
  KitchenOrder, 
  CashRegister, 
  CashMovement, 
  HaciendaDirectConfig, 
  UserProfile 
} from '../types/pos';
import { 
  INITIAL_PRODUCTS, 
  INITIAL_CATEGORIES, 
  INITIAL_CUSTOMERS, 
  INITIAL_HACIENDA_DIRECT_CONFIG, 
  SYSTEM_USERS, 
  RESTAURANT_INFO 
} from '../data/initialData';

const DB_PATH = path.resolve(process.cwd(), 'data', 'pos_database.json');

export interface DatabaseSchema {
  version: string;
  lastUpdated: string;
  restaurantInfo: any;
  categories: Category[];
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  kitchenOrders: KitchenOrder[];
  currentCashRegister: CashRegister | null;
  cashRegisterHistory: CashRegister[];
  cashMovements: CashMovement[];
  users: UserProfile[];
  haciendaDirectConfig: HaciendaDirectConfig;
  electronicDocuments: any[];
  fiscalAuditLogs: any[];
  emailDispatchLogs: any[];
  kitchenObservations: any[];
  cabysCatalog: any[];
  taxRates: any[];
}

export class JsonDbManager {
  private data: DatabaseSchema;
  private catalogVersion: number = Date.now();

  constructor() {
    this.data = this.loadDatabase();
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        console.log(`✅ Base de datos cargada exitosamente desde: ${DB_PATH}`);
        return {
          version: parsed.version || '2.5.0',
          lastUpdated: parsed.lastUpdated || new Date().toISOString(),
          restaurantInfo: parsed.restaurantInfo || RESTAURANT_INFO,
          categories: parsed.categories || INITIAL_CATEGORIES,
          products: parsed.products || INITIAL_PRODUCTS,
          customers: parsed.customers || INITIAL_CUSTOMERS,
          sales: parsed.sales || [],
          kitchenOrders: parsed.kitchenOrders || [],
          currentCashRegister: parsed.currentCashRegister || null,
          cashRegisterHistory: parsed.cashRegisterHistory || [],
          cashMovements: parsed.cashMovements || [],
          users: parsed.users || SYSTEM_USERS,
          haciendaDirectConfig: parsed.haciendaDirectConfig || INITIAL_HACIENDA_DIRECT_CONFIG,
          electronicDocuments: parsed.electronicDocuments || [],
          fiscalAuditLogs: parsed.fiscalAuditLogs || [],
          emailDispatchLogs: parsed.emailDispatchLogs || [],
          kitchenObservations: parsed.kitchenObservations || [],
          cabysCatalog: parsed.cabysCatalog || [],
          taxRates: parsed.taxRates || []
        };
      }
    } catch (e) {
      console.warn('⚠️ Error al leer pos_database.json, usando defaults:', e);
    }

    return {
      version: '2.5.0',
      lastUpdated: new Date().toISOString(),
      restaurantInfo: RESTAURANT_INFO,
      categories: INITIAL_CATEGORIES,
      products: INITIAL_PRODUCTS,
      customers: INITIAL_CUSTOMERS,
      sales: [],
      kitchenOrders: [],
      currentCashRegister: null,
      cashRegisterHistory: [],
      cashMovements: [],
      users: SYSTEM_USERS,
      haciendaDirectConfig: INITIAL_HACIENDA_DIRECT_CONFIG,
      electronicDocuments: [],
      fiscalAuditLogs: [],
      emailDispatchLogs: [],
      kitchenObservations: [],
      cabysCatalog: [],
      taxRates: []
    };
  }

  public save(): void {
    try {
      this.data.lastUpdated = new Date().toISOString();
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error saving pos_database.json:', e);
    }
  }

  public getStats() {
    return {
      products: this.data.products.length,
      categories: this.data.categories.length,
      sales: this.data.sales.length,
      kitchenOrders: this.data.kitchenOrders.length,
      customers: this.data.customers.length,
      users: this.data.users.length,
      lastUpdated: this.data.lastUpdated
    };
  }

  public getCatalogVersion(): number {
    return this.catalogVersion;
  }

  public getProducts(): Product[] {
    return this.data.products;
  }

  public saveProduct(prod: Partial<Product>): Product {
    if (!prod.id) {
      prod.id = `p-${Date.now()}`;
    }
    const idx = this.data.products.findIndex(p => p.id === prod.id);
    const updated: Product = {
      id: prod.id,
      name: prod.name || 'Producto Sin Nombre',
      description: prod.description || '',
      price: prod.price || 0,
      cost: prod.cost || 0,
      taxRate: prod.taxRate ?? 0.13,
      cabysCode: prod.cabysCode || '6339900000000',
      categoryId: prod.categoryId || 'cat-combos',
      unit: prod.unit || 'Unid',
      sku: prod.sku || '',
      inventory: prod.inventory ?? 999,
      active: prod.active ?? true,
      image: prod.image || '',
      updatedAt: new Date().toISOString()
    };

    if (idx >= 0) {
      this.data.products[idx] = { ...this.data.products[idx], ...updated };
    } else {
      this.data.products.push(updated);
    }
    this.catalogVersion = Date.now();
    this.save();
    return updated;
  }

  public deleteProduct(id: string): boolean {
    const idx = this.data.products.findIndex(p => p.id === id);
    if (idx >= 0) {
      this.data.products.splice(idx, 1);
      this.catalogVersion = Date.now();
      this.save();
      return true;
    }
    return false;
  }

  public getCategories(): Category[] {
    return this.data.categories;
  }

  public saveCategory(cat: Partial<Category>): Category {
    if (!cat.id) {
      cat.id = `cat-${Date.now()}`;
    }
    const idx = this.data.categories.findIndex(c => c.id === cat.id);
    const updated: Category = {
      id: cat.id,
      name: cat.name || 'Categoría',
      description: cat.description || '',
      active: cat.active ?? true,
      displayOrder: cat.displayOrder || 0
    };
    if (idx >= 0) {
      this.data.categories[idx] = { ...this.data.categories[idx], ...updated };
    } else {
      this.data.categories.push(updated);
    }
    this.catalogVersion = Date.now();
    this.save();
    return updated;
  }

  public getSales(): Sale[] {
    return this.data.sales;
  }

  public createSale(saleData: Partial<Sale>): Sale {
    const nextOrderNumber = (this.data.sales.length > 0)
      ? Math.max(...this.data.sales.map(s => s.orderNumber || 0)) + 1
      : 1;

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('es-CR', { hour12: true });

    const newSale: Sale = {
      id: saleData.id || `sale-${Date.now()}`,
      orderNumber: nextOrderNumber,
      timestamp: Date.now(),
      date: dateStr,
      time: timeStr,
      items: saleData.items || [],
      subtotal: saleData.subtotal || 0,
      discount: saleData.discount || 0,
      taxTotal: saleData.taxTotal || 0,
      total: saleData.total || 0,
      amountPaid: saleData.amountPaid || saleData.total || 0,
      change: saleData.change || 0,
      payments: saleData.payments || [{ method: 'EFECTIVO', amount: saleData.total || 0 }],
      orderType: saleData.orderType || 'MESA',
      orderStatus: 'PENDIENTE',
      tableNumber: saleData.tableNumber || '',
      customerId: saleData.customerId || '',
      customerName: saleData.customerName || 'Cliente de Contado',
      customerEmail: saleData.customerEmail || '',
      customerPhone: saleData.customerPhone || '',
      customerIdentification: saleData.customerIdentification || '000000000',
      customerIdentificationType: saleData.customerIdentificationType || '01',
      electronicDocumentType: saleData.electronicDocumentType || '04', // Tiquete Electrónico por defecto
      haciendaStatus: 'ACEPTADO',
      cashierId: saleData.cashierId || 'usr-admin',
      cashierName: saleData.cashierName || 'Administrador',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    this.data.sales.unshift(newSale);

    // Auto-create Kitchen Order
    const newKitchenOrder: KitchenOrder = {
      id: `ko-${Date.now()}`,
      saleId: newSale.id,
      orderNumber: newSale.orderNumber,
      items: newSale.items.map(it => ({
        productId: it.productId,
        productName: it.productName || it.name || '',
        quantity: it.quantity,
        notes: it.notes || ''
      })),
      orderType: newSale.orderType,
      tableNumber: newSale.tableNumber,
      status: 'PENDIENTE',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    this.data.kitchenOrders.unshift(newKitchenOrder);
    newSale.kitchenOrderId = newKitchenOrder.id;

    // Actualizar registro de caja si está abierta
    if (this.data.currentCashRegister && this.data.currentCashRegister.status === 'OPEN') {
      const reg = this.data.currentCashRegister;
      reg.totalInvoicesCount++;
      newSale.payments.forEach(p => {
        if (p.method === 'EFECTIVO') {
          reg.cashSales += p.amount;
          reg.expectedCash += p.amount;
        } else if (p.method === 'TARJETA') {
          reg.cardSales += p.amount;
        } else if (p.method === 'SINPE') {
          reg.sinpeSales += p.amount;
        }
      });
    }

    this.save();
    return newSale;
  }

  public updateOrderStatus(saleId: string, status: any): Sale | null {
    const sale = this.data.sales.find(s => s.id === saleId);
    if (sale) {
      sale.orderStatus = status;
      sale.updatedAt = new Date().toISOString();
      if (sale.kitchenOrderId) {
        const ko = this.data.kitchenOrders.find(k => k.id === sale.kitchenOrderId);
        if (ko) {
          ko.status = status;
          ko.updatedAt = new Date().toISOString();
        }
      }
      this.save();
      return sale;
    }
    return null;
  }

  public getKitchenOrders(): KitchenOrder[] {
    return this.data.kitchenOrders;
  }

  public updateKitchenOrderStatus(id: string, status: any): KitchenOrder | null {
    const ko = this.data.kitchenOrders.find(k => k.id === id);
    if (ko) {
      ko.status = status;
      ko.updatedAt = new Date().toISOString();
      const sale = this.data.sales.find(s => s.id === ko.saleId);
      if (sale) {
        sale.orderStatus = status;
        sale.updatedAt = new Date().toISOString();
      }
      this.save();
      return ko;
    }
    return null;
  }

  public getCustomers(): Customer[] {
    return this.data.customers;
  }

  public saveCustomer(cust: Partial<Customer>): Customer {
    if (!cust.id) cust.id = `cust-${Date.now()}`;
    const idx = this.data.customers.findIndex(c => c.id === cust.id);
    const updated: Customer = {
      id: cust.id,
      name: cust.name || 'Cliente',
      identification: cust.identification || '',
      identificationType: cust.identificationType || '01',
      email: cust.email || '',
      phone: cust.phone || '',
      province: cust.province || '3',
      canton: cust.canton || '02',
      district: cust.district || '01',
      address: cust.address || '',
      createdAt: cust.createdAt || new Date().toISOString()
    };
    if (idx >= 0) {
      this.data.customers[idx] = { ...this.data.customers[idx], ...updated };
    } else {
      this.data.customers.push(updated);
    }
    this.save();
    return updated;
  }

  public getCurrentCashRegister(): CashRegister | null {
    return this.data.currentCashRegister;
  }

  public openCashRegister(cashierId: string, cashierName: string, openingBalance: number): CashRegister {
    const now = new Date();
    const reg: CashRegister = {
      id: `cash-${Date.now()}`,
      cashierId,
      cashierName,
      openTime: now.toISOString(),
      status: 'OPEN',
      openingBalance,
      cashSales: 0,
      cardSales: 0,
      sinpeSales: 0,
      transferSales: 0,
      cashIn: 0,
      cashOut: 0,
      expectedCash: openingBalance,
      totalInvoicesCount: 0,
      location: 'Caja Principal'
    };
    this.data.currentCashRegister = reg;
    this.save();
    return reg;
  }

  public closeCashRegister(actualCash: number, notes?: string): CashRegister {
    if (!this.data.currentCashRegister) {
      throw new Error('No hay caja abierta');
    }
    const reg = this.data.currentCashRegister;
    reg.status = 'CLOSED';
    reg.closeTime = new Date().toISOString();
    reg.actualCash = actualCash;
    reg.difference = actualCash - reg.expectedCash;
    reg.notes = notes || '';

    this.data.cashRegisterHistory.unshift({ ...reg });
    this.data.currentCashRegister = null;
    this.save();
    return reg;
  }

  public addCashMovement(mov: Partial<CashMovement>): CashMovement {
    const newMov: CashMovement = {
      id: `mov-${Date.now()}`,
      cashRegisterId: this.data.currentCashRegister?.id || '',
      type: mov.type || 'INGRESO',
      amount: mov.amount || 0,
      concept: mov.concept || '',
      timestamp: new Date().toISOString(),
      cashierId: mov.cashierId || 'usr-admin',
      cashierName: mov.cashierName || 'Administrador'
    };
    this.data.cashMovements.unshift(newMov);

    if (this.data.currentCashRegister) {
      if (newMov.type === 'INGRESO') {
        this.data.currentCashRegister.cashIn += newMov.amount;
        this.data.currentCashRegister.expectedCash += newMov.amount;
      } else {
        this.data.currentCashRegister.cashOut += newMov.amount;
        this.data.currentCashRegister.expectedCash -= newMov.amount;
      }
    }
    this.save();
    return newMov;
  }

  public getCashMovements(): CashMovement[] {
    return this.data.cashMovements;
  }

  public getUsers(): UserProfile[] {
    return this.data.users;
  }

  public saveUser(user: Partial<UserProfile>): UserProfile {
    if (!user.id) user.id = `usr-${Date.now()}`;
    const idx = this.data.users.findIndex(u => u.id === user.id);
    const updated: UserProfile = {
      id: user.id,
      name: user.name || 'Usuario',
      email: user.email || '',
      role: user.role || 'CAJERO',
      pinCode: user.pinCode || '1234',
      active: user.active ?? true,
      permissions: user.permissions || {
        canAccessPos: true,
        canAccessKitchen: true,
        canAccessSales: true,
        canAccessCash: true
      },
      updatedAt: new Date().toISOString()
    };
    if (idx >= 0) {
      this.data.users[idx] = { ...this.data.users[idx], ...updated };
    } else {
      this.data.users.push(updated);
    }
    this.save();
    return updated;
  }

  public getHaciendaConfig(): HaciendaDirectConfig {
    return this.data.haciendaDirectConfig;
  }

  public saveHaciendaConfig(cfg: Partial<HaciendaDirectConfig>): HaciendaDirectConfig {
    this.data.haciendaDirectConfig = {
      ...this.data.haciendaDirectConfig,
      ...cfg
    };
    this.save();
    return this.data.haciendaDirectConfig;
  }

  public async syncCatalogWithCloud() {
    return { changed: false };
  }

  public exportDatabase() {
    return this.data;
  }

  public importDatabase(newData: any) {
    if (newData && typeof newData === 'object') {
      this.data = { ...this.data, ...newData };
      this.save();
      return this.getStats();
    }
    throw new Error('Datos inválidos');
  }
}

export const db = new JsonDbManager();
