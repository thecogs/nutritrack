import * as SQLite from 'expo-sqlite';

const dbPromise = SQLite.openDatabaseAsync('nutritrack.db').then(async (db) => {
  // Step 1: create tables using original schema (no fiber) so INSERT OR IGNORE
  // doesn't reference a column that may not exist yet on existing installs.
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
  `);

  // Weight tracking table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS weight_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      weight REAL NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Step 2: add fiber columns — silently skips on fresh installs (column already
  // present from CREATE TABLE) or any install that already ran this migration.
  await db.execAsync('ALTER TABLE food_logs ADD COLUMN fiber REAL DEFAULT 0;').catch(() => {});
  await db.execAsync('ALTER TABLE user_goals ADD COLUMN fiber REAL DEFAULT 30;').catch(() => {});

  // Step 3: set fiber goal to 30 for any existing row that has null/0
  await db.runAsync(
    'UPDATE user_goals SET fiber = 30 WHERE id = 1 AND (fiber IS NULL OR fiber = 0);'
  ).catch(() => {});

  return db;
});

async function getDb() {
  return dbPromise;
}

function localISOString() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
}

function localDateString() {
  return localISOString().split('T')[0];
}

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

export async function addLog(food) {
  const db  = await getDb();
  const now = localISOString();
  const result = await db.runAsync(
    'INSERT INTO food_logs (food_name, calories, protein, carbs, fat, fiber, meal_type, photo_url, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      food.food_name,
      food.calories  || 0,
      food.protein   || 0,
      food.carbs     || 0,
      food.fat       || 0,
      food.fiber     || 0,
      food.meal_type || 'snack',
      food.photo_url || null,
      now,
    ]
  );
  return { id: result.lastInsertRowId };
}

export async function deleteLog(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM food_logs WHERE id = ?', [id]);
}

export async function getGoals() {
  const db = await getDb();
  return (await db.getFirstAsync('SELECT * FROM user_goals WHERE id = 1')) ||
    { calories: 2000, protein: 150, carbs: 250, fat: 65, fiber: 30 };
}

// ── Weight tracking ───────────────────────────────────────────────────────────

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
  const sinceStr = new Date(since.getTime() - since.getTimezoneOffset() * 60000)
    .toISOString().split('T')[0];
  return db.getAllAsync(
    'SELECT * FROM weight_logs WHERE date >= ? ORDER BY date ASC',
    [sinceStr]
  );
}

export async function deleteWeight(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM weight_logs WHERE id = ?', [id]);
}

export async function getAllFoodLogs() {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM food_logs ORDER BY timestamp ASC');
}

export async function saveGoals(goals) {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO user_goals (id, calories, protein, carbs, fat, fiber) VALUES (1, ?, ?, ?, ?, ?)',
    [goals.calories || 2000, goals.protein || 150, goals.carbs || 250, goals.fat || 65, goals.fiber || 30]
  );
}
