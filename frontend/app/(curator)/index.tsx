import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthContext } from '../../context/AuthContext';
import { Card } from '../../components/Card';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { questionsService } from '../../services/questions';
import { flashcardsService } from '../../services/flashcards';
import { examsService } from '../../services/exams';
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

interface Stats {
  totalQuestions: number;
  totalFlashcards: number;
  totalResults: number;
}

const STAT_CONFIG = [
  { key: 'totalQuestions', label: 'Questions', icon: 'help-circle' as const, color: '#0891B2' },
  { key: 'totalFlashcards', label: 'Flash Cards', icon: 'layers' as const, color: colors.success },
  { key: 'totalResults', label: 'Exam Results', icon: 'bar-chart' as const, color: colors.warning },
];

export default function CuratorDashboard() {
  const { user } = useAuthContext();

  const [stats, setStats] = useState<Stats>({
    totalQuestions: 0,
    totalFlashcards: 0,
    totalResults: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const [questions, flashcards, results] = await Promise.allSettled([
        questionsService.getAll(),
        flashcardsService.getAll(),
        examsService.getAllResults(),
      ]);
      setStats({
        totalQuestions: questions.status === 'fulfilled' ? questions.value.length : 0,
        totalFlashcards: flashcards.status === 'fulfilled' ? flashcards.value.length : 0,
        totalResults: results.status === 'fulfilled' ? results.value.length : 0,
      });
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const onRefresh = () => { setRefreshing(true); loadStats(); };

  const containerStyle = Platform.OS === 'web'
    ? { maxWidth: 1200, width: '100%', alignSelf: 'center' as const }
    : {};

  if (isLoading) return <LoadingSpinner fullScreen />;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={containerStyle}>
        <View style={styles.pageHeader}>
          <Text style={styles.greeting}>
            Welcome back, {user?.name || user?.email?.split('@')[0]}
          </Text>
          <Text style={styles.subtitle}>Here's an overview of your learning platform</Text>
        </View>

        <View style={styles.statsGrid}>
          {STAT_CONFIG.map((cfg) => (
            <Card key={cfg.key} style={styles.statCard} elevated>
              <View style={[styles.statIconBg, { backgroundColor: cfg.color + '18' }]}>
                <Ionicons name={cfg.icon} size={22} color={cfg.color} />
              </View>
              <Text style={[styles.statValue, { color: cfg.color }]}>
                {stats[cfg.key as keyof Stats]}
              </Text>
              <Text style={styles.statLabel}>{cfg.label}</Text>
            </Card>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  pageHeader: { marginBottom: spacing.xl },
  greeting: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statCard: { flex: 1, minWidth: 140, padding: spacing.md, gap: spacing.sm },
  statIconBg: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, lineHeight: fontSize.xxl + 4 },
  statLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium },
});
