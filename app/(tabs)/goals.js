import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, Keyboard, Pressable,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getGoals, saveGoals } from '../../services/db';

const G    = '#471914';
const BG   = '#070F05';
const CARD = '#0D1B0B';
const SURF = '#172519';
const TEXT = '#B6A8A2';

const GOAL_FIELDS = [
  { key: 'calories', label: 'Daily Calories',  unit: 'kcal', color: '#FF453A', placeholder: '2000' },
  { key: 'protein',  label: 'Protein',          unit: 'g',    color: '#5AC8FA', placeholder: '150'  },
  { key: 'carbs',    label: 'Carbohydrates',    unit: 'g',    color: '#FFD60A', placeholder: '250'  },
  { key: 'fat',      label: 'Fat',              unit: 'g',    color: '#BF5AF2', placeholder: '65'   },
  { key: 'fiber',    label: 'Fiber',            unit: 'g',    color: '#32ADE6', placeholder: '30'   },
];

const PRESETS = [
  { name: 'Maintenance', calories: 2000, protein: 150, carbs: 250, fat: 67,  fiber: 30 },
  { name: 'Cut',         calories: 1600, protein: 180, carbs: 140, fat: 55,  fiber: 28 },
  { name: 'Bulk',        calories: 2800, protein: 200, carbs: 320, fat: 90,  fiber: 35 },
  { name: 'Keto',        calories: 1800, protein: 140, carbs: 25,  fat: 140, fiber: 20 },
];

export default function GoalsScreen() {
  const [goals, setGoals] = useState({ calories: '2000', protein: '150', carbs: '250', fat: '65', fiber: '30' });
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        try {
          const data = await getGoals();
          if (data) {
            setGoals({
              calories: String(data.calories),
              protein:  String(data.protein),
              carbs:    String(data.carbs),
              fat:      String(data.fat),
              fiber:    String(data.fiber ?? 30),
            });
          }
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
    };
    try {
      await saveGoals(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      Alert.alert('Error', 'Failed to save goals.');
    }
  };

  const applyPreset = (preset) => {
    setGoals({
      calories: String(preset.calories),
      protein:  String(preset.protein),
      carbs:    String(preset.carbs),
      fat:      String(preset.fat),
      fiber:    String(preset.fiber),
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={{ flex: 1 }} onPress={Platform.OS !== 'web' ? Keyboard.dismiss : undefined}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardDismissMode="on-drag">

          <Text style={styles.sectionLabel}>Presets</Text>
          <View style={styles.presetRow}>
            {PRESETS.map((p) => (
              <TouchableOpacity key={p.name} style={styles.presetBtn} onPress={() => applyPreset(p)}>
                <Text style={styles.presetName}>{p.name}</Text>
                <Text style={styles.presetCal}>{p.calories} kcal</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Daily Targets</Text>
          {GOAL_FIELDS.map(({ key, label, unit, color, placeholder }) => (
            <View key={key} style={styles.fieldCard}>
              <View style={[styles.fieldAccent, { backgroundColor: color }]} />
              <View style={styles.fieldBody}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    value={goals[key]}
                    onChangeText={(v) => setGoals((g) => ({ ...g, [key]: v }))}
                    keyboardType="numeric"
                    placeholder={placeholder}
                    placeholderTextColor="#404060"
                  />
                  <Text style={styles.unit}>{unit}</Text>
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity style={[styles.saveBtn, saved && styles.saveBtnDone]} onPress={handleSave}>
            <Text style={styles.saveBtnText}>{saved ? '✓  Saved' : 'Save Goals'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content:   { padding: 16, paddingBottom: 40 },

  sectionLabel: {
    color: G, fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, marginTop: 4,
  },

  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  presetBtn: {
    flex: 1, minWidth: '45%', backgroundColor: CARD,
    borderRadius: 14, padding: 14, alignItems: 'center',
  },
  presetName: { color: TEXT, fontWeight: '700', fontSize: 14 },
  presetCal:  { color: '#8888A0', fontSize: 12, marginTop: 3 },

  fieldCard: {
    flexDirection: 'row', backgroundColor: CARD,
    borderRadius: 14, overflow: 'hidden', marginBottom: 10,
  },
  fieldAccent: { width: 4 },
  fieldBody:   { flex: 1, padding: 14 },
  fieldLabel:  { color: '#8888A0', fontSize: 13, marginBottom: 6 },
  inputRow:    { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1, color: TEXT, fontSize: 26, fontWeight: '700', padding: 0,
  },
  unit: { color: '#404060', fontSize: 16, marginLeft: 6 },

  saveBtn:     { backgroundColor: G, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnDone: { backgroundColor: '#B06E18' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },
});
