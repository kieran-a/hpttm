const STORAGE_KEY = "heat-race-tracker-v2";
const LEGACY_STORAGE_KEY = "heat-race-tracker-v1";
const POINTS = [9, 6, 4, 3, 2, 1];
const COLOURS = [
  { name: "Red", value: "#e53935" },
  { name: "Blue", value: "#1e88e5" },
  { name: "Green", value: "#43a047" },
  { name: "Yellow", value: "#fdd835" },
  { name: "Black", value: "#111111" },
  { name: "Grey", value: "#A9A9A9" },
  { name: "Orange", value: "#fb8c00" },
  { name: "Purple", value: "#8e24aa" },
];

const state = loadState();
let finishOrder = [];
let editingRaceId = null;

const elements = {
  championshipForm: document.querySelector("#championship-form"),
  championshipName: document.querySelector("#championship-name"),
  championships: document.querySelector("#championships"),
  activeChampionshipLabel: document.querySelector("#active-championship-label"),
  raceChampionshipLabel: document.querySelector("#race-championship-label"),
  playerForm: document.querySelector("#player-form"),
  playerName: document.querySelector("#player-name"),
  playerColour: document.querySelector("#player-colour"),
  players: document.querySelector("#players"),
  raceForm: document.querySelector("#race-form"),
  track: document.querySelector("#track"),
  raceDate: document.querySelector("#race-date"),
  notes: document.querySelector("#notes"),
  saveRace: document.querySelector("#save-race"),
  cancelEdit: document.querySelector("#cancel-edit"),
  finishOrder: document.querySelector("#finish-order"),
  driverButtons: document.querySelector("#driver-buttons"),
  standings: document.querySelector("#standings"),
  raceHistory: document.querySelector("#race-history"),
  clearOrder: document.querySelector("#clear-order"),
  resetData: document.querySelector("#reset-data"),
  exportJson: document.querySelector("#export-json"),
  importJson: document.querySelector("#import-json"),
  standingTemplate: document.querySelector("#standing-row-template"),
};

renderColourOptions();
elements.raceDate.valueAsDate = new Date();

elements.championshipForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.championshipName.value.trim();

  if (!name) return;
  if (state.championships.some((championship) => championship.name.toLowerCase() === name.toLowerCase())) {
    alert("That championship already exists.");
    return;
  }

  const championship = { id: createId(), name, complete: false, createdAt: new Date().toISOString() };
  state.championships.push(championship);
  state.activeChampionshipId = championship.id;
  elements.championshipName.value = "";
  clearRaceForm();
  saveAndRender();
});

elements.championships.addEventListener("click", (event) => {
  const selectButton = event.target.closest("button[data-select-championship]");
  const toggleCompleteButton = event.target.closest("button[data-toggle-complete-championship]");
  const deleteButton = event.target.closest("button[data-delete-championship]");

  if (selectButton) {
    state.activeChampionshipId = selectButton.dataset.selectChampionship;
    clearRaceForm();
    saveAndRender();
    return;
  }

  if (toggleCompleteButton) {
    const championship = findChampionship(toggleCompleteButton.dataset.toggleCompleteChampionship);
    if (!championship) return;

    championship.complete = !championship.complete;
    saveAndRender();
    return;
  }

  if (!deleteButton) return;

  const championshipId = deleteButton.dataset.deleteChampionship;
  const championship = findChampionship(championshipId);
  const raceCount = getChampionshipRaces(championshipId).length;
  const message = raceCount
    ? `Delete ${championship.name} and its ${raceCount} races?`
    : `Delete ${championship.name}?`;

  if (!confirm(message)) return;

  state.championships = state.championships.filter((item) => item.id !== championshipId);
  state.races = state.races.filter((race) => race.championshipId !== championshipId);
  if (state.activeChampionshipId === championshipId) {
    state.activeChampionshipId = state.championships[0]?.id || null;
    clearRaceForm();
  }
  saveAndRender();
});

elements.playerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.playerName.value.trim();

  if (!name) return;
  if (state.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
    alert("That driver is already on the roster.");
    return;
  }

  state.players.push({ id: createId(), name, colour: elements.playerColour.value || COLOURS[0].value });
  elements.playerName.value = "";
  elements.playerColour.value = nextUnusedColour();
  saveAndRender();
});

elements.players.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-remove-player]");
  if (!button) return;

  const playerId = button.dataset.removePlayer;
  const player = findPlayer(playerId);
  const hasRaces = state.races.some((race) => race.results.includes(playerId));

  if (hasRaces) {
    alert(`${player.name} appears in race history, so they cannot be deleted.`);
    return;
  }

  state.players = state.players.filter((item) => item.id !== playerId);
  finishOrder = finishOrder.filter((id) => id !== playerId);
  saveAndRender();
});

elements.players.addEventListener("change", (event) => {
  const select = event.target.closest("select[data-colour-player]");
  if (!select) return;

  const player = findPlayer(select.dataset.colourPlayer);
  if (!player || !isValidColour(select.value)) return;

  player.colour = select.value;
  saveAndRender();
});

elements.driverButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-driver]");
  if (!button) return;

  const playerId = button.dataset.driver;
  if (!finishOrder.includes(playerId)) {
    finishOrder.push(playerId);
    render();
  }
});

elements.finishOrder.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-unrank]");
  if (!button) return;

  finishOrder = finishOrder.filter((id) => id !== button.dataset.unrank);
  render();
});

elements.clearOrder.addEventListener("click", () => {
  finishOrder = [];
  render();
});

elements.cancelEdit.addEventListener("click", () => {
  clearRaceForm();
  render();
});

elements.raceForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!state.activeChampionshipId) {
    alert("Create or select a championship before saving races.");
    return;
  }

  if (state.players.length < 2) {
    alert("Add at least two drivers before saving a race.");
    return;
  }

  if (finishOrder.length !== state.players.length) {
    alert("Rank every rostered driver before saving the race.");
    return;
  }

  const existingRace = editingRaceId ? state.races.find((item) => item.id === editingRaceId) : null;
  const race = {
    id: editingRaceId || createId(),
    championshipId: state.activeChampionshipId,
    track: elements.track.value.trim(),
    date: elements.raceDate.value,
    results: [...finishOrder],
    notes: elements.notes.value.trim(),
    createdAt: existingRace?.createdAt || new Date().toISOString(),
  };

  if (editingRaceId) race.updatedAt = new Date().toISOString();

  if (editingRaceId) {
    state.races = state.races.map((item) => item.id === editingRaceId ? race : item);
  } else {
    state.races.push(race);
  }

  clearRaceForm();
  saveAndRender();
});

elements.raceHistory.addEventListener("click", (event) => {
  const editButton = event.target.closest("button[data-edit-race]");
  if (!editButton) return;

  const race = state.races.find((item) => item.id === editButton.dataset.editRace);
  if (!race) return;

  state.activeChampionshipId = race.championshipId;
  editingRaceId = race.id;
  elements.track.value = race.track;
  elements.raceDate.value = race.date;
  elements.notes.value = race.notes;
  finishOrder = [...race.results];
  document.querySelector("#race-title").scrollIntoView({ behavior: "smooth", block: "start" });
  render();
});

elements.raceHistory.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-delete-race]");
  if (!button) return;

  if (confirm("Delete this race from the championship?")) {
    state.races = state.races.filter((race) => race.id !== button.dataset.deleteRace);
    if (editingRaceId === button.dataset.deleteRace) clearRaceForm();
    saveAndRender();
  }
});

elements.resetData.addEventListener("click", () => {
  if (!confirm("Reset all championships, drivers, and races? Export a backup first if you want to keep this data.")) return;
  state.championships = [];
  state.activeChampionshipId = null;
  state.players = [];
  state.races = [];
  clearRaceForm();
  saveAndRender();
});

elements.exportJson.addEventListener("click", () => {
  const backup = {
    app: "heat-race-tracker",
    version: 2,
    exportedAt: new Date().toISOString(),
    points: POINTS,
    activeChampionshipId: state.activeChampionshipId,
    championships: state.championships,
    players: state.players,
    races: state.races,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `heat-race-tracker-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

elements.importJson.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const backup = JSON.parse(await file.text());
    const imported = validateImport(backup);

    if (!confirm("Importing this JSON will replace your current tracker data. Continue?")) return;

    state.championships = imported.championships;
    state.activeChampionshipId = imported.activeChampionshipId;
    state.players = imported.players;
    state.races = imported.races;
    clearRaceForm(false);
    saveAndRender();
  } catch (error) {
    alert(`Could not import JSON: ${error.message}`);
  } finally {
    elements.importJson.value = "";
  }
});

function loadState() {
  const fallback = { championships: [], activeChampionshipId: null, players: [], races: [] };
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return fallback;

  try {
    return validateImport(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

function validateImport(data) {
  if (!data || !Array.isArray(data.players) || !Array.isArray(data.races)) {
    throw new Error("expected players and races arrays");
  }

  const players = data.players.map((player, index) => {
    if (!player.id || !player.name) throw new Error("a player is missing id or name");
    return {
      id: String(player.id),
      name: String(player.name).trim(),
      colour: isValidColour(player.colour) ? player.colour : COLOURS[index % COLOURS.length].value,
    };
  });

  const hasChampionships = Array.isArray(data.championships);
  const defaultChampionship = { id: createId(), name: "Championship 1", complete: false, createdAt: new Date().toISOString() };
  const championships = hasChampionships
    ? data.championships.map((championship) => {
        if (!championship.id || !championship.name) throw new Error("a championship is missing id or name");
        return {
          id: String(championship.id),
          name: String(championship.name).trim(),
          complete: championship.complete === true,
          createdAt: championship.createdAt ? String(championship.createdAt) : new Date().toISOString(),
        };
      })
    : data.races.length ? [defaultChampionship] : [];

  const playerIds = new Set(players.map((player) => player.id));
  const championshipIds = new Set(championships.map((championship) => championship.id));
  const races = data.races.map((race) => {
    if (!race.id || !race.track || !race.date || !Array.isArray(race.results)) {
      throw new Error("a race is missing id, track, date, or results");
    }

    const championshipId = hasChampionships ? String(race.championshipId || "") : defaultChampionship.id;
    if (!championshipIds.has(championshipId)) {
      throw new Error("a race references a championship that does not exist");
    }

    const results = race.results.map(String);
    if (results.some((id) => !playerIds.has(id))) {
      throw new Error("a race references a driver that is not in the roster");
    }

    if (new Set(results).size !== results.length) {
      throw new Error("a race contains duplicate drivers");
    }

    return {
      id: String(race.id),
      championshipId,
      track: String(race.track).trim(),
      date: String(race.date),
      results,
      notes: race.notes ? String(race.notes) : "",
      createdAt: race.createdAt ? String(race.createdAt) : new Date().toISOString(),
      updatedAt: race.updatedAt ? String(race.updatedAt) : undefined,
    };
  });

  const requestedActiveId = data.activeChampionshipId ? String(data.activeChampionshipId) : null;
  const activeChampionshipId = championshipIds.has(requestedActiveId) ? requestedActiveId : championships[0]?.id || null;

  return { championships, activeChampionshipId, players, races };
}

function saveAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function render() {
  renderChampionships();
  renderPlayers();
  renderRaceBuilder();
  renderFormMode();
  renderStandings();
  renderHistory();
}

function renderChampionships() {
  const active = getActiveChampionship();
  elements.activeChampionshipLabel.textContent = active ? `${active.name} standings` : "No championship selected.";
  elements.raceChampionshipLabel.textContent = active
    ? `Adding races to ${active.name}.`
    : "Create or select a championship before saving races.";
  elements.championships.innerHTML = "";
  elements.championships.classList.toggle("empty-state", state.championships.length === 0);

  if (state.championships.length === 0) {
    elements.championships.textContent = "No championships yet.";
    return;
  }

  state.championships.forEach((championship) => {
    const races = getChampionshipRaces(championship.id);
    const leader = calculateStandings(championship.id)[0];
    const card = document.createElement("article");
    card.className = `championship-card${championship.id === state.activeChampionshipId ? " active" : ""}`;
    card.innerHTML = `
      <button class="championship-main" type="button">
        <strong></strong>
        <span></span>
      </button>
      <button class="ghost" type="button"></button>
      <button class="ghost danger" type="button" aria-label="Delete championship">Delete</button>
    `;
    card.querySelector(".championship-main").dataset.selectChampionship = championship.id;
    card.querySelector(".championship-main strong").textContent = championship.name;
    card.querySelector(".championship-main span").textContent = `${championship.complete ? "Complete · " : ""}${races.length} races${leader ? ` · Leader: ${leader.name}` : ""}`;
    const completeButton = card.querySelector(".ghost:not(.danger)");
    completeButton.textContent = championship.complete ? "Reopen" : "Mark Complete";
    completeButton.dataset.toggleCompleteChampionship = championship.id;
    card.querySelector(".danger").dataset.deleteChampionship = championship.id;
    elements.championships.append(card);
  });
}

function renderFormMode() {
  elements.saveRace.textContent = editingRaceId ? "Update Race" : "Save Race";
  elements.cancelEdit.hidden = !editingRaceId;
}

function renderPlayers() {
  const allTimeStats = calculateAllTimeStats();
  elements.players.innerHTML = "";
  elements.players.classList.toggle("empty-state", state.players.length === 0);

  if (state.players.length === 0) {
    elements.players.textContent = "No drivers yet.";
    return;
  }

  state.players.forEach((player) => {
    const stats = allTimeStats.get(player.id) || { championshipWins: 0, raceWins: 0, podiums: 0 };
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.innerHTML = `<span class="colour-dot"></span><span class="driver-details"><span class="driver-name"></span><span class="record"></span></span><select aria-label="Change car colour"></select><button type="button" aria-label="Remove driver">Remove</button>`;
    pill.querySelector(".colour-dot").style.background = player.colour;
    pill.querySelector(".driver-name").textContent = player.name;
    pill.querySelector(".record").textContent = `${stats.championshipWins} titles · ${stats.raceWins} race wins · ${stats.podiums} podiums`;
    const select = pill.querySelector("select");
    COLOURS.forEach((colour) => {
      const option = document.createElement("option");
      option.value = colour.value;
      option.textContent = colour.name;
      select.append(option);
    });
    select.value = player.colour;
    select.dataset.colourPlayer = player.id;
    pill.querySelector("button").dataset.removePlayer = player.id;
    elements.players.append(pill);
  });
}

function renderRaceBuilder() {
  elements.finishOrder.innerHTML = "";
  elements.driverButtons.innerHTML = "";

  elements.finishOrder.classList.toggle("empty-state", finishOrder.length === 0);
  elements.driverButtons.classList.toggle("empty-state", state.players.length === 0);

  if (finishOrder.length === 0) {
    elements.finishOrder.textContent = state.players.length ? "Tap drivers below in finishing order." : "Add drivers to your roster, then tap them in finishing order.";
  } else {
    finishOrder.forEach((playerId, index) => {
      const player = findPlayer(playerId);
      const chip = document.createElement("span");
      chip.className = "finish-chip";
      chip.innerHTML = `<strong></strong><span class="colour-dot"></span><span></span><button type="button" aria-label="Remove from finish order">Undo</button>`;
      chip.querySelector("strong").textContent = `#${index + 1}`;
      chip.querySelector(".colour-dot").style.background = player?.colour || COLOURS[0].value;
      chip.querySelector("span:not(.colour-dot)").textContent = player ? player.name : "Unknown";
      chip.querySelector("button").dataset.unrank = playerId;
      elements.finishOrder.append(chip);
    });
  }

  if (state.players.length === 0) {
    elements.driverButtons.textContent = "No drivers available.";
    return;
  }

  state.players.forEach((player) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.driver = player.id;
    button.disabled = finishOrder.includes(player.id);
    button.innerHTML = `<span class="colour-dot"></span><span></span>`;
    button.querySelector(".colour-dot").style.background = player.colour;
    button.querySelector("span:not(.colour-dot)").textContent = player.name;
    elements.driverButtons.append(button);
  });
}

function renderStandings() {
  const standings = calculateStandings();
  elements.standings.innerHTML = "";
  elements.standings.classList.toggle("empty-state", standings.length === 0);

  if (!state.activeChampionshipId) {
    elements.standings.textContent = "Create or select a championship to view standings.";
    return;
  }

  if (standings.length === 0) {
    elements.standings.textContent = "Add drivers and races to build this championship table.";
    return;
  }

  standings.forEach((entry, index) => {
    const row = elements.standingTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".rank").textContent = index + 1;
    row.querySelector(".name").innerHTML = `<span class="colour-dot"></span><span></span>`;
    row.querySelector(".colour-dot").style.background = entry.colour;
    row.querySelector(".name span:not(.colour-dot)").textContent = entry.name;
    row.querySelector(".record").textContent = `${entry.races} races · ${entry.wins} race wins · ${entry.podiums} podiums`;
    row.querySelector(".points").textContent = entry.points;
    elements.standings.append(row);
  });
}

function renderHistory() {
  const races = getChampionshipRaces().sort((a, b) => new Date(b.date) - new Date(a.date) || b.createdAt.localeCompare(a.createdAt));
  elements.raceHistory.innerHTML = "";
  elements.raceHistory.classList.toggle("empty-state", races.length === 0);

  if (!state.activeChampionshipId) {
    elements.raceHistory.textContent = "Select a championship to view its races.";
    return;
  }

  if (races.length === 0) {
    elements.raceHistory.textContent = "No races recorded for this championship yet.";
    return;
  }

  races.forEach((race) => {
    const card = document.createElement("article");
    card.className = "race-card";
    card.innerHTML = `
      <header>
        <div>
          <h3></h3>
          <time></time>
        </div>
        <div class="card-actions">
          <button class="ghost" type="button">Edit</button>
          <button class="ghost danger" type="button">Delete</button>
        </div>
      </header>
      <ol></ol>
    `;

    card.querySelector("h3").textContent = race.track;
    card.querySelector("time").dateTime = race.date;
    card.querySelector("time").textContent = formatDate(race.date);
    card.querySelector(".card-actions button:first-child").dataset.editRace = race.id;
    card.querySelector(".card-actions button:last-child").dataset.deleteRace = race.id;

    const list = card.querySelector("ol");
    race.results.forEach((playerId, index) => {
      const player = findPlayer(playerId);
      const item = document.createElement("li");
      item.innerHTML = `<span class="colour-dot"></span><span></span>`;
      item.querySelector(".colour-dot").style.background = player?.colour || COLOURS[0].value;
      item.querySelector("span:not(.colour-dot)").textContent = `${player ? player.name : "Unknown driver"} (${POINTS[index] || 0} pts)`;
      list.append(item);
    });

    if (race.notes) {
      const notes = document.createElement("p");
      notes.textContent = race.notes;
      card.append(notes);
    }

    elements.raceHistory.append(card);
  });
}

function calculateStandings(championshipId = state.activeChampionshipId) {
  if (!championshipId) return [];

  const entries = new Map(state.players.map((player) => [
    player.id,
    { id: player.id, name: player.name, colour: player.colour, points: 0, races: 0, wins: 0, podiums: 0 },
  ]));

  getChampionshipRaces(championshipId).forEach((race) => {
    race.results.forEach((playerId, index) => {
      const entry = entries.get(playerId);
      if (!entry) return;
      entry.points += POINTS[index] || 0;
      entry.races += 1;
      if (index === 0) entry.wins += 1;
      if (index < 3) entry.podiums += 1;
    });
  });

  return [...entries.values()].sort((a, b) => {
    return b.points - a.points || b.wins - a.wins || b.podiums - a.podiums || b.races - a.races || a.name.localeCompare(b.name);
  });
}

function calculateAllTimeStats() {
  const stats = new Map(state.players.map((player) => [
    player.id,
    { championshipWins: 0, raceWins: 0, podiums: 0 },
  ]));

  state.races.forEach((race) => {
    race.results.forEach((playerId, index) => {
      const entry = stats.get(playerId);
      if (!entry) return;
      if (index === 0) entry.raceWins += 1;
      if (index < 3) entry.podiums += 1;
    });
  });

  state.championships.forEach((championship) => {
    if (!championship.complete || getChampionshipRaces(championship.id).length === 0) return;

    const champion = calculateStandings(championship.id)[0];
    const entry = champion ? stats.get(champion.id) : null;
    if (entry) entry.championshipWins += 1;
  });

  return stats;
}

function renderColourOptions() {
  elements.playerColour.innerHTML = "";
  COLOURS.forEach((colour) => {
    const option = document.createElement("option");
    option.value = colour.value;
    option.textContent = colour.name;
    elements.playerColour.append(option);
  });
  elements.playerColour.value = nextUnusedColour();
}

function nextUnusedColour() {
  return COLOURS.find((colour) => !state.players.some((player) => player.colour === colour.value))?.value || COLOURS[0].value;
}

function getActiveChampionship() {
  return findChampionship(state.activeChampionshipId);
}

function findChampionship(championshipId) {
  return state.championships.find((championship) => championship.id === championshipId);
}

function getChampionshipRaces(championshipId = state.activeChampionshipId) {
  if (!championshipId) return [];
  return state.races.filter((race) => race.championshipId === championshipId);
}

function findPlayer(playerId) {
  return state.players.find((player) => player.id === playerId);
}

function clearRaceForm(resetChampionship = true) {
  editingRaceId = null;
  elements.track.value = "";
  elements.notes.value = "";
  elements.raceDate.valueAsDate = new Date();
  finishOrder = [];
  if (!resetChampionship && !findChampionship(state.activeChampionshipId)) {
    state.activeChampionshipId = state.championships[0]?.id || null;
  }
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isValidColour(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}

render();
