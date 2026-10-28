import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  User, 
  Utensils, 
  ShoppingBag, 
  Truck, 
  Check, 
  Tag, 
  Percent, 
  MessageSquare,
  Sparkles,
  ChevronRight,
  Flame,
  AlertCircle,
  Smartphone,
  Laptop,
  PauseCircle,
  Play,
  Clock,
  X
} from 'lucide-react';
import { Product, Category, Customer, CartItem, OrderType, LocationType, ProductModifier, PausedOrder, CashRegister, UserProfile, KitchenObservation } from '../types/pos';
import { PosApiService } from '../services/api';
import { getLocalProductImage } from '../utils/productImages';
import { calculateFiscalPriceBreakdown } from '../server/taxRules';

interface PosScreenProps {
  products: Product[];
  categories: Category[];
  customers: Customer[];
  selectedCustomer: Customer;
  setSelectedCustomer: (c: Customer) => void;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  tableNumber: string;
  setTableNumber: (n: string) => void;
  terminalName: string;
  setTerminalName: (t: string) => void;
  customOrderName: string;
  setCustomOrderName: (n: string) => void;
  pausedOrders: PausedOrder[];
  onPauseOrder: () => void;
  onResumePausedOrder: (order: PausedOrder) => void;
  onDeletePausedOrder: (orderId: string) => void;
  location: LocationType;
  onOpenPaymentModal: () => void;
  onSendToKitchen: () => void;
  onAddNewCustomer: () => void;
  isKitchenSent?: boolean;
  isSendingToKitchen?: boolean;
  cashRegister?: CashRegister | null;
  currentUser?: UserProfile | null;
}

export const PosScreen: React.FC<PosScreenProps> = ({
  products,
  categories,
  customers,
  selectedCustomer,
  setSelectedCustomer,
  cart,
  setCart,
  orderType,
  setOrderType,
  tableNumber,
  setTableNumber,
  terminalName,
  setTerminalName,
  customOrderName,
  setCustomOrderName,
  pausedOrders,
  onPauseOrder,
  onResumePausedOrder,
  onDeletePausedOrder,
  location,
  onOpenPaymentModal,
  onSendToKitchen,
  onAddNewCustomer,
  isKitchenSent = false,
  isSendingToKitchen = false,
  cashRegister,
  currentUser
}) => {
  const activeCategories = categories.filter(c => c.active);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(() => {
    return activeCategories.length > 0 ? activeCategories[0].id : 'cat-1787257504257';
  });

  // Asegurar que si las categorías se cargan o cambian, se seleccione una categoría válida
  useEffect(() => {
    if (activeCategories.length > 0) {
      const exists = activeCategories.some(c => c.id === selectedCategoryId);
      if (!exists) {
        setSelectedCategoryId(activeCategories[0].id);
      }
    }
  }, [activeCategories, selectedCategoryId]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProductForMod, setSelectedProductForMod] = useState<Product | null>(null);
  const [itemNote, setItemNote] = useState<string>('');
  const [selectedModifiers, setSelectedModifiers] = useState<ProductModifier[]>([]);
  const [modQuantity, setModQuantity] = useState<number>(1);
  const [customerSearchOpen, setCustomerSearchOpen] = useState<boolean>(false);
  const [customerQuery, setCustomerQuery] = useState<string>('');
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState<boolean>(false);
  const [isPausedModalOpen, setIsPausedModalOpen] = useState<boolean>(false);
  const [kitchenObservations, setKitchenObservations] = useState<KitchenObservation[]>([]);

  // Cargar observaciones oficiales de cocina desde la base de datos (creadas por el administrador)
  useEffect(() => {
    const loadObservations = () => {
      PosApiService.getKitchenObservations().then(obs => {
        if (Array.isArray(obs)) {
          setKitchenObservations(obs);
        }
      }).catch(() => {});
    };

    loadObservations();

    // Actualizar si se dispara el evento global o cuando la ventana recupera el foco
    window.addEventListener('focus', loadObservations);
    return () => {
      window.removeEventListener('focus', loadObservations);
    };
  }, []);

  // Filter products by category or search query
  const filteredProducts = products.filter(p => {
    if (!p.active) return false;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    if (searchQuery.trim() !== '') return matchesSearch;
    return p.categoryId === selectedCategoryId;
  });

  // Paginación de platillos / productos
  const [productPage, setProductPage] = useState<number>(1);
  const productsPerPage = 12;

  useEffect(() => {
    setProductPage(1);
  }, [selectedCategoryId, searchQuery]);

  const totalProductPages = Math.ceil(filteredProducts.length / productsPerPage) || 1;
  const paginatedProducts = filteredProducts.slice((productPage - 1) * productsPerPage, productPage * productsPerPage);

  const filteredCustomers = customers.filter(c => {
    if (!customerQuery.trim()) return true;
    const q = customerQuery.toLowerCase().trim();
    return (
      c.name.toLowerCase().includes(q) ||
      c.identification.includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  });

  // Cart calculations (Colones costarricenses ₡)
  const subtotal = cart.reduce((sum, item) => sum + (item.subtotal ?? (item.price * item.quantity)), 0);
  const taxTotal = cart.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0);
  const total = cart.reduce((sum, item) => sum + (item.total ?? (item.price * item.quantity)), 0);

  const handleProductClick = (product: Product) => {
    const hasModifiers = product.modifiers && product.modifiers.length > 0;
    const shouldPrompt = product.askModifiersOnSelection ?? hasModifiers;
    
    // Solo cuando el producto tiene configurado pedir adicionales de receta, se abre el modal
    if (shouldPrompt && hasModifiers) {
      setSelectedProductForMod(product);
      setSelectedModifiers([]);
      setItemNote('');
      setModQuantity(1);
    } else {
      addToCart(product, [], '', 1);
    }
  };

  const addToCart = (product: Product, modifiers: ProductModifier[], notes: string, qty = 1) => {
    const modTotal = modifiers.reduce((s, m) => s + m.price, 0);
    const unitPrice = product.price + modTotal;
    const taxRate = product.taxRate !== undefined ? product.taxRate : 0.13;
    const isPriceWithTax = product.isPriceWithTax ?? true;
    const breakdown = calculateFiscalPriceBreakdown(unitPrice, taxRate, isPriceWithTax);

    // Check if identical item already in cart
    const existingIndex = cart.findIndex(i => 
      i.productId === product.id && 
      (i.notes || '') === (notes || '') &&
      JSON.stringify(i.modifiers || []) === JSON.stringify(modifiers)
    );

    if (existingIndex >= 0) {
      const updated = [...cart];
      const newQty = updated[existingIndex].quantity + qty;
      updated[existingIndex].quantity = newQty;
      updated[existingIndex].subtotal = Number((breakdown.netPrice * newQty).toFixed(2));
      updated[existingIndex].taxAmount = Number((breakdown.taxAmount * newQty).toFixed(2));
      updated[existingIndex].total = Number((breakdown.totalPrice * newQty).toFixed(2));
      setCart(updated);
    } else {
      const newItem: CartItem = {
        productId: product.id,
        name: product.name,
        cabysCode: product.cabysCode,
        price: unitPrice,
        quantity: qty,
        taxRate,
        isPriceWithTax,
        netPrice: breakdown.netPrice,
        notes: notes.trim() !== '' ? notes.trim() : undefined,
        modifiers: modifiers.length > 0 ? modifiers : undefined,
        station: product.station || 'PLANCHA_ARMADO',
        itemType: product.itemType || 'SERVICIO',
        unitOfMeasure: product.unitOfMeasure || (product.itemType === 'MERCANCIA' ? 'Unid' : 'Os'),
        exoneration: product.exoneration,
        subtotal: Number((breakdown.netPrice * qty).toFixed(2)),
        taxAmount: Number((breakdown.taxAmount * qty).toFixed(2)),
        total: Number((breakdown.totalPrice * qty).toFixed(2))
      };
      setCart([...cart, newItem]);
    }
  };

  const updateQuantity = (index: number, delta: number) => {
    const updated = [...cart];
    const item = updated[index];
    const newQty = item.quantity + delta;

    if (newQty <= 0) {
      updated.splice(index, 1);
    } else {
      const breakdown = calculateFiscalPriceBreakdown(item.price, item.taxRate ?? 0.13, item.isPriceWithTax ?? true);
      item.quantity = newQty;
      item.subtotal = Number((breakdown.netPrice * newQty).toFixed(2));
      item.taxAmount = Number((breakdown.taxAmount * newQty).toFixed(2));
      item.total = Number((breakdown.totalPrice * newQty).toFixed(2));
    }
    setCart(updated);
  };

  const removeItem = (index: number) => {
    const updated = [...cart];
    updated.splice(index, 1);
    setCart(updated);
  };

  const toggleModifier = (mod: ProductModifier) => {
    if (selectedModifiers.some(m => m.id === mod.id)) {
      setSelectedModifiers(selectedModifiers.filter(m => m.id !== mod.id));
    } else {
      setSelectedModifiers([...selectedModifiers, mod]);
    }
  };

  const handleConfirmModifiers = () => {
    if (selectedProductForMod) {
      addToCart(selectedProductForMod, selectedModifiers, itemNote, modQuantity);
      setSelectedProductForMod(null);
      setSelectedModifiers([]);
      setItemNote('');
      setModQuantity(1);
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-45px)] overflow-hidden bg-stone-100">
      
      {/* ----------------- LEFT: CATEGORIES SIDEBAR ----------------- */}
      <aside className="w-full lg:w-48 bg-stone-900 text-stone-200 flex lg:flex-col overflow-x-auto lg:overflow-y-auto shrink-0 border-r border-stone-800 scrollbar-none py-2 lg:py-3">
        <div className="hidden lg:block px-4 pb-2 text-[11px] font-bold tracking-wider text-amber-400 uppercase">
          Categorías
        </div>
        <div className="flex lg:flex-col gap-1 px-2">
          {activeCategories.map((cat) => {
            const isSelected = selectedCategoryId === cat.id && searchQuery === '';
            return (
              <button
                key={cat.id}
                id={`cat-btn-${cat.id}`}
                onClick={() => {
                  setSelectedCategoryId(cat.id);
                  setSearchQuery('');
                }}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all text-left whitespace-nowrap lg:whitespace-normal ${
                  isSelected
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-stone-300 hover:bg-stone-800 hover:text-white'
                }`}
              >
                <Flame className={`w-4 h-4 shrink-0 ${isSelected ? 'text-amber-200' : 'text-amber-500'}`} />
                <span className="truncate">{cat.name}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ----------------- CENTER: PRODUCTS GRID & SEARCH ----------------- */}
      <main className="flex-1 flex flex-col overflow-hidden bg-stone-50">
        {/* Search and Filter Bar */}
        <div className="p-3 bg-white border-b border-stone-200 flex items-center justify-between gap-3 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              id="product-search-input"
              type="text"
              placeholder="Buscar producto por nombre o SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-stone-100 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-600"
              >
                Limpiar
              </button>
            )}
          </div>

          <div className="text-xs font-semibold text-stone-500 hidden sm:block">
            {filteredProducts.length} productos disponibles
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 p-3.5 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5 auto-rows-max">
          {paginatedProducts.map((product) => {
            const inStock = location === 'CEDI' 
              ? (product.locationStock?.CEDI ?? product.inventory)
              : (product.locationStock?.RESTAURANTE ?? product.inventory);

            return (
              <button
                key={product.id}
                id={`product-card-${product.id}`}
                onClick={() => handleProductClick(product)}
                className="group relative flex flex-col justify-between bg-white rounded-2xl p-3 border border-stone-200/90 hover:border-amber-500 hover:shadow-md transition-all text-left overflow-hidden active:scale-[0.98]"
              >
                {/* Product Image */}
                <div className="relative w-full h-28 sm:h-32 rounded-xl overflow-hidden bg-stone-100 mb-2">
                  <img
                    src={getLocalProductImage(product.image, product.categoryId, product.name, product.sku)}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      // Fallback local garantizado
                      (e.target as HTMLImageElement).src = '/images/products/pollo-crujiente.svg';
                    }}
                  />
                  <span className="absolute bottom-1.5 right-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-stone-900/75 text-stone-200">
                    Stock: {inStock}
                  </span>
                </div>

                {/* Product Details */}
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <h3 className="font-bold text-sm text-stone-900 leading-snug line-clamp-1">
                      {product.name}
                    </h3>
                  </div>
                  {product.modifiers && product.modifiers.length > 0 && (product.askModifiersOnSelection ?? true) && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/80 mb-1">
                      <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                      <span>{product.modifiers.length} Adicionales</span>
                    </span>
                  )}
                  <p className="text-[11px] text-stone-500 line-clamp-1">
                    {product.description}
                  </p>
                </div>

                {/* Price and Add button */}
                <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-stone-400 font-medium">₡</span>
                    <span className="text-base font-extrabold text-amber-700 ml-0.5">
                      {(product.price || 0).toLocaleString('es-CR')}
                    </span>
                  </div>
                  <span className="w-7 h-7 rounded-lg bg-amber-100 group-hover:bg-amber-600 text-amber-800 group-hover:text-white flex items-center justify-center transition-colors shadow-xs">
                    <Plus className="w-4 h-4" />
                  </span>
                </div>
              </button>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="col-span-full py-12 text-center text-stone-400">
              <AlertCircle className="w-10 h-10 mx-auto text-stone-300 mb-2" />
              <p className="font-medium text-sm">No se encontraron productos en esta categoría o búsqueda.</p>
            </div>
          )}
        </div>

        {/* Product Grid Pagination Footer */}
        {filteredProducts.length > productsPerPage && (
          <div className="px-4 py-2.5 bg-white border-t border-stone-200 flex items-center justify-between text-xs text-stone-600">
            <span>Página {productPage} de {totalProductPages} ({filteredProducts.length} platillos)</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setProductPage(p => Math.max(1, p - 1))}
                disabled={productPage === 1}
                className={`px-3 py-1 rounded-lg border font-bold transition-all ${
                  productPage === 1 ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed' : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50 cursor-pointer'
                }`}
              >
                Anterior
              </button>
              <button
                onClick={() => setProductPage(p => Math.min(totalProductPages, p + 1))}
                disabled={productPage >= totalProductPages}
                className={`px-3 py-1 rounded-lg border font-bold transition-all ${
                  productPage >= totalProductPages ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed' : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50 cursor-pointer'
                }`}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ----------------- RIGHT: ORDER & CART SUMMARY ----------------- */}
      <section className="w-full lg:w-96 bg-white border-l border-stone-200 flex flex-col shrink-0 shadow-lg lg:shadow-none h-auto lg:h-full">
        
        {/* Terminal / Device selector strip */}
        <div className="px-3 py-1.5 bg-amber-900 text-white flex items-center justify-between text-xs border-b border-amber-950">
          <div className="flex items-center gap-1.5 font-bold">
            <Smartphone className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-amber-200 font-normal">Terminal:</span>
            <span className="text-white truncate max-w-[140px]">{terminalName}</span>
          </div>
          <button
            id="change-terminal-btn"
            onClick={() => setIsDeviceModalOpen(true)}
            className="text-[11px] bg-amber-800 hover:bg-amber-700 px-2 py-0.5 rounded font-semibold text-amber-100 transition-colors"
          >
            Cambiar Dispositivo
          </button>
        </div>

        {/* Customer & Order Type Selector */}
        <div className="p-3 border-b border-stone-200 bg-stone-50/80 space-y-2">
          {/* Customer Selection Pill */}
          <div className="relative">
            <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-stone-200 shadow-xs">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <div className="text-xs font-bold text-stone-900 truncate">
                    {selectedCustomer.name}
                  </div>
                  <div className="text-[10px] text-stone-500 truncate">
                    Céd: {selectedCustomer.identification} • {selectedCustomer.fiscalCondition || 'Receptor'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  id="change-customer-btn"
                  onClick={() => setCustomerSearchOpen(!customerSearchOpen)}
                  className="px-2 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                >
                  Cambiar
                </button>
                <button
                  id="add-customer-quick-btn"
                  onClick={onAddNewCustomer}
                  className="p-1 text-stone-500 hover:text-amber-700 rounded-lg hover:bg-stone-100"
                  title="Registrar Nuevo Cliente"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Customer Dropdown search */}
            {customerSearchOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-stone-200 rounded-xl shadow-xl p-2 max-h-72 overflow-y-auto space-y-1.5">
                <div className="sticky top-0 bg-white pb-1 border-b border-stone-100 z-10">
                  <input
                    type="text"
                    placeholder="Buscar por nombre, cédula o teléfono..."
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-stone-100 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                    autoFocus
                  />
                  <div className="flex justify-between items-center text-[10px] text-stone-400 mt-1 px-1">
                    <span>{filteredCustomers.length} clientes encontrados</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const def = customers.find(c => 
                            c.name.toLowerCase().includes('contado') || 
                            c.name.toLowerCase().includes('consumidor') ||
                            c.identification === '000000000' ||
                            c.identification === '100000000'
                          ) || customers[0];
                          if (def) setSelectedCustomer(def);
                          setCustomerSearchOpen(false);
                          setCustomerQuery('');
                        }}
                        className="text-emerald-700 font-bold hover:underline"
                      >
                        Restablecer a Contado
                      </button>
                      <button 
                        type="button"
                        onClick={() => setCustomerSearchOpen(false)} 
                        className="text-amber-700 font-bold hover:underline"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  {filteredCustomers.slice(0, 30).map(cust => (
                    <button
                      key={cust.id}
                      onClick={() => {
                        setSelectedCustomer(cust);
                        setCustomerSearchOpen(false);
                        setCustomerQuery('');
                      }}
                      className="w-full text-left p-1.5 hover:bg-amber-50 rounded-lg flex items-center justify-between text-xs transition-colors cursor-pointer"
                    >
                      <div className="truncate pr-2">
                        <div className="font-semibold text-stone-900 truncate">{cust.name}</div>
                        <div className="text-[10px] text-stone-500 flex items-center gap-1.5">
                          <span className="font-mono font-bold text-stone-700">{cust.identification}</span>
                          <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                            cust.identificationType === '02' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {cust.identificationType === '02' ? 'Jurídica' : 'Física'}
                          </span>
                          {cust.phone && <span>• {cust.phone}</span>}
                        </div>
                      </div>
                      {selectedCustomer.id === cust.id && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                    </button>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <div className="p-3 text-center text-xs text-stone-400">
                      No se encontró ningún cliente con ese criterio.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Order Type (Comer acá / Llevar / Express) */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              id="order-type-dine-in"
              onClick={() => setOrderType('DINE_IN')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                orderType === 'DINE_IN'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Comer acá</span>
            </button>
            <button
              id="order-type-take-out"
              onClick={() => setOrderType('TAKE_OUT')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                orderType === 'TAKE_OUT'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Llevar</span>
            </button>
            <button
              id="order-type-delivery"
              onClick={() => setOrderType('DELIVERY')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                orderType === 'DELIVERY'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Express</span>
            </button>
          </div>

          {/* Nombre de Comanda para Control Interno (Cocina y Tiquete POS) */}
          <div className="pt-1">
            <div className="relative flex items-center">
              <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-700 pointer-events-none" />
              <input
                id="custom-order-name-input"
                type="text"
                value={customOrderName}
                onChange={(e) => setCustomOrderName(e.target.value)}
                placeholder="Nombre comanda (ej: 'Juan Carlos', 'Familia Pérez')..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-amber-50/70 hover:bg-amber-50 border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-stone-900 placeholder:text-stone-400 transition-colors"
                title="Nombre opcional para control interno de cocina y tiquete POS (no se envía a Hacienda)"
              />
              {customOrderName && (
                <button
                  type="button"
                  onClick={() => setCustomOrderName('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 text-xs font-bold p-0.5"
                  title="Borrar nombre"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Notificación de Pedidos en Pausa */}
        {pausedOrders && pausedOrders.length > 0 && (
          <div className="px-3 pt-2">
            <button
              type="button"
              id="open-paused-orders-banner-btn"
              onClick={() => setIsPausedModalOpen(true)}
              className="w-full flex items-center justify-between p-2 rounded-xl bg-amber-100/90 border border-amber-300 text-amber-950 hover:bg-amber-200/90 transition-all shadow-xs group"
            >
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-700"></span>
                </span>
                <span className="font-extrabold text-xs">
                  ⏸️ {pausedOrders.length} {pausedOrders.length === 1 ? 'Pedido en Pausa' : 'Pedidos en Pausa'}
                </span>
              </div>
              <span className="text-[11px] font-bold text-amber-900 bg-white/80 px-2 py-0.5 rounded-lg border border-amber-200 group-hover:bg-white transition-colors">
                Ver / Reanudar →
              </span>
            </button>
          </div>
        )}

        {/* Cart Item List */}
        <div className="flex-1 p-3 overflow-y-auto space-y-2 max-h-[36vh] lg:max-h-none">
          {cart.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-stone-400 text-center p-4">
              <ShoppingBag className="w-10 h-10 text-stone-300 mb-2" />
              <p className="font-medium text-xs">El carrito está vacío</p>
              <p className="text-[11px] text-stone-400 mt-1">Selecciona productos de la carta para comenzar la orden.</p>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div
                key={`${item.productId}-${idx}`}
                className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/80 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-bold text-xs text-stone-900">{item.name}</div>
                    <div className="text-[11px] text-stone-500">
                      ₡{(item.price || 0).toLocaleString('es-CR')} c/u
                    </div>
                  </div>
                  <div className="font-extrabold text-xs text-amber-900">
                    ₡{((item.price || 0) * (item.quantity || 1)).toLocaleString('es-CR')}
                  </div>
                </div>

                {/* Modifiers & notes display */}
                {item.modifiers && item.modifiers.length > 0 && (
                  <div className="text-[10px] text-amber-800 bg-amber-100/60 px-2 py-0.5 rounded">
                    + {item.modifiers.map(m => m.name).join(', ')}
                  </div>
                )}
                {item.notes && (
                  <div className="text-[10px] text-stone-600 italic bg-white px-2 py-0.5 rounded border border-stone-200">
                    "{item.notes}"
                  </div>
                )}

                {/* Quantity Controls & Delete */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1 bg-white border border-stone-300 rounded-lg p-0.5">
                    <button
                      onClick={() => updateQuantity(idx, -1)}
                      className="w-6 h-6 rounded flex items-center justify-center text-stone-600 hover:bg-stone-100"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-7 text-center font-bold text-xs text-stone-800">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(idx, 1)}
                      className="w-6 h-6 rounded flex items-center justify-center text-stone-600 hover:bg-stone-100"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => removeItem(idx)}
                    className="p-1 text-stone-400 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pricing Totals & Action Buttons */}
        <div className="p-3.5 bg-stone-50 border-t border-stone-200 space-y-3">
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-stone-600">
              <span>Subtotal:</span>
              <span>₡{(subtotal || 0).toLocaleString('es-CR')}</span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>IVA (13% Costa Rica):</span>
              <span>₡{(taxTotal || 0).toLocaleString('es-CR')}</span>
            </div>
            <div className="flex justify-between text-base font-extrabold text-stone-900 pt-1.5 border-t border-stone-200">
              <span>TOTAL:</span>
              <span className="text-amber-700">₡{(total || 0).toLocaleString('es-CR')}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <button
              id="pause-order-btn"
              type="button"
              onClick={onPauseOrder}
              disabled={cart.length === 0}
              className="py-2.5 px-1 bg-amber-100/90 hover:bg-amber-200 disabled:opacity-40 disabled:cursor-not-allowed text-amber-950 text-[11.5px] font-bold rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1 border border-amber-300/80 active:scale-95"
              title="Pausar el cobro de este pedido para atender a otro cliente y reanudarlo después"
            >
              <PauseCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Pausar</span>
            </button>

            <button
              id="send-to-kitchen-btn"
              type="button"
              onClick={onSendToKitchen}
              disabled={cart.length === 0 || Boolean(isSendingToKitchen)}
              className={`py-2.5 px-1 ${
                isKitchenSent 
                  ? 'bg-emerald-700 hover:bg-emerald-600 text-white ring-2 ring-emerald-400 shadow-sm active:scale-95' 
                  : isSendingToKitchen
                    ? 'bg-stone-700 text-stone-300 cursor-wait'
                    : 'bg-stone-800 hover:bg-stone-900 text-white active:scale-95'
              } disabled:opacity-50 disabled:cursor-not-allowed text-[11.5px] font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1`}
              title={
                isKitchenSent 
                  ? "Comanda activa en cocina. Presiona para actualizar los productos agregados en el KDS sin duplicar." 
                  : isSendingToKitchen
                    ? "Enviando comanda a cocina..."
                    : "Enviar comanda a la pantalla de cocina (KDS)"
              }
            >
              {isSendingToKitchen ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-amber-300 border-t-transparent rounded-full animate-spin shrink-0"></span>
                  <span>Enviando...</span>
                </>
              ) : isKitchenSent ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-200 shrink-0 stroke-[3]" />
                  <span>Actualizar Cocina</span>
                </>
              ) : (
                <>
                  <Utensils className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>A Cocina</span>
                </>
              )}
            </button>

            <button
              id="checkout-and-invoice-btn"
              type="button"
              onClick={onOpenPaymentModal}
              disabled={cart.length === 0 || Boolean(isSendingToKitchen)}
              className="py-2.5 px-1 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11.5px] font-extrabold rounded-xl transition-all shadow-md flex items-center justify-center gap-1 active:scale-95"
              title={isKitchenSent ? "Actualizar comanda en cocina y proceder al cobro" : "Enviar a cocina y proceder al cobro"}
            >
              <span>Cobrar</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>

          {/* Pedidos Retenidos / Suspendidos para Retomar */}
          {pausedOrders.length > 0 && (
            <div className="pt-2 border-t border-stone-200 mt-2 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                <span className="flex items-center gap-1">
                  <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Cuentas Suspendidas ({pausedOrders.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsPausedModalOpen(true)}
                  className="text-amber-700 hover:text-amber-800 text-[10px] lowercase font-bold"
                >
                  ver lista completa
                </button>
              </div>
              <div className="flex gap-1.5 overflow-x-auto py-1 scrollbar-thin scrollbar-thumb-stone-300">
                {pausedOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => onResumePausedOrder(order)}
                    className="flex-shrink-0 flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg px-2.5 py-1 text-left text-[11px] font-bold text-amber-950 transition-all active:scale-95 shadow-2xs hover:border-amber-400"
                    title={`Haga clic para retomar el pedido de ${order.customOrderName}`}
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                    <div className="max-w-[110px] truncate text-[11px] font-black">
                      {order.customOrderName}
                    </div>
                    <span className="text-[10px] text-amber-700 font-extrabold font-mono shrink-0">
                      ₡{order.total.toLocaleString('es-CR')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ----------------- MODIFIER & NOTES MODAL ----------------- */}
      {selectedProductForMod && (() => {
        const modSum = selectedModifiers.reduce((s, m) => s + m.price, 0);
        const itemUnitPrice = selectedProductForMod.price + modSum;
        const itemTotalPrice = itemUnitPrice * modQuantity;
        
        // OBSERVACIONES OFICIALES CREADAS POR EL ADMINISTRADOR (Cero notas inventadas por el sistema)
        const applicableObservations = kitchenObservations.filter(
          obs => obs.active && (!obs.categoryId || obs.categoryId === selectedProductForMod.categoryId)
        );

        return (
          <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-3">
                  <img
                    src={getLocalProductImage(selectedProductForMod.image, selectedProductForMod.categoryId, selectedProductForMod.name, selectedProductForMod.sku)}
                    alt={selectedProductForMod.name}
                    className="w-12 h-12 rounded-xl object-cover border border-stone-200 shrink-0 bg-stone-100"
                    decoding="async"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/images/products/pollo-crujiente.svg'; }}
                  />
                  <div>
                    <h3 className="font-extrabold text-base text-stone-900 leading-tight">
                      {selectedProductForMod.name}
                    </h3>
                    <p className="text-xs text-amber-700 font-bold mt-0.5">
                      Base: ₡{(selectedProductForMod.price || 0).toLocaleString('es-CR')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedProductForMod(null)}
                  className="text-stone-400 hover:text-stone-600 text-lg font-bold p-1 rounded-lg hover:bg-stone-100"
                >
                  ✕
                </button>
              </div>

              {/* Extras / Modifiers */}
              {selectedProductForMod.modifiers && selectedProductForMod.modifiers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-stone-700 uppercase tracking-wide flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      <span>Adicionales de la Receta</span>
                    </label>
                    <span className="text-[10px] text-stone-500 font-medium">Selecciona los que apliquen</span>
                  </div>
                  <div className="space-y-1.5">
                    {selectedProductForMod.modifiers.map(mod => {
                      const isChecked = selectedModifiers.some(m => m.id === mod.id);
                      return (
                        <button
                          key={mod.id}
                          type="button"
                          onClick={() => toggleModifier(mod)}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium transition-all ${
                            isChecked 
                              ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold shadow-xs' 
                              : 'bg-stone-50/80 border-stone-200 text-stone-700 hover:bg-stone-100'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={`w-4 h-4 rounded-md flex items-center justify-center text-white transition-colors ${isChecked ? 'bg-amber-600' : 'border border-stone-300 bg-white'}`}>
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </span>
                            <span className="text-left">{mod.name}</span>
                          </div>
                          <span className={`font-mono font-bold ${mod.price > 0 ? (isChecked ? 'text-amber-800' : 'text-stone-600') : 'text-emerald-700'}`}>
                            {mod.price > 0 ? `+₡${(mod.price || 0).toLocaleString('es-CR')}` : '₡0'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Kitchen Notes */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wide flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                  <span>Observaciones para Cocina</span>
                </label>
                
                {/* Botones de observaciones creadas por el administrador */}
                {applicableObservations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {applicableObservations.map((obs) => {
                      const active = itemNote.includes(obs.text);
                      return (
                        <button
                          key={obs.id}
                          type="button"
                          onClick={() => {
                            if (active) {
                              setItemNote(itemNote.replace(obs.text, '').replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim());
                            } else {
                              setItemNote(itemNote ? `${itemNote}, ${obs.text}` : obs.text);
                            }
                          }}
                          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                            active
                              ? 'bg-amber-600 text-white border-amber-600 font-bold shadow-xs'
                              : 'bg-stone-100 text-stone-700 border-stone-200 hover:bg-stone-200'
                          }`}
                        >
                          {active ? `✓ ${obs.text}` : obs.text}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Espacio para escribir observación manual */}
                <input
                  type="text"
                  placeholder="Escribir observación manual para cocina (opcional)..."
                  value={itemNote}
                  onChange={(e) => setItemNote(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-stone-50 focus:bg-white"
                />
              </div>

              {/* Quantity Stepper & Price Calculation */}
              <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-stone-500 block">Cantidad</span>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setModQuantity(Math.max(1, modQuantity - 1))}
                      className="w-7 h-7 rounded-lg bg-white border border-stone-300 flex items-center justify-center font-bold text-stone-700 hover:bg-stone-100 active:scale-95 transition-transform"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-extrabold text-sm text-stone-900 w-6 text-center">{modQuantity}</span>
                    <button
                      type="button"
                      onClick={() => setModQuantity(modQuantity + 1)}
                      className="w-7 h-7 rounded-lg bg-white border border-stone-300 flex items-center justify-center font-bold text-stone-700 hover:bg-stone-100 active:scale-95 transition-transform"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-stone-500 block">Total con Adicionales</span>
                  <div className="text-lg font-black text-amber-900 mt-0.5">
                    ₡{(itemTotalPrice || 0).toLocaleString('es-CR')}
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setSelectedProductForMod(null)}
                  className="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  id="confirm-add-modifier-btn"
                  onClick={handleConfirmModifiers}
                  className="px-5 py-2.5 text-xs font-black bg-amber-600 hover:bg-amber-500 text-white rounded-xl shadow-md flex items-center gap-1.5 transition-all active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar a la Orden (₡{(itemTotalPrice || 0).toLocaleString('es-CR')})</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ----------------- DEVICE / TERMINAL SELECTOR MODAL ----------------- */}
      {isDeviceModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-600" />
                <h3 className="font-extrabold text-base text-stone-900">
                  Identificador del Dispositivo
                </h3>
              </div>
              <button
                onClick={() => setIsDeviceModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Define el nombre de este celular, tablet o computadora para identificar quién ingresó cada comanda en cocina y facturación.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 uppercase">Preajustes Rápidos</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  'Caja Principal',
                  'Móvil Salonero 1',
                  'Móvil Salonero 2',
                  'Móvil Salonero 3',
                  'Tablet Salonero 1',
                  'Tablet Mesa',
                  'Barra / Terraza',
                  'Caja 2 Auxiliar'
                ].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setTerminalName(preset);
                      try {
                        localStorage.setItem('sabor_cervanteno_terminal_name', preset);
                      } catch {}
                      setIsDeviceModalOpen(false);
                    }}
                    className={`p-2 text-xs font-bold rounded-xl border text-left transition-all ${
                      terminalName === preset 
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs' 
                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-amber-50 hover:border-amber-300'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1 pt-2">
              <label className="text-xs font-bold text-stone-700 uppercase">Nombre Personalizado</label>
              <input
                type="text"
                value={terminalName}
                onChange={(e) => {
                  setTerminalName(e.target.value);
                  try {
                    localStorage.setItem('sabor_cervanteno_terminal_name', e.target.value);
                  } catch {}
                }}
                placeholder="Ej: Celular Carlos / Tablet 4"
                className="w-full px-3 py-2 text-xs font-bold border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsDeviceModalOpen(false)}
                className="px-5 py-2 text-xs font-extrabold bg-amber-600 hover:bg-amber-500 text-white rounded-xl shadow-md"
              >
                Guardar Dispositivo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL DE PEDIDOS EN PAUSA ----------------- */}
      {isPausedModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-stone-200 animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="p-4 bg-stone-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-black">
                  <PauseCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                    <span>Pedidos con Cobro Pausado</span>
                    <span className="text-xs bg-amber-400/20 text-amber-300 font-mono px-2 py-0.5 rounded-full border border-amber-400/30">
                      {pausedOrders.length} {pausedOrders.length === 1 ? 'pedido' : 'pedidos'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-stone-300">
                    Cuentas retenidas temporalmente para continuar atendiendo. Puedes reanudar su cobro en cualquier momento.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPausedModalOpen(false)}
                className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of Paused Orders */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-stone-50">
              {pausedOrders.length === 0 ? (
                <div className="py-12 text-center text-stone-400 flex flex-col items-center justify-center">
                  <PauseCircle className="w-12 h-12 text-stone-300 mb-2" />
                  <p className="font-bold text-sm text-stone-600">No hay pedidos en pausa</p>
                  <p className="text-xs text-stone-400 mt-1 max-w-xs">
                    Cuando tengas un cliente indeciso o una mesa abierta, presiona "Pausar" en el carrito para guardarlo aquí.
                  </p>
                </div>
              ) : (
                pausedOrders.map((order) => {
                  const itemsCount = order.items.reduce((s, i) => s + i.quantity, 0);
                  const timeFormatted = new Date(order.createdAt).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-xl border-2 border-stone-200 hover:border-amber-400 p-3.5 transition-all shadow-xs space-y-2.5"
                    >
                      {/* Top Row: Comanda Name, Type & Origin */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black bg-stone-900 text-amber-400 px-2 py-0.5 rounded-md">
                            #{order.orderNumber || 'P'}
                          </span>
                          {order.customOrderName ? (
                            <span className="font-black text-xs text-stone-900 bg-amber-100 text-amber-950 px-2 py-0.5 rounded-md border border-amber-300 flex items-center gap-1">
                              <Tag className="w-3 h-3 text-amber-700" />
                              <span>{order.customOrderName}</span>
                            </span>
                          ) : (
                            <span className="font-bold text-xs text-stone-700">
                              {order.orderType === 'DINE_IN' ? 'Comer acá' : order.orderType === 'TAKE_OUT' ? 'Para Llevar' : 'Express'}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-stone-500 font-medium">
                          <span className="flex items-center gap-1 bg-stone-100 px-2 py-0.5 rounded">
                            <Clock className="w-3 h-3 text-stone-400" />
                            <span>Pausado {timeFormatted}</span>
                          </span>
                          {order.terminalName && (
                            <span className="bg-stone-100 px-2 py-0.5 rounded font-mono text-[10px]">
                              📱 {order.terminalName}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Middle: Customer and Item Details */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div>
                          <div className="text-stone-600 font-medium">
                            Cliente: <strong className="text-stone-900">{order.customer?.name || 'Cliente General'}</strong>
                          </div>
                          <div className="text-stone-500 text-[11px] mt-0.5 line-clamp-1">
                            {order.items.map(i => `${i.quantity}x ${i.name}`).join(' • ')}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-[10px] text-stone-400 uppercase font-bold">Total a Cobrar</div>
                          <div className="text-base font-black text-amber-700">
                            ₡{order.total.toLocaleString('es-CR')}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-stone-100">
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`¿Descartar y eliminar el pedido #${order.orderNumber || ''} de la lista de pausa?`)) {
                              onDeletePausedOrder(order.id);
                            }
                          }}
                          className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors text-xs font-bold flex items-center gap-1"
                          title="Eliminar este pedido pausado"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Descartar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onResumePausedOrder(order);
                            setIsPausedModalOpen(false);
                          }}
                          className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors border border-stone-300"
                        >
                          <Play className="w-3.5 h-3.5 text-stone-700 fill-stone-700" />
                          <span>Cargar en Carrito</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onResumePausedOrder(order);
                            setIsPausedModalOpen(false);
                            setTimeout(() => {
                              onOpenPaymentModal();
                            }, 50);
                          }}
                          className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-colors"
                        >
                          <span>Cobrar Ahora</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-stone-100 border-t border-stone-200 flex justify-between items-center text-xs text-stone-500">
              <span>{pausedOrders.length} pedido(s) guardados localmente</span>
              <button
                type="button"
                onClick={() => setIsPausedModalOpen(false)}
                className="px-4 py-1.5 bg-stone-800 text-white font-bold rounded-xl hover:bg-stone-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
