// Retarget from each row's current visual position, even when another ranking
// update arrives before the previous move has finished.
export class RankingMotion {
  private animations = new Map<HTMLElement, Animation>();
  constructor(private list: HTMLOListElement, private reducedMotion: boolean) {}

  reorder(rows: HTMLLIElement[], animate: boolean) {
    if (rows.every((row, index) => this.list.children[index] === row)) return;
    const positions = new Map(rows.map(row => [row, row.getBoundingClientRect().top]));
    const scrollTop = this.list.scrollTop;
    this.clear();
    this.list.append(...rows);
    this.list.scrollTop = scrollTop;
    if (!animate || this.reducedMotion) return;

    // Batch layout reads before starting any new animations.
    const offsets = rows.map(row => ({ row, delta: positions.get(row)! - row.getBoundingClientRect().top }));
    for (const { row, delta } of offsets) {
      if (Math.abs(delta) < .5) continue;
      row.style.zIndex = delta > 0 ? '3' : '2';
      row.dataset.rankMotion = delta > 0 ? 'up' : 'down';
      const animation = row.animate(
        [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
        { duration: 560, easing: 'cubic-bezier(.22, 1, .36, 1)' },
      );
      this.animations.set(row, animation);
      animation.onfinish = () => {
        if (this.animations.get(row) !== animation) return;
        this.animations.delete(row);
        row.style.removeProperty('z-index');
        delete row.dataset.rankMotion;
      };
    }
  }

  clear() {
    for (const [row, animation] of this.animations) {
      animation.cancel();
      row.style.removeProperty('z-index');
      delete row.dataset.rankMotion;
    }
    this.animations.clear();
  }
}
