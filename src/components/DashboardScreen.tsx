import React, { useRef, useState } from 'react';
import { 
  BarChart3, 
  DollarSign, 
  ShoppingBag, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  Users,
  CreditCard,
  Building2,
  Package,
  Download,
  Upload,
  Shield,
  KeyRound,
  Percent,
  ArrowRight,
  Lock,
  Sparkles,
  Loader2,
  FileSpreadsheet,
  ShieldCheck,
  UtensilsCrossed
} from 'lucide-react';
import { Sale, Product, UserProfile, CashRegister, CashMovement } from '../types/pos';
import { CashierBoardTab } from './CashierBoardTab';
import { LibroIvaReportTab } from './reports/LibroIvaReportTab';
import { EstadoDgtReportTab } from './reports/EstadoDgtReportTab';
import { CierreCajaReportTab } from './reports/CierreCajaReportTab';
import { PosApiService } from '../services/api';
import { getCostaRicaDate } from '../utils/dateUtils';

interface DashboardScreenProps {
  sales: Sale[];
  products: Product[];
  currentUser: UserProfile;
  cashRegister?: CashRegister | null;
  movements?: CashMovement[];
  onRequestAdminAuth?: (title: string, description: string, onSuccess: () => void) => void;
  onElevateToAdmin?: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  sales,
  products,
  currentUser,
  cashRegister = null,
  movements = [],
  onRequestAdminAuth,
  onElevateToAdmin
}) => {
  const [activeReportTab, setActiveReportTab] = useState<'summary' | 'libro-iva' | 'estado-dgt' | 'cierre-caja' | 'tablero'>('summary');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenTablero = () => {
    if (currentUser.role === 'ADMINISTRADOR') {
      setActiveReportTab('tablero');
      return;
    }

    if (onRequestAdminAuth) {
      onRequestAdminAuth(
        'Acceso al Tablero Administrativo',
        'Ingrese su PIN de Administrador para gestionar los cajeros, permisos y liquidar comisiones.',
        () => {
          onElevateToAdmin?.();
          setActiveReportTab('tablero');
        }
      );
    } else {
      onElevateToAdmin?.();
      setActiveReportTab('tablero');
    }
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);
  const [isBackingUpTotal, setIsBackingUpTotal] = useState(false);
  const [backupResultModal, setBackupResultModal] = useState<any>(null);

  const handleDownloadBackup = () => {
    window.location.href = '/api/backup/export';
  };

  const handleDownloadUserDataBackup = () => {
    window.location.href = '/api/backup/user-data/download';
  };

  const handleDownloadMenuBackup = () => {
    window.location.href = '/api/backup/menu/download';
  };

  const handleExecuteFullBackupNow = async () => {
    setIsBackingUpTotal(true);
    try {
      const result = await PosApiService.executeFullBackupNow();
      if (result.success) {
        setBackupResultModal(result);
        // Descarga automática en el navegador para resguardo inmediato
        window.location.href = '/api/backup/full/download';
      } else {
        window.alert('No se pudo completar el respaldo total.');
      }
    } catch (err: any) {
      window.alert('Error al ejecutar el respaldo total: ' + (err?.message || err));
    } finally {
      setIsBackingUpTotal(false);
    }
  };

  const handleClearTestData = async () => {
    setIsClearingData(true);
    try {
      const res = await fetch('/api/admin/clear-test-data', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setShowClearConfirm(false);
        window.alert(`¡Limpieza completada con éxito!\n\nSe creó un respaldo de seguridad previo (${data.backupFilename}).\nSe preservaron ${data.preserved.productsCount} productos, ${data.preserved.categoriesCount} categorías, ${data.preserved.usersCount} usuarios y toda su configuración fiscal intacta.\n\nSe eliminaron todas las ventas y comprobantes de prueba. El sistema está listo para operar en producción real.`);
        window.location.reload();
      } else {
        window.alert('Error al ejecutar la limpieza: ' + (data.error || 'Desconocido'));
      }
    } catch (err: any) {
      window.alert('Error al comunicarse con el servidor: ' + err.message);
    } finally {
      setIsClearingData(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('⚠️ ADVERTENCIA: Restaurar un respaldo sobrescribirá toda la información y configuración actual de la base de datos (ventas, productos, clientes y consecutivos). ¿Desea continuar?')) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonContent = event.target?.result as string;
        const backupObj = JSON.parse(jsonContent);

        const res = await fetch('/api/backup/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(backupObj)
        });
        const data = await res.json();
        if (data.success) {
          window.alert('¡Respaldo restaurado exitosamente! La aplicación se recargará para aplicar los cambios.');
          window.location.reload();
        } else {
          window.alert('Error al restaurar respaldo: ' + (data.error || 'Desconocido'));
        }
      } catch (err: any) {
        window.alert('Error procesando archivo JSON de respaldo: ' + err.message);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const today = getCostaRicaDate();
  const todaySales = (sales || []).filter(s => {
    if (!s) return false;
    const sDate = s.timestamp ? getCostaRicaDate(s.timestamp) : s.date;
    return sDate === today;
  });

  const totalSalesCRC = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);
  const electronicDocs = todaySales.filter(s => s.invoiceStatus === 'INVOICED' || Boolean(s.numericKey50));
  const totalInvoicesCount = electronicDocs.length;
  const tiquetesCount = electronicDocs.filter(s => s.electronicDocumentType === '04' || !s.electronicDocumentType).length;
  const facturasCount = electronicDocs.filter(s => s.electronicDocumentType === '01').length;
  const pendingOrdersCount = todaySales.filter(s => s.orderStatus === 'CONFIRMED' || s.orderStatus === 'PREPARING').length;
  const readyOrdersCount = todaySales.filter(s => s.orderStatus === 'READY').length;

  // Payments breakdown
  const cashTotal = todaySales.reduce((sum, s) => sum + (s.payments || []).filter(p => p.method === 'CASH').reduce((pSum, p) => pSum + (p.amount || 0), 0), 0);
  const cardTotal = todaySales.reduce((sum, s) => sum + (s.payments || []).filter(p => p.method === 'CARD').reduce((pSum, p) => pSum + (p.amount || 0), 0), 0);
  const sinpeTotal = todaySales.reduce((sum, s) => sum + (s.payments || []).filter(p => p.method === 'SINPE').reduce((pSum, p) => pSum + (p.amount || 0), 0), 0);
  const transferTotal = todaySales.reduce((sum, s) => sum + (s.payments || []).filter(p => p.method === 'TRANSFER').reduce((pSum, p) => pSum + (p.amount || 0), 0), 0);

  // Top selling products calculation
  const productSalesMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
  (sales || []).forEach(sale => {
    (sale?.items || []).forEach(item => {
      if (!item) return;
      const pid = item.productId || item.name;
      if (!productSalesMap[pid]) {
        productSalesMap[pid] = { name: item.name || 'Producto', quantity: 0, revenue: 0 };
      }
      productSalesMap[pid].quantity += (item.quantity || 1);
      productSalesMap[pid].revenue += (item.price || 0) * (item.quantity || 1);
    });
  });

  const topProducts = Object.values(productSalesMap)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  // Low stock alert (< 30 items)
  const lowStockProducts = products.filter(p => p.inventory < 30);

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-100px)] overflow-y-auto bg-stone-50 p-4 space-y-4">
      
      {/* Top Banner with Sub-tabs */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="font-extrabold text-base sm:text-lg text-stone-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-600" />
              <span>Reportes Gerenciales • Sabor Cervanteño</span>
            </h2>
          </div>
          <p className="text-xs text-stone-500">
            Resumen diario de facturación, estado de comandas y gestión de cajeros & comisiones.
          </p>
        </div>

        {/* Sub-tab Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-stone-100 p-1 rounded-2xl border border-stone-200 flex flex-wrap items-center gap-1">
            <button
              id="report-subtab-summary"
              onClick={() => setActiveReportTab('summary')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeReportTab === 'summary'
                  ? 'bg-white text-stone-900 shadow-xs font-black'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-amber-600" />
              <span>Resumen Diario</span>
            </button>

            <button
              id="report-subtab-libro-iva"
              onClick={() => setActiveReportTab('libro-iva')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeReportTab === 'libro-iva'
                  ? 'bg-white text-stone-900 shadow-xs font-black'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Libro IVA (D-104)</span>
            </button>

            <button
              id="report-subtab-estado-dgt"
              onClick={() => setActiveReportTab('estado-dgt')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeReportTab === 'estado-dgt'
                  ? 'bg-white text-stone-900 shadow-xs font-black'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Estado DGT</span>
            </button>

            <button
              id="report-subtab-cierre-caja"
              onClick={() => setActiveReportTab('cierre-caja')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeReportTab === 'cierre-caja'
                  ? 'bg-white text-stone-900 shadow-xs font-black'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5 text-amber-600" />
              <span>Cierre Caja (X/Z)</span>
            </button>

            <button
              id="report-subtab-tablero"
              onClick={handleOpenTablero}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeReportTab === 'tablero'
                  ? 'bg-amber-600 text-white shadow-xs font-black'
                  : 'text-stone-600 hover:text-amber-900 hover:bg-stone-200/60'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>👑 Tablero</span>
              {currentUser.role !== 'ADMINISTRADOR' && (
                <Lock className="w-3 h-3 text-stone-400 ml-0.5" />
              )}
            </button>
          </div>

          <button
            id="btn-full-backup-now"
            onClick={handleExecuteFullBackupNow}
            disabled={isBackingUpTotal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl font-black text-xs transition-colors shadow-xs cursor-pointer"
            title="Respaldar el 100% de la información (productos, clientes, ventas, comprobantes XML, llave criptográfica, turnos y sincronización con Firestore)"
          >
            {isBackingUpTotal ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Shield className="w-3.5 h-3.5 text-blue-200" />
            )}
            <span>{isBackingUpTotal ? 'Respaldando...' : 'Respaldar Todo'}</span>
          </button>

          <button
            onClick={handleDownloadUserDataBackup}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs transition-colors shadow-xs"
            title="Descargar respaldo oficial con la información creada y subida por el usuario (llave p12, comprobantes, XMLs, ventas y clientes)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Respaldo Usuario</span>
          </button>

          <button
            onClick={handleDownloadBackup}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl font-bold text-xs transition-colors shadow-2xs"
            title="Descargar archivo JSON con toda la información y configuración"
          >
            <Download className="w-3.5 h-3.5 text-amber-700" />
            <span>Bajar Respaldo</span>
          </button>

          <button
            id="btn-download-menu-backup-dashboard"
            onClick={handleDownloadMenuBackup}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold text-xs transition-colors shadow-2xs cursor-pointer"
            title="Descargar respaldo específico del menú (todas las categorías y platillos)"
          >
            <UtensilsCrossed className="w-3.5 h-3.5 text-amber-100" />
            <span>Respaldo Menú</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-900 text-white rounded-xl font-bold text-xs transition-colors shadow-2xs"
            title="Subir archivo JSON para restaurar información y configuración"
          >
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>Subir Respaldo</span>
          </button>

          {currentUser.role === 'ADMINISTRADOR' && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl font-bold text-xs transition-colors shadow-2xs"
              title="Crea respaldo automático y borra ventas/comprobantes de prueba para iniciar en producción real"
            >
              <Sparkles className="w-3.5 h-3.5 text-rose-600" />
              <span>Limpiar Pruebas</span>
            </button>
          )}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            className="hidden"
          />

          <div className="text-xs font-bold text-stone-600 bg-stone-100 px-3 py-1.5 rounded-xl border border-stone-200">
            {today}
          </div>
        </div>
      </div>

      {/* VIEW: TABLERO */}
      {activeReportTab === 'tablero' && (
        <CashierBoardTab
          currentUser={currentUser}
          sales={sales}
          products={products}
          onElevateToAdmin={onElevateToAdmin}
          onRequestAdminAuth={(onSuccess) => {
            if (onRequestAdminAuth) {
              onRequestAdminAuth(
                'Desbloqueo de Tablero',
                'Ingrese su PIN de Administrador para gestionar los cajeros y liquidar comisiones.',
                () => {
                  onElevateToAdmin?.();
                  onSuccess();
                }
              );
            } else {
              onElevateToAdmin?.();
              onSuccess();
            }
          }}
        />
      )}

      {/* VIEW: LIBRO DE VENTAS E IVA (D-104) */}
      {activeReportTab === 'libro-iva' && (
        <LibroIvaReportTab sales={sales} />
      )}

      {/* VIEW: ESTADO DGT / HACIENDA */}
      {activeReportTab === 'estado-dgt' && (
        <EstadoDgtReportTab sales={sales} />
      )}

      {/* VIEW: CIERRE DE CAJA (CORTE X & Z) */}
      {activeReportTab === 'cierre-caja' && (
        <CierreCajaReportTab 
          sales={sales} 
          cashRegister={cashRegister} 
          movements={movements} 
          currentUser={currentUser} 
        />
      )}

      {/* VIEW: GENERAL SUMMARY */}
      {activeReportTab === 'summary' && (
        <div className="space-y-4">
          {/* SPECIAL HIGHLIGHT CARD: TARJETA TABLERO */}
          <div className="bg-gradient-to-r from-amber-950 via-stone-900 to-amber-900 text-white p-5 rounded-3xl border border-amber-800/60 shadow-md flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0 shadow-inner">
                <Shield className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/30 text-amber-300 font-mono text-[10px] font-black uppercase tracking-wider">
                    Módulo Administrativo
                  </span>
                  <span className="text-stone-400 text-xs">• Control Total</span>
                </div>
                <h3 className="text-lg font-black text-amber-100 flex items-center gap-2">
                  <span>Tarjeta TABLERO: Cajeros, Permisos & Comisiones</span>
                </h3>
                <p className="text-xs text-amber-200/80 max-w-xl">
                  Acceso exclusivo para el Administrador: Cree cajeros, modifique contraseñas / PINes, asigne permisos individuales a la interfaz y contabilice ventas por períodos para calcular y liquidar comisiones.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="open-tablero-card-btn"
                onClick={handleOpenTablero}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-bold text-xs shadow-lg transition-all active:scale-95 shrink-0"
              >
                <Shield className="w-4 h-4" />
                <span>Abrir Tablero</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-1">
          <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wide flex items-center justify-between">
            <span>Ventas del Día</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-700">
            ₡{(totalSalesCRC || 0).toLocaleString('es-CR')}
          </div>
          <div className="text-[10px] text-stone-400 font-medium">
            {todaySales.length} órdenes procesadas
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-1">
          <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wide flex items-center justify-between">
            <span>Comprobantes Hacienda DGT</span>
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-teal-700">
            {totalInvoicesCount}
          </div>
          <div className="text-[10px] text-stone-600 font-bold flex items-center gap-1.5 flex-wrap">
            <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-bold">
              {tiquetesCount} TE (Tiquetes)
            </span>
            <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 font-bold">
              {facturasCount} FE (Facturas)
            </span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-1">
          <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wide flex items-center justify-between">
            <span>Comandas en Cocina</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-700">
            {pendingOrdersCount}
          </div>
          <div className="text-[10px] text-stone-400 font-medium">
            En preparación / nuevas
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-1">
          <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wide flex items-center justify-between">
            <span>Listos para Entrega</span>
            <ShoppingBag className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-700">
            {readyOrdersCount}
          </div>
          <div className="text-[10px] text-stone-400 font-medium">
            Esperando retiro
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Left 2 Cols: Payment Breakdown and Top Sellers */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Payment Methods Breakdown */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-4">
            <h3 className="font-extrabold text-sm text-stone-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-600" />
              <span>Ventas por Método de Pago (Hoy)</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] font-bold text-emerald-800 uppercase">Efectivo</div>
                <div className="text-base font-black text-emerald-900 mt-0.5">
                  ₡{(cashTotal || 0).toLocaleString('es-CR')}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                <div className="text-[10px] font-bold text-blue-800 uppercase">Tarjetas</div>
                <div className="text-base font-black text-blue-900 mt-0.5">
                  ₡{(cardTotal || 0).toLocaleString('es-CR')}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-purple-50 border border-purple-200">
                <div className="text-[10px] font-bold text-purple-800 uppercase">SINPE Móvil</div>
                <div className="text-base font-black text-purple-900 mt-0.5">
                  ₡{(sinpeTotal || 0).toLocaleString('es-CR')}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                <div className="text-[10px] font-bold text-indigo-800 uppercase">Transferencia</div>
                <div className="text-base font-black text-indigo-900 mt-0.5">
                  ₡{(transferTotal || 0).toLocaleString('es-CR')}
                </div>
              </div>
            </div>
          </div>

          {/* Top Selling Products */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-3">
            <h3 className="font-extrabold text-sm text-stone-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              <span>Productos Más Vendidos</span>
            </h3>

            <div className="space-y-2">
              {topProducts.length === 0 ? (
                <div className="py-6 text-center text-xs text-stone-400">
                  Aún no hay ventas registradas.
                </div>
              ) : (
                topProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-100 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-900 font-extrabold flex items-center justify-center text-xs">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-stone-800">{p.name}</span>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-stone-500 font-medium">{p.quantity} unidades</span>
                      <span className="font-extrabold text-amber-900">
                        ₡{(p.revenue || 0).toLocaleString('es-CR')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Inventory Alerts */}
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-3">
          <h3 className="font-extrabold text-sm text-stone-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Alertas de Inventario</span>
          </h3>

          <div className="space-y-2">
            {lowStockProducts.length === 0 ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Todos los productos cuentan con stock suficiente.</span>
              </div>
            ) : (
              lowStockProducts.map(p => (
                <div key={p.id} className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-stone-900">{p.name}</div>
                    <div className="text-[10px] text-stone-500">SKU: {p.sku}</div>
                  </div>
                  <span className="font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    Stock: {p.inventory}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      </div>
      )}

      {/* MODAL DE CONFIRMACIÓN: LIMPIAR DATOS DE PRUEBA */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-stone-900 text-base">Limpiar Datos de Prueba</h3>
                <p className="text-xs text-stone-500">Preparación para Producción Real</p>
              </div>
            </div>

            <div className="text-xs text-stone-600 bg-amber-50/70 border border-amber-200 p-3.5 rounded-2xl space-y-2">
              <div className="font-bold text-amber-950 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>¿Qué se mantendrá 100% intacto?</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-stone-700">
                <li>Todos los platillos, precios, imágenes, modificadores y CABYS.</li>
                <li>Todas las categorías y observaciones de cocina creadas.</li>
                <li>Datos fiscales del emisor, llaves de Hacienda y usuarios/cajeros.</li>
              </ul>
            </div>

            <div className="text-xs text-stone-600 bg-rose-50/60 border border-rose-200 p-3.5 rounded-2xl space-y-2">
              <div className="font-bold text-rose-950 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>¿Qué se limpiará?</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-stone-700">
                <li>Ventas de prueba acumuladas (quedan en 0).</li>
                <li>Comprobantes fiscales de prueba generados.</li>
                <li>Turnos de caja y arqueos previos (caja cerrada en 0 lista para abrir).</li>
                <li>Los consecutivos iniciarán en el número 1 para Hacienda.</li>
              </ul>
              <p className="text-[11px] text-stone-500 italic pt-1">
                * El sistema creará automáticamente un archivo de respaldo con fecha y hora antes de borrar nada.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isClearingData}
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-700 font-bold text-xs hover:bg-stone-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isClearingData}
                onClick={handleClearTestData}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors shadow-sm flex items-center gap-2"
              >
                {isClearingData ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Limpiando y respaldando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Respaldar y Limpiar Todo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN Y DETALLE DE RESPALDO TOTAL */}
      {backupResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-5">
            <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-stone-900 text-base">¡Respaldo Total Completado con Éxito!</h3>
                <p className="text-xs text-stone-500">Toda la información del negocio ha sido asegurada localmente y sincronizada con la nube.</p>
              </div>
            </div>

            <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200 text-xs space-y-2.5">
              <div className="font-black text-stone-700 flex items-center justify-between pb-1 border-b border-stone-200">
                <span>Resumen de Elementos Respaldados:</span>
                <span className="text-[10px] text-blue-600 font-mono">{new Date(backupResultModal.timestamp).toLocaleTimeString('es-CR')}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-stone-600">
                <div className="flex justify-between bg-white px-2.5 py-1.5 rounded-lg border border-stone-100">
                  <span>🍔 Productos:</span>
                  <span className="font-bold text-stone-900">{backupResultModal.summary?.products}</span>
                </div>
                <div className="flex justify-between bg-white px-2.5 py-1.5 rounded-lg border border-stone-100">
                  <span>📁 Categorías:</span>
                  <span className="font-bold text-stone-900">{backupResultModal.summary?.categories}</span>
                </div>
                <div className="flex justify-between bg-white px-2.5 py-1.5 rounded-lg border border-stone-100">
                  <span>👥 Clientes:</span>
                  <span className="font-bold text-stone-900">{backupResultModal.summary?.customers}</span>
                </div>
                <div className="flex justify-between bg-white px-2.5 py-1.5 rounded-lg border border-stone-100">
                  <span>🧾 Ventas:</span>
                  <span className="font-bold text-stone-900">{backupResultModal.summary?.sales}</span>
                </div>
                <div className="flex justify-between bg-white px-2.5 py-1.5 rounded-lg border border-stone-100">
                  <span>📄 Comprobantes:</span>
                  <span className="font-bold text-stone-900">{backupResultModal.summary?.electronicDocuments}</span>
                </div>
                <div className="flex justify-between bg-white px-2.5 py-1.5 rounded-lg border border-stone-100">
                  <span>💾 Archivos XML:</span>
                  <span className="font-bold text-stone-900">{backupResultModal.summary?.xmlFiles}</span>
                </div>
                <div className="flex justify-between bg-white px-2.5 py-1.5 rounded-lg border border-stone-100">
                  <span>💵 Mov. de Caja:</span>
                  <span className="font-bold text-stone-900">{backupResultModal.summary?.cashMovements}</span>
                </div>
                <div className="flex justify-between bg-white px-2.5 py-1.5 rounded-lg border border-stone-100">
                  <span>🔐 Llave Criptográfica:</span>
                  <span className="font-bold text-emerald-600">{backupResultModal.summary?.hasCryptographicKey ? 'Protegida' : 'No instalada'}</span>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-stone-200 flex items-center justify-between text-[11px]">
                <span className="font-bold text-stone-700">Estado en la Nube (Firestore):</span>
                <span className={`font-black px-2 py-0.5 rounded-md ${backupResultModal.cloudBackup?.synced ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {backupResultModal.cloudBackup?.synced ? 'Sincronizado' : 'Resguardo Local OK'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <a
                href="/api/backup/full/download"
                download
                className="flex-1 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-black text-xs text-center transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Descargar Copia JSON</span>
              </a>
              <button
                type="button"
                onClick={() => setBackupResultModal(null)}
                className="px-5 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs transition-colors"
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
