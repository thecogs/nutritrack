import React, { useState, useRef, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, Alert, ActivityIndicator, ScrollView, TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { lookupBarcode } from '../../services/api';
import { addLog } from '../../services/db';
import { getDefaultMealType } from '../../services/mealTime';

const G    = '#471914';
const BG   = '#070F05';
const CARD = '#0D1B0B';
const SURF = '#172519';
const TEXT = '#B6A8A2';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

const OZ_PRESETS = [
  { label: '1 oz',  grams: 28  },
  { label: '2 oz',  grams: 57  },
  { label: '3 oz',  grams: 85  },
  { label: '4 oz',  grams: 113 },
  { label: '6 oz',  grams: 170 },
  { label: '8 oz',  grams: 227 },
  { label: '100g',  grams: 100 },
  { label: '150g',  grams: 150 },
  { label: '200g',  grams: 200 },
];

function scaleMacros(base, grams) {
  const f = grams / 100;
  return {
    calories: Math.round(base.calories * f),
    protein:  Math.round(base.protein  * f * 10) / 10,
    carbs:    Math.round(base.carbs    * f * 10) / 10,
    fat:      Math.round(base.fat      * f * 10) / 10,
    fiber:    Math.round((base.fiber || 0) * f * 10) / 10,
  };
}

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const hasScanned = useRef(false);

  const [loading,      setLoading]      = useState(false);
  const [scanError,    setScanError]    = useState(false);
  const [base,         setBase]         = useState(null);
  const [foodData,     setFoodData]     = useState(null);
  const [servingGrams, setServingGrams] = useState(100);
  const [customGrams,  setCustomGrams]  = useState('');
  const [mealType,     setMealType]     = useState(getDefaultMealType);
  const [modalVisible, setModalVisible] = useState(false);

  const reset = useCallback(() => {
    hasScanned.current = false;
    setBase(null);
    setFoodData(null);
    setScanError(false);
    setServingGrams(100);
    setCustomGrams('');
    setMealType(getDefaultMealType());
    setLoading(false);
  }, []);

  const handleBarCodeScanned = useCallback(async ({ data }) => {
    if (hasScanned.current) return;
    hasScanned.current = true;

    // Open modal immediately — camera unmounts, no freeze.
    // API call runs behind the loading spinner.
    setLoading(true);
    setModalVisible(true);

    try {
      const food = await lookupBarcode(data);
      const b = {
        food_name: food.food_name,
        brand:     food.brand,
        calories:  food.calories,
        protein:   food.protein,
        carbs:     food.carbs,
        fat:       food.fat,
        fiber:     food.fiber || 0,
      };
      setBase(b);
      setServingGrams(100);
      setCustomGrams('');
      setFoodData({ ...b, ...scaleMacros(b, 100) });
    } catch {
      setScanError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const applyServing = useCallback((grams) => {
    setServingGrams(grams);
    setCustomGrams('');
    setBase((b) => {
      if (b) setFoodData((f) => ({ ...f, ...scaleMacros(b, grams) }));
      return b;
    });
  }, []);

  const applyCustom = useCallback((val) => {
    setCustomGrams(val);
    const g = parseFloat(val);
    if (g > 0) {
      setServingGrams(g);
      setBase((b) => {
        if (b) setFoodData((f) => ({ ...f, ...scaleMacros(b, g) }));
        return b;
      });
    }
  }, []);

  const handleLog = useCallback(async () => {
    if (!foodData) return;
    const snap = foodData;
    const meal = mealType;
    try {
      await addLog({ ...snap, meal_type: meal });
      setModalVisible(false);
      reset();
      Alert.alert('Logged!', `${snap.food_name} added to ${meal}.`);
    } catch {
      Alert.alert('Error', 'Failed to save. Please try again.');
    }
  }, [foodData, mealType, reset]);

  const handleCancel = useCallback(() => {
    setModalVisible(false);
    reset();
  }, [reset]);

  useFocusEffect(
    useCallback(() => {
      return () => { setModalVisible(false); reset(); };
    }, [reset])
  );

  if (!permission) {
    return <View style={styles.container}><Text style={styles.msg}>Requesting camera access…</Text></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.msg}>Camera permission is required to scan barcodes.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera unmounts while modal is open — prevents freeze after scan */}
      {!modalVisible && (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={hasScanned.current ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14', 'qr'],
          }}
        />
      )}

      {!modalVisible && (
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.hint}>Point at a barcode</Text>
        </View>
      )}

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <ScrollView
            style={styles.modal}
            contentContainerStyle={{ paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color={G} />
                <Text style={styles.loadingText}>Looking up product…</Text>
              </View>
            ) : scanError ? (
              <View style={styles.errorState}>
                <Text style={styles.errorTitle}>Product not found</Text>
                <Text style={styles.errorSub}>
                  This barcode isn't in any database.{'\n'}Try the Camera tab to photograph the nutrition label instead.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.modalTitle}>{foodData?.food_name}</Text>
                {foodData?.brand ? <Text style={styles.modalBrand}>{foodData.brand}</Text> : null}

                <View style={styles.macroGrid}>
                  {[
                    { label: 'Calories', value: foodData?.calories, unit: 'kcal', color: '#E05555' },
                    { label: 'Protein',  value: foodData?.protein,  unit: 'g',    color: '#4B9CD3' },
                    { label: 'Carbs',    value: foodData?.carbs,    unit: 'g',    color: '#D4A017' },
                    { label: 'Fat',      value: foodData?.fat,      unit: 'g',    color: '#9B7FD4' },
                    { label: 'Fiber',    value: foodData?.fiber,    unit: 'g',    color: '#3A8FC4' },
                  ].map(({ label, value, unit, color }) => (
                    <View key={label} style={styles.macroCell}>
                      <Text style={[styles.macroCellVal, { color }]}>{value ?? 0}{unit}</Text>
                      <Text style={styles.macroCellLbl}>{label}</Text>
                    </View>
                  ))}
                </View>

                <Text style={styles.sectionLabel}>Serving size</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.ozScroll}
                  contentContainerStyle={{ paddingRight: 16 }}
                >
                  {OZ_PRESETS.map((p) => (
                    <TouchableOpacity
                      key={p.label}
                      style={[styles.ozChip, servingGrams === p.grams && !customGrams && styles.ozChipActive]}
                      onPress={() => applyServing(p.grams)}
                    >
                      <Text style={[styles.ozChipText, servingGrams === p.grams && !customGrams && styles.ozChipTextActive]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.customRow}>
                  <TextInput
                    style={styles.customInput}
                    placeholder="Custom grams…"
                    placeholderTextColor="#404060"
                    keyboardType="decimal-pad"
                    value={customGrams}
                    onChangeText={applyCustom}
                  />
                  <Text style={styles.customUnit}>g</Text>
                </View>

                <Text style={styles.sectionLabel}>Meal type</Text>
                <View style={styles.mealRow}>
                  {MEAL_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.mealBtn, mealType === type && styles.mealBtnActive]}
                      onPress={() => setMealType(type)}
                    >
                      <Text style={[styles.mealBtnText, mealType === type && styles.mealBtnTextActive]}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.cancelBtn, scanError && { flex: 2 }]} onPress={handleCancel}>
                <Text style={styles.cancelText}>{scanError ? 'Scan Again' : 'Cancel'}</Text>
              </TouchableOpacity>
              {!loading && !scanError && (
                <TouchableOpacity style={styles.logBtn} onPress={handleLog}>
                  <Text style={styles.logBtnText}>Add to Log</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  msg: { color: TEXT, textAlign: 'center', marginTop: 60, fontSize: 16, paddingHorizontal: 32 },

  overlay:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanFrame: {
    width: 280, height: 180, borderWidth: 2, borderColor: G,
    borderRadius: 14, backgroundColor: 'transparent',
  },
  hint: { color: 'rgba(255,255,255,0.7)', marginTop: 16, fontSize: 14 },

  permBtn:     { marginTop: 24, alignSelf: 'center', backgroundColor: G, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24 },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: CARD, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, maxHeight: '88%',
  },

  loadingState: { alignItems: 'center', paddingVertical: 48 },
  loadingText:  { color: '#6B6F80', marginTop: 16, fontSize: 15 },

  errorState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 8 },
  errorTitle: { color: TEXT, fontSize: 18, fontWeight: '700', marginBottom: 10 },
  errorSub:   { color: '#4A4D5E', fontSize: 14, textAlign: 'center', lineHeight: 21 },

  modalTitle: { color: TEXT, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  modalBrand: { color: '#6B6F80', fontSize: 13, marginBottom: 16 },

  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  macroCell: { alignItems: 'center', minWidth: '18%', flex: 1 },
  macroCellVal: { fontSize: 18, fontWeight: '700' },
  macroCellLbl: { color: '#606080', fontSize: 11, marginTop: 3 },

  sectionLabel: {
    color: G, fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
  },

  ozScroll: { marginBottom: 10 },
  ozChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    backgroundColor: SURF, marginRight: 8,
  },
  ozChipActive:     { backgroundColor: G },
  ozChipText:       { color: '#606080', fontSize: 13, fontWeight: '600' },
  ozChipTextActive: { color: '#fff' },

  customRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: BG, borderRadius: 10,
    paddingHorizontal: 14, marginBottom: 20,
  },
  customInput: { flex: 1, color: TEXT, fontSize: 16, paddingVertical: 11 },
  customUnit:  { color: '#404060', fontSize: 14 },

  mealRow:           { flexDirection: 'row', gap: 8, marginBottom: 20 },
  mealBtn:           { flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: SURF, alignItems: 'center' },
  mealBtnActive:     { backgroundColor: G },
  mealBtnText:       { color: '#606080', fontSize: 12 },
  mealBtnTextActive: { color: '#fff', fontWeight: '700' },

  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: SURF, alignItems: 'center' },
  cancelText: { color: '#8892A4', fontWeight: '600' },
  logBtn:     { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: G, alignItems: 'center' },
  logBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
