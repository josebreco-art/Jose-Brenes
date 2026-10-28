import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Briefcase, 
  Search, 
  CheckCircle2, 
  ChevronDown, 
  X, 
  Sparkles, 
  Layers, 
  Info,
  Building,
  UtensilsCrossed,
  Laptop,
  Scale,
  ShoppingBag,
  Stethoscope,
  Truck,
  HardHat,
  GraduationCap,
  Scissors
} from 'lucide-react';
import { 
  EconomicActivity, 
  HACIENDA_ECONOMIC_ACTIVITIES, 
  searchEconomicActivities, 
  getEconomicActivityByCode,
  ECONOMIC_ACTIVITY_CATEGORIES 
} from '../data/haciendaEconomicActivities';

interface EconomicActivityPickerProps {
  value: string; // 6 dígitos numéricos
  onChange: (code: string, activity?: EconomicActivity) => void;
  label?: string;
  required?: boolean;
  helperText?: string;
  className?: string;
}

export const EconomicActivityPicker: React.FC<EconomicActivityPickerProps> = ({
  value,
  onChange,
  label = 'Código de Actividad Económica (CIIU4)',
  required = false,
  helperText = 'Exigido por Hacienda v4.4 para respaldo de crédito fiscal del receptor (D-104).',
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Actividad seleccionada actualmente según el código
  const currentActivity = useMemo(() => {
    return getEconomicActivityByCode(value);
  }, [value]);

  // Resultados de búsqueda progresiva (filtrando en tiempo real por número o texto)
  const results = useMemo(() => {
    // Si hay un término de búsqueda en el selector o en el input
    const query = searchTerm || value;
    return searchEconomicActivities(query, 25, selectedCategory);
  }, [searchTerm, value, selectedCategory]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const cleanDigits = rawVal.replace(/[^\d.]/g, '').substring(0, 15);
    setSearchTerm(cleanDigits);
    setIsOpen(true);
    
    const matched = getEconomicActivityByCode(cleanDigits);
    onChange(cleanDigits, matched);
  };

  const handleSelectActivity = (act: EconomicActivity) => {
    onChange(act.code, act);
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('', undefined);
    setSearchTerm('');
  };

  // Icono según la categoría
  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'Restaurantes & Comidas': return <UtensilsCrossed className="w-3.5 h-3.5 text-amber-600" />;
      case 'Tecnología & Software': return <Laptop className="w-3.5 h-3.5 text-blue-600" />;
      case 'Servicios Profesionales': return <Scale className="w-3.5 h-3.5 text-indigo-600" />;
      case 'Comercio': return <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />;
      case 'Salud': return <Stethoscope className="w-3.5 h-3.5 text-rose-600" />;
      case 'Transporte & Logística': return <Truck className="w-3.5 h-3.5 text-cyan-600" />;
      case 'Construcción': return <HardHat className="w-3.5 h-3.5 text-orange-600" />;
      case 'Educación': return <GraduationCap className="w-3.5 h-3.5 text-purple-600" />;
      case 'Belleza & Cuidado Personal': return <Scissors className="w-3.5 h-3.5 text-pink-600" />;
      default: return <Briefcase className="w-3.5 h-3.5 text-stone-500" />;
    }
  };

  return (
    <div ref={containerRef} className={`space-y-1.5 relative ${className}`}>
      {/* Label and Quick Actions */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold text-stone-700 uppercase tracking-wide flex items-center gap-1.5">
          <Briefcase className="w-3.5 h-3.5 text-amber-700" />
          <span>{label}</span>
          {required && <span className="text-rose-600">*</span>}
        </label>
        
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) {
              setSearchTerm('');
              setTimeout(() => inputRef.current?.focus(), 50);
            }
          }}
          className="text-[10px] font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100/60 hover:bg-amber-100 transition-colors"
        >
          <Sparkles className="w-3 h-3 text-amber-600" />
          <span>{isOpen ? 'Ocultar lista' : 'Ver Catálogo Hacienda'}</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Main Input Control */}
      <div className="relative flex items-center">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            maxLength={15}
            value={value || ''}
            onChange={handleInputChange}
            onFocus={() => setIsOpen(true)}
            placeholder="Ingrese código ej: 5610.0, 6201.0..."
            className={`w-full pl-3 pr-8 py-2 text-xs font-mono font-bold bg-white border rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all ${
              currentActivity 
                ? 'border-emerald-400 bg-emerald-50/20 text-stone-900' 
                : value && value.length === 6
                  ? 'border-amber-400 bg-amber-50/20 text-stone-900'
                  : 'border-stone-300 text-stone-800'
            }`}
          />
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-600"
              title="Limpiar código"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Verified Activity Description Card */}
      {currentActivity ? (
        <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-start gap-2 text-xs animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded text-[11px]">
                {currentActivity.code}
              </span>
              <span className="text-[10px] font-bold text-stone-500 bg-white px-1.5 py-0.2 rounded border border-stone-200 flex items-center gap-1">
                {getCategoryIcon(currentActivity.category)}
                <span>{currentActivity.category}</span>
              </span>
            </div>
            <p className="text-emerald-950 font-semibold mt-1 text-[11px] leading-tight">
              {currentActivity.description}
            </p>
          </div>
        </div>
      ) : value && value.length === 6 ? (
        <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-[11px] text-amber-900">
          <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Código <strong>{value}</strong> personalizado de 6 dígitos. Verifique que coincida con la actividad inscrita ante la DGT.
          </span>
        </div>
      ) : (
        helperText && (
          <p className="text-[10px] text-stone-500 leading-tight">
            {helperText}
          </p>
        )
      )}

      {/* Progressive Autocomplete Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-stone-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-80 animate-in fade-in slide-in-from-top-1 duration-150">
          
          {/* Header Search Bar inside Dropdown */}
          <div className="p-2.5 bg-stone-50 border-b border-stone-200 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por código (ej: 56, 62) o nombre (ej: restaurante, abogado, software)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2 text-stone-400 hover:text-stone-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-[10px]">
              {ECONOMIC_ACTIVITY_CATEGORIES.slice(0, 8).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-0.5 rounded-full whitespace-nowrap font-bold transition-colors shrink-0 ${
                    selectedCategory === cat
                      ? 'bg-amber-600 text-white'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Results List */}
          <div className="overflow-y-auto p-1.5 space-y-1 divide-y divide-stone-100 flex-1">
            {results.length === 0 ? (
              <div className="p-6 text-center text-stone-400 space-y-1">
                <p className="text-xs font-bold text-stone-600">No se encontraron actividades con "{searchTerm || value}"</p>
                <p className="text-[10px]">Puede ingresar directamente el código de 6 dígitos de Hacienda.</p>
              </div>
            ) : (
              results.map(act => {
                const isSelected = value === act.code;
                return (
                  <button
                    key={act.code}
                    type="button"
                    onClick={() => handleSelectActivity(act)}
                    className={`w-full text-left p-2 rounded-xl transition-all flex items-start gap-2.5 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-white font-bold shadow-xs'
                        : 'hover:bg-amber-50/70 text-stone-800'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      <span className={`font-mono text-xs px-2 py-0.5 rounded font-black tracking-wider ${
                        isSelected 
                          ? 'bg-amber-700 text-amber-100' 
                          : 'bg-stone-100 text-stone-900 border border-stone-200'
                      }`}>
                        {act.code}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full flex items-center gap-1 ${
                          isSelected ? 'bg-amber-600 text-amber-100' : 'bg-stone-100 text-stone-600'
                        }`}>
                          {getCategoryIcon(act.category)}
                          <span>{act.category}</span>
                        </span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />}
                      </div>
                      <p className={`text-xs leading-snug line-clamp-2 ${isSelected ? 'text-white' : 'text-stone-700'}`}>
                        {act.description}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer stats */}
          <div className="p-2 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-[10px] text-stone-500 px-3">
            <span>Catálogo DGT v4.4 Oficial ({HACIENDA_ECONOMIC_ACTIVITIES.length} actividades precargadas)</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="font-bold text-amber-800 hover:text-amber-950"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
