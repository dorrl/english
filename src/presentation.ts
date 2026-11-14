export function impactFeedback(onScreen: boolean, reducedMotion: boolean) {
  return {
    shake: onScreen ? (reducedMotion ? .1 : .6) : (reducedMotion ? .012 : .075),
    flash: onScreen ? .32 : 0,
    hitStop: onScreen ? .052 : 0,
    slowMotion: onScreen ? .16 : 0,
    volume: onScreen ? 1 : .18,
  };
}
