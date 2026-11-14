type Subject = { index: number; launched: boolean; done: boolean };
export const MAX_SHOT_SECONDS = 3.64;

// Selection is independent of scores and physics. Every active ball gets a
// turn before an already-seen ball is selected again.
export class CameraDirector {
  private current = -1;
  private remaining = 0;
  private visits = new Map<number, number>();
  shot = -1;
  constructor(private seed = 0, private reducedMotion = false) {}

  reset(seed: number) {
    this.seed = seed; this.current = -1; this.remaining = 0;
    this.visits.clear(); this.shot = -1;
  }

  update<T extends Subject>(dt: number, subjects: T[]): T | null {
    const active = subjects.filter(subject => subject.launched && !subject.done);
    if (!active.length) { this.current = -1; return null; }
    this.remaining -= dt;
    const current = active.find(subject => subject.index === this.current);
    if (current && (this.remaining > 0 || active.length === 1)) return current;
    const candidates = active.filter(subject => subject.index !== this.current);
    const pool = candidates.length ? candidates : active;
    pool.sort((a, b) => (this.visits.get(a.index) || 0) - (this.visits.get(b.index) || 0) || this.order(a.index) - this.order(b.index));
    const selected = pool[0];
    this.current = selected.index; this.shot++;
    this.visits.set(selected.index, (this.visits.get(selected.index) || 0) + 1);
    const randomDuration = this.order(this.shot + 8191) / 0xffffffff;
    // Favor quick cuts while occasionally holding a shot up to the old limit.
    // Seeded timing is independent of scores and never affects the simulation.
    this.remaining = this.reducedMotion
      ? 1.8 + (4.3 - 1.8) * Math.pow(randomDuration, 1.35)
      : 1.05 + (MAX_SHOT_SECONDS - 1.05) * Math.pow(randomDuration, 1.7);
    return selected;
  }

  private order(index: number) {
    let hash = (this.seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
    return (hash ^ (hash >>> 13)) >>> 0;
  }
}
