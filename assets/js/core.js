import {
  BACKUP_VERSION,
  DEFAULT_SCHEDULE,
  DEFAULT_SETTINGS,
  RECOVERY_KEYWORDS,
} from "./config.js";

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

export function localDateISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString))) return null;
  const date = new Date(`${dateString}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addDays(date, count) {
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  result.setHours(12, 0, 0, 0);
  return result;
}

export function todayAtNoon() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date;
}

export function rollingDates(startDate = todayAtNoon(), count = 30) {
  return Array.from({ length: count }, (_, index) => localDateISO(addDays(startDate, index)));
}

export function pastDates(endDate = todayAtNoon(), count = 30) {
  return Array.from({ length: count }, (_, index) => localDateISO(addDays(endDate, index - count + 1)));
}

export function getMonday(date = todayAtNoon()) {
  const normalized = new Date(date);
  normalized.setHours(12, 0, 0, 0);
  const day = normalized.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(normalized, offset);
}

export function getDefaultPlan(dateString, schedule = DEFAULT_SCHEDULE) {
  const date = parseLocalDate(dateString) || todayAtNoon();
  return schedule[date.getDay()];
}

export function getPlanText(record, schedule = DEFAULT_SCHEDULE) {
  const custom = typeof record?.plan === "string" ? record.plan.trim() : "";
  return custom || getDefaultPlan(record?.date, schedule).type;
}

export function isRecoveryPlan(planText) {
  const normalized = String(planText || "").toLocaleLowerCase("uz-UZ");
  return RECOVERY_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function createEmptyRecord(date) {
  return {
    date,
    plan: "",
    sport: "",
    food: "",
    water: "",
    sleep: "",
    weight: "",
    steps: "",
    creatine: false,
    energy: "",
    mood: "",
    actualKcal: "",
    actualProtein: "",
    foodNote: "",
    trainingNote: "",
    extraNote: "",
  };
}

const MEANINGFUL_FIELDS = [
  "sport",
  "food",
  "water",
  "sleep",
  "weight",
  "steps",
  "energy",
  "mood",
  "actualKcal",
  "actualProtein",
  "foodNote",
  "trainingNote",
  "extraNote",
];

export function hasMeaningfulRecord(record) {
  if (!record) return false;
  return MEANINGFUL_FIELDS.some((key) => {
    const value = record[key];
    if (typeof value === "number") return Number.isFinite(value) && value !== 0;
    if (typeof value === "boolean") return value;
    return String(value ?? "").trim() !== "" && String(value).trim() !== "0";
  });
}

export function normalizedSettings(input = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...(isPlainObject(input) ? input : {}) };
  const result = {};
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    const value = Number(merged[key]);
    result[key] = Number.isFinite(value) ? value : fallback;
  }
  result.heightCm = clamp(result.heightCm, 100, 250);
  result.startWeight = clamp(result.startWeight, 30, 300);
  result.goalWeight = clamp(result.goalWeight, 30, 300);
  result.waterGoal = clamp(result.waterGoal, 0.5, 10);
  result.sleepGoal = clamp(result.sleepGoal, 3, 12);
  result.stepsGoal = clamp(result.stepsGoal, 1000, 100000);
  result.sportWeight = clamp(result.sportWeight, 0, 100);
  result.foodWeight = clamp(result.foodWeight, 0, 100);
  result.sleepWeight = clamp(result.sleepWeight, 0, 100);
  result.waterWeight = clamp(result.waterWeight, 0, 100);
  return result;
}

export function activityPercent(record, settings, schedule = DEFAULT_SCHEDULE) {
  const safeSettings = normalizedSettings(settings);
  const sportPercent = clamp(record?.sport);
  const stepsPercent = clamp((Number(record?.steps) || 0) / safeSettings.stepsGoal * 100);
  return isRecoveryPlan(getPlanText(record, schedule))
    ? Math.max(sportPercent, stepsPercent)
    : sportPercent;
}

export function scoreRecord(record, settings, schedule = DEFAULT_SCHEDULE) {
  if (!record) return 0;
  const safeSettings = normalizedSettings(settings);
  const waterPercent = clamp((Number(record.water) || 0) / safeSettings.waterGoal * 100);
  const sleepPercent = clamp((Number(record.sleep) || 0) / safeSettings.sleepGoal * 100);
  const sportPercent = activityPercent(record, safeSettings, schedule);
  const foodPercent = clamp(record.food);

  const sportWeight = safeSettings.sportWeight;
  const foodWeight = safeSettings.foodWeight;
  const sleepWeight = safeSettings.sleepWeight;
  const waterWeight = safeSettings.waterWeight;
  const totalWeight = sportWeight + foodWeight + sleepWeight + waterWeight;
  if (totalWeight <= 0) return 0;

  return Math.round((
    sportPercent * sportWeight
    + foodPercent * foodWeight
    + sleepPercent * sleepWeight
    + waterPercent * waterWeight
  ) / totalWeight);
}

export function labelForScore(score) {
  return score >= 90 ? "A’lo"
    : score >= 80 ? "Yaxshi"
      : score >= 70 ? "Qoniqarli"
        : score >= 60 ? "O‘rtacha"
          : "Past";
}

export function classForScore(score) {
  return score >= 90 ? "excellent"
    : score >= 80 ? "good"
      : score >= 70 ? "ok"
        : score >= 60 ? "average"
          : "low";
}

export function dynamicRange(values, fallbackMin, fallbackMax, padding = 0.12) {
  const finite = values.map(Number).filter(Number.isFinite);
  if (!finite.length) return { min: fallbackMin, max: fallbackMax };
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (min === max) {
    const base = Math.max(Math.abs(min) * 0.05, 1);
    min -= base;
    max += base;
  } else {
    const pad = (max - min) * padding;
    min -= pad;
    max += pad;
  }
  return { min: Math.floor(min * 10) / 10, max: Math.ceil(max * 10) / 10 };
}

export function cleanString(value, maxLength = 500) {
  return String(value ?? "").replace(/\u0000/g, "").slice(0, maxLength);
}

export function cleanNumber(value, min, max, allowBlank = true) {
  if (value === "" || value === null || value === undefined) return allowBlank ? "" : min;
  const number = Number(value);
  if (!Number.isFinite(number)) return allowBlank ? "" : min;
  return clamp(number, min, max);
}

function normalizeRecord(date, raw) {
  if (!parseLocalDate(date) || !isPlainObject(raw)) throw new Error(`Noto‘g‘ri record: ${date}`);
  return {
    ...createEmptyRecord(date),
    date,
    plan: cleanString(raw.plan, 160),
    sport: cleanNumber(raw.sport, 0, 100),
    food: cleanNumber(raw.food, 0, 100),
    water: cleanNumber(raw.water, 0, 20),
    sleep: cleanNumber(raw.sleep, 0, 24),
    weight: cleanNumber(raw.weight, 30, 300),
    steps: cleanNumber(raw.steps, 0, 200000),
    creatine: Boolean(raw.creatine),
    energy: cleanNumber(raw.energy, 1, 10),
    mood: cleanNumber(raw.mood, 1, 10),
    actualKcal: cleanNumber(raw.actualKcal, 0, 10000),
    actualProtein: cleanNumber(raw.actualProtein, 0, 1000),
    foodNote: cleanString(raw.foodNote, 2000),
    trainingNote: cleanString(raw.trainingNote, 2000),
    extraNote: cleanString(raw.extraNote, 2000),
  };
}

function normalizeGymData(data) {
  if (!Array.isArray(data) || data.length > 10000) throw new Error("Gym ma’lumotlari noto‘g‘ri");
  return data.map((item) => {
    if (!isPlainObject(item) || !parseLocalDate(item.date)) throw new Error("Gym yozuvi noto‘g‘ri");
    return {
      date: item.date,
      exercise: cleanString(item.exercise || "Mashq", 160),
      weight: cleanNumber(item.weight, 0, 1000, false),
      sets: cleanNumber(item.sets, 0, 100, false),
      reps: cleanNumber(item.reps, 0, 1000, false),
      rpe: cleanNumber(item.rpe, 0, 10, false),
      note: cleanString(item.note, 1000),
    };
  });
}

function normalizeMeasures(data) {
  if (!Array.isArray(data) || data.length > 10000) throw new Error("O‘lchov ma’lumotlari noto‘g‘ri");
  return data.map((item) => {
    if (!isPlainObject(item) || !parseLocalDate(item.date)) throw new Error("O‘lchov yozuvi noto‘g‘ri");
    return {
      date: item.date,
      weight: cleanNumber(item.weight, 0, 300, false),
      waist: cleanNumber(item.waist, 0, 300, false),
      chest: cleanNumber(item.chest, 0, 300, false),
      arm: cleanNumber(item.arm, 0, 200, false),
      thigh: cleanNumber(item.thigh, 0, 250, false),
      bodyFat: cleanNumber(item.bodyFat, 0, 100, false),
    };
  });
}

function normalizeHabits(data) {
  if (!isPlainObject(data)) throw new Error("Odatlar ma’lumoti noto‘g‘ri");
  const result = {};
  for (const [date, values] of Object.entries(data)) {
    if (!parseLocalDate(date) || !isPlainObject(values)) continue;
    result[date] = {};
    for (const [index, value] of Object.entries(values)) {
      if (/^\d{1,2}$/.test(index)) result[date][index] = Boolean(value);
    }
  }
  return result;
}

function normalizePhotos(data) {
  if (data === undefined) return [];
  if (!Array.isArray(data) || data.length > 250) throw new Error("Foto ma’lumotlari noto‘g‘ri");
  return data.map((photo, index) => {
    if (!isPlainObject(photo) || !parseLocalDate(photo.date)) throw new Error("Foto yozuvi noto‘g‘ri");
    const dataUrl = cleanString(photo.data, 25_000_000);
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(dataUrl)) throw new Error("Foto formati noto‘g‘ri");
    return {
      id: cleanString(photo.id || `${Date.now()}-${index}`, 100),
      date: photo.date,
      type: cleanString(photo.type || "Old", 30),
      data: dataUrl,
    };
  });
}

export function validateAndNormalizeBackup(raw) {
  if (!isPlainObject(raw)) throw new Error("Backup obyekt emas");
  const version = Number(raw.version || 2);
  if (![2, BACKUP_VERSION].includes(version)) throw new Error("Backup versiyasi qo‘llab-quvvatlanmaydi");
  if (!isPlainObject(raw.records)) throw new Error("Records bo‘limi topilmadi");
  const entries = Object.entries(raw.records);
  if (entries.length > 5000) throw new Error("Records soni juda ko‘p");
  const records = {};
  for (const [date, record] of entries) records[date] = normalizeRecord(date, record);

  return {
    version: BACKUP_VERSION,
    settings: normalizedSettings(raw.settings),
    records,
    habitData: normalizeHabits(raw.habitData || {}),
    gymData: normalizeGymData(raw.gymData || []),
    measureData: normalizeMeasures(raw.measureData || []),
    photos: normalizePhotos(raw.photos || raw.photoData || []),
  };
}
