import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';

const BG    = '#070F05';
const CARD  = '#0D1B0B';
const GREEN = '#471914';
const DIM   = '#5A5248';

function TabIcon({ name, focused }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons name={name} size={22} color={focused ? GREEN : DIM} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   GREEN,
        tabBarInactiveTintColor: DIM,
        tabBarStyle: {
          backgroundColor: CARD,
          borderTopColor: 'rgba(255,255,255,0.05)',
          borderTopWidth: 0.5,
          height: 64,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
        headerStyle:         { backgroundColor: BG, shadowOpacity: 0, elevation: 0 },
        headerTintColor:     '#B6A8A2',
        headerTitleStyle:    { fontWeight: '700', fontSize: 17, letterSpacing: 0.2 },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Log',
          tabBarIcon: ({ focused }) => <TabIcon name="nutrition" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ focused }) => <TabIcon name="calendar-outline" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="aitrack"
        options={{
          title: 'AI Track',
          tabBarIcon: ({ focused }) => <TabIcon name="scan-outline" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="data"
        options={{
          title: 'Data',
          tabBarIcon: ({ focused }) => <TabIcon name="bar-chart-outline" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: 'Goals',
          tabBarIcon: ({ focused }) => <TabIcon name="trophy-outline" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="advisor"
        options={{
          title: 'Advisor',
          tabBarIcon: ({ focused }) => <TabIcon name="chatbubbles-outline" focused={focused} />,
        }}
      />

      {/* Hidden legacy tabs — functionality moved into new tabs */}
      <Tabs.Screen name="scan"   options={{ href: null }} />
      <Tabs.Screen name="camera" options={{ href: null }} />
      <Tabs.Screen name="weight" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 36, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(71,25,20,0.35)',
  },
});
