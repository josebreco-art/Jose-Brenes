export function getCostaRicaDate(): string {
  // Retorna fecha actual en zona de Costa Rica (YYYY-MM-DD)
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  };
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(now);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export function getCostaRicaTime(): string {
  const now = new Date();
  return now.toLocaleTimeString('es-CR', {
    timeZone: 'America/Costa_Rica',
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function getCostaRicaISO(): string {
  const now = new Date();
  const offset = -6 * 60; // Costa Rica is UTC-6
  const localDate = new Date(now.getTime() + (offset + now.getTimezoneOffset()) * 60000);
  return localDate.toISOString().replace('Z', '-06:00');
}
