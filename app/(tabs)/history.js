import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getLogsByDate, getGoals, getAllFoodLogs, getWeightLogs, importFromCSV } from '../../services/db';

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
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
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
                { label: 'Protein', value: totals.protein, goal: goals.protein, color: '#5AC8FA' },
                { label: 'Carbs',   value: totals.carbs,   goal: goals.carbs,   color: '#FFD60A' },
                { label: 'Fat',     value: totals.fat,     goal: goals.fat,     color: '#BF5AF2' },
                { label: 'Fiber',   value: totals.fiber,   goal: goals.fiber ?? 30, color: '#32ADE6' },
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
                  {Math.round(item.calories)} kcal · P {item.protein}g · C {item.carbs}g · F {item.fat}g · Fiber {item.fiber ?? 0}g
                </Text>
              </View>
            ))}
          </View>
        );
      })}

      {/* Import / Export */}
      <TouchableOpacity style={styles.exportBtn} onPress={importCSV}>
        <Text style={styles.exportBtnText}>Import CSV</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.exportBtn, { marginTop: 8 }]} onPress={exportCSV}>
        <Text style={styles.exportBtnText}>Export All Data as CSV</Text>
      </TouchableOpacity>
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

  exportBtn: {
    marginTop: 8, paddingVertical: 14, borderRadius: 14,
    backgroundColor: CARD, borderWidth: 1, borderColor: 'rgba(71,25,20,0.5)',
    alignItems: 'center',
  },
  exportBtnText: { color: TEXT, fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
});
