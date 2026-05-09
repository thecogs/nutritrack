import * as SQLite from 'expo-sqlite';

const dbPromise = SQLite.openDatabaseAsync('nutritrack.db').then(async (db) => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS food_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      food_name TEXT NOT NULL,
      calories REAL DEFAULT 0,
      protein REAL DEFAULT 0,
      carbs REAL DEFAULT 0,
      fat REAL DEFAULT 0,
      meal_type TEXT DEFAULT 'snack',
      photo_url TEXT,
      timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS user_goals (
      id INTEGER PRIMARY KEY DEFAULT 1,
      calories REAL DEFAULT 2000,
      protein REAL DEFAULT 150,
      carbs REAL DEFAULT 250,
      fat REAL DEFAULT 65
    );
    INSERT OR IGNORE INTO user_goals (id, calories, protein, carbs, fat)
    VALUES (1, 2000, 150, 250, 65);
    CREATE TABLE IF NOT EXISTS weight_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      weight REAL NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      calories_burned REAL DEFAULT 0,
      duration_mins REAL,
      timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS advisor_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      food_name TEXT NOT NULL,
      calories REAL DEFAULT 0, protein REAL DEFAULT 0, carbs REAL DEFAULT 0,
      fat REAL DEFAULT 0, fiber REAL DEFAULT 0, sugar REAL DEFAULT 0, sat_fat REAL DEFAULT 0,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS meal_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      schedule_time TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS meal_template_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      food_name TEXT NOT NULL,
      calories REAL DEFAULT 0, protein REAL DEFAULT 0, carbs REAL DEFAULT 0,
      fat REAL DEFAULT 0, fiber REAL DEFAULT 0, sugar REAL DEFAULT 0, sat_fat REAL DEFAULT 0,
      meal_type TEXT DEFAULT 'snack'
    );
  `);

  // Migrations — each silently skips if column already exists
  const migrations = [
    'ALTER TABLE food_logs ADD COLUMN fiber REAL DEFAULT 0',
    'ALTER TABLE user_goals ADD COLUMN fiber REAL DEFAULT 30',
    'ALTER TABLE user_goals ADD COLUMN height_in REAL DEFAULT 0',
    'ALTER TABLE user_goals ADD COLUMN include_activity INTEGER DEFAULT 1',
    'ALTER TABLE food_logs ADD COLUMN sugar REAL DEFAULT 0',
    'ALTER TABLE user_goals ADD COLUMN sugar REAL DEFAULT 50',
    'ALTER TABLE food_logs ADD COLUMN sat_fat REAL DEFAULT 0',
    'ALTER TABLE user_goals ADD COLUMN sat_fat REAL DEFAULT 20',
  ];
  for (const sql of migrations) {
    await db.execAsync(sql).catch(() => {});
  }

  await db.runAsync(
    'UPDATE user_goals SET fiber = 30 WHERE id = 1 AND (fiber IS NULL OR fiber = 0);'
  ).catch(() => {});

  return db;
});

async function getDb() { return dbPromise; }

function localISOString() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

function localDateString() {
  return localISOString().split('T')[0];
}

// ── Food logs ─────────────────────────────────────────────────────────────────

export async function getTodayLogs() {
  const db = await getDb();
  return db.getAllAsync(
    'SELECT * FROM food_logs WHERE date(timestamp) = ? ORDER BY timestamp ASC',
    [localDateString()]
  );
}

export async function getLogsByDate(dateStr) {
  const db = await getDb();
  return db.getAllAsync(
    'SELECT * FROM food_logs WHERE date(timestamp) = ? ORDER BY timestamp ASC',
    [dateStr]
  );
}

export async function getAllFoodLogs() {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM food_logs ORDER BY timestamp ASC');
}

export async function addLog(food) {
  const db = await getDb();
  const now = localISOString();
  const result = await db.runAsync(
    'INSERT INTO food_logs (food_name, calories, protein, carbs, fat, fiber, sugar, sat_fat, meal_type, photo_url, timestamp) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [food.food_name, food.calories||0, food.protein||0, food.carbs||0, food.fat||0, food.fiber||0, food.sugar||0, food.sat_fat||0, food.meal_type||'snack', food.photo_url||null, now]
  );
  return { id: result.lastInsertRowId };
}

export async function updateLog(id, food) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE food_logs SET food_name=?, calories=?, protein=?, carbs=?, fat=?, fiber=?, sugar=?, sat_fat=?, meal_type=? WHERE id=?',
    [food.food_name, food.calories||0, food.protein||0, food.carbs||0, food.fat||0, food.fiber||0, food.sugar||0, food.sat_fat||0, food.meal_type||'snack', id]
  );
}

export async function deleteLog(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM food_logs WHERE id = ?', [id]);
}

// ── Goals & profile ───────────────────────────────────────────────────────────

export async function getGoals() {
  const db = await getDb();
  return (await db.getFirstAsync('SELECT * FROM user_goals WHERE id = 1')) ||
    { calories: 2000, protein: 150, carbs: 250, fat: 65, fiber: 30, sugar: 50, sat_fat: 20, height_in: 0, include_activity: 1 };
}

export async function saveGoals(goals) {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO user_goals (id, calories, protein, carbs, fat, fiber, sugar, sat_fat, height_in, include_activity) VALUES (1,?,?,?,?,?,?,?,?,?)',
    [goals.calories??2000, goals.protein??150, goals.carbs??250, goals.fat??65, goals.fiber??30, goals.sugar??50, goals.sat_fat??20, goals.height_in??0, goals.include_activity??1]
  );
}

// ── Weight logs ───────────────────────────────────────────────────────────────

export async function logWeight(weightLbs, date) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO weight_logs (date, weight) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET weight = excluded.weight, timestamp = CURRENT_TIMESTAMP`,
    [date, weightLbs]
  );
}

export async function getWeightLogs(days = 365) {
  const db = await getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = new Date(since.getTime() - since.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  return db.getAllAsync('SELECT * FROM weight_logs WHERE date >= ? ORDER BY date ASC', [sinceStr]);
}

export async function deleteWeight(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM weight_logs WHERE id = ?', [id]);
}

// ── Activity logs ─────────────────────────────────────────────────────────────

export async function logActivity({ name, calories_burned, duration_mins, date }) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO activity_logs (date, name, calories_burned, duration_mins) VALUES (?,?,?,?)',
    [date || localDateString(), name, calories_burned||0, duration_mins||null]
  );
}

export async function getActivityLogs(dateStr) {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM activity_logs WHERE date = ? ORDER BY timestamp ASC', [dateStr]);
}

export async function getTodayActivity() {
  return getActivityLogs(localDateString());
}

export async function deleteActivity(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM activity_logs WHERE id = ?', [id]);
}

// ── Calorie trend ─────────────────────────────────────────────────────────────

export async function getDailyCalorieTotals(days = 30) {
  const db = await getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = new Date(since.getTime() - since.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  const rows = await db.getAllAsync(
    `SELECT date(timestamp) as date, ROUND(SUM(calories)) as calories
     FROM food_logs WHERE date(timestamp) >= ?
     GROUP BY date(timestamp) ORDER BY date(timestamp) ASC`,
    [sinceStr]
  );
  return rows;
}

// ── Advisor chat history ──────────────────────────────────────────────────────

export async function getAdvisorHistory() {
  const db = await getDb();
  return db.getAllAsync('SELECT role, content FROM advisor_messages ORDER BY created_at ASC LIMIT 200');
}

export async function appendAdvisorMessage(role, content) {
  const db = await getDb();
  await db.runAsync('INSERT INTO advisor_messages (role, content) VALUES (?,?)', [role, content]);
}

export async function clearAdvisorHistory() {
  const db = await getDb();
  await db.runAsync('DELETE FROM advisor_messages');
}

// ── Favorites ─────────────────────────────────────────────────────────────────

export async function getFavorites() {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM favorites ORDER BY created_at DESC');
}

export async function addFavorite(food) {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO favorites (food_name, calories, protein, carbs, fat, fiber, sugar, sat_fat) VALUES (?,?,?,?,?,?,?,?)',
    [food.food_name, food.calories||0, food.protein||0, food.carbs||0, food.fat||0, food.fiber||0, food.sugar||0, food.sat_fat||0]
  );
}

export async function removeFavorite(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM favorites WHERE id = ?', [id]);
}

// ── Meal templates ────────────────────────────────────────────────────────────

export async function getTemplates() {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM meal_templates ORDER BY name ASC');
}

export async function createTemplate(name, scheduleTime = null) {
  const db = await getDb();
  const result = await db.runAsync(
    'INSERT INTO meal_templates (name, schedule_time) VALUES (?,?)',
    [name, scheduleTime]
  );
  return result.lastInsertRowId;
}

export async function deleteTemplate(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM meal_template_items WHERE template_id=?', [id]);
  await db.runAsync('DELETE FROM meal_templates WHERE id=?', [id]);
}

export async function getTemplateItems(templateId) {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM meal_template_items WHERE template_id=? ORDER BY id ASC', [templateId]);
}

export async function addTemplateItem(templateId, food) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO meal_template_items (template_id, food_name, calories, protein, carbs, fat, fiber, sugar, sat_fat, meal_type) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [templateId, food.food_name, food.calories||0, food.protein||0, food.carbs||0, food.fat||0, food.fiber||0, food.sugar||0, food.sat_fat||0, food.meal_type||'snack']
  );
}

export async function removeTemplateItem(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM meal_template_items WHERE id=?', [id]);
}

export async function applyTemplate(templateId, mealType) {
  const db = await getDb();
  const items = await getTemplateItems(templateId);
  const now = localISOString();
  for (const item of items) {
    await db.runAsync(
      'INSERT INTO food_logs (food_name, calories, protein, carbs, fat, fiber, sugar, sat_fat, meal_type, timestamp) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [item.food_name, item.calories, item.protein, item.carbs, item.fat, item.fiber||0, item.sugar||0, item.sat_fat||0, mealType||item.meal_type||'snack', now]
    );
  }
  return items.length;
}

export async function getScheduledTemplates() {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM meal_templates WHERE schedule_time IS NOT NULL ORDER BY schedule_time ASC');
}

// ── CSV import ────────────────────────────────────────────────────────────────

export async function importFromCSV(csvText) {
  const db = await getDb();
  const lines = csvText.split('\n').map((l) => l.trim()).filter(Boolean);
  let mode = null;
  let foodCount = 0, weightCount = 0;

  for (const line of lines) {
    if (line.startsWith('FOOD LOGS')) { mode = 'food'; continue; }
    if (line.startsWith('WEIGHT LOGS')) { mode = 'weight'; continue; }
    if (line.startsWith('Date,Meal') || line.startsWith('Date,Weight')) continue;

    if (mode === 'food') {
      const [date, meal_type, food_name, calories, protein, carbs, fat, fiber] = line.split(',');
      if (!date || !food_name) continue;
      const name = food_name.replace(/^"|"$/g, '');
      await db.runAsync(
        'INSERT OR IGNORE INTO food_logs (food_name, calories, protein, carbs, fat, fiber, meal_type, timestamp) VALUES (?,?,?,?,?,?,?,?)',
        [name, parseFloat(calories)||0, parseFloat(protein)||0, parseFloat(carbs)||0, parseFloat(fat)||0, parseFloat(fiber)||0, meal_type||'snack', `${date}T12:00:00`]
      );
      foodCount++;
    } else if (mode === 'weight') {
      const [date, weight] = line.split(',');
      if (!date || !weight) continue;
      await db.runAsync(
        'INSERT OR IGNORE INTO weight_logs (date, weight) VALUES (?,?)',
        [date, parseFloat(weight)||0]
      );
      weightCount++;
    }
  }
  return { food: foodCount, weight: weightCount };
}
