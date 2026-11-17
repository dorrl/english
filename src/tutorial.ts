import { survivalPoints } from './simulation';
const STORAGE_KEY = 'boom-planet:guide:hidden:v3';
const steps = [
  {
    label: '01 · 참가자', title: '이름만 입력하면 준비 끝',
    description: '2–30명의 이름을 한 줄에 한 명씩 입력하세요. 각자 고유한 색의 공을 받습니다.',
    detail: '시작을 누르면 한 번의 스윙으로 모든 공이 함께 출발해요.',
  },
  {
    label: '02 · 진행 방식', title: '시작하면, 경기는 자동으로',
    description: '공이 우주를 날며 행성을 파괴합니다. 별도 조작 없이 날아가는 공들을 지켜보세요.',
    detail: '카메라는 점수 상위 약 20%와 점수가 빠르게 오르는 공을 우선 비춰요. 모든 비행이 끝나면 최종 순위가 나타납니다.',
  },
  {
    label: '03 · 점수 계산', title: '멀리 날고, 많이 부술수록',
    description: '생존 점수 + 거리 1m당 1점 + 행성 파괴·특수 이벤트의 추가 점수를 합산합니다.',
    detail: '합산 점수가 가장 높은 사람이 우승해요. 태양·인공위성·우주정거장은 점수에 포함되지 않습니다.',
  },
  {
    label: '04 · 생존 점수', title: '오래 버틸수록 점수가 빨라져요',
    description: '처음에는 초당 20점, 30초부터 30점, 45초부터 50점, 60초부터 100점을 받습니다. 완료한 1초마다 누적돼요.',
    detail: '이전 구간의 점수는 그대로 유지돼요. 30초부터 중력이 서서히 강해지고, 60초부터 더 빠르게 강해집니다. 경과 알림에 새 점수 속도가 표시돼요.',
  },
  {
    label: '05 · 특수 행성', title: '빛나는 행성이 만드는 반전',
    description: '궤도와 아이콘이 빛나는 행성을 깨면 특별한 효과가 발동해요. 경기 알림에서 누가 어떤 효과를 얻었는지 확인하세요.',
    detail: '감점은 다른 학생 중 약 20%(최소 1명)에게 적용돼요. 비행을 마친 학생도 영향을 받으며, 점수는 음수가 될 수 있습니다.',
  },
  {
    label: '06 · 새로운 변수', title: '궤적과 운명을 바꾸는 행성',
    description: '자신의 중력 감소와 공 크기 증가는 이번 경기 내내 유지돼요. 중력 반전은 5초 동안 위로 당깁니다.',
    detail: '희귀한 운명 교환은 비행 중인 상대 한 명과 위치·현재 총점을 바꿔요. 생존 시간과 자신의 강화 효과는 유지돼요. 중력 감소는 최대 65%, 공 크기는 최대 220%까지 쌓입니다.',
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
  get('guide-example-score').textContent = `${(survivalPoints(30) + planetPoints * 4 + 1000 + 800).toLocaleString('ko-KR')}점`;

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
