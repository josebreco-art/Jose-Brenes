import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { initializeFirestore, getFirestore, doc, onSnapshot, setLogLevel } from 'firebase/firestore';
import { Header } from './components/Header';
import { PosScreen } from './components/PosScreen';
import { PaymentModal } from './components/PaymentModal';
import { InvoiceResultModal } from './components/InvoiceResultModal';
import { ThermalReceiptModal } from './components/ThermalReceiptModal';
import { KdsScreen } from './components/KdsScreen';
import { SupervisorPinModal } from './components/SupervisorPinModal';
import { LoginScreen } from './components/LoginScreen';

// Importación directa unificada para máxima velocidad y navegación instantánea offline sin depender de descargas en red
import { SalesHistoryScreen } from './components/SalesHistoryScreen';
import { CashRegisterScreen } from './components/CashRegisterScreen';
import { ProductsManager } from './components/ProductsManager';
import { CustomersManager } from './components/CustomersManager';
import { DashboardScreen } from './components/DashboardScreen';
import { ElectronicDocumentsCenter } from './components/ElectronicDocumentsCenter';

import { 
  Product, 
  Category, 
  Customer, 
  CartItem, 
  Sale, 
  KitchenOrder,
  PaymentSplit, 
  OrderType, 
  LocationType, 
  CashRegister, 
  CashMovement, 
  OrderStatus,
  ElectronicDocumentType,
  PausedOrder,
  UserProfile
} from './types/pos';
import { PosApiService } from './services/api';
import { SyncManager } from './services/syncManager';
import { offlineSyncManager } from './services/offlineSyncManager';
import { offlineStorage } from './services/offlineStorageService';
import { INITIAL_CUSTOMERS, INITIAL_USER } from './data/initialData';
import { safeStorage } from './utils/safeStorage';
import { getCostaRicaDate, getCostaRicaTime } from './utils/dateUtils';
import { playOrderChime } from './utils/audioChime';

// Helper para encontrar siempre el cliente por defecto (Cliente de contado / Consumidor final)
function getDefaultCustomer(list: Customer[]): Customer {
  if (!list || list.length === 0) return INITIAL_CUSTOMERS[0];
  const found = list.find(c => 
    c.id === 'cust-generic-cash' ||
    c.identification === '000000000' ||
    c.name.toLowerCase().includes('contado') || 
    c.name.toLowerCase().includes('consumidor') || 
    c.name.toLowerCase().includes('general')
  );
  return found || INITIAL_CUSTOMERS[0] || list[0];
}

export default function App() {
  // Navigation & Location state
  const [activeTab, setActiveTab] = useState<string>('pos');
  const activeTabRef = useRef<string>(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  const [location, setLocation] = useState<LocationType>('RESTAURANTE');
  
  // Connectivity & Sync state
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Core Data
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [sales, setSales] = useState<Sale[]>([]);
  const [kitchenOrders, setKitchenOrders] = useState<KitchenOrder[]>([]);
  const [cashRegister, setCashRegister] = useState<CashRegister | null>(null);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);

  // Active Sale / Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer>(() => getDefaultCustomer(INITIAL_CUSTOMERS));
  const [orderType, setOrderType] = useState<OrderType>('TAKE_OUT');
  const [tableNumber, setTableNumber] = useState<string>('1');
  const [customOrderName, setCustomOrderName] = useState<string>('');
  const [pausedOrders, setPausedOrders] = useState<PausedOrder[]>(() => {
    try {
      const saved = safeStorage.getItem('sabor_cervanteno_paused_orders');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [terminalName, setTerminalName] = useState<string>(() => {
    try {
      const saved = safeStorage.getItem('sabor_cervanteno_terminal_name');
      return saved || 'Caja Principal';
    } catch {
      return 'Caja Principal';
    }
  });

  // User Profile & Roles (Cajero vs Administrador)
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    try {
      const saved = safeStorage.getItem('sabor_cervanteno_current_user');
      return saved ? JSON.parse(saved) : INITIAL_USER;
    } catch {
      return INITIAL_USER;
    }
  });

  // Terminal Lock / Start Screen State (siempre inicia en la pantalla de bienvenida con reloj y PIN)
  const [isLocked, setIsLocked] = useState<boolean>(true);

  const handleLockTerminal = () => {
    safeStorage.removeSessionItem('sabor_pos_unlocked');
    setIsLocked(true);
  };

  const [isSupervisorPinOpen, setIsSupervisorPinOpen] = useState<boolean>(false);
  const [supervisorAction, setSupervisorAction] = useState<{
    title: string;
    description: string;
    onSuccess: () => void;
  } | null>(null);

  const requestSupervisorAuth = (title: string, description: string, onSuccess: () => void) => {
    if (currentUser.role === 'ADMINISTRADOR') {
      onSuccess();
      return;
    }
    setSupervisorAction({ title, description, onSuccess });
    setIsSupervisorPinOpen(true);
  };

  const handleElevateToAdmin = () => {
    let adminUser: UserProfile | undefined;
    try {
      const storedUsers = localStorage.getItem('sabor_cervanteno_users');
      if (storedUsers) {
        const list = JSON.parse(storedUsers);
        adminUser = list.find((u: any) => u.role === 'ADMINISTRADOR');
      }
    } catch {}

    const finalAdmin: UserProfile = adminUser || {
      id: 'usr-admin',
      name: 'Administrador / Dueño',
      email: 'admin@saborcervanteno.cr',
      role: 'ADMINISTRADOR',
      active: true,
      location,
      pinCode: localStorage.getItem('pos_admin_pin') || '9999'
    };
    setCurrentUser(finalAdmin);
    localStorage.setItem('sabor_cervanteno_current_user', JSON.stringify(finalAdmin));
  };

  const handleSwitchUser = () => {
    if (currentUser.role === 'ADMINISTRADOR') {
      // Cambiar a Cajero
      let cashierUser: UserProfile | undefined;
      try {
        const storedUsers = localStorage.getItem('sabor_cervanteno_users');
        if (storedUsers) {
          const list = JSON.parse(storedUsers);
          cashierUser = list.find((u: any) => u.role === 'CAJERO' && u.active);
        }
      } catch {}

      const finalCashier: UserProfile = cashierUser || {
        id: 'usr-cajero-1',
        name: 'Cajero Principal',
        email: 'cajero@saborcervanteno.cr',
        role: 'CAJERO',
        active: true,
        location,
        pinCode: localStorage.getItem('pos_cashier_pin') || '1234'
      };
      setCurrentUser(finalCashier);
      localStorage.setItem('sabor_cervanteno_current_user', JSON.stringify(finalCashier));
    } else {
      // Solicitar PIN para ascender a Administrador
      requestSupervisorAuth(
        'Acceso de Administrador',
        'Ingrese su PIN de Administrador para cambiar la sesión a Administrador / Dueño.',
        () => {
          handleElevateToAdmin();
        }
      );
    }
  };

  // Sonar campana metálica de restaurante ÚNICAMENTE cuando la comanda entra al KDS (Cocina)
  // En la pantalla del POS (Caja) se mantiene en silencio para comodidad del cajero
  const notifyKitchenIfInKds = () => {
    if (activeTabRef.current === 'kds') {
      playOrderChime();
    }
  };

  // Modals state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [lastProcessedSale, setLastProcessedSale] = useState<Sale | null>(null);
  const [isResultModalOpen, setIsResultModalOpen] = useState<boolean>(false);
  const [thermalModalSale, setThermalModalSale] = useState<Sale | null>(null);
  const [thermalReceiptType, setThermalReceiptType] = useState<'POS' | 'KITCHEN' | 'INVOICE'>('POS');
  const [thermalAutoPrint, setThermalAutoPrint] = useState<boolean>(false);
  const [isThermalModalOpen, setIsThermalModalOpen] = useState<boolean>(false);
  const [isRetryingFiscal, setIsRetryingFiscal] = useState<boolean>(false);
  
  // Kitchen Order Flow Control: evita duplicaciones en KDS y carrera de clics
  const [activeKitchenOrderId, setActiveKitchenOrderIdState] = useState<string | null>(() => {
    return safeStorage.getSessionItem('sabor_pos_active_kitchen_id');
  });

  const setActiveKitchenOrderId = useCallback((id: string | null) => {
    setActiveKitchenOrderIdState(id);
    if (id) {
      safeStorage.setSessionItem('sabor_pos_active_kitchen_id', id);
    } else {
      safeStorage.removeSessionItem('sabor_pos_active_kitchen_id');
    }
  }, []);
  const [isSendingKitchen, setIsSendingKitchen] = useState<boolean>(false);
  const isSendingKitchenRef = useRef<boolean>(false);
  const lastKitchenSendTimestampRef = useRef<number>(0);
  const isProcessingPaymentRef = useRef<boolean>(false);

  // Prevent accidental reload during payment
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessingPaymentRef.current || isProcessingPayment) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessingPayment]);

  // Si el usuario vacía el carrito, resetear la comanda activa para el siguiente pedido
  useEffect(() => {
    if (cart.length === 0 && activeKitchenOrderId) {
      setActiveKitchenOrderId(null);
    }
  }, [cart.length, activeKitchenOrderId]);

  // Initialize data, real-time SSE stream, and live 5-second background polling
  useEffect(() => {
    SyncManager.init();
    const unsubscribe = SyncManager.subscribe((online, count) => {
      setIsOnline(online);
      setPendingSyncCount(count);
    });

    // Control de órdenes ya procesadas para evitar sonido repetitivo y re-renderizados innecesarios
    const processedSaleIdsRef = new Set<string>();
    const processedKitchenIdsRef = new Set<string>();
    let initialLoadDone = false;
    let lastSalesSyncTime = Date.now() - 60000;

    const loadAllData = async () => {
      // Optimización 3: Arranque ultrarrápido instantáneo desde caché local IndexedDB
      try {
        const cached = await offlineStorage.getCachedCatalog();
        if (cached.categories && cached.categories.length > 0) setCategories(cached.categories);
        if (cached.products && cached.products.length > 0) setProducts(cached.products);
        if (cached.customers && cached.customers.length > 0) {
          setCustomers(cached.customers);
          setSelectedCustomer(getDefaultCustomer(cached.customers));
        }
      } catch (cacheErr) {
        console.warn('Advertencia al consultar caché local:', cacheErr);
      }

      try {
        const syncStartTime = Date.now();
        const [cats, prods, custs, salesData, regData, kOrders, usersData] = await Promise.all([
          PosApiService.getCategories(),
          PosApiService.getProducts(),
          PosApiService.getCustomers(),
          PosApiService.getSales(),
          PosApiService.getCurrentCashRegister(),
          PosApiService.getKitchenOrders(),
          PosApiService.getUsers()
        ]);
        lastSalesSyncTime = syncStartTime;

        setCategories(cats);
        setProducts(prods);
        setCustomers(custs);
        setSales(salesData);
        setKitchenOrders(kOrders);
        setCashRegister(regData.register);
        setCashMovements(regData.movements);
        if (custs.length > 0) setSelectedCustomer(getDefaultCustomer(custs));

        // Actualizar caché IndexedDB en segundo plano para próximos arranques sin latencia
        offlineStorage.cacheCatalog({ categories: cats, products: prods, customers: custs }).catch(() => {});

        // Registrar IDs iniciales para que NO suene la campana en la carga inicial
        (salesData || []).forEach(s => { if (s && s.id) processedSaleIdsRef.add(s.id); });
        (kOrders || []).forEach(k => { if (k && k.id) processedKitchenIdsRef.add(k.id); });
        initialLoadDone = true;

        if (usersData && usersData.length > 0) {
          const matching = usersData.find(u => u.id === currentUser.id);
          if (matching) {
            setCurrentUser(matching);
            localStorage.setItem('sabor_cervanteno_current_user', JSON.stringify(matching));
          }
        }
      } catch (err) {
        console.warn('Error loading initial data:', err);
      }
    };

    loadAllData();

    // FASE 8: Sincronización en tiempo real con Firestore onSnapshot()
    let isMounted = true;
    let unsubscribeFirestore: (() => void) | null = null;
    fetch('/api/firebase-config')
      .then(res => res.json())
      .then(config => {
        if (!isMounted) return;
        if (config && config.apiKey && config.projectId) {
          const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
          setLogLevel('error');
          let dbFs: any;
          try {
            dbFs = initializeFirestore(app, {
              experimentalAutoDetectLongPolling: true,
              ignoreUndefinedProperties: true
            }, config.firestoreDatabaseId);
          } catch {
            dbFs = getFirestore(app, config.firestoreDatabaseId);
          }
          const docRef = doc(dbFs, 'pos_data', 'main_database');
          
          unsubscribeFirestore = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              if (data) {
                if (Array.isArray(data.kitchenOrders)) {
                  let hasRealNewKitchen = false;
                  data.kitchenOrders.forEach((k: any) => {
                    if (k && k.id && !processedKitchenIdsRef.has(k.id)) {
                      processedKitchenIdsRef.add(k.id);
                      if (initialLoadDone) hasRealNewKitchen = true;
                    }
                  });
                  if (hasRealNewKitchen) {
                    notifyKitchenIfInKds();
                  }
                  setKitchenOrders(prev => {
                    const mergedMap = new Map<string, KitchenOrder>();
                    for (const item of prev) {
                      if (item && item.id) mergedMap.set(item.id, item);
                    }
                    for (const item of data.kitchenOrders) {
                      if (item && item.id) {
                        const existing = mergedMap.get(item.id);
                        if (existing) {
                          mergedMap.set(item.id, { ...existing, ...item });
                        } else {
                          mergedMap.set(item.id, item);
                        }
                      }
                    }
                    const mergedList = Array.from(mergedMap.values());
                    if (
                      mergedList.length === prev.length &&
                      prev.every((p, i) => p.id === mergedList[i]?.id && p.orderStatus === mergedList[i]?.orderStatus)
                    ) {
                      return prev;
                    }
                    return mergedList;
                  });
                }
                if (Array.isArray(data.sales)) {
                  setSales(prev => {
                    const mergedMap = new Map<string, Sale>();
                    for (const item of prev) {
                      if (item && item.id) mergedMap.set(item.id, item);
                    }
                    for (const item of data.sales) {
                      if (item && item.id) {
                        const existing = mergedMap.get(item.id);
                        if (existing) {
                          mergedMap.set(item.id, { ...existing, ...item });
                        } else {
                          mergedMap.set(item.id, item);
                        }
                      }
                    }
                    const mergedList = Array.from(mergedMap.values());
                    if (
                      mergedList.length === prev.length &&
                      prev.every((p, i) => p.id === mergedList[i]?.id && p.paymentStatus === mergedList[i]?.paymentStatus)
                    ) {
                      return prev;
                    }
                    return mergedList;
                  });
                }
                if (data.currentCashRegister) {
                  setCashRegister(prev => {
                    const reg = data.currentCashRegister;
                    if (prev && prev.id === reg.id && prev.status === reg.status && prev.closeTime === reg.closeTime && prev.expectedCash === reg.expectedCash) {
                      return prev;
                    }
                    return reg;
                  });
                }
              }
            }
          }, (err) => {
            const errStr = String(err?.message || err || '');
            if (
              err?.code === 'internal' || 
              (err as any)?.code === 13 || 
              errStr.includes('RST_STREAM') ||
              errStr.includes('13 INTERNAL')
            ) {
              // Reconexión automática de stream HTTP/2 gestionada por el SDK sin alertar error
              return;
            }
            console.warn('⚠️ [Firestore onSnapshot] Error en listener KDS:', err);
          });
        }
      })
      .catch(err => {
        console.warn('⚠️ [Firestore onSnapshot] No se pudo cargar config de Firebase:', err);
      });

    // 1. Live Background Polling Inteligente:
    // Si el SSE está conectado, sondea cada 60s como respaldo de seguridad; si se desconecta, cada 25s.
    let isSseConnected = false;
    let sseRetryDelay = 5000;
    let lastPollTime = 0;
    const pollInterval = setInterval(async () => {
      // Si la ventana está minimizada o en segundo plano, omitir polling para no saturar el canal
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      const minInterval = isSseConnected ? 60000 : 25000;
      if (Date.now() - lastPollTime < minInterval) {
        return;
      }
      lastPollTime = Date.now();

      try {
        const pollStartedAt = Date.now();
        const [latestSales, latestKitchen] = await Promise.all([
          PosApiService.getSales({ since: Math.max(0, lastSalesSyncTime - 10000) }),
          PosApiService.getKitchenOrders()
        ]);
        lastSalesSyncTime = pollStartedAt;

        if (Array.isArray(latestSales) && latestSales.length > 0) {
          // Detectar únicamente ventas nuevas que no se hayan visto antes
          let hasRealNewSales = false;
          latestSales.forEach(s => {
            if (s && s.id && !processedSaleIdsRef.has(s.id)) {
              processedSaleIdsRef.add(s.id);
              if (initialLoadDone) hasRealNewSales = true;
            }
          });

          setSales(prev => {
            const mergedMap = new Map<string, Sale>();
            for (const item of prev) {
              if (item && item.id) mergedMap.set(item.id, item);
            }
            for (const item of latestSales) {
              if (item && item.id) {
                const existing = mergedMap.get(item.id);
                if (existing) {
                  mergedMap.set(item.id, { ...existing, ...item });
                } else {
                  mergedMap.set(item.id, item);
                }
              }
            }
            const mergedList = Array.from(mergedMap.values());
            if (
              mergedList.length === prev.length &&
              prev.every((p, i) => p.id === mergedList[i]?.id && p.paymentStatus === mergedList[i]?.paymentStatus)
            ) {
              return prev;
            }
            return mergedList;
          });
        }

        if (Array.isArray(latestKitchen)) {
          // Detectar únicamente comandas de cocina nuevas que no se hayan visto antes
          let hasRealNewKitchen = false;
          latestKitchen.forEach(k => {
            if (k && k.id && !processedKitchenIdsRef.has(k.id)) {
              processedKitchenIdsRef.add(k.id);
              if (initialLoadDone) hasRealNewKitchen = true;
            }
          });

          if (hasRealNewKitchen) {
            notifyKitchenIfInKds();
          }

          setKitchenOrders(prev => {
            // Fusión cooperativa: No borrar nunca pedidos activos que llegaron desde Firestore
            const mergedMap = new Map<string, KitchenOrder>();
            for (const item of prev) {
              if (item && item.id) mergedMap.set(item.id, item);
            }
            for (const item of latestKitchen) {
              if (item && item.id) {
                const existing = mergedMap.get(item.id);
                if (existing) {
                  mergedMap.set(item.id, { ...existing, ...item });
                } else {
                  mergedMap.set(item.id, item);
                }
              }
            }
            const mergedList = Array.from(mergedMap.values());
            if (
              mergedList.length === prev.length &&
              prev.every((p, i) => p.id === mergedList[i]?.id && p.orderStatus === mergedList[i]?.orderStatus)
            ) {
              return prev;
            }
            return mergedList;
          });
          // Sincronizar periódicamente cualquier comanda pendiente en outbox
          PosApiService.syncKitchenOrdersOutbox().catch(() => {});
        }
      } catch (e) {
        // Silently ignore transient network poll errors
      }
    }, 15000);

    // 2. Server-Sent Events (SSE) for Instant Order Notifications con reconexión agresiva (3s)
    let eventSource: EventSource | null = null;
    let sseReconnectTimer: any = null;

    const setupSSE = () => {
      try {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        eventSource = new EventSource('/api/events');

        eventSource.onopen = () => {
          isSseConnected = true;
          // Al reabrir conexión SSE, vaciar inmediatamente el outbox de comandas
          PosApiService.syncKitchenOrdersOutbox().catch(() => {});
        };
        
        eventSource.addEventListener('new_order', (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data && data.sale) {
              setSales(prev => [data.sale, ...prev.filter(s => s.id !== data.sale.id)]);
            }
          } catch (err) {
            console.error('SSE Error parsing new_order:', err);
          }
        });

        eventSource.addEventListener('kitchen_order', (e) => {
          try {
            const data = JSON.parse(e.data);
            notifyKitchenIfInKds();
            if (data && data.kitchenOrder) {
              setKitchenOrders(prev => [data.kitchenOrder, ...prev.filter(k => k.id !== data.kitchenOrder.id)]);
            }
          } catch (err) {
            console.error('SSE Error parsing kitchen_order:', err);
          }
        });

        eventSource.addEventListener('kitchen_order_status_update', (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data && data.orderId) {
              setKitchenOrders(prev => prev.map(k => k.id === data.orderId ? { ...k, orderStatus: data.orderStatus } : k));
            }
          } catch (err) {
            console.error('SSE Error parsing kitchen_order_status_update:', err);
          }
        });

        eventSource.addEventListener('order_status_update', (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data && data.saleId) {
              setSales(prev => prev.map(s => s.id === data.saleId ? { ...s, orderStatus: data.orderStatus } : s));
            }
          } catch (err) {
            console.error('SSE Error parsing status_update:', err);
          }
        });

        // Manejar eventos genéricos KITCHEN_ORDER_UPDATED y SALE_UPDATED
        eventSource.addEventListener('message', (e) => {
          try {
            const payload = JSON.parse(e.data);
            if (payload && payload.type === 'KITCHEN_ORDER_UPDATED' && payload.data) {
              const updatedOrder = payload.data;
              setKitchenOrders(prev => prev.map(k => k.id === updatedOrder.id ? { ...k, ...updatedOrder } : k));
            } else if (payload && payload.type === 'SALE_UPDATED' && payload.data) {
              const updatedSale = payload.data;
              setSales(prev => prev.map(s => s.id === updatedSale.id ? { ...s, ...updatedSale } : s));
            }
          } catch {}
        });

        eventSource.addEventListener('fiscal_document_emitted', (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data && data.document) {
              setSales(prev => prev.map(s => s.id === data.document.saleId ? {
                ...s,
                invoiceStatus: 'INVOICED',
                numericKey50: data.document.numericKey,
                consecutive20: data.document.consecutive,
                haciendaStatus: data.document.status,
                haciendaResponseMessage: data.document.statusDescription
              } : s));
            }
          } catch (err) {
            console.error('SSE Error parsing fiscal_document_emitted:', err);
          }
        });

        eventSource.addEventListener('CASH_REGISTER_UPDATED', (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data) {
              if (data.register) {
                setCashRegister(data.register);
                if (data.movements) setCashMovements(data.movements);
              } else {
                setCashRegister(data);
              }
            }
          } catch (err) {
            console.error('SSE Error parsing CASH_REGISTER_UPDATED:', err);
          }
        });

        eventSource.addEventListener('catalog_updated', async () => {
          try {
            const [cats, prods] = await Promise.all([
              PosApiService.getCategories(),
              PosApiService.getProducts()
            ]);
            setCategories(cats);
            setProducts(prods);
          } catch (err) {
            console.error('SSE Error reloading catalog on catalog_updated:', err);
          }
        });

        eventSource.onmessage = async (e) => {
          try {
            const parsed = JSON.parse(e.data);
            if (parsed && (
              parsed.type === 'CATALOG_UPDATED' || 
              parsed.type === 'PRODUCT_UPDATED' || 
              parsed.type === 'PRODUCT_DELETED' || 
              parsed.type === 'CATEGORY_UPDATED' || 
              parsed.type === 'CATEGORY_DELETED'
            )) {
              const [cats, prods] = await Promise.all([
                PosApiService.getCategories(),
                PosApiService.getProducts()
              ]);
              setCategories(cats);
              setProducts(prods);
            }
          } catch {}
        };

        eventSource.onopen = () => {
          isSseConnected = true;
          sseRetryDelay = 5000;
        };

        eventSource.onerror = () => {
          isSseConnected = false;
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          // Reconectar automáticamente con backoff exponencial (5s -> 30s) para evitar 'Rate exceeded'
          clearTimeout(sseReconnectTimer);
          sseReconnectTimer = setTimeout(() => {
            sseRetryDelay = Math.min(sseRetryDelay * 1.5, 30000);
            setupSSE();
          }, sseRetryDelay);
        };
      } catch (err) {
        console.warn('SSE connection unsupported or failed:', err);
      }
    };

    setupSSE();

    // Sincronización proactiva al encender o desbloquear la pantalla (con throttle de 15 segundos)
    let lastVisibilitySync = 0;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!isSseConnected) setupSSE();
        if (Date.now() - lastVisibilitySync > 15000) {
          const syncNow = Date.now();
          lastVisibilitySync = syncNow;
          PosApiService.getSales({ since: Math.max(0, lastSalesSyncTime - 10000) })
            .then(deltaSales => {
              lastSalesSyncTime = syncNow;
              if (Array.isArray(deltaSales) && deltaSales.length > 0) {
                setSales(prev => {
                  const map = new Map<string, Sale>();
                  for (const s of prev) if (s && s.id) map.set(s.id, s);
                  for (const s of deltaSales) if (s && s.id) map.set(s.id, { ...(map.get(s.id) || {}), ...s });
                  return Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                });
              }
            })
            .catch(() => {});
          PosApiService.getKitchenOrders().then(setKitchenOrders).catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Eventos de conectividad del navegador
    const handleOnline = () => {
      setIsOnline(true);
      setupSSE();
      PosApiService.syncKitchenOrdersOutbox().catch(() => {});
      PosApiService.getKitchenOrders().then(setKitchenOrders).catch(() => {});
      offlineSyncManager.syncPendingDocuments().catch(() => {});
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Inicializar y pre-reservar bloques de consecutivos offline si estamos en línea
    offlineSyncManager.ensureActiveLeases().catch(() => {});
    PosApiService.syncKitchenOrdersOutbox().catch(() => {});

    return () => {
      isMounted = false;
      if (unsubscribeFirestore) unsubscribeFirestore();
      unsubscribe();
      clearInterval(pollInterval);
      if (sseReconnectTimer) clearTimeout(sseReconnectTimer);
      if (eventSource) eventSource.close();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Re-sincronizar datos automáticamente al ingresar a Caja, Reportes, Menú o Ventas
  useEffect(() => {
    if (activeTab === 'cash' || activeTab === 'dashboard' || activeTab === 'sales') {
      PosApiService.getCurrentCashRegister().then(regData => {
        if (regData?.register) {
          setCashRegister(regData.register);
          setCashMovements(regData.movements || []);
        }
      }).catch(console.warn);

      PosApiService.getSales().then(latestSales => {
        if (Array.isArray(latestSales) && latestSales.length > 0) {
          setSales(prev => {
            const map = new Map<string, Sale>();
            for (const s of prev) if (s && s.id) map.set(s.id, s);
            for (const s of latestSales) if (s && s.id) map.set(s.id, { ...(map.get(s.id) || {}), ...s });
            return Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          });
        }
      }).catch(console.warn);
    } else if (activeTab === 'products' || activeTab === 'pos') {
      Promise.all([
        PosApiService.getCategories(),
        PosApiService.getProducts(false)
      ]).then(([cats, prods]) => {
        setCategories(cats);
        setProducts(prods);
      }).catch(console.warn);
    }
  }, [activeTab]);

  // ----------------------------------------------------
  // POS SALE & HACIENDA DGT v4.4 CHECKOUT FLOW
  // ----------------------------------------------------
  const handleOpenPaymentModal = async () => {
    if (cart.length === 0) return;
    if (isProcessingPaymentRef.current || isSendingKitchenRef.current) return;

    const now = Date.now();
    if (now - lastKitchenSendTimestampRef.current < 2000) {
      console.warn('⚠️ Clic ignorado: Cobro o comanda ya en proceso.');
      return;
    }
    lastKitchenSendTimestampRef.current = now;

    try {
      const subtotal = cart.reduce((s, i) => s + (i.subtotal ?? (i.price * i.quantity)), 0);
      const taxTotal = cart.reduce((s, i) => s + (i.taxAmount ?? 0), 0);
      const total = cart.reduce((s, i) => s + (i.total ?? (i.price * i.quantity)), 0);

      // PRIMERO: Asegurar que la KitchenOrder existe o se actualiza en el KDS
      if (!activeKitchenOrderId) {
        // Consecutivo diario unificado de comanda
        const todayDateStr = getCostaRicaDate();
        const BASE_DAILY_ORDER = 100;
        const todaySales = sales.filter(s => (s.timestamp ? getCostaRicaDate(s.timestamp) : (s.date || '')) === todayDateStr && (s.orderNumber || 0) < 1000);
        const todayKitchen = kitchenOrders.filter(k => (k.timestamp ? getCostaRicaDate(k.timestamp) : (k.date || '')) === todayDateStr && (k.orderNumber || 0) < 1000);
        const highestSalesNum = todaySales.reduce((max, s) => Math.max(max, s.orderNumber || 0), BASE_DAILY_ORDER);
        const highestKitchenNum = todayKitchen.reduce((max, k) => Math.max(max, k.orderNumber || 0), BASE_DAILY_ORDER);
        const nextOrderNum = Math.max(highestSalesNum, highestKitchenNum) + 1;

        const kitchenId = `kitchen-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const opId = `op-k-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

        const newKitchenOrder: KitchenOrder = {
          id: kitchenId,
          orderNumber: nextOrderNum,
          operationId: opId,
          idempotencyKey: `idemp-${kitchenId}`,
          date: getCostaRicaDate(),
          time: getCostaRicaTime(),
          timestamp: Date.now(),
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          customerPhone: selectedCustomer.phone,
          customerAddress: selectedCustomer.address,
          orderType,
          tableNumber: orderType === 'DINE_IN' ? tableNumber : undefined,
          customOrderName: customOrderName.trim() || undefined,
          items: [...cart],
          subtotal,
          taxTotal,
          total,
          orderStatus: 'CONFIRMED',
          isPaid: false,
          cashierId: currentUser?.id || cashRegister?.cashierId || 'usr-1',
          cashierName: currentUser?.name || cashRegister?.cashierName || 'Cajero Principal',
          terminalName: terminalName || 'Caja Principal',
          location,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const saved = await PosApiService.createKitchenOrder(newKitchenOrder);
        setActiveKitchenOrderId(saved.id);
        setKitchenOrders(prev => [saved, ...prev.filter(k => k.id !== saved.id)]);
      } else {
        // Comanda existente: actualizarla con los productos actuales en el KDS
        const kitchenUpdates: Partial<KitchenOrder> = {
          items: [...cart],
          subtotal,
          taxTotal,
          total,
          orderType,
          tableNumber: orderType === 'DINE_IN' ? tableNumber : undefined,
          customOrderName: customOrderName.trim() || undefined,
          updatedAt: new Date().toISOString()
        };

        await PosApiService.updateKitchenOrder(activeKitchenOrderId, kitchenUpdates);
        setKitchenOrders(prev => prev.map(k => k.id === activeKitchenOrderId ? { ...k, ...kitchenUpdates } : k));
      }
    } catch (err) {
      console.warn('⚠️ No se pudo sincronizar comanda antes de abrir cobro:', err);
    } finally {
      // Abrir normalmente el modal de cobro existente SIN crear todavía la venta
      setIsPaymentModalOpen(true);
    }
  };

  const handlePauseOrder = () => {
    if (cart.length === 0) return;
    const subtotal = cart.reduce((s, i) => s + (i.subtotal ?? (i.price * i.quantity)), 0);
    const taxTotal = cart.reduce((s, i) => s + (i.taxAmount ?? 0), 0);
    const total = cart.reduce((s, i) => s + (i.total ?? (i.price * i.quantity)), 0);

    const defaultComandaName = orderType === 'DINE_IN' 
      ? 'Comer acá' 
      : (orderType === 'TAKE_OUT' ? 'Para Llevar' : 'Express');

    const paused: PausedOrder = {
      id: `paused-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      orderNumber: sales.length + 101,
      kitchenOrderId: activeKitchenOrderId || undefined,
      customOrderName: customOrderName.trim() || defaultComandaName,
      customer: selectedCustomer,
      orderType,
      tableNumber: orderType === 'DINE_IN' ? tableNumber : undefined,
      items: [...cart],
      subtotal,
      taxTotal,
      total,
      createdAt: new Date().toISOString(),
      terminalName
    };

    const updated = [paused, ...pausedOrders];
    setPausedOrders(updated);
    try {
      localStorage.setItem('sabor_cervanteno_paused_orders', JSON.stringify(updated));
    } catch {}

    // Limpiar carrito activo y comanda activa para el siguiente cliente
    setCart([]);
    setActiveKitchenOrderId(null);
    setCustomOrderName('');
    setTableNumber('1');
    setOrderType('TAKE_OUT');
    setSelectedCustomer(getDefaultCustomer(customers));
  };

  const handleResumePausedOrder = (order: PausedOrder) => {
    if (cart.length > 0) {
      handlePauseOrder();
    }

    setCart(order.items || []);
    setActiveKitchenOrderId(order.kitchenOrderId || null);
    setCustomOrderName(order.customOrderName || '');
    setOrderType(order.orderType || 'TAKE_OUT');
    if (order.tableNumber) setTableNumber(order.tableNumber);
    if (order.customer) setSelectedCustomer(order.customer);

    const updated = pausedOrders.filter(p => p.id !== order.id);
    setPausedOrders(updated);
    try {
      localStorage.setItem('sabor_cervanteno_paused_orders', JSON.stringify(updated));
    } catch {}
  };

  const handleDeletePausedOrder = (orderId: string) => {
    const updated = pausedOrders.filter(p => p.id !== orderId);
    setPausedOrders(updated);
    try {
      localStorage.setItem('sabor_cervanteno_paused_orders', JSON.stringify(updated));
    } catch {}
  };

  const handleSendToKitchenDirect = async () => {
    if (cart.length === 0) return;

    // Bloqueo instantáneo síncrono y protección anti-doble toque (debounce 3s)
    const now = Date.now();
    if (now - lastKitchenSendTimestampRef.current < 3000) {
      console.warn('⚠️ Clic ignorado: Comanda ya en proceso de envío.');
      return;
    }
    if (isSendingKitchenRef.current || isSendingKitchen) return;

    lastKitchenSendTimestampRef.current = now;
    isSendingKitchenRef.current = true;
    setIsSendingKitchen(true);

    try {
      const subtotal = cart.reduce((s, i) => s + (i.subtotal ?? (i.price * i.quantity)), 0);
      const taxTotal = cart.reduce((s, i) => s + (i.taxAmount ?? 0), 0);
      const total = cart.reduce((s, i) => s + (i.total ?? (i.price * i.quantity)), 0);

      if (!activeKitchenOrderId) {
        // Consecutivo diario unificado de orden entre ventas y cocina (reinicia a 101 cada día al cambiar de fecha)
        const todayDateStr = getCostaRicaDate();
        const BASE_DAILY_ORDER = 100; // Comenzará en 101
        const todaySales = sales.filter(s => (s.timestamp ? getCostaRicaDate(s.timestamp) : (s.date || '')) === todayDateStr && (s.orderNumber || 0) < 1000);
        const todayKitchen = kitchenOrders.filter(k => (k.timestamp ? getCostaRicaDate(k.timestamp) : (k.date || '')) === todayDateStr && (k.orderNumber || 0) < 1000);
        const highestSalesNum = todaySales.reduce((max, s) => Math.max(max, s.orderNumber || 0), BASE_DAILY_ORDER);
        const highestKitchenNum = todayKitchen.reduce((max, k) => Math.max(max, k.orderNumber || 0), BASE_DAILY_ORDER);
        const nextOrderNum = Math.max(highestSalesNum, highestKitchenNum) + 1;

        const kitchenId = `kitchen-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const opId = `op-k-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

        const newKitchenOrder: KitchenOrder = {
          id: kitchenId,
          orderNumber: nextOrderNum,
          operationId: opId,
          idempotencyKey: `idemp-${kitchenId}`,
          date: getCostaRicaDate(),
          time: getCostaRicaTime(),
          timestamp: Date.now(),
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          customerPhone: selectedCustomer.phone,
          customerAddress: selectedCustomer.address,
          orderType,
          tableNumber: orderType === 'DINE_IN' ? tableNumber : undefined,
          customOrderName: customOrderName.trim() || undefined,
          items: [...cart],
          subtotal,
          taxTotal,
          total,
          orderStatus: 'CONFIRMED',
          isPaid: false,
          cashierId: currentUser?.id || cashRegister?.cashierId || 'usr-1',
          cashierName: currentUser?.name || cashRegister?.cashierName || 'Cajero Principal',
          terminalName: terminalName || 'Caja Principal',
          location,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const saved = await PosApiService.createKitchenOrder(newKitchenOrder);
        
        // Registrar el ID activo para vincular el pedido en curso
        setActiveKitchenOrderId(saved.id);
        setKitchenOrders(prev => [saved, ...prev.filter(k => k.id !== saved.id)]);
      } else {
        // Si ya existe comanda abierta, actualizar la misma comanda con los productos agregados
        const kitchenUpdates: Partial<KitchenOrder> = {
          items: [...cart],
          subtotal,
          taxTotal,
          total,
          orderType,
          tableNumber: orderType === 'DINE_IN' ? tableNumber : undefined,
          customOrderName: customOrderName.trim() || undefined,
          updatedAt: new Date().toISOString()
        };

        const updated = await PosApiService.updateKitchenOrder(activeKitchenOrderId, kitchenUpdates);
        setKitchenOrders(prev => prev.map(k => k.id === activeKitchenOrderId ? { ...k, ...kitchenUpdates } : k));
      }
    } catch (err) {
      console.error('Error enviando comanda a cocina:', err);
    } finally {
      // Cooldown de 2.5s para evitar toques sucesivos en pantalla táctil
      setTimeout(() => {
        setIsSendingKitchen(false);
        isSendingKitchenRef.current = false;
      }, 2500);
    }
  };

  const handleConfirmPayment = async (
    payments: PaymentSplit[],
    generateFiscalDoc: boolean,
    amountPaid: number,
    change: number,
    electronicDocumentType: ElectronicDocumentType = '04',
    receiverOverride?: Customer,
    useRestaurantServiceLine?: boolean
  ) => {
    if (isProcessingPaymentRef.current || isProcessingPayment) return;
    isProcessingPaymentRef.current = true;
    setIsProcessingPayment(true);
    try {
      const subtotal = cart.reduce((s, i) => s + (i.subtotal ?? (i.price * i.quantity)), 0);
      const taxTotal = cart.reduce((s, i) => s + (i.taxAmount ?? 0), 0);
      const total = cart.reduce((s, i) => s + (i.total ?? (i.price * i.quantity)), 0);

      const activeReceiver = receiverOverride || selectedCustomer;

      // Si el cliente es nuevo o editado para Factura Electrónica, persistirlo
      if (receiverOverride && receiverOverride.identification) {
        try {
          await PosApiService.saveCustomer(receiverOverride);
          setCustomers(prev => {
            const exists = prev.some(c => c.id === receiverOverride.id || c.identification === receiverOverride.identification);
            if (exists) {
              return prev.map(c => (c.id === receiverOverride.id || c.identification === receiverOverride.identification) ? receiverOverride : c);
            }
            return [...prev, receiverOverride];
          });
        } catch (err) {
          console.warn('Error al persistir receptor en libreta de clientes:', err);
        }
      }

      // Consecutivo diario unificado de orden entre ventas y cocina (reinicia a 101 cada día al cambiar de fecha)
      const todayDateStr = getCostaRicaDate();
      const BASE_DAILY_ORDER = 100; // Comenzará en 101
      const todaySales = sales.filter(s => (s.timestamp ? getCostaRicaDate(s.timestamp) : (s.date || '')) === todayDateStr && (s.orderNumber || 0) < 1000);
      const todayKitchen = kitchenOrders.filter(k => (k.timestamp ? getCostaRicaDate(k.timestamp) : (k.date || '')) === todayDateStr && (k.orderNumber || 0) < 1000);
      const highestSalesNum = todaySales.reduce((max, s) => Math.max(max, s.orderNumber || 0), BASE_DAILY_ORDER);
      const highestKitchenNum = todayKitchen.reduce((max, k) => Math.max(max, k.orderNumber || 0), BASE_DAILY_ORDER);
      
      // Si la comanda ya fue enviada previamente con el botón "A Cocina", reutilizar el número de comanda
      const existingKitchen = activeKitchenOrderId ? kitchenOrders.find(k => k.id === activeKitchenOrderId) : null;
      const nextOrderNum = (existingKitchen && (existingKitchen.orderNumber || 0) < 1000) ? existingKitchen.orderNumber : (Math.max(highestSalesNum, highestKitchenNum) + 1);

      const saleId = `sale-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const opId = `op-sale-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const idempKey = `idemp-sale-${activeKitchenOrderId || saleId}`;

      const newSale: Sale = {
        id: saleId,
        orderNumber: nextOrderNum,
        operationId: opId,
        idempotencyKey: idempKey,
        kitchenOrderId: activeKitchenOrderId || undefined,
        date: getCostaRicaDate(),
        time: getCostaRicaTime(),
        timestamp: Date.now(),
        customerId: activeReceiver.id,
        customerName: activeReceiver.name,
        customerIdentification: activeReceiver.identification,
        customerIdentificationType: activeReceiver.identificationType,
        customerEconomicActivity: activeReceiver.economicActivity,
        customerEmail: activeReceiver.email,
        customerPhone: activeReceiver.phone,
        customerAddress: activeReceiver.address,
        receiverSnapshot: {
          name: activeReceiver.name,
          identificationType: activeReceiver.identificationType || '01',
          identification: activeReceiver.identification || '',
          commercialName: activeReceiver.commercialName,
          economicActivity: activeReceiver.economicActivity,
          email: activeReceiver.email,
          phone: activeReceiver.phone,
          address: activeReceiver.address,
          province: activeReceiver.province,
          canton: activeReceiver.canton,
          district: activeReceiver.district,
          phoneCountryCode: '506'
        },
        orderType,
        tableNumber: orderType === 'DINE_IN' ? tableNumber : undefined,
        customOrderName: customOrderName.trim() || undefined,
        items: [...cart],
        subtotal,
        discount: 0,
        taxTotal,
        total,
        payments,
        amountPaid,
        change,
        orderStatus: 'CONFIRMED',
        invoiceStatus: generateFiscalDoc ? 'PROCESSING' : 'NOT_INVOICED',
        electronicDocumentType,
        useRestaurantServiceLine: electronicDocumentType === '01' ? useRestaurantServiceLine : false,
        cashierId: currentUser?.id || cashRegister?.cashierId || 'usr-1',
        cashierName: currentUser?.name || cashRegister?.cashierName || 'Cajero Principal',
        terminalName: terminalName || 'Caja Principal',
        location,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // =========================================================================
      // PASO 1: CREAR LA VENTA PRIMERO (IDEMPOTENTE EN BACKEND / OFFLINE)
      // Se garantiza que la venta exista exitosamente antes de modificar la comanda.
      // Si createSale() falla, la comanda NO queda pagada ni cerrada (permite reintentar).
      // =========================================================================
      let savedSale: Sale;

      if (!navigator.onLine) {
        // MODO OFFLINE PURO (SITUACIÓN 3): Computadora sin conexión a Internet
        const offlineResult = await offlineSyncManager.emitFiscalDocumentOffline({
          sale: newSale,
          documentType: electronicDocumentType,
          receiverCustomer: activeReceiver,
          branch: '001',
          terminal: '00001',
          useRestaurantServiceLine: electronicDocumentType === '01' ? useRestaurantServiceLine : false
        });

        if (offlineResult.success && offlineResult.electronicDocument) {
          savedSale = {
            ...newSale,
            invoiceStatus: 'INVOICED',
            numericKey50: offlineResult.numericKey,
            consecutive20: offlineResult.consecutive,
            haciendaStatus: 'SIN_INTERNET_PENDIENTE',
            haciendaResponseMessage: 'Comprobante emitido sin conexión a Internet (Situación 3). Encolado para transmisión.',
            xmlEmitted: offlineResult.electronicDocument.xmlGenerated
          };
        } else {
          throw new Error(offlineResult.error || 'No se pudo emitir comprobante en modo offline.');
        }
      } else {
        try {
          savedSale = await PosApiService.createSale(newSale);
        } catch (netErr) {
          // Fallflow a Situación 3 si falla la conexión hacia el servidor Cloud Run
          console.warn('⚠️ Fallo en llamada a servidor POS, activando emisión de respaldo Offline (Situación 3):', netErr);
          const offlineResult = await offlineSyncManager.emitFiscalDocumentOffline({
            sale: newSale,
            documentType: electronicDocumentType,
            receiverCustomer: activeReceiver,
            branch: '001',
            terminal: '00001',
            useRestaurantServiceLine: electronicDocumentType === '01' ? useRestaurantServiceLine : false
          });

          if (offlineResult.success && offlineResult.electronicDocument) {
            savedSale = {
              ...newSale,
              invoiceStatus: 'INVOICED',
              numericKey50: offlineResult.numericKey,
              consecutive20: offlineResult.consecutive,
              haciendaStatus: 'SIN_INTERNET_PENDIENTE',
              haciendaResponseMessage: 'Comprobante emitido sin conexión a Internet (Situación 3). Encolado para transmisión.',
              xmlEmitted: offlineResult.electronicDocument.xmlGenerated
            };
          } else {
            throw netErr;
          }
        }
      }

      // =========================================================================
      // PASO 2: SOLO DESPUÉS DE QUE LA VENTA EXISTE Y SE CREó EXITOSAMENTE,
      // ACTUALIZAR O CREAR LA KITCHEN ORDER COMO PAID Y ASOCIAR EL saleId.
      // =========================================================================
      const actualSaleId = savedSale.id;
      const actualOrderNumber = savedSale.orderNumber;

      if (activeKitchenOrderId) {
        // Caso 1: Se presionó previamente "A Cocina". La comanda ya existe en cocina.
        const kitchenUpdates: Partial<KitchenOrder> = {
          isPaid: true,
          saleId: actualSaleId,
          orderNumber: actualOrderNumber,
          items: [...savedSale.items],
          subtotal: savedSale.subtotal,
          taxTotal: savedSale.taxTotal,
          total: savedSale.total,
          tableNumber: savedSale.tableNumber,
          customOrderName: savedSale.customOrderName,
          orderType: savedSale.orderType,
          updatedAt: new Date().toISOString()
        };

        // Enviar a cocina sin bloquear
        PosApiService.updateKitchenOrder(activeKitchenOrderId, kitchenUpdates).catch(err => {
          console.warn('⚠️ Error al actualizar comanda en backend tras venta:', err);
        });

        setKitchenOrders(prev => prev.map(k => (k.id === activeKitchenOrderId || k.orderNumber === actualOrderNumber) 
          ? { ...k, ...kitchenUpdates } 
          : k
        ));
      } else {
        // Caso 2: NO se presionó "A Cocina" antes de cobrar.
        // La comanda se crea y se dispara de inmediato a cocina ya con la venta consolidada
        const autoKitchen: KitchenOrder = {
          id: `kitchen-${actualSaleId.replace('sale-', '')}`,
          orderNumber: actualOrderNumber,
          date: savedSale.date,
          time: savedSale.time,
          timestamp: savedSale.timestamp,
          customerId: savedSale.customerId,
          customerName: savedSale.customerName,
          customerPhone: savedSale.customerPhone,
          customerAddress: savedSale.customerAddress,
          orderType: savedSale.orderType,
          tableNumber: savedSale.tableNumber,
          customOrderName: savedSale.customOrderName,
          items: [...savedSale.items],
          subtotal: savedSale.subtotal,
          taxTotal: savedSale.taxTotal,
          total: savedSale.total,
          orderStatus: 'CONFIRMED',
          isPaid: true,
          saleId: actualSaleId,
          cashierId: savedSale.cashierId,
          cashierName: savedSale.cashierName,
          terminalName: savedSale.terminalName,
          location: savedSale.location,
          createdAt: savedSale.createdAt,
          updatedAt: new Date().toISOString()
        };

        // Enviar de inmediato al servidor para alertar KDS
        PosApiService.createKitchenOrder(autoKitchen).catch(err => {
          console.warn('⚠️ Error al registrar comanda en backend tras venta:', err);
        });

        setKitchenOrders(prev => [autoKitchen, ...prev.filter(k => k.id !== autoKitchen.id && k.orderNumber !== actualOrderNumber)]);
      }

      // =========================================================================
      // PASO 3: EMISIÓN FISCAL HACIENDA (EN SEGUNDO PLANO ASÍNCRONO)
      // Se genera el XML y se transmite a Hacienda sin congelar el POS ni la cocina
      // =========================================================================
      if (generateFiscalDoc && navigator.onLine) {
        // Ejecución en segundo plano: no retiene la UI del cajero ni la comanda de cocina
        (async () => {
          try {
            const fiscalEmission = await PosApiService.emitElectronicDocument({
              sale: savedSale,
              documentType: electronicDocumentType,
              receiverCustomer: activeReceiver,
              branch: '001',
              terminal: '00001',
              useRestaurantServiceLine: electronicDocumentType === '01' ? useRestaurantServiceLine : false
            });

            if (fiscalEmission.success && fiscalEmission.electronicDocument) {
              const updatedFields: Partial<Sale> = {
                invoiceStatus: 'INVOICED',
                electronicDocumentType: fiscalEmission.electronicDocument.documentType,
                numericKey50: fiscalEmission.electronicDocument.numericKey,
                consecutive20: fiscalEmission.electronicDocument.consecutive,
                haciendaStatus: fiscalEmission.electronicDocument.status,
                haciendaResponseMessage: fiscalEmission.electronicDocument.statusDescription,
                xmlEmitted: fiscalEmission.electronicDocument.xmlGenerated,
                xmlHaciendaResponse: fiscalEmission.electronicDocument.xmlResponseHacienda
              };

              await PosApiService.updateSaleStatus(savedSale.id, updatedFields);
              setSales(prev => prev.map(s => s.id === savedSale.id ? { ...s, ...updatedFields } : s));
              setLastProcessedSale(prev => prev && prev.id === savedSale.id ? { ...prev, ...updatedFields } : prev);
            } else {
              savedSale.invoiceStatus = 'ERROR';
              SyncManager.addToQueue(savedSale.id, 'EMIT_FISCAL_DOCUMENT', {
                sale: savedSale,
                documentType: electronicDocumentType,
                receiver: activeReceiver,
                useRestaurantServiceLine: electronicDocumentType === '01' ? useRestaurantServiceLine : false
              });
              setSales(prev => prev.map(s => s.id === savedSale.id ? { ...s, invoiceStatus: 'ERROR' } : s));
            }
          } catch (e: any) {
            console.warn('⚠️ Error asíncrono emitiendo a Hacienda, encolando para contingencia:', e);
            savedSale.invoiceStatus = 'ERROR';
            SyncManager.addToQueue(savedSale.id, 'EMIT_FISCAL_DOCUMENT', {
              sale: savedSale,
              documentType: electronicDocumentType,
              receiver: activeReceiver,
              useRestaurantServiceLine: electronicDocumentType === '01' ? useRestaurantServiceLine : false
            });
            setSales(prev => prev.map(s => s.id === savedSale.id ? { ...s, invoiceStatus: 'ERROR' } : s));
          }
        })();
      }

      // Update state
      setSales(prev => [savedSale, ...prev.filter(s => s.id !== savedSale.id)]);
      setLastProcessedSale(savedSale);
      setIsPaymentModalOpen(false);
      setIsResultModalOpen(true);
      setCart([]);
      setActiveKitchenOrderId(null);
      setCustomOrderName('');
      setOrderType('TAKE_OUT');
      setSelectedCustomer(getDefaultCustomer(customers));
      
      // Refresh cash register state
      const updatedReg = await PosApiService.getCurrentCashRegister();
      setCashRegister(updatedReg.register);
    } finally {
      setIsProcessingPayment(false);
      isProcessingPaymentRef.current = false;
    }
  };

  const handleRetryFiscalInvoice = async (sale: Sale) => {
    setIsRetryingFiscal(true);
    try {
      const docType = sale.electronicDocumentType || (sale.customerId && sale.customerId !== 'cust-final' ? '01' : '04');
      const receiver = customers.find(c => c.id === sale.customerId) || {
        id: sale.customerId || 'cust-final',
        name: sale.customerName || 'Cliente General',
        identification: sale.customerIdentification || '000000000',
        identificationType: sale.customerIdentificationType || '01',
        email: sale.customerEmail,
        phone: sale.customerPhone,
        address: sale.customerAddress || 'Cervantes, Cartago',
        province: 'Cartago',
        canton: 'Alvarado',
        district: 'Cervantes',
        createdAt: new Date().toISOString()
      };

      const res = await PosApiService.emitElectronicDocument({
        sale,
        documentType: docType,
        receiverCustomer: receiver,
        branch: '001',
        terminal: '00001'
      });

      if (res.success && res.electronicDocument) {
        const updated = await PosApiService.updateSaleStatus(sale.id, {
          invoiceStatus: 'INVOICED',
          electronicDocumentType: res.electronicDocument.documentType,
          numericKey50: res.electronicDocument.numericKey,
          consecutive20: res.electronicDocument.consecutive,
          haciendaStatus: res.electronicDocument.status,
          haciendaResponseMessage: res.electronicDocument.statusDescription,
          xmlEmitted: res.electronicDocument.xmlGenerated,
          xmlHaciendaResponse: res.electronicDocument.xmlResponseHacienda
        });
        if (updated) {
          setSales(prev => prev.map(s => s.id === updated.id ? updated : s));
        }
        alert('¡Comprobante electrónico emitido y validado exitosamente ante Hacienda DGT v4.4!');
      } else {
        alert(`Error al emitir ante Hacienda: ${res.message || 'Verifique los datos fiscales'}`);
      }
    } catch (e: any) {
      alert(`Error de conexión fiscal: ${e.message}`);
    } finally {
      setIsRetryingFiscal(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
    // 1. Identificar comanda y venta vinculadas
    const targetKitchen = kitchenOrders.find(k => k.id === orderId || k.saleId === orderId);
    const targetSale = sales.find(s => 
      s.id === orderId || 
      s.kitchenOrderId === orderId || 
      (targetKitchen && (targetKitchen.saleId === s.id || (targetKitchen.orderNumber && targetKitchen.orderNumber === s.orderNumber)))
    );

    // Guardar copia para rollback en caso de fallo
    const prevKitchenOrders = [...kitchenOrders];
    const prevSales = [...sales];

    // 2. ACTUALIZACIÓN OPTIMISTA INMEDIATA (0 ms de espera en pantalla):
    setKitchenOrders(prev => prev.map(k => {
      const isMatch = k.id === orderId || 
                      (targetSale && (k.saleId === targetSale.id || (k.orderNumber && k.orderNumber === targetSale.orderNumber))) ||
                      (targetKitchen && k.id === targetKitchen.id);
      return isMatch ? { ...k, orderStatus: status, updatedAt: new Date().toISOString() } : k;
    }));

    setSales(prev => prev.map(s => {
      const isMatch = s.id === orderId || 
                      (targetKitchen && (s.id === targetKitchen.saleId || (s.orderNumber && s.orderNumber === targetKitchen.orderNumber) || s.kitchenOrderId === targetKitchen.id)) ||
                      (targetSale && s.id === targetSale.id);
      return isMatch ? { ...s, orderStatus: status, updatedAt: new Date().toISOString() } : s;
    }));

    // 3. Persistencia en segundo plano en el servidor
    try {
      const promises: Promise<any>[] = [];
      const kitchenIdToUpdate = targetKitchen ? targetKitchen.id : (kitchenOrders.some(k => k.id === orderId) ? orderId : null);
      const saleIdToUpdate = targetSale ? targetSale.id : (sales.some(s => s.id === orderId) ? orderId : null);

      if (kitchenIdToUpdate) {
        promises.push(PosApiService.updateKitchenOrderStatus(kitchenIdToUpdate, status));
      }
      if (saleIdToUpdate) {
        promises.push(PosApiService.updateSaleStatus(saleIdToUpdate, { orderStatus: status }));
      }

      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }
    } catch (error) {
      console.error('Error al sincronizar estado de comanda en segundo plano:', error);
      // Revertir a los estados previos solo si hubo fallo
      setKitchenOrders(prevKitchenOrders);
      setSales(prevSales);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await SyncManager.processQueue();
      // Activar también la emisión en lote del servidor para vaciar la cola centralizada
      try {
        await PosApiService.emitPendingBatch();
      } catch (batchErr) {
        console.warn('⚠️ Aviso en emisión de lote del servidor:', batchErr);
      }
      SyncManager.clearCompleted();
      const updatedSales = await PosApiService.getSales();
      setSales(updatedSales);
    } finally {
      setIsSyncing(false);
    }
  };

  // ----------------------------------------------------
  // CASH REGISTER ACTIONS
  // ----------------------------------------------------
  const handleOpenRegister = async (openingBalance: number, cashierName?: string) => {
    const finalCashierName = cashierName || currentUser?.name || 'Cajero Principal';
    const reg = await PosApiService.openCashRegister(openingBalance, finalCashierName, location);
    setCashRegister(reg);

    // Actualizar nombre del usuario actual si es Cajero
    if (cashierName && currentUser) {
      const updatedUser = { ...currentUser, name: cashierName };
      setCurrentUser(updatedUser);
      localStorage.setItem('sabor_cervanteno_current_user', JSON.stringify(updatedUser));
    }
  };

  const handleCloseRegister = async (closingData: any, notes?: string) => {
    const cashActual = typeof closingData === 'number'
      ? closingData
      : (closingData?.cashActual ?? closingData?.countedCash ?? 0);
    const closeNotes = typeof closingData === 'object' && closingData?.notes
      ? closingData.notes
      : (notes || '');

    const closed = await PosApiService.closeCashRegister(
      cashActual,
      closeNotes
    );
    setCashRegister(closed);
    const regData = await PosApiService.getCurrentCashRegister();
    setCashMovements(regData.movements);
  };

  const handleAddMovement = async (type: 'IN' | 'OUT', amount: number, reason: string) => {
    await PosApiService.addCashMovement(type, amount, reason);
    const regData = await PosApiService.getCurrentCashRegister();
    setCashRegister(regData.register);
    setCashMovements(regData.movements);
  };

  // ----------------------------------------------------
  // PRODUCTS & CATEGORIES
  // ----------------------------------------------------
  const handleSaveProduct = async (product: Product) => {
    const updatedProducts = await PosApiService.saveProduct(product);
    setProducts(updatedProducts);
  };

  const handleDeleteProduct = async (productId: string) => {
    await PosApiService.deleteProduct(productId);
    setProducts(prev => prev.filter(p => p.id !== productId));
  };

  const handleSaveCategory = async (cat: Category) => {
    const updatedCategories = await PosApiService.saveCategory(cat);
    setCategories(updatedCategories);
  };

  const handleDeleteCategory = async (catId: string) => {
    const updatedCategories = await PosApiService.deleteCategory(catId);
    setCategories(updatedCategories);
  };

  // ----------------------------------------------------
  // CUSTOMERS
  // ----------------------------------------------------
  const handleSaveCustomer = async (customer: Customer) => {
    const updatedCustomers = await PosApiService.saveCustomer(customer);
    setCustomers(updatedCustomers);
  };

  const handleImportCustomers = async (importedList: Customer[], replaceAll = false) => {
    const result = await PosApiService.importCustomers(importedList, replaceAll);
    if (result.customers) {
      setCustomers(result.customers);
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    const updatedCustomers = await PosApiService.deleteCustomer(customerId);
    setCustomers(updatedCustomers);
  };

  const handleOpenReceiptModal = (sale: Sale, type: 'POS' | 'KITCHEN' | 'INVOICE', autoPrint = false) => {
    setThermalModalSale(sale);
    setThermalReceiptType(type);
    setThermalAutoPrint(autoPrint);
    setIsThermalModalOpen(true);
  };

  // Colección de comandas desduplicada para la pantalla KDS:
  // Garantiza que cada comanda o venta se identifique de forma única,
  // impidiendo que dos órdenes con el mismo número de comanda se sobreescriban o desaparezcan en hora pico,
  // y evitando que ventas con estado atrasado revivan comandas ya despachadas.
  const kdsDisplayOrders = useMemo(() => {
    const today = getCostaRicaDate();
    const now = Date.now();
    const orderMap = new Map<string, KitchenOrder | Sale>();
    const knownSaleIds = new Set<string>();
    const knownOrderNumbers = new Set<number>();
    
    // Registrar todas las órdenes y ventas que ya fueron despachadas para impedir que revivan por ID único
    const deliveredKitchenIds = new Set<string>();
    const deliveredSaleIds = new Set<string>();
    
    for (const k of kitchenOrders) {
      if (k.orderStatus === 'DELIVERED' || k.orderStatus === 'CANCELLED') {
        deliveredKitchenIds.add(k.id);
        if (k.saleId) deliveredSaleIds.add(k.saleId);
      }
    }
    for (const s of sales) {
      if (s.orderStatus === 'DELIVERED' || s.orderStatus === 'CANCELLED') {
        deliveredSaleIds.add(s.id);
        if (s.kitchenOrderId) deliveredKitchenIds.add(s.kitchenOrderId);
      }
    }

    // Regla de ventana KDS:
    // Las comandas del día de hoy en Costa Rica se incluyen completas (KdsScreen separa activas de despachadas con el botón)
    const isRelevantKdsOrder = (order: KitchenOrder | Sale) => {
      if (!order) return false;
      const status = (order as any).orderStatus;
      if (status === 'CANCELLED') return false;

      const orderDate = order.timestamp 
        ? getCostaRicaDate(order.timestamp) 
        : (order.date || (order.createdAt ? getCostaRicaDate(order.createdAt) : ''));
      
      // Si la comanda pertenece a la fecha de hoy en Costa Rica
      if (orderDate === today) {
        return true;
      }

      // Si por desfase de medianoche se creó hace menos de 45 minutos
      const orderTime = order.timestamp || new Date(order.createdAt || 0).getTime();
      if (orderTime && (now - orderTime) <= 45 * 60 * 1000) {
        return true;
      }

      return false;
    };

    // 1. Registrar las comandas de cocina del día de funcionamiento actual
    for (const k of kitchenOrders) {
      if (!isRelevantKdsOrder(k)) continue;
      // Desduplicación por ID único
      if (orderMap.has(k.id)) continue;

      orderMap.set(k.id, k);
      if (k.saleId) knownSaleIds.add(k.saleId);
      if (k.orderNumber) knownOrderNumbers.add(Number(k.orderNumber));
    }
    
    // 2. Incorporar ventas solo si son de HOY, recientes (< 30 min) y no están ya en cocina
    for (const s of sales) {
      const sDate = s.timestamp ? getCostaRicaDate(s.timestamp) : (s.date || (s.createdAt ? getCostaRicaDate(s.createdAt) : ''));
      if (sDate !== today) continue; // Nunca considerar ventas de días anteriores
      if (s.orderStatus === 'CANCELLED' || s.orderStatus === 'DELIVERED') continue;
      const saleTime = s.timestamp || new Date(s.createdAt || 0).getTime();
      if (!saleTime || (now - saleTime) > 30 * 60 * 1000) continue; // Solo ventas activas de los últimos 30 min (nunca revivir ventas de hace horas)
      if (s.kitchenOrderId && orderMap.has(s.kitchenOrderId)) continue;
      if (orderMap.has(s.id)) continue;
      if (s.orderNumber && knownOrderNumbers.has(Number(s.orderNumber))) continue;
      if (!isRelevantKdsOrder(s)) continue;

      orderMap.set(s.id, s);
    }
    
    return Array.from(orderMap.values());
  }, [kitchenOrders, sales]);

  // If terminal is locked, display the Start Screen with live Clock and Role Selector
  if (isLocked) {
    return (
      <LoginScreen
        onLogin={(user) => {
          setCurrentUser(user);
          safeStorage.setItem('sabor_cervanteno_current_user', JSON.stringify(user));
          safeStorage.setSessionItem('sabor_pos_unlocked', 'true');
          setIsLocked(false);

          // Enforce navigation tab permissions
          if (user.role !== 'ADMINISTRADOR' && user.permissions) {
            const permMap: Record<string, keyof typeof user.permissions> = {
              pos: 'canAccessPos',
              kds: 'canAccessKitchen',
              sales: 'canAccessSales',
              fiscal: 'canAccessFiscal',
              cash: 'canAccessCash',
              products: 'canAccessProducts',
              customers: 'canAccessCustomers',
              dashboard: 'canAccessReports'
            };
            const currentPerm = permMap[activeTab];
            if (currentPerm && !user.permissions[currentPerm]) {
              const firstAllowed = Object.entries(permMap).find(([_, p]) => user.permissions?.[p]);
              if (firstAllowed) {
                setActiveTab(firstAllowed[0] as any);
              }
            }
          }
        }}
        onOpenKdsGeneral={() => {
          try {
            localStorage.setItem('sabor_cervanteno_kds_station', 'ALL');
          } catch (e) {
            console.warn('Error saving KDS station:', e);
          }

          const kitchenUser: UserProfile = {
            id: 'usr-kds-general',
            name: 'Monitor KDS General',
            email: 'cocina@saborcervanteno.cr',
            role: 'COCINA',
            pinCode: '0000',
            active: true,
            location: location || 'RESTAURANTE',
            commissionRate: 0,
            permissions: {
              canAccessPos: false,
              canAccessKitchen: true,
              canAccessSales: false,
              canAccessFiscal: false,
              canAccessCash: false,
              canAccessProducts: false,
              canAccessCustomers: false,
              canAccessReports: false,
              canApplyDiscounts: false,
              canCancelOrders: false
            }
          };

          setCurrentUser(kitchenUser);
          safeStorage.setItem('sabor_cervanteno_current_user', JSON.stringify(kitchenUser));
          safeStorage.setSessionItem('sabor_pos_unlocked', 'true');
          setActiveTab('kds');
          setIsLocked(false);
        }}
        isOnline={isOnline}
        cashRegister={cashRegister}
        location={location}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-stone-100 font-sans select-none overflow-hidden">
      
      {/* Top Header & Navigation */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        location={location}
        setLocation={setLocation}
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
        onManualSync={handleManualSync}
        isSyncing={isSyncing}
        cashRegister={cashRegister}
        isHaciendaConfigured={true}
        currentUser={currentUser}
        onSwitchUser={handleSwitchUser}
        onLockTerminal={handleLockTerminal}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'pos' && (
          <PosScreen
            products={products}
            categories={categories}
            customers={customers}
            selectedCustomer={selectedCustomer}
            setSelectedCustomer={setSelectedCustomer}
            cart={cart}
            setCart={setCart}
            orderType={orderType}
            setOrderType={setOrderType}
            tableNumber={tableNumber}
            setTableNumber={setTableNumber}
            terminalName={terminalName}
            setTerminalName={setTerminalName}
            customOrderName={customOrderName}
            setCustomOrderName={setCustomOrderName}
            pausedOrders={pausedOrders}
            onPauseOrder={handlePauseOrder}
            onResumePausedOrder={handleResumePausedOrder}
            onDeletePausedOrder={handleDeletePausedOrder}
            location={location}
            onOpenPaymentModal={handleOpenPaymentModal}
            onSendToKitchen={handleSendToKitchenDirect}
            onAddNewCustomer={() => setActiveTab('customers')}
            isKitchenSent={Boolean(activeKitchenOrderId)}
            isSendingToKitchen={isSendingKitchen}
            cashRegister={cashRegister}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'kds' && (
          <KdsScreen
            sales={kdsDisplayOrders}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onPrintOrder={(sale) => handleOpenReceiptModal(sale as any, 'KITCHEN')}
          />
        )}

          {activeTab === 'sales' && (
            <SalesHistoryScreen
              sales={sales}
              onRetryFiscalInvoice={handleRetryFiscalInvoice}
              onViewReceipt={handleOpenReceiptModal}
              isRetrying={isRetryingFiscal}
            />
          )}

          {activeTab === 'fiscal' && (
            <ElectronicDocumentsCenter />
          )}

          {activeTab === 'cash' && (
            <CashRegisterScreen
              cashRegister={cashRegister}
              movements={cashMovements}
              sales={sales}
              location={location}
              currentUser={currentUser}
              onOpenRegister={handleOpenRegister}
              onCloseRegister={handleCloseRegister}
              onAddMovement={handleAddMovement}
            />
          )}

          {activeTab === 'products' && (
            <ProductsManager
              products={products}
              categories={categories}
              onSaveProduct={handleSaveProduct}
              onDeleteProduct={handleDeleteProduct}
              onSaveCategory={handleSaveCategory}
              onDeleteCategory={handleDeleteCategory}
            />
          )}

          {activeTab === 'customers' && (
            <CustomersManager
              customers={customers}
              onSaveCustomer={handleSaveCustomer}
              onImportCustomers={handleImportCustomers}
              onDeleteCustomer={handleDeleteCustomer}
            />
          )}

          {activeTab === 'dashboard' && (
            <DashboardScreen
              sales={sales}
              products={products}
              currentUser={currentUser}
              cashRegister={cashRegister}
              movements={cashMovements}
              onRequestAdminAuth={requestSupervisorAuth}
              onElevateToAdmin={handleElevateToAdmin}
            />
          )}
      </main>

      {/* Overlay Bloqueante de Pagos */}
      {isProcessingPayment && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-stone-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm text-center">
            <div className="w-16 h-16 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin mb-4"></div>
            <h3 className="text-xl font-bold text-stone-800 mb-2">Procesando Pago</h3>
            <p className="text-sm text-stone-500">
              Estamos validando la transacción y cerrando la orden.<br/><br/>
              <strong className="text-rose-600">Por favor NO cierre ni recargue esta ventana.</strong>
            </p>
          </div>
        </div>
      )}

      {/* Payment Split & Cash Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        totalAmount={cart.reduce((s, i) => s + (i.total ?? (i.price * i.quantity)), 0)}
        customer={selectedCustomer}
        customers={customers}
        cart={cart}
        onConfirmPayment={handleConfirmPayment}
        isProcessing={isProcessingPayment}
        isHaciendaConfigured={true}
      />

      {/* Post-Sale Result Modal */}
      <InvoiceResultModal
        isOpen={isResultModalOpen}
        onClose={() => setIsResultModalOpen(false)}
        sale={lastProcessedSale}
        onPrintThermal={(type) => {
          setIsResultModalOpen(false);
          if (lastProcessedSale) {
            handleOpenReceiptModal(lastProcessedSale, type, true);
          }
        }}
        onNewSale={() => {
          setIsResultModalOpen(false);
          setLastProcessedSale(null);
        }}
      />

      {/* Thermal Receipt Print Preview Modal */}
      <ThermalReceiptModal
        isOpen={isThermalModalOpen}
        onClose={() => {
          setIsThermalModalOpen(false);
          setThermalAutoPrint(false);
        }}
        sale={thermalModalSale}
        initialType={thermalReceiptType}
        autoPrint={thermalAutoPrint}
      />

      {/* Supervisor PIN Verification Modal */}
      <SupervisorPinModal
        isOpen={isSupervisorPinOpen}
        onClose={() => {
          setIsSupervisorPinOpen(false);
          setSupervisorAction(null);
        }}
        onSuccess={() => {
          if (supervisorAction) {
            supervisorAction.onSuccess();
          }
          setSupervisorAction(null);
        }}
        actionTitle={supervisorAction?.title || 'Autorización Requerida'}
        actionDescription={supervisorAction?.description || 'Ingrese el PIN de supervisor para autorizar esta operación.'}
      />
    </div>
  );
}
