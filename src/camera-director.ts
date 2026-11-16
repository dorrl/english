type Subject = { index: number; launched: boolean; done: boolean; score?: number };
export const MAX_SHOT_SECONDS = 6.4;
export const SCORE_WINDOW_SECONDS = 3;
type Sample = { time: number; score: number };

// The director only observes scores. It never advances or changes physics.
export class CameraDirector {
  private current = -1;
  private remaining = 0;
  private visits = new Map<number, number>();
  private history = new Map<number, Sample[]>();
  private hotUntil = new Map<number, number>();
  private time = 0;
  private waiting: number[] = [];
  get waitingList(): readonly number[] { return [...this.waiting]; }
  shot = -1;
  constructor(private seed = 0, private reducedMotion = false) {}

  reset(seed: number) {
    this.seed = seed; this.current = -1; this.remaining = 0;
    this.visits.clear(); this.history.clear(); this.hotUntil.clear(); this.waiting = []; this.time = 0; this.shot = -1;
  }

  update<T extends Subject>(dt: number, subjects: T[], readScore: (subject: T) => number = subject => subject.score ?? 0): T | null {
    const active = subjects.filter(subject => subject.launched && !subject.done);
    if (!active.length) { this.current = -1; this.waiting = []; this.history.clear(); this.hotUntil.clear(); return null; }
    this.time += Math.max(0, dt);
    const scores = new Map(active.map(subject => [subject.index, readScore(subject)]));
    const rates = new Map<number, number>();
    const activeIds = new Set(active.map(subject => subject.index));
    for (const index of this.history.keys()) if (!activeIds.has(index)) this.history.delete(index);
    for (const subject of active) {
      const score = scores.get(subject.index)!;
      let samples = this.history.get(subject.index);
      if (!samples || this.time - samples[samples.length - 1].time > SCORE_WINDOW_SECONDS) {
        samples = [{ time: this.time, score }]; this.history.set(subject.index, samples);
      }
      const last = samples[samples.length - 1];
      if (this.time - last.time >= .2) samples.push({ time: this.time, score });
      while (samples.length > 1 && samples[1].time <= this.time - SCORE_WINDOW_SECONDS) samples.shift();
      rates.set(subject.index, Math.max(0, score - samples[0].score) / Math.max(.5, this.time - samples[0].time));
    }
    const sortedRates = [...rates.values()].sort((a, b) => a - b);
    const hotThreshold = Math.max(180, sortedRates[Math.floor(sortedRates.length / 2)] * 1.65);
    for (const subject of active) {
      if (rates.get(subject.index)! >= hotThreshold) this.hotUntil.set(subject.index, this.time + MAX_SHOT_SECONDS + .5);
    }
    for (const [index, until] of this.hotUntil) if (!activeIds.has(index) || until <= this.time) this.hotUntil.delete(index);
    const topCount = Math.max(1, Math.ceil(active.length * .2));
    const byScore = [...active].sort((a, b) => scores.get(b.index)! - scores.get(a.index)! || a.index - b.index);
    const hot = [...active].filter(subject => this.hotUntil.has(subject.index))
      .sort((a, b) => rates.get(b.index)! - rates.get(a.index)! || a.index - b.index).slice(0, topCount);
    const hotIds = new Set(hot.map(subject => subject.index));
    const eligibleIds = new Set([...byScore.slice(0, topCount), ...hot].map(subject => subject.index));
    // During the opening tie there is no meaningful leader yet.
    const eligible = byScore.every(subject => scores.get(subject.index) === 0) ? active : active.filter(subject => eligibleIds.has(subject.index));
    this.waiting = eligible.map(subject => subject.index);
    this.remaining -= dt;
    const current = active.find(subject => subject.index === this.current);
    if (current && (this.remaining > 0 || active.length === 1)) return current;
    const candidates = eligible.filter(subject => subject.index !== this.current);
    // A one-person shortlist still cuts elsewhere before returning, rather
    // than keeping the leader on screen forever in a two-student round.
    const pool = candidates.length ? candidates : active.filter(subject => subject.index !== this.current);
    if (!pool.length) pool.push(active[0]);
    pool.sort((a, b) => Number(hotIds.has(b.index)) - Number(hotIds.has(a.index)) || (this.visits.get(a.index) || 0) - (this.visits.get(b.index) || 0) || this.order(a.index) - this.order(b.index));
    const selected = pool[0];
    // A brief scoring burst stays queued until a camera cut can show it.
    this.hotUntil.delete(selected.index);
    this.current = selected.index; this.shot++;
    this.visits.set(selected.index, (this.visits.get(selected.index) || 0) + 1);
    const randomDuration = this.order(this.shot + 8191) / 0xffffffff;
    // Give each flight time to read while retaining unpredictable shot timing.
    // Seeded timing is independent of scores and never affects the simulation.
    this.remaining = this.reducedMotion
      ? 4 + (7.5 - 4) * Math.pow(randomDuration, 1.2)
      : 2.6 + (MAX_SHOT_SECONDS - 2.6) * Math.pow(randomDuration, 1.25);
    return selected;
  }

  private order(index: number) {
    let hash = (this.seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
    return (hash ^ (hash >>> 13)) >>> 0;
  }
}
