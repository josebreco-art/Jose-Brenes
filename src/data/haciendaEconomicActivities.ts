// Catálogo de Actividades Económicas Oficiales (CIIU4 / DGT Ministerio de Hacienda Costa Rica)
// v4.4 para Facturación Electrónica y respaldo de crédito fiscal D-104

export interface EconomicActivity {
  code: string;
  description: string;
  main?: boolean;
  category?: string;
  keywords?: string[];
}

export const ECONOMIC_ACTIVITY_CATEGORIES = [
  'Todos',
  'Restaurantes & Comidas',
  'Comercio & Tiendas',
  'Transporte & Envíos',
  'Servicios Profesionales',
  'Servicios Técnicos',
  'Construcción',
  'Salud & Belleza',
  'Educación'
];

/**
 * Actividades Económicas registradas en Hacienda para el Emisor "Pollo Frito Sabor Cervanteño"
 */
export const OFFICIAL_ECONOMIC_ACTIVITIES: EconomicActivity[] = [
  {
    code: '5610.0',
    description: 'Actividades de restaurantes y de servicio móvil de comidas (Pollo Frito, Comidas Rápidas)',
    main: true,
    category: 'Restaurantes & Comidas'
  },
  {
    code: '561001',
    description: 'Actividades de restaurantes y de servicio móvil de comidas',
    main: false,
    category: 'Restaurantes & Comidas'
  },
  {
    code: '561002',
    description: 'Servicio de entrega de comida a domicilio (Delivery / Express)',
    main: false,
    category: 'Restaurantes & Comidas'
  },
  {
    code: '562900',
    description: 'Otras actividades de servicio de comidas y bebidas preparadas',
    main: false,
    category: 'Restaurantes & Comidas'
  }
];

export const HACIENDA_ECONOMIC_ACTIVITIES: EconomicActivity[] = [
  // Restaurantes & Alimentos
  {
    code: '5610.0',
    description: 'Actividades de restaurantes y de servicio móvil de comidas',
    main: true,
    category: 'Restaurantes & Comidas'
  },
  {
    code: '561001',
    description: 'Actividades de restaurantes y sodas tradicionales',
    category: 'Restaurantes & Comidas'
  },
  {
    code: '561002',
    description: 'Servicio de entrega de comida a domicilio (Delivery / Express)',
    category: 'Restaurantes & Comidas'
  },
  {
    code: '562100',
    description: 'Suministro de comidas por encargo (Catering service)',
    category: 'Restaurantes & Comidas'
  },
  {
    code: '562900',
    description: 'Otras actividades de servicio de comidas preparadas',
    category: 'Restaurantes & Comidas'
  },
  {
    code: '563000',
    description: 'Actividades de servicio de bebidas (Bares, Cafeterías)',
    category: 'Restaurantes & Comidas'
  },

  // Comercio
  {
    code: '471100',
    description: 'Venta al por menor en comercios no especializados (Supermercados, Minisúper, Pulperías)',
    category: 'Comercio & Tiendas'
  },
  {
    code: '472100',
    description: 'Venta al por menor de alimentos en comercios especializados (Carnicerías, Verdulerías)',
    category: 'Comercio & Tiendas'
  },
  {
    code: '472200',
    description: 'Venta al por menor de bebidas en comercios especializados',
    category: 'Comercio & Tiendas'
  },
  {
    code: '477100',
    description: 'Venta al por menor de prendas de vestir y calzado',
    category: 'Comercio & Tiendas'
  },
  {
    code: '477200',
    description: 'Venta al por menor de productos farmacéuticos y medicinales',
    category: 'Comercio & Tiendas'
  },
  {
    code: '477300',
    description: 'Venta al por menor de otros productos en almacenes y tiendas',
    category: 'Comercio & Tiendas'
  },

  // Transporte
  {
    code: '4921.0',
    description: 'Transporte urbano y suburbano de pasajeros (Autobuses, Busetas)',
    category: 'Transporte & Envíos'
  },
  {
    code: '492200',
    description: 'Otras actividades de transporte de pasajeros por vía terrestre (Taxis, Servicios especiales)',
    category: 'Transporte & Envíos'
  },
  {
    code: '492300',
    description: 'Transporte de carga por carretera (Camiones, Fletes)',
    category: 'Transporte & Envíos'
  },
  {
    code: '532000',
    description: 'Actividades de mensajería y entrega a domicilio express',
    category: 'Transporte & Envíos'
  },

  // Servicios Profesionales
  {
    code: '691000',
    description: 'Actividades jurídicas y legales (Abogados, Notarios)',
    category: 'Servicios Profesionales'
  },
  {
    code: '692000',
    description: 'Actividades de contabilidad, teneduría de libros y auditoría (Contadores)',
    category: 'Servicios Profesionales'
  },
  {
    code: '711000',
    description: 'Servicios de arquitectura e ingeniería (Ingenieros, Arquitectos)',
    category: 'Servicios Profesionales'
  },
  {
    code: '620101',
    description: 'Desarrollo de software y aplicaciones informáticas',
    category: 'Servicios Profesionales'
  },
  {
    code: '620200',
    description: 'Consultoría informática y gestión de instalaciones informáticas',
    category: 'Servicios Profesionales'
  },
  {
    code: '702000',
    description: 'Actividades de consultoría de gestión empresarial y administración',
    category: 'Servicios Profesionales'
  },
  {
    code: '731000',
    description: 'Publicidad y mercadeo digital',
    category: 'Servicios Profesionales'
  },

  // Servicios Técnicos & Mantenimiento
  {
    code: '432100',
    description: 'Instalaciones eléctricas y mantenimiento',
    category: 'Servicios Técnicos'
  },
  {
    code: '432200',
    description: 'Fontanería, calefacción y aire acondicionado',
    category: 'Servicios Técnicos'
  },
  {
    code: '452000',
    description: 'Mantenimiento y reparación de vehículos de motor (Talleres mecánicos)',
    category: 'Servicios Técnicos'
  },
  {
    code: '951100',
    description: 'Reparación de computadoras y equipos de comunicación',
    category: 'Servicios Técnicos'
  },
  {
    code: '952200',
    description: 'Reparación de electrodomésticos y equipos para el hogar',
    category: 'Servicios Técnicos'
  },

  // Construcción
  {
    code: '410000',
    description: 'Construcción de edificios y casas',
    category: 'Construcción'
  },
  {
    code: '433000',
    description: 'Terminación y acabado de edificios (Pintura, Pisos)',
    category: 'Construcción'
  },

  // Salud & Belleza
  {
    code: '862000',
    description: 'Actividades de médicos y odontólogos (Clínicas, Consultorios)',
    category: 'Salud & Belleza'
  },
  {
    code: '960200',
    description: 'Peluquería y otros tratamientos de belleza (Salones, Barberías)',
    category: 'Salud & Belleza'
  },

  // Educación
  {
    code: '851000',
    description: 'Enseñanza preescolar y primaria',
    category: 'Educación'
  },
  {
    code: '854900',
    description: 'Otros tipos de enseñanza y academias de capacitación',
    category: 'Educación'
  },

  // Consumidor final / Despacho
  {
    code: '2022.0',
    description: 'Consumidor final / Actividad genérica receptor',
    category: 'Restaurantes & Comidas'
  }
];

export function getEconomicActivityByCode(code: string): EconomicActivity | undefined {
  if (!code) return undefined;
  const cleanCode = code.trim();
  return (
    HACIENDA_ECONOMIC_ACTIVITIES.find(a => a.code === cleanCode) ||
    OFFICIAL_ECONOMIC_ACTIVITIES.find(a => a.code === cleanCode) ||
    HACIENDA_ECONOMIC_ACTIVITIES.find(a => a.code.replace('.', '') === cleanCode.replace('.', ''))
  );
}

export function searchEconomicActivities(
  query: string,
  maxResults: number = 25,
  category: string = 'Todos'
): EconomicActivity[] {
  let list = HACIENDA_ECONOMIC_ACTIVITIES;
  if (category && category !== 'Todos') {
    list = list.filter(a => a.category === category);
  }

  if (!query || !query.trim()) {
    return list.slice(0, maxResults);
  }

  const q = query.toLowerCase().trim();
  const qClean = q.replace(/[^\d]/g, '');

  return list
    .filter(a => {
      const matchText = a.description.toLowerCase().includes(q);
      const matchCode = a.code.toLowerCase().includes(q) || (qClean.length > 0 && a.code.replace(/[^\d]/g, '').includes(qClean));
      return matchText || matchCode;
    })
    .slice(0, maxResults);
}
