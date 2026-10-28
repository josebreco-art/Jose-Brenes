import { safeStorage } from './safeStorage';
import { getCostaRicaDate, getCostaRicaTime, COSTA_RICA_TIMEZONE } from './dateUtils';

declare const __APP_BUILD_TIMESTAMP__: string | undefined;

/**
 * Claves en almacenamiento seguro para control de versión instalada y actualización activa
 */
const STORAGE_KEY_INSTALL_TIME = 'POS_SABOR_CERVANTENO_INSTALL_DATE';
const STORAGE_KEY_LAST_BUILD = 'POS_SABOR_CERVANTENO_LAST_BUILD';

/**
 * Obtiene la fecha y hora de la versión/actualización activa en el sistema.
 * Si se detecta un nuevo despliegue o compilación, actualiza automáticamente el almacenamiento
 * local reflejando de inmediato los datos más recientes.
 */
export function getInstalledDateTime(): Date {
  const currentBuildStr = typeof __APP_BUILD_TIMESTAMP__ !== 'undefined' && __APP_BUILD_TIMESTAMP__
    ? __APP_BUILD_TIMESTAMP__
    : new Date().toISOString();

  try {
    const lastRecordedBuild = safeStorage.getItem(STORAGE_KEY_LAST_BUILD);
    const savedInstallTime = safeStorage.getItem(STORAGE_KEY_INSTALL_TIME);

    // Si la versión o compilación actual es diferente a la registrada previamente,
    // actualizamos automáticamente a los datos más recientes de esta actualización
    if (!lastRecordedBuild || lastRecordedBuild !== currentBuildStr) {
      safeStorage.setItem(STORAGE_KEY_LAST_BUILD, currentBuildStr);
      safeStorage.setItem(STORAGE_KEY_INSTALL_TIME, currentBuildStr);
      return new Date(currentBuildStr);
    }

    if (savedInstallTime) {
      const savedDate = new Date(savedInstallTime);
      if (!isNaN(savedDate.getTime())) {
        return savedDate;
      }
    }
  } catch {
    // Si ocurre un error de lectura de storage, se utiliza la marca de compilación actual
  }

  return new Date(currentBuildStr);
}

/**
 * Genera el identificador de versión estructurado a partir de la fecha y hora oficial de Costa Rica.
 * Ejemplo: "v2026.09.16_18:47:00"
 */
export function getInstalledVersionName(date: Date = getInstalledDateTime()): string {
  try {
    const dateStr = getCostaRicaDate(date).replace(/-/g, '.');
    const timeStr = getCostaRicaTime(date);
    return `v${dateStr}_${timeStr}`;
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `v${year}.${month}.${day}_${hours}:${minutes}:${seconds}`;
  }
}

/**
 * Formatea la fecha y hora de instalación de forma legible para el usuario en español
 * según la hora oficial de Costa Rica (CST, UTC-6).
 * Ejemplo: "mié, 16 sept 2026, 06:47:00 p. m."
 */
export function formatInstalledDateTime(date: Date = getInstalledDateTime()): string {
  try {
    return date.toLocaleString('es-CR', {
      timeZone: COSTA_RICA_TIMEZONE,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  } catch {
    return date.toLocaleString('es-CR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }
}
