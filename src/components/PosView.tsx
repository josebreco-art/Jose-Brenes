import React, { useState, useMemo } from 'react';
import { 
  Product, 
  Category, 
  Customer, 
  Sale, 
  SaleItem, 
  UserProfile 
} from '../types/pos';
import { 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  User, 
  CreditCard, 
  Banknote, 
  Smartphone, 
  CheckCircle, 
  ChefHat, 
  Printer, 
  Percent,
  Receipt,
  Utensils
} from 'lucide-react';
import { PosApiService } from '../services/api';

interface PosViewProps {
  products: Product[];
  categories: Category[];
  customers: Customer[];
  currentUser: UserProfile | null;
  onSaleCreated: (sale: Sale) => void;
}

export const PosView: React.FC<PosViewProps> = ({
  products,
  categories,
  customers,
  currentUser,
  onSaleCreated
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [orderType, setOrderType] = useState<'MESA' | 'LLEVAR' | 'EXPRESS'>('MESA');
  const [tableNumber, setTableNumber] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'EFECTIVO' | 'TARJETA' | 'SINPE'>('EFECTIVO');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (!p.active) return false;
      const matchCat = selectedCategoryId === 'all' || p.categoryId === selectedCategoryId;
      const matchSearch = !searchQuery || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [products, selectedCategoryId, searchQuery]);

  // Totals
  const subtotal = useMemo(() => cart.reduce((acc, it) => acc + (it.unitPrice * it.quantity), 0), [cart]);
  const taxTotal = useMemo(() => cart.reduce((acc, it) => acc + (it.taxAmount * it.quantity), 0), [cart]);
  const total = useMemo(() => subtotal + taxTotal, [subtotal, taxTotal]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      const unitPrice = Math.round(product.price / (1 + product.taxRate));
      const taxAmount = product.price - unitPrice;
      return [...prev, {
        id: `item-${Date.now()}-${Math.random()}`,
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice,
        taxRate: product.taxRate,
        discount: 0,
        subtotal: unitPrice,
        taxAmount,
        total: product.price,
        cabysCode: product.cabysCode
      }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.productId === productId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean) as SaleItem[];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(i => i.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setAmountPaid('');
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    try {
      const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
      const paid = parseFloat(amountPaid) || total;
      const change = Math.max(0, paid - total);

      const saleData: Partial<Sale> = {
        items: cart,
        subtotal,
        discount: 0,
        taxTotal,
        total,
        amountPaid: paid,
        change,
        payments: [{ method: paymentMethod, amount: total }],
        orderType,
        tableNumber: orderType === 'MESA' ? tableNumber : '',
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer ? selectedCustomer.name : 'Cliente de Contado',
        customerEmail: selectedCustomer?.email,
        customerPhone: selectedCustomer?.phone,
        customerIdentification: selectedCustomer ? selectedCustomer.identification : '000000000',
        customerIdentificationType: selectedCustomer ? selectedCustomer.identificationType : '01',
        cashierId: currentUser?.id || 'usr-admin',
        cashierName: currentUser?.name || 'Administrador'
      };

      const completed = await PosApiService.createSale(saleData);
      setLastCompletedSale(completed);
      onSaleCreated(completed);
      clearCart();
    } catch (err: any) {
      alert('Error al registrar venta: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-stone-100">
      
      {/* Left: Product Catalog */}
      <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-stone-200">
        
        {/* Search & Categories Bar */}
        <div className="p-3 bg-white border-b border-stone-200 space-y-2 shrink-0 shadow-xs">
          
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar combos, piezas de pollo, bebidas..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-stone-100 border border-stone-200 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
              />
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-3 py-2 text-xs font-bold text-stone-500 hover:text-stone-800 bg-stone-100 rounded-xl"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Categories Pill Slider */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            <button
              onClick={() => setSelectedCategoryId('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategoryId === 'all'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              Todos ({products.length})
            </button>
            {categories.filter(c => c.active).map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategoryId === cat.id
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

        </div>

        {/* Product Grid */}
        <div className="flex-1 p-3 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 content-start">
          {filteredProducts.map(product => {
            const inCart = cart.find(i => i.productId === product.id);
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => addToCart(product)}
                className="group relative flex flex-col text-left bg-white rounded-2xl p-2.5 border border-stone-200 hover:border-amber-400 hover:shadow-md active:scale-98 transition-all cursor-pointer overflow-hidden"
              >
                {inCart && (
                  <span className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-amber-600 text-white text-xs font-black flex items-center justify-center shadow-xs">
                    {inCart.quantity}
                  </span>
                )}
                
                <div className="w-full h-24 rounded-xl bg-amber-50 mb-2 overflow-hidden flex items-center justify-center relative">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-3xl">🍗</span>
                  )}
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-stone-900/70 text-amber-300 text-[10px] font-mono font-bold backdrop-blur-xs">
                    {product.unit}
                  </span>
                </div>

                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-xs text-stone-900 line-clamp-1 leading-snug">
                      {product.name}
                    </h3>
                    {product.description && (
                      <p className="text-[10px] text-stone-500 line-clamp-1 mt-0.5">
                        {product.description}
                      </p>
                    )}
                  </div>
                  
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-black text-amber-950 font-mono">
                      ₡{Math.round(product.price).toLocaleString('es-CR')}
                    </span>
                    <span className="p-1 rounded-lg bg-amber-100 text-amber-900 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

      </div>

      {/* Right: Active Cart & Checkout Panel */}
      <div className="w-full md:w-96 bg-white border-l border-stone-200 flex flex-col h-full shadow-lg shrink-0">
        
        {/* Cart Header with Order Type */}
        <div className="p-3 border-b border-stone-200 space-y-2 bg-stone-50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-amber-700" />
              Comanda Activa
            </span>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
              >
                Vaciar ({cart.reduce((a, b) => a + b.quantity, 0)})
              </button>
            )}
          </div>

          {/* Order Type Toggle */}
          <div className="grid grid-cols-3 gap-1 bg-stone-200 p-0.5 rounded-xl text-xs font-bold">
            {(['MESA', 'LLEVAR', 'EXPRESS'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setOrderType(type)}
                className={`py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                  orderType === type
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-900'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Table number input if MESA */}
          {orderType === 'MESA' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-stone-600">Mesa #:</span>
              <input
                type="text"
                placeholder="Ej. 1, 2, Terraza..."
                value={tableNumber}
                onChange={e => setTableNumber(e.target.value)}
                className="flex-1 px-2.5 py-1 rounded-lg bg-white border border-stone-300 text-xs font-bold text-stone-800 focus:outline-hidden focus:border-amber-500"
              />
            </div>
          )}

          {/* Customer Selector */}
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <select
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
              className="flex-1 px-2 py-1 bg-white border border-stone-300 rounded-lg text-xs font-medium text-stone-700 focus:outline-hidden"
            >
              <option value="">Cliente de Contado (General)</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.identification})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Cart Item List */}
        <div className="flex-1 p-3 overflow-y-auto space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-stone-400 text-center p-4">
              <Utensils className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-xs font-bold text-stone-500">Comanda Vacía</p>
              <p className="text-[11px] text-stone-400 mt-0.5">Toca los productos de la izquierda para agregarlos al pedido</p>
            </div>
          ) : (
            cart.map(item => (
              <div
                key={item.id}
                className="p-2 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-stone-900 truncate">{item.productName}</div>
                  <div className="text-[11px] font-mono text-stone-500">
                    ₡{Math.round(item.unitPrice + item.taxAmount).toLocaleString('es-CR')} c/u
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.productId, -1)}
                    className="p-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-5 text-center font-black text-xs text-stone-900">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.productId, 1)}
                    className="p-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.productId)}
                    className="p-1 rounded-lg hover:bg-rose-100 text-stone-400 hover:text-rose-600 transition-colors ml-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Checkout Summary & Action */}
        <div className="p-3 border-t border-stone-200 bg-stone-50 space-y-2.5">
          
          {/* Payment Method Selector */}
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'EFECTIVO', label: 'Efectivo', icon: Banknote },
              { id: 'TARJETA', label: 'Tarjeta', icon: CreditCard },
              { id: 'SINPE', label: 'SINPE Móvil', icon: Smartphone }
            ].map(m => {
              const Icon = m.icon;
              const isSel = paymentMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id as any)}
                  className={`py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    isSel 
                      ? 'bg-amber-600 text-white shadow-xs' 
                      : 'bg-white border border-stone-300 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-[11px]">{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Total Breakdown */}
          <div className="space-y-1 text-xs text-stone-600 pt-1 border-t border-stone-200">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-mono">₡{Math.round(subtotal).toLocaleString('es-CR')}</span>
            </div>
            <div className="flex justify-between">
              <span>IVA (13%):</span>
              <span className="font-mono">₡{Math.round(taxTotal).toLocaleString('es-CR')}</span>
            </div>
            <div className="flex justify-between text-base font-black text-amber-950 pt-1 border-t border-stone-300">
              <span>TOTAL:</span>
              <span className="font-mono">₡{Math.round(total).toLocaleString('es-CR')}</span>
            </div>
          </div>

          {/* Checkout Button */}
          <button
            type="button"
            onClick={handleCheckout}
            disabled={cart.length === 0 || isProcessing}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 active:scale-98 text-white font-black text-sm shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{isProcessing ? 'Procesando & Transmitiendo...' : `Cobrar ₡${Math.round(total).toLocaleString('es-CR')}`}</span>
          </button>

        </div>

      </div>

      {/* Sale Success Popup */}
      {lastCompletedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl border border-stone-200">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-3">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-black text-stone-900">¡Venta Registrada!</h3>
            <p className="text-xs text-stone-500 mt-1">
              Orden #{lastCompletedSale.orderNumber} enviada a Cocina (KDS) y facturada
            </p>
            <div className="my-4 p-3 bg-stone-100 rounded-2xl text-left space-y-1 text-xs">
              <div className="flex justify-between text-stone-600">
                <span>Total Cobrado:</span>
                <span className="font-mono font-black text-stone-900">
                  ₡{Math.round(lastCompletedSale.total).toLocaleString('es-CR')}
                </span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Comprobante DGT:</span>
                <span className="font-mono text-emerald-700 font-bold">Tiquete Electrónico</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLastCompletedSale(null)}
              className="w-full py-2.5 rounded-xl bg-stone-900 text-white font-bold text-xs hover:bg-stone-800 transition-colors"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
