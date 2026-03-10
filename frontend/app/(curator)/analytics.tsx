import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  RefreshControl,
} from 'react-native';
import { analyticsService, AnalyticsOverview, QuestionStat, ExamineeStat } from '../../services/analytics';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function FailBar({ rate }: { rate: number }) {
  const pct = Math.min(100, Math.max(0, rate));
  const color = pct >= 70 ? colors.error : pct >= 40 ? colors.warning : '#16a34a';
  return (
    <View style={styles.failBarTrack}>
      <View style={[styles.failBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}

function typeBadge(type: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    mcq:        { label: 'MCQ',   color: colors.primary, bg: '#EFF6FF' },
    true_false: { label: 'T/F',   color: '#c2410c',      bg: '#FFF7ED' },
    short:      { label: 'Short', color: '#7c3aed',       bg: '#F5F3FF' },
    open:       { label: 'Open',  color: colors.textSecondary, bg: colors.surface },
  };
  const t = map[type] || map.open;
  return (
    <View style={[styles.typeBadge, { backgroundColor: t.bg }]}>
      <Text style={[styles.typeBadgeText, { color: t.color }]}>{t.label}</Text>
    </View>
  );
}

export default function AnalyticsScreen() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [questions, setQuestions] = useState<QuestionStat[]>([]);
  const [examinees, setExaminees] = useState<ExamineeStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [ov, qs, ex] = await Promise.all([
        analyticsService.getOverview(),
        analyticsService.getQuestions(),
        analyticsService.getExaminees(),
      ]);
      setOverview(ov);
      setQuestions(qs);
      setExaminees(ex);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const containerStyle = Platform.OS === 'web'
    ? { maxWidth: 1200, width: '100%', alignSelf: 'center' as const }
    : {};

  if (isLoading) return <LoadingSpinner fullScreen />;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <View style={containerStyle}>
        <Text style={styles.pageTitle}>Analytics</Text>

        {error ? (
          <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
        ) : null}

        {/* Overview cards */}
        {overview && (
          <View style={styles.statsGrid}>
            <StatCard label="Total Examinees" value={String(overview.total_examinees)} />
            <StatCard label="Total Attempts" value={String(overview.total_attempts)} sub={`${overview.attempts_this_week} this week`} />
            <StatCard
              label="Pass Rate"
              value={`${overview.pass_rate}%`}
              color={overview.pass_rate >= 70 ? '#16a34a' : overview.pass_rate >= 50 ? colors.warning : colors.error}
            />
            <StatCard label="Avg Score" value={`${overview.avg_score}%`} />
          </View>
        )}

        {/* Hardest questions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hardest Questions</Text>
          <Text style={styles.sectionSub}>Sorted by fail rate (top 20)</Text>

          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 4 }]}>Question</Text>
              <Text style={styles.tableHeaderText}>Answered</Text>
              <Text style={styles.tableHeaderText}>Fail Rate</Text>
            </View>

            {questions.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No exam data yet</Text>
              </View>
            ) : (
              questions.map((q, i) => (
                <View key={q.question_id} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                  <View style={[styles.questionCell, { flex: 4 }]}>
                    {typeBadge(q.question_type)}
                    <Text style={styles.questionText} numberOfLines={2}>{q.question_text}</Text>
                  </View>
                  <Text style={styles.tableCell}>{q.total_answers}</Text>
                  <View style={styles.failCell}>
                    <Text style={[
                      styles.failPct,
                      { color: q.fail_rate >= 70 ? colors.error : q.fail_rate >= 40 ? colors.warning : '#16a34a' }
                    ]}>
                      {q.fail_rate}%
                    </Text>
                    <FailBar rate={q.fail_rate} />
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Examinees table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Examinees</Text>
          <Text style={styles.sectionSub}>{examinees.length} total</Text>

          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 3 }]}>Email</Text>
              <Text style={styles.tableHeaderText}>Attempts</Text>
              <Text style={styles.tableHeaderText}>Best Score</Text>
              <Text style={styles.tableHeaderText}>Status</Text>
            </View>

            {examinees.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No examinees yet</Text>
              </View>
            ) : (
              examinees.map((e, i) => (
                <View key={e.user_id} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                  <Text style={[styles.tableCell, { flex: 3 }]} numberOfLines={1}>{e.email}</Text>
                  <Text style={styles.tableCell}>{e.attempts}</Text>
                  <Text style={[
                    styles.tableCell,
                    { color: e.best_score >= 85 ? '#16a34a' : e.best_score >= 60 ? colors.warning : colors.error, fontWeight: fontWeight.semibold }
                  ]}>
                    {e.best_score}%
                  </Text>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: e.ever_passed ? '#F0FDF4' : '#FEF2F2' }
                  ]}>
                    <Text style={[
                      styles.statusText,
                      { color: e.ever_passed ? '#16a34a' : colors.error }
                    ]}>
                      {e.ever_passed ? 'Passed' : 'Not yet'}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  pageTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.lg },
  errorBox: { backgroundColor: '#FEE2E2', borderRadius: radius.md, padding: spacing.md, borderLeftWidth: 4, borderLeftColor: colors.error, marginBottom: spacing.lg },
  errorText: { fontSize: fontSize.sm, color: colors.error },

  // Stat cards
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 140,
    flex: 1,
    gap: 4,
  },
  statValue: { fontSize: 28, fontWeight: fontWeight.bold, color: colors.text },
  statLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium },
  statSub: { fontSize: fontSize.xs, color: colors.textMuted },

  // Sections
  section: { marginBottom: spacing.xl },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: 2 },
  sectionSub: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md },

  // Table
  tableCard: { backgroundColor: colors.background, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: colors.surface, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableHeaderText: { flex: 1, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableRowAlt: { backgroundColor: colors.surface },
  tableCell: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  questionCell: { gap: spacing.xs, paddingRight: spacing.sm },
  questionText: { fontSize: fontSize.sm, color: colors.text, lineHeight: fontSize.sm * 1.4 },
  failCell: { flex: 1, gap: 4 },
  failPct: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  failBarTrack: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  failBarFill: { height: '100%', borderRadius: 2 },
  emptyState: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary },

  // Badges
  typeBadge: { alignSelf: 'flex-start', borderRadius: 4, paddingVertical: 1, paddingHorizontal: spacing.xs, marginBottom: 2 },
  typeBadgeText: { fontSize: 10, fontWeight: fontWeight.bold },
  statusBadge: { borderRadius: 12, paddingVertical: 2, paddingHorizontal: spacing.sm },
  statusText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
});
