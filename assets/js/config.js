export const APP_VERSION = 3;
export const BACKUP_VERSION = 3;

export const DAY_NAMES = [
  "Yakshanba",
  "Dushanba",
  "Seshanba",
  "Chorshanba",
  "Payshanba",
  "Juma",
  "Shanba",
];

export const DEFAULT_SCHEDULE = Object.freeze({
  0: { type: "Upper / Suzish", plan: "Upper body yoki suzish", kcal: 2400, protein: 170, carbs: 270, fat: 70 },
  1: { type: "Suzish / tiklanish", plan: "Yengil suzish yoki faol tiklanish", kcal: 2350, protein: 170, carbs: 255, fat: 70 },
  2: { type: "Boks", plan: "Boks mashg‘uloti", kcal: 2450, protein: 170, carbs: 285, fat: 70 },
  3: { type: "Dam / ofis", plan: "Dam olish, stretching yoki yurish", kcal: 2200, protein: 170, carbs: 210, fat: 75 },
  4: { type: "Boks", plan: "Boks mashg‘uloti", kcal: 2450, protein: 170, carbs: 285, fat: 70 },
  5: { type: "Dam / ofis", plan: "Dam olish, stretching yoki yurish", kcal: 2200, protein: 170, carbs: 210, fat: 75 },
  6: { type: "Gym oyoq", plan: "Gym — oyoq kuni", kcal: 2500, protein: 170, carbs: 300, fat: 70 },
});

export const LEG_WORKOUT = [
  "Qizish — 5–8 daqiqa",
  "Squat yoki Leg Press — 4×8–12",
  "Romanian Deadlift — 3×8–10",
  "Walking Lunges — 3×10 har oyoq",
  "Leg Curl — 3×10–15",
  "Leg Extension — 3×10–15",
  "Calf Raise — 4×12–20",
  "Plank — 3×45–60 sek",
];

export const UPPER_WORKOUT = [
  "Qizish — 5–8 daqiqa",
  "Bench/Dumbbell Press — 4×8–12",
  "Lat Pulldown — 4×8–12",
  "Seated Cable Row — 3×10–12",
  "Shoulder Press — 3×8–10",
  "Lateral Raise — 3×12–15",
  "Face Pull — 3×12–15",
  "Biceps Curl — 3×10–12",
  "Triceps Pushdown — 3×10–12",
];

export const HABITS = [
  "3 litr suv",
  "7 soat uyqu",
  "5 g kreatin",
  "8 000 qadam",
  "Meva yoki sabzavot",
  "Shirin ichimliksiz kun",
  "Fast-foodsiz kun",
  "Sport yoki faol tiklanish",
  "Kitob o‘qish",
  "Telefon vaqtini cheklash",
];

export const DEFAULT_SETTINGS = Object.freeze({
  heightCm: 182,
  startWeight: 86,
  goalWeight: 80,
  waterGoal: 3,
  sleepGoal: 7,
  stepsGoal: 8000,
  sportWeight: 40,
  foodWeight: 35,
  sleepWeight: 15,
  waterWeight: 10,
});

export const RECOVERY_KEYWORDS = [
  "dam",
  "ofis",
  "tiklanish",
  "yengil",
  "stretch",
  "yurish",
  "rest",
];

export const STORAGE_KEYS = Object.freeze({
  settings: "fj_settings",
  records: "fj_records",
  habits: "fj_habits",
  gym: "fj_gym",
  measures: "fj_measures",
  legacyPhotos: "fj_photos",
  theme: "fj_theme",
});
