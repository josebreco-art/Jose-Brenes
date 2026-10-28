import React, { useState } from 'react';
import { Product, Category } from '../types/pos';
import { Plus, Edit2, Trash2, Search, UtensilsCrossed, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { PosApiService } from '../services/api';

interface ProductManagementViewProps {
  products: Product[];
  categories: Category[];
  onProductsUpdated: () => void;
}

export const ProductManagementView: React.FC<ProductManagementViewProps> = ({
  products,
  categories,
  onProductsUpdated
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Partial<Product> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleCreateNew = () => {
    setSelectedProduct({
      name: '',
      price: 0,
      cost: 0,
      taxRate: 0.13,
      cabysCode: '6339900000000',
      categoryId: categories[0]?.id || 'cat-combos',
      unit: 'Unid',
      active: true,
      description: '',
      image: ''
    });
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !selectedProduct.name) return;
    setIsSaving(true);
    try {
      await PosApiService.saveProduct(selectedProduct);
      setIsEditing(false);
      setSelectedProduct(null);
      onProductsUpdated();
    } catch (err: any) {
      alert('Error al guardar producto: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este producto?')) return;
    try {
      await PosApiService.deleteProduct(id);
      onProductsUpdated();
    } catch (err: any) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-stone-100">
      
      {/* Product List */}
      <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-stone-200">
        
        <div className="p-3 bg-white border-b border-stone-200 flex items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nombre o SKU..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-stone-100 border border-stone-200 text-xs font-medium focus:outline-hidden"
            />
          </div>
          <button
            type="button"
            onClick={handleCreateNew}
            className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Producto</span>
          </button>
        </div>

        <div className="flex-1 p-3 overflow-y-auto space-y-2">
          {filtered.map(prod => {
            const cat = categories.find(c => c.id === prod.categoryId);
            return (
              <div
                key={prod.id}
                className="p-3 rounded-2xl bg-white border border-stone-200 flex items-center justify-between gap-3 hover:border-amber-400 transition-all shadow-xs"
              >
                <div className="w-12 h-12 rounded-xl bg-amber-50 overflow-hidden flex items-center justify-center shrink-0">
                  {prod.image ? (
                    <img src={prod.image} alt={prod.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl">🍗</span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-stone-900 truncate">{prod.name}</h4>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-600 font-bold">
                      {cat?.name || 'General'}
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5 font-mono">
                    CABYS: {prod.cabysCode} • SKU: {prod.sku || 'N/A'}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-sm font-black text-amber-950 font-mono">
                    ₡{Math.round(prod.price).toLocaleString('es-CR')}
                  </div>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProduct(prod);
                        setIsEditing(true);
                      }}
                      className="p-1 rounded-lg hover:bg-amber-100 text-stone-600 hover:text-amber-800"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(prod.id)}
                      className="p-1 rounded-lg hover:bg-rose-100 text-stone-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Edit / Create Pane */}
      {isEditing && selectedProduct && (
        <div className="w-full md:w-96 bg-white flex flex-col h-full border-l border-stone-200 shadow-xl overflow-hidden shrink-0">
          <div className="p-4 bg-amber-950 text-white flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider">
              {selectedProduct.id ? 'Editar Producto' : 'Crear Producto'}
            </h3>
            <button
              onClick={() => setIsEditing(false)}
              className="text-amber-300 hover:text-white text-xs font-bold"
            >
              Cancelar
            </button>
          </div>

          <form onSubmit={handleSave} className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
            <div>
              <label className="block font-bold text-stone-700 mb-1">Nombre del Producto:</label>
              <input
                type="text"
                required
                value={selectedProduct.name || ''}
                onChange={e => setSelectedProduct({ ...selectedProduct, name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Precio Venta (₡):</label>
                <input
                  type="number"
                  required
                  value={selectedProduct.price || 0}
                  onChange={e => setSelectedProduct({ ...selectedProduct, price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Categoría:</label>
                <select
                  value={selectedProduct.categoryId || ''}
                  onChange={e => setSelectedProduct({ ...selectedProduct, categoryId: e.target.value })}
                  className="w-full px-2.5 py-2 rounded-xl bg-stone-50 border border-stone-300"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-stone-700 mb-1">Código CABYS (Hacienda):</label>
              <input
                type="text"
                value={selectedProduct.cabysCode || ''}
                onChange={e => setSelectedProduct({ ...selectedProduct, cabysCode: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300 font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-stone-700 mb-1">URL de Imagen:</label>
              <input
                type="text"
                placeholder="https://..."
                value={selectedProduct.image || ''}
                onChange={e => setSelectedProduct({ ...selectedProduct, image: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300"
              />
            </div>

            <div>
              <label className="block font-bold text-stone-700 mb-1">Descripción / Ingredientes:</label>
              <textarea
                rows={2}
                value={selectedProduct.description || ''}
                onChange={e => setSelectedProduct({ ...selectedProduct, description: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-300"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black shadow-md cursor-pointer transition-all"
              >
                {isSaving ? 'Guardando...' : 'Guardar Producto'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
