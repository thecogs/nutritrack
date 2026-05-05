// IndexedDB implementation — used automatically by Metro when bundling for web.

function localISOString() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 19);
}

function localDateString() {
  return localISOString().split('T')[0];
}

function req2p(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror  = () => reject(request.error);
  });
}

const dbPromise = new Promise((resolve, reject) => {
  const req = indexedDB.open('nutritrack', 1);

  req.onupgradeneeded = (e) => {
    const db = e.target.result;

    if (!db.objectStoreNames.contains('food_logs')) {
      const s = db.createObjectStore('food_logs', { keyPath: 'id', autoIncrement: true });
      s.createIndex('date', 'date', { unique: false });
    }
    if (!db.objectStoreNames.contains('user_goals')) {
      db.createObjectStore('user_goals', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('weight_logs')) {
      const s = db.createObjectStore('weight_logs', { keyPath: 'id', autoIncrement: true });
      s.createIndex('date', 'date', { unique: true });
    }
  };

  req.onsuccess  = (e) => resolve(e.target.result);
  req.onerror    = (e) => reject(e.target.error);
});

// Seed default goals on first open
dbPromise.then(async (db) => {
  const tx  = db.transaction('user_goals', 'readwrite');
  const row = await req2p(tx.objectStore('user_goals').get(1));
  if (!row) {
    await req2p(tx.objectStore('user_goals').put(
      { id: 1, calories: 2000, protein: 150, carbs: 250, fat: 65, fiber: 30 }
    ));
  }
}).catch(() => {});

async function getDb() { return dbPromise; }

export async function getTodayLogs() {
  const db  = await getDb();
  const tx  = db.transaction('food_logs', 'readonly');
  const idx = tx.objectStore('food_logs').index('date');
  return req2p(idx.getAll(localDateString()));
}

export async function getLogsByDate(dateStr) {
  const db  = await getDb();
  const tx  = db.transaction('food_logs', 'readonly');
  const idx = tx.objectStore('food_logs').index('date');
  return req2p(idx.getAll(dateStr));
}

export async function getAllFoodLogs() {
  const db  = await getDb();
  const tx  = db.transaction('food_logs', 'readonly');
  const all = await req2p(tx.objectStore('food_logs').getAll());
  return all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function addLog(food) {
  const db  = await getDb();
  const now = localISOString();
  const tx  = db.transaction('food_logs', 'readwrite');
  const id  = await req2p(tx.objectStore('food_logs').add({
    food_name: food.food_name,
    calories:  food.calories  || 0,
    protein:   food.protein   || 0,
    carbs:     food.carbs     || 0,
    fat:       food.fat       || 0,
    fiber:     food.fiber     || 0,
    meal_type: food.meal_type || 'snack',
    photo_url: food.photo_url || null,
    timestamp: now,
    date:      now.split('T')[0],
  }));
  return { id };
}

export async function deleteLog(id) {
  const db = await getDb();
  const tx = db.transaction('food_logs', 'readwrite');
  await req2p(tx.objectStore('food_logs').delete(id));
}

export async function getGoals() {
  const db  = await getDb();
  const tx  = db.transaction('user_goals', 'readonly');
  return (await req2p(tx.objectStore('user_goals').get(1))) ||
    { calories: 2000, protein: 150, carbs: 250, fat: 65, fiber: 30 };
}

export async function saveGoals(goals) {
  const db = await getDb();
  const tx = db.transaction('user_goals', 'readwrite');
  await req2p(tx.objectStore('user_goals').put({
    id:       1,
    calories: goals.calories || 2000,
    protein:  goals.protein  || 150,
    carbs:    goals.carbs    || 250,
    fat:      goals.fat      || 65,
    fiber:    goals.fiber    || 30,
  }));
}

export async function logWeight(weightLbs, date) {
  const db    = await getDb();
  const tx    = db.transaction('weight_logs', 'readwrite');
  const store = tx.objectStore('weight_logs');
  const existing = await req2p(store.index('date').get(date));
  if (existing) {
    await req2p(store.put({ ...existing, weight: weightLbs, timestamp: new Date().toISOString() }));
  } else {
    await req2p(store.add({ date, weight: weightLbs, timestamp: new Date().toISOString() }));
  }
}

export async function getWeightLogs(days = 365) {
  const db    = await getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = new Date(since.getTime() - since.getTimezoneOffset() * 60000)
    .toISOString().split('T')[0];
  const tx  = db.transaction('weight_logs', 'readonly');
  const all = await req2p(tx.objectStore('weight_logs').getAll());
  return all.filter((r) => r.date >= sinceStr).sort((a, b) => a.date.localeCompare(b.date));
}

export async function deleteWeight(id) {
  const db = await getDb();
  const tx = db.transaction('weight_logs', 'readwrite');
  await req2p(tx.objectStore('weight_logs').delete(id));
}
