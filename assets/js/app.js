import {
  APP_VERSION,
  BACKUP_VERSION,
  DAY_NAMES,
  DEFAULT_SCHEDULE,
  DEFAULT_SETTINGS,
  HABITS,
  LEG_WORKOUT,
  UPPER_WORKOUT,
} from "./config.js";
import {
  activityPercent,
  addDays,
  classForScore,
  cleanString,
  createEmptyRecord,
  dynamicRange,
  getDefaultPlan,
  getMonday,
  getPlanText,
  hasMeaningfulRecord,
  labelForScore,
  localDateISO,
  normalizedSettings,
  parseLocalDate,
  pastDates,
  rollingDates,
  scoreRecord,
  todayAtNoon,
  validateAndNormalizeBackup,
} from "./core.js";
import {
  blobToDataURL,
  dataURLToBlob,
  deletePhoto,
  getAllPhotos,
  loadState,
  loadTheme,
  migrateLegacyPhotos,
  putPhoto,
  replacePhotos,
  saveState,
  saveTheme,
} from "./storage.js";

const EDITABLE_SETTING_KEYS = [
  "goalWeight",
  "waterGoal",
  "sleepGoal",
  "stepsGoal",
  "sportWeight",
  "foodWeight",
  "sleepWeight",
  "waterWeight",
];

const state = {
  settings: { ...DEFAULT_SETTINGS },
  records: {},
  habitData: {},
  gymData: [],
  measureData: [],
  photos: [],
};

let photoObjectUrls = [];
let resizeTimer = null;

const $ = (id) => document.getElementById(id);

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function showMessage(message) {
  window.alert(message);
}

function persist(showFailure = true) {
  const result = saveState(state);
  if (!result.ok && showFailure) {
    showMessage("Ma’lumotlar saqlanmadi. Brauzer xotirasi to‘lgan yoki saqlash bloklangan.");
  }
  return result.ok;
}

function normalizeLoadedState() {
  state.settings = normalizedSettings(state.settings);
  if (!state.records || typeof state.records !== "object" || Array.isArray(state.records)) state.records = {};
  for (const [date, raw] of Object.entries(state.records)) {
    if (!parseLocalDate(date) || !raw || typeof raw !== "object" || Array.isArray(raw)) {
      delete state.records[date];
      continue;
    }
    state.records[date] = { ...createEmptyRecord(date), ...raw, date };
    state.records[date].plan = cleanString(state.records[date].plan, 160);
  }
  if (!state.habitData || typeof state.habitData !== "object" || Array.isArray(state.habitData)) state.habitData = {};
  if (!Array.isArray(state.gymData)) state.gymData = [];
  if (!Array.isArray(state.measureData)) state.measureData = [];
}

function ensureRollingRecords() {
  for (const date of rollingDates(todayAtNoon(), 30)) {
    state.records[date] ??= createEmptyRecord(date);
    state.records[date] = { ...createEmptyRecord(date), ...state.records[date], date };
  }
}

function getOrCreateRecord(date) {
  state.records[date] ??= createEmptyRecord(date);
  return state.records[date];
}

function formatNumber(value, decimals = 0) {
  return Number(value || 0).toFixed(decimals);
}

function meaningfulPastRecords(days = 30) {
  return pastDates(todayAtNoon(), days)
    .map((date) => state.records[date])
    .filter(hasMeaningfulRecord)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function average(records, key) {
  const values = records
    .filter((record) => record[key] !== "" && record[key] !== null && record[key] !== undefined)
    .map((record) => Number(record[key]))
    .filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function calculateStreak() {
  let cursor = todayAtNoon();
  let current = state.records[localDateISO(cursor)];
  if (!hasMeaningfulRecord(current)) cursor = addDays(cursor, -1);

  let streak = 0;
  for (let index = 0; index < 3660; index += 1) {
    const record = state.records[localDateISO(cursor)];
    if (!hasMeaningfulRecord(record) || scoreRecord(record, state.settings) < 70) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function clearElement(element) {
  while (element?.firstChild) element.removeChild(element.firstChild);
}

function appendTextCell(row, text, className = "") {
  const cell = document.createElement("td");
  cell.textContent = String(text ?? "");
  if (className) cell.className = className;
  row.appendChild(cell);
  return cell;
}

function createInput({ type = "text", value = "", key, className = "", min, max, step, maxLength }) {
  const input = document.createElement("input");
  input.type = type;
  input.value = value ?? "";
  input.dataset.k = key;
  if (className) input.className = className;
  if (min !== undefined) input.min = String(min);
  if (max !== undefined) input.max = String(max);
  if (step !== undefined) input.step = String(step);
  if (maxLength !== undefined) input.maxLength = maxLength;
  return input;
}

function setScoreCells(row, record) {
  const scoreCell = row.querySelector(".score");
  const ratingCell = row.querySelector(".rating");
  if (!hasMeaningfulRecord(record)) {
    scoreCell.textContent = "—";
    ratingCell.textContent = "—";
    ratingCell.className = "rating muted";
    return;
  }
  const score = scoreRecord(record, state.settings);
  scoreCell.textContent = `${score}%`;
  ratingCell.textContent = labelForScore(score);
  ratingCell.className = `rating ${classForScore(score)}`;
}

function updateDashboardText(currentWeight) {
  $("heightKpi").textContent = `${state.settings.heightCm} sm`;
  $("goalWeightKpi").textContent = `${state.settings.goalWeight} kg`;
  $("goalSummary").textContent = `${currentWeight} kg dan ${state.settings.goalWeight} kg gacha — sport, ovqatlanish, uyqu, suv va odatlar nazorati.`;
}

function renderDashboard() {
  const records = meaningfulPastRecords(30);
  const allPast = Object.values(state.records)
    .filter((record) => parseLocalDate(record.date) && record.date <= localDateISO(todayAtNoon()) && hasMeaningfulRecord(record))
    .sort((a, b) => a.date.localeCompare(b.date));
  const weights = allPast.filter((record) => Number(record.weight) > 0);
  const currentWeight = weights.length ? Number(weights.at(-1).weight) : state.settings.startWeight;

  updateDashboardText(currentWeight);
  $("currentWeight").textContent = `${formatNumber(currentWeight, 1).replace(/\.0$/, "")} kg`;
  $("avgSleep").textContent = average(records, "sleep") ? `${formatNumber(average(records, "sleep"), 1)} soat` : "—";
  $("avgWater").textContent = average(records, "water") ? `${formatNumber(average(records, "water"), 1)} L` : "—";
  $("streak").textContent = `${calculateStreak()} kun`;

  const today = localDateISO(todayAtNoon());
  const todayRecord = getOrCreateRecord(today);
  const basePlan = getDefaultPlan(today);
  const planText = getPlanText(todayRecord);
  const planContainer = $("todayPlan");
  clearElement(planContainer);
  const chip = document.createElement("div");
  chip.className = "plan-chip";
  const heading = document.createElement("b");
  heading.textContent = `${DAY_NAMES[parseLocalDate(today).getDay()]} — ${planText}`;
  const description = document.createElement("p");
  description.textContent = todayRecord.plan?.trim()
    ? "Qo‘lda kiritilgan kunlik reja. Makrolar shu hafta kunining bazaviy rejasidan olinadi."
    : basePlan.plan;
  chip.append(heading, description);
  planContainer.appendChild(chip);

  const macros = [
    ["kkal", basePlan.kcal],
    ["Oqsil", `${basePlan.protein} g`],
    ["Uglevod", `${basePlan.carbs} g`],
    ["Yog‘", `${basePlan.fat} g`],
  ];
  clearElement($("todayMacros"));
  for (const [label, value] of macros) {
    const macro = document.createElement("div");
    macro.className = "macro";
    const strong = document.createElement("b");
    strong.textContent = value;
    const small = document.createElement("small");
    small.textContent = label;
    macro.append(strong, small);
    $("todayMacros").appendChild(macro);
  }

  const tips = [];
  if (Number(todayRecord.sleep) > 0 && Number(todayRecord.sleep) < 6) tips.push("Uyqu 6 soatdan kam — intensivlikni pasaytiring.");
  if (Number(todayRecord.water) > 0 && Number(todayRecord.water) < 2) tips.push("Suv 2 litrdan kam — suv iste’molini oshiring.");
  if (Number(todayRecord.actualProtein) > 0 && Number(todayRecord.actualProtein) < basePlan.protein * 0.8) tips.push("Oqsil 80% dan past — oqsil manbai qo‘shing.");
  $("aiAdvice").textContent = tips.length ? tips.join(" ") : "Bugungi ma’lumotlarni kiriting — tizim avtomatik tavsiya beradi.";

  const scores = records.map((record) => scoreRecord(record, state.settings));
  const overall = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;
  $("overallScore").textContent = `${overall}%`;
  $("scoreLabel").textContent = labelForScore(overall);
  $("scoreLabel").className = `status ${classForScore(overall)}`;
  $("scoreRing").style.background = `conic-gradient(var(--green) ${overall * 3.6}deg, var(--ring-track) 0deg)`;

  const metrics = [
    ["Sport/Faollik", records.length ? records.reduce((sum, record) => sum + activityPercent(record, state.settings), 0) / records.length : 0],
    ["Ovqatlanish", average(records, "food")],
    ["Suv", average(records, "water") / state.settings.waterGoal * 100],
    ["Uyqu", average(records, "sleep") / state.settings.sleepGoal * 100],
  ];
  clearElement($("scoreBars"));
  for (const [name, rawValue] of metrics) {
    const value = Math.max(0, Math.min(100, Number(rawValue) || 0));
    const wrapper = document.createElement("div");
    wrapper.className = "progress-row";
    const label = document.createElement("div");
    label.className = "progress-label";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = name;
    const percent = document.createElement("b");
    percent.textContent = `${Math.round(value)}%`;
    label.append(nameSpan, percent);
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("i");
    fill.style.width = `${value}%`;
    bar.appendChild(fill);
    wrapper.append(label, bar);
    $("scoreBars").appendChild(wrapper);
  }

  const recentWeights = weights.filter((record) => pastDates(todayAtNoon(), 30).includes(record.date));
  const weightValues = recentWeights.map((record) => Number(record.weight));
  const weightRange = dynamicRange([...weightValues, state.settings.goalWeight], state.settings.goalWeight - 2, state.settings.startWeight + 2);
  drawLineChart("weightChart", recentWeights.map((record) => record.date.slice(5)), weightValues, {
    ...weightRange,
    color: cssVar("--cyan", "#28d7ff"),
  });
  drawLineChart("scoreChart", records.map((record) => record.date.slice(5)), scores, {
    min: 0,
    max: 100,
    color: cssVar("--green", "#34e69a"),
  });
  drawDualChart(
    "recoveryChart",
    records.map((record) => record.date.slice(5)),
    records.map((record) => Number(record.sleep) || 0),
    records.map((record) => Number(record.water) || 0),
  );
}

function canvasSetup(id) {
  const canvas = $(id);
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { canvas, context, width: rect.width, height: rect.height };
}

function drawAxes(context, width, height, min, max) {
  context.strokeStyle = cssVar("--chart-grid", "#21425b");
  context.lineWidth = 1;
  context.beginPath();
  for (let index = 0; index < 5; index += 1) {
    const y = 25 + (height - 55) * index / 4;
    context.moveTo(42, y);
    context.lineTo(width - 14, y);
  }
  context.stroke();
  context.fillStyle = cssVar("--chart-label", "#7897ad");
  context.font = "11px Segoe UI";
  for (let index = 0; index < 5; index += 1) {
    const value = max - (max - min) * index / 4;
    const formatted = Math.abs(value) < 10 && !Number.isInteger(value) ? value.toFixed(1) : Math.round(value);
    context.fillText(formatted, 6, 29 + (height - 55) * index / 4);
  }
}

function drawEmptyChart(context, width, height) {
  context.fillStyle = cssVar("--chart-label", "#7897ad");
  context.font = "12px Segoe UI";
  context.fillText("Ma’lumot kiriting", width / 2 - 48, height / 2);
}

function drawLineChart(id, labels, values, options) {
  const setup = canvasSetup(id);
  if (!setup) return;
  const { context, width, height } = setup;
  context.clearRect(0, 0, width, height);
  const min = Number(options.min);
  const max = Number(options.max) > min ? Number(options.max) : min + 1;
  drawAxes(context, width, height, min, max);
  if (!values.length) {
    drawEmptyChart(context, width, height);
    return;
  }
  const left = 45;
  const right = width - 18;
  const top = 25;
  const bottom = height - 30;
  const step = values.length > 1 ? (right - left) / (values.length - 1) : 0;
  const points = values.map((value, index) => ({
    x: left + index * step,
    y: bottom - (Number(value) - min) / (max - min) * (bottom - top),
  }));

  context.strokeStyle = options.color;
  context.lineWidth = 3;
  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.stroke();
  context.fillStyle = options.color;
  for (const point of points) {
    context.beginPath();
    context.arc(point.x, point.y, 4, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = cssVar("--chart-label", "#7897ad");
  context.font = "10px Segoe UI";
  const labelStep = Math.max(1, Math.ceil(labels.length / 8));
  labels.forEach((label, index) => {
    if (index % labelStep === 0) context.fillText(label, left + index * step - 10, height - 8);
  });
}

function drawDualChart(id, labels, sleepValues, waterValues) {
  const setup = canvasSetup(id);
  if (!setup) return;
  const { context, width, height } = setup;
  context.clearRect(0, 0, width, height);
  const sleepMax = Math.max(8, state.settings.sleepGoal + 1, ...sleepValues);
  const waterMax = Math.max(4, state.settings.waterGoal + 1, ...waterValues);
  drawAxes(context, width, height, 0, sleepMax);
  if (!labels.length) {
    drawEmptyChart(context, width, height);
    return;
  }
  const left = 45;
  const right = width - 18;
  const top = 25;
  const bottom = height - 30;
  const step = labels.length > 1 ? (right - left) / (labels.length - 1) : 0;
  const series = [
    [sleepValues, cssVar("--purple", "#b077ff"), sleepMax],
    [waterValues, cssVar("--cyan", "#28d7ff"), waterMax],
  ];
  for (const [values, color, maximum] of series) {
    context.strokeStyle = color;
    context.lineWidth = 2.5;
    context.beginPath();
    values.forEach((value, index) => {
      const x = left + index * step;
      const y = bottom - Number(value) / maximum * (bottom - top);
      index ? context.lineTo(x, y) : context.moveTo(x, y);
    });
    context.stroke();
  }
  context.fillStyle = cssVar("--purple", "#b077ff");
  context.fillText("Uyqu", width - 120, 18);
  context.fillStyle = cssVar("--cyan", "#28d7ff");
  context.fillText("Suv", width - 65, 18);
}

function renderTracking() {
  const tbody = document.querySelector("#trackingTable tbody");
  clearElement(tbody);
  const dates = rollingDates(todayAtNoon(), 30);

  dates.forEach((date, index) => {
    const record = getOrCreateRecord(date);
    const row = document.createElement("tr");
    appendTextCell(row, index + 1);
    appendTextCell(row, date);
    appendTextCell(row, DAY_NAMES[parseLocalDate(date).getDay()]);

    const planCell = document.createElement("td");
    const planInput = createInput({ value: getPlanText(record), key: "plan", className: "plan-editor", maxLength: 160 });
    planInput.title = `Bazaviy reja: ${getDefaultPlan(date).type}. Ushbu maydonni qo‘lda o‘zgartirish mumkin.`;
    planCell.appendChild(planInput);
    row.appendChild(planCell);

    const inputDefinitions = [
      ["sport", "number", 0, 100, 1, ""],
      ["food", "number", 0, 100, 1, ""],
      ["water", "number", 0, 20, 0.1, ""],
      ["sleep", "number", 0, 24, 0.1, ""],
      ["weight", "number", 30, 300, 0.1, ""],
      ["steps", "number", 0, 200000, 1, ""],
    ];
    for (const [key, type, min, max, step, className] of inputDefinitions) {
      const cell = document.createElement("td");
      cell.appendChild(createInput({ type, value: record[key], key, min, max, step, className }));
      row.appendChild(cell);
    }

    const creatineCell = document.createElement("td");
    const creatineSelect = document.createElement("select");
    creatineSelect.dataset.k = "creatine";
    for (const [value, label] of [["true", "Ha"], ["false", "Yo‘q"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = Boolean(record.creatine) === (value === "true");
      creatineSelect.appendChild(option);
    }
    creatineCell.appendChild(creatineSelect);
    row.appendChild(creatineCell);

    appendTextCell(row, "—", "score");
    appendTextCell(row, "—", "rating muted");

    const noteCell = document.createElement("td");
    noteCell.appendChild(createInput({ value: record.extraNote || "", key: "extraNote", className: "note", maxLength: 2000 }));
    row.appendChild(noteCell);

    row.querySelectorAll("input,select").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.dataset.k;
        let value = input.value;
        if (key === "creatine") value = value === "true";
        if (key === "plan") value = cleanString(value.trim(), 160);
        record[key] = value;
        persist();
        setScoreCells(row, record);
        renderDashboard();
      });
    });
    setScoreCells(row, record);
    tbody.appendChild(row);
  });
}

function renderNutrition() {
  const container = $("nutritionCards");
  clearElement(container);
  const plans = [DEFAULT_SCHEDULE[2], DEFAULT_SCHEDULE[6], DEFAULT_SCHEDULE[0], DEFAULT_SCHEDULE[3]];
  for (const plan of plans) {
    const card = document.createElement("div");
    card.className = "card nutrition-card";
    const title = document.createElement("h3");
    title.textContent = plan.type;
    const calories = document.createElement("strong");
    calories.style.fontSize = "28px";
    calories.textContent = `${plan.kcal} kkal`;
    const macroRow = document.createElement("div");
    macroRow.className = "macro-row nutrition-macro-row";
    for (const [label, value] of [["Oqsil", plan.protein], ["Uglevod", plan.carbs], ["Yog‘", plan.fat]]) {
      const macro = document.createElement("div");
      macro.className = "macro";
      const strong = document.createElement("b");
      strong.textContent = `${value}g`;
      const small = document.createElement("small");
      small.textContent = label;
      macro.append(strong, small);
      macroRow.appendChild(macro);
    }
    card.append(title, calories, macroRow);
    container.appendChild(card);
  }
}

function renderTraining() {
  const scheduleContainer = $("scheduleCards");
  clearElement(scheduleContainer);
  for (const day of [1, 2, 3, 4, 5, 6, 0]) {
    const plan = DEFAULT_SCHEDULE[day];
    const card = document.createElement("div");
    card.className = "card day";
    const dayName = document.createElement("b");
    dayName.textContent = DAY_NAMES[day];
    const title = document.createElement("h3");
    title.textContent = plan.type;
    const description = document.createElement("p");
    description.textContent = plan.plan;
    card.append(dayName, title, description);
    scheduleContainer.appendChild(card);
  }

  for (const [id, workout] of [["legWorkout", LEG_WORKOUT], ["upperWorkout", UPPER_WORKOUT]]) {
    const container = $(id);
    clearElement(container);
    for (const item of workout) {
      const chip = document.createElement("div");
      chip.className = "plan-chip";
      chip.textContent = item;
      container.appendChild(chip);
    }
  }
}

function renderHabits() {
  const date = localDateISO(todayAtNoon());
  state.habitData[date] ??= {};
  const container = $("habitList");
  clearElement(container);
  HABITS.forEach((habit, index) => {
    const item = document.createElement("div");
    item.className = "habit-item";
    const label = document.createElement("span");
    label.textContent = habit;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(state.habitData[date][index]);
    checkbox.addEventListener("change", () => {
      state.habitData[date][index] = checkbox.checked;
      persist();
      renderHabitHeatmaps();
    });
    item.append(label, checkbox);
    container.appendChild(item);
  });
}

function renderHabitHeatmaps() {
  const container = $("habitHeatmaps");
  clearElement(container);
  const start = addDays(todayAtNoon(), -29);
  HABITS.forEach((habit, habitIndex) => {
    const wrapper = document.createElement("div");
    wrapper.className = "heatmap-block";
    const label = document.createElement("small");
    label.textContent = habit;
    const heatmap = document.createElement("div");
    heatmap.className = "heatmap";
    for (let dayIndex = 0; dayIndex < 30; dayIndex += 1) {
      const date = localDateISO(addDays(start, dayIndex));
      const cell = document.createElement("div");
      cell.className = `heat ${state.habitData[date]?.[habitIndex] ? "on" : ""}`;
      cell.title = date;
      heatmap.appendChild(cell);
    }
    wrapper.append(label, heatmap);
    container.appendChild(wrapper);
  });
}

function loadToday(date) {
  const record = getOrCreateRecord(date);
  const map = {
    sportPct: "sport",
    foodPct: "food",
    water: "water",
    sleep: "sleep",
    weight: "weight",
    steps: "steps",
    energy: "energy",
    mood: "mood",
    actualKcal: "actualKcal",
    actualProtein: "actualProtein",
    foodNote: "foodNote",
    trainingNote: "trainingNote",
    extraNote: "extraNote",
  };
  for (const [id, key] of Object.entries(map)) $(id).value = record[key] ?? "";
  $("creatine").value = String(Boolean(record.creatine));
}

function saveToday() {
  const date = $("todayDate").value;
  if (!parseLocalDate(date)) {
    showMessage("Sana tanlang.");
    return;
  }
  const record = getOrCreateRecord(date);
  Object.assign(record, {
    sport: $("sportPct").value,
    food: $("foodPct").value,
    water: $("water").value,
    sleep: $("sleep").value,
    weight: $("weight").value,
    steps: $("steps").value,
    creatine: $("creatine").value === "true",
    energy: $("energy").value,
    mood: $("mood").value,
    actualKcal: $("actualKcal").value,
    actualProtein: $("actualProtein").value,
    foodNote: cleanString($("foodNote").value, 2000),
    trainingNote: cleanString($("trainingNote").value, 2000),
    extraNote: cleanString($("extraNote").value, 2000),
  });
  if (persist()) {
    renderAll();
    showMessage("Ma’lumot saqlandi.");
  }
}

function drawStats() {
  const rows = meaningfulPastRecords(90).filter((record) => record.sport || record.food || record.actualKcal || record.actualProtein);
  drawTwoLines(
    "disciplineChart",
    rows.map((record) => record.date.slice(5)),
    rows.map((record) => Number(record.sport) || 0),
    rows.map((record) => Number(record.food) || 0),
    cssVar("--cyan", "#28d7ff"),
    cssVar("--green", "#34e69a"),
    "Sport",
    "Ovqat",
    100,
    100,
  );
  const calorieMax = Math.max(2600, ...rows.map((record) => Number(record.actualKcal) || 0));
  const proteinMax = Math.max(200, ...rows.map((record) => Number(record.actualProtein) || 0));
  drawTwoLines(
    "macroChart",
    rows.map((record) => record.date.slice(5)),
    rows.map((record) => Number(record.actualKcal) || 0),
    rows.map((record) => Number(record.actualProtein) || 0),
    cssVar("--orange", "#ffb34d"),
    cssVar("--purple", "#b077ff"),
    "Kkal",
    "Oqsil",
    calorieMax,
    proteinMax,
  );
}

function drawTwoLines(id, labels, first, second, colorOne, colorTwo, labelOne, labelTwo, maxOne = 100, maxTwo = 100) {
  const setup = canvasSetup(id);
  if (!setup) return;
  const { context, width, height } = setup;
  context.clearRect(0, 0, width, height);
  drawAxes(context, width, height, 0, maxOne);
  if (!labels.length) {
    drawEmptyChart(context, width, height);
    return;
  }
  const left = 45;
  const right = width - 18;
  const top = 25;
  const bottom = height - 30;
  const step = labels.length > 1 ? (right - left) / (labels.length - 1) : 0;
  for (const [values, color, maximum] of [[first, colorOne, maxOne], [second, colorTwo, maxTwo]]) {
    context.strokeStyle = color;
    context.lineWidth = 2.5;
    context.beginPath();
    values.forEach((value, index) => {
      const x = left + index * step;
      const y = bottom - Number(value) / maximum * (bottom - top);
      index ? context.lineTo(x, y) : context.moveTo(x, y);
    });
    context.stroke();
  }
  context.fillStyle = colorOne;
  context.fillText(labelOne, width - 135, 18);
  context.fillStyle = colorTwo;
  context.fillText(labelTwo, width - 75, 18);
}

function download(blob, filename) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

function csvExport() {
  const header = ["Sana", "Kun", "Reja", "Sport %", "Ovqat %", "Suv L", "Uyqu", "Vazn", "Qadam", "Kreatin", "Umumiy %", "Baho", "Izoh"];
  const rows = rollingDates(todayAtNoon(), 30).map((date) => {
    const record = getOrCreateRecord(date);
    const hasData = hasMeaningfulRecord(record);
    const score = hasData ? scoreRecord(record, state.settings) : "";
    return [
      date,
      DAY_NAMES[parseLocalDate(date).getDay()],
      getPlanText(record),
      record.sport,
      record.food,
      record.water,
      record.sleep,
      record.weight,
      record.steps,
      record.creatine ? "Ha" : "Yo‘q",
      score,
      hasData ? labelForScore(score) : "",
      record.extraNote || "",
    ];
  });
  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  download(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }), "FIT_JARVIS_joriy_30_kun.csv");
}

async function exportJSON() {
  const button = $("exportJson");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Tayyorlanmoqda...";
  try {
    const photos = await Promise.all(state.photos.map(async (photo) => ({
      id: photo.id,
      date: photo.date,
      type: photo.type,
      data: await blobToDataURL(photo.blob),
    })));
    const payload = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      records: state.records,
      habitData: state.habitData,
      gymData: state.gymData,
      measureData: state.measureData,
      photos,
    };
    download(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "FIT_JARVIS_backup_v3.json");
  } catch (error) {
    showMessage("Backup yaratilmadi. Foto ma’lumotlarini o‘qishda xato yuz berdi.");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function importJSON(file) {
  if (file.size > 80 * 1024 * 1024) {
    showMessage("Backup fayli 80 MB dan katta. Fotolarni kamaytirib qayta urinib ko‘ring.");
    return;
  }
  try {
    const raw = JSON.parse(await file.text());
    const normalized = validateAndNormalizeBackup(raw);
    const importedPhotos = normalized.photos.map((photo) => ({
      id: photo.id,
      date: photo.date,
      type: photo.type,
      blob: dataURLToBlob(photo.data),
    }));
    const confirmed = window.confirm("Backup joriy ma’lumotlarni almashtiradi. Davom etilsinmi?");
    if (!confirmed) return;

    const nextState = {
      settings: normalized.settings,
      records: normalized.records,
      habitData: normalized.habitData,
      gymData: normalized.gymData,
      measureData: normalized.measureData,
    };
    const previousPhotos = state.photos.slice();
    await replacePhotos(importedPhotos);
    const saveResult = saveState(nextState);
    if (!saveResult.ok) {
      await replacePhotos(previousPhotos);
      throw new Error("LocalStorage saqlash xatosi");
    }

    Object.assign(state, nextState, { photos: importedPhotos });
    ensureRollingRecords();
    persist();
    renderAll();
    showMessage("Backup tekshirildi va yuklandi.");
  } catch (error) {
    showMessage(`Backup import qilinmadi: ${error.message || "fayl noto‘g‘ri"}`);
  } finally {
    $("importJson").value = "";
  }
}

function loadSettings() {
  for (const key of EDITABLE_SETTING_KEYS) $(key).value = state.settings[key];
}

function saveSettingsFromForm() {
  const next = { ...state.settings };
  for (const key of EDITABLE_SETTING_KEYS) next[key] = Number($(key).value);
  const normalized = normalizedSettings(next);
  const totalWeight = normalized.sportWeight + normalized.foodWeight + normalized.sleepWeight + normalized.waterWeight;
  if (totalWeight <= 0) {
    showMessage("Baholash vaznlaridan kamida bittasi 0 dan katta bo‘lishi kerak.");
    return;
  }
  state.settings = normalized;
  if (persist()) {
    renderAll();
    showMessage("Sozlamalar saqlandi.");
  }
}

function renderGym() {
  const tbody = document.querySelector("#gymTable tbody");
  clearElement(tbody);
  const sorted = state.gymData.slice().sort((a, b) => b.date.localeCompare(a.date));
  for (const item of sorted) {
    const row = document.createElement("tr");
    appendTextCell(row, item.date);
    appendTextCell(row, item.exercise);
    appendTextCell(row, `${item.weight} kg`);
    appendTextCell(row, item.sets);
    appendTextCell(row, item.reps);
    appendTextCell(row, item.rpe);
    appendTextCell(row, Math.round(Number(item.weight) * Number(item.sets) * Number(item.reps)));
    appendTextCell(row, item.note || "");
    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.className = "btn danger";
    button.textContent = "×";
    button.addEventListener("click", () => {
      const index = state.gymData.indexOf(item);
      if (index >= 0) state.gymData.splice(index, 1);
      persist();
      renderGym();
    });
    actionCell.appendChild(button);
    row.appendChild(actionCell);
    tbody.appendChild(row);
  }

  const personalRecords = {};
  for (const item of state.gymData) {
    const key = String(item.exercise || "Mashq").toLocaleLowerCase("uz-UZ");
    if (!personalRecords[key] || Number(item.weight) > Number(personalRecords[key].weight)) personalRecords[key] = item;
  }
  const container = $("prList");
  clearElement(container);
  if (!Object.keys(personalRecords).length) {
    const text = document.createElement("p");
    text.className = "muted";
    text.textContent = "Natija kiritilmagan.";
    container.appendChild(text);
  } else {
    for (const item of Object.values(personalRecords)) {
      const chip = document.createElement("div");
      chip.className = "plan-chip";
      const strong = document.createElement("b");
      strong.textContent = item.exercise;
      chip.append(strong, document.createTextNode(`: ${item.weight} kg × ${item.reps}`));
      container.appendChild(chip);
    }
  }
}

function renderMeasures() {
  const tbody = document.querySelector("#measureTable tbody");
  clearElement(tbody);
  const sorted = state.measureData.slice().sort((a, b) => a.date.localeCompare(b.date));
  for (const item of sorted) {
    const row = document.createElement("tr");
    for (const value of [item.date, item.weight, item.waist, item.chest, item.arm, item.thigh, item.bodyFat]) appendTextCell(row, value);
    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.className = "btn danger";
    button.textContent = "×";
    button.addEventListener("click", () => {
      const index = state.measureData.indexOf(item);
      if (index >= 0) state.measureData.splice(index, 1);
      persist();
      renderMeasures();
    });
    actionCell.appendChild(button);
    row.appendChild(actionCell);
    tbody.appendChild(row);
  }
  const waistValues = sorted.map((item) => Number(item.waist)).filter((value) => value > 0);
  const range = dynamicRange(waistValues, 60, 120);
  drawLineChart("measureChart", sorted.map((item) => item.date.slice(5)), sorted.map((item) => Number(item.waist) || 0), {
    ...range,
    color: cssVar("--orange", "#ffb34d"),
  });
}

function releasePhotoUrls() {
  for (const url of photoObjectUrls) URL.revokeObjectURL(url);
  photoObjectUrls = [];
}

function renderPhotos() {
  const container = $("photoGrid");
  releasePhotoUrls();
  clearElement(container);
  const sorted = state.photos.slice().sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) {
    const text = document.createElement("p");
    text.className = "muted";
    text.textContent = "Foto kiritilmagan.";
    container.appendChild(text);
    return;
  }
  for (const photo of sorted) {
    const card = document.createElement("div");
    card.className = "card photo-card";
    const image = document.createElement("img");
    const url = URL.createObjectURL(photo.blob);
    photoObjectUrls.push(url);
    image.src = url;
    image.alt = `${photo.type} — ${photo.date}`;
    const title = document.createElement("h3");
    title.textContent = photo.type;
    const date = document.createElement("p");
    date.textContent = photo.date;
    const button = document.createElement("button");
    button.className = "btn danger";
    button.textContent = "O‘chirish";
    button.addEventListener("click", async () => {
      try {
        await deletePhoto(photo.id);
        state.photos = state.photos.filter((item) => item.id !== photo.id);
        renderPhotos();
      } catch (error) {
        showMessage("Foto o‘chirilmadi.");
      }
    });
    card.append(image, title, date, button);
    container.appendChild(card);
  }
}

function addSummaryLine(container, label, value) {
  const paragraph = document.createElement("p");
  paragraph.textContent = `${label}: ${value}`;
  container.appendChild(paragraph);
}

function makeWeekly() {
  const start = parseLocalDate($("weekStart").value);
  if (!start) {
    showMessage("Hafta boshini tanlang.");
    return;
  }
  const rows = [];
  for (let index = 0; index < 7; index += 1) {
    const record = state.records[localDateISO(addDays(start, index))];
    if (hasMeaningfulRecord(record)) rows.push(record);
  }
  const container = $("weeklyReport");
  clearElement(container);
  if (!rows.length) {
    const text = document.createElement("p");
    text.className = "muted";
    text.textContent = "Bu haftada kiritilgan ma’lumot yo‘q.";
    container.appendChild(text);
    return;
  }

  const scores = rows.map((record) => scoreRecord(record, state.settings));
  const total = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
  const best = rows[scores.indexOf(Math.max(...scores))];
  const metricValues = [
    ["Faollik", rows.reduce((sum, record) => sum + activityPercent(record, state.settings), 0) / rows.length],
    ["Ovqat", average(rows, "food")],
    ["Uyqu", average(rows, "sleep") / state.settings.sleepGoal * 100],
    ["Suv", average(rows, "water") / state.settings.waterGoal * 100],
  ];
  const weakest = metricValues.slice().sort((a, b) => a[1] - b[1])[0];

  const summary = document.createElement("div");
  summary.className = "summary-box";
  const heading = document.createElement("h3");
  heading.textContent = `Haftalik baho: ${total}% — ${labelForScore(total)}`;
  summary.appendChild(heading);
  addSummaryLine(summary, "Faollik", `${Math.round(metricValues[0][1])}%`);
  addSummaryLine(summary, "Ovqatlanish", `${Math.round(metricValues[1][1])}%`);
  addSummaryLine(summary, "O‘rtacha uyqu", `${average(rows, "sleep").toFixed(1)} soat`);
  addSummaryLine(summary, "O‘rtacha suv", `${average(rows, "water").toFixed(1)} L`);
  addSummaryLine(summary, "Eng yaxshi kun", `${best.date} (${scoreRecord(best, state.settings)}%)`);
  addSummaryLine(summary, "Eng zaif ko‘rsatkich", weakest[0]);
  container.appendChild(summary);
}

async function compressImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("Faqat rasm fayli qabul qilinadi");
  if (file.size > 25 * 1024 * 1024) throw new Error("Rasm 25 MB dan katta");

  let source;
  let revoke = null;
  if ("createImageBitmap" in window) {
    source = await createImageBitmap(file);
  } else {
    const url = URL.createObjectURL(file);
    revoke = () => URL.revokeObjectURL(url);
    source = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Rasm ochilmadi"));
      image.src = url;
    });
  }

  try {
    const maxSide = 1600;
    const width = source.width;
    const height = source.height;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(source, 0, 0, targetWidth, targetHeight);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Rasm siqilmadi")), "image/jpeg", 0.84);
    });
    return blob;
  } finally {
    if (typeof source.close === "function") source.close();
    revoke?.();
  }
}

function createPhotoId() {
  return typeof window.crypto?.randomUUID === "function" ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function addPhotoFromForm() {
  const file = $("photoFile").files[0];
  if (!file) {
    showMessage("Rasm tanlang.");
    return;
  }
  const date = $("photoDate").value;
  if (!parseLocalDate(date)) {
    showMessage("Sana tanlang.");
    return;
  }
  const button = $("addPhoto");
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Saqlanmoqda...";
  try {
    const photo = {
      id: createPhotoId(),
      date,
      type: cleanString($("photoType").value, 30),
      blob: await compressImage(file),
    };
    await putPhoto(photo);
    state.photos.push(photo);
    $("photoFile").value = "";
    renderPhotos();
  } catch (error) {
    showMessage(`Foto saqlanmadi: ${error.message || "noma’lum xato"}`);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function addGymResult() {
  const date = $("gymDate").value;
  if (!parseLocalDate(date)) {
    showMessage("Sana tanlang.");
    return;
  }
  state.gymData.push({
    date,
    exercise: cleanString($("gymExercise").value || "Mashq", 160),
    weight: Number($("gymWeight").value) || 0,
    sets: Number($("gymSets").value) || 0,
    reps: Number($("gymReps").value) || 0,
    rpe: Number($("gymRpe").value) || 0,
    note: cleanString($("gymNote").value, 1000),
  });
  persist();
  renderGym();
}

function addMeasurement() {
  const date = $("measureDate").value;
  if (!parseLocalDate(date)) {
    showMessage("Sana tanlang.");
    return;
  }
  state.measureData.push({
    date,
    weight: Number($("mWeight").value) || 0,
    waist: Number($("waist").value) || 0,
    chest: Number($("chest").value) || 0,
    arm: Number($("arm").value) || 0,
    thigh: Number($("thigh").value) || 0,
    bodyFat: Number($("bodyFat").value) || 0,
  });
  persist();
  renderMeasures();
}

function showPage(id) {
  document.querySelectorAll(".section").forEach((section) => section.classList.toggle("active", section.id === id));
  document.querySelectorAll(".nav button").forEach((button) => button.classList.toggle("active", button.dataset.page === id));
  requestAnimationFrame(() => {
    if (id === "dashboard") renderDashboard();
    if (id === "statistics") drawStats();
    if (id === "measurements") renderMeasures();
  });
}

function applyTheme(theme) {
  const normalized = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = normalized;
  document.documentElement.style.colorScheme = normalized;
  const button = $("themeToggle");
  if (button) {
    button.textContent = normalized === "dark" ? "☀ Oq rejim" : "☾ Qora rejim";
    button.setAttribute("aria-label", normalized === "dark" ? "Oq rejimga o‘tish" : "Qora rejimga o‘tish");
  }
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = normalized === "dark" ? "#071321" : "#f4f8fc";
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(next);
  saveTheme(next);
  requestAnimationFrame(() => {
    renderDashboard();
    drawStats();
    if ($("measurements").classList.contains("active")) renderMeasures();
  });
}

function renderAll() {
  renderDashboard();
  renderTracking();
  renderNutrition();
  renderTraining();
  renderHabits();
  renderHabitHeatmaps();
  renderGym();
  renderMeasures();
  renderPhotos();
  loadSettings();
  drawStats();
}

function bindEvents() {
  document.querySelectorAll(".nav button").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.page)));
  $("todayDate").addEventListener("change", (event) => loadToday(event.target.value));
  $("saveToday").addEventListener("click", saveToday);
  $("saveAll").addEventListener("click", () => {
    if (persist()) {
      renderAll();
      showMessage("Barcha ma’lumotlar saqlandi.");
    }
  });
  $("exportJson").addEventListener("click", exportJSON);
  $("exportCsv").addEventListener("click", csvExport);
  $("importJson").addEventListener("change", (event) => event.target.files[0] && importJSON(event.target.files[0]));
  $("saveSettings").addEventListener("click", saveSettingsFromForm);
  $("themeToggle").addEventListener("click", toggleTheme);
  $("addGym").addEventListener("click", addGymResult);
  $("addMeasure").addEventListener("click", addMeasurement);
  $("addPhoto").addEventListener("click", addPhotoFromForm);
  $("makeWeekly").addEventListener("click", makeWeekly);

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderDashboard();
      drawStats();
      if ($("measurements").classList.contains("active")) renderMeasures();
    }, 120);
  });
  window.addEventListener("beforeunload", releasePhotoUrls);
}

async function initialize() {
  applyTheme(loadTheme());
  Object.assign(state, loadState());
  normalizeLoadedState();
  ensureRollingRecords();
  persist(false);

  try {
    await migrateLegacyPhotos();
    state.photos = await getAllPhotos();
  } catch (error) {
    state.photos = [];
    console.warn("Foto bazasi ishga tushmadi:", error);
  }

  const today = localDateISO(todayAtNoon());
  $("todayDate").value = today;
  $("gymDate").value = today;
  $("measureDate").value = today;
  $("photoDate").value = today;
  $("weekStart").value = localDateISO(getMonday(todayAtNoon()));
  loadToday(today);
  bindEvents();
  renderAll();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => console.warn("Service worker ro‘yxatdan o‘tmadi:", error));
  }
  console.info(`FIT JARVIS v${APP_VERSION} ishga tushdi.`);
}

initialize().catch((error) => {
  console.error(error);
  showMessage("Portal ishga tushishda xato yuz berdi. Brauzer konsolini tekshiring.");
});
