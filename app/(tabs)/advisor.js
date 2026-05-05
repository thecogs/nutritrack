import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getAdvice } from '../../services/api';
import { getTodayLogs, getGoals } from '../../services/db';

const G    = '#471914';
const BG   = '#070F05';
const CARD = '#0D1B0B';
const SURF = '#172519';
const TEXT = '#B6A8A2';

const SUGGESTIONS = [
  "How am I doing today?",
  "What should I eat for dinner?",
  "Am I hitting my protein goal?",
  "Suggest a high-protein snack",
];

export default function AdvisorScreen() {
  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [todayLog,   setTodayLog]   = useState([]);
  const [userGoals,  setUserGoals]  = useState(null);
  const listRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([getTodayLogs(), getGoals()])
        .then(([logs, goals]) => { setTodayLog(logs || []); setUserGoals(goals); })
        .catch(() => {});
    }, [])
  );

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    const userMessage  = { role: 'user', content: msg };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const apiMessages = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      const { reply } = await getAdvice(apiMessages, userGoals, todayLog);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Couldn't connect. Make sure the server is running." },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const renderItem = ({ item }) => (
    <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.aiBubble]}>
      {item.role === 'assistant' && <Text style={styles.aiLabel}>NutriTrack Advisor</Text>}
      <Text style={[styles.bubbleText, item.role === 'user' && styles.userText]}>
        {item.content}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {messages.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>NutriTrack Advisor</Text>
          <Text style={styles.emptySubtitle}>Ask me anything about your nutrition goals</Text>
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((s) => (
              <TouchableOpacity key={s} style={styles.suggestionBtn} onPress={() => send(s)}>
                <Text style={styles.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          onScrollBeginDrag={Keyboard.dismiss}
          keyboardDismissMode="on-drag"
        />
      )}

      {loading && (
        <View style={styles.typingRow}>
          <ActivityIndicator size="small" color={G} />
          <Text style={styles.typingText}>Advisor is thinking…</Text>
        </View>
      )}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about your nutrition…"
          placeholderTextColor="#404060"
          multiline
          returnKeyType="send"
          onSubmitEditing={() => send()}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
          onPress={() => send()}
          disabled={!input.trim() || loading}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  empty:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle:    { color: TEXT, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: '#8888A0', fontSize: 15, textAlign: 'center', marginBottom: 28 },
  suggestions:   { width: '100%', gap: 10 },
  suggestionBtn: { backgroundColor: CARD, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18 },
  suggestionText: { color: '#8888A0', fontSize: 14 },

  list: { padding: 16, paddingBottom: 8 },

  bubble: { maxWidth: '80%', borderRadius: 18, padding: 14, marginBottom: 10 },
  userBubble: { backgroundColor: G, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  aiBubble:   { backgroundColor: CARD, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  aiLabel:    { color: G, fontSize: 11, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 },
  bubbleText: { color: TEXT, fontSize: 15, lineHeight: 22 },
  userText:   { color: '#fff' },

  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 8 },
  typingText: { color: '#606080', fontSize: 13 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: 12, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.05)',
    backgroundColor: BG,
  },
  input: {
    flex: 1, backgroundColor: CARD, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    color: TEXT, fontSize: 15, maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: G,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  sendBtnDisabled: { backgroundColor: SURF },
  sendBtnText:     { color: '#fff', fontSize: 20, fontWeight: '700' },
});
