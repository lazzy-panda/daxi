import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  RefreshControl,
  Modal,
} from 'react-native';
import { resultsService } from '../../services/results';
import { ExamResult, QuestionResult } from '../../services/exams';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ScoreDisplay } from '../../components/ScoreDisplay';
import { Button } from '../../components/Button';
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ResultsScreen() {
  const [results, setResults] = useState<ExamResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedResult, setSelectedResult] = useState<ExamResult | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await resultsService.getAll();
      setResults(data);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load results');
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

  const viewDetail = async (result: ExamResult) => {
    if (result.question_results?.length > 0) {
      setSelectedResult(result);
      return;
    }
    setLoadingDetail(true);
    try {
      const detail = await resultsService.getById(result.id);
      setSelectedResult(detail);
    } catch {
      setSelectedResult(result);
    } finally {
      setLoadingDetail(false);
    }
  };

  const containerStyle =
    Platform.OS === 'web'
      ? { maxWidth: 1200, width: '100%', alignSelf: 'center' as const }
      : {};

  if (isLoading) return <LoadingSpinner fullScreen />;

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={containerStyle}>
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Exam Results</Text>
            <Text style={styles.pageSubtitle}>
              {results.length} submission{results.length !== 1 ? 's' : ''} total
            </Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.listCard}>
            <View style={styles.listHeader}>
              <Text style={[styles.listHeaderText, { flex: 2 }]}>Examinee</Text>
              <Text style={styles.listHeaderText}>Date</Text>
              <Text style={styles.listHeaderText}>Score</Text>
              <Text style={styles.listHeaderText}>Status</Text>
              <Text style={styles.listHeaderText}>Detail</Text>
            </View>

            {results.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No results yet</Text>
                <Text style={styles.emptySubtitle}>
                  Exam submissions will appear here once examinees complete their exams
                </Text>
              </View>
            ) : (
              results.map((result, idx) => (
                <View
                  key={result.id}
                  style={[
                    styles.listRow,
                    idx % 2 === 1 && styles.listRowAlt,
                    idx === results.length - 1 && styles.listRowLast,
                  ]}
                >
                  <Text style={[styles.listCell, { flex: 2 }]} numberOfLines={1}>
                    {result.user_email || `User #${result.user_id}`}
                  </Text>
                  <Text style={styles.listCell} numberOfLines={1}>
                    {formatDate(result.completed_at)}
                  </Text>
                  <Text style={[styles.listCell, { fontWeight: fontWeight.semibold }]}>
                    {result.total_score.toFixed(1)} / {result.max_score}
                  </Text>
                  <View style={styles.listCell}>
                    <View
                      style={[
                        styles.statusPill,
                        result.passed ? styles.pillPassed : styles.pillFailed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          result.passed ? styles.textPassed : styles.textFailed,
                        ]}
                      >
                        {result.passed ? 'Passed' : 'Failed'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.listCell}>
                    <TouchableOpacity
                      style={styles.viewBtn}
                      onPress={() => viewDetail(result)}
                      disabled={loadingDetail}
                    >
                      <Text style={styles.viewBtnText}>View</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* Detail Modal */}
      <Modal
        visible={!!selectedResult}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedResult(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Exam Detail</Text>
              <TouchableOpacity onPress={() => setSelectedResult(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedResult && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.scoreSection}>
                  <ScoreDisplay
                    score={selectedResult.total_score}
                    maxScore={selectedResult.max_score}
                    percentage={selectedResult.percentage}
                    passed={selectedResult.passed}
                  />
                  {selectedResult.user_email && (
                    <Text style={styles.modalUserEmail}>
                      {selectedResult.user_email}
                    </Text>
                  )}
                  <Text style={styles.modalDate}>
                    {formatDate(selectedResult.completed_at)}
                  </Text>
                </View>

                {selectedResult.question_results?.map((qr, i) => (
                  <QuestionResultCard key={i} qr={qr} index={i} />
                ))}
              </ScrollView>
            )}

            <Button
              title="Close"
              onPress={() => setSelectedResult(null)}
              variant="secondary"
              fullWidth
              style={styles.closeBtn}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

function QuestionResultCard({
  qr,
  index,
}: {
  qr: QuestionResult;
  index: number;
}) {
  return (
    <View style={qrStyles.card}>
      <View style={qrStyles.cardHeader}>
        <Text style={qrStyles.qNum}>Q{index + 1}</Text>
        <View
          style={[
            qrStyles.scoreBadge,
            qr.is_correct ? qrStyles.scoreBadgeCorrect : qrStyles.scoreBadgeWrong,
          ]}
        >
          <Text
            style={[
              qrStyles.scoreBadgeText,
              qr.is_correct ? qrStyles.scoreTextCorrect : qrStyles.scoreTextWrong,
            ]}
          >
            {qr.is_correct ? '✓' : '✗'} {qr.score}/{qr.max_score}
          </Text>
        </View>
      </View>
      <Text style={qrStyles.questionText}>{qr.question_text}</Text>
      <View style={qrStyles.answerBox}>
        <Text style={qrStyles.answerLabel}>Answer</Text>
        <Text style={qrStyles.answerText}>{qr.answer_text}</Text>
      </View>
      {qr.feedback && (
        <View style={qrStyles.feedbackBox}>
          <Text style={qrStyles.feedbackLabel}>AI Feedback</Text>
          <Text style={qrStyles.feedbackText}>{qr.feedback}</Text>
        </View>
      )}
      {qr.explanation && (
        <View>
          <Text style={qrStyles.sectionLabel}>Explanation</Text>
          <Text style={qrStyles.sectionText}>{qr.explanation}</Text>
        </View>
      )}
      {qr.suggestions && (
        <View>
          <Text style={qrStyles.sectionLabel}>Suggestions</Text>
          <Text style={qrStyles.sectionText}>{qr.suggestions}</Text>
        </View>
      )}
      {qr.resources && qr.resources.length > 0 && (
        <View>
          <Text style={qrStyles.sectionLabel}>Resources</Text>
          {qr.resources.map((r, i) => (
            <Text key={i} style={qrStyles.resourceText}>• {r}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  pageHeader: { marginBottom: spacing.xl },
  pageTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  pageSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
    marginBottom: spacing.md,
  },
  errorText: { fontSize: fontSize.sm, color: colors.error },
  listCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  listHeader: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listHeaderText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listRowAlt: { backgroundColor: colors.surface },
  listRowLast: { borderBottomWidth: 0 },
  listCell: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  statusPill: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
  },
  pillPassed: { backgroundColor: '#F0FDF4' },
  pillFailed: { backgroundColor: '#FEF2F2' },
  statusText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  textPassed: { color: colors.success },
  textFailed: { color: colors.error },
  viewBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: '#EFF6FF',
    alignSelf: 'flex-start',
  },
  viewBtnText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.medium },
  emptyState: { padding: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  modalClose: { fontSize: fontSize.lg, color: colors.textSecondary, padding: spacing.xs },
  scoreSection: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
    paddingBottom: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalUserEmail: { fontSize: fontSize.md, color: colors.text, fontWeight: fontWeight.medium },
  modalDate: { fontSize: fontSize.sm, color: colors.textSecondary },
  closeBtn: { marginTop: spacing.md },
});

const qrStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qNum: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  scoreBadge: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
  },
  scoreBadgeCorrect: { backgroundColor: '#DCFCE7' },
  scoreBadgeWrong: { backgroundColor: '#FEE2E2' },
  scoreBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  scoreTextCorrect: { color: colors.success },
  scoreTextWrong: { color: colors.error },
  questionText: { fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium, lineHeight: fontSize.sm * 1.5 },
  answerBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  answerLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textMuted, textTransform: 'uppercase' },
  answerText: { fontSize: fontSize.sm, color: colors.text },
  feedbackBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  feedbackLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary, textTransform: 'uppercase' },
  feedbackText: { fontSize: fontSize.sm, color: colors.text, lineHeight: fontSize.sm * 1.5 },
  sectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: spacing.xs },
  sectionText: { fontSize: fontSize.sm, color: colors.text, lineHeight: fontSize.sm * 1.5 },
  resourceText: { fontSize: fontSize.sm, color: colors.primary, lineHeight: fontSize.sm * 1.5 },
});
