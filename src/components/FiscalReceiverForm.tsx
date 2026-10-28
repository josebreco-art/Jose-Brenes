import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, 
  User, 
  Globe, 
  FileCheck2, 
  AlertCircle, 
  CheckCircle2, 
  Mail, 
  Phone, 
  MapPin, 
  Search, 
  Briefcase, 
  Sparkles,
  Info,
  ChevronDown
} from 'lucide-react';
import { Customer, IdentificationType, ElectronicDocumentType } from '../types/pos';
import { FiscalValidationService } from '../server/fiscalValidationService';
import { 
  COSTA_RICA_PROVINCES, 
  COSTA_RICA_CANTONS, 
  COSTA_RICA_DISTRICTS 
} from '../data/costaRicaGeography';
import { EconomicActivityPicker } from './EconomicActivityPicker';

interface FiscalReceiverFormProps {
  receiver: Partial<Customer>;
  onChangeReceiver: (updated: Partial<Customer>) => void;
  availableCustomers?: Customer[];
  onSelectExistingCustomer?: (customer: Customer) => void;
  documentType?: ElectronicDocumentType;
  showCustomerSelector?: boolean;
}

export const FiscalReceiverForm: React.FC<FiscalReceiverFormProps> = ({
  receiver,
  onChangeReceiver,
  availableCustomers = [],
  onSelectExistingCustomer,
  documentType = '01',
  showCustomerSelector = true
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }>({ isValid: true, errors: [], warnings: [] });

  // Validar en tiempo real con FiscalValidationService
  useEffect(() => {
    if (documentType === '01') {
      const res = FiscalValidationService.validateElectronicInvoiceReceiver(receiver, {
        documentType: '01',
        requireEmail: true
      });
      setValidationResult(res);
    } else {
      setValidationResult({ isValid: true, errors: [], warnings: [] });
    }
  }, [receiver, documentType]);

  // Lista de cantones según la provincia seleccionada
  const availableCantons = useMemo(() => {
    if (!receiver.province) return [];
    return COSTA_RICA_CANTONS.filter(c => c.provinceId === receiver.province);
  }, [receiver.province]);

  // Lista de distritos según provincia y cantón
  const availableDistricts = useMemo(() => {
    if (!receiver.province || !receiver.canton) return [];
    return COSTA_RICA_DISTRICTS.filter(d => 
      d.provinceId === receiver.province && d.cantonCode === receiver.canton
    );
  }, [receiver.province, receiver.canton]);

  // Filtrado de clientes existentes para búsqueda rápida
  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return availableCustomers.slice(0, 8);
    const q = searchTerm.toLowerCase().trim();
    return availableCustomers.filter(c => 
      c.name.toLowerCase().includes(q) ||
      c.identification.includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [availableCustomers, searchTerm]);

  const handleIdentificationTypeChange = (newType: IdentificationType) => {
    let cleanId = (receiver.identification || '').trim();
    if (newType !== '05') {
      cleanId = cleanId.replace(/\D/g, '');
    }
    onChangeReceiver({
      ...receiver,
      identificationType: newType,
      identification: cleanId
    });
  };

  const handleIdentificationChange = (val: string) => {
    const isForeign = receiver.identificationType === '05';
    const formatted = isForeign ? val.substring(0, 20) : val.replace(/\D/g, '').substring(0, 12);
    onChangeReceiver({
      ...receiver,
      identification: formatted
    });
  };

  const handleProvinceChange = (provId: string) => {
    onChangeReceiver({
      ...receiver,
      province: provId,
      canton: '',
      district: ''
    });
  };

  const handleCantonChange = (cantonCode: string) => {
    onChangeReceiver({
      ...receiver,
      canton: cantonCode,
      district: ''
    });
  };

  // Cálculo de dígitos requeridos según el tipo de cédula en Costa Rica
  const idRequirementInfo = useMemo(() => {
    const id = (receiver.identification || '').replace(/\D/g, '');
    switch (receiver.identificationType) {
      case '01':
        return {
          expected: '9 dígitos numéricos (Cédula Física)',
          currentLength: id.length,
          isValid: id.length === 9,
          placeholder: 'Ej: 301230456'
        };
      case '02':
        return {
          expected: '10 dígitos numéricos (Cédula Jurídica)',
          currentLength: id.length,
          isValid: id.length === 10,
          placeholder: 'Ej: 3101123456'
        };
      case '03':
        return {
          expected: '11 o 12 dígitos numéricos (DIMEX)',
          currentLength: id.length,
          isValid: id.length === 11 || id.length === 12,
          placeholder: 'Ej: 115000123456'
        };
      case '04':
        return {
          expected: '10 dígitos numéricos (NITE)',
          currentLength: id.length,
          isValid: id.length === 10,
          placeholder: 'Ej: 4000123456'
        };
      case '05':
        const raw = (receiver.identification || '').trim();
        return {
          expected: '3 a 20 caracteres (Pasaporte / Extranjero)',
          currentLength: raw.length,
          isValid: raw.length >= 3 && raw.length <= 20,
          placeholder: 'Ej: PASSPORT8899CR'
        };
      default:
        return {
          expected: '9 dígitos numéricos',
          currentLength: id.length,
          isValid: id.length === 9,
          placeholder: 'Identificación'
        };
    }
  }, [receiver.identification, receiver.identificationType]);

  return (
    <div className="space-y-4 text-stone-800">
      
      {/* Búsqueda rápida o selección de cliente existente */}
      {showCustomerSelector && availableCustomers.length > 0 && (
        <div className="relative">
          <label className="text-[11px] font-bold text-stone-600 uppercase tracking-wide flex items-center justify-between mb-1">
            <span>Buscar Cliente Registrado</span>
            <span className="text-[10px] text-amber-700 font-medium">Autocompletar datos</span>
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por nombre, cédula o teléfono..."
              value={searchTerm}
              onFocus={() => setShowSearchDropdown(true)}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowSearchDropdown(true);
              }}
              className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setShowSearchDropdown(false);
                }}
                className="absolute right-2.5 top-2 text-stone-400 hover:text-stone-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {showSearchDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 z-40 bg-white border border-stone-200 rounded-xl shadow-xl p-1.5 max-h-48 overflow-y-auto">
              <div className="text-[10px] font-bold text-stone-400 px-2 py-1 uppercase">
                {filteredCustomers.length} Clientes Encontrados
              </div>
              {filteredCustomers.map(cust => (
                <button
                  key={cust.id}
                  type="button"
                  onClick={() => {
                    if (onSelectExistingCustomer) {
                      onSelectExistingCustomer(cust);
                    } else {
                      onChangeReceiver({ ...cust });
                    }
                    setShowSearchDropdown(false);
                    setSearchTerm('');
                  }}
                  className="w-full text-left p-2 hover:bg-amber-50 rounded-lg flex items-center justify-between text-xs transition-colors"
                >
                  <div>
                    <div className="font-bold text-stone-900">{cust.name}</div>
                    <div className="text-[10px] text-stone-500 flex items-center gap-2">
                      <span className="font-mono font-bold text-stone-700">{cust.identification}</span>
                      <span>• {cust.email || 'Sin correo'}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-700">
                    {cust.identificationType === '02' ? 'Jurídica' : 'Física'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tipo de Cédula y Número */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
        
        {/* Selector de Tipo de Identificación */}
        <div className="sm:col-span-5">
          <label className="text-[11px] font-bold text-stone-700 uppercase tracking-wide block mb-1">
            Tipo de Cédula <span className="text-rose-600">*</span>
          </label>
          <select
            id="receiver-id-type-select"
            value={receiver.identificationType || '01'}
            onChange={(e) => handleIdentificationTypeChange(e.target.value as IdentificationType)}
            className="w-full px-2.5 py-2 text-xs font-semibold bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
          >
            <option value="01">01 - Cédula Física (9 dígitos)</option>
            <option value="02">02 - Cédula Jurídica (10 dígitos)</option>
            <option value="03">03 - DIMEX (11-12 dígitos)</option>
            <option value="04">04 - NITE (10 dígitos)</option>
            <option value="05">05 - Extranjero / Pasaporte</option>
          </select>
        </div>

        {/* Número de Identificación */}
        <div className="sm:col-span-7">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-bold text-stone-700 uppercase tracking-wide">
              Número de Cédula / ID <span className="text-rose-600">*</span>
            </label>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
              idRequirementInfo.isValid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
            }`}>
              {idRequirementInfo.currentLength} dígitos {idRequirementInfo.isValid ? '✓' : ''}
            </span>
          </div>
          <input
            id="receiver-identification-input"
            type="text"
            placeholder={idRequirementInfo.placeholder}
            value={receiver.identification || ''}
            onChange={(e) => handleIdentificationChange(e.target.value)}
            className={`w-full px-3 py-2 text-xs font-mono font-bold bg-white border rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none ${
              idRequirementInfo.isValid ? 'border-emerald-400 bg-emerald-50/20' : 'border-stone-300'
            }`}
          />
          <div className="text-[10px] text-stone-500 mt-0.5">
            {idRequirementInfo.expected}
          </div>
        </div>
      </div>

      {/* Nombre Completo / Razón Social */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
        <div className="sm:col-span-7">
          <label className="text-[11px] font-bold text-stone-700 uppercase tracking-wide block mb-1">
            {receiver.identificationType === '02' ? 'Razón Social' : 'Nombre Completo'} <span className="text-rose-600">*</span>
          </label>
          <input
            id="receiver-name-input"
            type="text"
            placeholder={receiver.identificationType === '02' ? 'Ej: Distribuidora del Este S.A.' : 'Ej: Juan Pérez Mora'}
            value={receiver.name || ''}
            onChange={(e) => onChangeReceiver({ ...receiver, name: e.target.value })}
            className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-5">
          <label className="text-[11px] font-bold text-stone-700 uppercase tracking-wide block mb-1">
            Nombre Comercial <span className="text-stone-400 text-[10px]">(Opcional)</span>
          </label>
          <input
            id="receiver-commercial-name-input"
            type="text"
            placeholder="Ej: Tienda Juanito"
            value={(receiver as any).commercialName || ''}
            onChange={(e) => onChangeReceiver({ ...receiver, commercialName: e.target.value } as any)}
            className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Código de Actividad Económica CIIU4 del Receptor (Catálogo Progresivo DGT v4.4) */}
      <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-200/80">
        <EconomicActivityPicker
          value={receiver.economicActivity || ''}
          onChange={(code) => onChangeReceiver({ ...receiver, economicActivity: code })}
          label="Actividad Económica Receptor (CIIU4 Hacienda)"
          helperText="Exigido por Hacienda v4.4 para respaldo de crédito fiscal del receptor (D-104). Ingrese números progresivamente para buscar."
        />
      </div>

      {/* Correo Electrónico y Teléfono */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
        
        {/* Correo Electrónico */}
        <div className="sm:col-span-7">
          <label className="text-[11px] font-bold text-stone-700 uppercase tracking-wide flex items-center justify-between mb-1">
            <span>Correo Electrónico (Envío XML y PDF)</span>
            <span className="text-rose-600 font-bold">*</span>
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            <input
              id="receiver-email-input"
              type="email"
              placeholder="cliente@ejemplo.com"
              value={receiver.email || ''}
              onChange={(e) => onChangeReceiver({ ...receiver, email: e.target.value.trim() })}
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Teléfono */}
        <div className="sm:col-span-5">
          <label className="text-[11px] font-bold text-stone-700 uppercase tracking-wide block mb-1">
            Teléfono <span className="text-stone-400 text-[10px]">(Opcional)</span>
          </label>
          <div className="relative">
            <Phone className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            <input
              id="receiver-phone-input"
              type="text"
              placeholder="88776655"
              value={receiver.phone || ''}
              onChange={(e) => onChangeReceiver({ ...receiver, phone: e.target.value })}
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Ubicación Geográfica Oficial de Costa Rica (Provincia, Cantón, Distrito, Otras Señas) */}
      <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2.5">
        <div className="text-[11px] font-bold text-stone-700 uppercase tracking-wide flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-amber-700" />
          <span>Ubicación Geográfica del Receptor</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Provincia */}
          <div>
            <label className="text-[10px] font-bold text-stone-500 uppercase block mb-0.5">Provincia</label>
            <select
              id="receiver-province-select"
              value={receiver.province || ''}
              onChange={(e) => handleProvinceChange(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              <option value="">Seleccionar...</option>
              {COSTA_RICA_PROVINCES.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Cantón */}
          <div>
            <label className="text-[10px] font-bold text-stone-500 uppercase block mb-0.5">Cantón</label>
            <select
              id="receiver-canton-select"
              value={receiver.canton || ''}
              onChange={(e) => handleCantonChange(e.target.value)}
              disabled={!receiver.province}
              className="w-full px-2 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:bg-stone-100"
            >
              <option value="">Seleccionar...</option>
              {availableCantons.map(c => (
                <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>

          {/* Distrito */}
          <div>
            <label className="text-[10px] font-bold text-stone-500 uppercase block mb-0.5">Distrito</label>
            <select
              id="receiver-district-select"
              value={receiver.district || ''}
              onChange={(e) => onChangeReceiver({ ...receiver, district: e.target.value })}
              disabled={!receiver.canton}
              className="w-full px-2 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:bg-stone-100"
            >
              <option value="">Seleccionar...</option>
              {availableDistricts.map(d => (
                <option key={d.code} value={d.code}>{d.code} - {d.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Otras Señas / Dirección */}
        <div>
          <label className="text-[10px] font-bold text-stone-500 uppercase block mb-0.5">
            Otras Señas / Dirección Exacta (Máx 250 caracteres)
          </label>
          <input
            id="receiver-address-input"
            type="text"
            maxLength={250}
            placeholder="Ej: 100m norte del parque central, casa blanca"
            value={receiver.address || ''}
            onChange={(e) => onChangeReceiver({ ...receiver, address: e.target.value })}
            className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Resumen de Validación en Vivo */}
      {documentType === '01' && (
        <div className="space-y-1.5 pt-1">
          {validationResult.isValid ? (
            <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-2 text-emerald-900 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Datos del receptor verificados y conformes con el estándar DGT v4.4 para Factura Electrónica.</span>
            </div>
          ) : (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Requisitos pendientes para emitir Factura Electrónica (01):</span>
              </div>
              <ul className="list-disc list-inside text-[11px] space-y-0.5 pl-1">
                {validationResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {validationResult.warnings.length > 0 && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] space-y-0.5">
              {validationResult.warnings.map((warn, i) => (
                <div key={i}>⚠️ {warn}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
