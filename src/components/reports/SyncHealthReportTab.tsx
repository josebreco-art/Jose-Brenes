import React, { useState, useMemo } from 'react';
import { 
  Activity, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Download, 
  ShieldCheck, 
  Calendar,
  Layers,
  Info,
  Send,
  HelpCircle,
  TrendingUp,
  FileText
} from 'lucide-react';
import { Sale } from '../../types/pos';
import { getCostaRicaDate } from '../../utils/dateUtils';

interface SyncHealthReportTabProps {
  sales: Sale[];
  onNavigateToDocuments?: () => void;
}

interface DayHealthData {
  date: string;
  dayLabel: string;
  isToday: boolean;
  totalSales: number;
  totalRevenue: number;
  emittedCount: number;
  pendingCount: number;
  errorCount: number;
  syncPercentage: number;
  statusBadge: 'EXCELLENT' | 'WARNING' | 'CRITICAL' | 'EMPTY';
  reasonText: string;
  salesList: Sale[];
}

export const SyncHealthReportTab: React.FC<SyncHealthReportTabProps> = ({ 
  sales,
  onNavigateToDocuments 
}) => {
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);
  const [metricViewMode, setMetricViewMode] = useState<'volume' | 'percentage'>('volume');
  const [visibleSeries, setVisibleSeries] = useState({
    sales: true,
    emitted: true,
    pending: true,
    errors: true
  });

  // Calcular últimos 7 días calendario (hasta hoy en Costa Rica)
  const last7Days = useMemo(() => {
    const dates: string[] = [];
    const now = new Date();
    // 7 días: hoy y los 6 días anteriores
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dates.push(getCostaRicaDate(d.getTime()));
    }
    return dates;
  }, []);

  const todayStr = useMemo(() => getCostaRicaDate(), []);

  // Construir métricas agregadas por día para los 7 días
  const daysData = useMemo<DayHealthData[]>(() => {
    const mapByDate = new Map<string, Sale[]>();
    
    // Inicializar los 7 días
    last7Days.forEach(d => mapByDate.set(d, []));

    // Agrupar ventas en el mapa
    (sales || []).forEach(s => {
      if (!s) return;
      const sDate = s.timestamp ? getCostaRicaDate(s.timestamp) : s.date;
      if (sDate && mapByDate.has(sDate)) {
        mapByDate.get(sDate)!.push(s);
      }
    });

    const dayNameFormatter = new Intl.DateTimeFormat('es-CR', { weekday: 'short', day: 'numeric', month: 'short' });

    return last7Days.map(dateStr => {
      const daySales = mapByDate.get(dateStr) || [];
      const parts = dateStr.split('-');
      const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      const formattedLabel = dayNameFormatter.format(dateObj);

      let emittedCount = 0;
      let pendingCount = 0;
      let errorCount = 0;
      let totalRevenue = 0;

      daySales.forEach(s => {
        totalRevenue += (s.total || 0);

        const hasValidKey = Boolean(s.numericKey50 && s.numericKey50.length === 50);
        const hasValidConsec = Boolean(s.consecutive20 && s.consecutive20.length === 20);
        const isHaciendaAccepted = s.haciendaStatus === 'ACEPTADO' || s.haciendaStatus === 'ACEPTADO_HACIENDA';
        const isHaciendaRejected = s.haciendaStatus === 'RECHAZADO' || s.haciendaStatus === 'RECHAZADO_HACIENDA' || s.invoiceStatus === 'ERROR';

        if (hasValidKey && hasValidConsec && (isHaciendaAccepted || s.invoiceStatus === 'INVOICED')) {
          emittedCount++;
        } else if (isHaciendaRejected) {
          errorCount++;
        } else {
          // No tiene clave o está en procesamiento / contingencia local
          pendingCount++;
        }
      });

      const totalSales = daySales.length;
      const syncPercentage = totalSales > 0 ? Math.round((emittedCount / totalSales) * 100) : 100;

      let statusBadge: 'EXCELLENT' | 'WARNING' | 'CRITICAL' | 'EMPTY' = 'EXCELLENT';
      let reasonText = '';

      if (totalSales === 0) {
        statusBadge = 'EMPTY';
        reasonText = 'Sin ventas registradas en caja para este día.';
      } else if (errorCount > 0) {
        statusBadge = 'CRITICAL';
        reasonText = `${errorCount} comprobante(s) con error o rechazo de Hacienda (revisar datos de receptor o actividad económica).`;
      } else if (pendingCount > 0) {
        statusBadge = 'WARNING';
        reasonText = `${pendingCount} venta(s) guardada(s) en caja en modo contingencia/offline que aún no fueron transmitidas a Hacienda.`;
      } else {
        statusBadge = 'EXCELLENT';
        reasonText = '100% de las ventas emitidas y respaldadas con Clave Oficial DGT.';
      }

      return {
        date: dateStr,
        dayLabel: formattedLabel,
        isToday: dateStr === todayStr,
        totalSales,
        totalRevenue,
        emittedCount,
        pendingCount,
        errorCount,
        syncPercentage,
        statusBadge,
        reasonText,
        salesList: daySales
      };
    });
  }, [sales, last7Days, todayStr]);

  // Totales de los 7 días
  const periodTotals = useMemo(() => {
    let salesCount = 0;
    let revenue = 0;
    let emitted = 0;
    let pending = 0;
    let errors = 0;

    daysData.forEach(d => {
      salesCount += d.totalSales;
      revenue += d.totalRevenue;
      emitted += d.emittedCount;
      pending += d.pendingCount;
      errors += d.errorCount;
    });

    const globalPercentage = salesCount > 0 ? Math.round((emitted / salesCount) * 100) : 100;

    return {
      salesCount,
      revenue,
      emitted,
      pending,
      errors,
      globalPercentage
    };
  }, [daysData]);

  // Escala máxima para el gráfico de barras
  const maxBarValue = useMemo(() => {
    let max = 1;
    daysData.forEach(d => {
      if (d.totalSales > max) max = d.totalSales;
      if (d.emittedCount > max) max = d.emittedCount;
      if (d.pendingCount > max) max = d.pendingCount;
      if (d.errorCount > max) max = d.errorCount;
    });
    return Math.ceil(max * 1.15); // 15% de margen superior para etiquetas
  }, [daysData]);

  // Día seleccionado actual o el primero con pendientes
  const activeDayData = useMemo(() => {
    if (selectedDayDate) {
      return daysData.find(d => d.date === selectedDayDate) || daysData[daysData.length - 1];
    }
    // Por defecto seleccionar el día con pendientes o el de hoy
    const dayWithPending = daysData.find(d => d.pendingCount > 0 || d.errorCount > 0);
    return dayWithPending || daysData[daysData.length - 1];
  }, [selectedDayDate, daysData]);

  // Exportar auditoría a CSV
  const handleExportCsv = () => {
    const headers = ['Fecha', 'Dia', 'Ventas Totales', 'Monto Facturado (CRC)', 'Emitidos con Clave DGT', 'Pendientes de Envio', 'Con Error/Rechazo', '% Sincronizacion', 'Diagnostico'];
    const rows = daysData.map(d => [
      d.date,
      `"${d.dayLabel}"`,
      d.totalSales,
      d.totalRevenue,
      d.emittedCount,
      d.pendingCount,
      d.errorCount,
      `${d.syncPercentage}%`,
      `"${d.reasonText.replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `salud_sincronizacion_7dias_${todayStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* HEADER Y DESCRIPCIÓN */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200/80 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-stone-900 tracking-tight">
                  Salud de Sincronización Fiscal
                </h2>
                <div className="flex items-center gap-2 text-xs text-stone-500 mt-0.5">
                  <span>Auditoría de Comprobantes vs Ventas en Caja</span>
                  <span aria-hidden="true">·</span>
                  <span>Últimos 7 días ({last7Days[0]} al {last7Days[last7Days.length - 1]})</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors cursor-pointer"
              title="Descargar informe forense de sincronización en formato CSV"
            >
              <Download className="w-3.5 h-3.5 text-stone-600" />
              <span>Exportar Informe CSV</span>
            </button>

            {onNavigateToDocuments && (
              <button
                onClick={onNavigateToDocuments}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-amber-600 hover:bg-amber-500 rounded-xl transition-colors shadow-2xs cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Emitir Comprobantes</span>
              </button>
            )}
          </div>
        </div>

        {/* BARRA DE DISTRIBUCIÓN GLOBAL DE 100% */}
        <div className="mt-6 pt-5 border-t border-stone-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                Índice Global de Cobertura Fiscal (7 Días)
              </span>
              <span className="text-xs font-bold text-stone-500">
                · {periodTotals.salesCount} ventas totales
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-mono font-black text-emerald-700">
                {periodTotals.emitted} emitidos ({periodTotals.globalPercentage}%)
              </span>
              {periodTotals.pending > 0 && (
                <span className="font-mono font-bold text-amber-700">
                  {periodTotals.pending} pendientes
                </span>
              )}
              {periodTotals.errors > 0 && (
                <span className="font-mono font-bold text-rose-700">
                  {periodTotals.errors} con error
                </span>
              )}
            </div>
          </div>

          {/* Barra segmentada continua */}
          <div className="w-full h-3 bg-stone-100 rounded-full overflow-hidden flex shadow-inner">
            {periodTotals.salesCount === 0 ? (
              <div className="w-full h-full bg-stone-200" title="Sin ventas en el período" />
            ) : (
              <>
                <div 
                  className="h-full bg-emerald-600 transition-all duration-500" 
                  style={{ width: `${(periodTotals.emitted / periodTotals.salesCount) * 100}%` }}
                  title={`Emitidos exitosos: ${periodTotals.emitted} (${Math.round((periodTotals.emitted / periodTotals.salesCount) * 100)}%)`}
                />
                <div 
                  className="h-full bg-amber-500 transition-all duration-500" 
                  style={{ width: `${(periodTotals.pending / periodTotals.salesCount) * 100}%` }}
                  title={`Pendientes en contingencia: ${periodTotals.pending} (${Math.round((periodTotals.pending / periodTotals.salesCount) * 100)}%)`}
                />
                <div 
                  className="h-full bg-rose-500 transition-all duration-500" 
                  style={{ width: `${(periodTotals.errors / periodTotals.salesCount) * 100}%` }}
                  title={`Con error de emisión: ${periodTotals.errors} (${Math.round((periodTotals.errors / periodTotals.salesCount) * 100)}%)`}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Ventas */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Ventas en Caja</span>
            <Layers className="w-4 h-4 text-stone-400" />
          </div>
          <div className="text-2xl font-black text-stone-900 font-mono tracking-tight">
            {periodTotals.salesCount}
          </div>
          <div className="text-xs text-stone-500 mt-1">
            Total: ₡{periodTotals.revenue.toLocaleString('es-CR')}
          </div>
        </div>

        {/* Emitidos Exitosos */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-700 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Emitidos Exitosos</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-800 font-mono tracking-tight">
            {periodTotals.emitted}
          </div>
          <div className="text-xs text-emerald-700/80 mt-1">
            {periodTotals.globalPercentage}% respaldado con Clave 50 dígitos
          </div>
        </div>

        {/* Pendientes de Envío */}
        <div className={`bg-white rounded-2xl p-5 border shadow-2xs transition-colors ${
          periodTotals.pending > 0 ? 'border-amber-300 bg-amber-50/20' : 'border-stone-200/80'
        }`}>
          <div className="flex items-center justify-between text-amber-700 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Pendientes de Envío</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-800 font-mono tracking-tight">
            {periodTotals.pending}
          </div>
          <div className="text-xs text-amber-700 mt-1">
            {periodTotals.pending > 0 ? 'En cola local / contingencia' : 'Sin comprobantes pendientes'}
          </div>
        </div>

        {/* Con Error / Rechazados */}
        <div className={`bg-white rounded-2xl p-5 border shadow-2xs transition-colors ${
          periodTotals.errors > 0 ? 'border-rose-300 bg-rose-50/20' : 'border-stone-200/80'
        }`}>
          <div className="flex items-center justify-between text-rose-700 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Errores / Rechazos</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-800 font-mono tracking-tight">
            {periodTotals.errors}
          </div>
          <div className="text-xs text-rose-700 mt-1">
            {periodTotals.errors > 0 ? 'Requieren corrección de datos' : 'Cero rechazos registrados'}
          </div>
        </div>
      </div>

      {/* GRÁFICO DE BARRAS COMPARATIVO */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200/80 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-stone-100">
          <div>
            <h3 className="text-base font-black text-stone-900 tracking-tight flex items-center gap-2">
              <span>Comparativa Diaria: Ventas vs Estado de Emisión</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Barras por día con altura proporcional a la actividad registrada
            </p>
          </div>

          {/* Selector de modo y leyenda interactiva */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Filtros de Serie Activa */}
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setVisibleSeries(prev => ({ ...prev, sales: !prev.sales }))}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  visibleSeries.sales 
                    ? 'bg-stone-900 text-white border-stone-900' 
                    : 'bg-stone-100 text-stone-400 border-stone-200 line-through'
                }`}
              >
                <span className="w-2 h-2 rounded-xs bg-stone-300" />
                <span>Ventas</span>
              </button>

              <button
                onClick={() => setVisibleSeries(prev => ({ ...prev, emitted: !prev.emitted }))}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  visibleSeries.emitted 
                    ? 'bg-emerald-600 text-white border-emerald-600' 
                    : 'bg-stone-100 text-stone-400 border-stone-200 line-through'
                }`}
              >
                <span className="w-2 h-2 rounded-xs bg-emerald-200" />
                <span>Emitidos</span>
              </button>

              <button
                onClick={() => setVisibleSeries(prev => ({ ...prev, pending: !prev.pending }))}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  visibleSeries.pending 
                    ? 'bg-amber-500 text-white border-amber-500' 
                    : 'bg-stone-100 text-stone-400 border-stone-200 line-through'
                }`}
              >
                <span className="w-2 h-2 rounded-xs bg-amber-200" />
                <span>Pendientes</span>
              </button>

              <button
                onClick={() => setVisibleSeries(prev => ({ ...prev, errors: !prev.errors }))}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  visibleSeries.errors 
                    ? 'bg-rose-500 text-white border-rose-500' 
                    : 'bg-stone-100 text-stone-400 border-stone-200 line-through'
                }`}
              >
                <span className="w-2 h-2 rounded-xs bg-rose-200" />
                <span>Errores</span>
              </button>
            </div>

            {/* Selector de escala */}
            <div className="flex items-center bg-stone-100 p-1 rounded-xl">
              <button
                onClick={() => setMetricViewMode('volume')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  metricViewMode === 'volume' 
                    ? 'bg-white text-stone-900 shadow-2xs' 
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                Volumen (N°)
              </button>
              <button
                onClick={() => setMetricViewMode('percentage')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  metricViewMode === 'percentage' 
                    ? 'bg-white text-stone-900 shadow-2xs' 
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                Porcentaje (%)
              </button>
            </div>
          </div>
        </div>

        {/* ÁREA DEL GRÁFICO DE BARRAS */}
        <div className="mt-6">
          {metricViewMode === 'volume' ? (
            /* MODO VOLUMEN (CANTIDAD DE TRANSACCIONES) */
            <div className="space-y-4">
              {/* Eje Y con líneas guía y barras */}
              <div className="h-64 flex items-end gap-2 sm:gap-4 pt-6 pb-2 px-2 border-b border-stone-200">
                {daysData.map(day => {
                  const isSelected = activeDayData.date === day.date;
                  const salesHeight = Math.max(day.totalSales > 0 ? (day.totalSales / maxBarValue) * 100 : 0, day.totalSales > 0 ? 4 : 0);
                  const emittedHeight = Math.max(day.emittedCount > 0 ? (day.emittedCount / maxBarValue) * 100 : 0, day.emittedCount > 0 ? 4 : 0);
                  const pendingHeight = Math.max(day.pendingCount > 0 ? (day.pendingCount / maxBarValue) * 100 : 0, day.pendingCount > 0 ? 4 : 0);
                  const errorHeight = Math.max(day.errorCount > 0 ? (day.errorCount / maxBarValue) * 100 : 0, day.errorCount > 0 ? 4 : 0);

                  return (
                    <div 
                      key={day.date}
                      onClick={() => setSelectedDayDate(day.date)}
                      className={`flex-1 h-full flex flex-col justify-end items-center cursor-pointer rounded-xl p-1.5 transition-all group ${
                        isSelected 
                          ? 'bg-amber-50/70 ring-2 ring-amber-500/60' 
                          : 'hover:bg-stone-50'
                      }`}
                    >
                      {/* Cluster de 4 barras agrupadas */}
                      <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-48">
                        {/* Barra 1: Total Ventas */}
                        {visibleSeries.sales && (
                          <div 
                            className="flex-1 max-w-[14px] bg-stone-800 rounded-t-sm transition-all duration-300 group-hover:brightness-110 relative flex justify-center"
                            style={{ height: `${salesHeight}%` }}
                            title={`Ventas: ${day.totalSales}`}
                          >
                            {day.totalSales > 0 && (
                              <span className="absolute -top-5 text-[10px] font-mono font-bold text-stone-700 hidden group-hover:block whitespace-nowrap z-10 bg-white px-1 rounded-sm shadow-2xs border border-stone-200">
                                {day.totalSales}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Barra 2: Emitidos Exitosos */}
                        {visibleSeries.emitted && (
                          <div 
                            className="flex-1 max-w-[14px] bg-emerald-600 rounded-t-sm transition-all duration-300 group-hover:brightness-110 relative flex justify-center"
                            style={{ height: `${emittedHeight}%` }}
                            title={`Emitidos: ${day.emittedCount}`}
                          >
                            {day.emittedCount > 0 && (
                              <span className="absolute -top-5 text-[10px] font-mono font-bold text-emerald-800 hidden group-hover:block whitespace-nowrap z-10 bg-white px-1 rounded-sm shadow-2xs border border-emerald-200">
                                {day.emittedCount}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Barra 3: Pendientes */}
                        {visibleSeries.pending && (
                          <div 
                            className={`flex-1 max-w-[14px] rounded-t-sm transition-all duration-300 group-hover:brightness-110 relative flex justify-center ${
                              day.pendingCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-amber-400'
                            }`}
                            style={{ height: `${pendingHeight}%` }}
                            title={`Pendientes: ${day.pendingCount}`}
                          >
                            {day.pendingCount > 0 && (
                              <span className="absolute -top-5 text-[10px] font-mono font-bold text-amber-900 hidden group-hover:block whitespace-nowrap z-10 bg-white px-1 rounded-sm shadow-2xs border border-amber-300">
                                {day.pendingCount}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Barra 4: Con Error */}
                        {visibleSeries.errors && (
                          <div 
                            className="flex-1 max-w-[14px] bg-rose-500 rounded-t-sm transition-all duration-300 group-hover:brightness-110 relative flex justify-center"
                            style={{ height: `${errorHeight}%` }}
                            title={`Con Error: ${day.errorCount}`}
                          >
                            {day.errorCount > 0 && (
                              <span className="absolute -top-5 text-[10px] font-mono font-bold text-rose-800 hidden group-hover:block whitespace-nowrap z-10 bg-white px-1 rounded-sm shadow-2xs border border-rose-300">
                                {day.errorCount}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Eje X: Etiquetas de Día */}
                      <div className="w-full text-center mt-2 pt-1 border-t border-stone-100">
                        <div className={`text-[11px] font-black capitalize truncate ${
                          isSelected ? 'text-amber-800 font-black' : 'text-stone-700'
                        }`}>
                          {day.dayLabel.split(' ')[0]}
                        </div>
                        <div className="text-[10px] text-stone-400 font-mono">
                          {day.date.split('-').slice(1).join('/')}
                        </div>
                        {day.isToday && (
                          <span className="inline-block mt-0.5 text-[9px] font-bold text-amber-700 uppercase">
                            Hoy
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* MODO PORCENTAJE (TASA DE COBERTURA FISCAL %) */
            <div className="space-y-4">
              <div className="h-64 flex items-end gap-3 sm:gap-5 pt-6 pb-2 px-2 border-b border-stone-200">
                {daysData.map(day => {
                  const isSelected = activeDayData.date === day.date;
                  const pct = day.totalSales > 0 ? day.syncPercentage : 0;
                  const barColor = pct === 100 ? 'bg-emerald-600' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500';

                  return (
                    <div
                      key={day.date}
                      onClick={() => setSelectedDayDate(day.date)}
                      className={`flex-1 h-full flex flex-col justify-end items-center cursor-pointer rounded-xl p-1.5 transition-all group ${
                        isSelected ? 'bg-amber-50/70 ring-2 ring-amber-500/60' : 'hover:bg-stone-50'
                      }`}
                    >
                      <div className="w-full flex items-end justify-center h-48 relative">
                        <div
                          className={`w-full max-w-[32px] rounded-t-md transition-all duration-300 relative flex justify-center ${barColor}`}
                          style={{ height: `${pct}%` }}
                        >
                          <span className="absolute -top-5 text-[11px] font-mono font-bold text-stone-800">
                            {day.totalSales > 0 ? `${pct}%` : 'N/A'}
                          </span>
                        </div>
                      </div>

                      <div className="w-full text-center mt-2 pt-1 border-t border-stone-100">
                        <div className="text-[11px] font-black capitalize truncate text-stone-700">
                          {day.dayLabel.split(' ')[0]}
                        </div>
                        <div className="text-[10px] text-stone-400 font-mono">
                          {day.date.split('-').slice(1).join('/')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* NOTA DE LEYENDA INFERIOR */}
          <div className="flex flex-wrap items-center justify-between text-xs text-stone-500 pt-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-stone-800 inline-block" />
                <span>Ventas registradas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block" />
                <span>Comprobantes exitosos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" />
                <span>Pendientes en contingencia</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-rose-500 inline-block" />
                <span>Errores / Rechazos</span>
              </div>
            </div>
            <div className="text-stone-400 text-[11px] italic">
              Haz clic en cualquier día para ver el diagnóstico detallado abajo
            </div>
          </div>
        </div>
      </div>

      {/* PANEL DE DIAGNÓSTICO DEL DÍA SELECCIONADO: ¿POR QUÉ NO SE EMITIERON? */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200/80 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-5 border-b border-stone-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                Diagnóstico de Sincronización
              </span>
              <span className="text-xs text-stone-400">·</span>
              <span className="text-xs font-mono font-bold text-stone-600">
                {activeDayData.date} ({activeDayData.dayLabel})
              </span>
              {activeDayData.isToday && (
                <span className="text-[10px] font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                  HOY
                </span>
              )}
            </div>
            <h3 className="text-lg font-black text-stone-900 mt-1">
              {activeDayData.totalSales === 0 
                ? 'Sin actividad en caja este día'
                : activeDayData.pendingCount === 0 && activeDayData.errorCount === 0
                ? 'Sincronización Fiscal 100% Exitosa'
                : `Atención: ${activeDayData.pendingCount} comprobante(s) no emitidos / pendientes`}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-3 py-1.5 rounded-xl border ${
              activeDayData.statusBadge === 'EXCELLENT' 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                : activeDayData.statusBadge === 'WARNING'
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : activeDayData.statusBadge === 'CRITICAL'
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-stone-50 text-stone-600 border-stone-200'
            }`}>
              {activeDayData.statusBadge === 'EXCELLENT' && '✓ Al día con Hacienda'}
              {activeDayData.statusBadge === 'WARNING' && '⏳ En cola de contingencia'}
              {activeDayData.statusBadge === 'CRITICAL' && '⚠ Requiere Corrección'}
              {activeDayData.statusBadge === 'EMPTY' && 'Sin Ventas'}
            </span>
          </div>
        </div>

        {/* EXPLICACIÓN FORENSE DE LA CAUSA (SOLO DAME UNA RAZÓN DEL POR QUÉ NO) */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2 space-y-3">
            <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
              <Info className="w-4 h-4 text-stone-500" />
              <span>Análisis de Causa Raíz</span>
            </h4>
            <div className={`p-4 rounded-xl border text-sm leading-relaxed ${
              activeDayData.statusBadge === 'EXCELLENT'
                ? 'bg-emerald-50/40 border-emerald-200/80 text-emerald-900'
                : activeDayData.statusBadge === 'WARNING'
                ? 'bg-amber-50/40 border-amber-200/80 text-amber-950'
                : activeDayData.statusBadge === 'CRITICAL'
                ? 'bg-rose-50/40 border-rose-200/80 text-rose-950'
                : 'bg-stone-50 border-stone-200 text-stone-700'
            }`}>
              {activeDayData.reasonText}
              
              {activeDayData.pendingCount > 0 && (
                <div className="mt-3 pt-3 border-t border-amber-200/60 text-xs text-amber-900 space-y-1.5">
                  <p className="font-bold">
                    ¿Por qué ocurrió esto?
                  </p>
                  <p>
                    Las órdenes se cobraron y registraron correctamente en la base de datos de la caja, pero la tablet o el navegador operó en <strong>modo contingencia local</strong> y no completó la transmisión del paquete XML hacia los servidores del Ministerio de Hacienda.
                  </p>
                  <p className="font-semibold text-amber-800">
                    Normativa DGT Costa Rica: Se cuenta con un plazo de hasta 2 días hábiles para transmitir comprobantes emitidos en contingencia sin sanción tributaria.
                  </p>
                </div>
              )}

              {activeDayData.errorCount > 0 && (
                <div className="mt-3 pt-3 border-t border-rose-200/60 text-xs text-rose-900 space-y-1">
                  <p className="font-bold">
                    Causas habituales de rechazo:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Cédula o identificación del cliente no coincide con el padrón del Registro Civil / Hacienda.</li>
                    <li>Actividad económica del receptor omitida en Factura Electrónica (código 01).</li>
                    <li>Código CABYS inválido o tasa de IVA desactualizada.</li>
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* RESUMEN NUMÉRICO DEL DÍA */}
          <div className="bg-stone-50 rounded-xl p-4 border border-stone-200 space-y-3">
            <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
              Resumen del Día
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-stone-200">
                <span className="text-stone-500">Ventas Registradas:</span>
                <span className="font-mono font-bold text-stone-900">{activeDayData.totalSales}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-200">
                <span className="text-stone-500">Monto Facturado:</span>
                <span className="font-mono font-bold text-stone-900">₡{activeDayData.totalRevenue.toLocaleString('es-CR')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-200">
                <span className="text-emerald-700">Emitidos a Hacienda:</span>
                <span className="font-mono font-bold text-emerald-800">{activeDayData.emittedCount}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-200">
                <span className="text-amber-700">Pendientes / Offline:</span>
                <span className="font-mono font-bold text-amber-800">{activeDayData.pendingCount}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-rose-700">Errores / Rechazos:</span>
                <span className="font-mono font-bold text-rose-800">{activeDayData.errorCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* LISTA DE TRANSACCIONES DEL DÍA SELECCIONADO */}
        {activeDayData.salesList.length > 0 && (
          <div className="mt-6 pt-5 border-t border-stone-100">
            <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-3">
              Detalle de Ventas del {activeDayData.dayLabel} ({activeDayData.salesList.length})
            </h4>
            
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-stone-100 text-stone-600 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3 rounded-l-lg">Orden</th>
                    <th className="py-2.5 px-3">Hora</th>
                    <th className="py-2.5 px-3">Cliente</th>
                    <th className="py-2.5 px-3">Total (CRC)</th>
                    <th className="py-2.5 px-3">Consecutivo</th>
                    <th className="py-2.5 px-3">Clave 50 Dígitos</th>
                    <th className="py-2.5 px-3 rounded-r-lg">Estado de Sincronización</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {activeDayData.salesList.map(s => {
                    const hasKey = Boolean(s.numericKey50 && s.numericKey50.length === 50);
                    const isAccepted = s.haciendaStatus === 'ACEPTADO' || s.haciendaStatus === 'ACEPTADO_HACIENDA' || (hasKey && s.invoiceStatus === 'INVOICED');
                    const isRejected = s.haciendaStatus === 'RECHAZADO' || s.invoiceStatus === 'ERROR';

                    return (
                      <tr key={s.id} className="hover:bg-stone-50/80 transition-colors">
                        <td className="py-2 px-3 font-mono font-bold text-stone-900">
                          #{s.orderNumber}
                        </td>
                        <td className="py-2 px-3 text-stone-500 font-mono">
                          {s.time || '--:--'}
                        </td>
                        <td className="py-2 px-3 text-stone-700 font-medium">
                          {s.customerName || 'Cliente de Contado'}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-stone-900">
                          ₡{(s.total || 0).toLocaleString('es-CR')}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-stone-600">
                          {s.consecutive20 || <span className="text-stone-400 italic">Sin consecutivo</span>}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]">
                          {hasKey ? (
                            <span className="text-emerald-700 font-bold" title={s.numericKey50}>
                              {s.numericKey50?.slice(0, 10)}...{s.numericKey50?.slice(-6)}
                            </span>
                          ) : (
                            <span className="text-stone-400 italic">No asignada</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {isAccepted ? (
                            <span className="text-emerald-800 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Emitido (Aceptado)</span>
                            </span>
                          ) : isRejected ? (
                            <span className="text-rose-800 font-bold flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>Error / Rechazado</span>
                            </span>
                          ) : (
                            <span className="text-amber-800 font-bold flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              <span>Pendiente en Cola</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* TABLA DE AUDITORÍA COMPARATIVA DE LOS 7 DÍAS */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200/80 shadow-2xs">
        <h3 className="text-base font-black text-stone-900 tracking-tight mb-1">
          Tabla Histórica de Sincronización (7 Días)
        </h3>
        <p className="text-xs text-stone-500 mb-4">
          Resumen día a día de órdenes cobradas vs comprobantes formalmente transmitidos a la DGT
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-100 text-stone-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-3 rounded-l-lg">Fecha</th>
                <th className="py-3 px-3">Día</th>
                <th className="py-3 px-3">Ventas</th>
                <th className="py-3 px-3">Monto (CRC)</th>
                <th className="py-3 px-3">Emitidos</th>
                <th className="py-3 px-3">Pendientes</th>
                <th className="py-3 px-3">Errores</th>
                <th className="py-3 px-3">Cobertura</th>
                <th className="py-3 px-3 rounded-r-lg">Estado & Razón</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {daysData.map(d => {
                const isSelected = activeDayData.date === d.date;
                return (
                  <tr 
                    key={d.date} 
                    onClick={() => setSelectedDayDate(d.date)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-amber-50/60 font-semibold' : 'hover:bg-stone-50'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-stone-900">
                      {d.date}
                      {d.isToday && (
                        <span className="ml-1.5 text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-sm">
                          HOY
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-stone-600 capitalize">
                      {d.dayLabel}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-stone-900">
                      {d.totalSales}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-stone-700">
                      ₡{d.totalRevenue.toLocaleString('es-CR')}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                      {d.emittedCount}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-amber-700">
                      {d.pendingCount > 0 ? d.pendingCount : <span className="text-stone-300">0</span>}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-rose-700">
                      {d.errorCount > 0 ? d.errorCount : <span className="text-stone-300">0</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-stone-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${
                              d.syncPercentage === 100 ? 'bg-emerald-600' : d.syncPercentage >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${d.totalSales > 0 ? d.syncPercentage : 0}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] font-bold text-stone-700">
                          {d.totalSales > 0 ? `${d.syncPercentage}%` : '--'}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-stone-600">
                      {d.reasonText}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-stone-50 font-bold text-stone-900 border-t-2 border-stone-200">
              <tr>
                <td colSpan={2} className="py-3 px-3 uppercase text-[11px]">
                  Totales 7 Días
                </td>
                <td className="py-3 px-3 font-mono">{periodTotals.salesCount}</td>
                <td className="py-3 px-3 font-mono">₡{periodTotals.revenue.toLocaleString('es-CR')}</td>
                <td className="py-3 px-3 font-mono text-emerald-800">{periodTotals.emitted}</td>
                <td className="py-3 px-3 font-mono text-amber-800">{periodTotals.pending}</td>
                <td className="py-3 px-3 font-mono text-rose-800">{periodTotals.errors}</td>
                <td className="py-3 px-3 font-mono text-emerald-800">{periodTotals.globalPercentage}%</td>
                <td className="py-3 px-3 text-[11px] text-stone-500 font-normal">
                  {periodTotals.pending > 0 
                    ? `Hay ${periodTotals.pending} venta(s) esperando emisión manual/en línea` 
                    : 'Todas las ventas registradas cuentan con comprobante'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
