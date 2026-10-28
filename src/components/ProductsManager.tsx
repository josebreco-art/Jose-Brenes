import React, { useState, useEffect } from 'react';
import { 
  UtensilsCrossed, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Check, 
  Tag, 
  DollarSign, 
  Layers, 
  AlertCircle,
  FileCode2,
  FolderTree,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  Image,
  Flame,
  ChefHat,
  Filter,
  SlidersHorizontal,
  PlusCircle,
  X,
  MessageSquare,
  ShieldCheck,
  Building2,
  Upload,
  Loader2,
  Cloud,
  RefreshCw,
  Download,
  FileSpreadsheet,
  FileDown,
  FolderDown
} from 'lucide-react';
import { Product, Category, KitchenStation, ProductModifier, CabysItem, KitchenObservation } from '../types/pos';
import { PosApiService } from '../services/api';
import { OFFICIAL_CABYS_CATALOG, OFFICIAL_TAX_RATES, HACIENDA_UNITS_OF_MEASURE, calculateFiscalPriceBreakdown } from '../server/taxRules';
import { LOCAL_PRODUCT_IMAGES, getLocalProductImage } from '../utils/productImages';

// ProductsManager
interface ProductsManagerProps {
  products: Product[];
  categories: Category[];
  onSaveProduct: (p: Product) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onSaveCategory?: (c: Category) => Promise<void>;
  onDeleteCategory?: (id: string) => Promise<void>;
}

export const ProductsManager: React.FC<ProductsManagerProps> = ({
  products,
  categories,
  onSaveProduct,
  onDeleteProduct,
  onSaveCategory,
  onDeleteCategory
}) => {
  const [activeTab, setActiveTab] = useState<'PRODUCTS' | 'CATEGORIES' | 'OBSERVATIONS'>('PRODUCTS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');

  // Observations state
  const [observations, setObservations] = useState<KitchenObservation[]>([]);
  const [obsSearchQuery, setObsSearchQuery] = useState<string>('');
  const [obsCategoryFilter, setObsCategoryFilter] = useState<string>('ALL');
  const [editingObs, setEditingObs] = useState<KitchenObservation | null>(null);
  const [isCreatingObs, setIsCreatingObs] = useState<boolean>(false);
  const [obsFormText, setObsFormText] = useState<string>('');
  const [obsFormCategory, setObsFormCategory] = useState<string>('');
  const [obsFormActive, setObsFormActive] = useState<boolean>(true);
  const [isSavingObs, setIsSavingObs] = useState<boolean>(false);

  // Product modal state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isCreatingProduct, setIsCreatingProduct] = useState<boolean>(false);
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [customModName, setCustomModName] = useState<string>('');
  const [customModPrice, setCustomModPrice] = useState<number>(0);
  const [editingModId, setEditingModId] = useState<string | null>(null);

  // In-app deletion confirmation & notification states (immune to browser iframe popup blockers)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'product' | 'category' | 'observation';
    id: string;
    name: string;
    subtext?: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [modalAlertMessage, setModalAlertMessage] = useState<{ title: string; message: string } | null>(null);

  // Cloud catalog synchronization state
  const [isSyncingWithCloud, setIsSyncingWithCloud] = useState<boolean>(false);
  const [syncStatusMessage, setSyncStatusMessage] = useState<{ text: string; success: boolean } | null>(null);

  // Menu Backup and Export states
  const [showBackupModal, setShowBackupModal] = useState<boolean>(false);
  const [isRestoringMenu, setIsRestoringMenu] = useState<boolean>(false);
  const [menuBackupStatus, setMenuBackupStatus] = useState<{ text: string; success: boolean } | null>(null);
  const menuFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleDownloadMenuJson = () => {
    PosApiService.downloadMenuBackupJson();
    setMenuBackupStatus({ text: 'Iniciando descarga de respaldo en formato JSON...', success: true });
    setTimeout(() => setMenuBackupStatus(null), 4000);
  };

  const handleDownloadMenuCsv = () => {
    PosApiService.downloadMenuBackupCsv();
    setMenuBackupStatus({ text: 'Iniciando descarga de catálogo en formato Excel / CSV...', success: true });
    setTimeout(() => setMenuBackupStatus(null), 4000);
  };

  const handleImportMenuJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsRestoringMenu(true);
    setMenuBackupStatus(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await PosApiService.importMenuBackup(data);
      setMenuBackupStatus({
        text: res.message || 'Menú restaurado exitosamente.',
        success: true
      });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setMenuBackupStatus({
        text: err?.message || 'Error al procesar archivo de respaldo de menú.',
        success: false
      });
    } finally {
      setIsRestoringMenu(false);
      if (menuFileInputRef.current) {
        menuFileInputRef.current.value = '';
      }
    }
  };

  const handleSyncWithCloud = async () => {
    setIsSyncingWithCloud(true);
    setSyncStatusMessage(null);
    try {
      const res = await PosApiService.syncCatalogWithCloud();
      setSyncStatusMessage({
        text: res.message || 'Catálogo sincronizado exitosamente con la nube.',
        success: res.success
      });
      setTimeout(() => setSyncStatusMessage(null), 4000);
    } catch (err: any) {
      setSyncStatusMessage({
        text: err?.message || 'Error al sincronizar con la nube.',
        success: false
      });
      setTimeout(() => setSyncStatusMessage(null), 5000);
    } finally {
      setIsSyncingWithCloud(false);
    }
  };

  const processAndUploadImage = async (file: File) => {
    if (!file || !editingProduct) return;
    setIsUploadingImage(true);
    try {
      // 1. Leer el archivo como Data URL
      const rawDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 2. Comprimir y optimizar usando un elemento canvas (360x360 px, ~15-25 KB)
      const compressedDataUrl = await new Promise<string>((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 360;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_SIZE) {
              height = Math.round((height * MAX_SIZE) / width);
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width = Math.round((width * MAX_SIZE) / height);
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Probar WebP primero (más eficiente), fallback a JPEG
            try {
              const webpData = canvas.toDataURL('image/webp', 0.82);
              if (webpData.startsWith('data:image/webp')) {
                resolve(webpData);
                return;
              }
            } catch {
              // fallback to jpeg
            }
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          } else {
            resolve(rawDataUrl);
          }
        };
        img.onerror = () => resolve(rawDataUrl);
        img.src = rawDataUrl;
      });

      // 3. Asignar el Data URL directamente al producto para persistencia total en base de datos e IndexedDB
      setEditingProduct(prev => prev ? { ...prev, image: compressedDataUrl } : null);
    } catch (err) {
      console.error('Error procesando imagen local:', err);
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Category modal state
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isCreatingCategory, setIsCreatingCategory] = useState<boolean>(false);

  // CABYS Search Modal State (Loaded on-demand by keyword / 13-digit code)
  const [cabysModalOpen, setCabysModalOpen] = useState<boolean>(false);
  const [cabysSearchTerm, setCabysSearchTerm] = useState<string>('');
  const [cabysResults, setCabysResults] = useState<CabysItem[]>([]);
  const [cabysValidationInfo, setCabysValidationInfo] = useState<{ valid: boolean; message: string; officialDescription?: string }>({ valid: true, message: '' });

  // Update CABYS results only when a keyword is typed
  useEffect(() => {
    const term = cabysSearchTerm.trim().toLowerCase();
    if (!term || term.length < 2) {
      setCabysResults([]);
    } else {
      const filtered = OFFICIAL_CABYS_CATALOG.filter(c => 
        c.codigoCabys.includes(term) || 
        c.descripcionOficial.toLowerCase().includes(term) ||
        (c.categoria && c.categoria.toLowerCase().includes(term)) ||
        (c.subcategoria && c.subcategoria.toLowerCase().includes(term))
      );
      setCabysResults(filtered);
    }
  }, [cabysSearchTerm]);

  // Validate CABYS in real-time when editing product
  useEffect(() => {
    if (editingProduct?.cabysCode) {
      PosApiService.validateCabysCode(editingProduct.cabysCode).then(res => {
        setCabysValidationInfo(res);
      });
    }
  }, [editingProduct?.cabysCode]);

  // Cargar observaciones de cocina oficiales
  const loadKitchenObservations = async () => {
    try {
      const data = await PosApiService.getKitchenObservations();
      setObservations(data || []);
    } catch (e) {
      console.warn('Error loading observations:', e);
    }
  };

  useEffect(() => {
    loadKitchenObservations();
  }, []);

  // ----------------------------------------------------
  // OBSERVATION HANDLERS
  // ----------------------------------------------------
  const handleStartCreateObs = () => {
    setEditingObs({
      id: `obs-${Date.now()}`,
      text: '',
      categoryId: obsCategoryFilter !== 'ALL' ? obsCategoryFilter : '',
      active: true
    });
    setObsFormText('');
    setObsFormCategory(obsCategoryFilter !== 'ALL' ? obsCategoryFilter : '');
    setObsFormActive(true);
    setIsCreatingObs(true);
  };

  const handleStartEditObs = (obs: KitchenObservation) => {
    setEditingObs(obs);
    setObsFormText(obs.text);
    setObsFormCategory(obs.categoryId || '');
    setObsFormActive(obs.active);
    setIsCreatingObs(false);
  };

  const handleSaveObsForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsFormText.trim()) {
      setModalAlertMessage({
        title: 'Texto requerido',
        message: 'Por favor ingresa el texto de la observación (ej: "Sin cebolla", "Salsa aparte").'
      });
      return;
    }

    setIsSavingObs(true);
    try {
      const observationToSave: KitchenObservation = {
        id: editingObs ? editingObs.id : `obs-${Date.now()}`,
        text: obsFormText.trim(),
        categoryId: obsFormCategory ? obsFormCategory : undefined,
        active: obsFormActive,
        createdAt: editingObs?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const updated = await PosApiService.saveKitchenObservation(observationToSave);
      setObservations(updated);
      setEditingObs(null);
      setIsCreatingObs(false);
    } catch (err: any) {
      setModalAlertMessage({
        title: 'Error al guardar observación',
        message: err?.message || 'No se pudo guardar la observación en la base de datos.'
      });
    } finally {
      setIsSavingObs(false);
    }
  };

  const handleToggleObsActive = async (obs: KitchenObservation) => {
    try {
      const updatedObs: KitchenObservation = {
        ...obs,
        active: !obs.active,
        updatedAt: new Date().toISOString()
      };
      const updated = await PosApiService.saveKitchenObservation(updatedObs);
      setObservations(updated);
    } catch (err) {
      console.warn('Error toggling observation active state:', err);
    }
  };

  const handleDeleteObsClick = (obs: KitchenObservation) => {
    setDeleteConfirmTarget({
      type: 'observation',
      id: obs.id,
      name: obs.text,
      subtext: 'Esta nota rápida de cocina será eliminada de la base de datos y ya no aparecerá en caja.'
    });
  };

  // ----------------------------------------------------
  // PRODUCT HANDLERS
  // ----------------------------------------------------
  const initialNewProduct: Product = {
    id: `prod-${Date.now()}`,
    name: '',
    description: '',
    sku: `POL-${Math.floor(Math.random() * 900) + 100}`,
    commercialCode: `${Math.floor(Math.random() * 900) + 100}`,
    cabysCode: '6332000000000',
    itemType: 'SERVICIO',
    unitOfMeasure: 'Os',
    categoryId: categories[0]?.id || 'cat-pollo',
    station: 'PLANCHA_ARMADO',
    price: 3000,
    cost: 1500,
    taxRate: 0.13,
    isPriceWithTax: true,
    inventory: 50,
    unit: 'unidad',
    image: '/images/products/pollo-crujiente.svg',
    active: true,
    askModifiersOnSelection: true,
    modifiers: []
  };

  const handleStartCreateProduct = () => {
    setEditingProduct({ ...initialNewProduct, id: `prod-${Date.now()}` });
    setIsCreatingProduct(true);
    setCustomModName('');
    setCustomModPrice(0);
    setEditingModId(null);
  };

  const handleStartEditProduct = (product: Product) => {
    setEditingProduct({ 
      ...product,
      itemType: product.itemType || 'SERVICIO',
      unitOfMeasure: product.unitOfMeasure || (product.itemType === 'MERCANCIA' ? 'Unid' : 'Os'),
      commercialCode: product.commercialCode || product.sku || '',
      cabysCode: product.cabysCode || '6332000000000',
      isPriceWithTax: product.isPriceWithTax ?? true,
      modifiers: product.modifiers || [],
      askModifiersOnSelection: product.askModifiersOnSelection ?? ((product.modifiers && product.modifiers.length > 0) || false)
    });
    setIsCreatingProduct(false);
    setCustomModName('');
    setCustomModPrice(0);
    setEditingModId(null);
  };

  const handleAddOrUpdateModifier = (name: string, price: number) => {
    if (!editingProduct || !name.trim()) return;
    const currentModifiers = editingProduct.modifiers || [];
    
    if (editingModId) {
      // Modificando un adicional existente
      const updated = currentModifiers.map(m => 
        m.id === editingModId 
          ? { ...m, name: name.trim(), price: Math.max(0, price) }
          : m
      );
      setEditingProduct({
        ...editingProduct,
        modifiers: updated
      });
      setEditingModId(null);
    } else {
      // Creando nuevo adicional
      const newMod: ProductModifier = {
        id: `mod-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: name.trim(),
        price: Math.max(0, price)
      };
      setEditingProduct({
        ...editingProduct,
        modifiers: [...currentModifiers, newMod],
        askModifiersOnSelection: true
      });
    }
    setCustomModName('');
    setCustomModPrice(0);
  };

  const handleStartEditModifier = (mod: ProductModifier) => {
    setEditingModId(mod.id);
    setCustomModName(mod.name);
    setCustomModPrice(mod.price || 0);
  };

  const handleCancelEditModifier = () => {
    setEditingModId(null);
    setCustomModName('');
    setCustomModPrice(0);
  };

  const handleRemoveModifier = (id: string) => {
    if (!editingProduct) return;
    const currentModifiers = editingProduct.modifiers || [];
    const updated = currentModifiers.filter(m => m.id !== id);
    setEditingProduct({
      ...editingProduct,
      modifiers: updated,
      askModifiersOnSelection: updated.length > 0 ? (editingProduct.askModifiersOnSelection ?? true) : false
    });
    if (editingModId === id) {
      setEditingModId(null);
      setCustomModName('');
      setCustomModPrice(0);
    }
  };

  const handleSaveProductForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const enteredPrice = Number(editingProduct.price) || 0;
    const isWithTax = editingProduct.isPriceWithTax ?? true;
    const taxRate = Number(editingProduct.taxRate) ?? 0.13;
    const breakdown = calculateFiscalPriceBreakdown(enteredPrice, taxRate, isWithTax);

    const productToSave: Product = {
      ...editingProduct,
      price: breakdown.totalPrice,
      netPrice: breakdown.netPrice,
      taxAmount: breakdown.taxAmount,
      itemType: editingProduct.itemType || 'SERVICIO',
      unitOfMeasure: editingProduct.unitOfMeasure || (editingProduct.itemType === 'MERCANCIA' ? 'Unid' : 'Os'),
      commercialCode: (editingProduct.commercialCode && editingProduct.commercialCode.trim()) || editingProduct.sku,
      isPriceWithTax: isWithTax,
      updatedAt: new Date().toISOString()
    };

    await onSaveProduct(productToSave);
    setEditingProduct(null);
    setIsCreatingProduct(false);
  };

  const handleDeleteProductClick = (product: Product) => {
    setDeleteConfirmTarget({
      type: 'product',
      id: product.id,
      name: product.name,
      subtext: `Código: ${product.commercialCode || product.sku || 'N/A'} • Precio: ₡${(product.price || 0).toLocaleString('es-CR')}`
    });
  };

  // ----------------------------------------------------
  // CATEGORY HANDLERS
  // ----------------------------------------------------
  const initialNewCategory: Category = {
    id: `cat-${Date.now()}`,
    name: '',
    iconName: 'Utensils',
    sortOrder: (categories.length + 1) * 10,
    active: true
  };

  const handleStartCreateCategory = () => {
    setEditingCategory({ ...initialNewCategory });
    setIsCreatingCategory(true);
  };

  const handleStartEditCategory = (cat: Category) => {
    setEditingCategory({ ...cat });
    setIsCreatingCategory(false);
  };

  const handleSaveCategoryForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !onSaveCategory) return;
    await onSaveCategory(editingCategory);
    setEditingCategory(null);
    setIsCreatingCategory(false);
  };

  const handleDeleteCategoryClick = (cat: Category) => {
    const productsInCat = products.filter(p => p.categoryId === cat.id);
    if (productsInCat.length > 0) {
      setModalAlertMessage({
        title: 'Categoría con productos asignados',
        message: `No se puede eliminar la categoría "${cat.name}" porque contiene ${productsInCat.length} platillo(s) asociado(s). Primero debes reasignar o eliminar esos productos.`
      });
      return;
    }
    setDeleteConfirmTarget({
      type: 'category',
      id: cat.id,
      name: cat.name,
      subtext: 'Esta categoría no tiene productos asignados y será retirada permanentemente del menú.'
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      if (deleteConfirmTarget.type === 'product') {
        await onDeleteProduct(deleteConfirmTarget.id);
      } else if (deleteConfirmTarget.type === 'category') {
        if (onDeleteCategory) {
          await onDeleteCategory(deleteConfirmTarget.id);
        }
      } else if (deleteConfirmTarget.type === 'observation') {
        const updated = await PosApiService.deleteKitchenObservation(deleteConfirmTarget.id);
        setObservations(updated);
      }
      setDeleteConfirmTarget(null);
    } catch (err: any) {
      setModalAlertMessage({
        title: 'Error al eliminar',
        message: err?.message || 'Ocurrió un error al intentar eliminar el elemento.'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtrar platillos y categorías activos excluyendo eliminados (Soft-Deletion)
  const activeProducts = products.filter(p => !p.deletedAt);
  const activeCategories = categories.filter(c => !c.deletedAt);

  // Filter products by search and category
  const filteredProducts = activeProducts.filter(p => {
    const matchesSearch = 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.commercialCode && p.commercialCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.cabysCode && p.cabysCode.includes(searchQuery));
    const matchesCat = selectedCategoryFilter === 'ALL' || p.categoryId === selectedCategoryFilter;
    return matchesSearch && matchesCat;
  });

  // Filter observations by search and category
  const filteredObservations = observations.filter(obs => {
    const matchesSearch = obs.text.toLowerCase().includes(obsSearchQuery.toLowerCase());
    const matchesCat = obsCategoryFilter === 'ALL' || obs.categoryId === obsCategoryFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-100px)] overflow-hidden bg-stone-50 p-3 sm:p-4 space-y-3">
      
      {/* Header & Sub-Tab Switcher */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-800 rounded-xl">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-black text-base sm:text-lg text-stone-900 flex items-center gap-2 tracking-tight">
              <span>Administrador de Menú & Catálogo</span>
            </h2>
            <p className="text-xs text-stone-500">
              Cumplimiento Hacienda DGT v4.4: Códigos CABYS de 13 dígitos y sincronización inteligente con la nube.
            </p>
          </div>
        </div>

        {/* View Switcher Tabs & Cloud Sync Button */}
        <div className="flex flex-wrap items-center gap-2">
          {/* BOTÓN RESPALDO DEL MENÚ */}
          <button
            id="btn-menu-backup-modal-open"
            type="button"
            onClick={() => setShowBackupModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-xs bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-300 hover:border-amber-400 cursor-pointer"
            title="Descargar o restaurar respaldo de categorías y platillos del menú (JSON / Excel)"
          >
            <Download className="w-3.5 h-3.5 text-amber-700" />
            <span>Respaldo Menú</span>
          </button>

          <button
            onClick={handleSyncWithCloud}
            disabled={isSyncingWithCloud}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-xs ${
              isSyncingWithCloud
                ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed'
                : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-300 hover:border-amber-400'
            }`}
            title="Sincronizar catálogo con la nube Firestore (¡La nube manda en discrepancias!)"
          >
            <Cloud className={`w-3.5 h-3.5 ${isSyncingWithCloud ? 'animate-spin text-amber-600' : 'text-amber-600'}`} />
            <span>{isSyncingWithCloud ? 'Sincronizando...' : 'Sincronizar con Nube'}</span>
          </button>

          <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl border border-stone-200">
            <button
              id="tab-menu-products"
              onClick={() => setActiveTab('PRODUCTS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'PRODUCTS'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>Platillos ({activeProducts.length})</span>
            </button>

            <button
              id="tab-menu-categories"
              onClick={() => setActiveTab('CATEGORIES')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'CATEGORIES'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Categorías ({activeCategories.length})</span>
            </button>

            <button
              id="tab-menu-observations"
              onClick={() => setActiveTab('OBSERVATIONS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'OBSERVATIONS'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Observaciones de Cocina ({observations.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Cloud Sync Status Feedback Toast */}
      {syncStatusMessage && (
        <div className={`p-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-2 border shadow-xs transition-all ${
          syncStatusMessage.success
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-amber-50 text-amber-800 border-amber-200'
        }`}>
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{syncStatusMessage.text}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. PRODUCTS TAB VIEW                                                      */}
      {/* ========================================================================= */}
      {activeTab === 'PRODUCTS' && (
        <>
          {/* Action Bar (Search, Category Filter & Add Button) */}
          <div className="bg-white p-3 rounded-2xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="Buscar por platillo, cód. comercial, CABYS..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-medium"
                />
              </div>

              {/* Category Filter */}
              <div className="flex items-center gap-1 bg-stone-50 border border-stone-300 rounded-xl px-2.5 py-1">
                <Filter className="w-3 h-3 text-stone-400" />
                <select
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                  className="text-xs bg-transparent border-none text-stone-700 font-bold focus:ring-0 pr-2 cursor-pointer"
                >
                  <option value="ALL">Todas las Categorías ({categories.length})</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              id="create-menu-product-btn"
              onClick={handleStartCreateProduct}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>+ Nuevo Platillo / Producto</span>
            </button>
          </div>

          {/* Products Table */}
          <div className="flex-1 bg-white rounded-2xl border border-stone-200 overflow-hidden flex flex-col shadow-xs">
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-stone-100/90 text-stone-700 font-bold sticky top-0 z-10 border-b border-stone-200 backdrop-blur-xs">
                  <tr>
                    <th className="p-3">Foto & Platillo</th>
                    <th className="p-3">Cód. Comercial</th>
                    <th className="p-3">Código CABYS (BCCR/Hacienda)</th>
                    <th className="p-3">Categoría & KDS</th>
                    <th className="p-3">Adicionales</th>
                    <th className="p-3">Desglose Fiscal (CRC)</th>
                    <th className="p-3">Stock</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-stone-400">
                        <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 text-stone-300" />
                        <p className="font-bold text-sm">No se encontraron productos</p>
                        <p className="text-xs">Prueba con otra búsqueda o agrega un nuevo platillo al menú.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map(p => {
                      const cat = categories.find(c => c.id === p.categoryId);
                      const modCount = p.modifiers?.length || 0;
                      const taxRate = p.taxRate ?? 0.13;
                      const isWithTax = p.isPriceWithTax ?? true;
                      const breakdown = calculateFiscalPriceBreakdown(p.price, taxRate, isWithTax);

                      return (
                        <tr key={p.id} className="hover:bg-stone-50/80 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-2.5">
                              <img 
                                src={getLocalProductImage(p.image, p.categoryId, p.name, p.sku)} 
                                alt={p.name} 
                                className="w-10 h-10 rounded-xl object-cover bg-stone-100 border border-stone-200 shrink-0" 
                                onError={(e) => { (e.target as HTMLImageElement).src = '/images/products/pollo-crujiente.svg'; }}
                              />
                              <div>
                                <div className="font-black text-stone-900 text-xs">{p.name}</div>
                                <div className="text-[10px] text-stone-500 truncate max-w-[170px]">{p.description}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="font-mono font-bold text-stone-800">{p.commercialCode || '—'}</div>
                          </td>
                          <td className="p-3">
                            {p.cabysCode ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                  <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800 font-mono font-bold text-[11px]">
                                    {p.cabysCode}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-700 font-mono font-black text-[10px]" title="Unidad de Medida Hacienda DGT v4.4">
                                    {p.unitOfMeasure || 'Os'}
                                  </span>
                                </div>
                                {p.cabysDescriptionOfficial && (
                                  <span className="text-[9px] text-stone-500 truncate max-w-[180px]" title={p.cabysDescriptionOfficial}>
                                    {p.cabysDescriptionOfficial}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 font-bold text-[10px]">
                                ⚠️ Sin CABYS
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-stone-700">
                            <div className="font-bold text-stone-800">{cat?.name || 'Sin Categoría'}</div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-600 font-bold inline-block mt-0.5">
                              {p.station === 'FRITURA' ? '🍗 Freidoras' :
                               p.station === 'PLANCHA_ARMADO' ? '🍔 Plancha' :
                               p.station === 'BEBIDAS_EXTRAS' ? '🥤 Bebidas' :
                               p.station === 'EXPRESS_DESPACHO' ? '🛵 Express' : '⭐ General'}
                            </span>
                          </td>
                          <td className="p-3">
                            {modCount > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100/80 text-amber-900 font-bold text-[10px]">
                                  <Sparkles className="w-3 h-3 text-amber-600" />
                                  <span>{modCount} {modCount === 1 ? 'Adicional' : 'Adicionales'}</span>
                                </span>
                                {p.askModifiersOnSelection && (
                                  <span className="text-[9px] font-semibold text-emerald-700">
                                    ✓ Pide al seleccionar en POS
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-stone-400 text-[10px] italic">Sin adicionales</span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col gap-0.5">
                              <div className="font-black text-amber-950 text-xs">
                                ₡{(breakdown.totalPrice || 0).toLocaleString('es-CR')} <span className="text-[9px] font-normal text-stone-500">(Total)</span>
                              </div>
                              <div className="text-[10px] text-stone-500 font-mono">
                                Base: ₡{(breakdown.netPrice || 0).toLocaleString('es-CR')} + IVA ({(taxRate * 100).toFixed(0)}%): ₡{(breakdown.taxAmount || 0).toLocaleString('es-CR')}
                              </div>
                            </div>
                          </td>
                          <td className="p-3 font-bold text-stone-800">{p.inventory}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              p.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-stone-100 text-stone-500 border border-stone-200'
                            }`}>
                              {p.active ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleStartEditProduct(p)}
                                className="p-1.5 text-stone-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                                title="Editar Platillo"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteProductClick(p)}
                                className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Eliminar Platillo"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 2. CATEGORIES TAB VIEW                                                    */}
      {/* ========================================================================= */}
      {activeTab === 'CATEGORIES' && (
        <div className="flex-1 bg-white rounded-2xl border border-stone-200 overflow-hidden flex flex-col shadow-xs">
          {/* Top Bar for Categories */}
          <div className="p-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-sm text-stone-800">Categorías y Secciones del Menú</h3>
              <p className="text-xs text-stone-500">Organiza las pestañas de navegación para la toma de órdenes en caja y celular.</p>
            </div>
            <button
              id="create-category-btn"
              onClick={handleStartCreateCategory}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>+ Nueva Categoría</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeCategories.map(cat => {
                const count = activeProducts.filter(p => p.categoryId === cat.id).length;
                return (
                  <div 
                    key={cat.id}
                    className="p-4 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-white hover:border-amber-400 hover:shadow-md transition-all flex flex-col justify-between space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-amber-600/10 border border-amber-600/20 text-amber-800 flex items-center justify-center font-bold text-lg">
                          🍗
                        </div>
                        <div>
                          <h4 className="font-black text-stone-900 text-sm">{cat.name}</h4>
                          <span className="text-xs text-stone-500">{count} {count === 1 ? 'platillo' : 'platillos'} asociados</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-stone-200 text-stone-700">
                        Orden #{cat.sortOrder}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-stone-200/60 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        cat.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-stone-100 text-stone-500'
                      }`}>
                        {cat.active ? 'Visible en Menú' : 'Oculto'}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleStartEditCategory(cat)}
                          className="px-2 py-1 text-xs font-bold text-stone-700 hover:bg-amber-100 hover:text-amber-900 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                        <button
                          onClick={() => handleDeleteCategoryClick(cat)}
                          className="p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"
                          title="Eliminar Categoría"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. KITCHEN OBSERVATIONS TAB VIEW                                          */}
      {/* ========================================================================= */}
      {activeTab === 'OBSERVATIONS' && (
        <div className="flex-1 bg-white rounded-2xl border border-stone-200 overflow-hidden flex flex-col shadow-xs">
          {/* Top Bar for Observations */}
          <div className="p-3 border-b border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[240px]">
              <h3 className="font-extrabold text-sm text-stone-800 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-amber-600" />
                <span>Observaciones Oficiales para Cocina</span>
              </h3>
              <p className="text-xs text-stone-500">
                Solo las observaciones que agregues aquí estarán disponibles como botones rápidos para los cajeros. Cero notas inventadas.
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  placeholder="Buscar observación..."
                  value={obsSearchQuery}
                  onChange={(e) => setObsSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <select
                value={obsCategoryFilter}
                onChange={(e) => setObsCategoryFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-xl font-medium text-stone-800"
              >
                <option value="ALL">Todas las Categorías</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <button
                id="create-observation-btn"
                onClick={handleStartCreateObs}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>+ Nueva Observación</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {filteredObservations.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-stone-50/50 rounded-2xl border border-dashed border-stone-200">
                <div className="p-3 bg-amber-100/60 rounded-2xl text-amber-700 mb-2">
                  <MessageSquare className="w-8 h-8" />
                </div>
                <h4 className="font-extrabold text-stone-800 text-sm">No hay observaciones registradas</h4>
                <p className="text-xs text-stone-500 max-w-sm mt-1 mb-4">
                  {obsSearchQuery || obsCategoryFilter !== 'ALL'
                    ? 'No se encontraron observaciones que coincidan con la búsqueda o filtro seleccionado.'
                    : 'Crea las observaciones frecuentes de cocina (ej: "Sin cebolla", "Salsa aparte", "Bien crujiente", "Empaque para viaje") para que los cajeros las elijan con 1 clic.'}
                </p>
                <button
                  onClick={handleStartCreateObs}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear Primera Observación</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredObservations.map(obs => {
                  const targetCat = categories.find(c => c.id === obs.categoryId);
                  return (
                    <div 
                      key={obs.id}
                      className="p-3.5 rounded-xl border border-stone-200 bg-white hover:border-amber-400 hover:shadow-xs transition-all flex flex-col justify-between space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center font-bold text-xs shrink-0">
                            📝
                          </span>
                          <div>
                            <h4 className="font-bold text-stone-900 text-sm">{obs.text}</h4>
                            <span className="text-[11px] text-stone-500">
                              {targetCat ? `Sección: ${targetCat.name}` : 'Aplica a todo el menú'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleObsActive(obs)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors shrink-0 ${
                            obs.active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                              : 'bg-stone-100 text-stone-500 border-stone-300 hover:bg-stone-200'
                          }`}
                          title="Clic para cambiar estado activo/inactivo"
                        >
                          {obs.active ? 'Activa' : 'Inactiva'}
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-xs">
                        <span className="text-[10px] text-stone-400 font-mono">
                          {obs.updatedAt ? new Date(obs.updatedAt).toLocaleDateString('es-CR') : 'Oficial'}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleStartEditObs(obs)}
                            className="px-2 py-1 text-xs font-bold text-stone-700 hover:bg-amber-100 hover:text-amber-900 rounded-lg transition-colors flex items-center gap-1"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>
                          <button
                            onClick={() => handleDeleteObsClick(obs)}
                            className="p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"
                            title="Eliminar observación"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. PRODUCT EDIT / CREATE MODAL                                            */}
      {/* ========================================================================= */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-4 my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-base text-stone-900">
                  {isCreatingProduct ? 'Crear Nuevo Platillo / Producto' : 'Editar Platillo del Menú'}
                </h3>
              </div>
              <button 
                onClick={() => setEditingProduct(null)} 
                className="text-stone-400 hover:text-stone-600 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProductForm} className="space-y-4 text-xs">
              
              {/* Product Info Section */}
              <div className="space-y-3 bg-stone-50 p-3.5 rounded-xl border border-stone-200">
                <h4 className="font-extrabold text-stone-800 flex items-center gap-1.5 uppercase text-[11px]">
                  <span>Datos Generales</span>
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="font-bold text-stone-700 block mb-1">Nombre del Platillo / Producto:</label>
                    <input
                      type="text"
                      value={editingProduct.name}
                      onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl font-black text-sm text-stone-900 focus:ring-2 focus:ring-amber-500"
                      placeholder="Ej: Balde Familiar 8 Piezas + Papas"
                      required
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="font-bold text-stone-700 block mb-1">Descripción de Ingredientes / Preparación:</label>
                    <textarea
                      rows={2}
                      value={editingProduct.description}
                      onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl text-stone-700 focus:ring-2 focus:ring-amber-500"
                      placeholder="Descripción que se muestra en el POS y para cocina..."
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="font-bold text-stone-700 block mb-1">Código Comercial / Referencia (Opcional):</label>
                    <input
                      type="text"
                      value={editingProduct.commercialCode || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, commercialCode: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-mono font-bold text-stone-900"
                      placeholder="Ej: 117 o 078"
                    />
                    <span className="text-[10px] text-stone-400 block mt-0.5">Código interno visible en la representación gráfica y XML fiscal.</span>
                  </div>

                  <div>
                    <label className="font-bold text-stone-700 block mb-1">Categoría del Menú:</label>
                    <select
                      value={editingProduct.categoryId}
                      onChange={(e) => setEditingProduct({ ...editingProduct, categoryId: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-bold"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-stone-700 block mb-1">Estación de Cocina (Monitor KDS):</label>
                    <select
                      value={editingProduct.station || 'PLANCHA_ARMADO'}
                      onChange={(e) => setEditingProduct({ ...editingProduct, station: e.target.value as KitchenStation })}
                      className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-bold text-stone-800"
                    >
                      <option value="FRITURA">🍗 Freidoras (Pollo & Empanadas)</option>
                      <option value="PLANCHA_ARMADO">🍔 Plancha & Armado (Burgers, Tacos, Nachos)</option>
                      <option value="BEBIDAS_EXTRAS">🥤 Bebidas & Refrescos</option>
                      <option value="EXPRESS_DESPACHO">🛵 Express & Empaque</option>
                      <option value="ALL">⭐ General (Todos los monitores)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 space-y-2 bg-stone-50 p-3 rounded-xl border border-stone-200">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-stone-800 text-xs flex items-center gap-1.5">
                        <Image className="w-3.5 h-3.5 text-amber-600" />
                        <span>Imagen del Producto (Carga Local 100% Offline):</span>
                      </label>
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                        Activo Local
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="relative w-14 h-14 shrink-0">
                        <img
                          src={getLocalProductImage(editingProduct.image, editingProduct.categoryId, editingProduct.name, editingProduct.sku)}
                          alt="Vista Previa"
                          className="w-14 h-14 rounded-xl object-cover bg-white border border-stone-300 shadow-xs"
                          onError={(e) => { (e.target as HTMLImageElement).src = '/images/products/pollo-crujiente.svg'; }}
                        />
                        {isUploadingImage && (
                          <div className="absolute inset-0 bg-stone-900/60 rounded-xl flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-white animate-spin" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <input
                          type="text"
                          value={editingProduct.image || ''}
                          onChange={(e) => setEditingProduct({ ...editingProduct, image: e.target.value })}
                          className="w-full px-3 py-1 bg-white border border-stone-300 rounded-lg text-xs text-stone-700 font-mono"
                          placeholder="/images/products/pollo-crujiente.svg o /uploads/..."
                        />
                        <div className="flex items-center gap-2">
                          <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold rounded-lg transition-colors border border-amber-300 shadow-xs">
                            {isUploadingImage ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 text-amber-700 animate-spin" />
                                <span>Guardando imagen...</span>
                              </>
                            ) : (
                              <>
                                <Upload className="w-3.5 h-3.5 text-amber-700" />
                                <span>Cargar Imagen desde PC</span>
                              </>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              disabled={isUploadingImage}
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  processAndUploadImage(file);
                                }
                              }}
                            />
                          </label>
                          <span className="text-[10px] text-stone-500">o selecciona un dibujo del catálogo:</span>
                        </div>
                      </div>
                    </div>

                    {/* Local SVG Preset Selector */}
                    <div className="pt-2 border-t border-stone-200">
                      <p className="text-[10px] font-bold text-stone-600 mb-1.5 uppercase">Ilustraciones Locales Disponibles:</p>
                      <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-28 overflow-y-auto p-1 bg-white rounded-lg border border-stone-200">
                        {LOCAL_PRODUCT_IMAGES.map((preset) => {
                          const isSelected = editingProduct.image === preset.path;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setEditingProduct({ ...editingProduct, image: preset.path })}
                              className={`group relative p-1 rounded-lg border transition-all flex flex-col items-center justify-center ${
                                isSelected ? 'border-amber-600 bg-amber-50 ring-2 ring-amber-500' : 'border-stone-200 hover:border-amber-400 bg-stone-50'
                              }`}
                              title={preset.name}
                            >
                              <img src={preset.path} alt={preset.name} className="w-7 h-7 object-cover rounded" />
                              <span className="text-[8px] text-stone-600 truncate max-w-full font-medium mt-0.5 group-hover:text-amber-700">
                                {preset.name.split(' ')[0]}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Costa Rica CABYS Section */}
              <div className="space-y-3 bg-blue-50/70 p-3.5 rounded-xl border border-blue-200">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-blue-900 flex items-center gap-1.5 uppercase text-[11px]">
                    <FileCode2 className="w-4 h-4 text-blue-600" />
                    <span>Clasificación CABYS (Banco Central BCCR / Hacienda)</span>
                  </h4>
                  <span className="text-[10px] text-blue-700 font-mono font-bold bg-blue-100 px-2 py-0.5 rounded">
                    13 Dígitos Obligatorios
                  </span>
                </div>

                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-stone-800 block text-xs">Código CABYS Oficial (13 Dígitos):</label>
                      <button
                        type="button"
                        onClick={() => {
                          setCabysSearchTerm('');
                          setCabysModalOpen(true);
                        }}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px] flex items-center gap-1 shadow-xs transition-all"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>Explorar Catálogo Oficial BCCR</span>
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        maxLength={13}
                        value={editingProduct.cabysCode || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setEditingProduct({ ...editingProduct, cabysCode: val });
                        }}
                        className={`w-full px-3 py-2 bg-white border rounded-xl font-mono text-sm font-black tracking-wider focus:ring-2 ${
                          cabysValidationInfo.valid && editingProduct.cabysCode?.length === 13
                            ? 'border-emerald-500 text-emerald-950 focus:ring-emerald-500'
                            : 'border-blue-300 text-blue-900 focus:ring-blue-500'
                        }`}
                        placeholder="6332000000000"
                        required
                      />
                      {editingProduct.cabysCode && editingProduct.cabysCode.length === 13 && cabysValidationInfo.valid && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-emerald-600 font-bold text-[10px]">
                          <ShieldCheck className="w-4 h-4" />
                          <span>VIGENTE</span>
                        </div>
                      )}
                    </div>

                    {/* CABYS Validation Feedback */}
                    {editingProduct.cabysCode && (
                      <div className={`mt-1.5 p-2 rounded-lg text-[11px] flex items-start gap-1.5 ${
                        cabysValidationInfo.valid && editingProduct.cabysCode.length === 13
                          ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                          : 'bg-amber-50 text-amber-900 border border-amber-200'
                      }`}>
                        {cabysValidationInfo.valid && editingProduct.cabysCode.length === 13 ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="font-bold">{cabysValidationInfo.message}</p>
                          {cabysValidationInfo.officialDescription && (
                            <p className="text-[10px] text-stone-600 mt-0.5 italic">
                              "{cabysValidationInfo.officialDescription}"
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Unidad de Medida Oficial Hacienda v4.4 */}
                  <div className="pt-2 border-t border-blue-200">
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-stone-800 block text-xs">
                        Unidad de Medida Fiscal (Hacienda DGT v4.4):
                      </label>
                      {editingProduct.cabysCode?.startsWith('6332') && (
                        <span className="text-[10px] bg-blue-100 text-blue-900 font-bold px-2 py-0.5 rounded border border-blue-200">
                          Requerida para 6332: <strong>Os</strong>
                        </span>
                      )}
                    </div>
                    <select
                      value={editingProduct.unitOfMeasure || (editingProduct.cabysCode?.startsWith('6') ? 'Os' : 'Unid')}
                      onChange={(e) => setEditingProduct({ ...editingProduct, unitOfMeasure: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-blue-300 rounded-xl font-bold text-xs text-stone-900 focus:ring-2 focus:ring-blue-500"
                    >
                      {HACIENDA_UNITS_OF_MEASURE.map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.code} - {u.name}
                        </option>
                      ))}
                    </select>
                    {editingProduct.cabysCode?.startsWith('6332') ? (
                      <span className="text-[11px] text-blue-950 bg-blue-100/60 p-2 rounded-lg border border-blue-200 block mt-1.5 font-medium">
                        💡 <strong>Regla Fiscal DGT para CABYS 6332:</strong> Al tratarse del suministro de comidas en restaurantes sin mesero / autoservicio, la unidad de medida oficial reglamentaria ante Hacienda es <strong>Os (Otro tipo de servicio)</strong>.
                      </span>
                    ) : (
                      <span className="text-[10px] text-stone-500 block mt-1">
                        Catálogo oficial de unidades de medida según el estándar técnico de la Dirección General de Tributación (DGT).
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Recipe Modifiers / Extras / Options Section */}
              <div className="space-y-3 bg-amber-50/60 p-3.5 rounded-xl border border-amber-200">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-amber-950 flex items-center gap-1.5 uppercase text-[11px]">
                    <SlidersHorizontal className="w-4 h-4 text-amber-600" />
                    <span>Adicionales & Opciones de la Receta (Modificadores)</span>
                  </h4>
                  <span className="text-[10px] text-amber-800 font-bold bg-amber-200/70 px-2 py-0.5 rounded">
                    {editingProduct.modifiers?.length || 0} Opciones configuradas
                  </span>
                </div>

                <p className="text-[11px] text-amber-900 leading-snug">
                  Configura adicionales como extras de salsa (+₡250), quesos (+₡400), o preferencias de cocina como "Sin cebolla" (+₡0).
                </p>

                {/* Ask on Selection Toggle */}
                <div className="bg-white p-3 rounded-xl border border-amber-300 flex items-start gap-3 shadow-xs">
                  <input
                    type="checkbox"
                    id="askModifiersOnSelection"
                    checked={editingProduct.askModifiersOnSelection ?? false}
                    onChange={(e) => setEditingProduct({ ...editingProduct, askModifiersOnSelection: e.target.checked })}
                    className="mt-0.5 w-4 h-4 text-amber-600 rounded border-stone-300 focus:ring-amber-500 cursor-pointer"
                  />
                  <label htmlFor="askModifiersOnSelection" className="cursor-pointer text-xs">
                    <span className="font-extrabold text-stone-900 block">
                      Solicitar adicionales automáticamente al seleccionar este platillo en el POS
                    </span>
                    <span className="text-[11px] text-stone-500 block mt-0.5">
                      Al tocar este platillo en la pantalla de cobro o toma de órdenes, se abrirá la ventana emergente para que el cajero/mesero elija adicionales y notas de cocina antes de agregarlo al ticket.
                    </span>
                  </label>
                </div>

                {/* Modifiers List */}
                {editingProduct.modifiers && editingProduct.modifiers.length > 0 ? (
                  <div className="space-y-1.5">
                    <label className="font-bold text-stone-700 block text-[11px]">
                      Adicionales configurados para este platillo ({editingProduct.modifiers.length}):
                    </label>
                    <div className="space-y-1.5 bg-white p-2 rounded-xl border border-amber-200 divide-y divide-stone-100 max-h-52 overflow-y-auto">
                      {editingProduct.modifiers.map((mod) => {
                        const isBeingEdited = editingModId === mod.id;
                        return (
                          <div 
                            key={mod.id} 
                            className={`flex items-center justify-between py-1.5 px-2.5 text-xs rounded-lg transition-all ${
                              isBeingEdited 
                                ? 'bg-amber-100/80 border border-amber-400 ring-1 ring-amber-400' 
                                : 'hover:bg-stone-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${isBeingEdited ? 'bg-amber-600 animate-pulse' : 'bg-amber-500'}`}></span>
                              <span className={`font-bold ${isBeingEdited ? 'text-amber-950' : 'text-stone-800'}`}>{mod.name}</span>
                              {isBeingEdited && (
                                <span className="text-[10px] bg-amber-600 text-white font-bold px-1.5 py-0.2 rounded">Editando</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`font-mono font-bold ${mod.price > 0 ? 'text-amber-700' : 'text-stone-500'}`}>
                                {mod.price > 0 ? `+₡${(mod.price || 0).toLocaleString('es-CR')}` : 'Sin costo (₡0)'}
                              </span>
                              <div className="flex items-center gap-1 ml-2 border-l border-stone-200 pl-2">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditModifier(mod)}
                                  className="p-1 rounded text-stone-500 hover:text-amber-700 hover:bg-amber-100 transition-colors"
                                  title="Modificar nombre o precio"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveModifier(mod.id)}
                                  className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                  title="Eliminar adicional"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-2.5 bg-white rounded-xl border border-dashed border-amber-300 text-stone-400 text-xs">
                    No has agregado adicionales aún. Usa el formulario inferior o las sugerencias rápidas.
                  </div>
                )}

                {/* Add / Edit Custom Modifier Row */}
                <div className={`p-2.5 rounded-xl border space-y-2 transition-all ${
                  editingModId ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-300/60' : 'bg-white border-amber-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-stone-700 uppercase flex items-center gap-1">
                      {editingModId ? (
                        <>
                          <Edit className="w-3 h-3 text-amber-700" />
                          <span className="text-amber-900 font-extrabold">Modificar Adicional Seleccionado:</span>
                        </>
                      ) : (
                        <span>Añadir Nuevo Adicional Personalizado:</span>
                      )}
                    </span>
                    {editingModId && (
                      <button
                        type="button"
                        onClick={handleCancelEditModifier}
                        className="text-[10px] text-stone-500 hover:text-stone-800 underline font-semibold"
                      >
                        Cancelar edición
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Ej: Extra Salsa Tártara, Sin Cebolla..."
                      value={customModName}
                      onChange={(e) => setCustomModName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (customModName.trim()) {
                            handleAddOrUpdateModifier(customModName, customModPrice);
                          }
                        }
                      }}
                      className="flex-1 px-3 py-1.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="flex items-center gap-1 w-32">
                      <span className="text-stone-400 font-bold text-xs">₡</span>
                      <input
                        type="number"
                        placeholder="Precio (+₡)"
                        value={customModPrice || ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setCustomModPrice(isNaN(val) ? 0 : Math.max(0, val));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (customModName.trim()) {
                              handleAddOrUpdateModifier(customModName, customModPrice);
                            }
                          }
                        }}
                        className="w-full px-2 py-1.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold focus:bg-white focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddOrUpdateModifier(customModName, customModPrice)}
                      disabled={!customModName.trim()}
                      className={`px-3 py-1.5 ${
                        editingModId 
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                          : 'bg-amber-600 hover:bg-amber-500 text-white'
                      } disabled:opacity-50 rounded-xl font-bold text-xs flex items-center gap-1 shrink-0 transition-all shadow-xs`}
                    >
                      {editingModId ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Guardar Cambio</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>Agregar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Pricing, Tax & Inventory Section */}
              <div className="space-y-3 bg-stone-50 p-3.5 rounded-xl border border-stone-200">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-stone-800 flex items-center gap-1.5 uppercase text-[11px]">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>Precios, Desglose de IVA & Rentabilidad</span>
                  </h4>
                  <span className="text-[10px] text-stone-500 font-bold bg-stone-200/80 px-2 py-0.5 rounded">
                    DGT v4.4 CR
                  </span>
                </div>

                {/* Price Mode Selector */}
                <div className="bg-white p-2.5 rounded-xl border border-stone-200 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-stone-700 text-xs">Modo de ingreso de precio:</span>
                  <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg border border-stone-200">
                    <button
                      type="button"
                      onClick={() => setEditingProduct({ ...editingProduct, isPriceWithTax: true })}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                        (editingProduct.isPriceWithTax ?? true)
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      ✓ Precio incluye IVA (Precio Carta / Menú)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingProduct({ ...editingProduct, isPriceWithTax: false })}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                        !(editingProduct.isPriceWithTax ?? true)
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Precio Neto Base (Antes de IVA)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-stone-700 block mb-1">
                      {(editingProduct.isPriceWithTax ?? true) ? 'Precio Venta con IVA (₡ CRC):' : 'Precio Neto Base (₡ CRC):'}
                    </label>
                    <input
                      type="number"
                      value={editingProduct.price}
                      onChange={(e) => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-black text-amber-900 text-sm focus:ring-2 focus:ring-amber-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="font-bold text-stone-700 block mb-1">Costo Unitario (₡ CRC):</label>
                    <input
                      type="number"
                      value={editingProduct.cost}
                      onChange={(e) => setEditingProduct({ ...editingProduct, cost: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-medium"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-stone-700 block mb-1">Tasa IVA (Hacienda):</label>
                    <select
                      value={editingProduct.taxRate}
                      onChange={(e) => setEditingProduct({ ...editingProduct, taxRate: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-bold"
                    >
                      <option value={0.13}>13% - General IVA (Comidas & Bebidas)</option>
                      <option value={0.01}>1% - Canasta Básica Tributaria</option>
                      <option value={0.02}>2% - Medicamentos</option>
                      <option value={0.04}>4% - Servicios de Salud Privada</option>
                      <option value={0.00}>0% - Exento / No Sujeto</option>
                    </select>
                  </div>

                  {/* Live Fiscal Calculation Breakdown Card */}
                  {(() => {
                    const priceVal = Number(editingProduct.price) || 0;
                    const taxRateVal = Number(editingProduct.taxRate) ?? 0.13;
                    const isWithTaxVal = editingProduct.isPriceWithTax ?? true;
                    const b = calculateFiscalPriceBreakdown(priceVal, taxRateVal, isWithTaxVal);
                    const costVal = Number(editingProduct.cost) || 0;
                    const grossProfit = b.netPrice - costVal;
                    const marginPct = b.netPrice > 0 ? ((grossProfit / b.netPrice) * 100).toFixed(1) : '0';

                    return (
                      <div className="sm:col-span-3 bg-stone-900 text-stone-100 p-3 rounded-xl shadow-inner border border-stone-800 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold border-b border-stone-800 pb-1.5">
                          <span className="text-amber-400 flex items-center gap-1">
                            <span>📊 Desglose Fiscal en Factura Electrónica (DGT v4.4):</span>
                          </span>
                          <span className="text-stone-400 font-mono">
                            Tarifa: {(taxRateVal * 100).toFixed(0)}% IVA
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                          <div className="bg-stone-800/80 p-2 rounded-lg border border-stone-700">
                            <span className="text-[10px] text-stone-400 block">Base Imponible (Neto):</span>
                            <span className="font-mono font-bold text-amber-300 text-sm">
                              ₡{(b.netPrice || 0).toLocaleString('es-CR')}
                            </span>
                          </div>

                          <div className="bg-stone-800/80 p-2 rounded-lg border border-stone-700">
                            <span className="text-[10px] text-stone-400 block">+ Monto IVA ({(taxRateVal * 100).toFixed(0)}%):</span>
                            <span className="font-mono font-bold text-emerald-400 text-sm">
                              +₡{(b.taxAmount || 0).toLocaleString('es-CR')}
                            </span>
                          </div>

                          <div className="bg-stone-800/80 p-2 rounded-lg border border-stone-700">
                            <span className="text-[10px] text-stone-400 block">= Total Consumidor:</span>
                            <span className="font-mono font-black text-white text-sm">
                              ₡{(b.totalPrice || 0).toLocaleString('es-CR')}
                            </span>
                          </div>

                          <div className="bg-stone-800/80 p-2 rounded-lg border border-stone-700">
                            <span className="text-[10px] text-stone-400 block">Margen de Ganancia:</span>
                            <span className={`font-mono font-bold text-xs ${grossProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              ₡{(grossProfit || 0).toLocaleString('es-CR')} ({marginPct}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="sm:col-span-3">
                    <label className="font-bold text-stone-700 block mb-1">Inventario / Stock Disponible:</label>
                    <input
                      type="number"
                      value={editingProduct.inventory}
                      onChange={(e) => setEditingProduct({ ...editingProduct, inventory: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 text-xs font-black bg-amber-600 hover:bg-amber-500 text-white rounded-xl shadow-md transition-all"
                >
                  Guardar Platillo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. CATEGORY EDIT / CREATE MODAL                                           */}
      {/* ========================================================================= */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <div className="flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-amber-600" />
                <h3 className="font-extrabold text-base text-stone-900">
                  {isCreatingCategory ? 'Nueva Categoría de Menú' : 'Editar Categoría'}
                </h3>
              </div>
              <button 
                onClick={() => setEditingCategory(null)} 
                className="text-stone-400 hover:text-stone-600 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCategoryForm} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">Nombre de la Categoría:</label>
                <input
                  type="text"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  placeholder="Ej: Combos Familiares, Postres, Desayunos..."
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-bold text-stone-900 focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Orden en el Menú:</label>
                  <input
                    type="number"
                    value={editingCategory.sortOrder}
                    onChange={(e) => setEditingCategory({ ...editingCategory, sortOrder: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 bg-stone-50 border border-stone-300 rounded-xl font-mono font-bold"
                    required
                  />
                  <span className="text-[10px] text-stone-400">1 = Primero, 10 = Al final</span>
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Estado:</label>
                  <select
                    value={editingCategory.active ? 'true' : 'false'}
                    onChange={(e) => setEditingCategory({ ...editingCategory, active: e.target.value === 'true' })}
                    className="w-full px-3 py-1.5 bg-stone-50 border border-stone-300 rounded-xl font-bold"
                  >
                    <option value="true">Activo (Visible)</option>
                    <option value="false">Inactivo (Oculto)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 text-xs font-extrabold bg-amber-600 hover:bg-amber-500 text-white rounded-xl shadow-md"
                >
                  Guardar Categoría
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. OFFICIAL BCCR CABYS SEARCH MODAL                                       */}
      {/* ========================================================================= */}
      {cabysModalOpen && (
        <div className="fixed inset-0 z-60 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <FileCode2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-stone-900">
                    Buscador de Catálogo CABYS (Banco Central BCCR)
                  </h3>
                  <p className="text-xs text-stone-500">
                    Catálogo oficial para Costa Rica según normativa de Hacienda v4.4
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setCabysModalOpen(false)} 
                className="text-stone-400 hover:text-stone-600 font-bold p-1 text-lg"
              >
                ✕
              </button>
            </div>

            {/* Search Box */}
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={cabysSearchTerm}
                onChange={(e) => setCabysSearchTerm(e.target.value)}
                placeholder="Buscar por código de 13 dígitos, nombre de platillo, pollo, bebida, servicio..."
                className="w-full pl-9 pr-4 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-96">
              {!cabysSearchTerm.trim() || cabysSearchTerm.trim().length < 2 ? (
                <div className="text-center py-10 px-4 space-y-2.5 bg-stone-50 rounded-2xl border border-dashed border-stone-300">
                  <Search className="w-8 h-8 mx-auto text-blue-500/70" />
                  <p className="font-extrabold text-sm text-stone-800">
                    Ingresa una palabra clave o código para buscar
                  </p>
                  <p className="text-xs text-stone-500 max-w-md mx-auto">
                    Escribe el nombre del platillo o insumo (ej: <strong>pollo, refresco, bebida, hamburguesa, papa, salsa, empanada, comida</strong>) o los dígitos del código CABYS para consultar el catálogo.
                  </p>
                </div>
              ) : cabysResults.length > 0 ? (
                cabysResults.map((item) => (
                  <div 
                    key={item.codigoCabys}
                    className="p-3 bg-stone-50 hover:bg-blue-50/60 border border-stone-200 hover:border-blue-300 rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-xs text-blue-900 bg-blue-100 px-2 py-0.5 rounded">
                          {item.codigoCabys}
                        </span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                          IVA {(item.impuestoSugerido * 100).toFixed(0)}%
                        </span>
                        <span className="text-[10px] text-stone-500 font-medium">
                          {item.categoria} &rsaquo; {item.subcategoria}
                        </span>
                      </div>
                      <p className="text-xs font-extrabold text-stone-900">
                        {item.descripcionOficial}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (editingProduct) {
                          const isService = item.codigoCabys.startsWith('6') || item.codigoCabys.startsWith('5');
                          setEditingProduct({
                            ...editingProduct,
                            cabysCode: item.codigoCabys,
                            taxRate: item.impuestoSugerido,
                            unitOfMeasure: isService ? 'Os' : (editingProduct.unitOfMeasure || 'Unid')
                          });
                        }
                        setCabysModalOpen(false);
                      }}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shrink-0 flex items-center justify-center gap-1 shadow-xs"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Seleccionar</span>
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-stone-400 text-xs">
                  No se encontraron códigos CABYS con el término "{cabysSearchTerm}".
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-stone-100 text-[11px] text-stone-500">
              <span>{cabysResults.length > 0 ? `${cabysResults.length} código(s) encontrado(s)` : 'Búsqueda por palabra clave'}</span>
              <button
                type="button"
                onClick={() => setCabysModalOpen(false)}
                className="px-4 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg font-bold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. IN-APP DELETION CONFIRMATION MODAL                                    */}
      {/* ========================================================================= */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-stone-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-rose-50 rounded-xl text-rose-600 shrink-0 border border-rose-100">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-base text-stone-900">
                  {deleteConfirmTarget.type === 'product' ? '¿Eliminar Platillo del Menú?' : '¿Eliminar Categoría?'}
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  ¿Estás seguro de que deseas eliminar permanentemente{' '}
                  <span className="font-bold text-stone-900">"{deleteConfirmTarget.name}"</span>?
                </p>
                {deleteConfirmTarget.subtext && (
                  <p className="text-[11px] text-stone-500 font-mono mt-1 bg-stone-50 p-2 rounded-lg border border-stone-200">
                    {deleteConfirmTarget.subtext}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => !isDeleting && setDeleteConfirmTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-xl font-bold text-xs transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl font-bold text-xs shadow-md shadow-rose-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Sí, Eliminar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. OBSERVATION EDIT / CREATE MODAL                                        */}
      {/* ========================================================================= */}
      {editingObs && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-base text-stone-900">
                  {isCreatingObs ? 'Nueva Observación Oficial de Cocina' : 'Editar Observación de Cocina'}
                </h3>
              </div>
              <button 
                onClick={() => setEditingObs(null)} 
                className="text-stone-400 hover:text-stone-600 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveObsForm} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Texto de la observación <span className="text-rose-600">*</span>:
                </label>
                <input
                  type="text"
                  required
                  value={obsFormText}
                  onChange={(e) => setObsFormText(e.target.value)}
                  placeholder="Ej: Sin cebolla, Salsa aparte, Bien crujiente, Empaque para viaje..."
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 font-medium text-stone-900"
                />
                <span className="text-[10px] text-stone-500 block mt-1">
                  Este texto se mostrará tal cual en los botones de selección rápida en caja.
                </span>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Aplica a la categoría / sección:
                </label>
                <select
                  value={obsFormCategory}
                  onChange={(e) => setObsFormCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-medium text-stone-900 focus:bg-white"
                >
                  <option value="">Aplica a todo el menú (General)</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <span className="text-[10px] text-stone-500 block mt-1">
                  Si seleccionas una categoría, el botón rápido solo aparecerá en los platillos de esa sección.
                </span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="obs-active-checkbox"
                  checked={obsFormActive}
                  onChange={(e) => setObsFormActive(e.target.checked)}
                  className="w-4 h-4 text-amber-600 rounded border-stone-300 focus:ring-amber-500"
                />
                <label htmlFor="obs-active-checkbox" className="font-bold text-stone-800 cursor-pointer">
                  Activa (mostrar en la pantalla de cobro para cajeros)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setEditingObs(null)}
                  className="px-4 py-2 border border-stone-300 text-stone-700 font-bold rounded-xl hover:bg-stone-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingObs}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-extrabold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  {isSavingObs ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Guardar Observación</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. MODAL DE RESPALDO Y EXPORTACIÓN DEL MENÚ                              */}
      {/* ========================================================================= */}
      {showBackupModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-2xl border border-amber-200">
                  <Download className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg text-stone-900">
                    Respaldo del Menú
                  </h3>
                  <p className="text-xs text-stone-500">
                    Categorías, platillos, precios e impuestos (DGT v4.4)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBackupModal(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metrics pills */}
            <div className="grid grid-cols-3 gap-2 py-1">
              <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 text-center">
                <span className="block text-[11px] font-bold text-stone-500">Categorías</span>
                <span className="text-lg font-black text-amber-600">{activeCategories.length}</span>
              </div>
              <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 text-center">
                <span className="block text-[11px] font-bold text-stone-500">Platillos</span>
                <span className="text-lg font-black text-stone-900">{activeProducts.length}</span>
              </div>
              <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 text-center">
                <span className="block text-[11px] font-bold text-stone-500">Observaciones</span>
                <span className="text-lg font-black text-emerald-600">{observations.length}</span>
              </div>
            </div>

            {/* Status message */}
            {menuBackupStatus && (
              <div className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                menuBackupStatus.success 
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {menuBackupStatus.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{menuBackupStatus.text}</span>
              </div>
            )}

            {/* Options */}
            <div className="space-y-3">
              {/* Option 1: JSON */}
              <div className="p-3.5 bg-stone-50 hover:bg-amber-50/40 rounded-2xl border border-stone-200 transition-colors flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-stone-900">
                    <FileDown className="w-4 h-4 text-amber-600" />
                    <span>Descargar Respaldo JSON</span>
                    <span className="text-[10px] font-extrabold px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-md">Completo</span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-tight">
                    Copia íntegra con estructura técnica, imágenes, modificadores y códigos CABYS.
                  </p>
                </div>
                <button
                  type="button"
                  id="btn-download-menu-json"
                  onClick={handleDownloadMenuJson}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold text-xs shadow-xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Bajar JSON</span>
                </button>
              </div>

              {/* Option 2: Excel / CSV */}
              <div className="p-3.5 bg-stone-50 hover:bg-emerald-50/40 rounded-2xl border border-stone-200 transition-colors flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-stone-900">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Descargar Catálogo Excel (CSV)</span>
                    <span className="text-[10px] font-extrabold px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-md">Legible</span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-tight">
                    Hoja de cálculo con precios finales, precios netos, IVA desglosado y códigos CABYS.
                  </p>
                </div>
                <button
                  type="button"
                  id="btn-download-menu-csv"
                  onClick={handleDownloadMenuCsv}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Bajar CSV</span>
                </button>
              </div>

              {/* Option 3: Restore / Import */}
              <div className="p-3.5 bg-stone-50 hover:bg-stone-100/70 rounded-2xl border border-stone-200 transition-colors flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-stone-900">
                    <Upload className="w-4 h-4 text-stone-700" />
                    <span>Restaurar Respaldo del Menú</span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-tight">
                    Restaura categorías y platillos desde un archivo JSON sin tocar las ventas.
                  </p>
                </div>
                <div>
                  <input
                    ref={menuFileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleImportMenuJson}
                  />
                  <button
                    type="button"
                    id="btn-import-menu-json"
                    disabled={isRestoringMenu}
                    onClick={() => menuFileInputRef.current?.click()}
                    className="px-3.5 py-2 bg-stone-800 hover:bg-stone-900 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    {isRestoringMenu ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Restaurando...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 text-amber-400" />
                        <span>Restaurar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setShowBackupModal(false)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold text-xs transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. IN-APP ALERT / NOTICE MODAL                                            */}
      {/* ========================================================================= */}
      {modalAlertMessage && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-stone-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-amber-50 rounded-xl text-amber-600 shrink-0 border border-amber-100">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-base text-stone-900">
                  {modalAlertMessage.title}
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  {modalAlertMessage.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setModalAlertMessage(null)}
                className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold text-xs transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
