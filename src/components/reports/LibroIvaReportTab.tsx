import React, { useState, useMemo, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Printer, 
  Calendar, 
  DollarSign, 
  Receipt, 
  Building2, 
  CheckCircle2, 
  AlertCircle, 
  ArrowUpDown, 
  Search,
  Filter,
  Download
} from 'lucide-react';
import { Sale } from '../../types/pos';
import { getCostaRicaDate } from '../../utils/dateUtils';
import { PosApiService } from '../../services/api';

interface LibroIvaReportTabProps {
  sales: Sale[];
}

export const LibroIvaReportTab: React.FC<LibroIvaReportTabProps> = ({ sales }) => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // 1-12

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [dateMode, setDateMode] = useState<'month' | 'range'>('month');
  const [startDate, setStartDate] = useState<string>(
    `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
  );
  const [endDate, setEndDate] = useState<string>(() => {
    const lastDay = new Date(currentYear, currentMonth, 0).getDate();
    return `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  });
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [docTypeFilter, setDocTypeFilter] = useState<'ALL' | '01' | '04' | '03'>('ALL');
  const [historicalPeriodSales, setHistoricalPeriodSales] = useState<Sale[]>([]);

  useEffect(() => {
    let active = true;
    const df = dateMode === 'month'
      ? `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
      : startDate;
    const dt = dateMode === 'month'
      ? `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth, 0).getDate()).padStart(2, '0')}`
      : endDate;

    if (df && dt) {
      PosApiService.getSales({ dateFrom: df, dateTo: dt })
        .then(res => {
          if (active && Array.isArray(res)) {
            setHistoricalPeriodSales(res);
          }
        })
        .catch(() => {});
    }
    return () => { active = false; };
  }, [dateMode, selectedYear, selectedMonth, startDate, endDate]);

  // Combinar ventas en memoria con las consultadas del período en el servidor sin duplicados
  const combinedSales = useMemo(() => {
    const map = new Map<string, Sale>();
    for (const s of (sales || [])) if (s && s.id) map.set(s.id, s);
    for (const s of historicalPeriodSales) if (s && s.id) map.set(s.id, s);
    return Array.from(map.values());
  }, [sales, historicalPeriodSales]);

  // Filtrar ventas por el período seleccionado
  const periodSales = useMemo(() => {
    return combinedSales.filter(sale => {
      if (!sale) return false;
      const saleDate = sale.timestamp ? getCostaRicaDate(sale.timestamp) : sale.date;
      if (!saleDate) return false;
      
      // Excluir órdenes canceladas o no facturadas
      if (sale.orderStatus === 'CANCELLED' || sale.invoiceStatus === 'CANCELLED') return false;

      if (dateMode === 'month') {
        const [y, m] = saleDate.split('-').map(Number);
        return y === selectedYear && m === selectedMonth;
      } else {
        return saleDate >= startDate && saleDate <= endDate;
      }
    });
  }, [combinedSales, dateMode, selectedYear, selectedMonth, startDate, endDate]);

  // Cálculos tributarios D-104
  const ivaSummary = useMemo(() => {
    let baseGravada13 = 0;
    let ivaCobrado13 = 0;
    let baseExenta = 0;
    let totalBruto = 0;

    let feCount = 0;
    let feBase13 = 0;
    let feIva13 = 0;
    let feExento = 0;
    let feTotal = 0;

    let teCount = 0;
    let teBase13 = 0;
    let teIva13 = 0;
    let teExento = 0;
    let teTotal = 0;

    let ncCount = 0;
    let ncTotal = 0;

    periodSales.forEach(s => {
      const docType = s.electronicDocumentType || '04';
      const saleSubtotal = Number(s.subtotal) || 0;
      const saleTax = Number(s.taxTotal) || 0;
      const saleTotal = Number(s.total) || 0;

      // Calcular si tiene exoneración o exento
      let lineGravado = 0;
      let lineIva = 0;
      let lineExento = 0;

      if (s.items && s.items.length > 0) {
        s.items.forEach(item => {
          const itemTaxRate = item.taxRate !== undefined ? item.taxRate : 0.13;
          const itemSub = Number(item.subtotal) || (Number(item.price) * Number(item.quantity)) || 0;
          const itemTax = Number(item.taxAmount) || (itemSub * itemTaxRate) || 0;

          if (itemTaxRate > 0) {
            lineGravado += itemSub;
            lineIva += itemTax;
          } else {
            lineExento += itemSub;
          }
        });
      } else {
        // Estimación si no hay items detallados
        if (saleTax > 0) {
          lineGravado = saleSubtotal;
          lineIva = saleTax;
        } else {
          lineExento = saleSubtotal;
        }
      }

      if (docType === '03') {
        // Nota de Crédito (anulación / reducción)
        ncCount++;
        ncTotal += saleTotal;
        baseGravada13 -= lineGravado;
        ivaCobrado13 -= lineIva;
        baseExenta -= lineExento;
        totalBruto -= saleTotal;
      } else if (docType === '01') {
        // Factura Electrónica
        feCount++;
        feBase13 += lineGravado;
        feIva13 += lineIva;
        feExento += lineExento;
        feTotal += saleTotal;

        baseGravada13 += lineGravado;
        ivaCobrado13 += lineIva;
        baseExenta += lineExento;
        totalBruto += saleTotal;
      } else {
        // Tiquete Electrónico (04)
        teCount++;
        teBase13 += lineGravado;
        teIva13 += lineIva;
        teExento += lineExento;
        teTotal += saleTotal;

        baseGravada13 += lineGravado;
        ivaCobrado13 += lineIva;
        baseExenta += lineExento;
        totalBruto += saleTotal;
      }
    });

    const totalNeto = baseGravada13 + baseExenta;

    return {
      baseGravada13: Math.max(0, baseGravada13),
      ivaCobrado13: Math.max(0, ivaCobrado13),
      baseExenta: Math.max(0, baseExenta),
      totalNeto: Math.max(0, totalNeto),
      totalBruto: Math.max(0, totalBruto),
      fe: { count: feCount, base13: feBase13, iva13: feIva13, exento: feExento, total: feTotal },
      te: { count: teCount, base13: teBase13, iva13: teIva13, exento: teExento, total: teTotal },
      nc: { count: ncCount, total: ncTotal }
    };
  }, [periodSales]);

  // Filtrar para la tabla de transacciones
  const filteredTableSales = useMemo(() => {
    return periodSales.filter(sale => {
      const docType = sale.electronicDocumentType || '04';
      if (docTypeFilter !== 'ALL' && docType !== docTypeFilter) return false;

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const client = (sale.customerName || '').toLowerCase();
      const id = (sale.customerIdentification || '').toLowerCase();
      const consec = (sale.consecutive20 || sale.invoiceNumber || '').toLowerCase();
      const clave = (sale.numericKey50 || '').toLowerCase();

      return client.includes(term) || id.includes(term) || consec.includes(term) || clave.includes(term);
    });
  }, [periodSales, docTypeFilter, searchTerm]);

  // Exportar a archivo CSV (formato contable compatible con Excel)
  const handleExportCsv = () => {
    const periodLabel = dateMode === 'month' 
      ? `Mes_${selectedYear}_${String(selectedMonth).padStart(2, '0')}`
      : `Periodo_${startDate}_a_${endDate}`;
    
    const headers = [
      'Fecha',
      'Hora',
      'Tipo Documento',
      'Consecutivo DGT',
      'Clave 50 Digitos',
      'Cedula Receptor',
      'Nombre Receptor',
      'Base Gravada 13%',
      'IVA 13%',
      'Venta Exenta',
      'Total Facturado (CRC)',
      'Medio de Pago',
      'Estado Hacienda'
    ];

    const rows = filteredTableSales.map(s => {
      const docName = s.electronicDocumentType === '01' ? 'Factura Electronica (01)' : s.electronicDocumentType === '03' ? 'Nota de Credito (03)' : 'Tiquete Electronico (04)';
      const paymentNames = (s.payments || []).map(p => p.method).join(' + ') || 'Efectivo';
      const sub = Number(s.subtotal) || 0;
      const tax = Number(s.taxTotal) || 0;
      const tot = Number(s.total) || 0;
      const exento = tax === 0 ? sub : 0;
      const gravado = tax > 0 ? sub : 0;

      return [
        s.date || '',
        s.time || '',
        `"${docName}"`,
        `"${s.consecutive20 || s.invoiceNumber || ''}"`,
        `"${s.numericKey50 || ''}"`,
        `"${s.customerIdentification || 'Consumidor Final'}"`,
        `"${(s.customerName || 'Cliente de contado').replace(/"/g, '""')}"`,
        gravado.toFixed(2),
        tax.toFixed(2),
        exento.toFixed(2),
        tot.toFixed(2),
        `"${paymentNames}"`,
        `"${s.haciendaStatus || 'EMITIDO'}"`
      ].join(';');
    });

    // Agregar resumen al final
    const summaryRows = [
      '',
      'RESUMEN DECLARACION D-104 (HACIENDA COSTA RICA)',
      `Base Gravada Tarifa General (13%);${ivaSummary.baseGravada13.toFixed(2)}`,
      `Total Impuesto IVA 13% Recaudado;${ivaSummary.ivaCobrado13.toFixed(2)}`,
      `Ventas Exentas / Tarifa 0%;${ivaSummary.baseExenta.toFixed(2)}`,
      `Total Ventas Netas;${ivaSummary.totalNeto.toFixed(2)}`,
      `Total Ventas Brutas;${ivaSummary.totalBruto.toFixed(2)}`,
      '',
      `Facturas Electronicas (01) Emitidas;${ivaSummary.fe.count};Total CRC;${ivaSummary.fe.total.toFixed(2)}`,
      `Tiquetes Electronicos (04) Emitidos;${ivaSummary.te.count};Total CRC;${ivaSummary.te.total.toFixed(2)}`
    ];

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows, ...summaryRows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Libro_Ventas_IVA_D104_${periodLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-stone-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-amber-600" />
            <span>Libro de Ventas e IVA • Declaración D-104</span>
          </h3>
          <p className="text-xs text-stone-500">
            Resumen tributario oficial según normativa de la Dirección General de Tributación de Costa Rica.
          </p>
        </div>

        {/* Date Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200">
            <button
              onClick={() => setDateMode('month')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                dateMode === 'month' ? 'bg-white shadow-xs text-amber-900' : 'text-stone-600'
              }`}
            >
              Por Mes
            </button>
            <button
              onClick={() => setDateMode('range')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                dateMode === 'range' ? 'bg-white shadow-xs text-amber-900' : 'text-stone-600'
              }`}
            >
              Rango de Fechas
            </button>
          </div>

          {dateMode === 'month' ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-stone-50 border border-stone-300 rounded-xl px-2.5 py-1.5 font-bold text-stone-800"
              >
                {monthNames.map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>{name}</option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-stone-50 border border-stone-300 rounded-xl px-2.5 py-1.5 font-bold text-stone-800"
              >
                {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-stone-50 border border-stone-300 rounded-xl px-2 py-1 font-bold text-stone-800"
              />
              <span className="text-stone-400 font-bold">a</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-stone-50 border border-stone-300 rounded-xl px-2 py-1 font-bold text-stone-800"
              />
            </div>
          )}

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-bold transition-colors cursor-pointer shadow-xs"
            title="Descargar libro en formato CSV para Excel o contador"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel / CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-white rounded-xl font-bold transition-colors cursor-pointer shadow-xs"
            title="Imprimir reporte oficial"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* D-104 Key Boxes (Casillas Tributarias) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-amber-50 border border-amber-200/80 p-3.5 rounded-2xl shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-amber-800">
            Base Gravada (13%)
          </div>
          <div className="text-lg font-black text-amber-950 mt-1">
            ₡{ivaSummary.baseGravada13.toLocaleString('es-CR')}
          </div>
          <div className="text-[10px] text-amber-700 mt-0.5">Venta neta sujeta a IVA</div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200/80 p-3.5 rounded-2xl shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
            IVA Recaudado (13%)
          </div>
          <div className="text-lg font-black text-emerald-950 mt-1">
            ₡{ivaSummary.ivaCobrado13.toLocaleString('es-CR')}
          </div>
          <div className="text-[10px] text-emerald-700 mt-0.5">Impuesto por declarar (D-104)</div>
        </div>

        <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-2xl shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-stone-600">
            Ventas Exentas (0%)
          </div>
          <div className="text-lg font-black text-stone-800 mt-1">
            ₡{ivaSummary.baseExenta.toLocaleString('es-CR')}
          </div>
          <div className="text-[10px] text-stone-500 mt-0.5">Operaciones no sujetas / exentas</div>
        </div>

        <div className="bg-blue-50 border border-blue-200/80 p-3.5 rounded-2xl shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-blue-800">
            Total Neto
          </div>
          <div className="text-lg font-black text-blue-950 mt-1">
            ₡{ivaSummary.totalNeto.toLocaleString('es-CR')}
          </div>
          <div className="text-[10px] text-blue-700 mt-0.5">Base imponible total</div>
        </div>

        <div className="bg-amber-900 text-white p-3.5 rounded-2xl shadow-xs col-span-2 sm:col-span-1">
          <div className="text-[10px] font-black uppercase tracking-wider text-amber-200">
            Total Bruto Facturado
          </div>
          <div className="text-lg font-black text-white mt-1">
            ₡{ivaSummary.totalBruto.toLocaleString('es-CR')}
          </div>
          <div className="text-[10px] text-amber-300 mt-0.5">{periodSales.length} comprobantes</div>
        </div>
      </div>

      {/* Comparison: Facturas Electrónicas (01) vs Tiquetes Electrónicos (04) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center">
                01
              </span>
              <div>
                <h4 className="font-bold text-xs text-stone-900">Facturas Electrónicas (FE)</h4>
                <p className="text-[11px] text-stone-500">Emitidas a clientes identificados con cédula física o jurídica</p>
              </div>
            </div>
            <span className="text-xs font-black bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg border border-emerald-200">
              {ivaSummary.fe.count} emitidas
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="bg-stone-50 p-2 rounded-xl border border-stone-100">
              <span className="text-[10px] text-stone-500 font-bold block">Base Gravada</span>
              <span className="text-xs font-black text-stone-800">₡{ivaSummary.fe.base13.toLocaleString('es-CR')}</span>
            </div>
            <div className="bg-stone-50 p-2 rounded-xl border border-stone-100">
              <span className="text-[10px] text-stone-500 font-bold block">IVA 13%</span>
              <span className="text-xs font-black text-emerald-700">₡{ivaSummary.fe.iva13.toLocaleString('es-CR')}</span>
            </div>
            <div className="bg-stone-50 p-2 rounded-xl border border-stone-100">
              <span className="text-[10px] text-stone-500 font-bold block">Total Facturado</span>
              <span className="text-xs font-black text-stone-900">₡{ivaSummary.fe.total.toLocaleString('es-CR')}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-blue-100 text-blue-800 font-black text-xs flex items-center justify-center">
                04
              </span>
              <div>
                <h4 className="font-bold text-xs text-stone-900">Tiquetes Electrónicos (TE)</h4>
                <p className="text-[11px] text-stone-500">Emitidos a Consumidor Final / Cliente de contado</p>
              </div>
            </div>
            <span className="text-xs font-black bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200">
              {ivaSummary.te.count} emitidos
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="bg-stone-50 p-2 rounded-xl border border-stone-100">
              <span className="text-[10px] text-stone-500 font-bold block">Base Gravada</span>
              <span className="text-xs font-black text-stone-800">₡{ivaSummary.te.base13.toLocaleString('es-CR')}</span>
            </div>
            <div className="bg-stone-50 p-2 rounded-xl border border-stone-100">
              <span className="text-[10px] text-stone-500 font-bold block">IVA 13%</span>
              <span className="text-xs font-black text-emerald-700">₡{ivaSummary.te.iva13.toLocaleString('es-CR')}</span>
            </div>
            <div className="bg-stone-50 p-2 rounded-xl border border-stone-100">
              <span className="text-[10px] text-stone-500 font-bold block">Total Facturado</span>
              <span className="text-xs font-black text-stone-900">₡{ivaSummary.te.total.toLocaleString('es-CR')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction List Table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="p-3.5 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3 bg-stone-50/50">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-stone-600" />
            <h4 className="text-xs font-black text-stone-800">
              Detalle de Comprobantes ({filteredTableSales.length})
            </h4>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Buscar cliente, cédula, consecutivo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-stone-200 rounded-xl w-48 sm:w-64 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <select
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value as any)}
              className="text-xs font-bold bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 text-stone-700"
            >
              <option value="ALL">Todos los tipos</option>
              <option value="01">Solo Facturas (01)</option>
              <option value="04">Solo Tiquetes (04)</option>
              <option value="03">Notas de Crédito (03)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 scrollbar-thin">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-100 text-stone-700 font-black uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-stone-200">
              <tr>
                <th className="py-2.5 px-3">Fecha</th>
                <th className="py-2.5 px-3">Tipo</th>
                <th className="py-2.5 px-3">Consecutivo</th>
                <th className="py-2.5 px-3">Receptor / Cliente</th>
                <th className="py-2.5 px-3 text-right">Base 13%</th>
                <th className="py-2.5 px-3 text-right">IVA 13%</th>
                <th className="py-2.5 px-3 text-right">Total (CRC)</th>
                <th className="py-2.5 px-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredTableSales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-stone-400 font-medium">
                    No se encontraron comprobantes registrados en el período seleccionado.
                  </td>
                </tr>
              ) : (
                filteredTableSales.map((sale) => {
                  const isFE = sale.electronicDocumentType === '01';
                  const isNC = sale.electronicDocumentType === '03';
                  const sub = Number(sale.subtotal) || 0;
                  const tax = Number(sale.taxTotal) || 0;
                  const tot = Number(sale.total) || 0;

                  return (
                    <tr key={sale.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap font-medium text-stone-600">
                        {sale.date} <span className="text-[10px] text-stone-400">{sale.time}</span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md font-black text-[10px] ${
                          isFE 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : isNC 
                              ? 'bg-rose-100 text-rose-800' 
                              : 'bg-blue-100 text-blue-800'
                        }`}>
                          {isFE ? 'FE (01)' : isNC ? 'NC (03)' : 'TE (04)'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-stone-800 whitespace-nowrap">
                        {sale.consecutive20 || sale.invoiceNumber || '-'}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-stone-800 truncate max-w-[180px]">
                          {sale.customerName || 'Cliente de contado'}
                        </div>
                        <div className="text-[10px] text-stone-400 font-mono">
                          {sale.customerIdentification || 'Consumidor Final'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-700 whitespace-nowrap">
                        ₡{sub.toLocaleString('es-CR')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        ₡{tax.toLocaleString('es-CR')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-stone-900 whitespace-nowrap">
                        ₡{tot.toLocaleString('es-CR')}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          sale.haciendaStatus === 'ACEPTADO' || sale.haciendaStatus === 'ACEPTADO_HACIENDA'
                            ? 'bg-emerald-100 text-emerald-800'
                            : sale.haciendaStatus === 'RECHAZADO' || sale.haciendaStatus === 'RECHAZADO_HACIENDA'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}>
                          {sale.haciendaStatus || 'EMITIDO'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
