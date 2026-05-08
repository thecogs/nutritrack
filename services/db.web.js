// Supabase implementation — used automatically by Metro when bundling for web.

import { supabase } from './supabase';

function localISOString() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 19);
}

function localDateString() {
  return localISOString().split('T')[0];
}

async function getUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return session.user.id;
}

// ── Food logs ─────────────────────────────────────────────────────────────────

export async function getTodayLogs() {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('food_logs').select('*')
    .eq('user_id', userId).eq('date', localDateString())
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getLogsByDate(dateStr) {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('food_logs').select('*')
    .eq('user_id', userId).eq('date', dateStr)
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getAllFoodLogs() {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('food_logs').select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data;
}

export async function addLog(food) {
  const userId = await getUserId();
  const now = localISOString();
  const { data, error } = await supabase
    .from('food_logs')
    .insert({
      user_id: userId, food_name: food.food_name,
      calories: food.calories || 0, protein: food.protein || 0,
      carbs: food.carbs || 0, fat: food.fat || 0, fiber: food.fiber || 0, sugar: food.sugar || 0,
      meal_type: food.meal_type || 'snack', photo_url: food.photo_url || null,
      timestamp: now, date: now.split('T')[0],
    })
    .select('id').single();
  if (error) throw error;
  return { id: data.id };
}

export async function updateLog(id, food) {
  const userId = await getUserId();
  const { error } = await supabase
    .from('food_logs')
    .update({
      food_name: food.food_name,
      calories: food.calories || 0, protein: food.protein || 0,
      carbs: food.carbs || 0, fat: food.fat || 0, fiber: food.fiber || 0, sugar: food.sugar || 0,
      meal_type: food.meal_type || 'snack',
    })
    .eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function deleteLog(id) {
  const userId = await getUserId();
  const { error } = await supabase
    .from('food_logs').delete()
    .eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

// ── Goals & profile ───────────────────────────────────────────────────────────

export async function getGoals() {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('user_goals').select('*')
    .eq('user_id', userId).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || { calories: 2000, protein: 150, carbs: 250, fat: 65, fiber: 30, sugar: 50, height_in: 0, include_activity: true };
}

export async function saveGoals(goals) {
  const userId = await getUserId();
  const current = await getGoals();
  const { error } = await supabase
    .from('user_goals')
    .upsert({
      user_id: userId,
      calories: goals.calories ?? current.calories ?? 2000,
      protein:  goals.protein  ?? current.protein  ?? 150,
      carbs:    goals.carbs    ?? current.carbs    ?? 250,
      fat:      goals.fat      ?? current.fat      ?? 65,
      fiber:    goals.fiber    ?? current.fiber    ?? 30,
      sugar:    goals.sugar    ?? current.sugar    ?? 50,
      height_in:        goals.height_in        ?? current.height_in        ?? 0,
      include_activity: goals.include_activity ?? current.include_activity ?? true,
    });
  if (error) throw error;
}

// ── Weight logs ───────────────────────────────────────────────────────────────

export async function logWeight(weightLbs, date) {
  const userId = await getUserId();
  const { error } = await supabase
    .from('weight_logs')
    .upsert(
      { user_id: userId, date, weight: weightLbs, timestamp: new Date().toISOString() },
      { onConflict: 'user_id,date' }
    );
  if (error) throw error;
}

export async function getWeightLogs(days = 365) {
  const userId = await getUserId();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = new Date(since.getTime() - since.getTimezoneOffset() * 60000)
    .toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('weight_logs').select('*')
    .eq('user_id', userId).gte('date', sinceStr)
    .order('date', { ascending: true });
  if (error) throw error;
  return data;
}

export async function deleteWeight(id) {
  const userId = await getUserId();
  const { error } = await supabase
    .from('weight_logs').delete()
    .eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

// ── Activity logs ─────────────────────────────────────────────────────────────

export async function logActivity({ name, calories_burned, duration_mins, date }) {
  const userId = await getUserId();
  const { error } = await supabase
    .from('activity_logs')
    .insert({
      user_id: userId, date: date || localDateString(),
      name, calories_burned: calories_burned || 0,
      duration_mins: duration_mins || null,
      timestamp: new Date().toISOString(),
    });
  if (error) throw error;
}

export async function getActivityLogs(dateStr) {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('activity_logs').select('*')
    .eq('user_id', userId).eq('date', dateStr)
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getTodayActivity() {
  return getActivityLogs(localDateString());
}

export async function deleteActivity(id) {
  const userId = await getUserId();
  const { error } = await supabase
    .from('activity_logs').delete()
    .eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

// ── Calorie trend ─────────────────────────────────────────────────────────────

export async function getDailyCalorieTotals(days = 30) {
  const userId = await getUserId();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = new Date(since.getTime() - since.getTimezoneOffset() * 60000)
    .toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('food_logs').select('date, calories')
    .eq('user_id', userId).gte('date', sinceStr);
  if (error) throw error;
  const map = {};
  (data || []).forEach((row) => {
    map[row.date] = (map[row.date] || 0) + (row.calories || 0);
  });
  return Object.entries(map)
    .map(([date, calories]) => ({ date, calories: Math.round(calories) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Advisor chat history ──────────────────────────────────────────────────────

export async function getAdvisorHistory() {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('advisor_messages').select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error && error.code !== 'PGRST116') throw error;
  return data || [];
}

export async function appendAdvisorMessage(role, content) {
  const userId = await getUserId();
  const { error } = await supabase
    .from('advisor_messages')
    .insert({ user_id: userId, role, content });
  if (error) throw error;
}

export async function clearAdvisorHistory() {
  const userId = await getUserId();
  const { error } = await supabase
    .from('advisor_messages').delete()
    .eq('user_id', userId);
  if (error) throw error;
}

// ── CSV import ────────────────────────────────────────────────────────────────

export async function importFromCSV(csvText) {
  const userId = await getUserId();
  const lines = csvText.split('\n').map((l) => l.trim()).filter(Boolean);
  let mode = null;
  const foodRows = [];
  const weightRows = [];

  for (const line of lines) {
    if (line.startsWith('FOOD LOGS')) { mode = 'food'; continue; }
    if (line.startsWith('WEIGHT LOGS')) { mode = 'weight'; continue; }
    if (line.startsWith('Date,Meal') || line.startsWith('Date,Weight')) continue;

    if (mode === 'food') {
      const [date, meal_type, food_name, calories, protein, carbs, fat, fiber] = line.split(',');
      if (!date || !food_name) continue;
      foodRows.push({
        user_id: userId,
        food_name: food_name.replace(/^"|"$/g, ''),
        calories: parseFloat(calories) || 0,
        protein:  parseFloat(protein)  || 0,
        carbs:    parseFloat(carbs)    || 0,
        fat:      parseFloat(fat)      || 0,
        fiber:    parseFloat(fiber)    || 0,
        meal_type: meal_type || 'snack',
        date,
        timestamp: `${date}T12:00:00`,
      });
    } else if (mode === 'weight') {
      const [date, weight] = line.split(',');
      if (!date || !weight) continue;
      weightRows.push({ user_id: userId, date, weight: parseFloat(weight) || 0 });
    }
  }

  if (foodRows.length) {
    const { error } = await supabase.from('food_logs').upsert(foodRows, { ignoreDuplicates: true });
    if (error) throw error;
  }
  if (weightRows.length) {
    const { error } = await supabase.from('weight_logs')
      .upsert(weightRows, { onConflict: 'user_id,date', ignoreDuplicates: true });
    if (error) throw error;
  }
  return { food: foodRows.length, weight: weightRows.length };
}
