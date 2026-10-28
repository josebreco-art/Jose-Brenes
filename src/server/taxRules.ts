// Catálogo Oficial CABYS y Normativa Tributaria de Costa Rica (DGT / BCCR / Hacienda v4.4)
// Para Restaurante "Pollo Frito Sabor Cervanteño" (Cervantes de Alvarado, Cartago)

import { CabysItem, TaxRateConfig, CostaRicaTaxType, EconomicActivity } from '../types/pos';

export const CABYS_CATALOG_VERSION = 'CABYS_VIGENTE_2024_2026_CR';

/**
 * Actividades Económicas registradas en Hacienda para el Emisor
 */
export const OFFICIAL_ECONOMIC_ACTIVITIES: EconomicActivity[] = [
  {
    code: '5610.0',
    description: 'Actividades de restaurantes y de servicio móvil de comidas (Pollo Frito, Comidas Rápidas)',
    main: true
  },
  {
    code: '561002',
    description: 'Servicio de entrega de comida a domicilio (Delivery / Express)',
    main: false
  },
  {
    code: '562900',
    description: 'Otras actividades de servicio de comidas y bebidas preparadas',
    main: false
  }
];

/**
 * Catálogo Oficial de Impuestos de Costa Rica (Hacienda v4.4)
 */
export const OFFICIAL_TAX_RATES: TaxRateConfig[] = [
  {
    id: 'tax-iva-13',
    code: '01',
    taxType: CostaRicaTaxType.IVA,
    name: 'IVA Tarifa General 13%',
    percentage: 13,
    rateDecimal: 0.13,
    active: true,
    description: 'Tarifa general de IVA aplicable a la mayoría de servicios de restaurante y bebidas.',
    startDate: '2019-07-01'
  },
  {
    id: 'tax-iva-1',
    code: '02',
    taxType: CostaRicaTaxType.IVA_REDUCIDA_1,
    name: 'IVA Canasta Básica Tributaria 1%',
    percentage: 1,
    rateDecimal: 0.01,
    active: true,
    description: 'Tarifa reducida del 1% para insumos y productos autorizados de canasta básica.',
    startDate: '2020-07-01'
  },
  {
    id: 'tax-iva-0',
    code: '08',
    taxType: CostaRicaTaxType.IVA_EXENTO,
    name: 'IVA Exento / Tarifa 0%',
    percentage: 0,
    rateDecimal: 0.0,
    active: true,
    description: 'Ventas exentas de IVA debidamente justificadas o productos no gravados.',
    startDate: '2019-07-01'
  }
];

/**
 * Catálogo Oficial CABYS (13 Dígitos) - Banco Central de Costa Rica (BCCR)
 * Selección Exclusiva de Códigos Autorizados para Pollo Frito Sabor Cervanteño
 */
export const OFFICIAL_CABYS_CATALOG: CabysItem[] = [
  {
    id: 'cabys-6331000000000',
    codigoCabys: '6331000000000',
    descripcionOficial: 'Suministro de comida, servicio de restaurante con mesero',
    nivel: 8,
    categoria: 'Servicios de Comidas y Bebidas',
    subcategoria: 'Restaurante con mesero',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Servicio de restaurante con atención de meseros.'
  },
  {
    id: 'cabys-6332000000000',
    codigoCabys: '6332000000000',
    descripcionOficial: 'Suministro de comida, servicio de restaurante sin mesero, con sitios para sentarse',
    nivel: 8,
    categoria: 'Servicios de Comidas y Bebidas',
    subcategoria: 'Restaurante sin mesero / Autoservicio',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Servicio de comidas rápidas y restaurantes de mostrador con mesas.'
  },
  {
    id: 'cabys-6340001000100',
    codigoCabys: '6340001000100',
    descripcionOficial: 'Café caliente, vendido en restaurantes, bares y establecimientos similares',
    nivel: 8,
    categoria: 'Bebidas Calientes',
    subcategoria: 'Café caliente',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Café caliente servido en el establecimiento.'
  },
  {
    id: 'cabys-6340001000200',
    codigoCabys: '6340001000200',
    descripcionOficial: 'Té caliente, vendido en restaurantes, bares y establecimientos similares',
    nivel: 8,
    categoria: 'Bebidas Calientes',
    subcategoria: 'Té caliente',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Té caliente servido en restaurante.'
  },
  {
    id: 'cabys-6340001000300',
    codigoCabys: '6340001000300',
    descripcionOficial: 'Chocolate caliente, vendido en restaurantes, bares y establecimientos similares',
    nivel: 8,
    categoria: 'Bebidas Calientes',
    subcategoria: 'Chocolate caliente',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Chocolate caliente preparado en el establecimiento.'
  },
  {
    id: 'cabys-6340001000400',
    codigoCabys: '6340001000400',
    descripcionOficial: 'Agua dulce caliente, vendida en restaurantes, bares y establecimientos similares',
    nivel: 8,
    categoria: 'Bebidas Calientes',
    subcategoria: 'Agua dulce caliente',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Agua dulce caliente típica de Costa Rica.'
  },
  {
    id: 'cabys-6340001009900',
    codigoCabys: '6340001009900',
    descripcionOficial: 'Bebidas calientes, vendidas en restaurantes, bares y establecimientos similares, n.c.p.',
    nivel: 8,
    categoria: 'Bebidas Calientes',
    subcategoria: 'Otras bebidas calientes',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Otras bebidas calientes no clasificadas previamente.'
  },
  {
    id: 'cabys-6340002020100',
    codigoCabys: '6340002020100',
    descripcionOficial: 'Agua embotellada, vendida en restaurantes, bares y establecimientos similares',
    nivel: 8,
    categoria: 'Bebidas Frías',
    subcategoria: 'Agua embotellada',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Agua purificada o mineral en botella servida en el local.'
  },
  {
    id: 'cabys-6340002020200',
    codigoCabys: '6340002020200',
    descripcionOficial: 'Bebidas naturales preparadas en agua, vendidas en restaurantes, bares y establecimientos similares',
    nivel: 8,
    categoria: 'Bebidas Frías',
    subcategoria: 'Frescos naturales en agua',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Frescos de frutas naturales en agua (cas, maracuyá, té frío natural, etc.).'
  },
  {
    id: 'cabys-6340002020300',
    codigoCabys: '6340002020300',
    descripcionOficial: 'Bebidas naturales preparadas en leche, vendidas en restaurantes, bares y establecimientos similares',
    nivel: 8,
    categoria: 'Bebidas Frías',
    subcategoria: 'Bebidas naturales en leche',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Batidos o frescos de frutas preparados en leche.'
  },
  {
    id: 'cabys-6340002020400',
    codigoCabys: '6340002020400',
    descripcionOficial: 'Café y demás bebidas a base de café, fríos, vendidos en restaurantes, bares y establecimientos similares',
    nivel: 8,
    categoria: 'Bebidas Frías',
    subcategoria: 'Café frío / Frappé',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Café frío, iced latte, mocaccino frío o frappuccino.'
  },
  {
    id: 'cabys-6340002029900',
    codigoCabys: '6340002029900',
    descripcionOficial: 'Bebidas frías, sin alcohol, vendidas en restaurantes, bares y establecimientos similares, n.c.p.',
    nivel: 8,
    categoria: 'Bebidas Frías',
    subcategoria: 'Otras bebidas frías',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Otras bebidas frías servidas en el restaurante sin alcohol.'
  },
  {
    id: 'cabys-2449001000000',
    codigoCabys: '2449001000000',
    descripcionOficial: 'Bebidas gaseosas azucaradas, edulcoradas o aromatizadas',
    nivel: 8,
    categoria: 'Bebidas Envasadas',
    subcategoria: 'Gaseosas',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Gaseosas de lata, botella o dispensador (Coca Cola, Fanta, Sprite, Kolbi).'
  },
  {
    id: 'cabys-2449002000100',
    codigoCabys: '2449002000100',
    descripcionOficial: 'Bebidas a base de jugo de frutas sin gasificar, azucaradas, edulcoradas o aromatizadas (no incluye jugos de frutas concentrados)',
    nivel: 8,
    categoria: 'Bebidas Envasadas',
    subcategoria: 'Jugos de frutas sin gas',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Jugos envasados y néctares de frutas.'
  },
  {
    id: 'cabys-2449002000200',
    codigoCabys: '2449002000200',
    descripcionOficial: 'Bebidas a base de té sin gasificar, azucaradas, edulcoradas o aromatizadas',
    nivel: 8,
    categoria: 'Bebidas Envasadas',
    subcategoria: 'Té frío envasado',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Té frío embotellado (Tropical, Fuze Tea, Nestea).'
  },
  {
    id: 'cabys-2449002000300',
    codigoCabys: '2449002000300',
    descripcionOficial: 'Bebidas con sabor a frutas sin gasificar, azucaradas, edulcoradas o aromatizadas',
    nivel: 8,
    categoria: 'Bebidas Envasadas',
    subcategoria: 'Bebidas saborizadas',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Refrescos aromatizados con sabor a fruta sin gas.'
  },
  {
    id: 'cabys-2449002000400',
    codigoCabys: '2449002000400',
    descripcionOficial: 'Bebidas con sabor a té sin gasificar, azucaradas, edulcoradas o aromatizadas',
    nivel: 8,
    categoria: 'Bebidas Envasadas',
    subcategoria: 'Bebidas sabor a té',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Bebidas aromatizadas con sabor a té.'
  },
  {
    id: 'cabys-2118601000000',
    codigoCabys: '2118601000000',
    descripcionOficial: 'Comidas preparadas a base de carne de bovino, no consumidas en el sitio',
    nivel: 8,
    categoria: 'Comidas Preparadas',
    subcategoria: 'Carne de res / Bovino para llevar o express',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Hamburguesas de res, tortas de carne, tacos de carne para llevar.'
  },
  {
    id: 'cabys-2118602000000',
    codigoCabys: '2118602000000',
    descripcionOficial: 'Comidas preparadas a base de carne de cerdo, no consumidas en el sitio',
    nivel: 8,
    categoria: 'Comidas Preparadas',
    subcategoria: 'Carne de cerdo para llevar o express',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Costillas, chuletas, chicharrones o comidas a base de cerdo.'
  },
  {
    id: 'cabys-2118603000000',
    codigoCabys: '2118603000000',
    descripcionOficial: 'Comidas preparadas a base de carne de aves, no consumidas en el sitio',
    nivel: 8,
    categoria: 'Comidas Preparadas',
    subcategoria: 'Pollo frito y aves para llevar o express',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Piezas de pollo frito crujiente, baldes familiares, tenders y alitas.'
  },
  {
    id: 'cabys-2118699000000',
    codigoCabys: '2118699000000',
    descripcionOficial: 'Comidas preparadas a base de carne, no consumidas en el sitio, n.c.p.',
    nivel: 8,
    categoria: 'Comidas Preparadas',
    subcategoria: 'Otras comidas con carne para llevar',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Otras preparaciones de carne mixta para consumo fuera del local.'
  },
  {
    id: 'cabys-2124100000000',
    codigoCabys: '2124100000000',
    descripcionOficial: 'Comidas preparadas a base de pescado, moluscos y crustáceos (croquetas, daditos, pescado, camarones, ceviche, entre otros), no consumidos en el sitio',
    nivel: 8,
    categoria: 'Comidas Preparadas',
    subcategoria: 'Pescado y mariscos para llevar',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Ceviches, pescado frito o mariscos preparados para llevar.'
  },
  {
    id: 'cabys-2139100000000',
    codigoCabys: '2139100000000',
    descripcionOficial: 'Comidas preparadas a base de verduras, legumbres y papas, no consumidos en el sitio',
    nivel: 8,
    categoria: 'Comidas Preparadas',
    subcategoria: 'Papas fritas y acompañamientos',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Papas fritas, aros de cebolla, purés, ensaladas y guarniciones para llevar.'
  },
  {
    id: 'cabys-2399700000000',
    codigoCabys: '2399700000000',
    descripcionOficial: 'Comidas preparadas n.c.p., no consumidas en el sitio',
    nivel: 8,
    categoria: 'Comidas Preparadas',
    subcategoria: 'Otras comidas preparadas para llevar',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Otras comidas preparadas y combos mixtos para llevar.'
  },
  {
    id: 'cabys-2227000000100',
    codigoCabys: '2227000000100',
    descripcionOficial: 'Helados y productos similares, a base de leche',
    nivel: 8,
    categoria: 'Postres y Lácteos',
    subcategoria: 'Helados a base de leche',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Helados de crema, conos, copas y sundae.'
  },
  {
    id: 'cabys-2227000009900',
    codigoCabys: '2227000009900',
    descripcionOficial: 'Helados y productos similares, n.c.p.',
    nivel: 8,
    categoria: 'Postres y Lácteos',
    subcategoria: 'Otros helados y paletas',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Paletas de agua, raspados y helados no lácteos.'
  },
  {
    id: 'cabys-2343000000000',
    codigoCabys: '2343000000000',
    descripcionOficial: 'Productos de pastelería y queques',
    nivel: 8,
    categoria: 'Pastelería y Repostería',
    subcategoria: 'Queques y pasteles',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Queques, pasteles, porciones de torta y repostería dulce.'
  },
  {
    id: 'cabys-2349002020700',
    codigoCabys: '2349002020700',
    descripcionOficial: 'Repostería congelada',
    nivel: 8,
    categoria: 'Pastelería y Repostería',
    subcategoria: 'Repostería congelada',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Repostería congelada para hornear o servir.'
  },
  {
    id: 'cabys-2367000000500',
    codigoCabys: '2367000000500',
    descripcionOficial: 'Confites, caramelos, pastillas, gomas azucaradas y bombones',
    nivel: 8,
    categoria: 'Confitería',
    subcategoria: 'Confites y caramelos',
    estado: 'VIGENTE',
    impuestoSugerido: 0.13,
    fechaInicioVigencia: '2020-12-01',
    versionCatalogo: CABYS_CATALOG_VERSION,
    fuente: 'Catálogo Oficial BCCR / Hacienda',
    observaciones: 'Confitería, gomas, chocolates y golosinas.'
  }
];

/**
 * Unidades de Medida Oficiales según Estándar DGT Hacienda Costa Rica (v4.4)
 */
export interface HaciendaUnitOfMeasure {
  code: string;
  name: string;
  category: 'SERVICIOS' | 'BIENES' | 'PESO' | 'VOLUMEN' | 'LONGITUD' | 'OTROS';
  description: string;
}

export const HACIENDA_UNITS_OF_MEASURE: HaciendaUnitOfMeasure[] = [
  { code: 'Sp', name: 'Servicios profesionales', category: 'SERVICIOS', description: 'Servicios profesionales' },
  { code: 'Spe', name: 'Servicios personales', category: 'SERVICIOS', description: 'Servicios personales' },
  { code: 'St', name: 'Servicios técnicos', category: 'SERVICIOS', description: 'Servicios técnicos' },
  { code: 'Os', name: 'Otro tipo de servicio', category: 'SERVICIOS', description: 'Otro tipo de servicio' },
  { code: 'Unid', name: 'Unidad', category: 'BIENES', description: 'Unidad' },
  { code: 'kg', name: 'Kilogramo', category: 'PESO', description: 'Kilogramo' },
  { code: 'g', name: 'Gramo', category: 'PESO', description: 'Gramo' },
  { code: 'm', name: 'Metro', category: 'LONGITUD', description: 'Metro' },
  { code: 'cm', name: 'Centímetro', category: 'LONGITUD', description: 'Centímetro' },
  { code: 'mm', name: 'Milímetro', category: 'LONGITUD', description: 'Milímetro' },
  { code: 'L', name: 'Litro', category: 'VOLUMEN', description: 'Litro' },
  { code: 'ml', name: 'Mililitro', category: 'VOLUMEN', description: 'Mililitro' },
  { code: 'm3', name: 'Metro cúbico', category: 'VOLUMEN', description: 'Metro cúbico' },
  { code: 'ha', name: 'Hectárea', category: 'OTROS', description: 'Hectárea' },
  { code: 'h', name: 'Hora', category: 'OTROS', description: 'Hora' },
  { code: 'min', name: 'Minuto', category: 'OTROS', description: 'Minuto' },
  { code: 's', name: 'Segundo', category: 'OTROS', description: 'Segundo' },
  { code: 'Al', name: 'Alquiler uso comercial', category: 'SERVICIOS', description: 'Alquiler uso comercial' },
  { code: 'Alc', name: 'Alquiler uso habitacional', category: 'SERVICIOS', description: 'Alquiler uso habitacional' },
  { code: 'Otros', name: 'Otros', category: 'OTROS', description: 'Otros' }
];

/**
 * Desglose fiscal exacto para Costa Rica:
 * Calcula Base Imponible (Neto), Monto de IVA y Total
 */
export function calculateFiscalPriceBreakdown(
  inputPrice: number,
  taxRate: number,
  isPriceWithTax: boolean = true
): {
  netPrice: number;
  taxAmount: number;
  totalPrice: number;
  taxRate: number;
  taxPercentageText: string;
} {
  const safeRate = Math.max(0, taxRate || 0);
  const safePrice = Math.max(0, inputPrice || 0);

  if (isPriceWithTax) {
    // El precio ingresado incluye IVA (ej: ₡1.130 con 13% -> Neto: ₡1.000, IVA: ₡130)
    const netPrice = safeRate > 0 ? Number((safePrice / (1 + safeRate)).toFixed(2)) : safePrice;
    const taxAmount = Number((safePrice - netPrice).toFixed(2));
    return {
      netPrice,
      taxAmount,
      totalPrice: safePrice,
      taxRate: safeRate,
      taxPercentageText: `${(safeRate * 100).toFixed(0)}%`
    };
  } else {
    // El precio ingresado es antes de IVA (ej: ₡1.000 con 13% -> IVA: ₡130, Total: ₡1.130)
    const netPrice = safePrice;
    const taxAmount = Number((safePrice * safeRate).toFixed(2));
    const totalPrice = Number((netPrice + taxAmount).toFixed(2));
    return {
      netPrice,
      taxAmount,
      totalPrice,
      taxRate: safeRate,
      taxPercentageText: `${(safeRate * 100).toFixed(0)}%`
    };
  }
}
