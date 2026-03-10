import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { examsService, ExamResult, QuestionResult } from '../../services/exams';
import { ScoreDisplay } from '../../components/ScoreDisplay';
import { Button } from '../../components/Button';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ResultScreen() {
  const { resultId } = useLocalSearchParams<{ resultId: string }>();
  const router = useRouter();

  const [result, setResult] = useState<ExamResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!resultId) {
      setError('No result ID provided');
      setIsLoading(false);
      return;
    }
    examsService
      .getResult(resultId)
      .then((data) => {
        setResult(data);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load result');
      })
      .finally(() => setIsLoading(false));
  }, [resultId]);

  const containerStyle =
    Platform.OS === 'web'
      ? { maxWidth: 720, width: '100%', alignSelf: 'center' as const }
      : {};

  if (isLoading) {
    return <LoadingSpinner fullScreen message="Loading your results..." />;
  }

  if (error || !result) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Could not load result</Text>
        <Text style={styles.errorMessage}>{error || 'Result not found'}</Text>
        <Button title="Go to Dashboard" onPress={() => router.replace('/(examinee)')} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={containerStyle}>
        {/* Score hero */}
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Exam Complete!</Text>
          <Text style={styles.heroDate}>{formatDate(result.completed_at)}</Text>

          <ScoreDisplay
            score={result.total_score}
            maxScore={result.max_score}
            percentage={result.percentage}
            passed={result.passed}
          />

          {result.passed ? (
            <View style={styles.passMessage}>
              <Text style={styles.passMessageText}>
                Congratulations! You passed the exam.
              </Text>
            </View>
          ) : null}

          {result.passed && result.certificate_url ? (
            <TouchableOpacity
              style={styles.certBtn}
              onPress={() => Linking.openURL(result.certificate_url!)}
            >
              <Ionicons name="ribbon-outline" size={18} color="#16a34a" />
              <Text style={styles.certBtnText}>View Certificate</Text>
              <Ionicons name="open-outline" size={14} color="#16a34a" />
            </TouchableOpacity>
          ) : null}

          {!result.passed ? (
            <View style={styles.failMessage}>
              <Text style={styles.failMessageText}>
                You didn't reach the 85% passing threshold. Study the feedback below and try again.
              </Text>
            </View>
          )}

          <Button
            title="Study Flash Cards"
            onPress={() => router.push('/(examinee)/study')}
            variant={result.passed ? 'outline' : 'primary'}
            fullWidth
          />
        </View>

        {/* Per-question results */}
        <Text style={styles.sectionTitle}>Question Breakdown</Text>

        {result.question_results?.map((qr, i) => (
          <QuestionResultItem key={i} qr={qr} index={i} />
        ))}

        <View style={styles.bottomActions}>
          <Button
            title="Back to Dashboard"
            onPress={() => router.replace('/(examinee)')}
            variant="outline"
            fullWidth
          />
          <Button
            title="View History"
            onPress={() => router.push('/(examinee)/history')}
            variant="ghost"
            fullWidth
          />
        </View>
      </View>
    </ScrollView>
  );
}

function QuestionResultItem({
  qr,
  index,
}: {
  qr: QuestionResult;
  index: number;
}) {
  const scoreColor = qr.is_correct ? colors.success : colors.error;
  const scoreBg = qr.is_correct ? '#F0FDF4' : '#FEF2F2';

  return (
    <View style={qrStyles.card}>
      <View style={qrStyles.header}>
        <View style={qrStyles.headerLeft}>
          <Text style={qrStyles.qNum}>Question {index + 1}</Text>
          <View style={[qrStyles.correctnessBadge, { backgroundColor: scoreBg }]}>
            <Text style={[qrStyles.correctnessText, { color: scoreColor }]}>
              {qr.is_correct ? '✓ Correct' : '✗ Incorrect'}
            </Text>
          </View>
        </View>
        <Text style={[qrStyles.score, { color: scoreColor }]}>
          {qr.score}/{qr.max_score}
        </Text>
      </View>

      <Text style={qrStyles.questionText}>{qr.question_text}</Text>

      <View style={qrStyles.section}>
        <Text style={qrStyles.sectionLabel}>Your Answer</Text>
        <View style={qrStyles.answerBox}>
          <Text style={qrStyles.answerText}>{qr.answer_text || '(No answer provided)'}</Text>
        </View>
      </View>

      {qr.feedback && (
        <View style={qrStyles.section}>
          <Text style={qrStyles.sectionLabel}>AI Feedback</Text>
          <View style={[qrStyles.feedbackBox, { borderLeftColor: scoreColor }]}>
            <Text style={qrStyles.feedbackText}>{qr.feedback}</Text>
          </View>
        </View>
      )}

      {qr.explanation && (
        <View style={qrStyles.section}>
          <Text style={qrStyles.sectionLabel}>Explanation</Text>
          <Text style={qrStyles.bodyText}>{qr.explanation}</Text>
        </View>
      )}

      {qr.suggestions && (
        <View style={qrStyles.section}>
          <Text style={qrStyles.sectionLabel}>Suggestions for Improvement</Text>
          <Text style={qrStyles.bodyText}>{qr.suggestions}</Text>
        </View>
      )}

      {qr.resources && qr.resources.length > 0 && (
        <View style={qrStyles.section}>
          <Text style={qrStyles.sectionLabel}>Resources</Text>
          {qr.resources.map((r, i) => (
            <Text key={i} style={qrStyles.resource}>• {r}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  heroCard: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  heroTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  heroDate: { fontSize: fontSize.sm, color: colors.textSecondary },
  passMessage: {
    backgroundColor: '#F0FDF4',
    borderRadius: radius.md,
    padding: spacing.md,
    width: '100%',
  },
  passMessageText: {
    fontSize: fontSize.sm,
    color: colors.success,
    textAlign: 'center',
    fontWeight: fontWeight.medium,
  },
  failMessage: {
    backgroundColor: '#FEF2F2',
    borderRadius: radius.md,
    padding: spacing.md,
    width: '100%',
  },
  failMessageText: {
    fontSize: fontSize.sm,
    color: colors.error,
    textAlign: 'center',
    lineHeight: fontSize.sm * 1.5,
  },
  certBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    width: '100%',
    justifyContent: 'center',
  },
  certBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: '#16a34a',
    flex: 1,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  bottomActions: { gap: spacing.sm, marginTop: spacing.lg },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  errorTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  errorMessage: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
});

const qrStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  qNum: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  correctnessBadge: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
  },
  correctnessText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  score: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  questionText: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.md * 1.6,
  },
  section: { gap: spacing.xs },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  answerBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  answerText: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: fontSize.sm * 1.6,
  },
  feedbackBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderLeftWidth: 3,
  },
  feedbackText: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: fontSize.sm * 1.6,
  },
  bodyText: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: fontSize.sm * 1.6,
  },
  resource: {
    fontSize: fontSize.sm,
    color: colors.primary,
    lineHeight: fontSize.sm * 1.6,
  },
});
