/**
 * Campana metálica de servicio de restaurante (Web Audio API)
 * Efecto sonoro: Un golpe de campana brillante y limpio con resonancia armónica.
 * - Tono principal (Oscilador senoidal): Inicia en Re 5 (587.33 Hz) y sube rápidamente a La 5 (880.00 Hz) en 150 ms.
 * - Segundo tono / Armónico (Oscilador triangular): Resuena simultáneamente de La 5 (880.00 Hz) a Re 6 (1174.66 Hz),
 *   otorgando el brillo y cuerpo metálico de una campana física de acero.
 * - Duración: 0.85 segundos con un desvanecimiento suave (fade out exponencial) para no saturar el ambiente.
 */
export function playOrderChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const attackDuration = 0.15; // 150 milisegundos
    const totalDuration = 0.85;  // 0.85 segundos de resonancia
    const stopTime = now + totalDuration;

    // 1. Tono principal: Oscilador senoidal (Re 5: 587.33 Hz -> La 5: 880.00 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    osc1.frequency.exponentialRampToValueAtTime(880.00, now + attackDuration);

    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    // 2. Segundo tono / Armónico: Oscilador triangular (La 5: 880.00 Hz -> Re 6: 1174.66 Hz)
    // Brillo y timbre metálico de campana de acero
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880.00, now);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + attackDuration);

    gain2.gain.setValueAtTime(0.20, now);
    gain2.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    // Iniciar ambos osciladores en simultáneo
    osc1.start(now);
    osc2.start(now);

    // Detener suavemente a los 0.85 segundos
    osc1.stop(stopTime);
    osc2.stop(stopTime);

    // Liberar recursos de audio
    setTimeout(() => {
      try {
        ctx.close().catch(() => {});
      } catch {}
    }, 1200);
  } catch (err) {
    console.warn('Audio chime warning:', err);
  }
}

// Exponer globalmente en window para pruebas y accesibilidad directa
if (typeof window !== 'undefined') {
  (window as any).playOrderChime = playOrderChime;
}
