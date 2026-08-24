import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, Alert, Platform } from 'react-native';
import { TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import Svg, { Path, Line, Rect, Circle, Text as SvgText, G as SvgG } from 'react-native-svg';
import { getDailyCalorieTotals, getWeightLogs, getGoals, getAllFoodLogs, getWeightLogs as getWeightLogsAll, importFromCSV, importFromMacroFactor } from '../../services/db';
import { parseMacroFactorWorkbook } from '../../services/macrofactorImport';

const ACCENT = '#471914';
const BG     = '#070F05';
const CARD   = '#0D1B0B';
const SURF   = '#172519';
const TEXT   = '#B6A8A2';
const DIM    = '#5A5248';

const CAL_PERIODS    = [{ label: '1W', days: 7 }, { label: '1M', days: 30 }, { label: '6M', days: 180 }];
const WEIGHT_PERIODS = [{ label: '1W', days: 7 }, { label: '1M', days: 30 }, { label: '3M', days: 90 }, { label: '6M', days: 180 }, { label: '1Y', days: 365 }];

function toLocalDateStr(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function formatXLabel(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  if (days <= 7)  return d.toLocaleDateString('en-US', { weekday: 'short' });
  if (days <= 90) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ── Calorie bar chart ─────────────────────────────────────────────────────────

function CalorieChart({ data, goal, days }) {
  const screenWidth = Dimensions.get('window').width;
  const chartW = screenWidth - 64;
  const chartH = 200;
  const PAD = { top: 16, right: 16, bottom: 36, left: 46 };
  const plotW = chartW - PAD.left - PAD.right;
  const plotH = chartH - PAD.top - PAD.bottom;

  const maxCal = Math.max(goal * 1.2, ...data.map((d) => d.calories), 1);
  const toY = (v) => PAD.top + (1 - v / maxCal) * plotH;
  const barW = Math.max(2, (plotW / Math.max(data.length, 1)) * 0.7);
  const toX = (i) => PAD.left + (i / Math.max(data.length - 1, 1)) * plotW;

  const gridCount = 4;
  const yGrid = Array.from({ length: gridCount }, (_, i) => {
    const frac = i / (gridCount - 1);
    return { y: PAD.top + frac * plotH, label: Math.round(maxCal * (1 - frac)) };
  });

  const maxLabels = 5;
  const step = Math.max(1, Math.ceil(data.length / maxLabels));
  const goalY = toY(goal).toFixed(1);

  return (
    <Svg width={chartW} height={chartH}>
      {yGrid.map((gl, i) => (
        <SvgG key={i}>
          <Line x1={PAD.left} y1={gl.y.toFixed(1)} x2={chartW - PAD.right} y2={gl.y.toFixed(1)} stroke={SURF} strokeWidth={1} />
          <SvgText x={(PAD.left - 6).toFixed(1)} y={(gl.y + 4).toFixed(1)} textAnchor="end" fill={DIM} fontSize={9}>{gl.label}</SvgText>
        </SvgG>
      ))}

      {/* Goal line */}
      <Line x1={PAD.left} y1={goalY} x2={chartW - PAD.right} y2={goalY} stroke={ACCENT} strokeWidth={1.5} strokeDasharray="4,3" />
      <SvgText x={(chartW - PAD.right + 2).toFixed(1)} y={(parseFloat(goalY) + 4).toFixed(1)} fill={ACCENT} fontSize={8}>Goal</SvgText>

      {/* Bars */}
      {data.map((d, i) => {
        const x = toX(i);
        const barH = Math.max(1, plotH - (toY(d.calories) - PAD.top));
        const barY = PAD.top + plotH - barH;
        const over = d.calories > goal;
        return (
          <Rect
            key={i}
            x={(x - barW / 2).toFixed(1)}
            y={barY.toFixed(1)}
            width={barW.toFixed(1)}
            height={barH.toFixed(1)}
            fill={over ? '#E05555' : '#4CAF7F'}
            fillOpacity={0.85}
            rx={2}
          />
        );
      })}

      {/* X labels */}
      {data.filter((_, i) => i % step === 0 || i === data.length - 1).map((d, i) => {
        const idx = data.indexOf(d);
        return (
          <SvgText key={i} x={toX(idx).toFixed(1)} y={(chartH - 4).toFixed(1)} textAnchor="middle" fill={DIM} fontSize={9}>
            {formatXLabel(d.date, days)}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ── Weight line chart ─────────────────────────────────────────────────────────

function WeightChart({ data, days }) {
  const screenWidth = Dimensions.get('window').width;
  const chartW = screenWidth - 64;
  const chartH = 200;
  const PAD = { top: 16, right: 16, bottom: 36, left: 46 };
  const plotW = chartW - PAD.left - PAD.right;
  const plotH = chartH - PAD.top - PAD.bottom;

  const weights = data.map((d) => d.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const spread = maxW === minW ? 2 : maxW - minW;
  const yMin = minW - spread * 0.2;
  const yMax = maxW + spread * 0.2;
  const yRange = yMax - yMin;

  const toX = (i) => PAD.left + (i / Math.max(data.length - 1, 1)) * plotW;
  const toY = (w) => PAD.top + (1 - (w - yMin) / yRange) * plotH;
  const pts = data.map((d, i) => ({ x: toX(i), y: toY(d.weight), ...d }));

  let linePath = '';
  pts.forEach((p, i) => {
    if (i === 0) { linePath += `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }
    else {
      const prev = pts[i - 1];
      const cpX  = ((prev.x + p.x) / 2).toFixed(1);
      linePath  += ` C ${cpX} ${prev.y.toFixed(1)}, ${cpX} ${p.y.toFixed(1)}, ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }
  });

  const bottomY = (PAD.top + plotH).toFixed(1);
  const fillPath = `${linePath} L ${pts[pts.length-1].x.toFixed(1)} ${bottomY} L ${PAD.left} ${bottomY} Z`;

  const gridCount = 4;
  const yGrid = Array.from({ length: gridCount }, (_, i) => {
    const frac = i / (gridCount - 1);
    return { y: PAD.top + frac * plotH, label: (yMax - frac * yRange).toFixed(1) };
  });

  const maxLabels = 5;
  const step = Math.max(1, Math.ceil(data.length / maxLabels));
  const xLabels = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);

  return (
    <Svg width={chartW} height={chartH}>
      {yGrid.map((gl, i) => (
        <SvgG key={i}>
          <Line x1={PAD.left} y1={gl.y.toFixed(1)} x2={chartW-PAD.right} y2={gl.y.toFixed(1)} stroke={SURF} strokeWidth={1} />
          <SvgText x={(PAD.left-6).toFixed(1)} y={(gl.y+4).toFixed(1)} textAnchor="end" fill={DIM} fontSize={9}>{gl.label}</SvgText>
        </SvgG>
      ))}
      <Path d={fillPath} fill={ACCENT} fillOpacity={0.14} />
      <Path d={linePath} stroke={TEXT} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <Circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={3.5} fill={ACCENT} stroke={TEXT} strokeWidth={1} />)}
      {xLabels.map((p, i) => (
        <SvgText key={i} x={p.x.toFixed(1)} y={(chartH-4).toFixed(1)} textAnchor="middle" fill={DIM} fontSize={9}>
          {formatXLabel(p.date, days)}
        </SvgText>
      ))}
    </Svg>
  );
}

// ── Macro Breakdown Chart ──────────────────────────────────────────────────────

function MacroChart({ data }) {
  const screenWidth = Dimensions.get('window').width;
  const chartW = screenWidth - 32;
  const chartH = 36;
  
  const avgP = data.length ? data.reduce((s, d) => s + (d.protein||0), 0) / data.length : 0;
  const avgC = data.length ? data.reduce((s, d) => s + (d.carbs||0), 0) / data.length : 0;
  const avgF = data.length ? data.reduce((s, d) => s + (d.fat||0), 0) / data.length : 0;
  const total = avgP + avgC + avgF || 1;
  
  const pctP = avgP / total;
  const pctC = avgC / total;
  const pctF = avgF / total;

  return (
    <View style={{ width: '100%', alignItems: 'center' }}>
      <Svg width={chartW} height={chartH} style={{ borderRadius: 18, overflow: 'hidden' }}>
        <Rect x={0} y={0} width={(chartW * pctP).toFixed(1)} height={chartH} fill="#E05555" />
        <Rect x={(chartW * pctP).toFixed(1)} y={0} width={(chartW * pctC).toFixed(1)} height={chartH} fill="#4CAF7F" />
        <Rect x={(chartW * (pctP + pctC)).toFixed(1)} y={0} width={(chartW * pctF).toFixed(1)} height={chartH} fill="#E8B042" />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 12, paddingHorizontal: 8 }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: '#E05555', fontSize: 14, fontWeight: '700' }}>{Math.round(avgP)}g</Text>
          <Text style={{ color: DIM, fontSize: 10, textTransform: 'uppercase', marginTop: 2 }}>Protein</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: '#4CAF7F', fontSize: 14, fontWeight: '700' }}>{Math.round(avgC)}g</Text>
          <Text style={{ color: DIM, fontSize: 10, textTransform: 'uppercase', marginTop: 2 }}>Carbs</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: '#E8B042', fontSize: 14, fontWeight: '700' }}>{Math.round(avgF)}g</Text>
          <Text style={{ color: DIM, fontSize: 10, textTransform: 'uppercase', marginTop: 2 }}>Fat</Text>
        </View>
      </View>
    </View>
  );
}

// ── Period selector ───────────────────────────────────────────────────────────

function PeriodPicker({ periods, selected, onSelect }) {
  return (
    <View style={s.periodRow}>
      {periods.map((p) => (
        <TouchableOpacity key={p.label} style={[s.periodBtn, selected===p.days && s.periodBtnActive]} onPress={() => onSelect(p.days)}>
          <Text style={[s.periodText, selected===p.days && s.periodTextActive]}>{p.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

async function exportCSV() {
  try {
    const [foodLogs, weightLogs] = await Promise.all([getAllFoodLogs(), getWeightLogs(3650)]);
    const today = new Date().toISOString().split('T')[0];
    const csvField = (v) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s; };
    let csv = 'FOOD LOGS\nDate,Meal,Food,Calories,Protein (g),Carbs (g),Fat (g),Fiber (g)\n';
    foodLogs.forEach((l) => { csv += [l.date||(l.timestamp?.split('T')[0]||''), l.meal_type, csvField(l.food_name), l.calories, l.protein, l.carbs, l.fat, l.fiber??0].join(',') + '\n'; });
    csv += '\nWEIGHT LOGS\nDate,Weight (lbs)\n';
    weightLogs.forEach((w) => { csv += `${w.date},${w.weight}\n`; });
    const filename = `nutritrack-${today}.csv`;
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const file = new File([blob], filename, { type: 'text/csv' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'NutriTrack Export' }); }
      else { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
    }
  } catch (err) { if (err?.name !== 'AbortError') Alert.alert('Export failed', 'Could not export data.'); }
}

async function importCSV() {
  if (Platform.OS === 'web') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        let result;
        if (/\.xlsx$/i.test(file.name)) {
          const buf = await file.arrayBuffer();
          const { foodRows, weightRows } = parseMacroFactorWorkbook(buf, 'array');
          result = await importFromMacroFactor(foodRows, weightRows);
        } else {
          const text = await file.text();
          result = await importFromCSV(text);
        }
        Alert.alert('Import complete', `Imported ${result.food} food entries and ${result.weight} weight entries.`);
      } catch (err) { Alert.alert('Import failed', err.message || 'Could not parse file.'); }
    };
    input.click();
    return;
  }

  try {
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const { uri, name } = picked.assets[0];

    let result;
    if (/\.xlsx$/i.test(name)) {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const { foodRows, weightRows } = parseMacroFactorWorkbook(base64, 'base64');
      result = await importFromMacroFactor(foodRows, weightRows);
    } else {
      const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
      result = await importFromCSV(text);
    }
    Alert.alert('Import complete', `Imported ${result.food} food entries and ${result.weight} weight entries.`);
  } catch (err) { Alert.alert('Import failed', err.message || 'Could not parse file.'); }
}

export default function DataScreen() {
  const [calPeriod,    setCalPeriod]    = useState(30);
  const [weightPeriod, setWeightPeriod] = useState(30);
  const [calData,      setCalData]      = useState([]);
  const [weightData,   setWeightData]   = useState([]);
  const [goals,        setGoals]        = useState({ calories: 2000 });

  const load = useCallback(async () => {
    try {
      const [c, w, g] = await Promise.all([
        getDailyCalorieTotals(180),
        getWeightLogs(365),
        getGoals(),
      ]);
      setCalData(c || []);
      setWeightData(w || []);
      if (g) setGoals(g);
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const since = (days) => {
    const d = new Date(); d.setDate(d.getDate() - days);
    return toLocalDateStr(d);
  };

  const filteredCal    = useMemo(() => calData.filter((d) => d.date >= since(calPeriod)),    [calData, calPeriod]);
  const filteredWeight = useMemo(() => weightData.filter((d) => d.date >= since(weightPeriod)), [weightData, weightPeriod]);

  const calAvg   = filteredCal.length ? Math.round(filteredCal.reduce((s, d) => s + d.calories, 0) / filteredCal.length) : null;
  const wLatest  = filteredWeight[filteredWeight.length - 1];
  const wOldest  = filteredWeight[0];
  const wChange  = wLatest && wOldest && wLatest.id !== wOldest.id ? wLatest.weight - wOldest.weight : null;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>

      {/* ── Calories ── */}
      <Text style={s.sectionTitle}>CALORIES</Text>
      <PeriodPicker periods={CAL_PERIODS} selected={calPeriod} onSelect={setCalPeriod} />

      {calAvg !== null && (
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statVal}>{calAvg}</Text>
            <Text style={s.statLbl}>avg kcal/day</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statVal, { color: calAvg > goals.calories ? '#E05555' : '#4CAF7F' }]}>
              {calAvg > goals.calories ? '+' : ''}{calAvg - goals.calories}
            </Text>
            <Text style={s.statLbl}>vs goal</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statVal}>{filteredCal.length}</Text>
            <Text style={s.statLbl}>days logged</Text>
          </View>
        </View>
      )}

      <View style={s.chartCard}>
        {filteredCal.length >= 2 ? (
          <CalorieChart data={filteredCal} goal={goals.calories} days={calPeriod} />
        ) : (
          <View style={s.chartEmpty}>
            <Text style={s.chartEmptyText}>Log food for a few days to see your calorie trend</Text>
          </View>
        )}
      </View>

      {filteredCal.length >= 2 && (
        <View style={s.legend}>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#4CAF7F' }]} /><Text style={s.legendText}>Under goal</Text></View>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#E05555' }]} /><Text style={s.legendText}>Over goal</Text></View>
        </View>
      )}

      {/* ── Macros ── */}
      <Text style={[s.sectionTitle, { marginTop: 24 }]}>AVERAGE MACROS</Text>
      <View style={s.chartCard}>
        {filteredCal.length > 0 ? (
          <MacroChart data={filteredCal} />
        ) : (
          <View style={s.chartEmpty}>
            <Text style={s.chartEmptyText}>Log food to see your macronutrient split</Text>
          </View>
        )}
      </View>

      {/* ── Weight ── */}
      <Text style={[s.sectionTitle, { marginTop: 24 }]}>WEIGHT</Text>
      <PeriodPicker periods={WEIGHT_PERIODS} selected={weightPeriod} onSelect={setWeightPeriod} />

      {wLatest && (
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statVal}>{wLatest.weight}</Text>
            <Text style={s.statLbl}>lbs now</Text>
          </View>
          {wChange !== null && (
            <View style={s.stat}>
              <Text style={[s.statVal, { color: wChange < 0 ? '#4CAF7F' : '#E05555' }]}>
                {wChange > 0 ? '+' : ''}{wChange.toFixed(1)}
              </Text>
              <Text style={s.statLbl}>this period</Text>
            </View>
          )}
          {filteredWeight.length > 0 && (
            <View style={s.stat}>
              <Text style={s.statVal}>{(filteredWeight.reduce((s,d)=>s+d.weight,0)/filteredWeight.length).toFixed(1)}</Text>
              <Text style={s.statLbl}>avg lbs</Text>
            </View>
          )}
        </View>
      )}

      <View style={s.chartCard}>
        {filteredWeight.length >= 2 ? (
          <WeightChart data={filteredWeight} days={weightPeriod} />
        ) : (
          <View style={s.chartEmpty}>
            <Text style={s.chartEmptyText}>
              {weightData.length === 0 ? 'Log your weight daily to see a chart' : 'Log more entries to see a chart for this period'}
            </Text>
          </View>
        )}
      </View>

      {/* ── Import / Export ── */}
      <Text style={[s.sectionTitle, { marginTop: 24 }]}>DATA</Text>
      <TouchableOpacity style={s.csvBtn} onPress={importCSV}>
        <Text style={s.csvBtnText}>Import CSV / MacroFactor Export</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.csvBtn, { marginTop: 8 }]} onPress={exportCSV}>
        <Text style={s.csvBtnText}>Export All Data as CSV</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content:   { padding: 16, paddingBottom: 48 },

  sectionTitle: { color: ACCENT, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 },

  periodRow:      { flexDirection: 'row', backgroundColor: CARD, borderRadius: 12, padding: 4, marginBottom: 12, gap: 4 },
  periodBtn:      { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  periodBtnActive:{ backgroundColor: ACCENT },
  periodText:     { color: DIM, fontSize: 12, fontWeight: '600' },
  periodTextActive:{ color: '#fff', fontWeight: '700' },

  statsRow: { flexDirection: 'row', backgroundColor: CARD, borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
  stat:     { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statVal:  { color: TEXT, fontSize: 20, fontWeight: '800' },
  statLbl:  { color: DIM, fontSize: 10, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.6 },

  chartCard:      { backgroundColor: CARD, borderRadius: 18, padding: 16, marginBottom: 10, alignItems: 'flex-start' },
  chartEmpty:     { alignItems: 'center', paddingVertical: 40, width: '100%' },
  chartEmptyText: { color: DIM, fontSize: 13, textAlign: 'center', lineHeight: 20 },

  legend:     { flexDirection: 'row', gap: 16, marginBottom: 4, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: DIM, fontSize: 11 },

  csvBtn:     { paddingVertical: 14, borderRadius: 14, backgroundColor: CARD, borderWidth: 1, borderColor: 'rgba(71,25,20,0.5)', alignItems: 'center' },
  csvBtnText: { color: TEXT, fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
});
