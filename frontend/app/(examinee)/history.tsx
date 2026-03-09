import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { examsService, ExamHistory } from '../../services/exams';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { Button } from '../../components/Button';
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryScreen() {
  const router = useRouter();
  const [history, setHistory] = useState<ExamHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await examsService.getMyHistory();
      setHistory(data);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const containerStyle =
    Platform.OS === 'web'
      ? { maxWidth: 720, width: '100%', alignSelf: 'center' as const }
      : {};

  if (isLoading) return <LoadingSpinner fullScreen />;

  // Stats
  const passedCount = history.filter((h) => h.passed).length;
  const avgScore =
    history.length > 0
      ? history.reduce((sum, h) => sum + h.percentage, 0) / history.length
      : 0;
  const bestScore =
    history.length > 0 ? Math.max(...history.map((h) => h.percentage)) : 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={containerStyle}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Exam History</Text>
          <Text style={styles.pageSubtitle}>
            {history.length} attempt{history.length !== 1 ? 's' : ''} total
          </Text>
        </View>

        {history.length > 0 && (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{passedCount}</Text>
              <Text style={styles.statLabel}>Passed</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: avgScore >= 85 ? colors.success : colors.warning }]}>
                {Math.round(avgScore)}%
              </Text>
              <Text style={styles.statLabel}>Average</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: bestScore >= 85 ? colors.success : colors.warning }]}>
                {Math.round(bestScore)}%
              </Text>
              <Text style={styles.statLabel}>Best Score</Text>
            </View>
          </View>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {history.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No exams yet</Text>
            <Text style={styles.emptySubtitle}>
              Take your first exam to see your results here
            </Text>
            <Button
              title="Start Exam"
              onPress={() => router.push('/(examinee)/exam')}
            />
          </View>
        ) : (
          <View style={styles.list}>
            {history.map((item, idx) => (
              <TouchableOpacity
                key={item.id}
                style={styles.historyCard}
                onPress={() =>
                  router.push({
                    pathname: '/(examinee)/result',
                    params: { resultId: String(item.id) },
                  })
                }
                activeOpacity={0.7}
              >
                <View style={styles.cardLeft}>
                  <View
                    style={[
                      styles.attemptBadge,
                      item.passed ? styles.attemptBadgePassed : styles.attemptBadgeFailed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.attemptBadgeText,
                        item.passed
                          ? styles.attemptBadgeTextPassed
                          : styles.attemptBadgeTextFailed,
                      ]}
                    >
                      {item.passed ? 'Passed' : 'Failed'}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.attemptDate}>{formatDate(item.completed_at)}</Text>
                    <Text style={styles.attemptTime}>{formatTime(item.completed_at)}</Text>
                    <Text style={styles.attemptScore}>
                      {item.total_score.toFixed(1)} / {item.max_score} pts
                    </Text>
                  </View>
                </View>
                <View style={styles.cardRight}>
                  <Text
                    style={[
                      styles.percentageText,
                      {
                        color:
                          item.percentage >= 85
                            ? colors.success
                            : item.percentage >= 70
                            ? colors.warning
                            : colors.error,
                      },
                    ]}
                  >
                    {Math.round(item.percentage)}%
                  </Text>
                  <Text style={styles.viewDetail}>View →</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  pageHeader: { marginBottom: spacing.lg },
  pageTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  pageSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  statItem: { flex: 1, alignItems: 'center', gap: spacing.xs },
  statDivider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
    marginBottom: spacing.md,
  },
  errorText: { fontSize: fontSize.sm, color: colors.error },
  list: { gap: spacing.sm },
  historyCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  attemptBadge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    minWidth: 60,
    alignItems: 'center',
  },
  attemptBadgePassed: { backgroundColor: '#F0FDF4' },
  attemptBadgeFailed: { backgroundColor: '#FEF2F2' },
  attemptBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  attemptBadgeTextPassed: { color: colors.success },
  attemptBadgeTextFailed: { color: colors.error },
  attemptDate: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text },
  attemptTime: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  attemptScore: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: spacing.xs },
  percentageText: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  viewDetail: { fontSize: fontSize.xs, color: colors.primary },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: fontSize.sm * 1.5,
  },
});
