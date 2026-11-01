// ===== Výběr DOM prvků =====
const $ = (id) => document.getElementById(id);

const circle = $('progressCircle');
const timeDisplay = $('timeDisplay');
const phaseLabel = $('phaseLabel');
const roundDisplay = $('roundDisplay');

const startBtn = $('startBtn');
const resetBtn = $('resetBtn');

const workMinInput = $('workMin');
const workSecInput = $('workSec');
const restMinInput = $('restMin');
const restSecInput = $('restSec');
const roundsInput = $('rounds');

const voiceEnabledInput = $('voiceEnabled');
const voiceOptions = $('voiceOptions');
const voiceLangSelect = $('voiceLang');
const voiceNameSelect = $('voiceName');
const voiceHint = $('voiceHint');
const announceModeSelect = $('announceMode');
const finalLenSelect = $('finalLen');
const finalStyleSelect = $('finalStyle');
const modeHint = $('modeHint');
const testVoiceBtn = $('testVoice');

// Nastavení SVG kruhu (obvod = 2 * PI * r)
const radius = circle.r.baseVal.value;
const circumference = 2 * Math.PI * radius;
circle.style.strokeDasharray = `${circumference} ${circumference}`;

// ===== Stavové proměnné =====
let loopId = null;
let lastTickAt = 0;
let isRunning = false;
let hasStarted = false;   // běží (nebo je pauznutý) rozjetý trénink
let isFinished = false;
let currentMode = 'WORK'; // 'WORK' nebo 'REST'
let currentRound = 1;
let totalRounds = 3;

let workDuration = 120;   // v sekundách
let restDuration = 30;
let totalPhaseTime = 120;
let timeRemaining = 120;

// ===== Zvuk – jeden sdílený AudioContext =====
// (nový kontext pro každé pípnutí iOS po pár kusech zablokuje)
let audioCtx = null;

function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {
    console.log('Audio not supported or blocked');
  }
}

function playBeep(freq = 600, duration = 0.2, volume = 0.4) {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  } catch (e) { /* nic */ }
}

// ===== Jazyky a fráze =====
// plural(n) vrací index tvaru v units; small = slovní tvary pro malá čísla (ženský rod)
const LANGS = {
  cs: {
    tag: 'cs-CZ',
    units: { min: ['minuta', 'minuty', 'minut'], sec: ['sekunda', 'sekundy', 'sekund'] },
    plural: (n) => (n === 1 ? 0 : n >= 2 && n <= 4 ? 1 : 2),
    small: { 1: 'jedna', 2: 'dvě' },
    and: ' a ',
    left: (t, n) => `${n >= 2 && n <= 4 ? 'Zbývají' : 'Zbývá'} ${t}`,
    go: (r, total) =>
      total === 1 ? 'Jedeme!'
      : r === total ? 'Poslední kolo! Jedeme!'
      : `Kolo ${r} ${total < 10 && [2, 3, 4, 6, 7].includes(total) ? 'ze' : 'z'} ${total}. Jedeme!`,
    rest: (d) => `Pauza, ${d}`,
    half: 'Polovina',
    done: 'Hotovo! Skvělá práce.',
  },
  sk: {
    tag: 'sk-SK',
    units: { min: ['minúta', 'minúty', 'minút'], sec: ['sekunda', 'sekundy', 'sekúnd'] },
    plural: (n) => (n === 1 ? 0 : n >= 2 && n <= 4 ? 1 : 2),
    small: { 1: 'jedna', 2: 'dve' },
    and: ' a ',
    left: (t, n) => `${n >= 2 && n <= 4 ? 'Zostávajú' : 'Zostáva'} ${t}`,
    go: (r, total) =>
      total === 1 ? 'Ideme!'
      : r === total ? 'Posledné kolo! Ideme!'
      : `Kolo ${r} z ${total}. Ideme!`,
    rest: (d) => `Pauza, ${d}`,
    half: 'Polovica',
    done: 'Hotovo! Skvelá práca.',
  },
  en: {
    tag: 'en-US',
    units: { min: ['minute', 'minutes'], sec: ['second', 'seconds'] },
    plural: (n) => (n === 1 ? 0 : 1),
    small: {},
    and: ' and ',
    left: (t) => `${t} left`,
    go: (r, total) =>
      total === 1 ? 'Go!'
      : r === total ? 'Last round! Go!'
      : `Round ${r} of ${total}. Go!`,
    rest: (d) => `Rest, ${d}`,
    half: 'Halfway',
    done: 'Done! Great job.',
  },
  de: {
    tag: 'de-DE',
    units: { min: ['Minute', 'Minuten'], sec: ['Sekunde', 'Sekunden'] },
    plural: (n) => (n === 1 ? 0 : 1),
    small: { 1: 'eine' },
    and: ' und ',
    left: (t) => `Noch ${t}`,
    go: (r, total) =>
      total === 1 ? 'Los!'
      : r === total ? 'Letzte Runde! Los!'
      : `Runde ${r} von ${total}. Los!`,
    rest: (d) => `Pause, ${d}`,
    half: 'Halbzeit',
    done: 'Fertig! Super gemacht.',
  },
  pl: {
    tag: 'pl-PL',
    units: { min: ['minuta', 'minuty', 'minut'], sec: ['sekunda', 'sekundy', 'sekund'] },
    plural: (n) => (n === 1 ? 0
      : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 1 : 2),
    small: { 1: 'jedna', 2: 'dwie' },
    and: ' i ',
    left: (t) => `Jeszcze ${t}`,
    go: (r, total) =>
      total === 1 ? 'Start!'
      : r === total ? 'Ostatnia runda! Start!'
      : `Runda ${r} z ${total}. Start!`,
    rest: (d) => `Przerwa, ${d}`,
    half: 'Połowa',
    done: 'Koniec! Świetna robota.',
  },
};

const lang = () => LANGS[voiceLangSelect.value] || LANGS.cs;
const voiceOn = () => voiceEnabledInput.checked && 'speechSynthesis' in window;

function amount(L, n, forms) {
  const word = L.small[n] ?? n;
  return `${word} ${forms[L.plural(n)]}`;
}

// "1 minuta a 30 sekund"
function durationText(L, sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const parts = [];
  if (m) parts.push(amount(L, m, L.units.min));
  if (s) parts.push(amount(L, s, L.units.sec));
  return { text: parts.join(L.and), firstN: m || s };
}

// "Zbývá 1 minuta a 30 sekund"
function leftText(sec) {
  const L = lang();
  const { text, firstN } = durationText(L, sec);
  return L.left(text, firstN);
}

// ===== Syntéza řeči =====
let voices = [];
let savedVoiceURI = '';
let speechUnlocked = false;

function voicesForLang(code) {
  return voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(code));
}

function pickVoice() {
  const list = voicesForLang(voiceLangSelect.value);
  if (!list.length) return null;
  const chosen = list.find((v) => v.voiceURI === voiceNameSelect.value);
  if (chosen) return chosen;
  // Automaticky: preferuj kvalitní (Premium/Enhanced) a lokální hlasy pro hlavní variantu jazyka
  const tag = lang().tag.toLowerCase();
  const score = (v) =>
    (/premium|enhanced|natural|neural/i.test(v.name) ? 4 : 0) +
    (v.localService ? 2 : 0) +
    (v.lang.toLowerCase().replace('_', '-') === tag ? 1 : 0);
  return [...list].sort((a, b) => score(b) - score(a))[0];
}

function speak(text, interrupt = true) {
  if (!voiceOn()) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang().tag;
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = 1.05;
  if (interrupt) speechSynthesis.cancel(); // novější hlášení má přednost, ať se fronta nezpožďuje
  speechSynthesis.speak(u);
}

// iOS pustí řeč až po prvním gestu uživatele
function unlockSpeech() {
  if (speechUnlocked || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
  speechUnlocked = true;
}

function populateVoiceSelect() {
  const list = voicesForLang(voiceLangSelect.value);
  const keep = voiceNameSelect.value || savedVoiceURI;
  voiceNameSelect.innerHTML = '';
  voiceNameSelect.append(new Option('Automaticky', ''));
  const showLang = new Set(list.map((v) => v.lang)).size > 1;
  list.forEach((v) => {
    voiceNameSelect.append(new Option(showLang ? `${v.name} (${v.lang})` : v.name, v.voiceURI));
  });
  if (list.some((v) => v.voiceURI === keep)) voiceNameSelect.value = keep;

  if (!('speechSynthesis' in window)) {
    voiceHint.textContent = 'Tento prohlížeč neumí předčítat. Pípání funguje dál.';
    voiceHint.hidden = false;
  } else if (voices.length && !list.length) {
    voiceHint.textContent =
      'V zařízení chybí hlas pro tento jazyk. Na iPhonu ho stáhneš v Nastavení → Zpřístupnění → Mluvený obsah → Hlasy.';
    voiceHint.hidden = false;
  } else {
    voiceHint.hidden = true;
  }
}

function loadVoices() {
  voices = speechSynthesis.getVoices();
  populateVoiceSelect();
}

if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

// ===== Logika hlášení =====
function isAnnounceMark(remaining) {
  const mode = announceModeSelect.value;
  if (mode === 'none') return false;
  if (mode === 'smart') {
    // celé minuty (u dlouhých fází jen po 5 min, posledních 5 min každou minutu) + 30 s
    if (remaining >= 60 && remaining % 60 === 0) return remaining <= 300 || remaining % 300 === 0;
    return remaining === 30 && totalPhaseTime >= 60;
  }
  return remaining % Number(mode) === 0;
}

function voiceCue(remaining) {
  if (!voiceEnabledInput.checked) return; // pípání funguje i bez podpory řeči

  const L = lang();
  const finalLen = Number(finalLenSelect.value);
  const style = finalStyleSelect.value;

  // Závěrečný odpočet
  if (finalLen && remaining <= finalLen) {
    if (remaining === finalLen && finalLen >= 5) {
      speak(leftText(remaining));           // „Zbývá 10 sekund"
    } else if (style === 'voice' || (style === 'mix' && remaining <= 3)) {
      speak(String(remaining));             // „3… 2… 1…"
    } else {
      const last = remaining <= 3;
      playBeep(last ? 880 : 660, 0.12, last ? 0.5 : 0.3); // poslední 3 s vyšší a hlasitější
    }
    return;
  }

  // Průběžná hlášení
  let text = isAnnounceMark(remaining) ? leftText(remaining) : null;
  const isHalf = announceModeSelect.value === 'smart'
    && totalPhaseTime >= 60
    && remaining === Math.floor(totalPhaseTime / 2);
  if (isHalf) text = text ? `${L.half}. ${text}` : L.half;
  if (text) speak(text);
}

function updateModeHint() {
  const mode = announceModeSelect.value;
  const finalLen = Number(finalLenSelect.value);
  const style = finalStyleSelect.value;

  const modeText = {
    smart: 'Hlásí každou minutu (u dlouhých fází po 5 minutách), v polovině a 30 s před koncem.',
    60: 'Hlásí každou celou minutu.',
    30: 'Hlásí každých 30 sekund.',
    15: 'Hlásí každých 15 sekund.',
    none: 'Průběžně mlčí, ozve se jen začátek fáze a závěr.',
  }[mode];

  let finalText = 'Závěrečný odpočet je vypnutý.';
  if (finalLen) {
    const intro = finalLen >= 5 ? `Na ${finalLen} s ohlásí zbývající čas, pak ` : 'Poslední 3 s ';
    const rest = {
      beep: 'každou sekundu pípne.',
      mix: finalLen > 3 ? 'pípá a poslední 3 s počítá nahlas.' : 'počítá nahlas.',
      voice: 'počítá každou sekundu nahlas.',
    }[style];
    finalText = intro + rest;
  }
  modeHint.textContent = `${modeText} ${finalText}`;
}

// ===== Časovač =====
function setProgress(percent) {
  circle.style.strokeDashoffset = circumference - percent * circumference;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function loadSettings() {
  const wMin = parseInt(workMinInput.value) || 0;
  const wSec = parseInt(workSecInput.value) || 0;
  const rMin = parseInt(restMinInput.value) || 0;
  const rSec = parseInt(restSecInput.value) || 0;

  workDuration = Math.max(1, wMin * 60 + wSec);
  restDuration = Math.max(0, rMin * 60 + rSec);
  totalRounds = Math.max(1, parseInt(roundsInput.value) || 1);
}

function setPhaseLabel(text, kind) {
  phaseLabel.textContent = text;
  phaseLabel.className = `phase-label is-${kind}`;
}

function setStartBtn(state) {
  const map = {
    start: ['Start', 'btn-primary'],
    pause: ['Pauza', 'btn-warning'],
    resume: ['Pokračovat', 'btn-primary'],
  };
  const [text, cls] = map[state];
  startBtn.textContent = text;
  startBtn.className = `btn ${cls}`;
}

function updateUI() {
  timeDisplay.textContent = formatTime(timeRemaining);
  roundDisplay.textContent = `Kolo ${currentRound} / ${totalRounds}`;
  setProgress(totalPhaseTime > 0 ? timeRemaining / totalPhaseTime : 0);
}

function enterPhase(mode, announce = true) {
  currentMode = mode;
  totalPhaseTime = timeRemaining = mode === 'WORK' ? workDuration : restDuration;
  circle.classList.toggle('mode-rest', mode === 'REST');
  if (mode === 'WORK') setPhaseLabel('PRÁCE / AKTIVITA', 'work');
  else setPhaseLabel('PAUZA', 'rest');
  updateUI();

  if (announce) {
    const L = lang();
    speak(mode === 'WORK'
      ? L.go(currentRound, totalRounds)
      : L.rest(durationText(L, restDuration).text));
  }
}

function finish(silent) {
  stopLoop();
  isRunning = false;
  hasStarted = false;
  isFinished = true;
  timeRemaining = 0;
  updateUI();
  setStartBtn('start');
  setPhaseLabel('HOTOVO!', 'done');
  releaseWakeLock();
  if (!silent) {
    playBeep(1000, 0.8, 0.5);
    speak(lang().done);
  }
}

// Jeden krok odpočtu (1 s)
function tick(silent = false) {
  timeRemaining--;

  if (timeRemaining > 0) {
    updateUI();
    if (!silent) voiceCue(timeRemaining);
    return;
  }

  // Konec fáze → hned přepnout na další (bez „visící" nuly)
  if (currentMode === 'WORK' && restDuration > 0 && currentRound < totalRounds) {
    if (!silent) playBeep(800, 0.4);
    enterPhase('REST', !silent);
  } else if (currentRound < totalRounds) {
    if (!silent) playBeep(800, 0.4);
    currentRound++;
    enterPhase('WORK', !silent);
  } else {
    finish(silent);
  }
}

// Smyčka podle skutečného času – nedriftuje a dožene zpoždění (např. po zhasnutí displeje)
function startLoop() {
  stopLoop();
  lastTickAt = performance.now();
  loopId = setInterval(() => {
    let behind = Math.floor((performance.now() - lastTickAt) / 1000);
    if (behind <= 0) return;
    const catchingUp = behind > 2;
    while (behind > 0 && isRunning) {
      lastTickAt += 1000;
      behind--;
      tick(catchingUp && behind > 0); // při dohánění mlčí, ozve se jen aktuální stav
    }
  }, 200);
}

function stopLoop() {
  clearInterval(loopId);
  loopId = null;
}

function resetTimer() {
  stopLoop();
  isRunning = false;
  hasStarted = false;
  isFinished = false;
  releaseWakeLock();
  if ('speechSynthesis' in window) speechSynthesis.cancel();

  setStartBtn('start');
  loadSettings();
  currentRound = 1;
  enterPhase('WORK', false);
}

// ===== Displej nezhasne během cvičení (Wake Lock, iOS 16.4+) =====
let wakeLock = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { /* nevadí */ }
}

function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isRunning) requestWakeLock();
});

// ===== Ukládání nastavení =====
const STORAGE_KEY = 'minutka-nastaveni';
const persistedInputs = [
  workMinInput, workSecInput, restMinInput, restSecInput, roundsInput,
  voiceEnabledInput, voiceLangSelect, announceModeSelect, finalLenSelect, finalStyleSelect,
];

function saveSettings() {
  try {
    const data = {};
    persistedInputs.forEach((el) => { data[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
    data.voiceName = voiceNameSelect.value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { /* nevadí */ }
}

function restoreSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    persistedInputs.forEach((el) => {
      if (!(el.id in data)) return;
      if (el.type === 'checkbox') el.checked = data[el.id];
      else el.value = data[el.id];
    });
    savedVoiceURI = data.voiceName || '';
  } catch (e) { /* nevadí */ }
}

// ===== Ovládání =====
startBtn.addEventListener('click', () => {
  unlockAudio();
  unlockSpeech();

  if (isRunning) {
    stopLoop();
    isRunning = false;
    setStartBtn('resume');
    releaseWakeLock();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    return;
  }

  const fresh = !hasStarted;
  if (fresh) resetTimer(); // načte aktuální nastavení (i po „Hotovo")

  isRunning = true;
  hasStarted = true;
  setStartBtn('pause');
  playBeep(440, 0.05, 0.2);
  if (fresh) speak(lang().go(1, totalRounds));

  startLoop();
  requestWakeLock();
});

resetBtn.addEventListener('click', resetTimer);

// Změna časů → reset (pokud zrovna neběží)
[workMinInput, workSecInput, restMinInput, restSecInput, roundsInput].forEach((input) => {
  input.addEventListener('change', () => {
    saveSettings();
    if (!isRunning) resetTimer();
  });
});

// Hlasová nastavení se dají měnit i za běhu
voiceEnabledInput.addEventListener('change', () => {
  voiceOptions.hidden = !voiceEnabledInput.checked;
  if (!voiceEnabledInput.checked && 'speechSynthesis' in window) speechSynthesis.cancel();
  saveSettings();
});

voiceLangSelect.addEventListener('change', () => {
  savedVoiceURI = '';
  voiceNameSelect.value = '';
  populateVoiceSelect();
  saveSettings();
});

[voiceNameSelect, announceModeSelect, finalLenSelect, finalStyleSelect].forEach((el) => {
  el.addEventListener('change', () => {
    updateModeHint();
    saveSettings();
  });
});

testVoiceBtn.addEventListener('click', () => {
  unlockAudio();
  unlockSpeech();
  speak(leftText(90));
});

// ===== Inicializace =====
restoreSettings();
voiceOptions.hidden = !voiceEnabledInput.checked;
populateVoiceSelect();
updateModeHint();
resetTimer();
