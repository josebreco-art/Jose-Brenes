import React, { useState, useEffect } from 'react';
import { 
  FileCheck, 
  Search, 
  RefreshCw, 
  Download, 
  FileText, 
  FileCode, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ShieldCheck, 
  Receipt, 
  Building2, 
  User, 
  ExternalLink,
  ChevronRight,
  Filter,
  History,
  ShieldAlert,
  Send,
  KeyRound,
  Sliders,
  Mail,
  Paperclip,
  Activity,
  Eye,
  Copy,
  Check,
  Info,
  Printer,
  Calendar
} from 'lucide-react';
import { ElectronicDocument, FiscalAuditLog, ElectronicDocumentType, HaciendaDocumentStatus, EmailDispatchLog, Sale } from '../types/pos';
import { PosApiService } from '../services/api';
import { getElectronicDocumentFileNames } from '../utils/documentNaming';
import { getCostaRicaDate, getCostaRicaTime } from '../utils/dateUtils';
import { HaciendaConfigModal } from './HaciendaConfigModal';
import { FiscalIssuerProfile } from './FiscalIssuerProfile';
import { ThermalReceiptModal } from './ThermalReceiptModal';
import { CreditNoteModal } from './CreditNoteModal';
import { offlineStorage } from '../services/offlineStorageService';

export const ElectronicDocumentsCenter: React.FC = () => {
  const [documents, setDocuments] = useState<ElectronicDocument[]>([]);
  const [auditLogs, setAuditLogs] = useState<FiscalAuditLog[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailDispatchLog[]>([]);
  const [consecutivesAudit, setConsecutivesAudit] = useState<{
    controls: any[];
    history: any[];
    keysHistory: any[];
    totalConsecutivesUsed: number;
    totalKeysGenerated: number;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeSubTab, setActiveSubTab] = useState<'DOCUMENTS' | 'ISSUER_PROFILE' | 'CONSECUTIVES_AUDIT' | 'EMAIL_LOGS' | 'AUDIT_LOGS'>('DOCUMENTS');
  
  // Direct Hacienda Config Modal State
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [queryingKey, setQueryingKey] = useState<string | null>(null);
  const [reissuingKey, setReissuingKey] = useState<string | null>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterDocType, setFilterDocType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [sortDirection, setSortDirection] = useState<'DESC' | 'ASC'>('DESC');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>('TODAY');
  const [customDateFrom, setCustomDateFrom] = useState<string>('');
  const [customDateTo, setCustomDateTo] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(20);
  const [totalServerCount, setTotalServerCount] = useState<number>(0);
  const [dateMode, setDateMode] = useState<'saleDate' | 'issueDate'>('saleDate');

  // Checkbox Selection State
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [isBatchQuerying, setIsBatchQuerying] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isEmittingBatch, setIsEmittingBatch] = useState<boolean>(false);
  const [emittingSingleId, setEmittingSingleId] = useState<string | null>(null);

  // Selected document for Comprehensive Details & Error Analysis Modal
  const [detailDoc, setDetailDoc] = useState<ElectronicDocument | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [detailTab, setDetailTab] = useState<'OVERVIEW' | 'DIAGNOSTIC' | 'XML_EMITTED' | 'XML_RESPONSE'>('OVERVIEW');
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  // Thermal Receipt Printing State (56mm / 80mm)
  const [thermalSale, setThermalSale] = useState<Sale | null>(null);
  const [isThermalModalOpen, setIsThermalModalOpen] = useState<boolean>(false);

  const handlePrintThermalReceipt = (doc: ElectronicDocument) => {
    const saleRepresentation: Sale = {
      id: doc.id || `doc-sale-${Date.now()}`,
      orderNumber: parseInt(doc.consecutive?.slice(-6) || '1', 10) || 1,
      invoiceNumber: doc.consecutive,
      orderType: 'DINE_IN',
      items: doc.lines && doc.lines.length > 0 ? doc.lines.map((line, idx) => ({
        productId: line.productId || `prod-${idx}`,
        name: line.description,
        quantity: line.quantity,
        price: line.unitPrice,
        taxRate: (line.taxRate || 13) / 100,
        subtotal: line.subtotal,
        taxAmount: line.taxAmount || 0,
        total: line.totalLine || (line.subtotal + (line.taxAmount || 0)),
        modifiers: []
      })) : [{
        productId: 'prod-gen',
        name: 'Consumo Restaurante',
        quantity: 1,
        price: doc.total,
        taxRate: 0.13,
        subtotal: doc.subtotal,
        taxAmount: doc.taxTotal,
        total: doc.total,
        modifiers: []
      }],
      subtotal: doc.subtotal,
      taxTotal: doc.taxTotal,
      discount: doc.discountTotal || 0,
      total: doc.total,
      date: doc.issueDate ? doc.issueDate.split('T')[0] : getCostaRicaDate(),
      time: doc.issueDate && doc.issueDate.includes('T') ? doc.issueDate.split('T')[1].slice(0, 5) : getCostaRicaTime().slice(0, 5),
      timestamp: doc.issueDate ? new Date(doc.issueDate).getTime() : Date.now(),
      cashierName: 'Cajero Principal',
      customerName: doc.receiver?.name || 'Consumidor Final',
      customerPhone: typeof doc.receiver?.phone === 'string' ? doc.receiver.phone : '',
      customerEmail: doc.receiver?.email || '',
      customerIdentification: doc.receiver?.identificationNumber || '',
      orderStatus: 'DELIVERED',
      payments: doc.paymentMethods && doc.paymentMethods.length > 0 ? doc.paymentMethods.map(p => ({
        method: p.method || 'CASH',
        amount: p.amount || doc.total
      })) : [{ method: 'CASH', amount: doc.total }],
      amountPaid: doc.total,
      change: 0,
      invoiceStatus: 'INVOICED',
      consecutive20: doc.consecutive,
      numericKey50: doc.numericKey,
      haciendaStatus: doc.status,
      electronicDocumentType: doc.documentType,
      cashierId: 'usr-1',
      location: 'RESTAURANTE',
      createdAt: doc.createdAt || new Date().toISOString(),
      updatedAt: doc.updatedAt || new Date().toISOString()
    };
    setThermalSale(saleRepresentation);
    setIsThermalModalOpen(true);
  };

  // Selected document for standalone XML inspection
  const [selectedDoc, setSelectedDoc] = useState<ElectronicDocument | null>(null);
  const [showXmlModal, setShowXmlModal] = useState<boolean>(false);
  const [xmlModalType, setXmlModalType] = useState<'EMITTED' | 'RESPONSE'>('EMITTED');

  // Diagnostic Logs Modal State
  const [showDiagnosticModal, setShowDiagnosticModal] = useState<boolean>(false);
  const [diagnosticTargetDoc, setDiagnosticTargetDoc] = useState<ElectronicDocument | null>(null);

  const openDocDetails = async (doc: ElectronicDocument, tab: 'OVERVIEW' | 'DIAGNOSTIC' | 'XML_EMITTED' | 'XML_RESPONSE' = 'OVERVIEW') => {
    setDetailDoc(doc);
    setDetailTab(tab);
    setCopiedKey(false);
    setIsDetailModalOpen(true);

    // Si el documento en la lista no tiene los XMLs o logs completos, cargarlos en segundo plano
    if (!doc.xmlGenerated || !doc.diagnosticLogs) {
      const fullDoc = await PosApiService.getElectronicDocumentById(doc.numericKey || doc.id);
      if (fullDoc) {
        setDetailDoc(prev => (prev && (prev.id === fullDoc.id || prev.numericKey === fullDoc.numericKey) ? fullDoc : prev));
      }
    }
  };

  const handleOpenXmlModal = async (doc: ElectronicDocument, type: 'EMITTED' | 'RESPONSE' = 'EMITTED') => {
    setSelectedDoc(doc);
    setXmlModalType(type);
    setShowXmlModal(true);

    if (!doc.xmlGenerated || !doc.xmlResponseHacienda) {
      const fullDoc = await PosApiService.getElectronicDocumentById(doc.numericKey || doc.id);
      if (fullDoc) {
        setSelectedDoc(prev => (prev && (prev.id === fullDoc.id || prev.numericKey === fullDoc.numericKey) ? fullDoc : prev));
      }
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Email Modal State
  const [isEmailModalOpen, setIsEmailModalOpen] = useState<boolean>(false);
  const [emailTargetDoc, setEmailTargetDoc] = useState<ElectronicDocument | null>(null);
  const [targetEmailAddress, setTargetEmailAddress] = useState<string>('');
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [emailFeedback, setEmailFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Credit Note Modal State
  const [isNcModalOpen, setIsNcModalOpen] = useState<boolean>(false);
  const [ncTargetDoc, setNcTargetDoc] = useState<ElectronicDocument | null>(null);
  const [ncReason, setNcReason] = useState<string>('Anulación de factura por devolución o corrección en mostrador');
  const [isEmittingNc, setIsEmittingNc] = useState<boolean>(false);
  const [ncSuccessMessage, setNcSuccessMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      // Calculate date filters
      let fromDateStr: string | undefined = undefined;
      let toDateStr: string | undefined = undefined;

      const now = new Date();
      if (dateFilter === 'TODAY') {
        fromDateStr = getCostaRicaDate(now.getTime());
        toDateStr = fromDateStr;
      } else if (dateFilter === 'YESTERDAY') {
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        fromDateStr = getCostaRicaDate(yesterday.getTime());
        toDateStr = fromDateStr;
      } else if (dateFilter === 'WEEK') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        fromDateStr = getCostaRicaDate(weekAgo.getTime());
        toDateStr = getCostaRicaDate(now.getTime());
      } else if (dateFilter === 'MONTH') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        fromDateStr = getCostaRicaDate(monthAgo.getTime());
        toDateStr = getCostaRicaDate(now.getTime());
      } else if (dateFilter === 'CUSTOM') {
        if (customDateFrom) fromDateStr = customDateFrom;
        if (customDateTo) toDateStr = customDateTo;
      }

      const [docsResult, logsData, emailLogsData, consecData, pCountRes] = await Promise.all([
        PosApiService.getElectronicDocuments({
          page: currentPage,
          limit: itemsPerPage,
          search: searchTerm.trim() || undefined,
          docType: filterDocType !== 'ALL' ? filterDocType : undefined,
          status: filterStatus !== 'ALL' ? filterStatus : undefined,
          sort: sortDirection,
          dateFrom: fromDateStr,
          dateTo: toDateStr,
          dateMode,
          paginated: true
        }),
        PosApiService.getFiscalAuditLogs(),
        PosApiService.getEmailDispatchLogs(),
        PosApiService.getConsecutivesAudit(),
        PosApiService.getFiscalPendingCount(fromDateStr)
      ]);

      setPendingCount(pCountRes || 0);

      if (docsResult && 'items' in (docsResult as any)) {
        const paginatedResult = docsResult as { items: ElectronicDocument[]; pagination: { total: number } };
        setDocuments(paginatedResult.items || []);
        setTotalServerCount(paginatedResult.pagination?.total ?? (paginatedResult.items?.length || 0));
      } else if (Array.isArray(docsResult)) {
        setDocuments(docsResult);
        setTotalServerCount(docsResult.length);
      }

      setAuditLogs(logsData);
      setEmailLogs(emailLogsData);
      setConsecutivesAudit(consecData);
    } catch (e) {
      console.warn('Error loading electronic documents:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleEmitPendingBatch = async () => {
    if (isEmittingBatch) return;
    const confirmEmit = window.confirm(`¿Deseas emitir los comprobantes pendientes ante el Ministerio de Hacienda ahora?`);
    if (!confirmEmit) return;

    setIsEmittingBatch(true);
    try {
      let targetDate: string | undefined = undefined;
      const now = new Date();
      if (dateFilter === 'TODAY') {
        targetDate = getCostaRicaDate(now.getTime());
      } else if (dateFilter === 'YESTERDAY') {
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        targetDate = getCostaRicaDate(yesterday.getTime());
      }

      let localPendingSales: Sale[] = [];
      try {
        const localSales = await offlineStorage.getOfflineSales();
        localPendingSales = (localSales || []).filter(s => !(s.invoiceStatus === 'INVOICED' && s.numericKey50 && s.consecutive20));
      } catch (offErr) {
        // non-blocking
      }

      const res = await PosApiService.emitPendingBatch(targetDate, localPendingSales);
      if (res.success) {
        alert(res.message);
      } else {
        alert(`Aviso de emisión: ${res.message}`);
      }
      await loadData();
    } catch (err: any) {
      alert(`Error procesando lote de comprobantes: ${err.message}`);
    } finally {
      setIsEmittingBatch(false);
    }
  };

  const handleBatchEmitSelected = async () => {
    if (isEmittingBatch || selectedDocIds.size === 0) return;
    const count = selectedDocIds.size;
    const confirmEmit = window.confirm(`¿Deseas emitir los ${count} comprobante(s) seleccionado(s) ante el Ministerio de Hacienda?`);
    if (!confirmEmit) return;

    setIsEmittingBatch(true);
    try {
      const selectedKeys = Array.from(selectedDocIds);
      let localPendingSales: Sale[] = [];
      try {
        const localSales = await offlineStorage.getOfflineSales();
        localPendingSales = localSales || [];
      } catch (offErr) {}

      const res = await PosApiService.emitPendingBatch({
        saleIds: selectedKeys,
        sales: localPendingSales
      });

      if (res.success) {
        alert(res.message);
        clearSelectedDocs();
      } else {
        alert(`Aviso de emisión: ${res.message}`);
      }
      await loadData();
    } catch (err: any) {
      alert(`Error procesando lote de comprobantes: ${err.message}`);
    } finally {
      setIsEmittingBatch(false);
    }
  };

  const handleEmitSinglePendingDoc = async (doc: ElectronicDocument) => {
    const docId = doc.id;
    if (emittingSingleId) return;
    setEmittingSingleId(docId);
    try {
      const saleId = doc.saleId || (docId.startsWith('pending-') ? docId.replace('pending-', '') : docId);
      let localPendingSales: Sale[] = [];
      try {
        const localSales = await offlineStorage.getOfflineSales();
        localPendingSales = localSales || [];
      } catch (offErr) {}

      const res = await PosApiService.emitPendingBatch({
        saleIds: [saleId, docId],
        sales: localPendingSales
      });

      if (res.success && res.emittedCount > 0) {
        alert('¡Comprobante emitido exitosamente ante el Ministerio de Hacienda DGT v4.4!');
      } else {
        alert(res.message || 'No se pudo emitir el comprobante. Revise la conexión fiscal.');
      }
      await loadData();
    } catch (err: any) {
      alert(`Error al emitir comprobante: ${err.message}`);
    } finally {
      setEmittingSingleId(null);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentPage, itemsPerPage, searchTerm, filterDocType, filterStatus, sortDirection, dateFilter, customDateFrom, customDateTo, dateMode]);

  const handleQueryHacienda = async (doc: ElectronicDocument) => {
    setQueryingKey(doc.numericKey);
    try {
      const res = await PosApiService.queryHaciendaDocument(doc.numericKey);
      if (res.success) {
        alert(`Consulta ante Hacienda:\nEstado: ${res.status}\nMensaje: ${res.message}`);
        await loadData();
      } else {
        alert(`Resultado de consulta:\n${res.message}`);
      }
    } catch (e: any) {
      alert('Error al consultar Hacienda: ' + e.message);
    } finally {
      setQueryingKey(null);
    }
  };

  const handleOpenEmailModal = (doc: ElectronicDocument) => {
    setEmailTargetDoc(doc);
    setTargetEmailAddress(doc.receiver?.email || '');
    setEmailFeedback(null);
    setIsEmailModalOpen(true);
  };

  const handleSendInvoiceEmail = async () => {
    if (!emailTargetDoc) return;
    if (!targetEmailAddress || !targetEmailAddress.includes('@')) {
      setEmailFeedback({ type: 'error', message: 'Por favor ingrese un correo electrónico válido.' });
      return;
    }

    setIsSendingEmail(true);
    setEmailFeedback(null);
    try {
      const res = await PosApiService.sendInvoiceEmail(emailTargetDoc.numericKey, targetEmailAddress);
      if (res.success) {
        setEmailFeedback({ type: 'success', message: `¡Archivos XML y PDF enviados exitosamente a ${targetEmailAddress}!` });
        await loadData();
        setTimeout(() => {
          setIsEmailModalOpen(false);
          setEmailTargetDoc(null);
        }, 1500);
      } else {
        setEmailFeedback({ type: 'error', message: res.message || 'Error al enviar por correo.' });
      }
    } catch (e: any) {
      setEmailFeedback({ type: 'error', message: e.message || 'Error al despachar correo.' });
    } finally {
      setIsSendingEmail(false);
    }
  };

  // In server-side paginated mode, `documents` holds the current page items directly from the backend API.
  const paginatedDocs = documents;
  const totalItems = totalServerCount;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;

  // Reset page when filters change (so user starts from page 1 on a new search/filter)
  useEffect(() => {
    setCurrentPage(1);
    setSelectedDocIds(new Set());
  }, [searchTerm, filterDocType, filterStatus, sortDirection, itemsPerPage, dateFilter, customDateFrom, customDateTo]);

  // Document Selection Handlers
  const getDocKey = (doc: ElectronicDocument, fallbackIdx?: number): string => {
    return doc.id || doc.numericKey || doc.consecutive || (fallbackIdx !== undefined ? `doc-idx-${fallbackIdx}` : `doc-${Math.random()}`);
  };

  const toggleSelectDoc = (id: string) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllPaginatedDocsSelected = paginatedDocs.length > 0 && paginatedDocs.every(d => selectedDocIds.has(getDocKey(d)));

  const toggleSelectAllPaginatedDocs = () => {
    if (isAllPaginatedDocsSelected) {
      setSelectedDocIds(prev => {
        const next = new Set(prev);
        paginatedDocs.forEach(d => next.delete(getDocKey(d)));
        return next;
      });
    } else {
      setSelectedDocIds(prev => {
        const next = new Set(prev);
        paginatedDocs.forEach(d => next.add(getDocKey(d)));
        return next;
      });
    }
  };

  const clearSelectedDocs = () => {
    setSelectedDocIds(new Set());
  };

  const handleBatchQueryHacienda = async () => {
    const targetDocs = documents.filter(d => selectedDocIds.has(getDocKey(d)));
    if (targetDocs.length === 0) return;

    if (!window.confirm(`¿Desea consultar el estado de ${targetDocs.length} comprobante(s) ante Hacienda?`)) return;

    setIsBatchQuerying(true);
    let success = 0;
    let errors = 0;

    for (const doc of targetDocs) {
      try {
        await PosApiService.queryHaciendaDocument(doc.numericKey);
        success++;
      } catch (e) {
        console.error(`Error consultando doc ${doc.numericKey}:`, e);
        errors++;
      }
    }

    await loadData();
    setIsBatchQuerying(false);
    clearSelectedDocs();
    alert(`Consulta por lote finalizada:\n✓ ${success} consultados con éxito.\n${errors > 0 ? `✗ ${errors} con errores de conexión.` : ''}`);
  };

  const isNcRejectedForDoc = (doc: ElectronicDocument): boolean => {
    return documents.some(d => 
      d.documentType === '03' && 
      d.status === 'RECHAZADO_HACIENDA' && 
      (d.reference?.numericKeyOrNumber === doc.numericKey || d.reference?.invoiceNumber === doc.numericKey || d.reference?.invoiceNumber === doc.consecutive)
    );
  };

  const handleOpenCreditNote = (doc: ElectronicDocument) => {
    setNcTargetDoc(doc);
    setNcReason('Anulación por devolución de pedido o error en facturación');
    setIsNcModalOpen(true);
    setNcSuccessMessage(null);
  };

  const handleEmitCreditNote = async () => {
    if (!ncTargetDoc) return;
    setIsEmittingNc(true);
    try {
      const res = await PosApiService.emitCreditNote({
        originalDocumentKey: ncTargetDoc.numericKey,
        reason: ncReason,
        cashierName: 'Administrador Fiscal'
      });

      if (res.success) {
        setNcSuccessMessage(res.message);
        setTimeout(() => {
          setIsNcModalOpen(false);
          setNcTargetDoc(null);
          loadData();
        }, 1200);
      } else {
        alert(res.message || 'Error al emitir Nota de Crédito');
      }
    } catch (e: any) {
      alert(e.message || 'Error al emitir Nota de Crédito');
    } finally {
      setIsEmittingNc(false);
    }
  };

  const handleReissueDocument = async (doc: ElectronicDocument) => {
    const isDup = (doc.statusDescription || '').includes('-99') || 
                  (doc.statusDescription || '').includes('ya existe') || 
                  (doc.haciendaRejectionReason || '').includes('ya existe');
    
    const confirmText = isDup
      ? `El comprobante ${doc.consecutive} fue rechazado por Hacienda por consecutivo duplicado (-99).\n\n¿Desea reemitirlo de inmediato con un nuevo consecutivo oficial vigente y transmitirlo automáticamente a Hacienda?`
      : `¿Desea reemitir el comprobante ${doc.consecutive} con fecha y consecutivo actualizados ante el Ministerio de Hacienda?`;

    if (!window.confirm(confirmText)) return;

    setReissuingKey(doc.numericKey);
    try {
      const res = await PosApiService.reissueRejectedDocument(doc.numericKey, 'Reemisión por corrección de consecutivo duplicado');
      if (res.success) {
        alert(`✅ ${res.message}\nEstado ante Hacienda: ${res.haciendaStatus || 'Enviado'}`);
        if (isDetailModalOpen) {
          setIsDetailModalOpen(false);
        }
        await loadData();
      } else {
        alert(`❌ Error al reemitir: ${res.message}`);
      }
    } catch (e: any) {
      alert(`❌ Error inesperado al reemitir: ${e.message}`);
    } finally {
      setReissuingKey(null);
    }
  };

  const getDocTypeBadge = (type: ElectronicDocumentType) => {
    switch (type) {
      case '01':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">Factura Electrónica (01)</span>;
      case '04':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">Tiquete Electrónico (04)</span>;
      case '03':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">Nota de Crédito (03)</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-stone-100 text-stone-700">Doc {type}</span>;
    }
  };

  const getStatusBadge = (status: HaciendaDocumentStatus) => {
    switch (status) {
      case 'ACEPTADO_HACIENDA':
        return <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" /> Aceptado DGT</span>;
      case 'RECHAZADO_HACIENDA':
        return <span className="flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200"><XCircle className="w-3.5 h-3.5" /> Rechazado</span>;
      case 'ENVIADO_PROCESANDO':
        return <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200"><Clock className="w-3.5 h-3.5 animate-pulse" /> Procesando</span>;
      case 'CONTINGENCIA_PENDIENTE':
        return <span className="flex items-center gap-1 text-[11px] font-black text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300 shadow-2xs"><Clock className="w-3.5 h-3.5 text-amber-700 animate-pulse" /> Pendiente Offline</span>;
      case 'CONTINGENCIA_VENCIDA':
        return <span className="flex items-center gap-1 text-[11px] font-bold text-stone-600 bg-stone-200/80 px-2.5 py-0.5 rounded-full border border-stone-300" title="Plazo mayor a 2 días superado — Excluido del envío a Hacienda"><XCircle className="w-3.5 h-3.5 text-stone-500" /> No se pudo procesar / Expirado</span>;
      case 'ANULADO_POR_NC':
        return <span className="flex items-center gap-1 text-[11px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full border border-stone-300">Anulado por NC</span>;
      default:
        return <span className="text-[11px] font-medium text-stone-500">{status}</span>;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Stats Banner */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-stone-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
              <ShieldCheck className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-stone-900 tracking-tight">
                Centro de Comprobantes Electrónicos
              </h1>
              <p className="text-xs text-stone-500">
                Ministerio de Hacienda de Costa Rica (DGT v4.4) • Consecutivos y Claves de 50 Dígitos
              </p>
            </div>
          </div>
        </div>

        {/* Action button & tab switch */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Button to open Hacienda Direct Configuration Modal */}
          <button
            onClick={() => setIsConfigModalOpen(true)}
            className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs transition-colors"
            title="Configurar Llave Criptográfica .p12, PIN, Consecutivos y Credenciales ATV"
          >
            <KeyRound className="w-4 h-4 text-emerald-300" />
            <span>Llave & Consecutivos</span>
          </button>

          <div className="flex bg-stone-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveSubTab('DOCUMENTS')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeSubTab === 'DOCUMENTS'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Comprobantes ({totalServerCount > 0 ? totalServerCount : documents.length})
            </button>
            <button
              onClick={() => setActiveSubTab('ISSUER_PROFILE')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeSubTab === 'ISSUER_PROFILE'
                  ? 'bg-white text-amber-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-amber-600" />
              <span>🏢 Datos Emisor</span>
            </button>
            <button
              onClick={() => setActiveSubTab('CONSECUTIVES_AUDIT')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeSubTab === 'CONSECUTIVES_AUDIT'
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>🔢 Consecutivos & Claves (6 Tipos)</span>
            </button>
            <button
              onClick={() => setActiveSubTab('EMAIL_LOGS')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeSubTab === 'EMAIL_LOGS'
                  ? 'bg-white text-amber-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Mail className="w-3.5 h-3.5 text-amber-600" />
              <span>Correos ({emailLogs.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('AUDIT_LOGS')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeSubTab === 'AUDIT_LOGS'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Bitácora ({auditLogs.length})
            </button>
          </div>

          {/* Botón Emisión en Lote: Siempre visible para que el usuario pueda transmitir en cualquier momento */}
          <button
            onClick={handleEmitPendingBatch}
            disabled={isEmittingBatch || loading}
            className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
            title="Emitir automáticamente a Hacienda los comprobantes de la fecha seleccionada"
          >
            <Send className={`w-3.5 h-3.5 ${isEmittingBatch ? 'animate-bounce' : ''}`} />
            <span>{isEmittingBatch ? 'Emitiendo a Hacienda...' : (pendingCount > 0 ? `Emitir Pendientes (${pendingCount})` : 'Emitir Comprobantes a Hacienda')}</span>
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition-colors"
            title="Refrescar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {activeSubTab === 'DOCUMENTS' && (
        <>
          {/* Filter Bar & Batch Actions */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-3">
            {/* Banner de Notificación de Comprobantes Pendientes */}
            {pendingCount > 0 && selectedDocIds.size === 0 && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-amber-950 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Hay <strong>{pendingCount} venta(s)</strong> con comprobante electrónico pendiente de transmitir al Ministerio de Hacienda.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleEmitPendingBatch}
                  disabled={isEmittingBatch}
                  className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-black rounded-lg transition-all flex items-center gap-1.5 shadow-xs active:scale-95"
                >
                  <Send className={`w-3.5 h-3.5 ${isEmittingBatch ? 'animate-bounce' : ''}`} />
                  <span>{isEmittingBatch ? 'Transmitiendo a Hacienda...' : `Emitir las ${pendingCount} Pendientes Ahora`}</span>
                </button>
              </div>
            )}

            {/* Batch Selection Banner */}
            {selectedDocIds.size > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <CheckCircle2 className="w-4 h-4 text-amber-600" />
                  <span>{selectedDocIds.size} comprobante(s) seleccionado(s)</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBatchEmitSelected}
                    disabled={isEmittingBatch}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                    title="Emitir los comprobantes seleccionados ante el Ministerio de Hacienda"
                  >
                    <Send className={`w-3.5 h-3.5 ${isEmittingBatch ? 'animate-bounce' : ''}`} />
                    <span>Emitir Seleccionados ({selectedDocIds.size})</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchQueryHacienda}
                    disabled={isBatchQuerying}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isBatchQuerying ? 'animate-spin' : ''}`} />
                    <span>Consultar Estado ({selectedDocIds.size})</span>
                  </button>
                  <button
                    type="button"
                    onClick={clearSelectedDocs}
                    className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-lg transition-colors"
                  >
                    Deseleccionar
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Buscar por Clave 50 dígitos, Consecutivo, Cliente o Cédula..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <select
                  value={filterDocType}
                  onChange={(e) => setFilterDocType(e.target.value)}
                  className="px-3 py-2 text-xs font-bold bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 text-stone-700"
                >
                  <option value="ALL">Todos los Tipos (6 Oficiales)</option>
                  <option value="01">01 - Factura Electrónica (FE)</option>
                  <option value="02">02 - Nota de Débito Electrónica (ND)</option>
                  <option value="03">03 - Nota de Crédito Electrónica (NC)</option>
                  <option value="04">04 - Tiquete Electrónico (TE)</option>
                  <option value="05">05 - Factura de Compra (FEC)</option>
                  <option value="06">06 - Recibo Electrónico de Pago (REP)</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 text-xs font-bold bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 text-stone-700"
                >
                  <option value="ALL">Todos los Estados</option>
                  <option value="CONTINGENCIA_PENDIENTE">⏳ Pendientes Offline / Por Emitir (Hoy y Ayer)</option>
                  <option value="ACEPTADO_HACIENDA">Aceptado Hacienda</option>
                  <option value="ENVIADO_PROCESANDO">En Procesamiento</option>
                  <option value="RECHAZADO_HACIENDA">Rechazado</option>
                  <option value="CONTINGENCIA_VENCIDA">🚫 No se pudo procesar / Expirado (&gt;2 días)</option>
                  <option value="ANULADO_POR_NC">Anulado</option>
                </select>

                {/* Selector de Criterio de Fecha: Fecha de Venta vs Fecha de Envío DGT */}
                <div className="flex items-center bg-stone-100 p-0.5 rounded-xl border border-stone-200 shadow-2xs" title="Criterio de fecha para el filtrado">
                  <button
                    type="button"
                    onClick={() => { setDateMode('saleDate'); setCurrentPage(1); }}
                    className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      dateMode === 'saleDate'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                    title="Muestra los comprobantes según la fecha original en que se cobró la orden en el restaurante"
                  >
                    <span>🛒 Fecha de Venta</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDateMode('issueDate'); setCurrentPage(1); }}
                    className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      dateMode === 'issueDate'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                    title="Muestra los comprobantes según la fecha en que fueron firmados y transmitidos a Hacienda"
                  >
                    <span>🏛️ Fecha Envío DGT</span>
                  </button>
                </div>

                {/* Filtro Rápido de Fechas */}
                <div className="flex items-center gap-1.5">
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value as any)}
                    className={`px-3 py-2 text-xs font-bold rounded-xl border focus:ring-2 focus:ring-amber-500 transition-all ${
                      dateFilter === 'TODAY'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-black shadow-xs'
                        : 'bg-stone-50 border-stone-300 text-stone-700'
                    }`}
                    title="Filtro por Período de Fecha"
                  >
                    <option value="TODAY">📅 Hoy en curso ({getCostaRicaDate()})</option>
                    <option value="YESTERDAY">Ayer</option>
                    <option value="WEEK">Últimos 7 días</option>
                    <option value="MONTH">Últimos 30 días</option>
                    <option value="CUSTOM">Rango Personalizado...</option>
                    <option value="ALL">Todas las Fechas (Histórico completo)</option>
                  </select>

                  {dateFilter === 'CUSTOM' && (
                    <div className="flex items-center gap-1 bg-stone-50 p-1 rounded-xl border border-stone-300">
                      <input
                        type="date"
                        value={customDateFrom}
                        onChange={(e) => setCustomDateFrom(e.target.value)}
                        className="px-2 py-1 text-xs bg-white border border-stone-200 rounded-lg text-stone-700 focus:outline-none"
                        title="Fecha Inicio"
                      />
                      <span className="text-stone-400 text-xs font-bold">-</span>
                      <input
                        type="date"
                        value={customDateTo}
                        onChange={(e) => setCustomDateTo(e.target.value)}
                        className="px-2 py-1 text-xs bg-white border border-stone-200 rounded-lg text-stone-700 focus:outline-none"
                        title="Fecha Fin"
                      />
                    </div>
                  )}
                </div>

                <select
                  value={sortDirection}
                  onChange={(e) => setSortDirection(e.target.value as 'DESC' | 'ASC')}
                  className="px-3 py-2 text-xs font-bold bg-amber-50 border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-500 text-amber-950"
                  title="Orden del Historial"
                >
                  <option value="DESC">Últimos emitidos primero (Descendente)</option>
                  <option value="ASC">Desde el 1° hasta el último (Ascendente)</option>
                </select>

                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(parseInt(e.target.value, 10))}
                  className="px-3 py-2 text-xs font-bold bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 text-stone-700"
                  title="Cantidad por página"
                >
                  <option value={10}>10 por pág.</option>
                  <option value={20}>20 por pág.</option>
                  <option value={50}>50 por pág.</option>
                  <option value={100}>100 por pág.</option>
                  <option value={500}>500 por pág.</option>
                </select>
              </div>
            </div>
          </div>

          {/* Documents Table with Scrollbars */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden flex flex-col">
            <div 
              id="documents-table-scroll-container" 
              className="overflow-x-auto overflow-y-auto max-h-[58vh] min-h-[300px]"
            >
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-stone-50 text-stone-600 font-bold uppercase tracking-wider text-[10px] border-b border-stone-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllPaginatedDocsSelected}
                        onChange={toggleSelectAllPaginatedDocs}
                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-stone-300 cursor-pointer"
                        title="Seleccionar / Deseleccionar todos en esta página"
                      />
                    </th>
                    <th className="py-3 px-4">Tipo / Consecutivo</th>
                    <th className="py-3 px-4">Clave Numérica (50 dígitos)</th>
                    <th className="py-3 px-4">Receptor / Cliente</th>
                    <th className="py-3 px-4 text-right">Total (CRC)</th>
                    <th className="py-3 px-4 text-center">Estado DGT</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {paginatedDocs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-stone-500">
                        <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                          <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
                            <FileCheck className="w-5 h-5" />
                          </div>
                          <p className="font-bold text-stone-800 text-sm">
                            {dateFilter === 'TODAY' 
                              ? `No hay comprobantes electrónicos emitidos hoy en curso (${getCostaRicaDate()})`
                              : 'No se encontraron comprobantes electrónicos con los filtros seleccionados.'}
                          </p>
                          <p className="text-xs text-stone-500">
                            {dateFilter === 'TODAY'
                              ? 'Las facturas y tiquetes que emitas hoy se listarán aquí en tiempo real.'
                              : 'Prueba cambiando el rango de fechas o los filtros aplicados.'}
                          </p>
                          {dateFilter === 'TODAY' && (
                            <button
                              onClick={() => setDateFilter('ALL')}
                              className="mt-2 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            >
                              <History className="w-3.5 h-3.5" />
                              <span>Ver todo el histórico de comprobantes</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedDocs.map((doc, docIdx) => {
                      const docKey = getDocKey(doc, startIndex + docIdx);
                      const isSelected = selectedDocIds.has(docKey);
                      return (
                      <tr 
                        key={docKey} 
                        onClick={() => openDocDetails(doc, 'OVERVIEW')}
                        className={`hover:bg-amber-50/40 cursor-pointer transition-colors group ${isSelected ? 'bg-amber-50/60' : ''}`}
                      >
                        {/* Checkbox column */}
                        <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectDoc(docKey)}
                            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-stone-300 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              {getDocTypeBadge(doc.documentType)}
                            </div>
                            <div className="font-mono font-extrabold text-stone-800 text-[11px] group-hover:text-amber-800 transition-colors">
                              {doc.consecutive}
                            </div>
                            <div className="text-[10px] text-stone-600 font-semibold flex items-center gap-1">
                              {doc.orderNumber ? <span className="bg-stone-200/80 px-1 rounded text-stone-800">#{doc.orderNumber}</span> : null}
                              <span>{doc.saleDate ? `Venta: ${doc.saleDate}` : ''}</span>
                            </div>
                            <div className="text-[9.5px] text-stone-400">
                              {doc.issueDate ? `Firma DGT: ${new Date(doc.issueDate).toLocaleString('es-CR')}` : ''}
                            </div>
                            {doc.saleDate && doc.issueDate && doc.saleDate !== doc.issueDate.split('T')[0] && (
                              <div className="inline-block px-1.5 py-0.5 bg-sky-100 text-sky-800 border border-sky-200 rounded text-[9px] font-black">
                                ℹ️ Venta del {doc.saleDate} (Regularizada)
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono text-[10px] text-stone-600 max-w-[220px]">
                          {doc.numericKey && doc.numericKey.startsWith('PENDIENTE') ? (
                            <div className="font-sans font-bold text-amber-900 bg-amber-100/80 p-1.5 rounded-lg border border-amber-300 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-700 shrink-0 animate-pulse" />
                              <span>Pendiente de Clave 50 dígs</span>
                            </div>
                          ) : (
                            <div 
                              className="break-all select-all font-semibold bg-stone-50 p-1.5 rounded border border-stone-200/60 hover:bg-stone-100 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyKey(doc.numericKey);
                              }}
                              title="Click para copiar Clave Numérica de 50 dígitos"
                            >
                              {doc.numericKey}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-stone-900 group-hover:text-amber-900">
                            {doc.receiver?.name || 'Consumidor Final (Mostrador)'}
                          </div>
                          {doc.receiver?.email ? (
                            <div className="text-[10px] text-emerald-700 flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              <span className="truncate max-w-[180px]">{doc.receiver.email}</span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-stone-400">Sin correo registrado</div>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="font-black text-amber-700 text-sm">
                            ₡{(doc.total || 0).toLocaleString('es-CR')}
                          </div>
                          <div className="text-[10px] text-stone-400">
                            IVA: ₡{(doc.taxTotal || 0).toLocaleString('es-CR')}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <div 
                            className="flex flex-col items-center gap-1"
                            onClick={(e) => {
                              if (doc.status === 'RECHAZADO_HACIENDA' || doc.haciendaRejectionReason) {
                                e.stopPropagation();
                                openDocDetails(doc, 'DIAGNOSTIC');
                              }
                            }}
                          >
                            {getStatusBadge(doc.status)}
                            {doc.haciendaRejectionReason && (
                              <span 
                                className="text-[9.5px] text-rose-600 font-bold max-w-[140px] truncate underline hover:text-rose-800" 
                                title={`Motivo de Rechazo: ${doc.haciendaRejectionReason}. Click para analizar error.`}
                              >
                                {doc.haciendaRejectionReason}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {/* Botón de Emisión Inmediata para Comprobante Pendiente Offline (SOLO si NO está aceptado, ni en procesamiento, ni expirado >2 días) */}
                            {Boolean(
                              doc.status !== 'ACEPTADO_HACIENDA' &&
                              doc.status !== 'ENVIADO_PROCESANDO' &&
                              doc.status !== 'ANULADO_POR_NC' &&
                              doc.status !== 'CONTINGENCIA_VENCIDA' &&
                              !doc.numericKey?.startsWith('EXPIRADO') &&
                              (doc.status === 'CONTINGENCIA_PENDIENTE' ||
                               doc.status === 'SIN_INTERNET_PENDIENTE' ||
                               !doc.numericKey ||
                               doc.numericKey.startsWith('PENDIENTE') ||
                               doc.consecutive?.startsWith('ORDEN-'))
                            ) && (
                              <button
                                type="button"
                                onClick={() => handleEmitSinglePendingDoc(doc)}
                                disabled={emittingSingleId === doc.id || isEmittingBatch}
                                className="px-2.5 py-1.5 text-white bg-emerald-600 hover:bg-emerald-700 font-extrabold rounded-lg transition-all shadow-xs flex items-center gap-1 text-[11px] active:scale-95 cursor-pointer disabled:opacity-50"
                                title="Emitir formalmente este comprobante pendiente ante el Ministerio de Hacienda ahora"
                              >
                                <Send className={`w-3.5 h-3.5 ${emittingSingleId === doc.id ? 'animate-bounce' : ''}`} />
                                <span>{emittingSingleId === doc.id ? 'Emitiendo...' : 'Emitir a Hacienda'}</span>
                              </button>
                            )}

                            {/* Botón Imprimir Ticket Térmico 56mm / 80mm */}
                            <button
                              type="button"
                              onClick={() => handlePrintThermalReceipt(doc)}
                              className="px-2 py-1.5 text-amber-950 bg-amber-400 hover:bg-amber-300 font-extrabold rounded-lg transition-colors border border-amber-500 shadow-2xs flex items-center gap-1 text-[11px]"
                              title="Imprimir Comprobante Térmico Fiscal (56 mm / 80 mm)"
                            >
                              <Printer className="w-3.5 h-3.5 text-amber-950" />
                              <span className="hidden xl:inline">Imprimir</span>
                            </button>

                            {/* Ver Comprobante y Analizar Error / Detalle */}
                            <button
                              type="button"
                              onClick={() => openDocDetails(doc, 'OVERVIEW')}
                              className="p-1.5 text-stone-700 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors border border-stone-300"
                              title="Ver Comprobante, Detalle Tributario y Análisis de Error"
                            >
                              <Eye className="w-3.5 h-3.5 text-stone-700" />
                            </button>

                            {/* Diagnostic Logs Button */}
                            <button
                              type="button"
                              onClick={() => openDocDetails(doc, 'DIAGNOSTIC')}
                              className="p-1.5 text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200"
                              title="Ver Trazabilidad y Logs de Diagnóstico de Hacienda"
                            >
                              <Activity className="w-3.5 h-3.5 text-indigo-600" />
                            </button>

                            {/* Send / Resend Email Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenEmailModal(doc)}
                              className="p-1.5 text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors border border-amber-200"
                              title="Enviar o Reenviar Archivos XML y PDF por Correo"
                            >
                              <Mail className="w-3.5 h-3.5 text-amber-700" />
                            </button>

                            {/* Direct PDF Download */}
                            <a
                              href={PosApiService.getDownloadPdfUrl(doc.numericKey)}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-red-700 hover:text-red-900 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-200"
                              title="Descargar Representación Gráfica Oficial en PDF (con QR DGT)"
                            >
                              <FileText className="w-3.5 h-3.5 text-red-600" />
                            </a>

                            {/* Direct XML Download */}
                            <a
                              href={PosApiService.getDownloadXmlUrl(doc.numericKey)}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                              title="Descargar XML Emitido Firmado v4.4"
                            >
                              <FileCode className="w-3.5 h-3.5 text-blue-600" />
                            </a>

                            {/* Direct Hacienda XML Response Download */}
                            {doc.xmlResponseHacienda && (
                              <a
                                href={PosApiService.getDownloadHaciendaXmlUrl(doc.numericKey)}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200"
                                title="Descargar XML Respuesta de Hacienda"
                              >
                                <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                              </a>
                            )}

                            {/* Query Status from Hacienda Button */}
                            <button
                              type="button"
                              onClick={() => handleQueryHacienda(doc)}
                              disabled={queryingKey === doc.numericKey}
                              className="p-1.5 text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                              title="Consultar Estado en Servidores de Hacienda (DGT)"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${queryingKey === doc.numericKey ? 'animate-spin' : ''}`} />
                            </button>

                            {/* XML Viewer Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenXmlModal(doc, 'EMITTED')}
                              className="p-1.5 text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                              title="Ver XML Generado v4.4"
                            >
                              <FileCheck className="w-3.5 h-3.5 text-stone-700" />
                            </button>

                            {/* Emit Credit Note Button (Available for Facturas/Tiquetes no anulados o con NC rechazada) */}
                            {doc.documentType !== '03' && (doc.status !== 'ANULADO_POR_NC' || isNcRejectedForDoc(doc)) && (
                              <button
                                type="button"
                                onClick={() => handleOpenCreditNote(doc)}
                                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors flex items-center gap-1 ${
                                  isNcRejectedForDoc(doc)
                                    ? 'text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-300'
                                    : 'text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border-rose-200'
                                }`}
                                title={isNcRejectedForDoc(doc) ? 'Reemitir Nota de Crédito corregida (la anterior fue rechazada por Hacienda)' : 'Emitir Nota de Crédito'}
                              >
                                <XCircle className="w-3 h-3" />
                                <span>{isNcRejectedForDoc(doc) ? 'Reemitir NC' : 'NC'}</span>
                              </button>
                            )}

                            {/* Reissue Rejected Document Button */}
                            {doc.status === 'RECHAZADO_HACIENDA' && (
                              <button
                                type="button"
                                onClick={() => handleReissueDocument(doc)}
                                disabled={reissuingKey === doc.numericKey}
                                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors flex items-center gap-1 text-amber-900 bg-amber-50 hover:bg-amber-100 border-amber-300 disabled:opacity-50"
                                title="Reemitir comprobante rechazado con un nuevo consecutivo oficial vigente"
                              >
                                <RefreshCw className={`w-3 h-3 ${reissuingKey === doc.numericKey ? 'animate-spin' : ''}`} />
                                <span>{reissuingKey === doc.numericKey ? 'Reemitiendo...' : 'Reemitir'}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {totalItems > 0 && (
              <div className="bg-stone-50 px-4 py-3 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-stone-500 font-medium">Ítems por página:</span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2 py-1 text-[11px] font-bold bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 text-stone-700 outline-none"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={500}>500</option>
                    </select>
                  </div>
                  <span className="text-[11px] text-stone-500 font-bold">
                    {startIndex + 1}-{Math.min(startIndex + itemsPerPage, totalItems)} de {totalItems}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-stone-500 font-medium">Página</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={currentPage}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val) && val >= 1 && val <= totalPages) {
                          setCurrentPage(val);
                        }
                      }}
                      className="w-12 px-2 py-1 text-[11px] font-bold bg-white border border-stone-300 rounded-lg text-center focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                    <span className="text-[11px] text-stone-500 font-medium">de {totalPages}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        currentPage === 1 
                          ? 'bg-stone-50 text-stone-300 border-stone-200' 
                          : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50 hover:text-stone-900'
                      }`}
                    >
                      <ChevronRight className="w-4 h-4 rotate-180" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        currentPage === totalPages 
                          ? 'bg-stone-50 text-stone-300 border-stone-200' 
                          : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50 hover:text-stone-900'
                      }`}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* SUBTAB: DATOS DEL CONTRIBUYENTE Y LOGO (DGT v4.4) */}
      {activeSubTab === 'ISSUER_PROFILE' && (
        <FiscalIssuerProfile onConfigSaved={loadData} />
      )}

      {/* SUBTAB: CONTROL & AUDITORÍA DE CONSECUTIVOS Y CLAVES INDEPENDIENTES (6 TIPOS DGT v4.4) */}
      {activeSubTab === 'CONSECUTIVES_AUDIT' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-extrabold text-stone-900 text-sm sm:text-base flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <span>Control de Consecutivos y Claves Numéricas Independientes</span>
                </h3>
                <p className="text-[11px] text-stone-500">
                  Cumplimiento estricto DGT-R-033-2019: Cada uno de los 6 tipos de comprobante posee numeración independiente de 10 dígitos, sucursal (3 dig), terminal (5 dig) y clave irrepetible de 50 dígitos.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(true)}
                  className="px-3.5 py-1.5 bg-stone-800 hover:bg-stone-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Configurar Secuencias</span>
                </button>
              </div>
            </div>

            {/* 6 Document Type Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {[
                { type: '01', name: '01 - Factura Electrónica', badge: 'FE', color: 'border-blue-300 bg-blue-50/40 text-blue-900', badgeColor: 'bg-blue-600 text-white' },
                { type: '02', name: '02 - Nota de Débito', badge: 'ND', color: 'border-indigo-300 bg-indigo-50/40 text-indigo-900', badgeColor: 'bg-indigo-600 text-white' },
                { type: '03', name: '03 - Nota de Crédito', badge: 'NC', color: 'border-purple-300 bg-purple-50/40 text-purple-900', badgeColor: 'bg-purple-600 text-white' },
                { type: '04', name: '04 - Tiquete Electrónico', badge: 'TE', color: 'border-amber-300 bg-amber-50/40 text-amber-900', badgeColor: 'bg-amber-600 text-white' },
                { type: '05', name: '05 - Factura de Compra', badge: 'FEC', color: 'border-emerald-300 bg-emerald-50/40 text-emerald-900', badgeColor: 'bg-emerald-600 text-white' },
                { type: '06', name: '06 - Recibo Electrónico Pago', badge: 'REP', color: 'border-teal-300 bg-teal-50/40 text-teal-900', badgeColor: 'bg-teal-600 text-white' }
              ].map(item => {
                const ctrl = consecutivesAudit?.controls?.find((c: any) => c.documentType === item.type);
                const currentSeq = ctrl ? ctrl.currentSequence : 1;
                const lastEmitted = Math.max(0, currentSeq - 1);
                const branch = ctrl ? ctrl.branch : '001';
                const terminal = ctrl ? ctrl.terminal : '00001';
                const nextConsecutive = `${branch}${terminal}${item.type}${String(currentSeq).padStart(10, '0')}`;

                return (
                  <div key={item.type} className={`p-4 rounded-2xl border ${item.color} space-y-2 shadow-2xs`}>
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs">{item.name}</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${item.badgeColor}`}>
                        {item.badge}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-stone-600">
                        <span>Último emitido:</span>
                        <strong className="font-mono font-bold text-stone-800">#{lastEmitted}</strong>
                      </div>
                      <div className="flex justify-between text-stone-600">
                        <span>Siguiente secuencia:</span>
                        <strong className="font-mono font-bold text-emerald-700">#{currentSeq}</strong>
                      </div>
                      <div className="pt-1.5 border-t border-stone-200/80">
                        <div className="text-[10px] text-stone-500 font-medium">Siguiente Consecutivo (20 dig):</div>
                        <div className="font-mono font-black text-stone-900 text-[11px] select-all truncate">
                          {nextConsecutive}
                        </div>
                      </div>
                    </div>

                    <div className="pt-1 flex items-center justify-between text-[10px] text-emerald-800 font-bold bg-white/70 px-2 py-1 rounded-lg border border-emerald-200/60">
                      <span>✓ Secuencia Independiente</span>
                      <span>Suc: {branch} • Term: {terminal}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Historial de Claves Numéricas y Consecutivos Asignados */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h4 className="font-extrabold text-stone-900 text-sm">
                  Historial de Consecutivos y Claves Asignadas (Garantía Anti-Duplicados)
                </h4>
                <p className="text-[11px] text-stone-500">
                  Total de comprobantes registrados en el sistema: <strong>{consecutivesAudit?.totalConsecutivesUsed || documents.length}</strong>
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-600 font-bold uppercase tracking-wider text-[10px] border-b border-stone-200">
                  <tr>
                    <th className="py-2.5 px-3">Fecha / Hora</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3">Consecutivo (20 dig)</th>
                    <th className="py-2.5 px-3">Clave Numérica de 50 Dígitos</th>
                    <th className="py-2.5 px-3 text-right">Monto</th>
                    <th className="py-2.5 px-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-mono text-[11px]">
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-stone-400 font-sans text-xs">
                        No hay consecutivos emitidos aún.
                      </td>
                    </tr>
                  ) : (
                    documents.slice(0, 20).map((doc, docIdx) => (
                      <tr key={getDocKey(doc, docIdx)} className="hover:bg-stone-50 transition-colors">
                        <td className="py-2 px-3 text-stone-500 font-sans text-[11px]">
                          {doc.createdAt ? new Date(doc.createdAt).toLocaleString('es-CR') : '-'}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] font-sans ${
                            doc.documentType === '01' ? 'bg-blue-100 text-blue-800' :
                            doc.documentType === '02' ? 'bg-indigo-100 text-indigo-800' :
                            doc.documentType === '03' ? 'bg-purple-100 text-purple-800' :
                            doc.documentType === '04' ? 'bg-amber-100 text-amber-800' :
                            doc.documentType === '05' ? 'bg-emerald-100 text-emerald-800' :
                            'bg-teal-100 text-teal-800'
                          }`}>
                            {doc.documentType === '01' ? 'FE 01' :
                             doc.documentType === '02' ? 'ND 02' :
                             doc.documentType === '03' ? 'NC 03' :
                             doc.documentType === '04' ? 'TE 04' :
                             doc.documentType === '05' ? 'FEC 05' : 'REP 06'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold text-stone-900">
                          {doc.consecutive}
                        </td>
                        <td className="py-2 px-3 text-emerald-800 font-semibold truncate max-w-xs select-all">
                          {doc.numericKey}
                        </td>
                        <td className="py-2 px-3 text-right font-sans font-bold text-stone-900">
                          ₡{(doc.total || 0).toLocaleString('es-CR')}
                        </td>
                        <td className="py-2 px-3 text-center font-sans">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            doc.status === 'ACEPTADO_HACIENDA' ? 'bg-emerald-100 text-emerald-800' :
                            doc.status === 'ENVIADO_PROCESANDO' ? 'bg-blue-100 text-blue-800' :
                            doc.status === 'ANULADO_POR_NC' ? 'bg-purple-100 text-purple-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {doc.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB: BANDEJA DE CORREOS FISCALES (EMAIL OUTBOX LOGS) */}
      {activeSubTab === 'EMAIL_LOGS' && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div>
              <h3 className="font-extrabold text-stone-900 text-sm flex items-center gap-2">
                <Mail className="w-4 h-4 text-amber-600" />
                <span>Registro de Envíos Automáticos por Correo Electrónico</span>
              </h3>
              <p className="text-[11px] text-stone-500">
                Historial de comprobantes electrónicos (XML firmados, PDF oficiales y Respuestas de Hacienda) despachados a clientes.
              </p>
            </div>
          </div>

          <div className="divide-y divide-stone-100 text-xs">
            {emailLogs.length === 0 ? (
              <div className="py-8 text-center text-stone-400">
                No hay envíos registrados en el historial de correos.
              </div>
            ) : (
              emailLogs.map((log, logIdx) => (
                <div key={log.id || `email-log-${log.numericKey || ''}-${log.sentAt || ''}-${logIdx}`} className="py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-stone-50 p-2 rounded-xl transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-stone-900 text-xs">
                        Para: {log.recipientEmail}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        log.status === 'SENT' 
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}>
                        {log.status === 'SENT' ? '✓ Enviado Exitosamente' : '✕ Error en Envío'}
                      </span>
                    </div>
                    
                    <div className="text-[11px] text-stone-600 font-medium">
                      Asunto: {log.subject}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-stone-500">
                      <span className="flex items-center gap-1 text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <Paperclip className="w-3 h-3" />
                        Adjuntos: {log.attachments?.join(', ') || 'XML Firmado, PDF, XML Hacienda'}
                      </span>
                      <span className="font-mono text-stone-600">
                        Clave: {log.numericKey}
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-stone-400 shrink-0 md:text-right">
                    <div>{new Date(log.sentAt).toLocaleDateString('es-CR')}</div>
                    <div>{new Date(log.sentAt).toLocaleTimeString('es-CR')}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SUBTAB: BITÁCORA DE AUDITORÍA FISCAL (Exigida por DGT) */}
      {activeSubTab === 'AUDIT_LOGS' && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div>
              <h3 className="font-extrabold text-stone-900 text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-amber-600" />
                <span>Bitácora Legal de Transacciones Fiscales</span>
              </h3>
              <p className="text-[11px] text-stone-500">
                Registro inmutable de emisiones, notas de crédito, validaciones y respuestas del Ministerio de Hacienda.
              </p>
            </div>
          </div>

          <div className="divide-y divide-stone-100 text-xs">
            {auditLogs.length === 0 ? (
              <div className="py-6 text-center text-stone-400">
                No hay registros en la bitácora fiscal por el momento.
              </div>
            ) : (
              auditLogs.map((log, logIdx) => (
                <div key={log.id || `audit-log-${log.action || ''}-${log.timestamp || ''}-${logIdx}`} className="py-3 flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-800">{log.action}</span>
                      <span className="text-[10px] text-stone-400">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString('es-CR') : ''}
                      </span>
                      <span className="text-[10px] px-2 py-0.2 bg-stone-100 text-stone-600 rounded">
                        Usuario: {log.userName}
                      </span>
                    </div>
                    <div className="text-stone-600 text-[11px]">{log.details}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* DIAGNOSTIC LOGS MODAL */}
      {showDiagnosticModal && diagnosticTargetDoc && (
        <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-extrabold text-base text-stone-900">
                    Trazabilidad & Diagnóstico Hacienda DGT v4.4
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Registro detallado de transacciones HTTP, códigos de retorno y respuestas.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDiagnosticModal(false)}
                className="text-stone-400 hover:text-stone-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* METADATOS TÉCNICOS DEL XML REAL (DGT v4.4) */}
            <div className="p-3.5 bg-stone-900 text-stone-200 rounded-xl border border-stone-800 text-xs space-y-2.5 font-mono">
              <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between border-b border-stone-800 pb-1.5">
                <span>Inspección de Esquema XML Oficial (DGT v4.4)</span>
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded text-[10px]">Versión: 4.4</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-stone-400">Elemento Raíz:</span> <span className="text-amber-300 font-bold">
                    {diagnosticTargetDoc.documentType === '04' ? 'TiqueteElectronico' : 
                     diagnosticTargetDoc.documentType === '01' ? 'FacturaElectronica' : 
                     diagnosticTargetDoc.documentType === '03' ? 'NotaCreditoElectronica' : 'NotaDebitoElectronica'}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400">Tipo Documento:</span> <span className="text-amber-300 font-bold">{diagnosticTargetDoc.documentType} ({diagnosticTargetDoc.documentType === '04' ? 'Tiquete Electrónico' : diagnosticTargetDoc.documentType === '01' ? 'Factura Electrónica' : 'Nota de Crédito'})</span>
                </div>
                <div className="col-span-1 sm:col-span-2 break-all">
                  <span className="text-stone-400">Namespace (xmlns):</span> <br/>
                  <span className="text-emerald-400 text-[10px]">
                    {diagnosticTargetDoc.documentType === '04' ? 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/tiqueteElectronico' :
                     diagnosticTargetDoc.documentType === '01' ? 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica' :
                     'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/notaCreditoElectronica'}
                  </span>
                </div>
                <div className="col-span-1 sm:col-span-2 break-all">
                  <span className="text-stone-400">schemaLocation:</span> <br/>
                  <span className="text-stone-300 text-[10px]">
                    {diagnosticTargetDoc.documentType === '04' ? 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/tiqueteElectronico https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/tiqueteElectronico.xsd' :
                     'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica.xsd'}
                  </span>
                </div>
              </div>

              <div className="border-t border-stone-800 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div><span className="text-stone-400">Consecutivo (20 dígs):</span> <span className="text-white font-bold">{diagnosticTargetDoc.consecutive}</span></div>
                <div><span className="text-stone-400">Estado Actual:</span> <span className="text-white font-bold">{diagnosticTargetDoc.status}</span></div>
                <div className="col-span-1 sm:col-span-2 break-all">
                  <span className="text-stone-400">Clave Oficial (50 dígs):</span> <br/>
                  <span className="text-amber-200 text-[10px] select-all">{diagnosticTargetDoc.numericKey}</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><strong>Último Endpoint:</strong> <span className="font-mono text-[10px] text-stone-600 break-all">{diagnosticTargetDoc.sendEndpoint || 'https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1/recepcion'}</span></div>
              <div><strong>Último Código HTTP:</strong> <span className="font-mono bg-stone-200 px-1.5 py-0.5 rounded font-bold">{diagnosticTargetDoc.sendHttpStatus || diagnosticTargetDoc.lastQueryHttpStatus || 202}</span></div>
              {diagnosticTargetDoc.lastQueryIndEstado && (
                <div><strong>Último ind-estado:</strong> <span className={`font-mono px-1.5 py-0.5 rounded font-bold ${
                  diagnosticTargetDoc.lastQueryIndEstado === 'aceptado' ? 'bg-emerald-100 text-emerald-800' :
                  diagnosticTargetDoc.lastQueryIndEstado === 'rechazado' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                }`}>{diagnosticTargetDoc.lastQueryIndEstado}</span></div>
              )}
              {diagnosticTargetDoc.haciendaResponseCode && (
                <div><strong>Código MensajeHacienda:</strong> <span className="font-mono bg-stone-200 px-1.5 py-0.5 rounded font-bold">{diagnosticTargetDoc.haciendaResponseCode}</span></div>
              )}
              {diagnosticTargetDoc.haciendaResponseMessage && (
                <div className="col-span-1 sm:col-span-2 text-stone-700 bg-white p-2 rounded border border-stone-200">
                  <strong>Detalle de Hacienda:</strong> {diagnosticTargetDoc.haciendaResponseMessage}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto space-y-3">
              <h4 className="font-bold text-stone-800 text-xs uppercase tracking-wider">Historial de Comunicación Directa:</h4>
              {(!diagnosticTargetDoc.diagnosticLogs || diagnosticTargetDoc.diagnosticLogs.length === 0) ? (
                <div className="text-center py-6 text-stone-400 text-xs">
                  No hay logs de diagnóstico detallados registrados para este documento.
                </div>
              ) : (
                diagnosticTargetDoc.diagnosticLogs.map((log, logIdx) => (
                  <div key={log.id || `diag-target-log-${log.step || ''}-${log.timestamp || ''}-${logIdx}`} className="p-3 rounded-xl border border-stone-200 bg-stone-50 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-stone-900">{log.step}</span>
                      <span className="text-[10px] text-stone-400">{new Date(log.timestamp).toLocaleString('es-CR')}</span>
                    </div>
                    
                    <div className="font-mono text-[11px] text-stone-600 bg-stone-100 p-1.5 rounded">
                      <div><strong>Endpoint:</strong> {log.endpoint}</div>
                      {log.httpStatus && (
                        <div><strong>Código HTTP:</strong> <span className={log.httpStatus >= 200 && log.httpStatus < 300 ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>{log.httpStatus}</span></div>
                      )}
                    </div>

                    {log.details && (
                      <div className="text-[11px] text-stone-700">{log.details}</div>
                    )}

                    {log.rawResponse && (
                      <div className="bg-stone-900 text-emerald-400 p-2.5 rounded font-mono text-[10px] overflow-x-auto max-h-32">
                        <pre>{typeof log.rawResponse === 'string' ? log.rawResponse : JSON.stringify(log.rawResponse, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => handleQueryHacienda(diagnosticTargetDoc)}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Consultar Hacienda Ahora</span>
              </button>
              <button
                type="button"
                onClick={() => setShowDiagnosticModal(false)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* XML INSPECTOR MODAL */}
      {showXmlModal && selectedDoc && (
        <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-amber-600" />
                <h3 className="font-extrabold text-base text-stone-900">
                  {xmlModalType === 'EMITTED' ? 'XML de Emisión Oficial (Hacienda v4.4)' : 'XML de Respuesta de Hacienda (MensajeHacienda)'}
                </h3>
              </div>
              <button
                onClick={() => setShowXmlModal(false)}
                className="text-stone-400 hover:text-stone-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-stone-600 flex items-center justify-between">
              <div>Consecutivo: <strong>{selectedDoc.consecutive}</strong></div>
              <div className="font-mono text-[11px]">Clave: {selectedDoc.numericKey}</div>
            </div>

            {/* XML Text Area Display */}
            <div className="flex-1 overflow-auto bg-stone-900 text-emerald-400 p-4 rounded-xl font-mono text-[11px] leading-relaxed shadow-inner">
              <pre className="whitespace-pre-wrap">
                {xmlModalType === 'EMITTED' ? selectedDoc.xmlGenerated : selectedDoc.xmlResponseHacienda}
              </pre>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => {
                  const content = xmlModalType === 'EMITTED' ? selectedDoc.xmlGenerated : selectedDoc.xmlResponseHacienda;
                  if (content) {
                    const blob = new Blob([content], { type: 'application/xml' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    
                    const fileNames = getElectronicDocumentFileNames(selectedDoc.numericKey);
                    a.download = xmlModalType === 'EMITTED' ? fileNames.xml : fileNames.hacienda;
                    
                    a.click();
                  }
                }}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar XML</span>
              </button>
              <button
                type="button"
                onClick={() => setShowXmlModal(false)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMAIL MODAL */}
      {isEmailModalOpen && emailTargetDoc && (
        <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-amber-600" />
                <h3 className="font-extrabold text-base text-stone-900">
                  Despachar Comprobante por Correo
                </h3>
              </div>
              <button
                onClick={() => setIsEmailModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
              <div>Consecutivo: <strong>{emailTargetDoc.consecutive}</strong></div>
              <div>Cliente: <strong>{emailTargetDoc.receiver?.name || 'Cliente de Contado'}</strong></div>
              <div>Total: <strong className="text-amber-700">₡{(emailTargetDoc.total || 0).toLocaleString('es-CR')}</strong></div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 uppercase">Correo Electrónico Destino</label>
              <input
                type="email"
                value={targetEmailAddress}
                onChange={(e) => setTargetEmailAddress(e.target.value)}
                placeholder="cliente@ejemplo.com"
                className="w-full p-2.5 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {emailFeedback && (
              <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                emailFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {emailFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-rose-600" />}
                <span>{emailFeedback.message}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(false)}
                disabled={isSendingEmail}
                className="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSendInvoiceEmail}
                disabled={isSendingEmail}
                className="px-5 py-2.5 text-xs font-extrabold bg-amber-600 hover:bg-amber-500 text-white rounded-xl shadow-md flex items-center gap-1.5"
              >
                {isSendingEmail ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar Archivos Fiscales</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMIT CREDIT NOTE MODAL DGT v4.4 */}
      <CreditNoteModal
        isOpen={isNcModalOpen}
        onClose={() => {
          setIsNcModalOpen(false);
          setNcTargetDoc(null);
        }}
        targetDoc={ncTargetDoc}
        cashierName="Cajero Principal"
        onSuccess={() => {
          loadData();
        }}
      />

      {/* COMPREHENSIVE DOCUMENT DETAILS & ERROR ANALYZER MODAL */}
      {isDetailModalOpen && detailDoc && (
        <div className="fixed inset-0 z-50 bg-stone-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col my-auto border border-stone-200">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-stone-200 pb-3 gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {getDocTypeBadge(detailDoc.documentType)}
                  {getStatusBadge(detailDoc.status)}
                  <span className="text-xs font-mono font-bold text-stone-500">
                    Consecutivo: {detailDoc.consecutive}
                  </span>
                </div>
                <h3 className="font-extrabold text-base sm:text-lg text-stone-900 mt-1">
                  Visor & Analizador Fiscal de Comprobante
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-stone-500 font-mono">Clave (50 dígs):</span>
                  <span className="font-mono text-[11px] font-semibold text-stone-700 bg-stone-100 px-2 py-0.5 rounded border border-stone-200 break-all select-all">
                    {detailDoc.numericKey}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyKey(detailDoc.numericKey)}
                    className="text-stone-500 hover:text-stone-800 p-1 rounded hover:bg-stone-100 transition-colors"
                    title="Copiar Clave Numérica"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 font-bold text-xl p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Tabs Navigation */}
            <div className="flex border-b border-stone-200 gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => setDetailTab('OVERVIEW')}
                className={`px-3 py-2 text-xs font-bold rounded-t-xl transition-colors flex items-center gap-1.5 border-b-2 ${
                  detailTab === 'OVERVIEW'
                    ? 'border-amber-600 text-amber-900 bg-amber-50/70'
                    : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-50'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Comprobante & Factura</span>
              </button>

              <button
                type="button"
                onClick={() => setDetailTab('DIAGNOSTIC')}
                className={`px-3 py-2 text-xs font-bold rounded-t-xl transition-colors flex items-center gap-1.5 border-b-2 ${
                  detailTab === 'DIAGNOSTIC'
                    ? 'border-indigo-600 text-indigo-900 bg-indigo-50/70'
                    : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-50'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Valoración & Análisis de Error</span>
                {detailDoc.status === 'RECHAZADO_HACIENDA' && (
                  <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setDetailTab('XML_EMITTED')}
                className={`px-3 py-2 text-xs font-bold rounded-t-xl transition-colors flex items-center gap-1.5 border-b-2 ${
                  detailTab === 'XML_EMITTED'
                    ? 'border-blue-600 text-blue-900 bg-blue-50/70'
                    : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-50'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>XML Firmado (v4.4)</span>
              </button>

              {detailDoc.xmlResponseHacienda && (
                <button
                  type="button"
                  onClick={() => setDetailTab('XML_RESPONSE')}
                  className={`px-3 py-2 text-xs font-bold rounded-t-xl transition-colors flex items-center gap-1.5 border-b-2 ${
                    detailTab === 'XML_RESPONSE'
                      ? 'border-emerald-600 text-emerald-900 bg-emerald-50/70'
                      : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-50'
                  }`}
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>XML Respuesta Hacienda</span>
                </button>
              )}
            </div>

            {/* Modal Body Content */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">

              {/* TAB 1: OVERVIEW & INVOICE DETAILS */}
              {detailTab === 'OVERVIEW' && (
                <div className="space-y-4 text-xs">
                  {/* Status Banner */}
                  {detailDoc.status === 'RECHAZADO_HACIENDA' && (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-extrabold text-xs">Comprobante Rechazado por Hacienda</div>
                        <div className="text-[11.5px] leading-relaxed">
                          {detailDoc.haciendaRejectionReason || detailDoc.haciendaResponseMessage || 'Hacienda no aprobó la estructura o firma digital del comprobante.'}
                        </div>
                        <button
                          type="button"
                          onClick={() => setDetailTab('DIAGNOSTIC')}
                          className="text-[11px] font-bold text-rose-700 underline hover:text-rose-900 pt-1 block"
                        >
                          → Ver análisis detallado del error y guía de solución
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Issuer and Receiver Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Issuer Card */}
                    <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-extrabold text-stone-900 border-b border-stone-200 pb-1.5">
                        <Building2 className="w-4 h-4 text-amber-700" />
                        <span>Emisor (Restaurante)</span>
                      </div>
                      <div className="font-bold text-stone-800">{detailDoc.issuer.name}</div>
                      <div className="text-stone-600">Nombre Comercial: {detailDoc.issuer.commercialName}</div>
                      <div className="text-stone-600">Cédula: <strong>{detailDoc.issuer.identificationNumber}</strong> ({detailDoc.issuer.identificationType})</div>
                      <div className="text-stone-600">Actividad DGT: <strong>{detailDoc.economicActivity || '561001'}</strong></div>
                      <div className="text-stone-600">Correo: {detailDoc.issuer.email}</div>
                      <div className="text-stone-600">Ubicación: {detailDoc.issuer.address}, {detailDoc.issuer.district}, {detailDoc.issuer.canton}, {detailDoc.issuer.province}</div>
                    </div>

                    {/* Receiver Card */}
                    <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-extrabold text-stone-900 border-b border-stone-200 pb-1.5">
                        <User className="w-4 h-4 text-amber-700" />
                        <span>Receptor (Cliente)</span>
                      </div>
                      <div className="font-bold text-stone-800">{detailDoc.receiver?.name || 'Consumidor Final (Mostrador)'}</div>
                      {detailDoc.receiver?.identificationNumber ? (
                        <div className="text-stone-600">
                          Identificación: <strong>{detailDoc.receiver.identificationNumber}</strong> ({detailDoc.receiver.identificationType || 'Física'})
                        </div>
                      ) : (
                        <div className="text-stone-500 italic">Venta simplificada sin cédula registrada</div>
                      )}
                      {detailDoc.receiver?.email ? (
                        <div className="text-stone-600 flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{detailDoc.receiver.email}</span>
                        </div>
                      ) : (
                        <div className="text-stone-500 italic">Sin correo electrónico registrado</div>
                      )}
                      {detailDoc.receiver?.address && (
                        <div className="text-stone-600">Dirección: {detailDoc.receiver.address}</div>
                      )}
                      <div className="text-stone-600">
                        Condición de Venta: <strong>{detailDoc.saleCondition === '02' ? 'Crédito' : 'Contado'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Lines Items Table */}
                  <div className="border border-stone-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                    <div className="bg-stone-100/80 px-3.5 py-2 font-extrabold text-stone-800 text-xs flex items-center justify-between">
                      <span>Líneas de Detalle de Facturación</span>
                      <span className="text-stone-500 font-normal">{detailDoc.lines.length} {detailDoc.lines.length === 1 ? 'ítem' : 'ítems'}</span>
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="bg-stone-50 text-stone-600 text-[10px] uppercase font-bold border-b border-stone-200">
                        <tr>
                          <th className="py-2 px-3">#</th>
                          <th className="py-2 px-3">Código CABYS</th>
                          <th className="py-2 px-3">Descripción</th>
                          <th className="py-2 px-3 text-right">Cant.</th>
                          <th className="py-2 px-3 text-right">Precio Unit.</th>
                          <th className="py-2 px-3 text-right">IVA</th>
                          <th className="py-2 px-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {detailDoc.lines.map((line, idx) => (
                          <tr key={`detail-line-${line.lineNumber || idx}-${line.cabysCode || ''}-${line.productId || ''}`} className="hover:bg-stone-50/50">
                            <td className="py-2.5 px-3 text-stone-400 font-mono text-[10px]">{line.lineNumber || idx + 1}</td>
                            <td className="py-2.5 px-3 font-mono text-[10px] text-stone-600">{line.cabysCode || '6339900000000'}</td>
                            <td className="py-2.5 px-3 font-semibold text-stone-800">{line.description}</td>
                            <td className="py-2.5 px-3 text-right font-mono">{line.quantity}</td>
                            <td className="py-2.5 px-3 text-right font-mono">₡{(line.unitPrice || 0).toLocaleString('es-CR')}</td>
                            <td className="py-2.5 px-3 text-right text-stone-600 font-mono">
                              {line.taxRate}% (₡{(line.taxAmount || 0).toLocaleString('es-CR')})
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-amber-800 font-mono">
                              ₡{(line.totalLine || line.totalLineAmount || (line.quantity * line.unitPrice)).toLocaleString('es-CR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial Totals Summary */}
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4 p-4 bg-stone-50 rounded-xl border border-stone-200">
                    <div className="space-y-1 text-xs">
                      <div className="font-bold text-stone-800">Formas de Pago Aplicadas:</div>
                      {detailDoc.paymentMethods && detailDoc.paymentMethods.length > 0 ? (
                        detailDoc.paymentMethods.map((pm, i) => (
                          <div key={`detail-pm-${pm.method || ''}-${i}`} className="text-stone-600 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                            <span>{pm.method}: <strong>₡{(pm.amount || 0).toLocaleString('es-CR')}</strong></span>
                          </div>
                        ))
                      ) : (
                        <div className="text-stone-500 italic">Efectivo / Contado</div>
                      )}
                      <div className="text-[11px] text-stone-400 pt-1">
                        Emisión: {new Date(detailDoc.issueDate).toLocaleString('es-CR')}
                      </div>
                    </div>

                    <div className="w-full sm:w-64 space-y-1.5 text-xs text-right">
                      <div className="flex justify-between text-stone-600">
                        <span>Subtotal Neto:</span>
                        <span className="font-mono">₡{(detailDoc.subtotal || 0).toLocaleString('es-CR')}</span>
                      </div>
                      {(detailDoc.discountTotal || 0) > 0 && (
                        <div className="flex justify-between text-emerald-700">
                          <span>Descuentos:</span>
                          <span className="font-mono">-₡{(detailDoc.discountTotal || 0).toLocaleString('es-CR')}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-stone-600">
                        <span>IVA Total:</span>
                        <span className="font-mono">₡{(detailDoc.taxTotal || 0).toLocaleString('es-CR')}</span>
                      </div>
                      <div className="flex justify-between text-base font-black text-stone-900 pt-1.5 border-t border-stone-200">
                        <span>Total Facturado:</span>
                        <span className="text-amber-800 font-mono">₡{(detailDoc.total || 0).toLocaleString('es-CR')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: DIAGNOSTIC & ERROR ANALYSIS */}
              {detailTab === 'DIAGNOSTIC' && (
                <div className="space-y-4 text-xs">
                  {/* Current Status Box */}
                  <div className="p-4 rounded-xl border bg-stone-50 border-stone-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-stone-900">Estado Oficial ante Hacienda:</span>
                        {getStatusBadge(detailDoc.status)}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleQueryHacienda(detailDoc)}
                        disabled={queryingKey === detailDoc.numericKey}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${queryingKey === detailDoc.numericKey ? 'animate-spin' : ''}`} />
                        <span>Consultar en Hacienda</span>
                      </button>
                    </div>

                    {/* Detailed Analysis of Rejection / Error */}
                    {detailDoc.status === 'RECHAZADO_HACIENDA' ? (
                      <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-rose-900">
                        <div className="font-extrabold text-xs flex items-center gap-1.5 text-rose-800">
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                          <span>Motivo de Rechazo por la DGT:</span>
                        </div>
                        <div className="text-xs bg-white p-2.5 rounded-lg border border-rose-200 font-mono text-rose-950 whitespace-pre-wrap leading-relaxed">
                          {detailDoc.haciendaRejectionReason || detailDoc.haciendaResponseMessage || 'Rechazado en validación de esquema XML o certificado digital.'}
                        </div>

                        {/* Recommendation Guide based on Error */}
                        <div className="bg-rose-100/60 p-3 rounded-lg space-y-1.5 text-[11.5px]">
                          <div className="font-bold text-rose-900 flex items-center gap-1">
                            <Info className="w-3.5 h-3.5 text-rose-700" />
                            <span>Guía de Corrección Tributaria:</span>
                          </div>
                          {((detailDoc.statusDescription || '').includes('-99') || 
                            (detailDoc.haciendaRejectionReason || '').includes('ya existe') || 
                            (detailDoc.statusDescription || '').includes('ya existe')) ? (
                            <div className="bg-amber-100/80 p-2.5 rounded-md border border-amber-300 text-amber-950 font-medium space-y-1">
                              <p className="font-bold text-amber-900">⚠️ Consecutivo Duplicado (-99):</p>
                              <p>El consecutivo {detailDoc.consecutive} ya había sido emitido previamente a Hacienda (común si se intentó facturar sin internet con un bloque desactualizado). Presione el botón <strong className="text-amber-900">Reemitir Comprobante</strong> en el pie de esta ventana para generar un nuevo consecutivo vigente y enviarlo a Hacienda.</p>
                            </div>
                          ) : null}
                          <ul className="list-disc list-inside space-y-0.5 text-rose-800">
                            <li>Verifique que la llave criptográfica `.p12` y el PIN de 4 dígitos estén vigentes en el botón de <strong>Llave & Consecutivos</strong>.</li>
                            <li>Compruebe que el usuario y contraseña IDP de ATV coincidan con el ambiente (Sandbox o Producción).</li>
                            <li>Si el receptor requería Factura Electrónica (01), asegúrese de que su Cédula y Actividad Económica estén registradas en el padrón de Hacienda.</li>
                            <li>Para corregir una transacción rechazada, presione <strong>Reemitir Comprobante</strong> para asignarle un nuevo consecutivo oficial vigente.</li>
                          </ul>
                        </div>
                      </div>
                    ) : detailDoc.status === 'ACEPTADO_HACIENDA' ? (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1 text-emerald-900">
                        <div className="font-extrabold text-xs flex items-center gap-1.5 text-emerald-800">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Comprobante Aprobado y Validado por el Ministerio de Hacienda</span>
                        </div>
                        <p className="text-[11.5px] text-emerald-800">
                          El comprobante fue recibido, firmado y aceptado legalmente por los servidores del Ministerio de Hacienda de Costa Rica (DGT v4.4).
                        </p>
                        {detailDoc.haciendaResponseDate && (
                          <div className="text-[10.5px] text-emerald-700 pt-1">
                            Fecha de Aceptación: {new Date(detailDoc.haciendaResponseDate).toLocaleString('es-CR')}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-amber-900">
                        <div className="font-extrabold text-xs flex items-center gap-1.5 text-amber-800">
                          <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                          <span>Enviado a Hacienda - Procesando Respuesta</span>
                        </div>
                        <p className="text-[11.5px] text-amber-800">
                          El documento fue enviado al API de Hacienda y está en cola de validación. Haga clic en &quot;Consultar en Hacienda&quot; para obtener la resolución definitiva.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* HTTP Endpoint & Diagnostic Metadata */}
                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <span className="text-stone-500 block">Endpoint de Envío:</span>
                      <span className="font-mono text-[10.5px] text-stone-700 break-all">
                        {detailDoc.sendEndpoint || 'https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1/recepcion'}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 block">Código HTTP de Recepción:</span>
                      <span className="font-mono font-bold bg-stone-200 px-1.5 py-0.5 rounded text-stone-800">
                        {detailDoc.sendHttpStatus || 202}
                      </span>
                    </div>
                    {detailDoc.lastQueryIndEstado && (
                      <div>
                        <span className="text-stone-500 block">Último ind-estado DGT:</span>
                        <span className={`font-mono font-bold px-1.5 py-0.5 rounded ${
                          detailDoc.lastQueryIndEstado === 'aceptado' ? 'bg-emerald-100 text-emerald-800' :
                          detailDoc.lastQueryIndEstado === 'rechazado' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {detailDoc.lastQueryIndEstado}
                        </span>
                      </div>
                    )}
                    {detailDoc.haciendaResponseCode && (
                      <div>
                        <span className="text-stone-500 block">Código MensajeHacienda:</span>
                        <span className="font-mono font-bold bg-stone-200 px-1.5 py-0.5 rounded text-stone-800">
                          {detailDoc.haciendaResponseCode}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Diagnostic Logs History */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-stone-800 text-xs uppercase tracking-wider">
                      Historial Técnico de Intentos & Respuestas DGT:
                    </h4>
                    {(!detailDoc.diagnosticLogs || detailDoc.diagnosticLogs.length === 0) ? (
                      <div className="text-center py-6 text-stone-400 text-xs bg-stone-50 rounded-xl border border-stone-200">
                        No hay logs de diagnóstico detallados registrados para este documento.
                      </div>
                    ) : (
                      detailDoc.diagnosticLogs.map((log, logIdx) => (
                        <div key={log.id || `diag-modal-log-${log.step || log.action || ''}-${log.timestamp || ''}-${logIdx}`} className="p-3 rounded-xl border border-stone-200 bg-stone-50 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-stone-900">{log.action || log.step}</span>
                            <span className="text-[10px] text-stone-400">{new Date(log.timestamp).toLocaleString('es-CR')}</span>
                          </div>
                          <div className="font-mono text-[10.5px] text-stone-600 bg-stone-100 p-1.5 rounded">
                            <div><strong>Endpoint:</strong> {log.endpoint}</div>
                            {log.httpStatus && (
                              <div>
                                <strong>Código HTTP:</strong>{' '}
                                <span className={log.httpStatus >= 200 && log.httpStatus < 300 ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                                  {log.httpStatus}
                                </span>
                              </div>
                            )}
                          </div>
                          {log.parsedMessage && (
                            <div className="text-[11px] text-stone-700">{log.parsedMessage}</div>
                          )}
                          {log.rawResponse && (
                            <div className="bg-stone-900 text-emerald-400 p-2.5 rounded-lg font-mono text-[10px] overflow-x-auto max-h-36">
                              <pre>{typeof log.rawResponse === 'string' ? log.rawResponse : JSON.stringify(log.rawResponse, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: XML EMITTED OFFICIAL */}
              {detailTab === 'XML_EMITTED' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-stone-600">
                    <span>Estructura XML 4.4 Firmada Digitalmente (XAdES-EPES)</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (detailDoc.xmlGenerated) {
                          navigator.clipboard.writeText(detailDoc.xmlGenerated);
                          alert('¡XML copiado al portapapeles!');
                        }
                      }}
                      className="px-2.5 py-1 text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar XML</span>
                    </button>
                  </div>
                  <div className="bg-stone-900 text-emerald-400 p-4 rounded-xl font-mono text-[11px] leading-relaxed shadow-inner overflow-x-auto max-h-96">
                    <pre className="whitespace-pre-wrap">{detailDoc.xmlGenerated || 'XML no disponible'}</pre>
                  </div>
                </div>
              )}

              {/* TAB 4: XML RESPONSE HACIENDA */}
              {detailTab === 'XML_RESPONSE' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-stone-600">
                    <span>MensajeHacienda Oficial (Resolución y Firma DGT)</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (detailDoc.xmlResponseHacienda) {
                          navigator.clipboard.writeText(detailDoc.xmlResponseHacienda);
                          alert('¡XML de Hacienda copiado al portapapeles!');
                        }
                      }}
                      className="px-2.5 py-1 text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar XML Respuesta</span>
                    </button>
                  </div>
                  <div className="bg-stone-900 text-emerald-400 p-4 rounded-xl font-mono text-[11px] leading-relaxed shadow-inner overflow-x-auto max-h-96">
                    <pre className="whitespace-pre-wrap">{detailDoc.xmlResponseHacienda || 'XML de respuesta de Hacienda no recibido todavía'}</pre>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-200">
              <div className="flex flex-wrap items-center gap-2">
                {/* Botón Imprimir Ticket Térmico Fiscal (56/80mm) */}
                <button
                  type="button"
                  onClick={() => handlePrintThermalReceipt(detailDoc)}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 border border-amber-600 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                  title="Imprimir Comprobante Térmico Fiscal (56 mm / 80 mm)"
                >
                  <Printer className="w-4 h-4 text-stone-950" />
                  <span>Imprimir Térmica (56/80mm)</span>
                </button>

                {/* PDF Download */}
                <a
                  href={PosApiService.getDownloadPdfUrl(detailDoc.numericKey)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                  title="Descargar Representación Gráfica Oficial en PDF (con QR DGT)"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>PDF Oficial</span>
                </a>

                {/* XML Download */}
                <a
                  href={PosApiService.getDownloadXmlUrl(detailDoc.numericKey)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                  title="Descargar XML Emitido Firmado v4.4"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>XML Firmado</span>
                </a>

                {/* Email Dispatch */}
                <button
                  type="button"
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    handleOpenEmailModal(detailDoc);
                  }}
                  className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Despachar Correo</span>
                </button>

                {/* Credit Note (if eligible) */}
                {detailDoc.documentType !== '03' && (detailDoc.status !== 'ANULADO_POR_NC' || isNcRejectedForDoc(detailDoc)) && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      handleOpenCreditNote(detailDoc);
                    }}
                    className={`px-3 py-2 border rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                      isNcRejectedForDoc(detailDoc)
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{isNcRejectedForDoc(detailDoc) ? 'Reemitir NC Corregida' : 'Emitir NC'}</span>
                  </button>
                )}

                {/* Reissue Rejected Document in Modal */}
                {detailDoc.status === 'RECHAZADO_HACIENDA' && (
                  <button
                    type="button"
                    onClick={() => handleReissueDocument(detailDoc)}
                    disabled={reissuingKey === detailDoc.numericKey}
                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                    title="Reemitir comprobante asignando un consecutivo vigente oficial"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${reissuingKey === detailDoc.numericKey ? 'animate-spin' : ''}`} />
                    <span>{reissuingKey === detailDoc.numericKey ? 'Reemitiendo...' : 'Reemitir Comprobante'}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleQueryHacienda(detailDoc)}
                  disabled={queryingKey === detailDoc.numericKey}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${queryingKey === detailDoc.numericKey ? 'animate-spin' : ''}`} />
                  <span>Consultar Estado DGT</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsDetailModalOpen(false)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL DE IMPRESIÓN TÉRMICA FISCAL (56mm / 80mm) */}
      <ThermalReceiptModal
        isOpen={isThermalModalOpen}
        onClose={() => setIsThermalModalOpen(false)}
        sale={thermalSale}
        initialType="INVOICE"
      />

      {/* MODAL DE CONFIGURACIÓN DIRECTA AUTÓNOMA DE HACIENDA */}
      <HaciendaConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onSaved={() => {
          loadData();
        }}
      />
    </div>
  );
};
