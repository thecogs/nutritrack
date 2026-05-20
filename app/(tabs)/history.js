import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Platform, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getLogsByDate, getGoals, getAllFoodLogs, getWeightLogs, importFromCSV, getTemplates, createTemplate, deleteTemplate, getTemplateItems, addTemplateItem, applyTemplate } from '../../services/db';
import { searchFood, smartDescribeFoods, strictLookupFoods } from '../../services/api';

const G    = '#471914';
const BG   = '#070F05';
const CARD = '#0D1B0B';
const SURF = '#172519';
const TEXT = '#B6A8A2';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

function toDateStr(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString().split('T')[0];
}

function formatHeading(date) {
  const today = toDateStr(new Date());
  const d     = toDateStr(date);
  if (d === today) return 'Today';
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (d === toDateStr(yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function csvField(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

async function importCSV() {
  try {
    if (Platform.OS !== 'web') {
      Alert.alert('Import', 'CSV import is available on web only.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const result = await importFromCSV(text);
        Alert.alert('Import complete', `Imported ${result.food} food entries and ${result.weight} weight entries.`);
      } catch (err) {
        Alert.alert('Import failed', err.message || 'Could not parse CSV.');
      }
    };
    input.click();
  } catch (err) {
    Alert.alert('Import failed', err.message || 'Something went wrong.');
  }
}

async function exportCSV() {
  try {
    const [foodLogs, weightLogs] = await Promise.all([
      getAllFoodLogs(),
      getWeightLogs(3650),
    ]);

    const today = new Date().toISOString().split('T')[0];
    let csv = 'FOOD LOGS\n';
    csv += 'Date,Meal,Food,Calories,Protein (g),Carbs (g),Fat (g),Fiber (g)\n';
    foodLogs.forEach((l) => {
      const date = l.date || (l.timestamp ? l.timestamp.split('T')[0] : '');
      csv += [date, l.meal_type, csvField(l.food_name), l.calories, l.protein, l.carbs, l.fat, l.fiber ?? 0].join(',') + '\n';
    });

    csv += '\nWEIGHT LOGS\n';
    csv += 'Date,Weight (lbs)\n';
    weightLogs.forEach((w) => { csv += `${w.date},${w.weight}\n`; });

    const filename = `nutritrack-${today}.csv`;

    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const file = new File([blob], filename, { type: 'text/csv' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'NutriTrack Export' });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      }
    } else {
      // Native: use expo-sharing if available, else alert
      try {
        const Sharing = await import('expo-sharing');
        const FS = await import('expo-file-system');
        const path = FS.documentDirectory + filename;
        await FS.writeAsStringAsync(path, csv, { encoding: FS.EncodingType.UTF8 });
        await Sharing.shareAsync(path, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
      } catch {
        Alert.alert('Export', 'Install expo-sharing to export on device.');
      }
    }
  } catch (err) {
    if (err?.name !== 'AbortError') Alert.alert('Export failed', 'Could not export data.');
  }
}

// ── TemplatesSection ──────────────────────────────────────────────────────────

function TemplatesSection() {
  const [templates,     setTemplates]     = useState([]);
  const [items,         setItems]         = useState({});
  const [expanded,      setExpanded]      = useState(null);
  const [createVisible, setCreateVisible] = useState(false);
  const [applyTarget,   setApplyTarget]   = useState(null);
  const [tmplName,      setTmplName]      = useState('');
  const [schedTime,     setSchedTime]     = useState('');
  const [newItems,      setNewItems]      = useState([]);
  const [searchText,    setSearchText]    = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching,     setSearching]     = useState(false);
  const [aiText,        setAiText]        = useState('');
  const [estimating,    setEstimating]    = useState(false);
  const [mealType,      setMealType]      = useState('breakfast');
  const searchTimer = useRef(null);

  useEffect(() => { loadTemplates(); }, []);

  async function loadTemplates() {
    try { setTemplates(await getTemplates()); } catch {}
  }

  async function loadItems(id) {
    try { const data = await getTemplateItems(id); setItems((p) => ({ ...p, [id]: data })); } catch {}
  }

  function toggleExpand(id) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    loadItems(id);
  }

  function handleSearch(t) {
    setSearchText(t);
    clearTimeout(searchTimer.current);
    if (t.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try { setSearchResults((await searchFood(t.trim())) || []); }
      catch { setSearchResults([]); } finally { setSearching(false); }
    }, 400);
  }

  function pickResult(item) {
    setNewItems((p) => [...p, { food_name: item.food_name, calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat, fiber: item.fiber||0, sugar: item.sugar||0, sat_fat: item.sat_fat||0, meal_type: 'snack' }]);
    setSearchText(''); setSearchResults([]);
  }

  async function handleAiEstimate() {
    if (!aiText.trim() || estimating) return;
    setEstimating(true);
    try {
      const foods = await smartDescribeFoods(aiText.trim());
      if (!foods.length) { Alert.alert('No foods found', 'Try describing your meal differently.'); return; }
      setNewItems((prev) => [
        ...prev,
        ...foods.map((f) => ({ food_name: f.food_name, calories: f.calories||0, protein: f.protein||0, carbs: f.carbs||0, fat: f.fat||0, fiber: f.fiber||0, sugar: f.sugar||0, sat_fat: f.sat_fat||0, meal_type: 'snack' })),
      ]);
      setAiText('');
    } catch { Alert.alert('AI estimate failed', 'Try again or add foods manually via search.'); }
    finally { setEstimating(false); }
  }

  async function handleCreate() {
    if (!tmplName.trim()) { Alert.alert('Name required'); return; }
    if (newItems.length === 0) { Alert.alert('Add at least one food'); return; }
    try {
      const id = await createTemplate(tmplName.trim(), schedTime.trim() || null);
      for (const item of newItems) await addTemplateItem(id, item);
      await loadTemplates();
      setCreateVisible(false);
      setTmplName(''); setSchedTime(''); setNewItems([]); setSearchText(''); setSearchResults([]); setAiText('');
    } catch { Alert.alert('Error', 'Could not save template.'); }
  }

  async function handleDelete(id) {
    const doDelete = async () => {
      await deleteTemplate(id);
      setTemplates((t) => t.filter((x) => x.id !== id));
      setItems((p) => { const n = { ...p }; delete n[id]; return n; });
      if (expanded === id) setExpanded(null);
    };
    if (Platform.OS === 'web') { await doDelete(); return; }
    Alert.alert('Delete template?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  }

  async function handleApply() {
    if (!applyTarget) return;
    try {
      const count = await applyTemplate(applyTarget.id, mealType);
      Alert.alert('Logged!', `${count} item${count!==1?'s':''} from "${applyTarget.name}" logged as ${mealType}.`);
      setApplyTarget(null);
    } catch { Alert.alert('Error', 'Could not log template.'); }
  }

  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

  return (
    <View>
      <View style={ts.sectionHeader}>
        <Text style={ts.sectionLabel}>MEAL TEMPLATES</Text>
        <TouchableOpacity style={ts.newBtn} onPress={() => setCreateVisible(true)}>
          <Text style={ts.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {templates.length === 0 && (
        <Text style={ts.empty}>No templates yet. Save a meal combo to log it in one tap.</Text>
      )}

      {templates.map((tmpl) => {
        const tmplItems = items[tmpl.id] || [];
        const isExpanded = expanded === tmpl.id;
        const totalCal = tmplItems.reduce((s, i) => s + (i.calories || 0), 0);
        return (
          <View key={tmpl.id} style={ts.card}>
            <TouchableOpacity style={ts.cardTop} onPress={() => toggleExpand(tmpl.id)} activeOpacity={0.75}>
              <View style={{ flex: 1 }}>
                <Text style={ts.cardName}>{tmpl.name}</Text>
                <Text style={ts.cardMeta}>
                  {tmpl.schedule_time ? `${fmtTime(tmpl.schedule_time)}  ·  ` : ''}
                  {isExpanded && tmplItems.length > 0
                    ? `${tmplItems.length} item${tmplItems.length!==1?'s':''} · ${Math.round(totalCal)} kcal`
                    : 'tap to expand'}
                </Text>
              </View>
              <TouchableOpacity style={ts.logBtn} onPress={() => { setApplyTarget(tmpl); setMealType('breakfast'); }}>
                <Text style={ts.logBtnText}>Log</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ts.delBtn} onPress={() => handleDelete(tmpl.id)}>
                <Text style={ts.delBtnText}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
            {isExpanded && (
              <View style={ts.itemList}>
                {tmplItems.map((item) => (
                  <View key={item.id} style={ts.itemRow}>
                    <Text style={ts.itemName} numberOfLines={1}>{item.food_name}</Text>
                    <Text style={ts.itemCal}>{Math.round(item.calories)} kcal</Text>
                  </View>
                ))}
                {tmplItems.length === 0 && <Text style={ts.empty}>No items loaded.</Text>}
              </View>
            )}
          </View>
        );
      })}

      {/* ── Create Template Modal ── */}
      <Modal visible={createVisible} animationType="slide" transparent onRequestClose={() => setCreateVisible(false)}>
        <View style={ts.modalBg}>
          <ScrollView style={ts.modal} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <View style={ts.handle} />
            <Text style={ts.modalTitle}>New Template</Text>

            <TextInput style={ts.input} value={tmplName} onChangeText={setTmplName} placeholder="Name (e.g. Gym Morning)" placeholderTextColor="#4A4D5E" />
            <View style={ts.timeRow}>
              <Text style={ts.timeLabel}>Schedule time (optional)</Text>
              <TextInput style={ts.timeInput} value={schedTime} onChangeText={setSchedTime} placeholder="07:30" placeholderTextColor="#4A4D5E" keyboardType="numbers-and-punctuation" />
            </View>
            <Text style={ts.subLabel}>Add Foods</Text>

            {/* AI Estimate */}
            <View style={ts.aiRow}>
              <TextInput
                style={ts.aiInput}
                value={aiText}
                onChangeText={setAiText}
                placeholder="e.g. banana, yogurt and coffee…"
                placeholderTextColor="#4A4D5E"
                autoCorrect={false}
              />
              <View style={{flexDirection: 'row', gap: 6}}>
                <TouchableOpacity
                  style={[ts.aiBtn, (!aiText.trim() || estimating) && ts.aiBtnDisabled]}
                  onPress={handleAiEstimate}
                  disabled={!aiText.trim() || estimating}
                >
                  {estimating
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={ts.aiBtnText}>✦ AI</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ts.aiBtn, {backgroundColor: '#4CAF7F'}, (!aiText.trim() || estimating) && ts.aiBtnDisabled]}
                  onPress={async () => {
                    if (!aiText.trim() || estimating) return;
                    setEstimating(true);
                    try {
                      const foods = await strictLookupFoods(aiText.trim());
                      if (!foods.length) { Alert.alert('Not found', 'Try searching manually.'); return; }
                      setNewItems((prev) => [
                        ...prev,
                        ...foods.map((f) => ({ food_name: f.food_name, calories: f.calories||0, protein: f.protein||0, carbs: f.carbs||0, fat: f.fat||0, fiber: f.fiber||0, sugar: f.sugar||0, sat_fat: f.sat_fat||0, meal_type: 'snack' })),
                      ]);
                      setAiText('');
                    } catch { Alert.alert('Lookup failed', 'Try searching manually.'); }
                    finally { setEstimating(false); }
                  }}
                  disabled={!aiText.trim() || estimating}
                >
                  {estimating
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={ts.aiBtnText}>DB</Text>}
                </TouchableOpacity>
              </View>
            </View>

            {/* Divider */}
            <View style={ts.aiDivider}>
              <View style={ts.aiDividerLine} />
              <Text style={ts.aiDividerText}>or search</Text>
              <View style={ts.aiDividerLine} />
            </View>

            {newItems.map((item, idx) => (
              <View key={idx} style={ts.newItemRow}>
                <Text style={ts.newItemName} numberOfLines={1}>{item.food_name}</Text>
                <Text style={ts.newItemCal}>{Math.round(item.calories)} kcal</Text>
                <TouchableOpacity onPress={() => setNewItems((p) => p.filter((_, i) => i !== idx))}>
                  <Text style={ts.delBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={ts.searchRow}>
              <TextInput style={ts.searchInput} value={searchText} onChangeText={handleSearch} placeholder="Search food to add…" placeholderTextColor="#4A4D5E" autoCorrect={false} />
              {searching && <ActivityIndicator size="small" color="#4A4D5E" style={{ marginLeft: 8 }} />}
            </View>
            {searchResults.slice(0, 6).map((r, i) => (
              <TouchableOpacity key={i} style={ts.searchResult} onPress={() => pickResult(r)}>
                <Text style={ts.searchResultName} numberOfLines={1}>{r.food_name}</Text>
                <Text style={ts.searchResultCal}>{r.calories} kcal · P {r.protein}g · C {r.carbs}g</Text>
              </TouchableOpacity>
            ))}

            <View style={[ts.modalActions, { marginTop: 20 }]}>
              <TouchableOpacity style={ts.cancelBtn} onPress={() => { setCreateVisible(false); setTmplName(''); setSchedTime(''); setNewItems([]); setSearchText(''); setSearchResults([]); }}>
                <Text style={ts.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ts.saveBtn} onPress={handleCreate}>
                <Text style={ts.saveBtnText}>Save Template</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Apply Template Modal ── */}
      <Modal visible={!!applyTarget} animationType="slide" transparent onRequestClose={() => setApplyTarget(null)}>
        <View style={ts.modalBg}>
          <View style={[ts.modal, { paddingBottom: 40 }]}>
            <View style={ts.handle} />
            <Text style={ts.modalTitle}>Log "{applyTarget?.name}"</Text>
            <Text style={ts.timeLabel}>Log as meal type:</Text>
            <View style={ts.mealRow}>
              {MEAL_TYPES.map((t) => (
                <TouchableOpacity key={t} style={[ts.mealBtn, mealType === t && ts.mealBtnActive]} onPress={() => setMealType(t)}>
                  <Text style={[ts.mealBtnText, mealType === t && ts.mealBtnTextActive]}>{t[0].toUpperCase() + t.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={ts.modalActions}>
              <TouchableOpacity style={ts.cancelBtn} onPress={() => setApplyTarget(null)}>
                <Text style={ts.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ts.saveBtn} onPress={handleApply}>
                <Text style={ts.saveBtnText}>Log Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function HistoryScreen() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [logs,         setLogs]         = useState([]);
  const [goals,        setGoals]        = useState({ calories: 2000, protein: 150, carbs: 250, fat: 65, fiber: 30 });

  const loadDay = useCallback(async (date) => {
    try {
      const [logsData, goalsData] = await Promise.all([getLogsByDate(toDateStr(date)), getGoals()]);
      setLogs(logsData || []);
      if (goalsData) setGoals(goalsData);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { loadDay(selectedDate); }, [selectedDate, loadDay]));

  const goDay = (delta) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + delta);
    if (next > new Date()) return;
    setSelectedDate(next);
    loadDay(next);
  };

  const isToday = toDateStr(selectedDate) === toDateStr(new Date());

  const totals = logs.reduce(
    (acc, item) => ({
      calories: acc.calories + (item.calories || 0),
      protein:  acc.protein  + (item.protein  || 0),
      carbs:    acc.carbs    + (item.carbs    || 0),
      fat:      acc.fat      + (item.fat      || 0),
      fiber:    acc.fiber    + (item.fiber    || 0),
      sugar:   acc.sugar   + (item.sugar   || 0),
      sat_fat: acc.sat_fat + (item.sat_fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sat_fat: 0 }
  );

  const grouped = MEAL_TYPES.reduce((acc, type) => {
    acc[type] = logs.filter((l) => l.meal_type === type);
    return acc;
  }, {});

  const calPct = Math.min((totals.calories / (goals.calories || 1)) * 100, 100);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Date nav */}
      <View style={styles.dateNav}>
        <TouchableOpacity style={styles.navBtn} onPress={() => goDay(-1)}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.dateLabel}>{formatHeading(selectedDate)}</Text>
        <TouchableOpacity
          style={[styles.navBtn, isToday && styles.navBtnDisabled]}
          onPress={() => goDay(1)}
          disabled={isToday}
        >
          <Text style={[styles.navArrow, isToday && styles.navArrowDim]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Summary */}
      <View style={styles.summaryCard}>
        {logs.length === 0 ? (
          <Text style={styles.emptyText}>Nothing logged.</Text>
        ) : (
          <>
            <View style={styles.calRow}>
              <Text style={styles.calValue}>{Math.round(totals.calories)}</Text>
              <Text style={styles.calGoal}> / {goals.calories} kcal</Text>
            </View>
            <View style={styles.calTrack}>
              <View style={[styles.calFill, {
                width: `${calPct}%`,
                backgroundColor: totals.calories > goals.calories ? '#FF453A' : G,
              }]} />
            </View>
            <View style={styles.macroRow}>
              {[
                { label: 'Protein',    value: totals.protein,      goal: goals.protein,       color: '#CE5400' },
                { label: 'Carbs',      value: totals.carbs,        goal: goals.carbs,         color: '#08C343' },
                { label: 'Fat (Total)',value: totals.fat,          goal: goals.fat,           color: '#FFD700' },
                { label: 'Fiber',      value: totals.fiber,        goal: goals.fiber  ?? 30,  color: '#215CDA' },
                { label: 'Sugar',      value: totals.sugar,        goal: goals.sugar  ?? 50,  color: '#FF6B9D' },
                { label: 'Sat. Fat',   value: totals.sat_fat || 0, goal: goals.sat_fat ?? 20, color: '#FF6347' },
              ].map(({ label, value, goal, color }) => (
                <View key={label} style={styles.macroPill}>
                  <Text style={[styles.macroPillValue, { color }]}>{Math.round(value)}g</Text>
                  <Text style={styles.macroPillLabel}>{label} / {goal}g</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      {/* Meals */}
      {MEAL_TYPES.map((type) => {
        const items = grouped[type];
        if (!items.length) return null;
        const mealCal = Math.round(items.reduce((s, i) => s + (i.calories || 0), 0));
        return (
          <View key={type} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{type.charAt(0).toUpperCase() + type.slice(1)}</Text>
              <Text style={styles.sectionCal}>{mealCal} kcal</Text>
            </View>
            {items.map((item) => (
              <View key={item.id} style={styles.logItem}>
                <Text style={styles.logName}>{item.food_name}</Text>
                <Text style={styles.logMacros}>
                  {Math.round(item.calories)} kcal · P {item.protein}g · C {item.carbs}g · Fat {item.fat}g · Fiber {item.fiber ?? 0}g · Sugar {item.sugar ?? 0}g · Sat.Fat {item.sat_fat ?? 0}g
                </Text>
              </View>
            ))}
          </View>
        );
      })}

      {/* Templates */}
      <View style={styles.divider} />
      <TemplatesSection />

      {/* Export / Import */}
      <View style={styles.divider} />
      <View style={styles.dataRow}>
        <TouchableOpacity style={styles.exportBtn} onPress={exportCSV}>
          <Text style={styles.exportBtnText}>⬆  Export CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportBtn} onPress={importCSV}>
          <Text style={styles.exportBtnText}>⬇  Import CSV</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content:   { padding: 16, paddingBottom: 40 },

  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  navBtn:         { padding: 8 },
  navBtnDisabled: { opacity: 0.25 },
  navArrow:    { color: TEXT, fontSize: 34, lineHeight: 38 },
  navArrowDim: { color: '#3A3A5A' },
  dateLabel:   { color: TEXT, fontSize: 18, fontWeight: '700' },

  summaryCard: { backgroundColor: CARD, borderRadius: 20, padding: 18, marginBottom: 20 },
  emptyText:   { color: '#3A3A5A', textAlign: 'center', fontSize: 14, paddingVertical: 8 },

  calRow:    { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 },
  calValue:  { color: TEXT, fontSize: 36, fontWeight: '800' },
  calGoal:   { color: '#606080', fontSize: 15 },
  calTrack:  { height: 4, backgroundColor: SURF, borderRadius: 2, overflow: 'hidden', marginBottom: 14 },
  calFill:   { height: '100%', borderRadius: 2 },

  macroRow: { flexDirection: 'row', gap: 8 },
  macroPill: { flex: 1, backgroundColor: BG, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  macroPillValue: { fontSize: 15, fontWeight: '700' },
  macroPillLabel: { color: '#606080', fontSize: 10, marginTop: 3 },

  section:       { marginBottom: 18 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle:  { color: G, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  sectionCal:    { color: '#606080', fontSize: 12 },

  logItem:   { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 8 },
  logName:   { color: TEXT, fontSize: 14, fontWeight: '600' },
  logMacros: { color: '#606080', fontSize: 12, marginTop: 3 },

  divider: { height: 1, backgroundColor: SURF, marginVertical: 24 },
  dataRow:  { flexDirection: 'row', gap: 10, marginBottom: 8 },
  exportBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    backgroundColor: CARD, borderWidth: 1, borderColor: 'rgba(71,25,20,0.5)',
    alignItems: 'center',
  },
  exportBtnText: { color: TEXT, fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
});

// ── Template styles ───────────────────────────────────────────────────────────
const ts = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionLabel:  { color: G, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  newBtn:        { backgroundColor: G, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  newBtnText:    { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty:         { color: '#3A3A5A', fontSize: 13, textAlign: 'center', paddingVertical: 12 },

  card:    { backgroundColor: CARD, borderRadius: 16, marginBottom: 10, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  cardName:{ color: TEXT, fontSize: 15, fontWeight: '700' },
  cardMeta:{ color: '#5A5248', fontSize: 12, marginTop: 2 },
  logBtn:  { backgroundColor: G, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, marginLeft: 10 },
  logBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  delBtn:     { width: 28, height: 28, borderRadius: 14, backgroundColor: SURF, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  delBtnText: { color: '#E05555', fontSize: 12, fontWeight: '700' },

  itemList: { borderTopWidth: 1, borderTopColor: SURF, paddingHorizontal: 14, paddingVertical: 10 },
  itemRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  itemName: { flex: 1, color: TEXT, fontSize: 13 },
  itemCal:  { color: '#5A5248', fontSize: 12 },

  modalBg:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'flex-end' },
  modal:      { backgroundColor: CARD, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '90%' },
  handle:     { width: 36, height: 4, backgroundColor: SURF, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { color: TEXT, fontSize: 20, fontWeight: '700', marginBottom: 16 },

  input:      { backgroundColor: BG, color: TEXT, fontSize: 16, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12 },
  timeRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  timeLabel:  { flex: 1, color: '#5A5248', fontSize: 13 },
  timeInput:  { backgroundColor: BG, color: TEXT, fontSize: 15, fontWeight: '700', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: 80, textAlign: 'center' },
  subLabel:   { color: G, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },

  newItemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: BG, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  newItemName:{ flex: 1, color: TEXT, fontSize: 14 },
  newItemCal: { color: '#5A5248', fontSize: 12, marginRight: 12 },

  aiRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  aiInput:      { flex: 1, backgroundColor: BG, color: TEXT, fontSize: 14, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  aiBtn:        { backgroundColor: G, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, minWidth: 56, alignItems: 'center' },
  aiBtnDisabled:{ backgroundColor: SURF },
  aiBtnText:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  aiDivider:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  aiDividerLine:{ flex: 1, height: 1, backgroundColor: SURF },
  aiDividerText:{ color: '#3A3D4A', fontSize: 11, fontWeight: '600' },
  searchRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: BG, borderRadius: 12, paddingHorizontal: 14, marginBottom: 6 },
  searchInput:      { flex: 1, color: TEXT, fontSize: 15, paddingVertical: 12 },
  searchResult:     { backgroundColor: BG, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: SURF },
  searchResultName: { color: TEXT, fontSize: 14, fontWeight: '600' },
  searchResultCal:  { color: '#5A5248', fontSize: 12, marginTop: 2 },

  mealRow:           { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 16 },
  mealBtn:           { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: SURF, alignItems: 'center' },
  mealBtnActive:     { backgroundColor: G },
  mealBtnText:       { color: '#5A5248', fontSize: 12 },
  mealBtnTextActive: { color: '#fff', fontWeight: '700' },

  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn:    { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: SURF, alignItems: 'center' },
  cancelText:   { color: '#8892A4', fontWeight: '600' },
  saveBtn:      { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: G, alignItems: 'center' },
  saveBtnText:  { color: '#fff', fontWeight: '700', fontSize: 16 },
});
