const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "gokuldevi";

const sessions = new Map();
const adminSessions = new Set();

const FULL_COMPETITION_TITLE = "Operating Systems Full Competition";

function buildLinearEntries(items, options = {}) {
  const startNumber = options.startNumber || 1;
  return items.map((item, index) => ({
    number: startNumber + index,
    direction: "across",
    row: index * 2,
    col: 0,
    answer: item.answer.replace(/\s+/g, "").toUpperCase(),
    clue: `${item.clue} (${item.length})`,
    section: item.section || null,
    sectionTitle: item.sectionTitle || null
  }));
}

function getOsSections() {
  return [
    {
      title: "OS Section 1: Process Management & Scheduling",
      description: "Five operating systems clues about processes, scheduling, and CPU control.",
      timeLimit: 120,
      items: [
        { clue: "The state a process enters when it is waiting for the CPU to become available.", answer: "READY", length: "5 letters" },
        { clue: "A situation where two or more processes are unable to proceed because each is waiting for the other to release a resource.", answer: "DEADLOCK", length: "8 letters" },
        { clue: "The scheduling algorithm that assigns a fixed time unit (quantum) to each process.", answer: "ROUND ROBIN", length: "5, 6 letters" },
        { clue: "A lightweight process that shares the same address space as its parent.", answer: "THREAD", length: "6 letters" },
        { clue: "The module that gives control of the CPU to the process selected by the short-term scheduler.", answer: "DISPATCHER", length: "10 letters" }
      ]
    },
    {
      title: "OS Section 2: Memory Management",
      description: "Timed crossword clues on RAM, paging, and virtual memory.",
      timeLimit: 120,
      items: [
        { clue: "A memory management scheme that eliminates the need for contiguous allocation of physical memory by using fixed-size blocks.", answer: "PAGING", length: "6 letters" },
        { clue: "The phenomenon where memory is wasted because small holes are scattered throughout the RAM.", answer: "FRAGMENTATION", length: "14 letters" },
        { clue: "A hardware unit that maps logical addresses to physical addresses.", answer: "MMU", length: "3 letters - abbreviation" },
        { clue: "The strategy of loading a page into memory only when it is needed.", answer: "DEMAND PAGING", length: "6, 6 letters" },
        { clue: "An error that occurs when a process attempts to access a page not currently in main memory.", answer: "PAGE FAULT", length: "4, 5 letters" }
      ]
    },
    {
      title: "OS Section 3: Storage & File Systems",
      description: "Unix files, disks, swapping, and storage structures.",
      timeLimit: 120,
      items: [
        { clue: "A data structure used by Unix-style file systems to store information about a file, excluding its name.", answer: "INODE", length: "5 letters" },
        { clue: "The time it takes for the disk arm to move the heads to the cylinder containing the desired sector.", answer: "SEEK TIME", length: "4, 4 letters" },
        { clue: "A specific area of the disk used to hold pages of memory that have been pushed out of RAM.", answer: "SWAP SPACE", length: "4, 5 letters" },
        { clue: "The file allocation method that uses a table like FAT to store pointers to file blocks.", answer: "LINKED", length: "6 letters" },
        { clue: "A virtual disk or storage area that appears to the OS as a physical drive but exists in RAM.", answer: "RAM DISK", length: "3, 4 letters" }
      ]
    },
    {
      title: "OS Section 4: Concurrency & Synchronization",
      description: "Synchronization, shared resources, and process communication.",
      timeLimit: 120,
      items: [
        { clue: "An integer variable used for signaling that can only be accessed through two standard atomic operations: wait and signal.", answer: "SEMAPHORE", length: "9 letters" },
        { clue: "A condition where multiple processes access and manipulate the same data concurrently, and the outcome depends on the order of execution.", answer: "RACE CONDITION", length: "4, 10 letters" },
        { clue: "A high-level abstraction that provides a convenient and effective mechanism for process synchronization.", answer: "MONITOR", length: "7 letters" },
        { clue: "The section of code where a process accesses shared resources.", answer: "CRITICAL SECTION", length: "8, 7 letters" },
        { clue: "A synchronization primitive that is essentially a binary semaphore.", answer: "MUTEX", length: "5 letters" }
      ]
    },
    {
      title: "OS Section 5: Security & System Calls",
      description: "Kernel access, privilege, and the user-to-kernel interface.",
      timeLimit: 120,
      items: [
        { clue: "The mode of the CPU that allows execution of privileged instructions.", answer: "KERNEL", length: "6 letters" },
        { clue: "The programmatic way in which a user-level program requests a service from the kernel.", answer: "SYSTEM CALL", length: "6, 4 letters" },
        { clue: "A software-generated interrupt caused either by an error or a user request.", answer: "TRAP", length: "4 letters" },
        { clue: "A security model where a subject is granted only the rights necessary to complete its task.", answer: "LEAST PRIVILEGE", length: "5, 9 letters" },
        { clue: "The core part of an operating system that manages operations of the computer and hardware.", answer: "KERNEL", length: "6 letters" }
      ]
    }
  ];
}

function createSeedPuzzles() {
  const sections = getOsSections();
  const sectionPuzzles = sections.map(section => ({
    id: crypto.randomUUID(),
    title: section.title,
    description: section.description,
    timeLimit: section.timeLimit,
    entries: buildLinearEntries(section.items)
  }));
  const combinedItems = sections.flatMap((section, sectionIndex) =>
    section.items.map((item, itemIndex) => ({
      clue: `Section ${sectionIndex + 1}.${itemIndex + 1}: ${item.clue}`,
      answer: item.answer,
      length: item.length,
      section: sectionIndex + 1,
      sectionTitle: section.title
    }))
  );

  return [
    {
      id: crypto.randomUUID(),
      title: FULL_COMPETITION_TITLE,
      description: "All five OS sections combined into one 25-question challenge.",
      timeLimit: 600,
      entries: buildLinearEntries(combinedItems)
    },
    ...sectionPuzzles
  ];
}

function isStandaloneSectionPuzzle(puzzle) {
  return /^OS Section \d+:/.test(puzzle.title);
}

function seedMissingPuzzles(data) {
  const existingTitles = new Set(data.puzzles.map(puzzle => puzzle.title));
  const seeded = createSeedPuzzles().filter(puzzle => !existingTitles.has(puzzle.title));
  if (seeded.length) {
    data.puzzles.push(...seeded);
  }
  return data;
}

function ensureCompetitionState(data) {
  if (!data.competitionState) {
    data.competitionState = {};
  }

  if (!Number.isInteger(data.competitionState.fullCompetitionSection)) {
    data.competitionState.fullCompetitionSection = 1;
  }

  return data;
}

function migrateFullCompetitionEntries(data) {
  const fullCompetition = data.puzzles.find(puzzle => puzzle.title === FULL_COMPETITION_TITLE);
  if (!fullCompetition || !Array.isArray(fullCompetition.entries) || !fullCompetition.entries.length) {
    return false;
  }

  const needsMigration = fullCompetition.entries.some(entry => !entry.section);
  if (!needsMigration) {
    return false;
  }

  const sections = getOsSections();
  fullCompetition.entries = fullCompetition.entries.map((entry, index) => {
    const sectionIndex = Math.min(Math.floor(index / 5), sections.length - 1);
    return {
      ...entry,
      section: sectionIndex + 1,
      sectionTitle: sections[sectionIndex].title
    };
  });

  return true;
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(
        {
          users: [],
          puzzles: createSeedPuzzles(),
          results: [],
          competitionState: {
            fullCompetitionSection: 1
          }
        },
        null,
        2
      )
    );
  }
}

function readDb() {
  ensureDataFile();
  const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  const countBefore = data.puzzles.length;
  const hadState = Boolean(data.competitionState);
  const seeded = ensureCompetitionState(seedMissingPuzzles(data));
  const migratedFullCompetition = migrateFullCompetitionEntries(seeded);
  if (seeded.puzzles.length !== countBefore || !hadState || migratedFullCompetition) {
    writeDb(seeded);
  }
  return seeded;
}

function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function getToken(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

function requireUser(req) {
  const token = getToken(req);
  if (!token || !sessions.has(token)) return null;
  return sessions.get(token);
}

function requireAdmin(req) {
  const token = getToken(req);
  return token && adminSessions.has(token);
}

function sanitizeUser(user) {
  return { id: user.id, username: user.username };
}

function puzzleSummary(puzzle) {
  return {
    id: puzzle.id,
    title: puzzle.title,
    description: puzzle.description,
    timeLimit: puzzle.timeLimit,
    entryCount: puzzle.entries.length
  };
}

function normalizeEntry(entry) {
  return {
    number: Number(entry.number),
    direction: entry.direction === "down" ? "down" : "across",
    row: Number(entry.row),
    col: Number(entry.col),
    answer: String(entry.answer || "").trim().toUpperCase(),
    clue: String(entry.clue || "").trim()
  };
}

function validatePuzzleInput(input) {
  const title = String(input.title || "").trim();
  const description = String(input.description || "").trim();
  const timeLimit = Number(input.timeLimit);
  const entries = Array.isArray(input.entries) ? input.entries.map(normalizeEntry) : [];

  if (!title) return { error: "Puzzle title is required." };
  if (!Number.isFinite(timeLimit) || timeLimit < 5 || timeLimit > 600) {
    return { error: "Time limit must be between 5 and 600 seconds." };
  }
  if (!entries.length) return { error: "At least one clue entry is required." };

  for (const entry of entries) {
    if (!entry.answer || !entry.clue) return { error: "Every entry needs an answer and clue." };
    if (!Number.isInteger(entry.number) || !Number.isInteger(entry.row) || !Number.isInteger(entry.col)) {
      return { error: "Entry number, row, and col must be integers." };
    }
  }

  return { value: { title, description, timeLimit, entries } };
}

function buildPuzzleBoard(puzzle) {
  return buildPuzzleBoardForEntries(puzzle, puzzle.entries);
}

function buildPuzzleBoardForEntries(puzzle, entries) {
  let rows = 0;
  let cols = 0;

  for (const entry of entries) {
    rows = Math.max(rows, entry.row + (entry.direction === "down" ? entry.answer.length : 1));
    cols = Math.max(cols, entry.col + (entry.direction === "across" ? entry.answer.length : 1));
  }

  const grid = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      isBlock: true,
      solution: "",
      number: null,
      entries: []
    }))
  );

  for (const entry of entries) {
    for (let i = 0; i < entry.answer.length; i += 1) {
      const row = entry.row + (entry.direction === "down" ? i : 0);
      const col = entry.col + (entry.direction === "across" ? i : 0);
      const cell = grid[row][col];
      cell.isBlock = false;
      cell.solution = entry.answer[i];
      cell.entries.push(`${entry.direction}-${entry.number}`);
      if (i === 0) cell.number = entry.number;
    }
  }

  return {
    ...puzzleSummary(puzzle),
    grid,
    entries
  };
}

function getPuzzleView(db, puzzle) {
  if (puzzle.title !== FULL_COMPETITION_TITLE) {
    return { puzzle: buildPuzzleBoard(puzzle), activeSection: null, totalSections: null };
  }

  const activeSection = Math.min(Math.max(1, db.competitionState.fullCompetitionSection || 1), 5);
  const entries = puzzle.entries.filter(entry => entry.section === activeSection);

  return {
    puzzle: buildPuzzleBoardForEntries(
      {
        ...puzzle,
        description: `${puzzle.description} Currently live: ${entries[0]?.sectionTitle || `Section ${activeSection}`}.`
      },
      entries
    ),
    activeSection,
    totalSections: 5
  };
}

function scoreSubmission(puzzle, answers, elapsedSeconds, hintsUsed) {
  const details = puzzle.entries.map(entry => {
    const key = `${entry.direction}-${entry.number}`;
    const given = String(answers[key] || "").trim().toUpperCase();
    const correct = given === entry.answer.toUpperCase();
    return { key, number: entry.number, direction: entry.direction, clue: entry.clue, answer: entry.answer, given, correct };
  });

  const correctCount = details.filter(item => item.correct).length;
  const accuracy = correctCount / details.length;
  const timeLeft = Math.max(0, puzzle.timeLimit - elapsedSeconds);
  const score = Math.max(0, Math.round(correctCount * 100 + accuracy * 50 + timeLeft * 5 - hintsUsed * 20));

  return { score, correctCount, totalClues: details.length, accuracy, details };
}

function getLeaderboard(db, puzzleId) {
  return db.results
    .filter(result => result.puzzleId === puzzleId)
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.timeTaken - b.timeTaken))
    .map((result, index) => ({
      rank: index + 1,
      username: result.username,
      score: result.score,
      timeTaken: result.timeTaken,
      correctCount: result.correctCount,
      totalClues: result.totalClues,
      completedAt: result.completedAt
    }));
}

function getFullCompetitionPuzzle(db) {
  return db.puzzles.find(item => item.title === FULL_COMPETITION_TITLE);
}

function serveStatic(res, pathname) {
  const filePath = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
  const normalized = path.normalize(filePath);

  if (!normalized.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(normalized, (err, content) => {
    if (err) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const ext = path.extname(normalized).toLowerCase();
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8"
    };

    res.writeHead(200, { "Content-Type": contentTypes[ext] || "text/plain; charset=utf-8" });
    res.end(content);
  });
}

async function handleApi(req, res, pathname) {
  const db = readDb();

  if (req.method === "POST" && pathname === "/api/register") {
    const body = await parseBody(req);
    const username = String(body.username || "").trim();
    if (!username || username.length < 3) {
      sendJson(res, 400, { error: "Username must be at least 3 characters." });
      return;
    }

    let user = db.users.find(item => item.username.toLowerCase() === username.toLowerCase());
    if (!user) {
      user = { id: crypto.randomUUID(), username };
      db.users.push(user);
      writeDb(db);
    }

    const token = crypto.randomUUID();
    sessions.set(token, sanitizeUser(user));
    sendJson(res, 200, { token, user: sanitizeUser(user) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await parseBody(req);
    const username = String(body.username || "").trim();
    const user = db.users.find(item => item.username.toLowerCase() === username.toLowerCase());
    if (!user) {
      sendJson(res, 404, { error: "User not found. Please register first." });
      return;
    }

    const token = crypto.randomUUID();
    sessions.set(token, sanitizeUser(user));
    sendJson(res, 200, { token, user: sanitizeUser(user) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/login") {
    const body = await parseBody(req);
    if (String(body.password || "") !== ADMIN_PASSWORD) {
      sendJson(res, 401, { error: "Invalid admin password." });
      return;
    }

    const token = crypto.randomUUID();
    adminSessions.add(token);
    sendJson(res, 200, { token });
    return;
  }

  if (req.method === "GET" && pathname === "/api/puzzles") {
    sendJson(res, 200, {
      puzzles: db.puzzles
        .filter(puzzle => !isStandaloneSectionPuzzle(puzzle))
        .map(puzzleSummary)
    });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/puzzles/")) {
    const puzzleId = pathname.split("/")[3];
    const puzzle = db.puzzles.find(item => item.id === puzzleId);
    if (!puzzle) {
      sendJson(res, 404, { error: "Puzzle not found." });
      return;
    }

    const view = getPuzzleView(db, puzzle);
    sendJson(res, 200, {
      puzzle: view.puzzle,
      leaderboard: getLeaderboard(db, puzzleId).slice(0, 10),
      activeSection: view.activeSection,
      totalSections: view.totalSections
    });
    return;
  }

  if (req.method === "POST" && pathname.startsWith("/api/submit/")) {
    const user = requireUser(req);
    if (!user) {
      sendJson(res, 401, { error: "Please log in to submit a puzzle." });
      return;
    }

    const puzzleId = pathname.split("/")[3];
    const puzzle = db.puzzles.find(item => item.id === puzzleId);
    if (!puzzle) {
      sendJson(res, 404, { error: "Puzzle not found." });
      return;
    }

    const scoringPuzzle =
      puzzle.title === FULL_COMPETITION_TITLE
        ? {
            ...puzzle,
            entries: puzzle.entries.filter(entry => entry.section === (db.competitionState.fullCompetitionSection || 1))
          }
        : puzzle;

    const body = await parseBody(req);
    const score = scoreSubmission(
      scoringPuzzle,
      body.answers || {},
      Math.max(0, Number(body.elapsedSeconds) || 0),
      Math.max(0, Number(body.hintsUsed) || 0)
    );

    const result = {
      id: crypto.randomUUID(),
      puzzleId,
      username: user.username,
      score: score.score,
      timeTaken: Math.min(Math.max(0, Number(body.elapsedSeconds) || 0), scoringPuzzle.timeLimit),
      correctCount: score.correctCount,
      totalClues: score.totalClues,
      hintsUsed: Math.max(0, Number(body.hintsUsed) || 0),
      completedAt: new Date().toISOString()
    };

    db.results.push(result);
    writeDb(db);

    sendJson(res, 200, {
      result: { ...result, accuracy: score.accuracy, details: score.details },
      leaderboard: getLeaderboard(db, puzzleId).slice(0, 10)
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/puzzles") {
    if (!requireAdmin(req)) {
      sendJson(res, 401, { error: "Admin login required." });
      return;
    }

    const parsed = validatePuzzleInput(await parseBody(req));
    if (parsed.error) {
      sendJson(res, 400, { error: parsed.error });
      return;
    }

    const puzzle = { id: crypto.randomUUID(), ...parsed.value };
    db.puzzles.unshift(puzzle);
    writeDb(db);
    sendJson(res, 201, { puzzle: puzzleSummary(puzzle) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/results") {
    if (!requireAdmin(req)) {
      sendJson(res, 401, { error: "Admin login required." });
      return;
    }

    const results = db.results
      .slice()
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .map(result => {
        const puzzle = db.puzzles.find(item => item.id === result.puzzleId);
        return { ...result, puzzleTitle: puzzle ? puzzle.title : "Unknown puzzle" };
      });

    sendJson(res, 200, { results });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/competition-state") {
    if (!requireAdmin(req)) {
      sendJson(res, 401, { error: "Admin login required." });
      return;
    }

    sendJson(res, 200, { fullCompetitionSection: db.competitionState.fullCompetitionSection || 1 });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/change-section") {
    if (!requireAdmin(req)) {
      sendJson(res, 401, { error: "Admin login required." });
      return;
    }

    const fullCompetition = getFullCompetitionPuzzle(db);
    if (!fullCompetition) {
      sendJson(res, 404, { error: "Full competition puzzle not found." });
      return;
    }

    const sectionNumbers = [...new Set(fullCompetition.entries.map(entry => entry.section).filter(Boolean))].sort((a, b) => a - b);
    const currentSection = db.competitionState.fullCompetitionSection || 1;
    const currentIndex = Math.max(0, sectionNumbers.indexOf(currentSection));
    const nextSection = sectionNumbers[Math.min(currentIndex + 1, sectionNumbers.length - 1)];

    db.competitionState.fullCompetitionSection = nextSection;
    writeDb(db);

    sendJson(res, 200, {
      fullCompetitionSection: nextSection,
      isLastSection: nextSection === sectionNumbers[sectionNumbers.length - 1]
    });
    return;
  }

  sendJson(res, 404, { error: "API route not found." });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
      return;
    }

    serveStatic(res, pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal server error" });
  }
});

ensureDataFile();
server.listen(PORT, () => {
  console.log(`Crossword app running on http://localhost:${PORT}`);
});
