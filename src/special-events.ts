import type { SpecialEvent, SpecialKind } from './simulation';

export const SPECIAL_STYLE: Record<SpecialKind, { color: number; icon: string; title: string }> = {
  boost: { color: 0x68ecff, icon: '»', title: '스피드 부스트' },
  bonus: { color: 0xffd078, icon: '+', title: '보너스 점수' },
  drain: { color: 0xff83b5, icon: '−', title: '점수 파동' },
  magnet: { color: 0xb49bff, icon: '◎', title: '자석 범위 확대' },
};

export function eventDescription(event: SpecialEvent) {
  if (event.kind === 'boost') return '속도 +50%';
  if (event.kind === 'bonus') return '+1,000점 획득';
  if (event.kind === 'drain') return `${event.targets.length}명에게 각각 −500점`;
  return `행성 흡인 범위 ${event.range}m`;
}
export const EVENT_LIFETIME = 5.2;
const EXIT_SECONDS = .38;
type Notice = { color: number; icon: string; actor: string; title: string; value: string; detail: string; label: string; system?: boolean };

// Small screens show one compact card; desktop shows three plus a round notice.
// Presentation time controls lifetimes; milestones use the simulation clock.
export class EventFeed {
  private pending: Notice[] = [];
  private milestones = new Set<number>();
  private compact = false;
  private visible: { node: HTMLLIElement; progress: HTMLElement; life: number; duration: number; notice: Notice }[] = [];
  constructor(private list: HTMLOListElement) {}
  get readyForResults() { return !this.pending.length && this.visible.every(entry => entry.life <= entry.duration - 2.1); }
  setCompact(compact: boolean) {
    if (this.compact === compact) return;
    this.compact = compact;
    if (compact && this.visible.length > 1) {
      const keep = this.visible.find(entry => entry.notice.system) || this.visible[0];
      this.defer(this.visible.filter(entry => entry !== keep));
    }
  }
  private defer(entries: typeof this.visible) {
    this.pending.unshift(...entries.map(entry => entry.notice));
    for (const entry of entries) entry.node.remove();
    this.visible = this.visible.filter(entry => !entries.includes(entry));
  }
  push(event: SpecialEvent) {
    const style = SPECIAL_STYLE[event.kind];
    this.pending.push({ ...style, actor: event.actor.name,
      value: event.kind === 'boost' ? '+50%' : event.kind === 'bonus' ? '+1,000점' : event.kind === 'drain' ? '−500점' : `${event.range}m`,
      detail: event.kind === 'drain' ? `${event.targets.length}명 적용` : event.kind === 'magnet' ? '흡인 범위' : event.kind === 'boost' ? '비행 속도' : '점수 획득',
      label: `${event.actor.name} · ${style.title} · ${eventDescription(event)}` });
  }
  notifyGravity(elapsed: number, threshold: number, stage: 1 | 2) {
    if (elapsed + 1e-9 < threshold || this.milestones.has(threshold)) return false;
    this.milestones.add(threshold);
    // A late frame can cross both milestones. Keep only the latest system card,
    // while preserving all student event cards and their remaining reading time.
    this.visible = this.visible.filter(entry => { if (!entry.notice.system) return true; entry.node.remove(); return false; });
    if (this.compact) this.defer([...this.visible]);
    const value = `중력 ${stage}차 강화`, detail = stage === 1 ? '아래로 당기는 힘이 서서히 강해집니다' : '아래로 당기는 힘이 더 빠르게 강해집니다';
    this.show({ color: stage === 1 ? 0xffd078 : 0xffa56c, icon: '↓', actor: `${threshold}초 경과`, title: '전체 적용', value, detail, label: `${threshold}초 경과 · ${value} · ${detail}`, system: true });
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
    while (this.pending.length && (this.compact ? this.visible.length < 1 : this.visible.filter(entry => !entry.notice.system).length < 3)) this.show(this.pending.shift()!);
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
      node.setAttribute('aria-label', notice.label);
      icon.textContent = notice.icon; icon.setAttribute('aria-hidden', 'true');
      actor.textContent = notice.actor; title.textContent = notice.title;
      value.textContent = notice.value; detail.textContent = notice.detail;
      track.setAttribute('aria-hidden', 'true'); progress.style.transform = 'scaleX(1)'; track.append(progress);
      heading.append(actor, title); reward.append(value, detail); content.append(heading, reward);
      card.append(icon, content, track); clip.append(card); node.append(clip);
      if (notice.system) this.list.prepend(node); else this.list.append(node);
      const duration = this.compact ? 3.4 : EVENT_LIFETIME;
      this.visible.push({ node, progress, life: duration, duration, notice });
  }
  clear() { this.pending.length = 0; this.visible.length = 0; this.milestones.clear(); this.list.replaceChildren(); }
}
