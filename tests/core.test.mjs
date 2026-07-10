import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyRecord,
  getMonday,
  hasMeaningfulRecord,
  localDateISO,
  rollingDates,
  scoreRecord,
  validateAndNormalizeBackup,
} from "../assets/js/core.js";
import { DEFAULT_SETTINGS } from "../assets/js/config.js";

test("dam/tiklanish kunida qadam sport komponentini almashtiradi", () => {
  const record = {
    ...createEmptyRecord("2026-07-10"),
    plan: "Dam / ofis",
    sport: 0,
    food: 100,
    sleep: 7,
    water: 3,
    steps: 8000,
  };
  assert.equal(scoreRecord(record, DEFAULT_SETTINGS), 100);
});

test("aktiv kunda qadam sport foizini avtomatik almashtirmaydi", () => {
  const record = {
    ...createEmptyRecord("2026-07-14"),
    plan: "Boks",
    sport: 0,
    food: 100,
    sleep: 7,
    water: 3,
    steps: 8000,
  };
  assert.equal(scoreRecord(record, DEFAULT_SETTINGS), 60);
});

test("rolling tracking bugungi kundan boshlab aynan 30 kun yaratadi", () => {
  const dates = rollingDates(new Date("2026-07-10T12:00:00"), 30);
  assert.equal(dates.length, 30);
  assert.equal(dates[0], "2026-07-10");
  assert.equal(dates[29], "2026-08-08");
});

test("yakshanba uchun hafta boshi oldingi dushanba bo‘ladi", () => {
  const monday = getMonday(new Date("2026-07-12T12:00:00"));
  assert.equal(localDateISO(monday), "2026-07-06");
});

test("bo‘sh record haftalik hisobot uchun ma’lumot hisoblanmaydi", () => {
  assert.equal(hasMeaningfulRecord(createEmptyRecord("2026-07-10")), false);
  assert.equal(hasMeaningfulRecord({ ...createEmptyRecord("2026-07-10"), water: 2.5 }), true);
});

test("backup versiyasi va tuzilmasi tekshiriladi", () => {
  const normalized = validateAndNormalizeBackup({
    version: 3,
    settings: DEFAULT_SETTINGS,
    records: {
      "2026-07-10": { ...createEmptyRecord("2026-07-10"), plan: "<img src=x onerror=alert(1)>" },
    },
    habitData: {},
    gymData: [],
    measureData: [],
    photos: [],
  });
  assert.equal(normalized.version, 3);
  assert.equal(normalized.records["2026-07-10"].plan, "<img src=x onerror=alert(1)>");
  assert.throws(() => validateAndNormalizeBackup({ version: 99, records: {} }));
});
