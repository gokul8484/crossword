const state = {
  authToken: localStorage.getItem("crossword_token") || "",
  user: JSON.parse(localStorage.getItem("crossword_user") || "null"),
  adminToken: localStorage.getItem("crossword_admin_token") || "",
  puzzles: [],
  currentPuzzle: null,
  currentPuzzleMeta: null,
  answers: {},
  startTime: null,
  timerId: null,
  sectionPollId: null,
  hintsUsed: 0,
  finished: false
};

const el = {
  username: document.getElementById("username"),
  registerBtn: document.getElementById("register-btn"),
  loginBtn: document.getElementById("login-btn"),
  playerStatus: document.getElementById("player-status"),
  puzzleList: document.getElementById("puzzle-list"),
  gameEmpty: document.getElementById("game-empty"),
  gameArea: document.getElementById("game-area"),
  puzzleTitle: document.getElementById("puzzle-title"),
  puzzleDescription: document.getElementById("puzzle-description"),
  sectionStatus: document.getElementById("section-status"),
  timer: document.getElementById("timer"),
  crosswordGrid: document.getElementById("crossword-grid"),
  acrossClues: document.getElementById("across-clues"),
  downClues: document.getElementById("down-clues"),
  hintBtn: document.getElementById("hint-btn"),
  submitBtn: document.getElementById("submit-btn"),
  resultBox: document.getElementById("result-box"),
  leaderboard: document.getElementById("leaderboard"),
  adminPassword: document.getElementById("admin-password"),
  adminLoginBtn: document.getElementById("admin-login-btn"),
  adminArea: document.getElementById("admin-area"),
  adminSectionStatus: document.getElementById("admin-section-status"),
  changeSectionBtn: document.getElementById("change-section-btn"),
  puzzleForm: document.getElementById("puzzle-form"),
  adminTitle: document.getElementById("admin-title"),
  adminDescription: document.getElementById("admin-description"),
  adminTimelimit: document.getElementById("admin-timelimit"),
  adminAcross: document.getElementById("admin-across"),
  adminDown: document.getElementById("admin-down"),
  adminResults: document.getElementById("admin-results")
};

async function request(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function notify(message) {
  window.alert(message);
}

function savePlayerSession(token, user) {
  state.authToken = token;
  state.user = user;
  localStorage.setItem("crossword_token", token);
  localStorage.setItem("crossword_user", JSON.stringify(user));
  renderPlayerStatus();
}

function renderPlayerStatus() {
  if (state.user) {
    el.playerStatus.className = "status-box";
    el.playerStatus.textContent = `Logged in as ${state.user.username}`;
  } else {
    el.playerStatus.className = "status-box muted";
    el.playerStatus.textContent = "Not logged in.";
  }
}

async function handlePlayerAuth(mode) {
  const username = el.username.value.trim();
  if (username.length < 3) {
    notify("Username must be at least 3 characters.");
    return;
  }

  const data = await request(`/api/${mode}`, {
    method: "POST",
    body: JSON.stringify({ username })
  });

  savePlayerSession(data.token, data.user);
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = String(Math.floor(safe / 60)).padStart(2, "0");
  const secs = String(safe % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function stopSectionPolling() {
  if (state.sectionPollId) {
    clearInterval(state.sectionPollId);
    state.sectionPollId = null;
  }
}

function currentElapsedSeconds() {
  if (!state.startTime) return 0;
  return Math.floor((Date.now() - state.startTime) / 1000);
}

function startTimer() {
  stopTimer();
  state.startTime = Date.now();
  state.finished = false;
  el.timer.textContent = formatTime(state.currentPuzzle.timeLimit);
  state.timerId = setInterval(() => {
    const elapsed = currentElapsedSeconds();
    const left = state.currentPuzzle.timeLimit - elapsed;
    el.timer.textContent = formatTime(left);
    if (left <= 0) {
      stopTimer();
      if (!state.finished) submitPuzzle(true).catch(error => notify(error.message));
    }
  }, 250);
}

function resetGameState() {
  state.answers = {};
  state.hintsUsed = 0;
  state.finished = false;
  el.resultBox.classList.add("hidden");
  el.resultBox.innerHTML = "";
}

function isFullCompetitionPuzzle(puzzle) {
  return puzzle && puzzle.title === "Operating Systems Full Competition";
}

function renderSectionStatus(activeSection, totalSections) {
  if (!activeSection || !totalSections) {
    el.sectionStatus.classList.add("hidden");
    el.sectionStatus.textContent = "";
    return;
  }

  el.sectionStatus.classList.remove("hidden");
  el.sectionStatus.textContent = `Current live section: ${activeSection} of ${totalSections}`;
}

function updateAnswer(key, value) {
  state.answers[key] = value.toUpperCase().replace(/[^A-Z]/g, "");
  const clueInput = document.querySelector(`.clue-answer[data-key="${key}"]`);
  if (clueInput && clueInput.value !== state.answers[key]) {
    clueInput.value = state.answers[key];
  }
  syncGridLetters();
}

function syncGridLetters(results = []) {
  const resultMap = new Map(results.map(item => [item.key, item.correct]));
  const cells = el.crosswordGrid.querySelectorAll(".grid-cell[data-keys]");

  cells.forEach(cell => {
    cell.classList.remove("correct", "incorrect");
    const keys = cell.dataset.keys.split("|");
    const indexes = cell.dataset.indexes.split("|").map(Number);
    const field = cell.querySelector("input");

    let letter = "";
    keys.forEach((key, index) => {
      const candidate = (state.answers[key] || "")[indexes[index]];
      if (!letter && candidate) letter = candidate;
    });
    field.value = letter;

    if (results.length) {
      const statuses = keys.map(key => resultMap.get(key)).filter(value => value !== undefined);
      if (statuses.length && statuses.every(Boolean)) cell.classList.add("correct");
      if (statuses.includes(false)) cell.classList.add("incorrect");
    }
  });
}

function createClueMarkup(entries, target) {
  target.innerHTML = "";
  entries.forEach(entry => {
    const key = `${entry.direction}-${entry.number}`;
    const item = document.createElement("div");
    item.className = "clue-item";
    item.innerHTML = `
      <label>${entry.number}. ${entry.clue}</label>
      <input class="clue-answer" data-key="${key}" maxlength="${entry.answer.length}" placeholder="${entry.answer.length} letters" />
    `;
    item.querySelector("input").addEventListener("input", event => updateAnswer(key, event.target.value));
    target.appendChild(item);
  });
}

function renderGrid(puzzle) {
  const cols = puzzle.grid[0].length;
  const size = window.innerWidth <= 640 ? 42 : 54;
  el.crosswordGrid.style.gridTemplateColumns = `repeat(${cols}, ${size}px)`;
  el.crosswordGrid.innerHTML = "";

  puzzle.grid.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const cellEl = document.createElement("div");
      cellEl.className = `grid-cell${cell.isBlock ? " block" : ""}`;

      if (!cell.isBlock) {
        const keys = cell.entries;
        const indexes = keys.map(key => {
          const entry = puzzle.entries.find(item => `${item.direction}-${item.number}` === key);
          return entry.direction === "across" ? colIndex - entry.col : rowIndex - entry.row;
        });

        cellEl.dataset.keys = keys.join("|");
        cellEl.dataset.indexes = indexes.join("|");

        if (cell.number) {
          const num = document.createElement("span");
          num.className = "grid-number";
          num.textContent = cell.number;
          cellEl.appendChild(num);
        }

        const input = document.createElement("input");
        input.maxLength = 1;
        input.addEventListener("input", event => {
          const value = event.target.value.toUpperCase().replace(/[^A-Z]/g, "");
          event.target.value = value;
          keys.forEach((key, i) => {
            const entry = puzzle.entries.find(item => `${item.direction}-${item.number}` === key);
            const chars = (state.answers[key] || "").padEnd(entry.answer.length, " ").split("");
            chars[indexes[i]] = value || "";
            updateAnswer(key, chars.join("").trimEnd());
          });
        });
        cellEl.appendChild(input);
      }

      el.crosswordGrid.appendChild(cellEl);
    });
  });
}

function renderLeaderboard(board = []) {
  if (!board.length) {
    el.leaderboard.className = "leaderboard-table muted";
    el.leaderboard.textContent = "No completed attempts yet.";
    return;
  }

  el.leaderboard.className = "leaderboard-table";
  el.leaderboard.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Player</th>
          <th>Score</th>
          <th>Time</th>
          <th>Correct</th>
        </tr>
      </thead>
      <tbody>
        ${board.map(item => `
          <tr>
            <td>${item.rank}</td>
            <td>${item.username}</td>
            <td>${item.score}</td>
            <td>${item.timeTaken}s</td>
            <td>${item.correctCount}/${item.totalClues}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function loadPuzzles() {
  const data = await request("/api/puzzles", { method: "GET" });
  state.puzzles = data.puzzles;

  if (!state.puzzles.length) {
    el.puzzleList.innerHTML = `<div class="card-item muted">No competitions created yet.</div>`;
    return;
  }

  el.puzzleList.innerHTML = "";
  state.puzzles.forEach(puzzle => {
    const card = document.createElement("div");
    card.className = "card-item puzzle-card";
    card.innerHTML = `
      <h3>${puzzle.title}</h3>
      <p class="muted">${puzzle.description || "Crossword competition puzzle"}</p>
      <div class="puzzle-meta">
        <span>${puzzle.timeLimit}s limit</span>
        <span>${puzzle.entryCount} clues</span>
      </div>
      <div class="button-row">
        <button type="button">Start</button>
      </div>
    `;
    card.querySelector("button").addEventListener("click", () => openPuzzle(puzzle.id).catch(error => notify(error.message)));
    el.puzzleList.appendChild(card);
  });
}

async function openPuzzle(puzzleId) {
  const data = await request(`/api/puzzles/${puzzleId}`, { method: "GET" });
  stopSectionPolling();
  state.currentPuzzle = data.puzzle;
  state.currentPuzzleMeta = {
    id: puzzleId,
    activeSection: data.activeSection,
    totalSections: data.totalSections
  };
  resetGameState();
  el.gameEmpty.classList.add("hidden");
  el.gameArea.classList.remove("hidden");
  el.puzzleTitle.textContent = data.puzzle.title;
  el.puzzleDescription.textContent = data.puzzle.description || "Complete all clues before the timer runs out.";
  renderSectionStatus(data.activeSection, data.totalSections);
  renderGrid(data.puzzle);
  createClueMarkup(data.puzzle.entries.filter(item => item.direction === "across"), el.acrossClues);
  createClueMarkup(data.puzzle.entries.filter(item => item.direction === "down"), el.downClues);
  renderLeaderboard(data.leaderboard);
  startTimer();
  if (isFullCompetitionPuzzle(data.puzzle)) {
    startSectionPolling();
  }
}

function startSectionPolling() {
  stopSectionPolling();
  state.sectionPollId = setInterval(async () => {
    if (!state.currentPuzzleMeta || !state.currentPuzzle || !isFullCompetitionPuzzle(state.currentPuzzle)) return;
    const data = await request(`/api/puzzles/${state.currentPuzzleMeta.id}`, { method: "GET" });
    if (data.activeSection !== state.currentPuzzleMeta.activeSection) {
      await openPuzzle(state.currentPuzzleMeta.id);
      notify(`Admin switched to Section ${data.activeSection}. The next 5 questions are now live.`);
    }
  }, 5000);
}

function buildResultMarkup(result) {
  const detailRows = result.details.map(item => `
    <tr>
      <td>${item.number} ${item.direction}</td>
      <td>${item.given || "-"}</td>
      <td>${item.answer}</td>
      <td>${item.correct ? "Correct" : "Incorrect"}</td>
    </tr>
  `).join("");

  return `
    <h3>Round Complete</h3>
    <p><strong>Score:</strong> ${result.score} | <strong>Time:</strong> ${result.timeTaken}s | <strong>Hints:</strong> ${result.hintsUsed}</p>
    <p><strong>Accuracy:</strong> ${result.correctCount}/${result.totalClues}</p>
    <table>
      <thead>
        <tr>
          <th>Clue</th>
          <th>Your Answer</th>
          <th>Correct Answer</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${detailRows}</tbody>
    </table>
  `;
}

async function submitPuzzle(fromTimeout = false) {
  if (!state.currentPuzzle || state.finished) return;
  if (!state.user) {
    notify("Please log in before submitting.");
    return;
  }

  state.finished = true;
  stopTimer();

  const data = await request(`/api/submit/${state.currentPuzzle.id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.authToken}` },
    body: JSON.stringify({
      answers: state.answers,
      elapsedSeconds: currentElapsedSeconds(),
      hintsUsed: state.hintsUsed
    })
  });

  syncGridLetters(data.result.details);
  el.resultBox.classList.remove("hidden");
  el.resultBox.innerHTML = buildResultMarkup(data.result);
  renderLeaderboard(data.leaderboard);
  if (fromTimeout) notify("Time is up. Your puzzle has been submitted automatically.");
  if (state.adminToken) loadAdminResults().catch(() => {});
}

function useHint() {
  if (!state.currentPuzzle || state.finished) return;

  const pending = state.currentPuzzle.entries.find(entry => {
    const key = `${entry.direction}-${entry.number}`;
    return (state.answers[key] || "").toUpperCase() !== entry.answer.toUpperCase();
  });

  if (!pending) {
    notify("All clues are already filled.");
    return;
  }

  const key = `${pending.direction}-${pending.number}`;
  const chars = (state.answers[key] || "").padEnd(pending.answer.length, " ").split("");
  const nextIndex = chars.findIndex((char, index) => char !== pending.answer[index]);
  if (nextIndex === -1) return;
  chars[nextIndex] = pending.answer[nextIndex];
  state.hintsUsed += 1;
  updateAnswer(key, chars.join("").trimEnd());
}

async function adminLogin() {
  const data = await request("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password: el.adminPassword.value })
  });

  state.adminToken = data.token;
  localStorage.setItem("crossword_admin_token", data.token);
  el.adminArea.classList.remove("hidden");
  await loadCompetitionState();
  await loadAdminResults();
}

async function loadCompetitionState() {
  const data = await request("/api/admin/competition-state", {
    method: "GET",
    headers: { Authorization: `Bearer ${state.adminToken}` }
  });
  el.adminSectionStatus.textContent = `Section ${data.fullCompetitionSection}`;
}

async function changeSection() {
  const data = await request("/api/admin/change-section", {
    method: "POST",
    headers: { Authorization: `Bearer ${state.adminToken}` },
    body: JSON.stringify({})
  });

  el.adminSectionStatus.textContent = `Section ${data.fullCompetitionSection}`;
  if (state.currentPuzzleMeta && isFullCompetitionPuzzle(state.currentPuzzle)) {
    await openPuzzle(state.currentPuzzleMeta.id);
  }
  if (data.isLastSection) {
    notify("The full competition is already on the last section.");
  } else {
    notify(`Section changed. Section ${data.fullCompetitionSection} is now live.`);
  }
}

function parseAdminEntries(text, direction) {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [number, row, col, answer, ...clueParts] = line.split(",");
      return {
        number: Number(number),
        row: Number(row),
        col: Number(col),
        answer: (answer || "").trim().toUpperCase(),
        clue: clueParts.join(",").trim(),
        direction
      };
    });
}

async function createPuzzle(event) {
  event.preventDefault();
  const entries = [
    ...parseAdminEntries(el.adminAcross.value, "across"),
    ...parseAdminEntries(el.adminDown.value, "down")
  ];

  await request("/api/admin/puzzles", {
    method: "POST",
    headers: { Authorization: `Bearer ${state.adminToken}` },
    body: JSON.stringify({
      title: el.adminTitle.value.trim(),
      description: el.adminDescription.value.trim(),
      timeLimit: Number(el.adminTimelimit.value),
      entries
    })
  });

  el.puzzleForm.reset();
  el.adminTimelimit.value = 20;
  await loadPuzzles();
  notify("Puzzle created successfully.");
}

async function loadAdminResults() {
  const data = await request("/api/admin/results", {
    method: "GET",
    headers: { Authorization: `Bearer ${state.adminToken}` }
  });

  if (!data.results.length) {
    el.adminResults.className = "card-list muted";
    el.adminResults.textContent = "No results yet.";
    return;
  }

  el.adminResults.className = "card-list";
  el.adminResults.innerHTML = data.results.slice(0, 12).map(item => `
    <div class="card-item">
      <strong>${item.username}</strong> finished <strong>${item.puzzleTitle}</strong><br />
      Score: ${item.score} | Time: ${item.timeTaken}s | Correct: ${item.correctCount}/${item.totalClues}
    </div>
  `).join("");
}

el.registerBtn.addEventListener("click", () => handlePlayerAuth("register").catch(error => notify(error.message)));
el.loginBtn.addEventListener("click", () => handlePlayerAuth("login").catch(error => notify(error.message)));
el.hintBtn.addEventListener("click", useHint);
el.submitBtn.addEventListener("click", () => submitPuzzle(false).catch(error => notify(error.message)));
el.adminLoginBtn.addEventListener("click", () => adminLogin().catch(error => notify(error.message)));
el.changeSectionBtn.addEventListener("click", () => changeSection().catch(error => notify(error.message)));
el.puzzleForm.addEventListener("submit", event => createPuzzle(event).catch(error => notify(error.message)));

renderPlayerStatus();
if (state.adminToken) {
  el.adminArea.classList.remove("hidden");
  Promise.all([loadCompetitionState(), loadAdminResults()]).catch(() => {
    localStorage.removeItem("crossword_admin_token");
    state.adminToken = "";
    el.adminArea.classList.add("hidden");
  });
}
loadPuzzles().catch(error => notify(error.message));
