import type { SpecialEvent, SpecialKind } from './simulation';

export const SPECIAL_STYLE: Record<SpecialKind, { color: number; icon: string; title: string }> = {
  boost: { color: 0x68ecff, icon: '»', title: '스피드 부스트' },
  bonus: { color: 0xffd078, icon: '+', title: '보너스 점수' },
  drain: { color: 0xff83b5, icon: '−', title: '점수 파동' },
  magnet: { color: 0xb49bff, icon: '◎', title: '자석 범위 확대' },
  light: { color: 0x8dffd1, icon: '↓', title: '중력 감소' },
  reverse: { color: 0x9bbcff, icon: '↑', title: '중력 반전' },
  swap: { color: 0xffdd86, icon: '⇄', title: '운명 교환' },
  grow: { color: 0xffb58c, icon: '⊕', title: '공 크기 증가' },
};

export function eventDescription(event: SpecialEvent) {
  if (event.kind === 'boost') return '속도 +50%';
  if (event.kind === 'bonus') return '+1,000점 획득';
  if (event.kind === 'drain') return `${event.targets.length}명에게 각각 −500점`;
  if (event.kind === 'light') return `자신의 중력 ${event.amount}% 감소 · 영구`;
  if (event.kind === 'reverse') return '자신의 중력이 위쪽으로 · 5초';
  if (event.kind === 'grow') return `공 크기 ${event.amount}% · 영구`;
  if (event.kind === 'swap') return event.targets.length ? `${event.targets[0].name}과 위치·점수 교환` : '교환할 비행 중인 상대 없음';
  return `행성 흡인 범위 ${event.range}m`;
}
export const EVENT_LIFETIME = 5.2;
const EXIT_SECONDS = .38;
type Notice = { color: number; icon: string; actor: string; title: string; value: string; detail: string; label: string; system?: boolean; rare?: boolean };

// Phones show one card, tablets two; desktop has three plus priority notices.
// Presentation time controls lifetimes; milestones use the simulation clock.
export class EventFeed {
  private pending: Notice[] = [];
  private milestones = new Set<number>();
  private compact = false;
  private compactSlots: 1 | 2 = 1;
  private visible: { node: HTMLLIElement; progress: HTMLElement; life: number; duration: number; notice: Notice }[] = [];
  constructor(private list: HTMLOListElement) {}
  get readyForResults() { return !this.pending.length && this.visible.every(entry => !entry.notice.rare && entry.life <= entry.duration - 2.1); }
  setCompact(compact: boolean, slots: 1 | 2 = 1) {
    if (this.compact === compact && this.compactSlots === slots) return;
    this.compact = compact;
    this.compactSlots = slots;
    if (compact && this.visible.length > slots) {
      const priority = [...this.visible.filter(entry => entry.notice.rare), ...this.visible.filter(entry => entry.notice.system && !entry.notice.rare), ...this.visible.filter(entry => !entry.notice.rare && !entry.notice.system)];
      const keep = priority.slice(0, slots);
      this.defer(this.visible.filter(entry => !keep.includes(entry)));
    }
  }
  private defer(entries: typeof this.visible) {
    this.pending.unshift(...entries.map(entry => entry.notice));
    for (const entry of entries) entry.node.remove();
    this.visible = this.visible.filter(entry => !entries.includes(entry));
  }
  push(event: SpecialEvent) {
    const style = SPECIAL_STYLE[event.kind];
    const notice: Notice = { ...style, actor: event.actor.name,
      value: event.kind === 'boost' ? '+50%' : event.kind === 'bonus' ? '+1,000점' : event.kind === 'drain' ? '−500점' : event.kind === 'magnet' ? `${event.range}m` : event.kind === 'light' ? `중력 −${event.amount}%` : event.kind === 'reverse' ? '위쪽 중력 · 5초' : event.kind === 'grow' ? `크기 ${event.amount}%` : '위치 · 점수 교환',
      detail: event.kind === 'drain' ? `${event.targets.length}명 적용` : event.kind === 'magnet' ? '흡인 범위' : event.kind === 'boost' ? '비행 속도' : event.kind === 'bonus' ? '점수 획득' : event.kind === 'swap' ? (event.targets[0] ? `↔ ${event.targets[0].name}` : '상대 없음') : event.kind === 'reverse' ? '5초 동안 적용' : '',
      label: `${event.actor.name} · ${style.title} · ${eventDescription(event)}`, rare: event.kind === 'swap' };
    if (notice.rare) { if (this.compact) this.defer([...this.visible]); this.pending.unshift(notice); }
    else this.pending.push(notice);
  }
  notifyGravity(elapsed: number, threshold: number, _stage?: 1 | 2) {
    if (elapsed + 1e-9 < threshold || this.milestones.has(threshold)) return false;
    this.milestones.add(threshold);
    // A late frame can cross both milestones. Keep only the latest system card,
    // while preserving all student event cards and their remaining reading time.
    this.visible = this.visible.filter(entry => { if (!entry.notice.system) return true; entry.node.remove(); return false; });
    if (this.compact) this.defer([...this.visible]);
    const rate = threshold < 45 ? 30 : threshold < 60 ? 50 : 100;
    const value = `생존 +${rate}점/초`, detail = threshold === 30 ? '중력 서서히 강화' : threshold === 60 ? '중력 강화 가속' : '버틸수록 더 높은 점수';
    this.show({ color: threshold < 60 ? 0xffd078 : 0xffa56c, icon: '◷', actor: `${threshold}초 경과`, title: threshold === 45 ? '생존 점수 상승' : detail, value, detail, label: `${threshold}초 경과 · ${value} · ${detail}`, system: true });
    return true;
  }
  update(dt: number) {
    for (const entry of this.visible) {
      entry.life -= dt;
      entry.node.classList.toggle('is-leaving', entry.life <= EXIT_SECONDS);
      entry.progress.style.transform = `scaleX(${Math.max(0, entry.life / entry.duration)})`;
    }
    this.visible = this.visible.filter(entry => {
      if (entry.life > 0) return true;
      entry.node.remove(); return false;
    });
    if (this.pending[0]?.rare && (!this.compact || !this.visible.length) && !this.visible.some(entry => entry.notice.rare)) this.show(this.pending.shift()!);
    while (this.pending.length && (this.compact ? this.visible.length < this.compactSlots : this.visible.filter(entry => !entry.notice.system && !entry.notice.rare).length < 3)) {
      if (this.pending[0].rare) break;
      this.show(this.pending.shift()!);
    }
  }
  private show(notice: Notice) {
      const node = document.createElement('li'), clip = document.createElement('div'), card = document.createElement('article');
      const icon = document.createElement('i'), content = document.createElement('div'), heading = document.createElement('div'), reward = document.createElement('div');
      const actor = document.createElement('strong'), title = document.createElement('span'), value = document.createElement('b'), detail = document.createElement('small');
      const track = document.createElement('div'), progress = document.createElement('i');
      clip.className = 'event-clip'; card.className = 'event-card'; content.className = 'event-body';
      icon.className = 'event-emblem'; heading.className = 'event-heading'; reward.className = 'event-reward'; track.className = 'event-life';
      node.style.setProperty('--event-color', `#${notice.color.toString(16).padStart(6, '0')}`);
      node.classList.toggle('is-system', !!notice.system);
      node.classList.toggle('is-rare', !!notice.rare);
      node.setAttribute('aria-label', notice.label);
      icon.textContent = notice.icon; icon.setAttribute('aria-hidden', 'true');
      actor.textContent = notice.actor; title.textContent = notice.title;
      value.textContent = notice.value; detail.textContent = notice.detail;
      track.setAttribute('aria-hidden', 'true'); progress.style.transform = 'scaleX(1)'; track.append(progress);
      heading.append(actor, title); reward.append(value, detail); content.append(heading, reward);
      card.append(icon, content, track); clip.append(card); node.append(clip);
      if (notice.rare || (notice.system && !this.visible.some(entry => entry.notice.rare))) this.list.prepend(node); else this.list.append(node);
      const duration = notice.rare ? (this.compact ? 6.5 : 8) : this.compact ? 3.4 : EVENT_LIFETIME;
      this.visible.push({ node, progress, life: duration, duration, notice });
  }
  clear() { this.pending.length = 0; this.visible.length = 0; this.milestones.clear(); this.list.replaceChildren(); }
}
