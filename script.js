// Pawsome Times Tables — multiplication practice game with a dog theme.

const TIME_LIMIT = 10;          // seconds per question
const MAX_LIVES = 3;            // bones
const TREAT_EVERY = 5;          // streak milestone that earns a puppy photo
const RING_LENGTH = 2 * Math.PI * 52;

const IMG = {
  happy: "images/dog-happy.svg",
  thinking: "images/dog-thinking.svg",
  sad: "images/dog-sad.svg",
  bone: "images/bone.svg",
};

const PRAISE = ["Woof! Correct!", "Pawsome!", "Good dog! 🐶", "Tail-wagging good!", "You're a star pup!", "Bark-tastic!", "Fetch-tacular!"];
const CHEER = ["Ruff! You can do it!", "Sniff out the answer!", "Think hard, pup!", "What's the answer?", "Ready… fetch!"];

// ---------- Elements ----------
const $ = (id) => document.getElementById(id);
const screens = { start: $("start-screen"), game: $("game-screen"), over: $("over-screen") };
const el = {
  chips: $("table-chips"),
  startBtn: $("start-btn"),
  bestStart: $("best-start"),
  score: $("score"),
  streak: $("streak"),
  best: $("best"),
  lives: $("lives"),
  dog: $("dog-img"),
  speech: $("speech"),
  timer: document.querySelector(".timer"),
  ring: $("ring"),
  timeLeft: $("time-left"),
  question: $("question"),
  numA: $("num-a"),
  numB: $("num-b"),
  qMark: document.querySelector(".q-mark"),
  form: $("answer-form"),
  input: $("answer"),
  keypad: $("keypad"),
  treat: $("treat"),
  treatImg: $("treat-img"),
  treatStreak: $("treat-streak"),
  soundBtn: $("sound-toggle"),
};

// ---------- State ----------
const state = {
  tables: new Set(loadJSON("pawsome-tables", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])),
  best: Number(localStorage.getItem("pawsome-best")) || 0,
  sound: localStorage.getItem("pawsome-sound") !== "off",
  score: 0,
  streak: 0,
  gameBestStreak: 0,
  correct: 0,
  lives: MAX_LIVES,
  missed: new Map(),
  a: 0,
  b: 0,
  lastKey: "",
  locked: true,
  deadline: 0,
  rafId: 0,
  pendingTimeout: 0,
};

function loadJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) && value.length ? value : fallback;
  } catch {
    return fallback;
  }
}

const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (list) => list[random(0, list.length - 1)];

// ---------- Screens ----------
function showScreen(name) {
  Object.entries(screens).forEach(([key, node]) => { node.hidden = key !== name; });
}

// ---------- Table picker ----------
function renderChips() {
  el.chips.innerHTML = "";
  for (let n = 1; n <= 12; n++) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = n;
    chip.setAttribute("aria-pressed", state.tables.has(n));
    chip.setAttribute("aria-label", `${n} times table`);
    chip.addEventListener("click", () => {
      state.tables.has(n) ? state.tables.delete(n) : state.tables.add(n);
      updateChips();
    });
    el.chips.appendChild(chip);
  }
  updateChips();
}

function updateChips() {
  [...el.chips.children].forEach((chip, i) => chip.setAttribute("aria-pressed", state.tables.has(i + 1)));
  el.startBtn.disabled = state.tables.size === 0;
  localStorage.setItem("pawsome-tables", JSON.stringify([...state.tables]));
}

$("select-all").addEventListener("click", () => {
  for (let n = 1; n <= 12; n++) state.tables.add(n);
  updateChips();
});
$("select-none").addEventListener("click", () => {
  state.tables.clear();
  updateChips();
});

// ---------- Game flow ----------
function startGame() {
  if (state.tables.size === 0) return;
  Object.assign(state, { score: 0, streak: 0, gameBestStreak: 0, correct: 0, lives: MAX_LIVES, lastKey: "" });
  state.missed.clear();
  renderLives();
  updateStats();
  showScreen("game");
  nextQuestion();
}

function nextQuestion() {
  clearTimeout(state.pendingTimeout);
  const tables = [...state.tables];
  let a, b, key;
  let tries = 0;
  do {
    a = pick(tables);
    b = random(1, 12);
    if (Math.random() < 0.5) [a, b] = [b, a]; // practice both orders: 7 × 3 and 3 × 7
    key = `${a}x${b}`;
  } while (key === state.lastKey && ++tries < 20); // avoid asking the same fact twice in a row
  state.a = a;
  state.b = b;
  state.lastKey = key;

  el.numA.textContent = a;
  el.numB.textContent = b;
  el.qMark.textContent = "?";
  el.question.classList.remove("new");
  void el.question.offsetWidth; // restart the drop-in animation
  el.question.classList.add("new");

  setDog("thinking");
  say(pick(CHEER));
  el.input.value = "";
  if (window.matchMedia("(pointer: fine)").matches) el.input.focus();

  state.locked = false;
  startTimer();
}

function startTimer() {
  cancelAnimationFrame(state.rafId);
  state.deadline = performance.now() + TIME_LIMIT * 1000;
  const tick = (now) => {
    const remaining = Math.max(0, state.deadline - now);
    const secs = Math.ceil(remaining / 1000);
    el.timeLeft.textContent = secs;
    el.ring.style.strokeDashoffset = RING_LENGTH * (1 - remaining / (TIME_LIMIT * 1000));
    el.timer.classList.toggle("warn", secs <= 5 && secs > 3);
    el.timer.classList.toggle("danger", secs <= 3);
    if (remaining <= 0) {
      handleMiss(true);
      return;
    }
    state.rafId = requestAnimationFrame(tick);
  };
  state.rafId = requestAnimationFrame(tick);
}

function stopTimer() {
  cancelAnimationFrame(state.rafId);
}

function submitAnswer() {
  if (state.locked) return;
  const raw = el.input.value.trim();
  if (raw === "") {
    shake();
    return;
  }
  if (Number(raw) === state.a * state.b) handleCorrect();
  else handleMiss(false);
}

function handleCorrect() {
  state.locked = true;
  stopTimer();
  const secondsLeft = Math.ceil((state.deadline - performance.now()) / 1000);
  state.score += 10 + Math.max(0, secondsLeft); // faster answers earn bonus points
  state.streak += 1;
  state.correct += 1;
  state.gameBestStreak = Math.max(state.gameBestStreak, state.streak);
  if (state.streak > state.best) {
    state.best = state.streak;
    localStorage.setItem("pawsome-best", state.best);
  }

  el.qMark.textContent = state.a * state.b;
  setDog("happy");
  say(state.streak >= 3 ? `${pick(PRAISE)} ${state.streak} in a row!` : pick(PRAISE), "good");
  updateStats(true);
  throwBones();
  playSound("good");

  state.pendingTimeout = setTimeout(() => {
    if (state.streak % TREAT_EVERY === 0) showTreat();
    else nextQuestion();
  }, 1100);
}

function handleMiss(timedOut) {
  state.locked = true;
  stopTimer();
  const answer = state.a * state.b;
  state.streak = 0;
  state.lives -= 1;
  state.missed.set(`${state.a} × ${state.b}`, answer);

  el.qMark.textContent = answer;
  setDog("sad");
  say(`${timedOut ? "Time's up!" : "Oops!"} ${state.a} × ${state.b} = ${answer}`, "bad");
  if (!timedOut) shake();
  updateStats();
  renderLives();
  playSound("bad");

  state.pendingTimeout = setTimeout(() => {
    if (state.lives <= 0) gameOver();
    else nextQuestion();
  }, 2000);
}

function gameOver() {
  stopTimer();
  state.locked = true;
  $("final-score").textContent = state.score;
  $("final-correct").textContent = state.correct;
  $("final-streak").textContent = state.gameBestStreak;

  const great = state.correct >= 15;
  $("over-title").textContent = great ? "Pawsome job, superstar!" : state.correct >= 5 ? "Great fetching!" : "Good try, pup!";
  $("over-dog").src = great ? IMG.happy : state.correct >= 5 ? IMG.thinking : IMG.sad;

  const list = $("practice-list");
  list.innerHTML = "";
  state.missed.forEach((answer, fact) => {
    const li = document.createElement("li");
    li.textContent = `${fact} = ${answer}`;
    list.appendChild(li);
  });
  $("practice").hidden = state.missed.size === 0;

  el.bestStart.textContent = state.best;
  showScreen("over");
}

// ---------- Treat popup (real puppy photo, with a cartoon fallback) ----------
async function showTreat() {
  el.treatStreak.textContent = state.streak;
  el.treatImg.classList.add("cartoon");
  el.treatImg.src = IMG.happy;
  el.treat.hidden = false;
  playSound("treat");
  $("treat-btn").focus();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("https://dog.ceo/api/breeds/image/random", { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();
    if (data.status === "success" && !el.treat.hidden) {
      const photo = new Image();
      photo.onload = () => {
        if (el.treat.hidden) return;
        el.treatImg.classList.remove("cartoon");
        el.treatImg.src = data.message;
      };
      photo.src = data.message;
    }
  } catch {
    // Offline or blocked: keep the cartoon puppy.
  }
}

function closeTreat() {
  if (el.treat.hidden) return;
  el.treat.hidden = true;
  nextQuestion();
}

// ---------- UI helpers ----------
function setDog(mood) {
  el.dog.src = IMG[mood];
  el.dog.classList.remove("happy", "sad");
  void el.dog.offsetWidth;
  if (mood !== "thinking") el.dog.classList.add(mood);
}

function say(text, tone = "") {
  el.speech.textContent = text;
  el.speech.className = `speech ${tone}`;
}

function updateStats(pop = false) {
  el.score.textContent = state.score;
  el.streak.textContent = state.streak;
  el.best.textContent = state.best;
  if (pop) {
    [el.score, el.streak.parentElement].forEach((node) => {
      node.classList.remove("pop");
      void node.offsetWidth;
      node.classList.add("pop");
    });
  }
}

function renderLives() {
  el.lives.innerHTML = "";
  for (let i = 0; i < MAX_LIVES; i++) {
    const bone = document.createElement("img");
    bone.src = IMG.bone;
    bone.alt = i < state.lives ? "bone" : "lost bone";
    if (i >= state.lives) bone.classList.add("lost");
    el.lives.appendChild(bone);
  }
}

function shake() {
  el.form.classList.remove("shake");
  void el.form.offsetWidth;
  el.form.classList.add("shake");
}

function throwBones() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = el.dog.getBoundingClientRect();
  for (let i = 0; i < 6; i++) {
    const bone = document.createElement("img");
    bone.src = IMG.bone;
    bone.className = "flying-bone";
    bone.style.left = `${rect.left + rect.width / 2 - 22}px`;
    bone.style.top = `${rect.top + rect.height / 2 - 11}px`;
    bone.style.setProperty("--dx", `${random(-160, 160)}px`);
    bone.style.setProperty("--dy", `${random(-200, -60)}px`);
    bone.style.setProperty("--rot", `${random(-360, 360)}deg`);
    document.body.appendChild(bone);
    bone.addEventListener("animationend", () => bone.remove());
  }
}

// ---------- Sound (tiny Web Audio beeps, no files needed) ----------
let audioCtx;
function playSound(kind) {
  if (!state.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = {
      good: [[660, 0], [880, 0.09]],
      bad: [[220, 0], [180, 0.12]],
      treat: [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.3]],
    }[kind];
    notes.forEach(([freq, delay]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const start = audioCtx.currentTime + delay;
      osc.type = kind === "bad" ? "sawtooth" : "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch {
    // Audio not available; the game works fine silently.
  }
}

function renderSoundButton() {
  el.soundBtn.textContent = state.sound ? "🔊" : "🔇";
  el.soundBtn.setAttribute("aria-label", state.sound ? "Turn sound off" : "Turn sound on");
}

// ---------- Input wiring ----------
el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  submitAnswer();
});

el.input.addEventListener("input", () => {
  el.input.value = el.input.value.replace(/\D/g, "").slice(0, 3);
});

el.keypad.addEventListener("click", (e) => {
  const key = e.target.closest("button")?.dataset.key;
  if (!key || state.locked) return;
  if (key === "enter") submitAnswer();
  else if (key === "back") el.input.value = el.input.value.slice(0, -1);
  else if (el.input.value.length < 3) el.input.value += key;
});

// Let kids type digits even when the input box isn't focused.
document.addEventListener("keydown", (e) => {
  if (!el.treat.hidden && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    closeTreat();
    return;
  }
  if (screens.game.hidden || state.locked || document.activeElement === el.input) return;
  if (/^\d$/.test(e.key) && el.input.value.length < 3) el.input.value += e.key;
  else if (e.key === "Backspace") el.input.value = el.input.value.slice(0, -1);
  else if (e.key === "Enter") submitAnswer();
});

el.soundBtn.addEventListener("click", () => {
  state.sound = !state.sound;
  localStorage.setItem("pawsome-sound", state.sound ? "on" : "off");
  renderSoundButton();
});

el.startBtn.addEventListener("click", startGame);
$("again-btn").addEventListener("click", startGame);
$("menu-btn").addEventListener("click", () => showScreen("start"));
$("treat-btn").addEventListener("click", closeTreat);

// ---------- Init ----------
renderChips();
renderSoundButton();
el.bestStart.textContent = state.best;
el.best.textContent = state.best;
showScreen("start");
