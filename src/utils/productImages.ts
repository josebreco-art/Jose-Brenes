// Catálogo y Utilitarios de Imágenes Locales para Menú POS Restaurante

export interface LocalImagePreset {
  id: string;
  name: string;
  category: string;
  path: string;
  skuHint: string;
}

export const LOCAL_PRODUCT_IMAGES: LocalImagePreset[] = [
  {
    id: 'img-pollo-crujiente',
    name: 'Pieza de Pollo Crujiente',
    category: 'cat-pollo',
    path: '/images/products/pollo-crujiente.svg',
    skuHint: 'POL-001'
  },
  {
    id: 'img-caja-3-piezas',
    name: 'Caja 3 Piezas + Papas',
    category: 'cat-pollo',
    path: '/images/products/caja-3-piezas.svg',
    skuHint: 'POL-002'
  },
  {
    id: 'img-mega-balde-10',
    name: 'Mega Balde Familiar 10 Pzs',
    category: 'cat-pollo',
    path: '/images/products/mega-balde-10.svg',
    skuHint: 'POL-003'
  },
  {
    id: 'img-combo-pareja',
    name: 'Super Combo Pareja 6 Pzs',
    category: 'cat-combos',
    path: '/images/products/combo-pareja.svg',
    skuHint: 'CMB-001'
  },
  {
    id: 'img-combo-fiesta',
    name: 'Combo Fiesta Familiar',
    category: 'cat-combos',
    path: '/images/products/combo-fiesta.svg',
    skuHint: 'CMB-002'
  },
  {
    id: 'img-hamburguesa-crispy',
    name: 'Hamburguesa Pollo Crispy',
    category: 'cat-hamburguesas',
    path: '/images/products/hamburguesa-crispy.svg',
    skuHint: 'HAM-001'
  },
  {
    id: 'img-hamburguesa-doble-bacon',
    name: 'Hamburguesa Doble Pollo Bacon',
    category: 'cat-hamburguesas',
    path: '/images/products/hamburguesa-doble-bacon.svg',
    skuHint: 'HAM-002'
  },
  {
    id: 'img-hamburguesa-monster',
    name: 'Hamburguesa Monster Crunchy',
    category: 'cat-hamburguesas',
    path: '/images/products/hamburguesa-monster.svg',
    skuHint: 'HAM-003'
  },
  {
    id: 'img-tacos-ticos',
    name: 'Tacos Ticos Cervanteños',
    category: 'cat-tacos',
    path: '/images/products/tacos-ticos.svg',
    skuHint: 'TAC-001'
  },
  {
    id: 'img-chalupas-pollo',
    name: 'Orden Chalupas de Pollo',
    category: 'cat-tacos',
    path: '/images/products/chalupas-pollo.svg',
    skuHint: 'TAC-002'
  },
  {
    id: 'img-empanada-queso',
    name: 'Empanada Casera Pollo & Queso',
    category: 'cat-empanadas',
    path: '/images/products/empanada-queso.svg',
    skuHint: 'EMP-001'
  },
  {
    id: 'img-nachos-supremos',
    name: 'Nachos Supremos Cervanteños',
    category: 'cat-nachos',
    path: '/images/products/nachos-supremos.svg',
    skuHint: 'NCH-001'
  },
  {
    id: 'img-burrito-bbq',
    name: 'Burrito Crunchy Pollo BBQ',
    category: 'cat-burritos',
    path: '/images/products/burrito-bbq.svg',
    skuHint: 'BUR-001'
  },
  {
    id: 'img-papas-rusticas',
    name: 'Papas Fritas Rústicas Grandes',
    category: 'cat-papas',
    path: '/images/products/papas-rusticas.svg',
    skuHint: 'PAP-001'
  },
  {
    id: 'img-aros-cebolla',
    name: 'Aros de Cebolla Crocantes',
    category: 'cat-papas',
    path: '/images/products/aros-cebolla.svg',
    skuHint: 'PAP-002'
  },
  {
    id: 'img-gaseosa-imperial',
    name: 'Gaseosa Cola 600ml',
    category: 'cat-bebidas',
    path: '/images/products/gaseosa-imperial.svg',
    skuHint: 'BEB-001'
  },
  {
    id: 'img-refresco-natural',
    name: 'Refresco Natural Frutas',
    category: 'cat-bebidas',
    path: '/images/products/refresco-natural.svg',
    skuHint: 'BEB-002'
  }
];

/**
 * Resuelve la ruta local de la imagen para un producto de manera infalible.
 * Si la imagen ya es local (comienza con /images/ o data:image/), se retorna directamente.
 * Si es una URL externa antigua (Unsplash u otro CDN) o está vacía, se asocia automáticamente a la ilustración local del catálogo.
 */
export function getLocalProductImage(
  imagePath?: string | null,
  categoryId?: string,
  productName?: string,
  sku?: string
): string {
  // Si el producto ya cuenta con una imagen definida por el usuario (ruta local /uploads/, /images/, Base64 data:, URL web http/https o blob:),
  // se devuelve SIEMPRE la imagen personalizada sin sobrescribirla jamás.
  if (imagePath && typeof imagePath === 'string') {
    const trimmed = imagePath.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  // Búsqueda por SKU exacto
  if (sku) {
    const matchBySku = LOCAL_PRODUCT_IMAGES.find(img => img.skuHint.toUpperCase() === sku.toUpperCase());
    if (matchBySku) return matchBySku.path;
  }

  // Búsqueda por coincidencia de nombre
  if (productName) {
    const normName = productName.toLowerCase();
    if (normName.includes('balde') || normName.includes('cubeta') || normName.includes('10 pzs')) {
      return '/images/products/mega-balde-10.svg';
    }
    if (normName.includes('combo fiesta') || normName.includes('familiar')) {
      return '/images/products/combo-fiesta.svg';
    }
    if (normName.includes('combo pareja') || normName.includes('pareja') || normName.includes('6 pzs')) {
      return '/images/products/combo-pareja.svg';
    }
    if (normName.includes('caja') || normName.includes('3 piezas') || normName.includes('3 pzs')) {
      return '/images/products/caja-3-piezas.svg';
    }
    if (normName.includes('pollo') && (normName.includes('pieza') || normName.includes('crujiente') || normName.includes('alitas'))) {
      return '/images/products/pollo-crujiente.svg';
    }
    if (normName.includes('monster') || normName.includes('triple')) {
      return '/images/products/hamburguesa-monster.svg';
    }
    if (normName.includes('bacon') || normName.includes('tocineta') || normName.includes('doble')) {
      return '/images/products/hamburguesa-doble-bacon.svg';
    }
    if (normName.includes('hamburguesa') || normName.includes('burger')) {
      return '/images/products/hamburguesa-crispy.svg';
    }
    if (normName.includes('taco')) {
      return '/images/products/tacos-ticos.svg';
    }
    if (normName.includes('chalupa')) {
      return '/images/products/chalupas-pollo.svg';
    }
    if (normName.includes('empanada')) {
      return '/images/products/empanada-queso.svg';
    }
    if (normName.includes('nacho')) {
      return '/images/products/nachos-supremos.svg';
    }
    if (normName.includes('burrito') || normName.includes('wrap')) {
      return '/images/products/burrito-bbq.svg';
    }
    if (normName.includes('aro') || normName.includes('cebolla')) {
      return '/images/products/aros-cebolla.svg';
    }
    if (normName.includes('papa') || normName.includes('frita')) {
      return '/images/products/papas-rusticas.svg';
    }
    if (normName.includes('gaseosa') || normName.includes('cola') || normName.includes('soda') || normName.includes('imperial')) {
      return '/images/products/gaseosa-imperial.svg';
    }
    if (normName.includes('refresco') || normName.includes('natural') || normName.includes('jugo') || normName.includes('cas') || normName.includes('maracuy')) {
      return '/images/products/refresco-natural.svg';
    }
  }

  // Búsqueda por categoría
  if (categoryId) {
    switch (categoryId) {
      case 'cat-pollo': return '/images/products/pollo-crujiente.svg';
      case 'cat-combos': return '/images/products/combo-pareja.svg';
      case 'cat-hamburguesas': return '/images/products/hamburguesa-crispy.svg';
      case 'cat-tacos': return '/images/products/tacos-ticos.svg';
      case 'cat-empanadas': return '/images/products/empanada-queso.svg';
      case 'cat-nachos': return '/images/products/nachos-supremos.svg';
      case 'cat-burritos': return '/images/products/burrito-bbq.svg';
      case 'cat-papas': return '/images/products/papas-rusticas.svg';
      case 'cat-bebidas': return '/images/products/refresco-natural.svg';
      default: return '/images/products/pollo-crujiente.svg';
    }
  }

  return '/images/products/pollo-crujiente.svg';
}
