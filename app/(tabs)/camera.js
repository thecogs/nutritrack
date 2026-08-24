import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, Alert, ActivityIndicator, Image, ScrollView, TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { scanFoodPhoto } from '../../services/api';
import { addLog } from '../../services/db';
import { getDefaultMealType } from '../../services/mealTime';

const BG   = '#070F05';
const CARD = '#0D1B0B';
const SURF = '#172519';
const G    = '#471914';
const TEXT = '#B6A8A2';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

function MacroInput({ label, value, onChange, color, unit }) {
  return (
    <View style={s.macroCell}>
      <View style={[s.macroCellBar, { backgroundColor: color }]} />
      <TextInput
        style={s.macroCellInput}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        selectTextOnFocus
        placeholder="—"
        placeholderTextColor="#3A3D4A"
      />
      <Text style={s.macroCellUnit}>{unit}</Text>
      <Text style={s.macroCellLbl}>{label}</Text>
    </View>
  );
}

export default function CameraScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [aiLoading,    setAiLoading]    = useState(false);
  const [photoUri,     setPhotoUri]     = useState(null);
  const [foodName,     setFoodName]     = useState('');
  const [mealType,     setMealType]     = useState(getDefaultMealType);
  const [editCal,      setEditCal]      = useState('');
  const [editProt,     setEditProt]     = useState('');
  const [editCarb,     setEditCarb]     = useState('');
  const [editFat,      setEditFat]      = useState('');
  const [editFiber,    setEditFiber]    = useState('');

  const resetModal = useCallback(() => {
    setPhotoUri(null);
    setFoodName('');
    setEditCal(''); setEditProt(''); setEditCarb(''); setEditFat(''); setEditFiber('');
    setMealType(getDefaultMealType());
    setAiLoading(false);
  }, []);

  const handleCapture = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera access is needed to photograph food.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.5,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
    });

    if (result.canceled) return;
    const asset = result.assets[0];

    setPhotoUri(asset.uri);
    setModalVisible(true);
    setAiLoading(true);

    try {
      // Source photos (especially iPhone camera/library) are often HEIC, which
      // the vision model can't read — always re-encode to JPEG first.
      const jpeg = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const food = await scanFoodPhoto(jpeg.base64, 'image/jpeg');
      setFoodName(food.food_name || '');
      setEditCal(String(food.calories  ?? ''));
      setEditProt(String(food.protein  ?? ''));
      setEditCarb(String(food.carbs    ?? ''));
      setEditFat(String(food.fat       ?? ''));
      setEditFiber(String(food.fiber   ?? ''));
    } catch (err) {
      setFoodName('AI error: ' + (err?.message || String(err)));
    } finally {
      setAiLoading(false);
    }
  }, []);

  const handleLog = useCallback(async () => {
    const name = foodName.trim() || 'Unknown food';
    try {
      await addLog({
        food_name: name,
        calories:  parseFloat(editCal)   || 0,
        protein:   parseFloat(editProt)  || 0,
        carbs:     parseFloat(editCarb)  || 0,
        fat:       parseFloat(editFat)   || 0,
        fiber:     parseFloat(editFiber) || 0,
        meal_type: mealType,
        photo_url: photoUri,
      });
      setModalVisible(false);
      resetModal();
      Alert.alert('Logged!', `${name} added to ${mealType}.`);
    } catch {
      Alert.alert('Error', 'Failed to save — please try again.');
    }
  }, [foodName, editCal, editProt, editCarb, editFat, editFiber, mealType, photoUri, resetModal]);

  const handleRetake = useCallback(() => {
    setModalVisible(false);
    resetModal();
  }, [resetModal]);

  return (
    <View style={s.container}>
      <View style={s.launch}>
        <Text style={s.launchTitle}>AI Food Scanner</Text>
        <Text style={s.launchSub}>
          Take a photo of your meal and Claude will estimate the calories and macros automatically.
        </Text>
        <TouchableOpacity style={s.captureBtn} onPress={handleCapture}>
          <Text style={s.captureBtnText}>Open Camera</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalBg}>
          <ScrollView
            style={s.modal}
            contentContainerStyle={{ paddingBottom: 36 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {photoUri && <Image source={{ uri: photoUri }} style={s.preview} />}

            <TextInput
              style={s.foodNameInput}
              value={foodName}
              onChangeText={setFoodName}
              placeholder={aiLoading ? 'Identifying food…' : 'Food name'}
              placeholderTextColor="#3A3D4A"
            />

            {aiLoading ? (
              <View style={s.aiRow}>
                <ActivityIndicator size="small" color={G} />
                <Text style={s.aiText}>Estimating with Claude AI…</Text>
              </View>
            ) : (
              <Text style={s.aiNote}>
                {(editCal || editProt) ? 'AI estimate — tap any value to adjust' : 'Enter values below'}
              </Text>
            )}

            <View style={s.macroGrid}>
              <MacroInput label="Calories" value={editCal}   onChange={setEditCal}   color="#E05555" unit="kcal" />
              <MacroInput label="Protein"  value={editProt}  onChange={setEditProt}  color="#4B9CD3" unit="g"    />
              <MacroInput label="Carbs"    value={editCarb}  onChange={setEditCarb}  color="#D4A017" unit="g"    />
              <MacroInput label="Fat"      value={editFat}   onChange={setEditFat}   color="#9B7FD4" unit="g"    />
              <MacroInput label="Fiber"    value={editFiber} onChange={setEditFiber} color="#3A8FC4" unit="g"    />
            </View>

            <View style={s.mealRow}>
              {MEAL_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[s.mealBtn, mealType === type && s.mealBtnActive]}
                  onPress={() => setMealType(type)}
                >
                  <Text style={[s.mealBtnText, mealType === type && s.mealBtnTextActive]}>
                    {type[0].toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.actions}>
              <TouchableOpacity style={s.retakeBtn} onPress={handleRetake}>
                <Text style={s.retakeText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.logBtn} onPress={handleLog}>
                <Text style={s.logBtnText}>Add to Log</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  launch: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  launchTitle: { color: TEXT, fontSize: 22, fontWeight: '700', marginBottom: 12 },
  launchSub: {
    color: '#6B6F80', fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 44,
  },
  captureBtn: {
    backgroundColor: G, paddingHorizontal: 52, paddingVertical: 18, borderRadius: 28,
  },
  captureBtnText: { color: '#fff', fontWeight: '700', fontSize: 18 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-end' },
  modal:   { backgroundColor: CARD, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '92%' },

  preview: { width: '100%', height: 180, borderRadius: 16, marginBottom: 16 },
  foodNameInput: {
    color: TEXT, fontSize: 20, fontWeight: '700',
    backgroundColor: SURF, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },

  aiRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  aiText: { color: G, fontSize: 13 },
  aiNote: { color: '#4A4D5E', fontSize: 12, marginBottom: 14 },

  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  macroCell: {
    width: '18%', flexGrow: 1, backgroundColor: BG, borderRadius: 12, padding: 10, alignItems: 'center',
  },
  macroCellBar:   { width: '100%', height: 3, borderRadius: 2, marginBottom: 6 },
  macroCellInput: { color: TEXT, fontSize: 18, fontWeight: '700', textAlign: 'center', padding: 0, width: '100%' },
  macroCellUnit:  { color: '#4A4D5E', fontSize: 10, marginTop: 1 },
  macroCellLbl:   { color: '#6B6F80', fontSize: 10, marginTop: 3 },

  mealRow:           { flexDirection: 'row', gap: 8, marginBottom: 18 },
  mealBtn:           { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: SURF, alignItems: 'center' },
  mealBtnActive:     { backgroundColor: G },
  mealBtnText:       { color: '#6B6F80', fontSize: 12 },
  mealBtnTextActive: { color: '#fff', fontWeight: '700' },

  actions:    { flexDirection: 'row', gap: 12 },
  retakeBtn:  { flex: 1, paddingVertical: 15, borderRadius: 14, backgroundColor: SURF, alignItems: 'center' },
  retakeText: { color: '#8892A4', fontWeight: '600' },
  logBtn:     { flex: 2, paddingVertical: 15, borderRadius: 14, backgroundColor: G, alignItems: 'center' },
  logBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
