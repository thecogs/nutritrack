import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Dimensions, Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import Svg, { Path, Line, Circle, Text as SvgText, G } from 'react-native-svg';
import { logWeight, getWeightLogs, deleteWeight } from '../../services/db';

const ACCENT = '#471914';
const BG     = '#070F05';
const CARD   = '#0D1B0B';
const SURF   = '#172519';
const TEXT   = '#B6A8A2';
const DIM    = '#5A5248';

const PERIODS = [
  { label: '1W', days: 7  },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

function toLocalDateStr(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString().split('T')[0];
}

function formatEntryDate(dateStr) {
  const today = toLocalDateStr();
  if (dateStr === today) return 'Today';
  const prev = new Date(); prev.setDate(prev.getDate() - 1);
  if (dateStr === toLocalDateStr(prev)) return 'Yesterday';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatXLabel(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  if (days <= 7)  return d.toLocaleDateString('en-US', { weekday: 'short' });
  if (days <= 90) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function WeightChart({ data, days }) {
  const screenWidth = Dimensions.get('window').width;
  const chartW = screenWidth - 64; // 16 outer + 16 card padding each side
  const chartH = 210;
  const PAD = { top: 16, right: 16, bottom: 38, left: 46 };
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

  // Smooth cubic bezier path
  let linePath = '';
  pts.forEach((p, i) => {
    if (i === 0) {
      linePath += `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    } else {
      const prev = pts[i - 1];
      const cpX  = ((prev.x + p.x) / 2).toFixed(1);
      linePath  += ` C ${cpX} ${prev.y.toFixed(1)}, ${cpX} ${p.y.toFixed(1)}, ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }
  });

  const bottomY = (PAD.top + plotH).toFixed(1);
  const fillPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${bottomY} L ${PAD.left} ${bottomY} Z`;

  // Y grid lines
  const gridCount = 4;
  const yGrid = Array.from({ length: gridCount }, (_, i) => {
    const frac = i / (gridCount - 1);
    return { y: PAD.top + frac * plotH, label: (yMax - frac * yRange).toFixed(1) };
  });

  // X labels — pick up to 5 evenly spaced
  const maxLabels = 5;
  const step = Math.max(1, Math.ceil(data.length / maxLabels));
  const xLabels = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);

  return (
    <Svg width={chartW} height={chartH}>
      {/* Grid */}
      {yGrid.map((gl, i) => (
        <G key={i}>
          <Line
            x1={PAD.left} y1={gl.y.toFixed(1)}
            x2={chartW - PAD.right} y2={gl.y.toFixed(1)}
            stroke={SURF} strokeWidth={1}
          />
          <SvgText
            x={(PAD.left - 6).toFixed(1)} y={(gl.y + 4).toFixed(1)}
            textAnchor="end" fill={DIM} fontSize={9}
          >
            {gl.label}
          </SvgText>
        </G>
      ))}

      {/* Fill */}
      <Path d={fillPath} fill={ACCENT} fillOpacity={0.14} />

      {/* Line */}
      <Path d={linePath} stroke={TEXT} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />

      {/* Dots */}
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={3.5} fill={ACCENT} stroke={TEXT} strokeWidth={1} />
      ))}

      {/* X labels */}
      {xLabels.map((p, i) => (
        <SvgText key={i} x={p.x.toFixed(1)} y={(chartH - 4).toFixed(1)} textAnchor="middle" fill={DIM} fontSize={9}>
          {formatXLabel(p.date, days)}
        </SvgText>
      ))}
    </Svg>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function WeightScreen() {
  const [allLogs,    setAllLogs]    = useState([]);
  const [input,      setInput]      = useState('');
  const [saving,     setSaving]     = useState(false);
  const [period,     setPeriod]     = useState(30);

  const today = toLocalDateStr();

  const load = useCallback(async () => {
    try {
      const data = await getWeightLogs(365);
      setAllLogs(data || []);
      const todayEntry = (data || []).find((d) => d.date === today);
      if (todayEntry) setInput(String(todayEntry.weight));
    } catch {}
  }, [today]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleLog = async () => {
    const w = parseFloat(input);
    if (!w || w <= 0 || w > 1500) {
      Alert.alert('Invalid weight', 'Enter a weight in lbs (e.g. 175.5)');
      return;
    }
    setSaving(true);
    try {
      await logWeight(w, today);
      await load();
    } catch {
      Alert.alert('Error', 'Failed to save weight.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (Platform.OS === 'web') {
      const wasToday = allLogs.find((l) => l.id === id)?.date === today;
      await deleteWeight(id);
      await load();
      if (wasToday) setInput('');
      return;
    }
    Alert.alert('Remove entry?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
          await deleteWeight(id);
          await load();
          if (allLogs.find((l) => l.id === id)?.date === today) setInput('');
        }
      },
    ]);
  };

  // Filter by selected period
  const since = new Date();
  since.setDate(since.getDate() - period);
  const sinceStr = toLocalDateStr(since);
  const chartData = useMemo(
    () => allLogs.filter((l) => l.date >= sinceStr),
    [allLogs, sinceStr]
  );

  const latest  = allLogs[allLogs.length - 1];
  const oldest  = chartData[0];
  const change  = latest && oldest && latest.id !== oldest.id
    ? latest.weight - oldest.weight : null;
  const avg     = chartData.length
    ? chartData.reduce((s, d) => s + d.weight, 0) / chartData.length : null;

  const todayLogged = allLogs.some((l) => l.date === today);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} keyboardDismissMode="on-drag">

      {/* Weight entry card */}
      <View style={s.card}>
        <Text style={s.cardLabel}>TODAY'S WEIGHT</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.weightInput}
            value={input}
            onChangeText={setInput}
            keyboardType="decimal-pad"
            placeholder="0.0"
            placeholderTextColor={DIM}
            selectTextOnFocus
          />
          <Text style={s.unit}>lbs</Text>
          <TouchableOpacity style={s.logBtn} onPress={handleLog} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.logBtnText}>{todayLogged ? 'Update' : 'Log'}</Text>
            }
          </TouchableOpacity>
        </View>
        {todayLogged && (
          <Text style={s.loggedNote}>✓ Logged today</Text>
        )}
      </View>

      {/* Period picker */}
      <View style={s.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.label}
            style={[s.periodBtn, period === p.days && s.periodBtnActive]}
            onPress={() => setPeriod(p.days)}
          >
            <Text style={[s.periodText, period === p.days && s.periodTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stats strip */}
      {latest && (
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statVal}>{latest.weight}</Text>
            <Text style={s.statLbl}>lbs now</Text>
          </View>
          {change !== null && (
            <View style={s.stat}>
              <Text style={[s.statVal, { color: change < 0 ? '#4CAF7F' : '#E05555' }]}>
                {change > 0 ? '+' : ''}{change.toFixed(1)}
              </Text>
              <Text style={s.statLbl}>this period</Text>
            </View>
          )}
          {avg !== null && (
            <View style={s.stat}>
              <Text style={s.statVal}>{avg.toFixed(1)}</Text>
              <Text style={s.statLbl}>avg lbs</Text>
            </View>
          )}
        </View>
      )}

      {/* Chart */}
      <View style={s.chartCard}>
        {chartData.length >= 2 ? (
          <WeightChart data={chartData} days={period} />
        ) : (
          <View style={s.chartEmpty}>
            <Text style={s.chartEmptyText}>
              {allLogs.length === 0
                ? 'Log your weight daily to see a chart'
                : 'Log a few more entries to see a chart'}
            </Text>
          </View>
        )}
      </View>

      {/* History */}
      {allLogs.length > 0 && (
        <>
          <Text style={s.sectionTitle}>HISTORY</Text>
          {[...allLogs].reverse().slice(0, 30).map((entry) => (
            <View key={entry.id} style={s.entryRow}>
              <Text style={s.entryDate}>{formatEntryDate(entry.date)}</Text>
              <Text style={s.entryWeight}>{entry.weight} lbs</Text>
              <TouchableOpacity onPress={() => handleDelete(entry.id)} style={s.deleteBtn}>
                <Text style={s.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      {allLogs.length === 0 && (
        <View style={s.emptyState}>
          <Text style={s.emptyTitle}>No weight logged yet</Text>
          <Text style={s.emptySub}>Enter your weight above and tap Log to get started.</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content:   { padding: 16, paddingBottom: 48 },

  card:      { backgroundColor: CARD, borderRadius: 18, padding: 18, marginBottom: 14 },
  cardLabel: { color: DIM, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 },

  inputRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weightInput: {
    flex: 1, color: TEXT, fontSize: 34, fontWeight: '800',
    backgroundColor: BG, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  unit:   { color: DIM, fontSize: 16, fontWeight: '600' },
  logBtn: {
    backgroundColor: ACCENT, paddingHorizontal: 22, paddingVertical: 12,
    borderRadius: 12, minWidth: 72, alignItems: 'center',
  },
  logBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  loggedNote:  { color: '#4CAF7F', fontSize: 12, marginTop: 10 },

  periodRow:      { flexDirection: 'row', backgroundColor: CARD, borderRadius: 12, padding: 4, marginBottom: 12, gap: 4 },
  periodBtn:      { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  periodBtnActive:{ backgroundColor: ACCENT },
  periodText:     { color: DIM, fontSize: 12, fontWeight: '600' },
  periodTextActive:{ color: '#fff', fontWeight: '700' },

  statsRow: { flexDirection: 'row', backgroundColor: CARD, borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
  stat:     { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statVal:  { color: TEXT, fontSize: 20, fontWeight: '800' },
  statLbl:  { color: DIM, fontSize: 10, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.6 },

  chartCard:      { backgroundColor: CARD, borderRadius: 18, padding: 16, marginBottom: 20, alignItems: 'flex-start' },
  chartEmpty:     { alignItems: 'center', paddingVertical: 48, width: '100%' },
  chartEmptyText: { color: DIM, fontSize: 13, textAlign: 'center', lineHeight: 20 },

  sectionTitle: {
    color: ACCENT, fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10,
  },
  entryRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 12, padding: 14, marginBottom: 8 },
  entryDate:    { flex: 1, color: TEXT, fontSize: 14, fontWeight: '600' },
  entryWeight:  { color: TEXT, fontSize: 14, fontWeight: '700', marginRight: 12 },
  deleteBtn:    { width: 26, height: 26, borderRadius: 13, backgroundColor: SURF, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText:{ color: '#E05555', fontSize: 11, fontWeight: '700' },

  emptyState: { alignItems: 'center', marginTop: 32 },
  emptyTitle: { color: TEXT, fontSize: 17, fontWeight: '700', marginBottom: 8 },
  emptySub:   { color: DIM, fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
