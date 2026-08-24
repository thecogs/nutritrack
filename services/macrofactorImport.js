// Parses a MacroFactor "Quick Export" .xlsx workbook into rows NutriTrack can store.
//
// MacroFactor exports two sheets:
//   "Food Log"    — one row per logged food, with a Date + Time but no meal type
//   "Quick Export" — one row per day, with an actual "Weight (lbs)" column that's
//                    only populated on days a weigh-in was actually logged
//                    (as opposed to "Trend Weight (lbs)", which is estimated daily)
import * as XLSX from 'xlsx';
import { getMealTypeForHour } from './mealTime';

const FOOD_LOG_SHEET = 'Food Log';
const QUICK_EXPORT_SHEET = 'Quick Export';

function excelDateToISO(value) {
  if (value instanceof Date) return value.toISOString().split('T')[0];
  if (typeof value === 'string') return value.slice(0, 10);
  return null;
}

function parseTimeToHour(value) {
  if (typeof value !== 'string') return 12;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return 12;
  let hour = parseInt(m[1], 10) % 12;
  if (m[3] && m[3].toUpperCase() === 'PM') hour += 12;
  return hour;
}

export function isMacroFactorWorkbook(workbook) {
  return workbook.SheetNames.includes(FOOD_LOG_SHEET) || workbook.SheetNames.includes(QUICK_EXPORT_SHEET);
}

// `data` is anything XLSX.read() accepts: an ArrayBuffer ({type:'array'}) or
// a base64 string ({type:'base64'}, used when reading via expo-file-system on native).
export function parseMacroFactorWorkbook(data, type) {
  const workbook = XLSX.read(data, { type, cellDates: true });
  if (!isMacroFactorWorkbook(workbook)) {
    throw new Error('This doesn’t look like a MacroFactor export.');
  }

  const foodRows = [];
  if (workbook.SheetNames.includes(FOOD_LOG_SHEET)) {
    const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[FOOD_LOG_SHEET], { header: 1, raw: true });
    const [header, ...rows] = sheet;
    const idx = (name) => header.indexOf(name);
    const iDate = idx('Date'), iTime = idx('Time'), iName = idx('Food Name');
    const iCal = idx('Calories (kcal)'), iFat = idx('Fat (g)'), iCarbs = idx('Carbs (g)');
    const iProtein = idx('Protein (g)'), iFiber = idx('Fiber (g)');

    for (const row of rows) {
      const date = excelDateToISO(row[iDate]);
      const name = row[iName];
      if (!date || !name) continue;
      const hour = parseTimeToHour(row[iTime]);
      foodRows.push({
        food_name: String(name),
        calories: Number(row[iCal]) || 0,
        protein: Number(row[iProtein]) || 0,
        carbs: Number(row[iCarbs]) || 0,
        fat: Number(row[iFat]) || 0,
        fiber: Number(row[iFiber]) || 0,
        meal_type: getMealTypeForHour(hour),
        date,
        timestamp: `${date}T${String(hour).padStart(2, '0')}:00:00`,
      });
    }
  }

  const weightRows = [];
  if (workbook.SheetNames.includes(QUICK_EXPORT_SHEET)) {
    const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[QUICK_EXPORT_SHEET], { header: 1, raw: true });
    const [header, ...rows] = sheet;
    const idx = (name) => header.indexOf(name);
    const iDate = idx('Date'), iWeight = idx('Weight (lbs)');

    for (const row of rows) {
      const date = excelDateToISO(row[iDate]);
      const weight = row[iWeight];
      if (!date || weight == null || weight === '') continue;
      weightRows.push({ date, weight: Number(weight) });
    }
  }

  return { foodRows, weightRows };
}
