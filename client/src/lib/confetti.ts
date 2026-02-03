import confetti from 'canvas-confetti';

// Gunner-themed cannon burst celebration
// Fires confetti from both sides like celebratory cannons

export function fireCannons() {
  const duration = 2000;
  const colors = ['#f97316', '#fb923c', '#fdba74', '#fcd34d', '#fbbf24']; // Orange/gold theme matching Gunner

  // Left cannon
  confetti({
    particleCount: 80,
    angle: 60,
    spread: 55,
    origin: { x: 0, y: 0.6 },
    colors: colors,
    startVelocity: 45,
    gravity: 1.2,
    scalar: 1.2,
    drift: 0,
    ticks: 200,
  });

  // Right cannon
  confetti({
    particleCount: 80,
    angle: 120,
    spread: 55,
    origin: { x: 1, y: 0.6 },
    colors: colors,
    startVelocity: 45,
    gravity: 1.2,
    scalar: 1.2,
    drift: 0,
    ticks: 200,
  });

  // Delayed second burst for extra impact
  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.7 },
      colors: colors,
      startVelocity: 35,
      gravity: 1,
      scalar: 1,
    });

    confetti({
      particleCount: 50,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.7 },
      colors: colors,
      startVelocity: 35,
      gravity: 1,
      scalar: 1,
    });
  }, 250);
}

// Badge unlock celebration - more intense cannon fire
export function celebrateBadgeUnlock() {
  const colors = ['#f97316', '#fb923c', '#fdba74', '#fbbf24', '#a855f7', '#8b5cf6']; // Orange + purple for badges

  // Initial powerful burst from both sides
  confetti({
    particleCount: 100,
    angle: 60,
    spread: 60,
    origin: { x: 0, y: 0.5 },
    colors: colors,
    startVelocity: 55,
    gravity: 1,
    scalar: 1.3,
    shapes: ['circle', 'square'],
    ticks: 250,
  });

  confetti({
    particleCount: 100,
    angle: 120,
    spread: 60,
    origin: { x: 1, y: 0.5 },
    colors: colors,
    startVelocity: 55,
    gravity: 1,
    scalar: 1.3,
    shapes: ['circle', 'square'],
    ticks: 250,
  });

  // Center burst with stars
  setTimeout(() => {
    confetti({
      particleCount: 60,
      angle: 90,
      spread: 100,
      origin: { x: 0.5, y: 0.6 },
      colors: ['#fbbf24', '#f59e0b', '#d97706'],
      startVelocity: 40,
      gravity: 0.8,
      scalar: 1.5,
      shapes: ['star'],
      ticks: 200,
    });
  }, 150);

  // Final side bursts
  setTimeout(() => {
    confetti({
      particleCount: 40,
      angle: 55,
      spread: 50,
      origin: { x: 0.1, y: 0.6 },
      colors: colors,
      startVelocity: 40,
    });

    confetti({
      particleCount: 40,
      angle: 125,
      spread: 50,
      origin: { x: 0.9, y: 0.6 },
      colors: colors,
      startVelocity: 40,
    });
  }, 300);
}

// Level up celebration - even more epic
export function celebrateLevelUp() {
  const end = Date.now() + 1500;
  const colors = ['#f97316', '#fbbf24', '#a855f7'];

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: Math.random() * 0.5 + 0.3 },
      colors: colors,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: Math.random() * 0.5 + 0.3 },
      colors: colors,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
}
