import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { signInWithGoogle, signInWithGitHub } from '../services/supabase';

export default function SignInScreen() {
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);

  async function handleSignIn(provider) {
    setLoading(provider);
    setError(null);
    try {
      if (provider === 'google') await signInWithGoogle();
      else await signInWithGitHub();
    } catch (e) {
      setError(e.message);
      setLoading(null);
    }
  }

  return (
    <View style={s.container}>
      <View style={s.card}>
        <Text style={s.logo}>🥗</Text>
        <Text style={s.title}>NutriTrack</Text>
        <Text style={s.subtitle}>Sign in to sync your data across any device</Text>

        <Pressable
          style={[s.btn, s.googleBtn]}
          onPress={() => handleSignIn('google')}
          disabled={!!loading}
        >
          {loading === 'google'
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Continue with Google</Text>}
        </Pressable>

        <Pressable
          style={[s.btn, s.githubBtn]}
          onPress={() => handleSignIn('github')}
          disabled={!!loading}
        >
          {loading === 'github'
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Continue with GitHub</Text>}
        </Pressable>

        {error && <Text style={s.error}>{error}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070F05',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0D1B0B',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
  },
  logo: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#B6A8A2',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#5A5248',
    textAlign: 'center',
    marginBottom: 36,
    lineHeight: 20,
  },
  btn: {
    width: '100%',
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  googleBtn: {
    backgroundColor: '#471914',
  },
  githubBtn: {
    backgroundColor: '#172519',
    borderWidth: 1,
    borderColor: '#2a3d28',
  },
  btnText: {
    color: '#B6A8A2',
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    marginTop: 12,
    color: '#c0392b',
    fontSize: 13,
    textAlign: 'center',
  },
});
