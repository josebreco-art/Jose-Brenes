import React, { useState } from 'react';
import { Customer } from '../types/pos';
import { Users, Plus, Search, Mail, Phone, MapPin, Building2, User } from 'lucide-react';
import { PosApiService } from '../services/api';

interface CustomerManagementViewProps {
  customers: Customer[];
  onCustomersUpdated: () => void;
}

export const CustomerManagementView: React.FC<CustomerManagementViewProps> = ({
  customers,
  onCustomersUpdated
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedCust, setSelectedCust] = useState<Partial<Customer> | null>(null);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.identification.includes(searchTerm) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = () => {
    setSelectedCust({
      name: '',
      identification: '',
      identificationType: '01',
      email: '',
      phone: '',
      address: '',
      province: '3',
      canton: '02',
      district: '01'
    });
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCust || !selectedCust.name || !selectedCust.identification) return;
    try {
      await PosApiService.saveCustomer(selectedCust);
      setIsEditing(false);
      setSelectedCust(null);
      onCustomersUpdated();
    } catch (err: any) {
      alert('Error al guardar cliente: ' + err.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-stone-100">
      
      <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-stone-200">
        <div className="p-3 bg-white border-b border-stone-200 flex items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nombre, cédula o correo..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-stone-100 border border-stone-200 text-xs font-medium focus:outline-hidden"
            />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Cliente</span>
          </button>
        </div>

        <div className="flex-1 p-3 overflow-y-auto space-y-2">
          {filtered.map(c => (
            <div
              key={c.id}
              className="p-3 rounded-2xl bg-white border border-stone-200 flex items-center justify-between gap-3 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold text-sm">
                  {c.name.charAt(0)}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-stone-900">{c.name}</h4>
                  <div className="text-[11px] text-stone-500 font-mono mt-0.5">
                    Cédula: {c.identification} • {c.email || 'Sin correo'}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-stone-400">
                {c.phone || 'Sin teléfono'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {isEditing && selectedCust && (
        <div className="w-full md:w-96 bg-white flex flex-col h-full border-l border-stone-200 shadow-xl overflow-hidden shrink-0">
          <div className="p-4 bg-amber-950 text-white flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider">Nuevo Cliente Fiscal</h3>
            <button onClick={() => setIsEditing(false)} className="text-amber-300 text-xs font-bold">Cancelar</button>
          </div>
          <form onSubmit={handleSave} className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
            <div>
              <label className="block font-bold text-stone-700 mb-1">Nombre Completo o Razón Social:</label>
              <input
                type="text"
                required
                value={selectedCust.name || ''}
                onChange={e => setSelectedCust({ ...selectedCust, name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300"
              />
            </div>
            <div>
              <label className="block font-bold text-stone-700 mb-1">Tipo de Cédula:</label>
              <select
                value={selectedCust.identificationType || '01'}
                onChange={e => setSelectedCust({ ...selectedCust, identificationType: e.target.value })}
                className="w-full px-2.5 py-2 rounded-xl bg-stone-50 border border-stone-300"
              >
                <option value="01">Cédula Física (9 dígitos)</option>
                <option value="02">Cédula Jurídica (10 dígitos)</option>
                <option value="03">DIMEX (11-12 dígitos)</option>
                <option value="04">NITE</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-stone-700 mb-1">Número de Identificación:</label>
              <input
                type="text"
                required
                placeholder="Ej. 302680311"
                value={selectedCust.identification || ''}
                onChange={e => setSelectedCust({ ...selectedCust, identification: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-stone-700 mb-1">Correo Electrónico (Factura):</label>
              <input
                type="email"
                required
                placeholder="cliente@correo.com"
                value={selectedCust.email || ''}
                onChange={e => setSelectedCust({ ...selectedCust, email: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300"
              />
            </div>
            <div>
              <label className="block font-bold text-stone-700 mb-1">Teléfono:</label>
              <input
                type="text"
                placeholder="8888-8888"
                value={selectedCust.phone || ''}
                onChange={e => setSelectedCust({ ...selectedCust, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black shadow-md transition-all cursor-pointer mt-2"
            >
              Guardar Cliente
            </button>
          </form>
        </div>
      )}

    </div>
  );
};
