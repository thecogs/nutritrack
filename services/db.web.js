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

export async function getTodayLogs() {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', localDateString())
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getLogsByDate(dateStr) {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', dateStr)
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getAllFoodLogs() {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
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
      user_id:   userId,
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
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id };
}

export async function deleteLog(id) {
  const userId = await getUserId();
  const { error } = await supabase
    .from('food_logs')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function getGoals() {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('user_goals')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || { calories: 2000, protein: 150, carbs: 250, fat: 65, fiber: 30 };
}

export async function saveGoals(goals) {
  const userId = await getUserId();
  const { error } = await supabase
    .from('user_goals')
    .upsert({
      user_id:  userId,
      calories: goals.calories || 2000,
      protein:  goals.protein  || 150,
      carbs:    goals.carbs    || 250,
      fat:      goals.fat      || 65,
      fiber:    goals.fiber    || 30,
    });
  if (error) throw error;
}

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
    .from('weight_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('date', sinceStr)
    .order('date', { ascending: true });
  if (error) throw error;
  return data;
}

export async function deleteWeight(id) {
  const userId = await getUserId();
  const { error } = await supabase
    .from('weight_logs')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}
