// División Territorial Administrativa Oficial de Costa Rica (DGT / Ministerio de Hacienda v4.4)
// Estructura requerida: Provincia (1 dígito), Cantón (2 dígitos), Distrito (2 dígitos)

export interface Province {
  id: string; // '1'..'7'
  name: string;
}

export interface Canton {
  provinceId: string; // '1'..'7'
  code: string;       // '01'..'99'
  name: string;
}

export interface District {
  provinceId: string; // '1'..'7'
  cantonCode: string; // '01'..'99'
  code: string;       // '01'..'99'
  name: string;
}

export const COSTA_RICA_PROVINCES: Province[] = [
  { id: '1', name: 'San José' },
  { id: '2', name: 'Alajuela' },
  { id: '3', name: 'Cartago' },
  { id: '4', name: 'Heredia' },
  { id: '5', name: 'Guanacaste' },
  { id: '6', name: 'Puntarenas' },
  { id: '7', name: 'Limón' }
];

export const COSTA_RICA_CANTONS: Canton[] = [
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

export const COSTA_RICA_DISTRICTS: District[] = [
  // Cartago (3) - Cantón Alvarado (06) [Ubicación de Pollo Frito Sabor Cervanteño]
  { provinceId: '3', cantonCode: '06', code: '01', name: 'Pacayas' },
  { provinceId: '3', cantonCode: '06', code: '02', name: 'Cervantes' },
  { provinceId: '3', cantonCode: '06', code: '03', name: 'Capellades' },

  // Cartago (3) - Cantón Cartago (01)
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

  // Cartago (3) - Cantón Paraíso (02)
  { provinceId: '3', cantonCode: '02', code: '01', name: 'Paraíso' },
  { provinceId: '3', cantonCode: '02', code: '02', name: 'Santiago' },
  { provinceId: '3', cantonCode: '02', code: '03', name: 'Orosi' },
  { provinceId: '3', cantonCode: '02', code: '04', name: 'Cachí' },
  { provinceId: '3', cantonCode: '02', code: '05', name: 'Llanos de Santa Lucía' },
  { provinceId: '3', cantonCode: '02', code: '06', name: 'Birrisito' },

  // Cartago (3) - Cantón La Unión (03)
  { provinceId: '3', cantonCode: '03', code: '01', name: 'Tres Ríos' },
  { provinceId: '3', cantonCode: '03', code: '02', name: 'San Diego' },
  { provinceId: '3', cantonCode: '03', code: '03', name: 'San Juan' },
  { provinceId: '3', cantonCode: '03', code: '04', name: 'San Rafael' },
  { provinceId: '3', cantonCode: '03', code: '05', name: 'Concepción' },
  { provinceId: '3', cantonCode: '03', code: '06', name: 'Dulce Nombre' },
  { provinceId: '3', cantonCode: '03', code: '07', name: 'San Ramón' },
  { provinceId: '3', cantonCode: '03', code: '08', name: 'Río Azul' },

  // Cartago (3) - Cantón Jiménez (04)
  { provinceId: '3', cantonCode: '04', code: '01', name: 'Juan Viñas' },
  { provinceId: '3', cantonCode: '04', code: '02', name: 'Tucurrique' },
  { provinceId: '3', cantonCode: '04', code: '03', name: 'Pejibaye' },
  { provinceId: '3', cantonCode: '04', code: '04', name: 'La Victoria' },

  // Cartago (3) - Cantón Turrialba (05)
  { provinceId: '3', cantonCode: '05', code: '01', name: 'Turrialba' },
  { provinceId: '3', cantonCode: '05', code: '02', name: 'La Suiza' },
  { provinceId: '3', cantonCode: '05', code: '03', name: 'Peralta' },
  { provinceId: '3', cantonCode: '05', code: '04', name: 'Santa Cruz' },
  { provinceId: '3', cantonCode: '05', code: '05', name: 'Santa Teresita' },
  { provinceId: '3', cantonCode: '05', code: '06', name: 'Pavones' },
  { provinceId: '3', cantonCode: '05', code: '07', name: 'Tuis' },
  { provinceId: '3', cantonCode: '05', code: '08', name: 'Tayutic' },
  { provinceId: '3', cantonCode: '05', code: '09', name: 'Santa Rosa' },
  { provinceId: '3', cantonCode: '05', code: '10', name: 'Tres Equis' },
  { provinceId: '3', cantonCode: '05', code: '11', name: 'La Isabel' },
  { provinceId: '3', cantonCode: '05', code: '12', name: 'Chirripó' },

  // Cartago (3) - Cantón Oreamuno (07)
  { provinceId: '3', cantonCode: '07', code: '01', name: 'San Rafael' },
  { provinceId: '3', cantonCode: '07', code: '02', name: 'Cot' },
  { provinceId: '3', cantonCode: '07', code: '03', name: 'Potrero Cerrado' },
  { provinceId: '3', cantonCode: '07', code: '04', name: 'Cipreses' },
  { provinceId: '3', cantonCode: '07', code: '05', name: 'Santa Rosa' },

  // Cartago (3) - Cantón El Guarco (08)
  { provinceId: '3', cantonCode: '08', code: '01', name: 'El Tejar' },
  { provinceId: '3', cantonCode: '08', code: '02', name: 'San Isidro' },
  { provinceId: '3', cantonCode: '08', code: '03', name: 'Tobosi' },
  { provinceId: '3', cantonCode: '08', code: '04', name: 'Patio de Agua' },

  // San José (1) - Cantón San José (01)
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

  // Alajuela (2) - Cantón Alajuela (01)
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

  // Heredia (4) - Cantón Heredia (01)
  { provinceId: '4', cantonCode: '01', code: '01', name: 'Heredia' },
  { provinceId: '4', cantonCode: '01', code: '02', name: 'Mercedes' },
  { provinceId: '4', cantonCode: '01', code: '03', name: 'San Francisco' },
  { provinceId: '4', cantonCode: '01', code: '04', name: 'Ulloa' },
  { provinceId: '4', cantonCode: '01', code: '05', name: 'Varablanca' }
];

export function getDistrictsForCanton(provinceId: string, cantonCode: string): District[] {
  const normProvince = String(provinceId || '').trim();
  const normCanton = String(cantonCode || '').trim().padStart(2, '0');
  return COSTA_RICA_DISTRICTS.filter(d => 
    d.provinceId === normProvince && d.cantonCode === normCanton
  );
}
