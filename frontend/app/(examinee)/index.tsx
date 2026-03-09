import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthContext } from '../../context/AuthContext';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { examsService, EligibilityResponse, ExamHistory } from '../../services/exams';
import { flashcardsService } from '../../services/flashcards';
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ExamineeDashboard() {
  const { user } = useAuthContext();
  const router = useRouter();

  const [eligibility, setEligibility] = useState<EligibilityResponse | null>(null);
  const [recentHistory, setRecentHistory] = useState<ExamHistory[]>([]);
  const [dueCardCount, setDueCardCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [elig, hist, studyCards] = await Promise.allSettled([
      examsService.checkEligibility(),
      examsService.getMyHistory(),
      flashcardsService.getStudyCards(),
    ]);

    setEligibility(elig.status === 'fulfilled' ? elig.value : { eligible: true });
    setRecentHistory(
      hist.status === 'fulfilled' ? hist.value.slice(0, 3) : []
    );
    setDueCardCount(
      studyCards.status === 'fulfilled' ? studyCards.value.length : 0
    );
    setIsLoading(false);
    setRefreshing(false);
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
      ? { maxWidth: 800, width: '100%', alignSelf: 'center' as const }
      : {};

  if (isLoading) return <LoadingSpinner fullScreen />;

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={containerStyle}>
        {/* Welcome */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeGreeting}>Hello, {firstName}!</Text>
          <Text style={styles.welcomeSubtitle}>
            Ready to test your knowledge?
          </Text>
        </View>

        {/* Exam Card */}
        <Card style={styles.actionCard} elevated>
          <View style={styles.actionCardContent}>
            <View style={styles.actionIconBg}>
              <Text style={styles.actionIcon}>📝</Text>
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Take an Exam</Text>
              {eligibility?.eligible ? (
                <Text style={styles.actionDesc}>
                  10 AI-graded questions. Show what you know!
                </Text>
              ) : (
                <Text style={[styles.actionDesc, { color: colors.warning }]}>
                  {eligibility?.days_until_next_attempt
                    ? `Next attempt available in ${eligibility.days_until_next_attempt} day${eligibility.days_until_next_attempt !== 1 ? 's' : ''}`
                    : eligibility?.message || 'Currently in cooldown period'}
                </Text>
              )}
            </View>
          </View>
          <Button
            title={eligibility?.eligible ? 'Start Exam' : 'Cooldown Active'}
            onPress={() => router.push('/(examinee)/exam')}
            disabled={!eligibility?.eligible}
            fullWidth
            size="lg"
            style={styles.actionBtn}
          />
        </Card>

        {/* Study Card */}
        <Card style={styles.actionCard} elevated>
          <View style={styles.actionCardContent}>
            <View style={[styles.actionIconBg, { backgroundColor: '#F0FDF4' }]}>
              <Text style={styles.actionIcon}>🃏</Text>
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Study Flash Cards</Text>
              <Text style={styles.actionDesc}>
                {dueCardCount > 0
                  ? `${dueCardCount} card${dueCardCount !== 1 ? 's' : ''} due for review`
                  : 'No cards due right now — check back later'}
              </Text>
            </View>
          </View>
          <Button
            title={
              dueCardCount > 0
                ? `Study ${dueCardCount} Card${dueCardCount !== 1 ? 's' : ''}`
                : 'Browse All Cards'
            }
            onPress={() => router.push('/(examinee)/study')}
            variant={dueCardCount > 0 ? 'primary' : 'outline'}
            fullWidth
            size="lg"
            style={styles.actionBtn}
          />
        </Card>

        {/* Recent history */}
        {recentHistory.length > 0 && (
          <View style={styles.historySection}>
            <View style={styles.historyHeader}>
              <Text style={styles.sectionTitle}>Recent Exams</Text>
              <Button
                title="View All"
                onPress={() => router.push('/(examinee)/history')}
                variant="ghost"
                size="sm"
              />
            </View>
            <View style={styles.historyList}>
              {recentHistory.map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <View>
                    <Text style={styles.historyDate}>{formatDate(item.completed_at)}</Text>
                    <Text style={styles.historyScore}>
                      {item.total_score.toFixed(1)} / {item.max_score} points
                    </Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text
                      style={[
                        styles.historyPercent,
                        {
                          color:
                            item.percentage >= 85
                              ? colors.success
                              : colors.error,
                        },
                      ]}
                    >
                      {Math.round(item.percentage)}%
                    </Text>
                    <View
                      style={[
                        styles.historyBadge,
                        item.passed
                          ? styles.historyBadgePassed
                          : styles.historyBadgeFailed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.historyBadgeText,
                          item.passed
                            ? styles.historyBadgeTextPassed
                            : styles.historyBadgeTextFailed,
                        ]}
                      >
                        {item.passed ? 'Passed' : 'Failed'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  welcomeSection: { marginBottom: spacing.xl },
  welcomeGreeting: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  welcomeSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  actionCard: {
    marginBottom: spacing.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  actionCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  actionIconBg: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: { fontSize: 24 },
  actionText: { flex: 1, gap: spacing.xs },
  actionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  actionDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: fontSize.sm * 1.5,
  },
  actionBtn: { marginTop: spacing.xs },
  historySection: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  historyList: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyDate: { fontSize: fontSize.sm, color: colors.textSecondary },
  historyScore: { fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium, marginTop: 2 },
  historyRight: { alignItems: 'flex-end', gap: spacing.xs },
  historyPercent: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  historyBadge: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
  },
  historyBadgePassed: { backgroundColor: '#F0FDF4' },
  historyBadgeFailed: { backgroundColor: '#FEF2F2' },
  historyBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  historyBadgeTextPassed: { color: colors.success },
  historyBadgeTextFailed: { color: colors.error },
});
