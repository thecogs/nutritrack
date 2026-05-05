import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../services/supabase';

export default function RootLayout() {
  const isWeb = Platform.OS === 'web';
  // undefined = still loading (web only); null = no session; object = signed in
  const [session, setSession] = useState(isWeb ? undefined : null);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!isWeb) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!isWeb) return;

    const inSignIn = segments[0] === 'sign-in';
    if (!session && !inSignIn) {
      router.replace('/sign-in');
    } else if (session && inSignIn) {
      router.replace('/');
    }
  }, [session, segments]);

  if (session === undefined) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
