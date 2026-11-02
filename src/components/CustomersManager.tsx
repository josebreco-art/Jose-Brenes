import React, { useState, useRef } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Mail, 
  Phone, 
  MapPin, 
  Building2, 
  UserCheck, 
  CheckCircle2,
  UploadCloud,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Download,
  Info
} from 'lucide-react';
import { Customer, IdentificationType } from '../types/pos';
import { parseCustomersCSV, DEFAULT_CLIENTS_CSV_RAW } from '../utils/customerCsvParser';
import { FiscalReceiverForm } from './FiscalReceiverForm';

interface CustomersManagerProps {
  customers: Customer[];
  onSaveCustomer: (c: Customer) => Promise<void>;
  onImportCustomers?: (list: Customer[], replaceAll?: boolean) => Promise<void>;
  onDeleteCustomer?: (id: string) => Promise<void>;
}

export const CustomersManager: React.FC<CustomersManagerProps> = ({
  customers,
  onSaveCustomer,
  onImportCustomers,
  onDeleteCustomer
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');

  // Modal de importación de clientes
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importTab, setImportTab] = useState<'FILE' | 'PASTE'>('FILE');
  const [rawCsvText, setRawCsvText] = useState<string>('');
  const [parsedPreview, setParsedPreview] = useState<Customer[]>([]);
  const [skippedCount, setSkippedCount] = useState<number>(0);
  const [parseErrors, setParseErrors] = useState<number>(0);
  const [replaceAll, setReplaceAll] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialCustomer: Customer = {
    id: `cust-${Date.now()}`,
    name: '',
    identification: '',
    identificationType: '01',
    phone: '',
    email: '',
    address: 'Cervantes de Alvarado',
    province: 'Cartago',
    canton: 'Alvarado',
    district: 'Cervantes',
    fiscalCondition: 'Persona Física (Receptor Electrónico)',
    createdAt: new Date().toISOString()
  };

  // Filtrado de clientes
  const filteredCustomers = customers.filter(c => {
    const matchesSearch = 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.identification.includes(searchQuery) ||
      (c.phone && c.phone.includes(searchQuery)) ||
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.canton && c.canton.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.province && c.province.toLowerCase().includes(searchQuery.toLowerCase()));

    if (selectedTypeFilter === 'ALL') return matchesSearch;
    return matchesSearch && c.identificationType === selectedTypeFilter;
  });

  // Paginación de clientes
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 12;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedTypeFilter]);

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage) || 1;
  const paginatedCustomers = filteredCustomers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleStartCreate = () => {
    setEditingCustomer({ ...initialCustomer, id: `cust-${Date.now()}` });
    setIsCreating(true);
  };

  const handleStartEdit = (customer: Customer) => {
    setEditingCustomer({ ...customer });
    setIsCreating(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    await onSaveCustomer(editingCustomer);
    setEditingCustomer(null);
    setIsCreating(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`¿Desea eliminar de la base de datos al cliente "${name}"?`)) {
      if (onDeleteCustomer) {
        await onDeleteCustomer(id);
      }
    }
  };

  // Manejo de archivo CSV
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawCsvText(content);
        processCsvContent(content);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleTextChange = (text: string) => {
    setRawCsvText(text);
    processCsvContent(text);
  };

  const processCsvContent = (content: string) => {
    try {
      const { customers: parsed, duplicatesSkipped, errorsCount } = parseCustomersCSV(content);
      setParsedPreview(parsed);
      setSkippedCount(duplicatesSkipped);
      setParseErrors(errorsCount);
      setImportSuccessMsg(null);
    } catch {
      setParsedPreview([]);
      setParseErrors(1);
    }
  };

  const handleLoadMasterDefault = () => {
    setRawCsvText(DEFAULT_CLIENTS_CSV_RAW);
    processCsvContent(DEFAULT_CLIENTS_CSV_RAW);
  };

  const handleExecuteImport = async () => {
    if (parsedPreview.length === 0) return;
    setIsImporting(true);
    try {
      if (onImportCustomers) {
        await onImportCustomers(parsedPreview, replaceAll);
      }
      setImportSuccessMsg(`¡Se importaron ${parsedPreview.length} clientes correctamente a la base de datos!`);
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportSuccessMsg(null);
        setParsedPreview([]);
        setRawCsvText('');
      }, 1500);
    } catch (err) {
      alert('Error al guardar clientes en la base de datos.');
    } finally {
      setIsImporting(false);
    }
  };

  // Conteo de tipos
  const fisicasCount = customers.filter(c => c.identificationType === '01').length;
  const juridicasCount = customers.filter(c => c.identificationType === '02').length;
  const dimexCount = customers.filter(c => c.identificationType === '03' || c.identificationType === '05').length;

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-50px)] overflow-hidden bg-stone-100 p-3 sm:p-5 space-y-3">
      
      {/* Top Banner / Stats */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-lg text-stone-900 leading-tight">
                Directorio & Base de Datos de Clientes
              </h2>
              <p className="text-xs text-stone-500">
                Padrón de contribuyentes para Facturación Electrónica DGT v4.4 (Costa Rica).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="px-2.5 py-0.5 rounded-lg bg-stone-100 text-stone-700 font-bold border border-stone-200">
              Total: {customers.length}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-semibold border border-blue-200">
              Cédulas Físicas (01): {fisicasCount}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-purple-50 text-purple-700 font-semibold border border-purple-200">
              Cédulas Jurídicas (02): {juridicasCount}
            </span>
            {dimexCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                DIMEX/Extranjeros: {dimexCount}
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search bar */}
          <div className="relative min-w-[220px] flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Buscar nombre, cédula, correo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden transition-all"
            />
          </div>

          {/* Type filter pills */}
          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl text-stone-700 font-semibold"
          >
            <option value="ALL">Todos los tipos</option>
            <option value="01">Cédula Física (01)</option>
            <option value="02">Cédula Jurídica (02)</option>
            <option value="03">DIMEX (03)</option>
          </select>

          {/* Import button */}
          <button
            id="open-import-customers-modal-btn"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
            title="Importar catálogo masivo desde CSV o Excel"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Importar CSV / Base de Datos</span>
          </button>

          {/* Create new button */}
          <button
            id="create-customer-btn"
            onClick={handleStartCreate}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {/* Customers Table */}
      <div className="flex-1 bg-white rounded-2xl border border-stone-200 overflow-hidden flex flex-col shadow-xs">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-stone-100 text-stone-700 font-bold sticky top-0 z-10 border-b border-stone-200 shadow-2xs">
              <tr>
                <th className="p-3">Nombre / Razón Social</th>
                <th className="p-3">Identificación DGT</th>
                <th className="p-3">Teléfono</th>
                <th className="p-3">Correo Electrónico</th>
                <th className="p-3">Ubicación (Cantón / Provincia)</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {paginatedCustomers.map(c => {
                const isJuridica = c.identificationType === '02';
                const isFisica = c.identificationType === '01';
                return (
                  <tr key={c.id} className="hover:bg-amber-50/40 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-stone-900 flex items-center gap-1.5">
                        {isJuridica ? (
                          <Building2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        ) : (
                          <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        )}
                        <span>{c.name}</span>
                      </div>
                      <div className="text-[10px] text-stone-400 pl-5">
                        {c.fiscalCondition || (isJuridica ? 'Persona Jurídica' : 'Persona Física')}
                      </div>
                    </td>
                    <td className="p-3 font-mono">
                      <span className="font-bold text-stone-900 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                        {c.identification}
                      </span>
                      <span className="text-[10px] text-stone-500 block mt-0.5">
                        {isJuridica ? '02 - Cédula Jurídica' : isFisica ? '01 - Cédula Física' : '03 - DIMEX'}
                      </span>
                    </td>
                    <td className="p-3 text-stone-700">
                      {c.phone ? (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-stone-400" />
                          <span>{c.phone}</span>
                        </div>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>
                    <td className="p-3 text-stone-700">
                      {c.email ? (
                        <div className="flex items-center gap-1 truncate max-w-[220px]" title={c.email}>
                          <Mail className="w-3 h-3 text-amber-500 shrink-0" />
                          <span className="truncate">{c.email}</span>
                        </div>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>
                    <td className="p-3 text-stone-600">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                        <span className="font-medium">{c.canton || 'Cervantes'}, {c.province || 'Cartago'}</span>
                      </div>
                      {c.address && (
                        <div className="text-[10px] text-stone-400 truncate max-w-[200px]" title={c.address}>
                          {c.address}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {c.identification === '000000000' || c.id === 'cust-generic-cash' ? (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200" title="Registro protegido del sistema">
                            <span>SISTEMA</span>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleStartEdit(c)}
                              className="p-1.5 text-stone-600 hover:text-amber-700 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer"
                              title="Editar Cliente"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            {onDeleteCustomer && (
                              <button
                                onClick={() => handleDelete(c.id, c.name)}
                                className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Eliminar Cliente"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-stone-400">
                    <Users className="w-8 h-8 mx-auto text-stone-300 mb-2" />
                    <p className="font-semibold">No se encontraron clientes que coincidan con la búsqueda.</p>
                    <p className="text-xs text-stone-400 mt-1">
                      Haga clic en &quot;Importar CSV&quot; para cargar la base de datos de clientes.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer pagination info & controls */}
        <div className="p-3 bg-stone-50 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-stone-600">
          <span>Mostrando {paginatedCustomers.length} de {filteredCustomers.length} filtrados ({customers.length} total)</span>
          
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`px-3 py-1 rounded-lg border font-bold transition-all ${
                currentPage === 1 ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed' : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50 cursor-pointer'
              }`}
            >
              Anterior
            </button>
            <span className="px-2 font-bold text-stone-700">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className={`px-3 py-1 rounded-lg border font-bold transition-all ${
                currentPage >= totalPages ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed' : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50 cursor-pointer'
              }`}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: IMPORTADOR MASIVO DE CLIENTES CSV                                  */}
      {/* ========================================================================= */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-5 shadow-2xl space-y-4 my-auto max-h-[92vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-stone-900">
                    Importar Base de Datos de Clientes
                  </h3>
                  <p className="text-xs text-stone-500">
                    Cargue su archivo CSV o pegue la información para alimentar el catálogo tributario.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsImportModalOpen(false)} 
                className="text-stone-400 hover:text-stone-700 text-lg font-bold p-1 rounded-lg hover:bg-stone-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              
              {/* Quick Template / Preload Banner */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-amber-900">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>¿Desea cargar la lista maestra de Sabor Cervanteño?</strong> Contiene los 130+ clientes comerciales ya homologados.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleLoadMasterDefault}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shrink-0 transition-colors shadow-xs cursor-pointer"
                >
                  Cargar Lista Maestra en 1 Clic
                </button>
              </div>

              {/* Tabs: Upload File vs Paste Text */}
              <div className="flex items-center gap-2 border-b border-stone-200 text-xs font-bold">
                <button
                  onClick={() => setImportTab('FILE')}
                  className={`pb-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                    importTab === 'FILE' 
                      ? 'border-emerald-600 text-emerald-800' 
                      : 'border-transparent text-stone-400 hover:text-stone-700'
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Subir Archivo (.csv / .txt)</span>
                </button>
                <button
                  onClick={() => setImportTab('PASTE')}
                  className={`pb-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                    importTab === 'PASTE' 
                      ? 'border-emerald-600 text-emerald-800' 
                      : 'border-transparent text-stone-400 hover:text-stone-700'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Pegar Texto CSV Directamente</span>
                </button>
              </div>

              {/* Tab 1: File Input Drag & Drop */}
              {importTab === 'FILE' && (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-stone-300 hover:border-emerald-500 bg-stone-50 hover:bg-emerald-50/30 rounded-2xl p-6 text-center cursor-pointer transition-all space-y-2"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <UploadCloud className="w-10 h-10 mx-auto text-emerald-600" />
                  <p className="text-sm font-bold text-stone-800">
                    Haga clic aquí para seleccionar o arrastre su archivo .CSV
                  </p>
                  <p className="text-xs text-stone-400 max-w-md mx-auto">
                    Formato compatible: Columnas de Nombre, Tipo de Identificación, Cédula, Teléfono, Ubicación y Correo.
                  </p>
                </div>
              )}

              {/* Tab 2: Paste Raw Text */}
              {importTab === 'PASTE' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-700 block">
                    Pegue el contenido CSV con encabezados o datos separados por comas:
                  </label>
                  <textarea
                    rows={6}
                    value={rawCsvText}
                    onChange={(e) => handleTextChange(e.target.value)}
                    placeholder={'"Nombre","Tipo de identificación","Identificación","Teléfono 1","Provincia","Cantón","Distrito","Correo"...\n"EMPACADORA AGRICOLA LA TRINIDAD","Cédula Jurídica","3101531792","25347858","Cartago","Alvarado","Cervantes","compras@agricolamorales.com"'}
                    className="w-full p-3 font-mono text-[11px] bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              )}

              {/* Live Parsing Stats */}
              {parsedPreview.length > 0 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <span className="text-stone-500 text-[10px] block">Clientes Detectados:</span>
                      <span className="text-lg font-black text-emerald-700">{parsedPreview.length}</span>
                    </div>
                    <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                      <span className="text-stone-500 text-[10px] block">Cédulas Físicas (01):</span>
                      <span className="text-lg font-black text-blue-700">
                        {parsedPreview.filter(c => c.identificationType === '01').length}
                      </span>
                    </div>
                    <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl">
                      <span className="text-stone-500 text-[10px] block">Cédulas Jurídicas (02):</span>
                      <span className="text-lg font-black text-purple-700">
                        {parsedPreview.filter(c => c.identificationType === '02').length}
                      </span>
                    </div>
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                      <span className="text-stone-500 text-[10px] block">Duplicados Omitidos:</span>
                      <span className="text-lg font-black text-amber-700">{skippedCount}</span>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-stone-200 rounded-xl overflow-hidden">
                    <div className="bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-700 border-b border-stone-200 flex justify-between items-center">
                      <span>Vista Previa de Importación (Primeros 15 registros)</span>
                      <span className="text-[10px] text-stone-500">Se guardarán en la base de datos</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-stone-50 text-stone-500 sticky top-0 border-b border-stone-100">
                          <tr>
                            <th className="p-2">Nombre / Razón Social</th>
                            <th className="p-2">Tipo</th>
                            <th className="p-2">Cédula</th>
                            <th className="p-2">Teléfono</th>
                            <th className="p-2">Correo</th>
                            <th className="p-2">Cantón / Provincia</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {parsedPreview.slice(0, 15).map((p, idx) => (
                            <tr key={idx} className="hover:bg-stone-50">
                              <td className="p-2 font-bold text-stone-800 truncate max-w-[180px]">{p.name}</td>
                              <td className="p-2">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  p.identificationType === '02' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {p.identificationType === '02' ? 'Jurídica' : 'Física'}
                                </span>
                              </td>
                              <td className="p-2 font-mono font-bold text-stone-700">{p.identification}</td>
                              <td className="p-2 text-stone-600">{p.phone || '—'}</td>
                              <td className="p-2 text-stone-600 truncate max-w-[140px]">{p.email || '—'}</td>
                              <td className="p-2 text-stone-500">{p.canton}, {p.province}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mode Options */}
                  <div className="flex items-center gap-2 text-xs text-stone-700 bg-stone-50 p-2.5 rounded-xl border border-stone-200">
                    <input
                      type="checkbox"
                      id="replace-all-check"
                      checked={replaceAll}
                      onChange={(e) => setReplaceAll(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                    />
                    <label htmlFor="replace-all-check" className="cursor-pointer">
                      <strong>Reemplazar completamente el catálogo existente</strong> (Si no se marca, se mezclarán y actualizarán los clientes existentes).
                    </label>
                  </div>
                </div>
              )}

              {/* Success Message Toast */}
              {importSuccessMsg && (
                <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{importSuccessMsg}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={parsedPreview.length === 0 || isImporting}
                  onClick={handleExecuteImport}
                  className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-extrabold text-white shadow-md transition-all cursor-pointer ${
                    parsedPreview.length > 0 && !isImporting
                      ? 'bg-emerald-700 hover:bg-emerald-600'
                      : 'bg-stone-300 cursor-not-allowed text-stone-500'
                  }`}
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Guardando en BD...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Guardar {parsedPreview.length} Clientes en Base de Datos</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREAR / EDITAR CLIENTE INDIVIDUAL                                 */}
      {/* ========================================================================= */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-200 pb-2">
              <h3 className="font-extrabold text-base text-stone-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-600" />
                <span>{isCreating ? 'Registrar Nuevo Cliente / Receptor DGT' : 'Editar Cliente / Receptor DGT'}</span>
              </h3>
              <button onClick={() => setEditingCustomer(null)} className="text-stone-400 hover:text-stone-600 cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <FiscalReceiverForm
                receiver={editingCustomer}
                onChangeReceiver={(updated) => setEditingCustomer(prev => prev ? ({ ...prev, ...updated }) : null)}
                documentType="01"
                showCustomerSelector={false}
              />

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 text-xs font-extrabold bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Guardar Cliente</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
