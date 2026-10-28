/**
 * Utilidades de fecha y hora ajustadas a la zona horaria oficial de Costa Rica (America/Costa_Rica, UTC-6).
 * Resuelve de forma definitiva el desfasaje de 6 horas de toISOString() que causaba
 * que las ventas nocturnas (a partir de las 6:00 p.m.) se registraran o contaran en el día siguiente.
 */

export const COSTA_RICA_TIMEZONE = 'America/Costa_Rica';

/**
 * Obtiene la fecha en formato YYYY-MM-DD según la hora oficial de Costa Rica.
 */
export function getCostaRicaDate(dateInput: Date | string | number = new Date()): string {
  try {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) {
      return new Date().toLocaleDateString('en-CA', { timeZone: COSTA_RICA_TIMEZONE });
    }
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: COSTA_RICA_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  } catch (err) {
    return new Date().toLocaleDateString('en-CA', { timeZone: COSTA_RICA_TIMEZONE });
  }
}

/**
 * Obtiene la hora en formato HH:MM:SS (24 horas) según la hora oficial de Costa Rica.
 */
export function getCostaRicaTime(dateInput: Date | string | number = new Date()): string {
  try {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) {
      return '00:00:00';
    }
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: COSTA_RICA_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(d);
  } catch (err) {
    return '00:00:00';
  }
}

/**
 * Retorna fecha y hora combinada en formato oficial de Hacienda: YYYY-MM-DDTHH:MM:SS-06:00
 */
export function getCostaRicaISOString(dateInput: Date | string | number = new Date()): string {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const dateStr = getCostaRicaDate(d);
  const timeStr = getCostaRicaTime(d);
  return `${dateStr}T${timeStr}-06:00`;
}

/**
 * Formatea una fecha a formato estándar latinoamericano: DD/MM/YYYY
 */
export function formatCostaRicaDisplayDate(dateInput: Date | string | number): string {
  try {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('es-CR', {
      timeZone: COSTA_RICA_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(d);
  } catch {
    return String(dateInput);
  }
}

/**
 * Verifica si dos fechas o marcas de tiempo corresponden al mismo día en Costa Rica.
 */
export function isSameCostaRicaDay(
  dateA: Date | string | number,
  dateB: Date | string | number = new Date()
): boolean {
  return getCostaRicaDate(dateA) === getCostaRicaDate(dateB);
}
