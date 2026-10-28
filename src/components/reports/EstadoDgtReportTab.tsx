import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Search, 
  Copy, 
  Check, 
  Download, 
  RefreshCw, 
  ExternalLink,
  Calendar,
  Building2,
  FileText
} from 'lucide-react';
import { Sale } from '../../types/pos';
import { getCostaRicaDate } from '../../utils/dateUtils';

interface EstadoDgtReportTabProps {
  sales: Sale[];
}

export const EstadoDgtReportTab: React.FC<EstadoDgtReportTabProps> = ({ sales }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACEPTADO' | 'PENDIENTE' | 'RECHAZADO'>('ALL');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Filtrar ventas que representen comprobantes electrónicos
  const electronicDocs = useMemo(() => {
    return (sales || []).filter(s => {
      if (!s) return false;
      return Boolean(s.consecutive20 || s.numericKey50 || s.electronicDocumentType || s.invoiceStatus === 'INVOICED');
    });
  }, [sales]);

  // Contadores de estado
  const metrics = useMemo(() => {
    let aceptados = 0;
    let pendientes = 0;
    let rechazados = 0;

    electronicDocs.forEach(s => {
      const st = s.haciendaStatus;
      if (st === 'ACEPTADO' || st === 'ACEPTADO_HACIENDA') {
        aceptados++;
      } else if (st === 'RECHAZADO' || st === 'RECHAZADO_HACIENDA' || s.invoiceStatus === 'ERROR') {
        rechazados++;
      } else {
        pendientes++;
      }
    });

    return {
      total: electronicDocs.length,
      aceptados,
      pendientes,
      rechazados,
      efectividad: electronicDocs.length > 0 ? ((aceptados / electronicDocs.length) * 100).toFixed(1) : '100'
    };
  }, [electronicDocs]);

  // Filtro de búsqueda y estado
  const filteredDocs = useMemo(() => {
    return electronicDocs.filter(doc => {
      const st = doc.haciendaStatus;
      const isAccepted = st === 'ACEPTADO' || st === 'ACEPTADO_HACIENDA';
      const isRejected = st === 'RECHAZADO' || st === 'RECHAZADO_HACIENDA' || doc.invoiceStatus === 'ERROR';
      const isPending = !isAccepted && !isRejected;

      if (statusFilter === 'ACEPTADO' && !isAccepted) return false;
      if (statusFilter === 'RECHAZADO' && !isRejected) return false;
      if (statusFilter === 'PENDIENTE' && !isPending) return false;

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const clave = (doc.numericKey50 || '').toLowerCase();
      const consec = (doc.consecutive20 || doc.invoiceNumber || '').toLowerCase();
      const client = (doc.customerName || '').toLowerCase();
      const id = (doc.customerIdentification || '').toLowerCase();

      return clave.includes(term) || consec.includes(term) || client.includes(term) || id.includes(term);
    });
  }, [electronicDocs, statusFilter, searchTerm]);

  const handleCopyClave = (clave: string) => {
    navigator.clipboard.writeText(clave);
    setCopiedKey(clave);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleExportCsv = () => {
    const headers = [
      'Fecha',
      'Hora',
      'Tipo Comprobante',
      'Consecutivo (20 digitos)',
      'Clave Numerica Hacienda (50 digitos)',
      'Estado DGT',
      'Cliente / Receptor',
      'Cedula',
      'Total (CRC)',
      'IVA (CRC)',
      'Mensaje Hacienda'
    ];

    const rows = filteredDocs.map(d => {
      const tipo = d.electronicDocumentType === '01' ? 'Factura Electronica' : d.electronicDocumentType === '03' ? 'Nota de Credito' : 'Tiquete Electronico';
      return [
        d.date || '',
        d.time || '',
        `"${tipo}"`,
        `"${d.consecutive20 || d.invoiceNumber || ''}"`,
        `"${d.numericKey50 || ''}"`,
        `"${d.haciendaStatus || 'EMITIDO'}"`,
        `"${(d.customerName || 'Cliente de contado').replace(/"/g, '""')}"`,
        `"${d.customerIdentification || 'Consumidor Final'}"`,
        (d.total || 0).toFixed(2),
        (d.taxTotal || 0).toFixed(2),
        `"${(d.haciendaResponseMessage || '').replace(/"/g, '""')}"`
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Estado_DGT_Hacienda_${getCostaRicaDate()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-stone-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span>Auditoría y Estado de Comprobantes DGT / Hacienda</span>
          </h3>
          <p className="text-xs text-stone-500">
            Control de claves de 50 dígitos, respuestas oficiales ATV y trazabilidad de emisión v4.4.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Exportar a Excel (CSV)</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div 
          onClick={() => setStatusFilter('ALL')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'ALL'
              ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
              : 'bg-white text-stone-800 border-stone-200 hover:border-stone-300'
          }`}
        >
          <div className="text-[10px] font-black uppercase tracking-wider opacity-75">
            Total Emitidos
          </div>
          <div className="text-xl font-black mt-1">{metrics.total}</div>
          <div className="text-[10px] opacity-75 mt-0.5">Efectividad: {metrics.efectividad}%</div>
        </div>

        <div 
          onClick={() => setStatusFilter('ACEPTADO')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'ACEPTADO'
              ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
              : 'bg-emerald-50 text-emerald-950 border-emerald-200 hover:border-emerald-300'
          }`}
        >
          <div className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center justify-between">
            <span>Aceptados Hacienda</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-xl font-black mt-1 text-emerald-950">{metrics.aceptados}</div>
          <div className="text-[10px] text-emerald-700 mt-0.5">Respaldados legalmente</div>
        </div>

        <div 
          onClick={() => setStatusFilter('PENDIENTE')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'PENDIENTE'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
              : 'bg-amber-50 text-amber-950 border-amber-200 hover:border-amber-300'
          }`}
        >
          <div className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center justify-between">
            <span>En Proceso / Pendientes</span>
            <Clock className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-xl font-black mt-1 text-amber-950">{metrics.pendientes}</div>
          <div className="text-[10px] text-amber-700 mt-0.5">En cola o procesando</div>
        </div>

        <div 
          onClick={() => setStatusFilter('RECHAZADO')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'RECHAZADO'
              ? 'bg-rose-700 text-white border-rose-700 shadow-sm'
              : 'bg-rose-50 text-rose-950 border-rose-200 hover:border-rose-300'
          }`}
        >
          <div className="text-[10px] font-black uppercase tracking-wider text-rose-800 flex items-center justify-between">
            <span>Rechazos / Error</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-xl font-black mt-1 text-rose-950">{metrics.rechazados}</div>
          <div className="text-[10px] text-rose-700 mt-0.5">Requieren revisión</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por Clave de 50 dígitos, Consecutivo, Cliente o Cédula..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl text-xs font-bold">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1 rounded-lg transition-all ${
              statusFilter === 'ALL' ? 'bg-white shadow-xs text-stone-900' : 'text-stone-600'
            }`}
          >
            Todos ({metrics.total})
          </button>
          <button
            onClick={() => setStatusFilter('ACEPTADO')}
            className={`px-3 py-1 rounded-lg transition-all ${
              statusFilter === 'ACEPTADO' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-800'
            }`}
          >
            Aceptados ({metrics.aceptados})
          </button>
          <button
            onClick={() => setStatusFilter('PENDIENTE')}
            className={`px-3 py-1 rounded-lg transition-all ${
              statusFilter === 'PENDIENTE' ? 'bg-amber-600 text-white shadow-xs' : 'text-amber-800'
            }`}
          >
            Pendientes ({metrics.pendientes})
          </button>
          <button
            onClick={() => setStatusFilter('RECHAZADO')}
            className={`px-3 py-1 rounded-lg transition-all ${
              statusFilter === 'RECHAZADO' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-800'
            }`}
          >
            Rechazados ({metrics.rechazados})
          </button>
        </div>
      </div>

      {/* Documents List */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] scrollbar-thin">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-100 text-stone-700 font-black uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-stone-200">
              <tr>
                <th className="py-2.5 px-3">Fecha y Hora</th>
                <th className="py-2.5 px-3">Documento</th>
                <th className="py-2.5 px-3">Consecutivo</th>
                <th className="py-2.5 px-3">Clave 50 Dígitos (Hacienda)</th>
                <th className="py-2.5 px-3">Receptor</th>
                <th className="py-2.5 px-3 text-right">Total (CRC)</th>
                <th className="py-2.5 px-3">Estado DGT</th>
                <th className="py-2.5 px-3">Detalle / Mensaje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-stone-400 font-medium">
                    No se encontraron comprobantes que coincidan con la búsqueda o filtro.
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc) => {
                  const isAccepted = doc.haciendaStatus === 'ACEPTADO' || doc.haciendaStatus === 'ACEPTADO_HACIENDA';
                  const isRejected = doc.haciendaStatus === 'RECHAZADO' || doc.haciendaStatus === 'RECHAZADO_HACIENDA';
                  const isFE = doc.electronicDocumentType === '01';
                  const isNC = doc.electronicDocumentType === '03';

                  return (
                    <tr key={doc.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap font-medium text-stone-600">
                        {doc.date} <span className="text-[10px] text-stone-400">{doc.time}</span>
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
                        {doc.consecutive20 || doc.invoiceNumber || '-'}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {doc.numericKey50 ? (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[10px] bg-stone-100 px-2 py-0.5 rounded text-stone-800 tracking-tighter">
                              {doc.numericKey50.slice(0, 10)}...{doc.numericKey50.slice(-10)}
                            </span>
                            <button
                              onClick={() => handleCopyClave(doc.numericKey50!)}
                              className="p-1 text-stone-400 hover:text-stone-700 rounded transition-colors"
                              title="Copiar clave completa de 50 dígitos"
                            >
                              {copiedKey === doc.numericKey50 ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-stone-400 italic">No generada</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="font-bold text-stone-800 truncate max-w-[160px]">
                          {doc.customerName || 'Cliente de contado'}
                        </div>
                        <div className="text-[10px] text-stone-400 font-mono">
                          {doc.customerIdentification || 'Consumidor Final'}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-black text-stone-900 whitespace-nowrap">
                        ₡{(doc.total || 0).toLocaleString('es-CR')}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          isAccepted
                            ? 'bg-emerald-100 text-emerald-800'
                            : isRejected
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}>
                          {isAccepted && <CheckCircle2 className="w-3 h-3" />}
                          {isRejected && <AlertTriangle className="w-3 h-3" />}
                          {!isAccepted && !isRejected && <Clock className="w-3 h-3" />}
                          <span>{doc.haciendaStatus || 'EMITIDO'}</span>
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-[11px] text-stone-600 max-w-[200px] truncate" title={doc.haciendaResponseMessage || ''}>
                        {doc.haciendaResponseMessage || (isAccepted ? 'Aceptado por DGT' : 'En procesamiento')}
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
