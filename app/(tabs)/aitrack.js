import React, { useState, useRef, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Alert,
  ActivityIndicator, ScrollView, TextInput, Image, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { lookupBarcode, scanFoodPhoto, searchOffAllergens } from '../../services/api';
import { addLog, getGoals } from '../../services/db';
import { getDefaultMealType } from '../../services/mealTime';
import { checkAllergens } from '../../services/allergens';

const G    = '#471914';
const BG   = '#070F05';
const CARD = '#0D1B0B';
const SURF = '#172519';
const TEXT = '#B6A8A2';
const DIM  = '#5A5248';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const OZ_PRESETS = [
  { label: '1 oz', grams: 28 }, { label: '2 oz', grams: 57 }, { label: '3 oz', grams: 85 },
  { label: '4 oz', grams: 113 }, { label: '6 oz', grams: 170 }, { label: '8 oz', grams: 227 },
  { label: '100g', grams: 100 }, { label: '150g', grams: 150 }, { label: '200g', grams: 200 },
];

function scaleMacros(base, grams) {
  const f = grams / 100;
  return {
    calories: Math.round(base.calories * f),
    protein:  Math.round(base.protein  * f * 10) / 10,
    carbs:    Math.round(base.carbs    * f * 10) / 10,
    fat:      Math.round(base.fat      * f * 10) / 10,
    fiber:    Math.round((base.fiber||0) * f * 10) / 10,
  };
}

function MacroInput({ label, value, onChange, color, unit }) {
  return (
    <View style={s.macroCell}>
      <View style={[s.macroCellBar, { backgroundColor: color }]} />
      <TextInput
        style={s.macroCellInput} value={value} onChangeText={onChange}
        keyboardType="decimal-pad" selectTextOnFocus placeholder="0" placeholderTextColor="#3A3D4A"
      />
      <Text style={s.macroCellUnit}>{unit}</Text>
      <Text style={s.macroCellLbl}>{label}</Text>
    </View>
  );
}

// ── Barcode scanner ───────────────────────────────────────────────────────────

function BarcodeScanner({ onClose }) {
  const [permission, requestPermission] = useCameraPermissions();
  const hasScanned = useRef(false);
  const [loading,        setLoading]        = useState(false);
  const [scanError,      setScanError]      = useState(false);
  const [base,           setBase]           = useState(null);
  const [foodData,       setFoodData]       = useState(null);
  const [servingGrams,   setServingGrams]   = useState(100);
  const [customGrams,    setCustomGrams]    = useState('');
  const [mealType,       setMealType]       = useState(getDefaultMealType);
  const [modalVisible,   setModalVisible]   = useState(false);
  const [allergenHits,   setAllergenHits]   = useState([]);
  const userAllergensRef = useRef([]);

  useEffect(() => { getGoals().then((g) => { userAllergensRef.current = g.allergens || []; }).catch(() => {}); }, []);

  const reset = () => {
    hasScanned.current = false;
    setBase(null); setFoodData(null); setScanError(false);
    setServingGrams(100); setCustomGrams(''); setMealType(getDefaultMealType()); setLoading(false);
    setAllergenHits([]);
  };

  const handleBarCodeScanned = useCallback(async ({ data }) => {
    if (hasScanned.current) return;
    hasScanned.current = true;
    setLoading(true); setModalVisible(true);
    try {
      const food = await lookupBarcode(data);
      const b = { food_name: food.food_name, brand: food.brand, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, fiber: food.fiber||0, sugar: food.sugar||0, sat_fat: food.sat_fat||0 };
      setBase(b); setServingGrams(100); setCustomGrams('');
      setFoodData({ ...b, ...scaleMacros(b, 100) });
      setAllergenHits(checkAllergens(food.food_name, userAllergensRef.current, food.allergens_tags));
    } catch { setScanError(true); } finally { setLoading(false); }
  }, []);

  const applyServing = (grams) => {
    setServingGrams(grams); setCustomGrams('');
    setBase((b) => { if (b) setFoodData((f) => ({ ...f, ...scaleMacros(b, grams) })); return b; });
  };

  const applyCustom = (val) => {
    setCustomGrams(val);
    const g = parseFloat(val);
    if (g > 0) { setServingGrams(g); setBase((b) => { if (b) setFoodData((f) => ({ ...f, ...scaleMacros(b, g) })); return b; }); }
  };

  const handleLog = async () => {
    if (!foodData) return;
    try {
      await addLog({ ...foodData, meal_type: mealType });
      setModalVisible(false); reset();
      Alert.alert('Logged!', `${foodData.food_name} added to ${mealType}.`);
      onClose();
    } catch { Alert.alert('Error', 'Failed to save.'); }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={s.permBox}>
        <Text style={s.permTitle}>Barcode Scan</Text>
        <Text style={s.permSub}>Barcode scanning requires a native camera.{'\n'}Use the AI Photo option to photograph a nutrition label instead.</Text>
        <TouchableOpacity style={s.permBtn} onPress={onClose}><Text style={s.permBtnText}>Back</Text></TouchableOpacity>
      </View>
    );
  }

  if (!permission) return <View style={s.permBox}><Text style={s.msg}>Requesting camera…</Text></View>;
  if (!permission.granted) {
    return (
      <View style={s.permBox}>
        <Text style={s.permTitle}>Camera Access Required</Text>
        <Text style={s.permSub}>Needed to scan barcodes.</Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission}><Text style={s.permBtnText}>Grant Permission</Text></TouchableOpacity>
        <TouchableOpacity style={[s.permBtn, { backgroundColor: SURF, marginTop: 8 }]} onPress={onClose}><Text style={[s.permBtnText, { color: TEXT }]}>Back</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {!modalVisible && (
        <>
          <CameraView
            style={StyleSheet.absoluteFillObject} facing="back"
            onBarcodeScanned={hasScanned.current ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['ean13','ean8','upc_a','upc_e','code128','code39','itf14','qr'] }}
          />
          <View style={s.scanOverlay}>
            <TouchableOpacity style={s.backBtn} onPress={onClose}><Text style={s.backBtnText}>✕</Text></TouchableOpacity>
            <View style={s.scanFrame} />
            <Text style={s.hint}>Point at a barcode</Text>
          </View>
        </>
      )}

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalBg}>
          <ScrollView style={s.modal} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            {loading ? (
              <View style={s.loadingState}><ActivityIndicator size="large" color={G} /><Text style={s.loadingText}>Looking up product…</Text></View>
            ) : scanError ? (
              <View style={s.errorState}>
                <Text style={s.errorTitle}>Product not found</Text>
                <Text style={s.errorSub}>Try AI Photo to scan the nutrition label instead.</Text>
              </View>
            ) : (
              <>
                <Text style={s.modalTitle}>{foodData?.food_name}</Text>
                {foodData?.brand ? <Text style={s.modalBrand}>{foodData.brand}</Text> : null}
                {allergenHits.length > 0 && (
                  <View style={s.allergenBanner}>
                    <Text style={s.allergenBannerText}>⚠  Contains: {allergenHits.join(', ')}</Text>
                  </View>
                )}
                <View style={s.macroGrid}>
                  {[['Calories','calories','kcal','#E05555'],['Protein','protein','g','#CE5400'],['Carbs','carbs','g','#08C343'],['Fat (Total)','fat','g','#FFD700'],['Fiber','fiber','g','#215CDA'],['Sugar','sugar','g','#FF6B9D'],['Sat. Fat','sat_fat','g','#FF6347']].map(([label,key,unit,color]) => (
                    <View key={label} style={s.macroDisplayCell}>
                      <Text style={[s.macroDisplayVal, { color }]}>{foodData?.[key] ?? 0}{unit}</Text>
                      <Text style={s.macroDisplayLbl}>{label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={s.sectionLabel}>Serving size</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ paddingRight: 16 }}>
                  {OZ_PRESETS.map((p) => (
                    <TouchableOpacity key={p.label} style={[s.ozChip, servingGrams===p.grams && !customGrams && s.ozChipActive]} onPress={() => applyServing(p.grams)}>
                      <Text style={[s.ozChipText, servingGrams===p.grams && !customGrams && s.ozChipTextActive]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <View style={s.customRow}>
                  <TextInput style={s.customInput} placeholder="Custom grams…" placeholderTextColor="#404060" keyboardType="decimal-pad" value={customGrams} onChangeText={applyCustom} />
                  <Text style={s.customUnit}>g</Text>
                </View>
                <View style={s.mealRow}>
                  {MEAL_TYPES.map((type) => (
                    <TouchableOpacity key={type} style={[s.mealBtn, mealType===type && s.mealBtnActive]} onPress={() => setMealType(type)}>
                      <Text style={[s.mealBtnText, mealType===type && s.mealBtnTextActive]}>{type[0].toUpperCase()+type.slice(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.cancelBtn, scanError && { flex: 2 }]} onPress={() => { setModalVisible(false); reset(); }}>
                <Text style={s.cancelText}>{scanError ? 'Scan Again' : 'Cancel'}</Text>
              </TouchableOpacity>
              {!loading && !scanError && (
                <TouchableOpacity style={s.logBtn} onPress={handleLog}><Text style={s.logBtnText}>Add to Log</Text></TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── AI Photo scanner ──────────────────────────────────────────────────────────

function PhotoScanner({ onClose }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [aiLoading, setAiLoading]       = useState(false);
  const [photoUri,   setPhotoUri]       = useState(null);
  const [foodName,   setFoodName]       = useState('');
  const [mealType,   setMealType]       = useState(getDefaultMealType);
  const [dataSource,   setDataSource]   = useState(null);
  const [base,         setBase]         = useState(null);
  const [servingGrams, setServingGrams] = useState(null);
  const [cal,   setCal]   = useState('');
  const [prot,  setProt]  = useState('');
  const [carb,  setCarb]  = useState('');
  const [fat,   setFat]   = useState('');
  const [fiber,   setFiber]   = useState('');
  const [sugar,   setSugar]   = useState('');
  const [satFat,  setSatFat]  = useState('');
  const [allergenHits,   setAllergenHits]   = useState([]);
  const userAllergensRef  = useRef([]);
  const allergenTimerRef  = useRef(null);

  useEffect(() => { getGoals().then((g) => { userAllergensRef.current = g.allergens || []; }).catch(() => {}); }, []);

  const checkFoodNameAllergens = useCallback((name) => {
    setAllergenHits(checkAllergens(name, userAllergensRef.current, []));
    clearTimeout(allergenTimerRef.current);
    allergenTimerRef.current = setTimeout(() => {
      searchOffAllergens(name).then((offTags) => {
        setAllergenHits(checkAllergens(name, userAllergensRef.current, offTags));
      }).catch(() => {});
    }, 600);
  }, []);

  const applyServing = (grams) => {
    if (!base) return;
    const scale = grams / 100;
    setServingGrams(grams);
    setCal(String(Math.round(base.calories * scale)));
    setProt(String(Math.round(base.protein  * scale * 10) / 10));
    setCarb(String(Math.round(base.carbs    * scale * 10) / 10));
    setFat(String(Math.round(base.fat       * scale * 10) / 10));
    setFiber(String(Math.round((base.fiber  || 0) * scale * 10) / 10));
    setSugar(String(Math.round((base.sugar   || 0) * scale * 10) / 10));
    setSatFat(String(Math.round((base.sat_fat || 0) * scale * 10) / 10));
  };

  const resetModal = () => {
    setPhotoUri(null); setFoodName(''); setCal(''); setProt(''); setCarb(''); setFat(''); setFiber(''); setSugar(''); setSatFat('');
    setMealType(getDefaultMealType()); setAiLoading(false); setDataSource(null); setBase(null); setServingGrams(null);
    setAllergenHits([]);
  };

  const handleCapture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Camera access is needed to photograph food.'); return; }
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5, mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPhotoUri(asset.uri); setModalVisible(true); setAiLoading(true);
    try {
      const food = await scanFoodPhoto(asset.base64, 'image/jpeg');
      setFoodName(food.food_name||'');
      setCal(String(food.calories??'')); setProt(String(food.protein??'')); setCarb(String(food.carbs??''));
      setFat(String(food.fat??'')); setFiber(String(food.fiber??'')); setSugar(String(food.sugar??'')); setSatFat(String(food.sat_fat??''));
      setDataSource(food.source || 'ai');
      if (food._base) { setBase(food._base); setServingGrams(food.grams || 100); }
      else { setBase(null); setServingGrams(null); }
      // Keyword check immediately, then upgrade with real OFF data in background
      setAllergenHits(checkAllergens(food.food_name, userAllergensRef.current, []));
      searchOffAllergens(food.food_name).then((offTags) => {
        setAllergenHits(checkAllergens(food.food_name, userAllergensRef.current, offTags));
      }).catch(() => {});
    } catch {} finally { setAiLoading(false); }
  };

  const handleLog = async () => {
    const name = foodName.trim() || 'Unknown food';
    try {
      await addLog({ food_name: name, calories: parseFloat(cal)||0, protein: parseFloat(prot)||0, carbs: parseFloat(carb)||0, fat: parseFloat(fat)||0, fiber: parseFloat(fiber)||0, sugar: parseFloat(sugar)||0, sat_fat: parseFloat(satFat)||0, meal_type: mealType, photo_url: photoUri });
      setModalVisible(false); resetModal();
      Alert.alert('Logged!', `${name} added to ${mealType}.`);
      onClose();
    } catch { Alert.alert('Error', 'Failed to save — please try again.'); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={s.photoLaunch}>
        <TouchableOpacity style={s.backBtn} onPress={onClose}><Text style={s.backBtnText}>✕</Text></TouchableOpacity>
        <Text style={s.launchTitle}>AI Food Scanner</Text>
        <Text style={s.launchSub}>Take a photo of your meal and Claude will estimate macros automatically.</Text>
        <TouchableOpacity style={s.captureBtn} onPress={handleCapture}><Text style={s.captureBtnText}>Open Camera</Text></TouchableOpacity>
      </View>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalBg}>
          <ScrollView style={s.modal} contentContainerStyle={{ paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
            {photoUri && <Image source={{ uri: photoUri }} style={s.preview} />}
            <TextInput style={s.foodNameInput} value={foodName} onChangeText={(v) => { setFoodName(v); checkFoodNameAllergens(v); }} placeholder={aiLoading ? 'Identifying food…' : 'Food name'} placeholderTextColor="#3A3D4A" />
            {allergenHits.length > 0 && (
              <View style={s.allergenBanner}>
                <Text style={s.allergenBannerText}>⚠  Contains: {allergenHits.join(', ')}</Text>
              </View>
            )}
            {aiLoading
              ? <View style={s.aiRow}><ActivityIndicator size="small" color={G} /><Text style={s.aiText}>Identifying food…</Text></View>
              : <Text style={s.aiNote}>
                  {!cal && !prot
                    ? 'Enter values below'
                    : dataSource === 'usda'  ? '✓ USDA verified · tap any value to adjust'
                    : dataSource === 'label' ? '✓ Read from nutrition label · tap to adjust'
                    : 'AI estimate · tap any value to adjust'}
                </Text>
            }
            {base && (
              <>
                <Text style={s.sectionLabel}>Adjust portion size</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ paddingRight: 16 }}>
                  {OZ_PRESETS.map((p) => (
                    <TouchableOpacity key={p.label} style={[s.ozChip, servingGrams===p.grams && s.ozChipActive]} onPress={() => applyServing(p.grams)}>
                      <Text style={[s.ozChipText, servingGrams===p.grams && s.ozChipTextActive]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
            <View style={s.macroGrid}>
              <MacroInput label="Calories" value={cal}   onChange={setCal}   color="#E05555" unit="kcal" />
              <MacroInput label="Protein"  value={prot}  onChange={setProt}  color="#CE5400" unit="g" />
              <MacroInput label="Carbs"    value={carb}  onChange={setCarb}  color="#08C343" unit="g" />
              <MacroInput label="Fat"      value={fat}   onChange={setFat}   color="#FFD700" unit="g" />
              <MacroInput label="Fiber"    value={fiber} onChange={setFiber} color="#215CDA" unit="g" />
              <MacroInput label="Sugar"    value={sugar}  onChange={setSugar}  color="#FF6B9D" unit="g" />
              <MacroInput label="Sat. Fat" value={satFat} onChange={setSatFat} color="#FF6347" unit="g" />
            </View>
            <View style={s.mealRow}>
              {MEAL_TYPES.map((type) => (
                <TouchableOpacity key={type} style={[s.mealBtn, mealType===type && s.mealBtnActive]} onPress={() => setMealType(type)}>
                  <Text style={[s.mealBtnText, mealType===type && s.mealBtnTextActive]}>{type[0].toUpperCase()+type.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setModalVisible(false); resetModal(); }}><Text style={s.cancelText}>Retake</Text></TouchableOpacity>
              <TouchableOpacity style={s.logBtn} onPress={handleLog}><Text style={s.logBtnText}>Add to Log</Text></TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AITrackScreen() {
  const [mode, setMode] = useState(null); // null | 'barcode' | 'photo'

  useFocusEffect(useCallback(() => { return () => setMode(null); }, []));

  if (mode === 'barcode') return <BarcodeScanner onClose={() => setMode(null)} />;
  if (mode === 'photo')   return <PhotoScanner   onClose={() => setMode(null)} />;

  return (
    <View style={s.home}>
      <Text style={s.homeTitle}>AI Track</Text>
      <Text style={s.homeSub}>Scan a barcode or photograph your food to log it instantly.</Text>

      <TouchableOpacity style={s.modeCard} onPress={() => setMode('barcode')}>
        <Text style={s.modeIcon}>▦</Text>
        <View style={s.modeInfo}>
          <Text style={s.modeName}>Scan Barcode</Text>
          <Text style={s.modeDesc}>Point your camera at any product barcode</Text>
        </View>
        <Text style={s.modeArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.modeCard} onPress={() => setMode('photo')}>
        <Text style={s.modeIcon}>📷</Text>
        <View style={s.modeInfo}>
          <Text style={s.modeName}>AI Photo</Text>
          <Text style={s.modeDesc}>Photograph a meal or nutrition label</Text>
        </View>
        <Text style={s.modeArrow}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  home:      { flex: 1, backgroundColor: BG, padding: 24, paddingTop: 48 },
  homeTitle: { color: TEXT, fontSize: 28, fontWeight: '800', marginBottom: 8 },
  homeSub:   { color: DIM, fontSize: 14, lineHeight: 20, marginBottom: 36 },
  modeCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 18, padding: 20, marginBottom: 14 },
  modeIcon:  { fontSize: 32, marginRight: 16 },
  modeInfo:  { flex: 1 },
  modeName:  { color: TEXT, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  modeDesc:  { color: DIM, fontSize: 13 },
  modeArrow: { color: DIM, fontSize: 26, marginLeft: 8 },

  permBox:   { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', padding: 32 },
  permTitle: { color: TEXT, fontSize: 20, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  permSub:   { color: DIM, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  permBtn:   { backgroundColor: G, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  msg:       { color: TEXT, textAlign: 'center', marginTop: 60, fontSize: 16 },

  scanOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanFrame:   { width: 280, height: 180, borderWidth: 2, borderColor: G, borderRadius: 14, backgroundColor: 'transparent' },
  hint:        { color: 'rgba(255,255,255,0.7)', marginTop: 16, fontSize: 14 },
  backBtn:     { position: 'absolute', top: 52, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  backBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  photoLaunch: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  launchTitle: { color: TEXT, fontSize: 22, fontWeight: '700', marginBottom: 12 },
  launchSub:   { color: DIM, fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 44 },
  captureBtn:  { backgroundColor: G, paddingHorizontal: 52, paddingVertical: 18, borderRadius: 28 },
  captureBtnText: { color: '#fff', fontWeight: '700', fontSize: 18 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'flex-end' },
  modal:   { backgroundColor: CARD, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },

  loadingState: { alignItems: 'center', paddingVertical: 48 },
  loadingText:  { color: DIM, marginTop: 16, fontSize: 15 },
  errorState:   { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 8 },
  errorTitle:   { color: TEXT, fontSize: 18, fontWeight: '700', marginBottom: 10 },
  errorSub:     { color: DIM, fontSize: 14, textAlign: 'center', lineHeight: 21 },

  modalTitle: { color: TEXT, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  modalBrand: { color: DIM, fontSize: 13, marginBottom: 16 },

  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  macroDisplayCell: { alignItems: 'center', minWidth: '18%', flex: 1 },
  macroDisplayVal:  { fontSize: 18, fontWeight: '700' },
  macroDisplayLbl:  { color: DIM, fontSize: 11, marginTop: 3 },

  macroCell:      { width: '18%', flexGrow: 1, backgroundColor: BG, borderRadius: 12, padding: 10, alignItems: 'center' },
  macroCellBar:   { width: '100%', height: 3, borderRadius: 2, marginBottom: 6 },
  macroCellInput: { color: TEXT, fontSize: 18, fontWeight: '700', textAlign: 'center', padding: 0, width: '100%' },
  macroCellUnit:  { color: DIM, fontSize: 10, marginTop: 1 },
  macroCellLbl:   { color: DIM, fontSize: 10, marginTop: 3 },

  sectionLabel: { color: G, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  ozChip:           { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: SURF, marginRight: 8 },
  ozChipActive:     { backgroundColor: G },
  ozChipText:       { color: DIM, fontSize: 13, fontWeight: '600' },
  ozChipTextActive: { color: '#fff' },
  customRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: BG, borderRadius: 10, paddingHorizontal: 14, marginBottom: 20 },
  customInput:  { flex: 1, color: TEXT, fontSize: 16, paddingVertical: 11 },
  customUnit:   { color: DIM, fontSize: 14 },

  mealRow:           { flexDirection: 'row', gap: 8, marginBottom: 18 },
  mealBtn:           { flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: SURF, alignItems: 'center' },
  mealBtnActive:     { backgroundColor: G },
  mealBtnText:       { color: DIM, fontSize: 12 },
  mealBtnTextActive: { color: '#fff', fontWeight: '700' },

  preview:       { width: '100%', height: 180, borderRadius: 16, marginBottom: 16 },
  foodNameInput: { color: TEXT, fontSize: 20, fontWeight: '700', backgroundColor: SURF, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  aiRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  aiText: { color: G, fontSize: 13 },
  aiNote: { color: DIM, fontSize: 12, marginBottom: 14 },

  allergenBanner:     { backgroundColor: 'rgba(224,50,50,0.15)', borderWidth: 1, borderColor: 'rgba(224,50,50,0.4)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14 },
  allergenBannerText: { color: '#FF6B6B', fontSize: 13, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn:    { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: SURF, alignItems: 'center' },
  cancelText:   { color: '#8892A4', fontWeight: '600' },
  logBtn:       { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: G, alignItems: 'center' },
  logBtnText:   { color: '#fff', fontWeight: '700', fontSize: 16 },
});
