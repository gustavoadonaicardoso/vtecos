'use client';

// Toca um som curto de duas notas (tipo "ping") via Web Audio API --
// sem depender de arquivo de áudio externo (nem de rede) pra tocar o
// aviso de mensagem nova.
export function playNotificationSound() {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const playTone = (frequency: number, startAt: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + startAt);
      gain.gain.linearRampToValueAtTime(0.2, now + startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startAt + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + startAt);
      oscillator.stop(now + startAt + duration);
    };

    playTone(880, 0, 0.15);
    playTone(1175, 0.12, 0.2);

    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {
    // Navegador pode bloquear áudio sem interação prévia do usuário --
    // silenciosamente ignora, o pop-up visual ainda aparece.
  }
}
