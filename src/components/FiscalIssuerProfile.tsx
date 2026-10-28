import React, { useState, useEffect, useRef } from 'react';
import { 
  Building2, 
  ShieldCheck, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Upload, 
  Trash2, 
  Image as ImageIcon, 
  Save, 
  RefreshCw, 
  FileText, 
  FileCode, 
  Send, 
  Eye, 
  History, 
  Info, 
  Check, 
  Lock, 
  Unlock, 
  Search, 
  HelpCircle, 
  Sparkles,
  ExternalLink,
  Copy,
  Download,
  MapPin,
  Phone,
  Mail,
  Receipt,
  FileCheck2
} from 'lucide-react';
import { 
  HaciendaDirectConfig, 
  IdentificationType, 
  ConsecutiveControl,
  ElectronicDocument
} from '../types/pos';
import { PosApiService } from '../services/api';
import { 
  COSTA_RICA_PROVINCES, 
  COSTA_RICA_CANTONS, 
  COSTA_RICA_DISTRICTS, 
  getDistrictsForCanton 
} from '../data/costaRicaGeography';
import { 
  HACIENDA_ECONOMIC_ACTIVITIES, 
  ECONOMIC_ACTIVITY_CATEGORIES, 
  EconomicActivity 
} from '../data/haciendaEconomicActivities';

interface AuditRow {
  field: string;
  officialRequirement: string;
  rule: string;
  currentValue: string;
  status: 'PASS' | 'FAIL' | 'NO_APLICA' | 'NO_VERIFICABLE';
  legalReference: string;
  mandatory?: string;
  conditional?: string;
  result?: string;
  xml?: string;
  xmlTag?: string;
  validation?: string;
  length?: string;
  message?: string;
}

export const FiscalIssuerProfile: React.FC<{
  onConfigSaved?: () => void;
}> = ({ onConfigSaved }) => {
  const [config, setConfig] = useState<HaciendaDirectConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Active view sub-section
  const [activeSection, setActiveSection] = useState<'IDENTITY' | 'LOCATION' | 'AUDIT_TABLE' | 'TEST_INVOICE' | 'TRAIL'>('IDENTITY');

  // Security / Role Lock
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(true);

  // Live Audit Results
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditValid, setAuditValid] = useState<boolean>(true);
  const [auditErrors, setAuditErrors] = useState<string[]>([]);
  const [auditWarnings, setAuditWarnings] = useState<string[]>([]);
  const [auditFilter, setAuditFilter] = useState<'ALL' | 'FAIL' | 'PASS' | 'NO_APLICA'>('ALL');

  // Economic Activity Modal & Search
  const [isActivitySearchOpen, setIsActivitySearchOpen] = useState<boolean>(false);
  const [activitySearchQuery, setActivitySearchQuery] = useState<string>('');
  const [selectedActivityCategory, setSelectedActivityCategory] = useState<string>('Todos');

  // Test Invoice State
  const [isGeneratingTest, setIsGeneratingTest] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    sampleDoc?: ElectronicDocument;
    xml?: string;
    audit?: any;
  } | null>(null);
  const [testViewMode, setTestViewMode] = useState<'PREVIEW' | 'XML' | 'AUDIT'>('PREVIEW');
  const [copiedXml, setCopiedXml] = useState<boolean>(false);

  // Logo file input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load config & initial audit
  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await PosApiService.getHaciendaDirectConfig();
      if (res && res.config) {
        setConfig(res.config);
        runLiveAudit(res.config);
      }
    } catch (e) {
      console.warn('Error loading issuer profile:', e);
    } finally {
      setLoading(false);
    }
  };

  const runLiveAudit = async (candidateConfig: Partial<HaciendaDirectConfig>) => {
    try {
      const payload = {
        name: candidateConfig.emisorName,
        commercialName: candidateConfig.emisorCommercialName,
        identificationType: candidateConfig.emisorIdentificationType,
        identificationNumber: candidateConfig.emisorTaxId,
        economicActivity: candidateConfig.emisorEconomicActivity,
        province: candidateConfig.emisorProvince,
        canton: candidateConfig.emisorCanton,
        district: candidateConfig.emisorDistrict,
        neighborhood: candidateConfig.emisorNeighborhood,
        address: candidateConfig.emisorAddressDetail,
        phone: candidateConfig.emisorPhone,
        phoneCountryCode: candidateConfig.emisorPhoneCountryCode || '506',
        email: candidateConfig.emisorEmail,
        branch: candidateConfig.branch || '001',
        terminal: candidateConfig.terminal || '00001',
        softwareProviderName: candidateConfig.softwareProviderName,
        softwareProviderTaxId: candidateConfig.softwareProviderTaxId,
        alcoholicBeverageRegistry: candidateConfig.alcoholicBeverageRegistry,
        hasAlcoholicBeverageRegistry: candidateConfig.hasAlcoholicBeverageRegistry
      };

      const auditRes = await PosApiService.validateIssuer(payload);
      if (auditRes && auditRes.audit) {
        setAuditRows(auditRes.audit.tableRows || []);
        setAuditValid(auditRes.audit.isValid);
        setAuditErrors(auditRes.audit.errors || []);
        setAuditWarnings(auditRes.audit.warnings || []);
      }
    } catch (e) {
      console.warn('Error running live audit:', e);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleFieldChange = (field: keyof HaciendaDirectConfig, value: any) => {
    if (!config) return;
    const updated = { ...config, [field]: value };

    // Reset dependent canton/district if province changes
    if (field === 'emisorProvince') {
      const cantonsInNewProv = COSTA_RICA_CANTONS.filter(c => c.provinceId === (value as string));
      const firstCanton = cantonsInNewProv[0]?.code || '01';
      updated.emisorCanton = firstCanton;
      const districtsInNewCanton = getDistrictsForCanton(value as string, firstCanton);
      updated.emisorDistrict = districtsInNewCanton[0]?.code || '01';
    } else if (field === 'emisorCanton') {
      const districtsInNewCanton = getDistrictsForCanton(updated.emisorProvince || '3', value as string);
      updated.emisorDistrict = districtsInNewCanton[0]?.code || '01';
    }

    setConfig(updated);
    runLiveAudit(updated);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('El logotipo no debe superar los 2MB para asegurar una carga rápida y ligera.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const base64 = uploadEvent.target?.result as string;
      handleFieldChange('emisorLogoBase64', base64);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    if (confirm('¿Desea remover el logotipo del contribuyente?')) {
      handleFieldChange('emisorLogoBase64', '');
    }
  };

  const handleSaveProfile = async () => {
    if (!config) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const res = await PosApiService.saveHaciendaDirectConfig(config);
      if (res && res.success) {
        setConfig(res.config);
        setSaveSuccess(true);
        runLiveAudit(res.config);
        if (onConfigSaved) onConfigSaved();
        setTimeout(() => setSaveSuccess(false), 4000);
      } else {
        setSaveError('No se pudo guardar la configuración.');
      }
    } catch (e: any) {
      setSaveError(e.message || 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleRunTestFactura01 = async () => {
    if (!config) return;
    setIsGeneratingTest(true);
    setTestResult(null);

    try {
      const res = await PosApiService.generateTestFactura01({
        issuerOverride: {
          name: config.emisorName,
          commercialName: config.emisorCommercialName,
          identificationType: config.emisorIdentificationType,
          identificationNumber: config.emisorTaxId,
          economicActivity: config.emisorEconomicActivity,
          province: config.emisorProvince,
          canton: config.emisorCanton,
          district: config.emisorDistrict,
          neighborhood: config.emisorNeighborhood,
          address: config.emisorAddressDetail,
          phone: config.emisorPhone,
          phoneCountryCode: config.emisorPhoneCountryCode || '506',
          email: config.emisorEmail,
          branch: config.branch || '001',
          terminal: config.terminal || '00001'
        }
      });

      setTestResult(res);
      setActiveSection('TEST_INVOICE');
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.message || 'Error al ejecutar prueba de emisión'
      });
    } finally {
      setIsGeneratingTest(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedXml(true);
    setTimeout(() => setCopiedXml(false), 2500);
  };

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-slate-200">
        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mr-3" />
        <span className="text-slate-600 font-medium">Cargando perfil tributario del contribuyente (DGT v4.4)...</span>
      </div>
    );
  }

  const cantonsList = COSTA_RICA_CANTONS.filter(c => c.provinceId === (config.emisorProvince || '3'));
  const districtsList = getDistrictsForCanton(config.emisorProvince || '3', config.emisorCanton || '06');

  // Filtered Economic Activities
  const filteredActivities = HACIENDA_ECONOMIC_ACTIVITIES.filter(act => {
    const matchesCategory = selectedActivityCategory === 'Todos' || act.category === selectedActivityCategory;
    const q = activitySearchQuery.toLowerCase().trim();
    const matchesQuery = !q || 
      act.code.includes(q) || 
      act.description.toLowerCase().includes(q) || 
      (act.keywords && act.keywords.some(k => k.toLowerCase().includes(q)));
    return matchesCategory && matchesQuery;
  });

  const selectedActivityObj = HACIENDA_ECONOMIC_ACTIVITIES.find(a => a.code === config.emisorEconomicActivity);

  const filteredAuditRows = auditRows.filter(row => {
    if (auditFilter === 'ALL') return true;
    const s = row.status || (row as any).result;
    return s === auditFilter;
  });

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Status Bar */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-600">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-xl font-bold text-slate-800">
                  Datos del Contribuyente y Logotipo Oficial
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Estándar DGT v4.4
                </span>
                {auditValid ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> APTO PARA FACTURACIÓN ELECTRÓNICA
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white shadow-sm">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1" /> {auditErrors.length} REQUISITOS PENDIENTES
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Configuración integral del obligado tributario emisor para <strong className="text-slate-700">Factura Electrónica (Tipo 01)</strong>, <strong className="text-slate-700">Tiquete (04)</strong> y <strong className="text-slate-700">Notas de Crédito (03)</strong>.
              </p>
            </div>
          </div>

          {/* Action buttons & Security Mode */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsAdminUnlocked(!isAdminUnlocked)}
              className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold border transition ${
                isAdminUnlocked 
                  ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100' 
                  : 'bg-amber-50 border-amber-300 text-amber-800'
              }`}
              title="Alternar modo de protección de configuración fiscal"
            >
              {isAdminUnlocked ? <Unlock className="w-4 h-4 mr-1.5 text-emerald-600" /> : <Lock className="w-4 h-4 mr-1.5 text-amber-600" />}
              {isAdminUnlocked ? 'Modo Administrador Fiscal' : 'Modo Cajero (Bloqueado)'}
            </button>

            <button
              onClick={handleRunTestFactura01}
              disabled={isGeneratingTest}
              className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm transition"
            >
              <FileCheck2 className="w-4 h-4 mr-1.5" />
              {isGeneratingTest ? 'Generando...' : 'Probar Factura 01'}
            </button>

            <button
              onClick={handleSaveProfile}
              disabled={saving || !isAdminUnlocked}
              className="flex items-center px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm transition"
            >
              <Save className="w-4 h-4 mr-1.5" />
              {saving ? 'Guardando...' : 'Guardar y Validar'}
            </button>
          </div>
        </div>

        {/* Feedback alerts */}
        {saveSuccess && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center text-emerald-800 text-sm animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mr-2 flex-shrink-0" />
            <span><strong>¡Perfil guardado y auditado exitosamente!</strong> Los datos del emisor han sido registrados y actualizados en la base de datos y la bitácora fiscal.</span>
          </div>
        )}

        {saveError && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center text-rose-800 text-sm">
            <XCircle className="w-5 h-5 text-rose-600 mr-2 flex-shrink-0" />
            <span><strong>Error:</strong> {saveError}</span>
          </div>
        )}
      </div>

      {/* 2. Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-xl p-1 shadow-sm">
        <button
          onClick={() => setActiveSection('IDENTITY')}
          className={`flex items-center px-4 py-2.5 rounded-lg text-xs font-bold transition ${
            activeSection === 'IDENTITY'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Building2 className="w-4 h-4 mr-2" />
          1. Identidad Legal & Logotipo
        </button>

        <button
          onClick={() => setActiveSection('LOCATION')}
          className={`flex items-center px-4 py-2.5 rounded-lg text-xs font-bold transition ${
            activeSection === 'LOCATION'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <MapPin className="w-4 h-4 mr-2" />
          2. Ubicación & Contacto DGT
        </button>

        <button
          onClick={() => setActiveSection('AUDIT_TABLE')}
          className={`flex items-center px-4 py-2.5 rounded-lg text-xs font-bold transition ${
            activeSection === 'AUDIT_TABLE'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <ShieldCheck className="w-4 h-4 mr-2" />
          3. Auditoría Tributaria en Vivo (31 Reglas XSD)
          {auditErrors.length > 0 && (
            <span className="ml-2 px-1.5 py-0.2 rounded-full text-[10px] bg-rose-600 text-white">
              {auditErrors.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSection('TEST_INVOICE')}
          className={`flex items-center px-4 py-2.5 rounded-lg text-xs font-bold transition ${
            activeSection === 'TEST_INVOICE'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Receipt className="w-4 h-4 mr-2" />
          4. Factura 01 de Prueba & XML v4.4
        </button>

        <button
          onClick={() => setActiveSection('TRAIL')}
          className={`flex items-center px-4 py-2.5 rounded-lg text-xs font-bold transition ${
            activeSection === 'TRAIL'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <History className="w-4 h-4 mr-2" />
          5. Bitácora de Trazabilidad
        </button>
      </div>

      {/* 3. SECTION 1: IDENTITY & LOGO */}
      {activeSection === 'IDENTITY' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Logo Card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center">
                  <ImageIcon className="w-4 h-4 text-amber-500 mr-2" /> Logotipo de la Empresa
                </h3>
                <span className="text-[11px] text-slate-500">PDF / Térmico</span>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                El logotipo se incluirá en la representación gráfica oficial (PDF de Factura Electrónica 01) y en los tiquetes térmicos impresos.
              </p>

              {/* Logo Preview Box */}
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 bg-slate-50 flex flex-col items-center justify-center min-h-[190px] relative group overflow-hidden">
                {config.emisorLogoBase64 ? (
                  <div className="w-full flex flex-col items-center">
                    <img 
                      src={config.emisorLogoBase64} 
                      alt="Logotipo Emisor" 
                      className="max-h-36 max-w-full object-contain drop-shadow-sm rounded-lg"
                    />
                    <div className="mt-3 flex items-center space-x-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!isAdminUnlocked}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-sm"
                      >
                        Cambiar
                      </button>
                      <button
                        onClick={handleRemoveLogo}
                        disabled={!isAdminUnlocked}
                        className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 text-xs font-semibold rounded-lg"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mx-auto mb-2">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">Subir Logotipo Oficial</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Formatos PNG, JPG o SVG (máx. 2MB)</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!isAdminUnlocked}
                      className="mt-3 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg shadow-sm transition"
                    >
                      Seleccionar Archivo
                    </button>
                  </div>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleLogoUpload} 
                  accept="image/png,image/jpeg,image/svg+xml" 
                  className="hidden" 
                />
              </div>

              <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600 space-y-1">
                <div className="flex items-center text-slate-700 font-semibold">
                  <Info className="w-3.5 h-3.5 text-blue-500 mr-1.5" /> Recomendaciones Gráficas:
                </div>
                <p>• Fondo transparente (PNG) preferible para adaptarse a fondos blancos.</p>
                <p>• Proporción horizontal o cuadrada recomendada (ej: 400x150 px).</p>
              </div>
            </div>

            {/* Contingency / Branch ID Info */}
            <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500 flex justify-between items-center">
              <span>Sucursal: <strong className="text-slate-800">{config.branch || '001'}</strong></span>
              <span>Terminal POS: <strong className="text-slate-800">{config.terminal || '00001'}</strong></span>
            </div>
          </div>

          {/* Legal Information (Razón Social, Cédula, Nombre Comercial) */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center border-b border-slate-100 pb-3">
              <Building2 className="w-4 h-4 text-amber-500 mr-2" /> Datos Legales del Obligado Tributario (Emisor)
            </h3>

            {/* Razón Social vs Nombre Comercial */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Razón Social / Nombre Legal <span className="text-rose-500">* (Obligatorio)</span>
                  </label>
                  <span className="text-[10px] text-slate-400">{(config.emisorName || '').length}/100</span>
                </div>
                <input
                  type="text"
                  maxLength={100}
                  value={config.emisorName || ''}
                  onChange={(e) => handleFieldChange('emisorName', e.target.value)}
                  disabled={!isAdminUnlocked}
                  placeholder="Ej: Pollo Frito Sabor Cervanteño S.A."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:bg-slate-50 font-medium"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Nombre formal registrado en el Registro Nacional y Ministerio de Hacienda.
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Nombre Comercial / Nombre de Fantasía <span className="text-slate-400">(Opcional)</span>
                  </label>
                  <span className="text-[10px] text-slate-400">{(config.emisorCommercialName || '').length}/80</span>
                </div>
                <input
                  type="text"
                  maxLength={80}
                  value={config.emisorCommercialName || ''}
                  onChange={(e) => handleFieldChange('emisorCommercialName', e.target.value)}
                  disabled={!isAdminUnlocked}
                  placeholder="Ej: Pollo Frito Sabor Cervanteño"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:bg-slate-50"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Nombre con el que el público reconoce el restaurante o punto de venta.
                </p>
              </div>
            </div>

            {/* Tipo de Cédula y Número de Cédula */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tipo de Identificación Tributaria <span className="text-rose-500">*</span>
                </label>
                <select
                  value={config.emisorIdentificationType || '02'}
                  onChange={(e) => handleFieldChange('emisorIdentificationType', e.target.value as IdentificationType)}
                  disabled={!isAdminUnlocked}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:bg-slate-50 bg-white"
                >
                  <option value="01">01 - Cédula Física (9 dígitos)</option>
                  <option value="02">02 - Cédula Jurídica (10 dígitos - S.A., S.R.L.)</option>
                  <option value="03">03 - DIMEX (11 o 12 dígitos - Extranjero residente)</option>
                  <option value="04">04 - NITE (10 dígitos - Tributario especial)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Número de Cédula / Identificación <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={config.emisorTaxId || ''}
                  onChange={(e) => handleFieldChange('emisorTaxId', e.target.value.replace(/\D/g, ''))}
                  disabled={!isAdminUnlocked}
                  placeholder="Sin guiones ni espacios (ej: 3101987654)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:bg-slate-50 font-mono tracking-wider"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {config.emisorIdentificationType === '02' ? '10 dígitos para personas jurídicas.' : '9 dígitos para personas físicas.'}
                </p>
              </div>
            </div>

            {/* Actividad Económica */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Actividad Económica Principal (CIIU4 - 6 Dígitos) <span className="text-rose-500">*</span>
              </label>
              <div className="flex gap-2">
                <div className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      type="text"
                      maxLength={15}
                      value={config.emisorEconomicActivity || ''}
                      onChange={(e) => handleFieldChange('emisorEconomicActivity', e.target.value.replace(/[^\d.]/g, ''))}
                      disabled={!isAdminUnlocked}
                      placeholder="5610.0"
                      className="inline-block px-2 py-0.5 bg-white border border-amber-200 text-amber-800 font-mono font-bold text-xs rounded mr-2 w-24 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="text-xs font-medium text-slate-700">
                      {selectedActivityObj?.description || 'Actividad ingresada manualmente'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">
                    {selectedActivityObj?.category || 'Manual'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsActivitySearchOpen(true)}
                  disabled={!isAdminUnlocked}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center whitespace-nowrap"
                >
                  <Search className="w-3.5 h-3.5 mr-1.5" /> Cambiar Catálogo
                </button>
              </div>
            </div>

            {/* Software Provider & Special Regimes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Proveedor de Software Facturador <span className="text-slate-400">(Normativo DGT)</span>
                </label>
                <input
                  type="text"
                  value={config.softwareProviderName || 'Sabor Cervanteño POS Core Engine'}
                  onChange={(e) => handleFieldChange('softwareProviderName', e.target.value)}
                  disabled={!isAdminUnlocked}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cédula Proveedor de Software
                </label>
                <input
                  type="text"
                  value={config.softwareProviderTaxId || '3101987654'}
                  onChange={(e) => handleFieldChange('softwareProviderTaxId', e.target.value)}
                  disabled={!isAdminUnlocked}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 text-slate-600 font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. SECTION 2: LOCATION & CONTACT */}
      {activeSection === 'LOCATION' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center">
              <MapPin className="w-4 h-4 text-amber-500 mr-2" /> Domicilio Fiscal Oficial del Emisor
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Estructura jerárquica obligatoria según la codificación territorial de la Dirección General de Tributación (Provincia, Cantón, Distrito, Barrio y Otras Señas).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Provincia */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Provincia <span className="text-rose-500">*</span>
              </label>
              <select
                value={config.emisorProvince || '3'}
                onChange={(e) => handleFieldChange('emisorProvince', e.target.value)}
                disabled={!isAdminUnlocked}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                {COSTA_RICA_PROVINCES.map(p => (
                  <option key={p.id} value={p.id}>{p.id} - {p.name}</option>
                ))}
              </select>
            </div>

            {/* Cantón */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Cantón <span className="text-rose-500">*</span>
              </label>
              <select
                value={config.emisorCanton || '06'}
                onChange={(e) => handleFieldChange('emisorCanton', e.target.value)}
                disabled={!isAdminUnlocked}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                {cantonsList.map(c => (
                  <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                ))}
              </select>
            </div>

            {/* Distrito */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Distrito <span className="text-rose-500">*</span>
              </label>
              <select
                value={config.emisorDistrict || '02'}
                onChange={(e) => handleFieldChange('emisorDistrict', e.target.value)}
                disabled={!isAdminUnlocked}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                {districtsList.map(d => (
                  <option key={d.code} value={d.code}>{d.code} - {d.name}</option>
                ))}
              </select>
            </div>

            {/* Barrio */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Barrio <span className="text-slate-400">(Opcional - 2 dígitos)</span>
              </label>
              <input
                type="text"
                maxLength={2}
                value={config.emisorNeighborhood || '01'}
                onChange={(e) => handleFieldChange('emisorNeighborhood', e.target.value.replace(/\D/g, ''))}
                disabled={!isAdminUnlocked}
                placeholder="01"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-center focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Otras Señas */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-slate-700">
                Otras Señas / Dirección Exacta <span className="text-rose-500">* (Obligatorio)</span>
              </label>
              <span className="text-[10px] text-slate-400">{(config.emisorAddressDetail || '').length}/250</span>
            </div>
            <textarea
              rows={2}
              maxLength={250}
              value={config.emisorAddressDetail || ''}
              onChange={(e) => handleFieldChange('emisorAddressDetail', e.target.value)}
              disabled={!isAdminUnlocked}
              placeholder="Ej: Costado Norte del Parque Central, frente a la Iglesia Católica, Cervantes de Alvarado, Cartago"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Detalle descriptivo de la ubicación física del establecimiento para inspección tributaria.
            </p>
          </div>

          {/* Contacto Fiscal */}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center mb-4">
              <Phone className="w-4 h-4 text-amber-500 mr-2" /> Canales de Contacto Fiscal
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Código de País <span className="text-slate-400">(XSD DGT)</span>
                </label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 bg-slate-100 border border-r-0 border-slate-300 rounded-l-lg text-xs font-semibold text-slate-600">
                    +
                  </span>
                  <input
                    type="text"
                    maxLength={3}
                    value={config.emisorPhoneCountryCode || '506'}
                    onChange={(e) => handleFieldChange('emisorPhoneCountryCode', e.target.value.replace(/\D/g, ''))}
                    disabled={!isAdminUnlocked}
                    className="w-full px-3 py-2 border border-slate-300 rounded-r-lg text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Teléfono Comercial <span className="text-slate-400">(Mínimo 8 dígitos)</span>
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={config.emisorPhone || ''}
                  onChange={(e) => handleFieldChange('emisorPhone', e.target.value.replace(/\D/g, ''))}
                  disabled={!isAdminUnlocked}
                  placeholder="25340000"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Correo Electrónico Fiscal <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">{(config.emisorEmail || '').length}/160</span>
                </div>
                <input
                  type="email"
                  maxLength={160}
                  value={config.emisorEmail || ''}
                  onChange={(e) => handleFieldChange('emisorEmail', e.target.value)}
                  disabled={!isAdminUnlocked}
                  placeholder="facturacion@saborcervanteno.cr"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. SECTION 3: LIVE AUDIT REPORT TABLE */}
      {activeSection === 'AUDIT_TABLE' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center">
                <ShieldCheck className="w-4 h-4 text-emerald-600 mr-2" /> Matriz de Cumplimiento Tributario Emisor (DGT v4.4)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Verificación automatizada contra el esquema XSD de Factura Electrónica y directrices del Ministerio de Hacienda.
              </p>
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setAuditFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  auditFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todos ({auditRows.length})
              </button>
              <button
                onClick={() => setAuditFilter('FAIL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  auditFilter === 'FAIL' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
              >
                Fallos ({auditRows.filter(r => (r.status || (r as any).result) === 'FAIL').length})
              </button>
              <button
                onClick={() => setAuditFilter('PASS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  auditFilter === 'PASS' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Conformes ({auditRows.filter(r => (r.status || (r as any).result) === 'PASS').length})
              </button>
            </div>
          </div>

          {/* Audit Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-3 px-3">Elemento & Etiqueta XML</th>
                  <th className="py-3 px-3">Obligatoriedad</th>
                  <th className="py-3 px-3">Regla XSD / Longitud</th>
                  <th className="py-3 px-3">Valor Configurado</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  <th className="py-3 px-3">Diagnóstico / Mensaje</th>
                  <th className="py-3 px-3">Referencia Legal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAuditRows.map((row, idx) => {
                  const req = row.officialRequirement || (row.mandatory === 'SÍ' ? 'Obligatorio' : row.conditional === 'SÍ' ? 'Condicional' : 'Opcional');
                  const status = row.status || row.result || 'PASS';
                  const xmlTag = row.xml || row.xmlTag || '';
                  const val = row.currentValue || (row as any).currentVal || '';

                  return (
                    <tr key={idx} className={status === 'FAIL' ? 'bg-rose-50/50' : 'hover:bg-slate-50'}>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-800">{row.field}</div>
                        {xmlTag && (
                          <div className="font-mono text-[10px] text-amber-700 font-semibold mt-0.5">
                            {xmlTag}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          req.includes('Obligatorio')
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : req.includes('Condicional')
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {req}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        <div>{row.rule || row.validation}</div>
                        {row.length && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Largo: {row.length}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-800 max-w-xs" title={val}>
                        {val ? (
                          <span className="bg-slate-50 px-2 py-1 rounded border border-slate-200 block truncate">
                            {val}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">No configurado</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {status === 'PASS' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                            <Check className="w-3 h-3 mr-1" /> PASS
                          </span>
                        )}
                        {status === 'FAIL' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white shadow-xs">
                            <XCircle className="w-3 h-3 mr-1" /> FAIL
                          </span>
                        )}
                        {status === 'NO_APLICA' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                            N/A
                          </span>
                        )}
                        {status === 'NO_VERIFICABLE' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            NO VERIF.
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        <span className={status === 'FAIL' ? 'text-rose-700 font-semibold' : 'text-slate-600'}>
                          {row.message || 'Conforme con estándar DGT.'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[10px] text-slate-500 font-medium">
                        {row.legalReference || 'Anexo 1 XSD v4.4 DGT'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. SECTION 4: TEST INVOICE 01 GENERATOR */}
      {activeSection === 'TEST_INVOICE' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center">
                <Receipt className="w-4 h-4 text-indigo-600 mr-2" /> Factura Electrónica (Tipo 01) - Verificación en Sandbox
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Genera un comprobante de prueba completo con 1 Pieza de Pollo Crujiente (₡1.450 con 13% IVA, CABYS 6332000000000) y valida el XML emitido.
              </p>
            </div>

            <button
              onClick={handleRunTestFactura01}
              disabled={isGeneratingTest}
              className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isGeneratingTest ? 'animate-spin' : ''}`} />
              {isGeneratingTest ? 'Generando Comprobante...' : 'Regenerar Factura de Prueba'}
            </button>
          </div>

          {testResult ? (
            <div className="space-y-4">
              {/* Test Status Banner */}
              <div className={`p-4 rounded-xl border ${
                testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                <div className="flex items-start">
                  {testResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 mr-2 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-600 mr-2 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h4 className="text-xs font-bold">{testResult.message}</h4>
                    {testResult.sampleDoc && (
                      <p className="text-[11px] mt-1 font-mono">
                        Clave: {testResult.sampleDoc.numericKey} | Consecutivo: {testResult.sampleDoc.consecutive}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* View Mode Switcher */}
              <div className="flex space-x-2 border-b border-slate-200 pb-2">
                <button
                  onClick={() => setTestViewMode('PREVIEW')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    testViewMode === 'PREVIEW' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 inline mr-1" /> Representación Gráfica (PDF Preview)
                </button>
                <button
                  onClick={() => setTestViewMode('XML')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    testViewMode === 'XML' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 inline mr-1" /> XML Oficial v4.4
                </button>
              </div>

              {/* PDF / Graphical Preview */}
              {testViewMode === 'PREVIEW' && testResult.sampleDoc && (
                <div className="border border-slate-300 rounded-xl p-6 bg-slate-50 max-w-2xl mx-auto shadow-inner text-slate-800">
                  {/* Top Header with Logo */}
                  <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                    <div className="flex items-center space-x-3">
                      {config.emisorLogoBase64 ? (
                        <img 
                          src={config.emisorLogoBase64} 
                          alt="Logo Emisor" 
                          className="h-14 max-w-[130px] object-contain rounded"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-stone-900 text-amber-400 font-bold rounded-lg flex items-center justify-center shadow-xs">
                          <Building2 className="w-7 h-7 text-amber-400" />
                        </div>
                      )}
                      <div>
                        <h4 className="font-bold text-sm text-slate-900">{testResult.sampleDoc.issuer.name}</h4>
                        {testResult.sampleDoc.issuer.commercialName && (
                          <p className="text-xs text-amber-700 font-semibold">{testResult.sampleDoc.issuer.commercialName}</p>
                        )}
                        <p className="text-[11px] text-slate-600">Cédula: {testResult.sampleDoc.issuer.identificationNumber}</p>
                        <p className="text-[10px] text-slate-500">{testResult.sampleDoc.issuer.address}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="inline-block px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-bold rounded">
                        FACTURA ELECTRÓNICA
                      </span>
                      <p className="text-xs font-mono font-bold mt-1">No. {testResult.sampleDoc.consecutive}</p>
                      <p className="text-[10px] text-slate-500">{new Date(testResult.sampleDoc.issueDate).toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Customer Info */}
                  <div className="py-3 border-b border-slate-200 text-xs">
                    <p className="font-bold text-slate-700">Cliente / Receptor:</p>
                    <p className="text-slate-800">{testResult.sampleDoc.receiver?.name} (Céd: {testResult.sampleDoc.receiver?.identificationNumber})</p>
                    <p className="text-slate-500 text-[11px]">{testResult.sampleDoc.receiver?.address} | {testResult.sampleDoc.receiver?.email}</p>
                  </div>

                  {/* Line items */}
                  <div className="py-3 border-b border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 font-bold border-b border-slate-200">
                          <th className="text-left pb-1">Cant.</th>
                          <th className="text-left pb-1">Detalle / CABYS</th>
                          <th className="text-right pb-1">Precio</th>
                          <th className="text-right pb-1">IVA (13%)</th>
                          <th className="text-right pb-1">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {testResult.sampleDoc.lines.map((line, idx) => (
                          <tr key={idx} className="border-b border-slate-100">
                            <td className="py-1.5">{line.quantity}</td>
                            <td className="py-1.5">
                              <p className="font-medium text-slate-800">{line.detail}</p>
                              <p className="text-[10px] text-slate-400 font-mono">CABYS: {line.cabysCode}</p>
                            </td>
                            <td className="py-1.5 text-right font-mono">₡{line.unitPrice.toFixed(2)}</td>
                            <td className="py-1.5 text-right font-mono">₡{line.taxAmount.toFixed(2)}</td>
                            <td className="py-1.5 text-right font-mono font-bold">₡{line.totalLine.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div className="py-3 flex justify-between items-center text-xs">
                    <div className="text-[11px] text-slate-500">
                      <p>Condición: Contado | Moneda: CRC (Colones)</p>
                      <p className="font-mono text-[10px] mt-1 truncate max-w-sm">Clave: {testResult.sampleDoc.numericKey}</p>
                    </div>
                    <div className="text-right font-mono">
                      <p className="text-slate-600">Subtotal: ₡{testResult.sampleDoc.subtotal.toFixed(2)}</p>
                      <p className="text-slate-600">IVA 13%: ₡{testResult.sampleDoc.taxTotal.toFixed(2)}</p>
                      <p className="text-sm font-bold text-slate-900 mt-1">TOTAL: ₡{testResult.sampleDoc.total.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-400">
                    Emitida conforme lo establecido en la resolución de Comprobantes Electrónicos DGT v4.4 del Ministerio de Hacienda de Costa Rica.
                  </div>
                </div>
              )}

              {/* XML Output */}
              {testViewMode === 'XML' && testResult.xml && (
                <div className="relative">
                  <div className="absolute top-3 right-3 flex space-x-2">
                    <button
                      onClick={() => copyToClipboard(testResult.xml || '')}
                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-semibold flex items-center shadow"
                    >
                      {copiedXml ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                      {copiedXml ? 'Copiado' : 'Copiar XML'}
                    </button>
                  </div>
                  <pre className="p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto max-h-96">
                    {testResult.xml}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
              <FileCheck2 className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-700">Ninguna prueba generada aún en esta sesión</p>
              <p className="text-[11px] text-slate-400 mt-1">Haga clic en el botón superior para emitir una Factura Electrónica 01 de prueba con validación instantánea.</p>
            </div>
          )}
        </div>
      )}

      {/* 7. SECTION 5: AUDIT TRAIL */}
      {activeSection === 'TRAIL' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center">
              <History className="w-4 h-4 text-amber-500 mr-2" /> Bitácora de Modificaciones del Emisor (Trazabilidad)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Registro inmutable de cambios en los datos del contribuyente para cumplimiento de la normativa de auditoría tributaria.
            </p>
          </div>

          {config.issuerAuditTrail && config.issuerAuditTrail.length > 0 ? (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3">Fecha y Hora</th>
                    <th className="py-2.5 px-3">Usuario</th>
                    <th className="py-2.5 px-3">Campo Modificado</th>
                    <th className="py-2.5 px-3">Valor Anterior</th>
                    <th className="py-2.5 px-3">Nuevo Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {config.issuerAuditTrail.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-slate-500 font-mono">{new Date(entry.timestamp).toLocaleString()}</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">{entry.user}</td>
                      <td className="py-2 px-3 font-mono text-amber-800">{entry.field}</td>
                      <td className="py-2 px-3 text-slate-500 truncate max-w-xs font-mono">{String(entry.previousValue || 'N/A')}</td>
                      <td className="py-2 px-3 text-slate-800 font-semibold truncate max-w-xs font-mono">{String(entry.newValue || 'N/A')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              No hay modificaciones registradas en la bitácora del emisor.
            </div>
          )}
        </div>
      )}

      {/* 8. MODAL: Catálogo Oficial de Actividades Económicas */}
      {isActivitySearchOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center">
                  <Building2 className="w-5 h-5 text-amber-500 mr-2" /> Catálogo de Actividades Económicas (DGT / CIIU4)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Seleccione la actividad económica principal de 6 dígitos que figura en su registro de Hacienda (ATV).
                </p>
              </div>
              <button
                onClick={() => setIsActivitySearchOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Modal Filters & Search */}
            <div className="p-4 border-b border-slate-100 bg-white space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={activitySearchQuery}
                  onChange={(e) => setActivitySearchQuery(e.target.value)}
                  placeholder="Buscar por código (ej: 5610.0), palabra clave (restaurante, soda, bar)..."
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex overflow-x-auto space-x-1 pb-1">
                {ECONOMIC_ACTIVITY_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedActivityCategory(cat)}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition ${
                      selectedActivityCategory === cat
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal List */}
            <div className="flex-1 overflow-y-auto p-4 divide-y divide-slate-100">
              {filteredActivities.length > 0 ? (
                filteredActivities.map(act => (
                  <div
                    key={act.code}
                    onClick={() => {
                      handleFieldChange('emisorEconomicActivity', act.code);
                      setIsActivitySearchOpen(false);
                    }}
                    className={`p-3 rounded-xl cursor-pointer transition flex items-center justify-between ${
                      config.emisorEconomicActivity === act.code
                        ? 'bg-amber-50 border border-amber-300'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-xs bg-slate-800 text-white px-2 py-0.5 rounded">
                          {act.code}
                        </span>
                        <span className="text-xs font-bold text-slate-800">{act.description}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">{act.category}</p>
                    </div>

                    <button className="px-3 py-1 bg-amber-500 text-white rounded text-xs font-semibold shadow-sm">
                      Seleccionar
                    </button>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No se encontraron actividades económicas con el término ingresado.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
