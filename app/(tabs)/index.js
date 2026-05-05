import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, Alert, ScrollView, Modal, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getTodayLogs, getGoals, deleteLog, addLog, updateLog, getTodayActivity, logActivity, deleteActivity } from '../../services/db';
import { describeFoods, searchFood } from '../../services/api';
import { getDefaultMealType } from '../../services/mealTime';

const G    = '#471914';
const BG   = '#070F05';
const CARD = '#0D1B0B';
const SURF = '#172519';
const TEXT = '#B6A8A2';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const SERVING_PRESETS = [
  { label: '1 oz', grams: 28 }, { label: '2 oz', grams: 57 }, { label: '3 oz', grams: 85 },
  { label: '4 oz', grams: 113 }, { label: '6 oz', grams: 170 }, { label: '8 oz', grams: 227 },
  { label: '100g', grams: 100 }, { label: '150g', grams: 150 }, { label: '200g', grams: 200 }, { label: '300g', grams: 300 },
];
const MACRO_DEFS = [
  { key: 'calories', label: 'Calories', unit: 'kcal', color: '#E05555' },
  { key: 'protein',  label: 'Protein',  unit: 'g',    color: '#4B9CD3' },
  { key: 'carbs',    label: 'Carbs',    unit: 'g',    color: '#D4A017' },
  { key: 'fat',      label: 'Fat',      unit: 'g',    color: '#9B7FD4' },
  { key: 'fiber',    label: 'Fiber',    unit: 'g',    color: '#3A8FC4' },
];

function MacroPill({ label, current, goal, color }) {
  const pct  = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const over = goal > 0 && current > goal;
  return (
    <View style={styles.macroPill}>
      <Text style={[styles.macroPillVal, { color: over ? '#E05555' : color }]}>
        {Math.round(current)}<Text style={styles.macroPillUnit}>g</Text>
      </Text>
      <View style={styles.macroPillTrack}>
        <View style={[styles.macroPillFill, { width: `${pct}%`, backgroundColor: over ? '#E05555' : color }]} />
      </View>
      <Text style={styles.macroPillLabel}>{label}</Text>
    </View>
  );
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── AddFoodModal ──────────────────────────────────────────────────────────────

function AddFoodModal({ visible, onClose, onSave }) {
  const [text, setText]                 = useState('');
  const [results, setResults]           = useState([]);
  const [searching, setSearching]       = useState(false);
  const [estimating, setEstimating]     = useState(false);
  const [mealType, setMealType]         = useState(getDefaultMealType);
  const [base, setBase]                 = useState(null);
  const [servingGrams, setServingGrams] = useState(100);
  const [aiItems, setAiItems]           = useState(null);
  const [macros, setMacros] = useState({ calories: '', protein: '', carbs: '', fat: '', fiber: '' });
  const setMacro = (key) => (val) => setMacros((m) => ({ ...m, [key]: val }));
  const searchTimer = useRef(null);
  const pickedRef   = useRef(false);

  useEffect(() => { if (visible) setMealType(getDefaultMealType()); }, [visible]);
  useEffect(() => {
    if (!base) return;
    const f = servingGrams / 100;
    setMacros({
      calories: String(Math.round(base.calories * f)),
      protein:  String(Math.round(base.protein  * f * 10) / 10),
      carbs:    String(Math.round(base.carbs    * f * 10) / 10),
      fat:      String(Math.round(base.fat      * f * 10) / 10),
      fiber:    String(Math.round((base.fiber||0) * f * 10) / 10),
    });
  }, [base, servingGrams]);

  const handleTextChange = (t) => {
    setText(t); setResults([]); setAiItems(null); pickedRef.current = false;
    clearTimeout(searchTimer.current);
    if (t.trim().length < 2) { setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      if (pickedRef.current) { setSearching(false); return; }
      try { const data = await searchFood(t.trim()); if (!pickedRef.current) setResults(data||[]); }
      catch { setResults([]); } finally { setSearching(false); }
    }, 400);
  };

  const handleEstimate = async () => {
    if (!text.trim() || estimating) return;
    pickedRef.current = true; clearTimeout(searchTimer.current); setResults([]); setEstimating(true);
    try {
      const foods = await describeFoods(text.trim());
      if (foods.length === 1) {
        const food = foods[0];
        setText(food.food_name || text.trim()); setBase(null);
        setMacros({ calories: String(food.calories??''), protein: String(food.protein??''), carbs: String(food.carbs??''), fat: String(food.fat??''), fiber: String(food.fiber??'') });
        setAiItems(null);
      } else { setAiItems(foods.map((f) => ({ ...f, excluded: false }))); }
    } catch { Alert.alert('AI estimate failed', 'Enter values manually below.'); }
    finally { setEstimating(false); }
  };

  const pickResult = (item) => {
    pickedRef.current = true; clearTimeout(searchTimer.current); setResults([]); setSearching(false); setAiItems(null);
    const b = { calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat, fiber: item.fiber||0 };
    setBase(b); setServingGrams(100); setText(item.food_name);
    setMacros({ calories: String(item.calories), protein: String(item.protein), carbs: String(item.carbs), fat: String(item.fat), fiber: String(item.fiber||0) });
  };

  const handleSave = async () => {
    const name = text.trim();
    if (!name) { Alert.alert('Name required', 'Enter a food name or description first.'); return; }
    await onSave({ food_name: name, calories: parseFloat(macros.calories)||0, protein: parseFloat(macros.protein)||0, carbs: parseFloat(macros.carbs)||0, fat: parseFloat(macros.fat)||0, fiber: parseFloat(macros.fiber)||0, meal_type: mealType });
    reset(); onClose();
  };

  const handleSaveMany = async () => {
    const selected = (aiItems||[]).filter((i) => !i.excluded);
    if (!selected.length) return;
    await onSave(selected.map((f) => ({ food_name: f.food_name, calories: f.calories||0, protein: f.protein||0, carbs: f.carbs||0, fat: f.fat||0, fiber: f.fiber||0, meal_type: mealType })));
    reset(); onClose();
  };

  const reset = () => {
    setText(''); setResults([]); setAiItems(null);
    setMacros({ calories: '', protein: '', carbs: '', fat: '', fiber: '' });
    setMealType(getDefaultMealType()); setBase(null); setServingGrams(100); pickedRef.current = false;
  };

  const selectedItems = (aiItems||[]).filter((i) => !i.excluded);
  const aiTotals = selectedItems.reduce((acc, f) => ({ calories: acc.calories+(f.calories||0), protein: acc.protein+(f.protein||0), carbs: acc.carbs+(f.carbs||0), fat: acc.fat+(f.fat||0) }), { calories:0, protein:0, carbs:0, fat:0 });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => { reset(); onClose(); }}>
      <View style={styles.modalBg}>
        <ScrollView style={styles.modal} contentContainerStyle={{ paddingBottom: 36 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Log Food</Text>
          {aiItems ? (
            <>
              <Text style={styles.aiMealHeader}>{selectedItems.length} food{selectedItems.length!==1?'s':''} identified — tap ✕ to remove any</Text>
              {aiItems.map((item, idx) => (
                <View key={idx} style={[styles.aiItemCard, item.excluded && styles.aiItemCardExcluded]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.aiItemName, item.excluded && styles.aiItemNameDim]} numberOfLines={2}>{item.food_name}</Text>
                    <Text style={styles.aiItemMacros}>{Math.round(item.calories)} kcal · P {item.protein}g · C {item.carbs}g · F {item.fat}g</Text>
                  </View>
                  <TouchableOpacity onPress={() => setAiItems((prev) => prev.map((it, i) => i===idx?{...it,excluded:!it.excluded}:it))} style={styles.aiItemToggle}>
                    <Text style={[styles.aiItemToggleText, item.excluded && styles.aiItemAddText]}>{item.excluded?'Add':'✕'}</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {selectedItems.length > 1 && (
                <View style={styles.aiTotalRow}>
                  <Text style={styles.aiTotalLabel}>Total</Text>
                  <Text style={styles.aiTotalMacros}>{Math.round(aiTotals.calories)} kcal · P {Math.round(aiTotals.protein)}g · C {Math.round(aiTotals.carbs)}g · F {Math.round(aiTotals.fat)}g</Text>
                </View>
              )}
              <View style={styles.mealRow}>
                {MEAL_TYPES.map((type) => (<TouchableOpacity key={type} style={[styles.mealBtn, mealType===type && styles.mealBtnActive]} onPress={() => setMealType(type)}><Text style={[styles.mealBtnText, mealType===type && styles.mealBtnTextActive]}>{type[0].toUpperCase()+type.slice(1)}</Text></TouchableOpacity>))}
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setAiItems(null)}><Text style={styles.cancelText}>Back</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.logBtn, !selectedItems.length && { backgroundColor: SURF }]} onPress={handleSaveMany} disabled={!selectedItems.length}>
                  <Text style={styles.logBtnText}>Log {selectedItems.length} Food{selectedItems.length!==1?'s':''}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.inputRow}>
                <TextInput style={styles.mainInput} placeholder="Search or describe what you ate…" placeholderTextColor="#4A4D5E" value={text} onChangeText={handleTextChange} autoCorrect={false} />
                {searching && <ActivityIndicator size="small" color="#4A4D5E" style={{ marginRight: 6 }} />}
              </View>
              <TouchableOpacity style={[styles.estimateBtn, (!text.trim()||estimating) && styles.estimateBtnDisabled]} onPress={handleEstimate} disabled={!text.trim()||estimating}>
                {estimating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.estimateBtnText}>✦  Estimate with AI</Text>}
              </TouchableOpacity>
              {results.length > 0 && (
                <View style={styles.resultsList}>
                  <Text style={styles.resultsHeader}>SEARCH RESULTS  (per 100g)</Text>
                  {results.slice(0,8).map((item, i) => (
                    <TouchableOpacity key={i} style={styles.resultItem} onPress={() => pickResult(item)}>
                      <Text style={styles.resultName} numberOfLines={1}>{item.food_name}</Text>
                      <Text style={styles.resultMacros}>{item.calories} kcal · P {item.protein}g · C {item.carbs}g · F {item.fat}g</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {base && (
                <>
                  <Text style={styles.servingLabel}>Serving size</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.ozScroll} contentContainerStyle={{ paddingRight: 16 }}>
                    {SERVING_PRESETS.map((p) => (<TouchableOpacity key={p.label} style={[styles.ozChip, servingGrams===p.grams && styles.ozChipActive]} onPress={() => setServingGrams(p.grams)}><Text style={[styles.ozChipText, servingGrams===p.grams && styles.ozChipTextActive]}>{p.label}</Text></TouchableOpacity>))}
                  </ScrollView>
                </>
              )}
              <Text style={styles.macroNote}>{base?'Auto-scaled · tap to adjust':estimating?'Estimating…':'Enter values manually or use AI / search above'}</Text>
              <View style={styles.macroGrid}>
                {MACRO_DEFS.map(({ key, label, unit, color }) => (
                  <View key={key} style={styles.macroCell}>
                    <View style={[styles.macroCellBar, { backgroundColor: color }]} />
                    <TextInput style={styles.macroCellInput} value={macros[key]} onChangeText={setMacro(key)} keyboardType="decimal-pad" selectTextOnFocus placeholder="0" placeholderTextColor="#3A3D4A" />
                    <Text style={styles.macroCellUnit}>{unit}</Text>
                    <Text style={styles.macroCellLbl}>{label}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.mealRow}>
                {MEAL_TYPES.map((type) => (<TouchableOpacity key={type} style={[styles.mealBtn, mealType===type && styles.mealBtnActive]} onPress={() => setMealType(type)}><Text style={[styles.mealBtnText, mealType===type && styles.mealBtnTextActive]}>{type[0].toUpperCase()+type.slice(1)}</Text></TouchableOpacity>))}
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { reset(); onClose(); }}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={styles.logBtn} onPress={handleSave}><Text style={styles.logBtnText}>Add to Log</Text></TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── EditFoodModal ─────────────────────────────────────────────────────────────

function EditFoodModal({ visible, item, onClose, onSave }) {
  const [name,     setName]     = useState('');
  const [mealType, setMealType] = useState('snack');
  const [macros, setMacros]     = useState({ calories: '', protein: '', carbs: '', fat: '', fiber: '' });
  const setMacro = (key) => (val) => setMacros((m) => ({ ...m, [key]: val }));

  useEffect(() => {
    if (item) {
      setName(item.food_name || '');
      setMealType(item.meal_type || 'snack');
      setMacros({ calories: String(item.calories||0), protein: String(item.protein||0), carbs: String(item.carbs||0), fat: String(item.fat||0), fiber: String(item.fiber||0) });
    }
  }, [item]);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    await onSave(item.id, { food_name: name.trim(), calories: parseFloat(macros.calories)||0, protein: parseFloat(macros.protein)||0, carbs: parseFloat(macros.carbs)||0, fat: parseFloat(macros.fat)||0, fiber: parseFloat(macros.fiber)||0, meal_type: mealType });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <ScrollView style={styles.modal} contentContainerStyle={{ paddingBottom: 36 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Edit Entry</Text>
          <View style={styles.inputRow}>
            <TextInput style={styles.mainInput} placeholder="Food name" placeholderTextColor="#4A4D5E" value={name} onChangeText={setName} />
          </View>
          <View style={styles.macroGrid}>
            {MACRO_DEFS.map(({ key, label, unit, color }) => (
              <View key={key} style={styles.macroCell}>
                <View style={[styles.macroCellBar, { backgroundColor: color }]} />
                <TextInput style={styles.macroCellInput} value={macros[key]} onChangeText={setMacro(key)} keyboardType="decimal-pad" selectTextOnFocus placeholder="0" placeholderTextColor="#3A3D4A" />
                <Text style={styles.macroCellUnit}>{unit}</Text>
                <Text style={styles.macroCellLbl}>{label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.mealRow}>
            {MEAL_TYPES.map((type) => (<TouchableOpacity key={type} style={[styles.mealBtn, mealType===type && styles.mealBtnActive]} onPress={() => setMealType(type)}><Text style={[styles.mealBtnText, mealType===type && styles.mealBtnTextActive]}>{type[0].toUpperCase()+type.slice(1)}</Text></TouchableOpacity>))}
          </View>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.logBtn} onPress={handleSave}><Text style={styles.logBtnText}>Save Changes</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── ActivityModal ─────────────────────────────────────────────────────────────

function ActivityModal({ visible, onClose, onSave }) {
  const [name, setName]         = useState('');
  const [calories, setCalories] = useState('');
  const [duration, setDuration] = useState('');

  const reset = () => { setName(''); setCalories(''); setDuration(''); };

  const handleSave = async () => {
    if (!name.trim() || !calories) { Alert.alert('Required', 'Enter an activity name and calories burned.'); return; }
    await onSave({ name: name.trim(), calories_burned: parseFloat(calories)||0, duration_mins: parseFloat(duration)||null });
    reset(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => { reset(); onClose(); }}>
      <View style={styles.modalBg}>
        <View style={[styles.modal, { paddingBottom: 36 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Log Activity</Text>
          <View style={[styles.inputRow, { marginBottom: 10 }]}>
            <TextInput style={styles.mainInput} placeholder="Activity (e.g. Run, Gym, Walk)" placeholderTextColor="#4A4D5E" value={name} onChangeText={setName} />
          </View>
          <View style={styles.macroGrid}>
            <View style={[styles.macroCell, { width: '45%' }]}>
              <View style={[styles.macroCellBar, { backgroundColor: '#4CAF7F' }]} />
              <TextInput style={styles.macroCellInput} value={calories} onChangeText={setCalories} keyboardType="decimal-pad" selectTextOnFocus placeholder="0" placeholderTextColor="#3A3D4A" />
              <Text style={styles.macroCellUnit}>kcal</Text>
              <Text style={styles.macroCellLbl}>Burned</Text>
            </View>
            <View style={[styles.macroCell, { width: '45%' }]}>
              <View style={[styles.macroCellBar, { backgroundColor: '#8888A0' }]} />
              <TextInput style={styles.macroCellInput} value={duration} onChangeText={setDuration} keyboardType="decimal-pad" selectTextOnFocus placeholder="0" placeholderTextColor="#3A3D4A" />
              <Text style={styles.macroCellUnit}>min</Text>
              <Text style={styles.macroCellLbl}>Duration</Text>
            </View>
          </View>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { reset(); onClose(); }}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.logBtn} onPress={handleSave}><Text style={styles.logBtnText}>Log Activity</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function LogScreen() {
  const [logs,          setLogs]          = useState([]);
  const [activity,      setActivity]      = useState([]);
  const [goals,         setGoals]         = useState({ calories: 2000, protein: 150, carbs: 250, fat: 65, fiber: 30, include_activity: true });
  const [addVisible,    setAddVisible]    = useState(false);
  const [actVisible,    setActVisible]    = useState(false);
  const [editItem,      setEditItem]      = useState(null);
  const [view,          setView]          = useState('meals');

  const load = useCallback(async () => {
    try {
      const [l, g, a] = await Promise.all([getTodayLogs(), getGoals(), getTodayActivity()]);
      setLogs(l || []);
      if (g) setGoals(g);
      setActivity(a || []);
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totals = logs.reduce(
    (acc, item) => ({ calories: acc.calories+(item.calories||0), protein: acc.protein+(item.protein||0), carbs: acc.carbs+(item.carbs||0), fat: acc.fat+(item.fat||0), fiber: acc.fiber+(item.fiber||0) }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );

  const activityBurned = activity.reduce((s, a) => s + (a.calories_burned||0), 0);
  const includeActivity = goals.include_activity !== false && goals.include_activity !== 0;
  const effectiveBudget = goals.calories + (includeActivity ? activityBurned : 0);
  const remaining = Math.max(0, effectiveBudget - Math.round(totals.calories));
  const calPct    = Math.min((totals.calories / (effectiveBudget || 1)) * 100, 100);
  const over      = totals.calories > effectiveBudget;

  const handleDelete = async (id) => {
    if (Platform.OS === 'web') { await deleteLog(id); setLogs((await getTodayLogs())||[]); return; }
    Alert.alert('Remove entry?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await deleteLog(id); setLogs((await getTodayLogs())||[]); } },
    ]);
  };

  const handleEdit = (item) => setEditItem(item);

  const handleUpdate = async (id, data) => {
    try { await updateLog(id, data); setLogs((await getTodayLogs())||[]); }
    catch { Alert.alert('Error', 'Could not update entry.'); }
  };

  const handleAddFood = async (foodOrFoods) => {
    try {
      const items = Array.isArray(foodOrFoods) ? foodOrFoods : [foodOrFoods];
      await Promise.all(items.map((f) => addLog(f)));
      setLogs((await getTodayLogs())||[]);
    } catch { Alert.alert('Error', 'Could not save entry.'); }
  };

  const handleLogActivity = async ({ name, calories_burned, duration_mins }) => {
    try {
      await logActivity({ name, calories_burned, duration_mins });
      setActivity((await getTodayActivity())||[]);
    } catch { Alert.alert('Error', 'Could not log activity.'); }
  };

  const handleDeleteActivity = async (id) => {
    await deleteActivity(id);
    setActivity((await getTodayActivity())||[]);
  };

  const grouped = MEAL_TYPES.reduce((acc, type) => { acc[type] = logs.filter((l) => l.meal_type===type); return acc; }, {});

  function FoodRow({ item }) {
    return (
      <View style={styles.logItem}>
        <View style={styles.logInfo}>
          <Text style={styles.logName}>{item.food_name}</Text>
          <Text style={styles.logMacros}>{Math.round(item.calories)} kcal · P {item.protein}g · C {item.carbs}g · F {item.fat}g · Fiber {item.fiber??0}g</Text>
        </View>
        <TouchableOpacity onPress={() => handleEdit(item)} style={[styles.actionBtn, { marginRight: 6 }]}>
          <Text style={styles.editBtnText}>✎</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardDismissMode="on-drag">

        <View style={styles.heroCard}>
          <Text style={styles.heroDate}>Today</Text>
          <View style={styles.heroCenter}>
            <View style={[styles.heroRing, { borderColor: over ? 'rgba(224,85,85,0.3)' : 'rgba(182,168,162,0.18)' }]}>
              <Text style={[styles.heroNumber, over && { color: '#E05555' }]}>{remaining}</Text>
              <Text style={styles.heroUnit}>{over ? 'kcal over' : 'kcal left'}</Text>
            </View>
          </View>
          <View style={styles.calTrack}>
            <View style={[styles.calFill, { width: `${calPct}%`, backgroundColor: over ? '#E05555' : G }]} />
          </View>
          <View style={styles.calLabels}>
            <Text style={styles.calConsumed}>{Math.round(totals.calories)} eaten</Text>
            {includeActivity && activityBurned > 0
              ? <Text style={styles.calGoalTxt}>Goal {goals.calories} + {Math.round(activityBurned)} burned</Text>
              : <Text style={styles.calGoalTxt}>Goal {goals.calories}</Text>
            }
          </View>
          <View style={styles.macroPillRow}>
            <MacroPill label="Protein" current={totals.protein} goal={goals.protein} color="#4B9CD3" />
            <MacroPill label="Carbs"   current={totals.carbs}   goal={goals.carbs}   color="#D4A017" />
            <MacroPill label="Fat"     current={totals.fat}     goal={goals.fat}     color="#9B7FD4" />
            <MacroPill label="Fiber"   current={totals.fiber}   goal={goals.fiber??30} color="#3A8FC4" />
          </View>
        </View>

        {/* Activity strip */}
        {activity.length > 0 && (
          <View style={styles.activitySection}>
            <Text style={styles.activityTitle}>ACTIVITY  +{Math.round(activityBurned)} kcal burned</Text>
            {activity.map((a) => (
              <View key={a.id} style={styles.activityRow}>
                <Text style={styles.activityName}>{a.name}</Text>
                <Text style={styles.activityCal}>{a.calories_burned} kcal</Text>
                {a.duration_mins ? <Text style={styles.activityDur}>{a.duration_mins}min</Text> : null}
                <TouchableOpacity onPress={() => handleDeleteActivity(a.id)} style={styles.actionBtn}>
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {logs.length === 0 ? (
          <Text style={styles.emptyText}>No meals logged yet.{'\n'}Tap + to add food.</Text>
        ) : (
          <>
            <View style={styles.viewToggle}>
              {['meals','timeline'].map((v) => (
                <TouchableOpacity key={v} style={[styles.viewToggleBtn, view===v && styles.viewToggleBtnActive]} onPress={() => setView(v)}>
                  <Text style={[styles.viewToggleText, view===v && styles.viewToggleTextActive]}>{v==='meals'?'By Meal':'Timeline'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {view === 'meals'
              ? MEAL_TYPES.map((type) => {
                  const items = grouped[type];
                  if (!items.length) return null;
                  return (
                    <View key={type} style={styles.section}>
                      <Text style={styles.sectionTitle}>{type[0].toUpperCase()+type.slice(1)}</Text>
                      {items.map((item) => <FoodRow key={item.id} item={item} />)}
                    </View>
                  );
                })
              : [...logs].sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp)).map((item,i,arr) => (
                  <View key={item.id} style={styles.timelineRow}>
                    <View style={styles.timelineLeft}>
                      <Text style={styles.timelineTime}>{formatTime(item.timestamp)}</Text>
                      {i < arr.length-1 && <View style={styles.timelineLine} />}
                    </View>
                    <View style={{ flex: 1, marginBottom: 10 }}>
                      <FoodRow item={item} />
                    </View>
                  </View>
                ))
            }
          </>
        )}
      </ScrollView>

      {/* FABs */}
      <TouchableOpacity style={[styles.fab, { right: 88, backgroundColor: SURF }]} onPress={() => setActVisible(true)}>
        <Text style={[styles.fabText, { color: '#4CAF7F', fontSize: 22 }]}>⚡</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.fab} onPress={() => setAddVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <AddFoodModal  visible={addVisible}     onClose={() => setAddVisible(false)}  onSave={handleAddFood} />
      <ActivityModal visible={actVisible}     onClose={() => setActVisible(false)}  onSave={handleLogActivity} />
      <EditFoodModal visible={!!editItem}     item={editItem}                       onClose={() => setEditItem(null)} onSave={handleUpdate} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content:   { padding: 16, paddingBottom: 110 },

  heroCard:   { backgroundColor: CARD, borderRadius: 22, padding: 20, marginBottom: 20 },
  heroDate:   { color: '#4A4D5E', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  heroCenter: { alignItems: 'center', marginVertical: 18 },
  heroRing:   { width: 160, height: 160, borderRadius: 80, borderWidth: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  heroNumber: { color: TEXT, fontSize: 42, fontWeight: '800', lineHeight: 46 },
  heroUnit:   { color: '#4A4D5E', fontSize: 12, marginTop: 2 },
  calTrack:   { height: 4, backgroundColor: SURF, borderRadius: 2, overflow: 'hidden', marginBottom: 6 },
  calFill:    { height: '100%', borderRadius: 2 },
  calLabels:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  calConsumed:{ color: '#8892A4', fontSize: 12 },
  calGoalTxt: { color: '#4A4D5E', fontSize: 12 },
  macroPillRow:   { flexDirection: 'row', gap: 8 },
  macroPill:      { flex: 1, backgroundColor: BG, borderRadius: 12, padding: 10, alignItems: 'center' },
  macroPillVal:   { fontSize: 15, fontWeight: '800' },
  macroPillUnit:  { fontSize: 10, fontWeight: '600' },
  macroPillTrack: { width: '100%', height: 3, backgroundColor: SURF, borderRadius: 2, overflow: 'hidden', marginTop: 6, marginBottom: 4 },
  macroPillFill:  { height: '100%', borderRadius: 2 },
  macroPillLabel: { color: '#4A4D5E', fontSize: 10, fontWeight: '600' },

  activitySection: { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 16 },
  activityTitle:   { color: '#4CAF7F', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  activityRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  activityName:    { flex: 1, color: TEXT, fontSize: 14, fontWeight: '600' },
  activityCal:     { color: '#4CAF7F', fontSize: 13, fontWeight: '700', marginRight: 8 },
  activityDur:     { color: '#5A5248', fontSize: 12, marginRight: 8 },

  section:      { marginBottom: 16 },
  sectionTitle: { color: G, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 },
  logItem:      { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 8 },
  logInfo:      { flex: 1 },
  logName:      { color: TEXT, fontSize: 15, fontWeight: '600' },
  logMacros:    { color: '#4A4D5E', fontSize: 12, marginTop: 3 },
  actionBtn:    { width: 28, height: 28, borderRadius: 14, backgroundColor: SURF, alignItems: 'center', justifyContent: 'center' },
  editBtnText:  { color: TEXT, fontSize: 14, fontWeight: '700' },
  deleteBtnText:{ color: '#E05555', fontSize: 12, fontWeight: '700' },
  emptyText:    { color: '#2E3040', textAlign: 'center', marginTop: 48, fontSize: 15, lineHeight: 24 },

  viewToggle:           { flexDirection: 'row', backgroundColor: CARD, borderRadius: 12, padding: 4, marginBottom: 16, gap: 4 },
  viewToggleBtn:        { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  viewToggleBtnActive:  { backgroundColor: BG },
  viewToggleText:       { color: '#2E3040', fontSize: 13, fontWeight: '600' },
  viewToggleTextActive: { color: '#fff' },
  timelineRow:  { flexDirection: 'row', marginBottom: 0 },
  timelineLeft: { width: 52, alignItems: 'center', paddingTop: 4 },
  timelineTime: { color: G, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  timelineLine: { width: 2, flex: 1, minHeight: 20, backgroundColor: SURF, borderRadius: 1, marginBottom: 4 },

  fab:     { position: 'absolute', bottom: 28, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: G, alignItems: 'center', justifyContent: 'center', shadowColor: G, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  fabText: { color: '#fff', fontSize: 32, lineHeight: 36, fontWeight: '300' },

  modalBg:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'flex-end' },
  modal:      { backgroundColor: CARD, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '93%' },
  sheetHandle:{ width: 36, height: 4, backgroundColor: SURF, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { color: TEXT, fontSize: 20, fontWeight: '700', marginBottom: 14 },
  inputRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: BG, borderRadius: 12, paddingHorizontal: 14, marginBottom: 10 },
  mainInput:  { flex: 1, color: TEXT, fontSize: 16, paddingVertical: 13 },
  estimateBtn:         { backgroundColor: G, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 14 },
  estimateBtnDisabled: { backgroundColor: SURF },
  estimateBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
  resultsList:   { backgroundColor: BG, borderRadius: 12, marginBottom: 12 },
  resultsHeader: { color: G, fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  resultItem:    { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: CARD },
  resultName:    { color: TEXT, fontSize: 14, fontWeight: '600' },
  resultMacros:  { color: '#4A4D5E', fontSize: 12, marginTop: 2 },
  servingLabel:  { color: G, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  ozScroll:      { marginBottom: 10 },
  ozChip:            { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: BG, marginRight: 8 },
  ozChipActive:      { backgroundColor: G },
  ozChipText:        { color: '#3A3D4A', fontSize: 13, fontWeight: '600' },
  ozChipTextActive:  { color: '#fff' },
  macroNote: { color: '#3A3D4A', fontSize: 11, marginBottom: 10 },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  macroCell: { width: '18%', flexGrow: 1, backgroundColor: BG, borderRadius: 12, padding: 10, alignItems: 'center' },
  macroCellBar:   { width: '100%', height: 3, borderRadius: 2, marginBottom: 6 },
  macroCellInput: { color: TEXT, fontSize: 18, fontWeight: '700', textAlign: 'center', padding: 0, width: '100%' },
  macroCellUnit:  { color: '#3A3D4A', fontSize: 10, marginTop: 1 },
  macroCellLbl:   { color: '#4A4D5E', fontSize: 10, marginTop: 3 },
  mealRow:           { flexDirection: 'row', gap: 8, marginBottom: 16 },
  mealBtn:           { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: SURF, alignItems: 'center' },
  mealBtnActive:     { backgroundColor: G },
  mealBtnText:       { color: '#4A4D5E', fontSize: 12 },
  mealBtnTextActive: { color: '#fff', fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn:    { flex: 1, paddingVertical: 15, borderRadius: 14, backgroundColor: SURF, alignItems: 'center' },
  cancelText:   { color: '#8892A4', fontWeight: '600' },
  logBtn:       { flex: 2, paddingVertical: 15, borderRadius: 14, backgroundColor: G, alignItems: 'center' },
  logBtnText:   { color: '#fff', fontWeight: '700', fontSize: 16 },
  aiMealHeader:       { color: '#4A4D5E', fontSize: 12, marginBottom: 12 },
  aiItemCard:         { flexDirection: 'row', alignItems: 'center', backgroundColor: BG, borderRadius: 14, padding: 14, marginBottom: 8 },
  aiItemCardExcluded: { opacity: 0.35 },
  aiItemName:         { color: TEXT, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  aiItemNameDim:      { color: '#4A4D5E' },
  aiItemMacros:       { color: '#4A4D5E', fontSize: 12 },
  aiItemToggle:       { marginLeft: 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: SURF },
  aiItemToggleText:   { color: '#E05555', fontSize: 13, fontWeight: '700' },
  aiItemAddText:      { color: G },
  aiTotalRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: SURF, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, marginTop: 4 },
  aiTotalLabel:       { color: TEXT, fontSize: 13, fontWeight: '700' },
  aiTotalMacros:      { color: '#8892A4', fontSize: 12 },
});
