export function impactFeedback(onScreen: boolean, reducedMotion: boolean) {
  return {
    shake: onScreen ? (reducedMotion ? .1 : .6) : (reducedMotion ? .012 : .075),
    flash: onScreen ? .32 : 0,
    hitStop: onScreen ? .052 : 0,
    slowMotion: onScreen ? .16 : 0,
    volume: onScreen ? 1 : .18,
  };
}

function fadeIn(speed: number, start: number, end: number) {
  const t = Math.max(0, Math.min(1, (speed - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function speedEffectProfile(speed: number) {
  return {
    glow: fadeIn(speed, 65, 125),
    wake: fadeIn(speed, 100, 165),
    shock: fadeIn(speed, 145, 205),
    flare: fadeIn(speed, 185, 255),
  };
}
