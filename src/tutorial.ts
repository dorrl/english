const STORAGE_KEY = 'boom-planet:guide:hidden:v1';
const steps = [
  {
    label: '01 · 참가자', title: '이름만 입력하면 준비 끝',
    description: '2–30명의 이름을 한 줄에 한 명씩 입력하세요. 각자 고유한 색의 공을 받습니다.',
    detail: '시작을 누르면 한 번의 스윙으로 모든 공이 함께 출발해요.',
  },
  {
    label: '02 · 진행 방식', title: '시작하면, 경기는 자동으로',
    description: '공이 우주를 날며 행성을 파괴합니다. 별도 조작 없이 날아가는 공들을 지켜보세요.',
    detail: '카메라는 여러 공을 번갈아 비춰요. 모든 비행이 끝나면 우승자와 최종 순위가 나타납니다.',
  },
  {
    label: '03 · 점수 계산', title: '멀리 날고, 많이 부술수록',
    description: '행성 파괴 점수와 비행 거리 점수를 더해 순위를 정합니다. 합산 점수가 가장 높은 사람이 우승해요.',
    detail: '태양·인공위성·우주정거장은 배경 요소로 점수에 포함되지 않아요.',
  },
];

export function initTutorial(planetPoints: number) {
  const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = get<HTMLDialogElement>('game-guide'), opener = get<HTMLButtonElement>('open-guide');
  const back = get<HTMLButtonElement>('guide-back'), next = get<HTMLButtonElement>('guide-next');
  const remember = get<HTMLInputElement>('guide-remember');
  const scenes = Array.from(dialog.querySelectorAll<HTMLElement>('[data-guide-scene]'));
  const dots = Array.from(dialog.querySelectorAll<HTMLElement>('.guide-dots i'));
  let step = 0, returnFocus: HTMLElement | null = null;
  const wasHidden = () => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  };
  dialog.querySelectorAll('[data-guide-planet-points]').forEach(el => { el.textContent = planetPoints.toLocaleString('ko-KR'); });
  get('guide-example-score').textContent = `${(planetPoints * 4 + 800).toLocaleString('ko-KR')}점`;

  function showStep(index: number) {
    step = index;
    scenes.forEach((scene, i) => { scene.hidden = i !== step; });
    dots.forEach((dot, i) => dot.classList.toggle('is-current', i === step));
    const content = steps[step];
    get('guide-step').textContent = content.label;
    get('guide-title').textContent = content.title;
    get('guide-description').textContent = content.description;
    get('guide-detail').textContent = content.detail;
    back.disabled = step === 0;
    next.replaceChildren(document.createTextNode(step === steps.length - 1 ? '준비하기' : '다음'));
    const arrow = document.createElement('span'); arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '→'; next.append(arrow);
  }
  function open() {
    if (dialog.open || opener.disabled) return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    remember.checked = wasHidden(); showStep(0); dialog.showModal();
    // Keep the primary path focused; native dialog confines keyboard focus.
    next.focus({ preventScroll: true });
  }
  function close() { dialog.close(); }
  opener.addEventListener('click', open);
  get('guide-skip').addEventListener('click', close);
  back.addEventListener('click', () => { showStep(Math.max(0, step - 1)); if (back.disabled) next.focus(); });
  next.addEventListener('click', () => {
    if (step < steps.length - 1) showStep(step + 1); else close();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => {
    try {
      if (remember.checked) localStorage.setItem(STORAGE_KEY, '1'); else localStorage.removeItem(STORAGE_KEY);
    } catch { /* Private browsing may disallow persistence; the guide still works. */ }
    const target = returnFocus && returnFocus !== document.body && returnFocus.isConnected ? returnFocus : get('names');
    target.focus({ preventScroll: true });
  });
  if (!wasHidden()) open();
}
