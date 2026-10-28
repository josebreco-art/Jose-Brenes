import { 
  Sale, 
  KitchenOrder, 
  Product, 
  Customer, 
  Category, 
  CashRegister, 
  CashMovement, 
  ElectronicDocumentType, 
  HaciendaDirectConfig, 
  UserProfile 
} from '../types/pos';
import { 
  INITIAL_PRODUCTS, 
  INITIAL_CATEGORIES, 
  INITIAL_CUSTOMERS, 
  INITIAL_HACIENDA_DIRECT_CONFIG, 
  SYSTEM_USERS 
} from '../data/initialData';

const BASE_URL = '/api';

export class PosApiService {
  // PRODUCTS & CATEGORIES
  public static async getProducts(): Promise<Product[]> {
    try {
      const res = await fetch(`${BASE_URL}/products`);
      if (res.ok) return await res.json();
    } catch {}
    return INITIAL_PRODUCTS;
  }

  public static async saveProduct(product: Partial<Product>): Promise<Product> {
    const res = await fetch(`${BASE_URL}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });
    if (!res.ok) throw new Error('Error al guardar producto');
    return await res.json();
  }

  public static async deleteProduct(id: string): Promise<boolean> {
    const res = await fetch(`${BASE_URL}/products/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  public static async getCategories(): Promise<Category[]> {
    try {
      const res = await fetch(`${BASE_URL}/categories`);
      if (res.ok) return await res.json();
    } catch {}
    return INITIAL_CATEGORIES;
  }

  public static async saveCategory(cat: Partial<Category>): Promise<Category> {
    const res = await fetch(`${BASE_URL}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cat)
    });
    return await res.json();
  }

  // SALES
  public static async getSales(): Promise<Sale[]> {
    try {
      const res = await fetch(`${BASE_URL}/sales`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }

  public static async createSale(saleData: Partial<Sale>): Promise<Sale> {
    const res = await fetch(`${BASE_URL}/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saleData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Error al registrar venta');
    }
    return await res.json();
  }

  public static async updateOrderStatus(saleId: string, status: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/sales/${saleId}/order-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderStatus: status })
    });
    return await res.json();
  }

  // KITCHEN
  public static async getKitchenOrders(): Promise<KitchenOrder[]> {
    try {
      const res = await fetch(`${BASE_URL}/kitchen-orders`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }

  public static async updateKitchenOrderStatus(id: string, status: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/kitchen-orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    return await res.json();
  }

  // CUSTOMERS
  public static async getCustomers(): Promise<Customer[]> {
    try {
      const res = await fetch(`${BASE_URL}/customers`);
      if (res.ok) return await res.json();
    } catch {}
    return INITIAL_CUSTOMERS;
  }

  public static async saveCustomer(cust: Partial<Customer>): Promise<Customer> {
    const res = await fetch(`${BASE_URL}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cust)
    });
    return await res.json();
  }

  // CASH
  public static async getCurrentCashRegister(): Promise<CashRegister | null> {
    try {
      const res = await fetch(`${BASE_URL}/cash-register/current`);
      if (res.ok) return await res.json();
    } catch {}
    return null;
  }

  public static async openCashRegister(data: { cashierId: string; cashierName: string; openingBalance: number }): Promise<CashRegister> {
    const res = await fetch(`${BASE_URL}/cash-register/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  }

  public static async closeCashRegister(data: { actualCash: number; notes?: string }): Promise<CashRegister> {
    const res = await fetch(`${BASE_URL}/cash-register/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  }

  public static async addCashMovement(mov: Partial<CashMovement>): Promise<CashMovement> {
    const res = await fetch(`${BASE_URL}/cash-register/movement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mov)
    });
    return await res.json();
  }

  public static async getCashMovements(): Promise<CashMovement[]> {
    try {
      const res = await fetch(`${BASE_URL}/cash-register/movements`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }

  // USERS
  public static async getUsers(): Promise<UserProfile[]> {
    try {
      const res = await fetch(`${BASE_URL}/users`);
      if (res.ok) return await res.json();
    } catch {}
    return SYSTEM_USERS;
  }

  public static async saveUser(user: Partial<UserProfile>): Promise<UserProfile> {
    const res = await fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    return await res.json();
  }

  // HACIENDA DIRECT
  public static async getHaciendaConfig(): Promise<HaciendaDirectConfig> {
    try {
      const res = await fetch(`${BASE_URL}/hacienda/config`);
      if (res.ok) return await res.json();
    } catch {}
    return INITIAL_HACIENDA_DIRECT_CONFIG;
  }

  public static async saveHaciendaConfig(cfg: Partial<HaciendaDirectConfig>): Promise<HaciendaDirectConfig> {
    const res = await fetch(`${BASE_URL}/hacienda/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
    return await res.json();
  }

  public static async getSyncSummary(): Promise<any> {
    try {
      const res = await fetch(`${BASE_URL}/hacienda/sync-summary`);
      if (res.ok) return await res.json();
    } catch {}
    return {
      success: true,
      todayStr: new Date().toISOString().split('T')[0],
      yesterdayStr: '',
      isDbConnected: true,
      today: { salesCount: 0, totalAmount: 0, pendingCount: 0, acceptedCount: 0 },
      yesterday: { salesCount: 0, totalAmount: 0, pendingCount: 0, acceptedCount: 0 },
      totalPendingOverall: 0,
      paymentTotalsToday: { cash: 0, card: 0, sinpe: 0, other: 0 }
    };
  }

  public static async executeHaciendaSync(): Promise<any> {
    const res = await fetch(`${BASE_URL}/hacienda/sync-now`, { method: 'POST' });
    return await res.json();
  }

  public static async getSystemVersion(): Promise<any> {
    try {
      const res = await fetch(`${BASE_URL}/system/version`);
      if (res.ok) return await res.json();
    } catch {}
    return { version: '2.5.0', app: 'Pollo Frito Sabor Cervanteño POS' };
  }
}
