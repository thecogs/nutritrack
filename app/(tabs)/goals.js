import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, Keyboard, Pressable, Switch,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getGoals, saveGoals, logWeight, getWeightLogs } from '../../services/db';
import { ALLERGENS } from '../../services/allergens';

const G    = '#471914';
const BG   = '#070F05';
const CARD = '#0D1B0B';
const SURF = '#172519';
const TEXT = '#B6A8A2';
const DIM  = '#5A5248';

const GOAL_FIELDS = [
  { key: 'calories', label: 'Daily Calories',  unit: 'kcal', color: '#FF453A', placeholder: '2000' },
  { key: 'protein',  label: 'Protein',          unit: 'g',    color: '#CE5400', placeholder: '150'  },
  { key: 'carbs',    label: 'Carbohydrates',    unit: 'g',    color: '#08C343', placeholder: '250'  },
  { key: 'fat',     label: 'Fat (Total)',      unit: 'g', color: '#FFD700', placeholder: '65' },
  { key: 'fiber',   label: 'Fiber',            unit: 'g', color: '#215CDA', placeholder: '30' },
  { key: 'sugar',   label: 'Sugar (daily max)', unit: 'g', color: '#FF6B9D', placeholder: '50' },
  { key: 'sat_fat', label: 'Sat. Fat (daily max)', unit: 'g', color: '#FF6347', placeholder: '20' },
];

const PRESETS = [
  { name: 'Maintenance', calories: 2000, protein: 150, carbs: 250, fat: 67,  fiber: 30 },
  { name: 'Cut',         calories: 1600, protein: 180, carbs: 140, fat: 55,  fiber: 28 },
  { name: 'Bulk',        calories: 2800, protein: 200, carbs: 320, fat: 90,  fiber: 35 },
  { name: 'Keto',        calories: 1800, protein: 140, carbs: 25,  fat: 140, fiber: 20 },
];

function bmi(weightLbs, heightIn) {
  if (!weightLbs || !heightIn) return null;
  return (weightLbs / (heightIn * heightIn)) * 703;
}

function bmiCategory(b) {
  if (b < 18.5) return { label: 'Underweight', color: '#5AC8FA' };
  if (b < 25)   return { label: 'Normal',       color: '#4CAF7F' };
  if (b < 30)   return { label: 'Overweight',   color: '#FFD60A' };
  return                { label: 'Obese',        color: '#E05555' };
}

export default function GoalsScreen() {
  const [goals, setGoals] = useState({ calories: '2000', protein: '150', carbs: '250', fat: '65', fiber: '30', sugar: '50', sat_fat: '20' });
  const [allergens, setAllergens]           = useState([]);
  const [heightIn, setHeightIn]             = useState('');
  const [includeActivity, setIncludeActivity] = useState(true);
  const [weightInput, setWeightInput]       = useState('');
  const [latestWeight, setLatestWeight]     = useState(null);
  const [savingWeight, setSavingWeight]     = useState(false);
  const [saved, setSaved]                   = useState(false);

  function toLocalDateStr() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  }

  useFocusEffect(
    useCallback(() => {
      async function load() {
        try {
          const [data, wLogs] = await Promise.all([getGoals(), getWeightLogs(7)]);
          if (data) {
            setGoals({
              calories: String(data.calories),
              protein:  String(data.protein),
              carbs:    String(data.carbs),
              fat:      String(data.fat),
              fiber:   String(data.fiber   ?? 30),
              sugar:   String(data.sugar   ?? 50),
              sat_fat: String(data.sat_fat ?? 20),
            });
            setHeightIn(data.height_in ? String(data.height_in) : '');
            setIncludeActivity(data.include_activity !== false && data.include_activity !== 0);
            setAllergens(Array.isArray(data.allergens) ? data.allergens : []);
          }
          const todayEntry = (wLogs||[]).find((l) => l.date === toLocalDateStr());
          if (todayEntry) { setLatestWeight(todayEntry.weight); setWeightInput(String(todayEntry.weight)); }
          else if (wLogs && wLogs.length > 0) { setLatestWeight(wLogs[wLogs.length-1].weight); }
        } catch (e) { console.error(e); }
      }
      load();
    }, [])
  );

  const handleSave = async () => {
    const payload = {
      calories: parseFloat(goals.calories) || 2000,
      protein:  parseFloat(goals.protein)  || 150,
      carbs:    parseFloat(goals.carbs)    || 250,
      fat:      parseFloat(goals.fat)      || 65,
      fiber:    parseFloat(goals.fiber)    || 30,
      sugar:   parseFloat(goals.sugar)   || 50,
      sat_fat: parseFloat(goals.sat_fat) || 20,
      height_in:        parseFloat(heightIn) || 0,
      include_activity: includeActivity,
      allergens,
    };
    try {
      await saveGoals(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { Alert.alert('Error', 'Failed to save goals.'); }
  };

  const handleLogWeight = async () => {
    const w = parseFloat(weightInput);
    if (!w || w <= 0 || w > 1500) { Alert.alert('Invalid weight', 'Enter a weight in lbs (e.g. 175.5)'); return; }
    setSavingWeight(true);
    try {
      await logWeight(w, toLocalDateStr());
      setLatestWeight(w);
      Alert.alert('Logged', `Weight ${w} lbs saved.`);
    } catch { Alert.alert('Error', 'Failed to save weight.'); }
    finally { setSavingWeight(false); }
  };

  const applyPreset = (preset) => setGoals({ calories: String(preset.calories), protein: String(preset.protein), carbs: String(preset.carbs), fat: String(preset.fat), fiber: String(preset.fiber) });

  const h = parseFloat(heightIn) || 0;
  const w = latestWeight || 0;
  const bmiVal = bmi(w, h);
  const bmiCat = bmiVal ? bmiCategory(bmiVal) : null;

  // Height display helpers
  const feet  = h ? Math.floor(h / 12) : 0;
  const inches = h ? Math.round(h % 12) : 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={{ flex: 1 }} onPress={Platform.OS !== 'web' ? Keyboard.dismiss : undefined}>
        <ScrollView style={s.container} contentContainerStyle={s.content} keyboardDismissMode="on-drag">

          {/* ── Presets ── */}
          <Text style={s.sectionLabel}>Presets</Text>
          <View style={s.presetRow}>
            {PRESETS.map((p) => (
              <TouchableOpacity key={p.name} style={s.presetBtn} onPress={() => applyPreset(p)}>
                <Text style={s.presetName}>{p.name}</Text>
                <Text style={s.presetCal}>{p.calories} kcal</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Daily targets ── */}
          <Text style={s.sectionLabel}>Daily Targets</Text>
          {GOAL_FIELDS.map(({ key, label, unit, color, placeholder }) => (
            <View key={key} style={s.fieldCard}>
              <View style={[s.fieldAccent, { backgroundColor: color }]} />
              <View style={s.fieldBody}>
                <Text style={s.fieldLabel}>{label}</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={s.input} value={goals[key]}
                    onChangeText={(v) => setGoals((g) => ({ ...g, [key]: v }))}
                    keyboardType="numeric" placeholder={placeholder} placeholderTextColor="#404060"
                  />
                  <Text style={s.unit}>{unit}</Text>
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity style={[s.saveBtn, saved && s.saveBtnDone]} onPress={handleSave}>
            <Text style={s.saveBtnText}>{saved ? '✓  Saved' : 'Save Goals'}</Text>
          </TouchableOpacity>

          {/* ── Activity ── */}
          <Text style={[s.sectionLabel, { marginTop: 24 }]}>Activity</Text>
          <View style={s.statsCard}>
            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleTitle}>Count activity towards calorie budget</Text>
                <Text style={s.toggleSub}>Activity burns increase your daily calorie allowance</Text>
              </View>
              <Switch
                value={includeActivity}
                onValueChange={setIncludeActivity}
                trackColor={{ false: SURF, true: G }}
                thumbColor={includeActivity ? TEXT : DIM}
              />
            </View>
          </View>

          {/* ── Allergens ── */}
          <Text style={[s.sectionLabel, { marginTop: 24 }]}>Allergens &amp; Dietary Restrictions</Text>
          <View style={s.statsCard}>
            <Text style={s.allergenHint}>Select any allergens you have. You'll be warned if a scanned or logged food may contain them.</Text>
            <View style={s.allergenGrid}>
              {ALLERGENS.map((a) => {
                const active = allergens.includes(a.key);
                return (
                  <TouchableOpacity
                    key={a.key}
                    style={[s.allergenChip, active && s.allergenChipActive]}
                    onPress={() => setAllergens((prev) => active ? prev.filter((k) => k !== a.key) : [...prev, a.key])}
                  >
                    <Text style={[s.allergenChipText, active && s.allergenChipTextActive]}>{a.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Body Stats ── */}
          <Text style={[s.sectionLabel, { marginTop: 24 }]}>Body Stats</Text>
          <View style={s.statsCard}>
            <View style={s.statRow}>
              <Text style={s.statLabel}>Height</Text>
              <View style={s.statInputRow}>
                <TextInput
                  style={s.statInput} value={heightIn} onChangeText={setHeightIn}
                  keyboardType="decimal-pad" placeholder="70" placeholderTextColor="#404060"
                />
                <Text style={s.statUnit}>in</Text>
                {h > 0 && <Text style={s.statHint}>  {feet}′ {inches}″</Text>}
              </View>
            </View>
            <View style={[s.statRow, { marginTop: 14 }]}>
              <Text style={s.statLabel}>Today's Weight</Text>
              <View style={s.statInputRow}>
                <TextInput
                  style={s.statInput} value={weightInput} onChangeText={setWeightInput}
                  keyboardType="decimal-pad" placeholder="175" placeholderTextColor="#404060"
                />
                <Text style={s.statUnit}>lbs</Text>
                <TouchableOpacity style={s.logWeightBtn} onPress={handleLogWeight} disabled={savingWeight}>
                  <Text style={s.logWeightBtnText}>{savingWeight ? '…' : 'Log'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            {bmiVal !== null && (
              <View style={s.bmiRow}>
                <Text style={s.bmiLabel}>BMI</Text>
                <Text style={[s.bmiValue, { color: bmiCat.color }]}>{bmiVal.toFixed(1)}</Text>
                <Text style={[s.bmiCat, { color: bmiCat.color }]}>{bmiCat.label}</Text>
              </View>
            )}
          </View>

        </ScrollView>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content:   { padding: 16, paddingBottom: 40 },

  sectionLabel: { color: G, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, marginTop: 4 },

  statsCard: { backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 20 },

  statRow:     { },
  statLabel:   { color: DIM, fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  statInputRow:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  statInput:   { flex: 1, color: TEXT, fontSize: 28, fontWeight: '700', backgroundColor: BG, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  statUnit:    { color: DIM, fontSize: 16, fontWeight: '600' },
  statHint:    { color: DIM, fontSize: 13 },
  logWeightBtn:     { backgroundColor: G, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  logWeightBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  bmiRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 12, backgroundColor: BG, borderRadius: 10, padding: 12 },
  bmiLabel: { color: DIM, fontSize: 12, fontWeight: '600', flex: 1 },
  bmiValue: { fontSize: 22, fontWeight: '800' },
  bmiCat:   { fontSize: 13, fontWeight: '600' },

  toggleRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleTitle: { color: TEXT, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  toggleSub:   { color: DIM, fontSize: 12, lineHeight: 16 },

  allergenHint:         { color: DIM, fontSize: 12, lineHeight: 17, marginBottom: 14 },
  allergenGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  allergenChip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: BG, borderWidth: 1, borderColor: '#2A2A3A' },
  allergenChipActive:   { backgroundColor: '#4A0A08', borderColor: G },
  allergenChipText:     { color: DIM, fontSize: 13, fontWeight: '600' },
  allergenChipTextActive: { color: '#FF8A80', fontWeight: '700' },

  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  presetBtn: { flex: 1, minWidth: '45%', backgroundColor: CARD, borderRadius: 14, padding: 14, alignItems: 'center' },
  presetName: { color: TEXT, fontWeight: '700', fontSize: 14 },
  presetCal:  { color: '#8888A0', fontSize: 12, marginTop: 3 },

  fieldCard:   { flexDirection: 'row', backgroundColor: CARD, borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  fieldAccent: { width: 4 },
  fieldBody:   { flex: 1, padding: 14 },
  fieldLabel:  { color: '#8888A0', fontSize: 13, marginBottom: 6 },
  inputRow:    { flexDirection: 'row', alignItems: 'center' },
  input:       { flex: 1, color: TEXT, fontSize: 26, fontWeight: '700', padding: 0 },
  unit:        { color: '#404060', fontSize: 16, marginLeft: 6 },

  saveBtn:     { backgroundColor: G, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnDone: { backgroundColor: '#B06E18' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },
});
