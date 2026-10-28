import { Sale, KitchenOrder, Product, Customer, Category, CashRegister, CashMovement } from '../types/pos';

export class OfflineStorageService {
  private get<T>(key: string, defaultValue: T): T {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Error saving to localStorage:', e);
    }
  }

  public getPendingSales(): Sale[] {
    return this.get<Sale[]>('sabor_pending_sales', []);
  }

  public addPendingSale(sale: Sale): void {
    const list = this.getPendingSales();
    list.push(sale);
    this.set('sabor_pending_sales', list);
  }

  public clearPendingSales(): void {
    this.set('sabor_pending_sales', []);
  }

  public removePendingSale(id: string): void {
    const list = this.getPendingSales().filter(s => s.id !== id);
    this.set('sabor_pending_sales', list);
  }
}

export const offlineStorage = new OfflineStorageService();
