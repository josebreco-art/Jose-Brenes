/**
 * Formateador seguro de montos en Colones Costarricenses (CRC ₡) y fechas
 * Previene errores de tipo "Cannot read properties of undefined (reading 'toLocaleString')"
 */

export function formatCRC(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return '0';
  }
  return Number(amount).toLocaleString('es-CR');
}

export function formatCRCWithSymbol(amount: number | null | undefined): string {
  return `₡${formatCRC(amount)}`;
}

export function formatFiscalDate(dateString: string | null | undefined): string {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    return d.toLocaleString('es-CR');
  } catch {
    return String(dateString);
  }
}

export function formatFiscalTime(timeString: string | null | undefined): string {
  if (!timeString) return '';
  try {
    const d = new Date(timeString);
    if (isNaN(d.getTime())) return String(timeString);
    return d.toLocaleTimeString('es-CR');
  } catch {
    return String(timeString);
  }
}
