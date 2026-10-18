// Výběr DOM prvků
const circle = document.getElementById('progressCircle');
const timeDisplay = document.getElementById('timeDisplay');
const phaseLabel = document.getElementById('phaseLabel');
const roundDisplay = document.getElementById('roundDisplay');

const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');

const workMinInput = document.getElementById('workMin');
const workSecInput = document.getElementById('workSec');
const restMinInput = document.getElementById('restMin');
const restSecInput = document.getElementById('restSec');
const roundsInput = document.getElementById('rounds');

// Nastavení SVG kruhu (obvod = 2 * PI * r)
const radius = circle.r.baseVal.value;
const circumference = 2 * Math.PI * radius;
circle.style.strokeDasharray = `${circumference} ${circumference}`;

// Stavové proměnné
let timerInterval = null;
let isRunning = false;
let currentMode = 'WORK'; // 'WORK' nebo 'REST'
let currentRound = 1;
let totalRounds = 3;

let workDuration = 120; // v sekundách
let restDuration = 30;  // v sekundách
let totalPhaseTime = 120;
let timeRemaining = 120;

// Zvukový signál (Web Audio API – bez nutnosti externích MP3)
function playBeep(freq = 600, duration = 0.2) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.log("Audio not supported or blocked");
  }
}

// Aktualizace vizuálního kruhu (ubývání výseče)
function setProgress(percent) {
  const offset = circumference - (percent * circumference);
  circle.style.strokeDashoffset = offset;
}

// Formátování sekund na MM:SS
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Načtení nastavení z formuláře
function loadSettings() {
  const wMin = parseInt(workMinInput.value) || 0;
  const wSec = parseInt(workSecInput.value) || 0;
  const rMin = parseInt(restMinInput.value) || 0;
  const rSec = parseInt(restSecInput.value) || 0;

  workDuration = (wMin * 60) + wSec;
  restDuration = (rMin * 60) + rSec;
  totalRounds = parseInt(roundsInput.value) || 1;
}

// Obnovení stavu časovače
function resetTimer() {
  clearInterval(timerInterval);
  isRunning = false;
  startBtn.textContent = 'Start';
  startBtn.style.backgroundColor = '#3b82f6';
  
  loadSettings();
  currentMode = 'WORK';
  currentRound = 1;
  totalPhaseTime = workDuration;
  timeRemaining = workDuration;

  circle.classList.remove('mode-rest');
  phaseLabel.textContent = 'PRÁCE / AKTIVITA';
  phaseLabel.style.color = '#ef4444';
  
  updateUI();
}

// Aktualizace textů a animace
function updateUI() {
  timeDisplay.textContent = formatTime(timeRemaining);
  roundDisplay.textContent = `Kolo ${currentRound} / ${totalRounds}`;
  
  const progressPercent = timeRemaining / totalPhaseTime;
  setProgress(progressPercent);
}

// Hlavní smyčka odpočtu
function tick() {
  if (timeRemaining > 0) {
    timeRemaining--;
    updateUI();
  } else {
    // Přechod mezi fázemi
    playBeep(800, 0.4); // Pípnutí na konci fáze

    if (currentMode === 'WORK') {
      if (restDuration > 0) {
        currentMode = 'REST';
        totalPhaseTime = restDuration;
        timeRemaining = restDuration;
        phaseLabel.textContent = 'PAUZA';
        phaseLabel.style.color = '#10b981';
        circle.classList.add('mode-rest');
      } else {
        // Pokud pauza není nastavená, jdi rovnou na další kolo
        nextRoundOrFinish();
      }
    } else {
      circle.classList.remove('mode-rest');
      nextRoundOrFinish();
    }
  }
}

function nextRoundOrFinish() {
  if (currentRound < totalRounds) {
    currentRound++;
    currentMode = 'WORK';
    totalPhaseTime = workDuration;
    timeRemaining = workDuration;
    phaseLabel.textContent = 'PRÁCE / AKTIVITA';
    phaseLabel.style.color = '#ef4444';
  } else {
    // Konec cvičení
    clearInterval(timerInterval);
    isRunning = false;
    startBtn.textContent = 'Start';
    phaseLabel.textContent = 'HOTOVO!';
    phaseLabel.style.color = '#3b82f6';
    playBeep(1000, 0.8); // Dlouhé pípnutí na konci
  }
}

// Ovládání Start / Pauza
startBtn.addEventListener('click', () => {
  if (!isRunning) {
    loadSettings();
    isRunning = true;
    startBtn.textContent = 'Pauza';
    startBtn.style.backgroundColor = '#f59e0b';
    
    // Zapnutí audio kontextu při prvním gestu uživatele (nutné pro iOS Safari)
    playBeep(440, 0.05);

    timerInterval = setInterval(tick, 1000);
  } else {
    clearInterval(timerInterval);
    isRunning = false;
    startBtn.textContent = 'Pokračovat';
    startBtn.style.backgroundColor = '#3b82f6';
  }
});

resetBtn.addEventListener('click', resetTimer);

// Automatická aktualizace při změně vstupů
[workMinInput, workSecInput, restMinInput, restSecInput, roundsInput].forEach(input => {
  input.addEventListener('change', () => {
    if (!isRunning) resetTimer();
  });
});

// Inicializace po načtení
resetTimer();