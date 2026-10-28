// Catálogo Geográfico y Actividades Económicas de Costa Rica (DGT / Ministerio de Hacienda v4.4)

export interface CostaRicaProvince {
  id: string; // '1' .. '7'
  name: string;
}

export interface CostaRicaCanton {
  provinceId: string;
  code: string; // '01' .. '99'
  name: string;
}

export interface CostaRicaDistrict {
  provinceId: string;
  cantonCode: string;
  code: string; // '01' .. '99'
  name: string;
}

export const COSTA_RICA_PROVINCES: CostaRicaProvince[] = [
  { id: '1', name: '1 - San José' },
  { id: '2', name: '2 - Alajuela' },
  { id: '3', name: '3 - Cartago' },
  { id: '4', name: '4 - Heredia' },
  { id: '5', name: '5 - Guanacaste' },
  { id: '6', name: '6 - Puntarenas' },
  { id: '7', name: '7 - Limón' }
];

export const COSTA_RICA_CANTONS: CostaRicaCanton[] = [
  // San José (1)
  { provinceId: '1', code: '01', name: 'San José' },
  { provinceId: '1', code: '02', name: 'Escazú' },
  { provinceId: '1', code: '03', name: 'Desamparados' },
  { provinceId: '1', code: '04', name: 'Puriscal' },
  { provinceId: '1', code: '05', name: 'Tarrazú' },
  { provinceId: '1', code: '06', name: 'Aserrí' },
  { provinceId: '1', code: '07', name: 'Mora' },
  { provinceId: '1', code: '08', name: 'Goicoechea' },
  { provinceId: '1', code: '09', name: 'Santa Ana' },
  { provinceId: '1', code: '10', name: 'Alajuelita' },
  { provinceId: '1', code: '11', name: 'Vázquez de Coronado' },
  { provinceId: '1', code: '12', name: 'Acosta' },
  { provinceId: '1', code: '13', name: 'Tibás' },
  { provinceId: '1', code: '14', name: 'Moravia' },
  { provinceId: '1', code: '15', name: 'Montes de Oca' },
  { provinceId: '1', code: '16', name: 'Turrubares' },
  { provinceId: '1', code: '17', name: 'Dota' },
  { provinceId: '1', code: '18', name: 'Curridabat' },
  { provinceId: '1', code: '19', name: 'Pérez Zeledón' },
  { provinceId: '1', code: '20', name: 'León Cortés Castro' },

  // Alajuela (2)
  { provinceId: '2', code: '01', name: 'Alajuela' },
  { provinceId: '2', code: '02', name: 'San Ramón' },
  { provinceId: '2', code: '03', name: 'Grecia' },
  { provinceId: '2', code: '04', name: 'San Mateo' },
  { provinceId: '2', code: '05', name: 'Atenas' },
  { provinceId: '2', code: '06', name: 'Naranjo' },
  { provinceId: '2', code: '07', name: 'Palmares' },
  { provinceId: '2', code: '08', name: 'Poás' },
  { provinceId: '2', code: '09', name: 'Orotina' },
  { provinceId: '2', code: '10', name: 'San Carlos' },
  { provinceId: '2', code: '11', name: 'Zarcero' },
  { provinceId: '2', code: '12', name: 'Sarchí' },
  { provinceId: '2', code: '13', name: 'Upala' },
  { provinceId: '2', code: '14', name: 'Los Chiles' },
  { provinceId: '2', code: '15', name: 'Guatuso' },
  { provinceId: '2', code: '16', name: 'Río Cuarto' },

  // Cartago (3)
  { provinceId: '3', code: '01', name: 'Cartago' },
  { provinceId: '3', code: '02', name: 'Paraíso' },
  { provinceId: '3', code: '03', name: 'La Unión' },
  { provinceId: '3', code: '04', name: 'Jiménez' },
  { provinceId: '3', code: '05', name: 'Turrialba' },
  { provinceId: '3', code: '06', name: 'Alvarado' },
  { provinceId: '3', code: '07', name: 'Oreamuno' },
  { provinceId: '3', code: '08', name: 'El Guarco' },

  // Heredia (4)
  { provinceId: '4', code: '01', name: 'Heredia' },
  { provinceId: '4', code: '02', name: 'Barva' },
  { provinceId: '4', code: '03', name: 'Santo Domingo' },
  { provinceId: '4', code: '04', name: 'Santa Bárbara' },
  { provinceId: '4', code: '05', name: 'San Rafael' },
  { provinceId: '4', code: '06', name: 'San Isidro' },
  { provinceId: '4', code: '07', name: 'Belén' },
  { provinceId: '4', code: '08', name: 'Flores' },
  { provinceId: '4', code: '09', name: 'San Pablo' },
  { provinceId: '4', code: '10', name: 'Sarapiquí' },

  // Guanacaste (5)
  { provinceId: '5', code: '01', name: 'Liberia' },
  { provinceId: '5', code: '02', name: 'Nicoya' },
  { provinceId: '5', code: '03', name: 'Santa Cruz' },
  { provinceId: '5', code: '04', name: 'Bagaces' },
  { provinceId: '5', code: '05', name: 'Carrillo' },
  { provinceId: '5', code: '06', name: 'Cañas' },
  { provinceId: '5', code: '07', name: 'Abangares' },
  { provinceId: '5', code: '08', name: 'Tilarán' },
  { provinceId: '5', code: '09', name: 'Nandayure' },
  { provinceId: '5', code: '10', name: 'La Cruz' },
  { provinceId: '5', code: '11', name: 'Hojancha' },

  // Puntarenas (6)
  { provinceId: '6', code: '01', name: 'Puntarenas' },
  { provinceId: '6', code: '02', name: 'Esparza' },
  { provinceId: '6', code: '03', name: 'Buenos Aires' },
  { provinceId: '6', code: '04', name: 'Montes de Oro' },
  { provinceId: '6', code: '05', name: 'Osa' },
  { provinceId: '6', code: '06', name: 'Quepos' },
  { provinceId: '6', code: '07', name: 'Golfito' },
  { provinceId: '6', code: '08', name: 'Coto Brus' },
  { provinceId: '6', code: '09', name: 'Parrita' },
  { provinceId: '6', code: '10', name: 'Corredores' },
  { provinceId: '6', code: '11', name: 'Garabito' },
  { provinceId: '6', code: '12', name: 'Monteverde' },
  { provinceId: '6', code: '13', name: 'Puerto Jiménez' },

  // Limón (7)
  { provinceId: '7', code: '01', name: 'Limón' },
  { provinceId: '7', code: '02', name: 'Pococí' },
  { provinceId: '7', code: '03', name: 'Siquirres' },
  { provinceId: '7', code: '04', name: 'Talamanca' },
  { provinceId: '7', code: '05', name: 'Matina' },
  { provinceId: '7', code: '06', name: 'Guácimo' }
];

export const COSTA_RICA_DISTRICTS: CostaRicaDistrict[] = [
  // Cartago - Alvarado (06)
  { provinceId: '3', cantonCode: '06', code: '01', name: 'Pacayas' },
  { provinceId: '3', cantonCode: '06', code: '02', name: 'Cervantes' },
  { provinceId: '3', cantonCode: '06', code: '03', name: 'Capellades' },

  // Cartago - Oreamuno (07)
  { provinceId: '3', cantonCode: '07', code: '01', name: 'San Rafael' },
  { provinceId: '3', cantonCode: '07', code: '02', name: 'Cot' },
  { provinceId: '3', cantonCode: '07', code: '03', name: 'Potrero Cerrado' },
  { provinceId: '3', cantonCode: '07', code: '04', name: 'Cipreses' },
  { provinceId: '3', cantonCode: '07', code: '05', name: 'Santa Rosa' },

  // Cartago - Cartago (01)
  { provinceId: '3', cantonCode: '01', code: '01', name: 'Oriental' },
  { provinceId: '3', cantonCode: '01', code: '02', name: 'Occidental' },
  { provinceId: '3', cantonCode: '01', code: '03', name: 'Carmen' },
  { provinceId: '3', cantonCode: '01', code: '04', name: 'San Nicolás' },
  { provinceId: '3', cantonCode: '01', code: '05', name: 'Aguacaliente' },
  { provinceId: '3', cantonCode: '01', code: '06', name: 'Guadalupe' },
  { provinceId: '3', cantonCode: '01', code: '07', name: 'Corralillo' },
  { provinceId: '3', cantonCode: '01', code: '08', name: 'Tierra Blanca' },
  { provinceId: '3', cantonCode: '01', code: '09', name: 'Dulce Nombre' },
  { provinceId: '3', cantonCode: '01', code: '10', name: 'Llano Grande' },
  { provinceId: '3', cantonCode: '01', code: '11', name: 'Quebradilla' },

  // Cartago - Paraíso (02)
  { provinceId: '3', cantonCode: '02', code: '01', name: 'Paraíso' },
  { provinceId: '3', cantonCode: '02', code: '02', name: 'Santiago' },
  { provinceId: '3', cantonCode: '02', code: '03', name: 'Orosi' },
  { provinceId: '3', cantonCode: '02', code: '04', name: 'Cachí' },
  { provinceId: '3', cantonCode: '02', code: '05', name: 'Llanos de Santa Lucía' },

  // San José - San José (01)
  { provinceId: '1', cantonCode: '01', code: '01', name: 'Carmen' },
  { provinceId: '1', cantonCode: '01', code: '02', name: 'Merced' },
  { provinceId: '1', cantonCode: '01', code: '03', name: 'Hospital' },
  { provinceId: '1', cantonCode: '01', code: '04', name: 'Catedral' },
  { provinceId: '1', cantonCode: '01', code: '05', name: 'Zapote' },
  { provinceId: '1', cantonCode: '01', code: '06', name: 'San Francisco de Dos Ríos' },
  { provinceId: '1', cantonCode: '01', code: '07', name: 'Uruca' },
  { provinceId: '1', cantonCode: '01', code: '08', name: 'Mata Redonda' },
  { provinceId: '1', cantonCode: '01', code: '09', name: 'Pavas' },
  { provinceId: '1', cantonCode: '01', code: '10', name: 'Hatillo' },
  { provinceId: '1', cantonCode: '01', code: '11', name: 'San Sebastián' },

  // San José - Escazú (02)
  { provinceId: '1', cantonCode: '02', code: '01', name: 'Escazú' },
  { provinceId: '1', cantonCode: '02', code: '02', name: 'San Antonio' },
  { provinceId: '1', cantonCode: '02', code: '03', name: 'San Rafael' },

  // San José - Montes de Oca (15)
  { provinceId: '1', cantonCode: '15', code: '01', name: 'San Pedro' },
  { provinceId: '1', cantonCode: '15', code: '02', name: 'Sabanilla' },
  { provinceId: '1', cantonCode: '15', code: '03', name: 'Mercedes' },
  { provinceId: '1', cantonCode: '15', code: '04', name: 'San Rafael' },

  // Alajuela - Alajuela (01)
  { provinceId: '2', cantonCode: '01', code: '01', name: 'Alajuela' },
  { provinceId: '2', cantonCode: '01', code: '02', name: 'San José' },
  { provinceId: '2', cantonCode: '01', code: '03', name: 'Carrizal' },
  { provinceId: '2', cantonCode: '01', code: '04', name: 'San Antonio' },
  { provinceId: '2', cantonCode: '01', code: '05', name: 'Guácima' },
  { provinceId: '2', cantonCode: '01', code: '06', name: 'San Isidro' },
  { provinceId: '2', cantonCode: '01', code: '07', name: 'Sabanilla' },
  { provinceId: '2', cantonCode: '01', code: '08', name: 'San Rafael' },
  { provinceId: '2', cantonCode: '01', code: '09', name: 'Río Segundo' },
  { provinceId: '2', cantonCode: '01', code: '10', name: 'Desamparados' },
  { provinceId: '2', cantonCode: '01', code: '11', name: 'Turrúcares' },
  { provinceId: '2', cantonCode: '01', code: '12', name: 'Tambor' },
  { provinceId: '2', cantonCode: '01', code: '13', name: 'Garita' },
  { provinceId: '2', cantonCode: '01', code: '14', name: 'Sarapiquí' },

  // Heredia - Heredia (01)
  { provinceId: '4', cantonCode: '01', code: '01', name: 'Heredia' },
  { provinceId: '4', cantonCode: '01', code: '02', name: 'Mercedes' },
  { provinceId: '4', cantonCode: '01', code: '03', name: 'San Francisco' },
  { provinceId: '4', cantonCode: '01', code: '04', name: 'Ulloa' },
  { provinceId: '4', cantonCode: '01', code: '05', name: 'Varablanca' },

  // Heredia - Barva (02)
  { provinceId: '4', cantonCode: '02', code: '01', name: 'Barva' },
  { provinceId: '4', cantonCode: '02', code: '02', name: 'San Pedro' },
  { provinceId: '4', cantonCode: '02', code: '03', name: 'San Pablo' },

  // Heredia - Santo Domingo (03)
  { provinceId: '4', cantonCode: '03', code: '01', name: 'Santo Domingo' },
  { provinceId: '4', cantonCode: '03', code: '02', name: 'San Vicente' },

  // Guanacaste - Liberia (01)
  { provinceId: '5', cantonCode: '01', code: '01', name: 'Liberia' },
  { provinceId: '5', cantonCode: '01', code: '02', name: 'Cañas Dulces' },
  { provinceId: '5', cantonCode: '01', code: '03', name: 'Mayorga' },
  { provinceId: '5', cantonCode: '01', code: '04', name: 'Nacascolo' },
  { provinceId: '5', cantonCode: '01', code: '05', name: 'Curubandé' },

  // Guanacaste - Nicoya (02)
  { provinceId: '5', cantonCode: '02', code: '01', name: 'Nicoya' },
  { provinceId: '5', cantonCode: '02', code: '02', name: 'Mansión' },
  { provinceId: '5', cantonCode: '02', code: '03', name: 'San Antonio' },

  // Puntarenas - Puntarenas (01)
  { provinceId: '6', cantonCode: '01', code: '01', name: 'Puntarenas' },
  { provinceId: '6', cantonCode: '01', code: '02', name: 'Pitahaya' },
  { provinceId: '6', cantonCode: '01', code: '03', name: 'Chomes' },
  { provinceId: '6', cantonCode: '01', code: '04', name: 'Lepanto' },
  { provinceId: '6', cantonCode: '01', code: '05', name: 'Paquera' },
  { provinceId: '6', cantonCode: '01', code: '06', name: 'Manzanillo' },
  { provinceId: '6', cantonCode: '01', code: '07', name: 'Guacimal' },
  { provinceId: '6', cantonCode: '01', code: '08', name: 'Barranca' },
  { provinceId: '6', cantonCode: '01', code: '09', name: 'Monteverde' },
  { provinceId: '6', cantonCode: '01', code: '10', name: 'Isla del Coco' },
  { provinceId: '6', cantonCode: '01', code: '11', name: 'Cóbano' },
  { provinceId: '6', cantonCode: '01', code: '12', name: 'Chacarita' },

  // Puntarenas - Quepos (06)
  { provinceId: '6', cantonCode: '06', code: '01', name: 'Quepos' },
  { provinceId: '6', cantonCode: '06', code: '02', name: 'Savegre' },
  { provinceId: '6', cantonCode: '06', code: '03', name: 'Naranjito' },

  // Limón - Limón (01)
  { provinceId: '7', cantonCode: '01', code: '01', name: 'Limón' },
  { provinceId: '7', cantonCode: '01', code: '02', name: 'Valle La Estrella' },
  { provinceId: '7', cantonCode: '01', code: '03', name: 'Río Blanco' },
  { provinceId: '7', cantonCode: '01', code: '04', name: 'Matama' },

  // Limón - Pococí (02)
  { provinceId: '7', cantonCode: '02', code: '01', name: 'Guápiles' },
  { provinceId: '7', cantonCode: '02', code: '02', name: 'Jiménez' },
  { provinceId: '7', cantonCode: '02', code: '03', name: 'Rita' },
  { provinceId: '7', cantonCode: '02', code: '04', name: 'Roxana' },
  { provinceId: '7', cantonCode: '02', code: '05', name: 'Cariari' },
  { provinceId: '7', cantonCode: '02', code: '06', name: 'Colorado' },
  { provinceId: '7', cantonCode: '02', code: '07', name: 'La Colonia' }
];

export function getDistrictsForCanton(provinceId: string, cantonCode: string): CostaRicaDistrict[] {
  const found = COSTA_RICA_DISTRICTS.filter(d => d.provinceId === provinceId && d.cantonCode === cantonCode);
  if (found.length > 0) return found;
  
  // Si es un cantón sin distritos pre-cargados específicos, proveer distritos por defecto del cantón
  const cantonObj = COSTA_RICA_CANTONS.find(c => c.provinceId === provinceId && c.code === cantonCode);
  const name = cantonObj ? cantonObj.name : 'Central';
  return [
    { provinceId, cantonCode, code: '01', name: `${name} (Central)` },
    { provinceId, cantonCode, code: '02', name: 'Distrito 2' }
  ];
}

export const COMMON_RECEIVER_ACTIVITIES = [
  { code: '5610.0', description: 'Actividades de restaurantes y de servicio móvil de comidas' },
  { code: '620101', description: 'Actividades de desarrollo de sistemas informáticos y software' },
  { code: '620201', description: 'Actividades de consultoría de informática y de gestión de instalaciones' },
  { code: '692001', description: 'Actividades de contabilidad, teneduría de libros y auditoría; asesoramiento tributario' },
  { code: '691001', description: 'Actividades jurídicas y notariales' },
  { code: '702001', description: 'Actividades de asesoramiento empresarial y en materia de gestión' },
  { code: '711001', description: 'Servicios de arquitectura y de ingeniería y actividades conexas' },
  { code: '862001', description: 'Actividades de médicos y odontólogos' },
  { code: '471101', description: 'Venta al por menor en comercios no especializados con surtido compuesto por alimentos' },
  { code: '492301', description: 'Transporte de carga por carretera' },
  { code: '452001', description: 'Mantenimiento y reparación de vehículos de motor' },
  { code: '551001', description: 'Actividades de alojamiento para estancias cortas (hoteles, cabinas)' },
  { code: '854901', description: 'Otros tipos de enseñanza' },
  { code: '960201', description: 'Peluquería y otros tratamientos de belleza' },
  { code: '011901', description: 'Cultivo de otros productos agrícolas no clasificados' }
];
