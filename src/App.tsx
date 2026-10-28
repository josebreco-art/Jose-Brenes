import React, { useState, useEffect } from 'react';
import { 
  Product, 
  Category, 
  Customer, 
  Sale, 
  KitchenOrder, 
  UserProfile 
} from './types/pos';
import { PosApiService } from './services/api';
import { Header } from './components/Header';
import { SyncStatusModal } from './components/SyncStatusModal';
import { LoginModal } from './components/LoginModal';
import { PosView } from './components/PosView';
import { KitchenDisplayView } from './components/KitchenDisplayView';
import { SalesHistoryView } from './components/SalesHistoryView';
import { FiscalInvoicingView } from './components/FiscalInvoicingView';
import { CashRegisterView } from './components/CashRegisterView';
import { ProductManagementView } from './components/ProductManagementView';
import { CustomerManagementView } from './components/CustomerManagementView';
import { DashboardView } from './components/DashboardView';

export function App() {
  const [activeTab, setActiveTab] = useState<string>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [kitchenOrders, setKitchenOrders] = useState<KitchenOrder[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load initial data
  const loadInitialData = async () => {
    try {
      const [p, c, cust, s, ko, u] = await Promise.all([
        PosApiService.getProducts(),
        PosApiService.getCategories(),
        PosApiService.getCustomers(),
        PosApiService.getSales(),
        PosApiService.getKitchenOrders(),
        PosApiService.getUsers()
      ]);
      setProducts(p);
      setCategories(c);
      setCustomers(cust);
      setSales(s);
      setKitchenOrders(ko);
      setUsers(u);

      if (!currentUser && u.length > 0) {
        // Auto-select admin if available
        const admin = u.find(user => user.role === 'ADMINISTRADOR') || u[0];
        setCurrentUser(admin);
      }
    } catch (err) {
      console.warn('Error loading POS data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();

    // Setup SSE Real-time stream
    const eventSource = new EventSource('/api/realtime/stream');
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'SALE_CREATED') {
          setSales(prev => [payload.data, ...prev.filter(s => s.id !== payload.data.id)]);
        } else if (payload.type === 'KITCHEN_ORDER_CREATED') {
          setKitchenOrders(prev => [payload.data, ...prev.filter(k => k.id !== payload.data.id)]);
        } else if (payload.type === 'KITCHEN_ORDER_UPDATED') {
          setKitchenOrders(prev => prev.map(k => k.id === payload.data.id ? payload.data : k));
        } else if (payload.type === 'CATALOG_UPDATED') {
          if (payload.data?.products) setProducts(payload.data.products);
          if (payload.data?.categories) setCategories(payload.data.categories);
        }
      } catch {}
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const handleSaleCreated = (newSale: Sale) => {
    setSales(prev => [newSale, ...prev]);
    // Refresh kitchen orders
    PosApiService.getKitchenOrders().then(orders => setKitchenOrders(orders));
  };

  const handleKitchenOrderUpdated = (updatedOrder: KitchenOrder) => {
    setKitchenOrders(prev => prev.map(k => k.id === updatedOrder.id ? updatedOrder : k));
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-stone-900 text-amber-200">
        <span className="text-5xl animate-bounce">🍗</span>
        <h1 className="text-xl font-black mt-4 tracking-tight">Pollo Frito Sabor Cervanteño POS</h1>
        <p className="text-xs text-stone-400 mt-1">Cargando base de datos y catálogo oficial...</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-stone-100 font-sans">
      
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogout={() => setCurrentUser(null)}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
      />

      {/* Main View Area */}
      <main className="flex-1 flex overflow-hidden">
        {activeTab === 'pos' && (
          <PosView
            products={products}
            categories={categories}
            customers={customers}
            currentUser={currentUser}
            onSaleCreated={handleSaleCreated}
          />
        )}

        {activeTab === 'kds' && (
          <KitchenDisplayView
            orders={kitchenOrders}
            onOrderUpdated={handleKitchenOrderUpdated}
          />
        )}

        {activeTab === 'sales' && (
          <SalesHistoryView sales={sales} />
        )}

        {activeTab === 'fiscal' && (
          <FiscalInvoicingView />
        )}

        {activeTab === 'cash' && (
          <CashRegisterView currentUser={currentUser} />
        )}

        {activeTab === 'products' && (
          <ProductManagementView
            products={products}
            categories={categories}
            onProductsUpdated={() => {
              PosApiService.getProducts().then(setProducts);
              PosApiService.getCategories().then(setCategories);
            }}
          />
        )}

        {activeTab === 'customers' && (
          <CustomerManagementView
            customers={customers}
            onCustomersUpdated={() => PosApiService.getCustomers().then(setCustomers)}
          />
        )}

        {activeTab === 'dashboard' && (
          <DashboardView sales={sales} products={products} />
        )}
      </main>

      {/* Login Modal */}
      {!currentUser && (
        <LoginModal
          users={users}
          currentUser={currentUser}
          onSelectUser={u => setCurrentUser(u)}
        />
      )}

      {/* Sync / Version Modal */}
      <SyncStatusModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSyncCompleted={() => loadInitialData()}
      />

    </div>
  );
}

export default App;
