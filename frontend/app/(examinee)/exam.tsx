import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { examsService, ExamSession, ExamAnswer } from '../../services/exams';
import { Button } from '../../components/Button';
import { QuestionCard } from '../../components/QuestionCard';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

type ExamPhase = 'start' | 'in_progress' | 'review' | 'submitting';

export default function ExamScreen() {
  const router = useRouter();

  const [phase, setPhase] = useState<ExamPhase>('start');
  const [session, setSession] = useState<ExamSession | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startError, setStartError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  const containerStyle =
    Platform.OS === 'web'
      ? { maxWidth: 720, width: '100%', alignSelf: 'center' as const }
      : {};

  const handleStart = async () => {
    setStartError('');
    setIsStarting(true);
    try {
      const s = await examsService.start();
      setSession(s);
      const initial: Record<string, string> = {};
      s.questions.forEach((q) => {
        initial[String(q.id)] = '';
      });
      setAnswers(initial);
      setCurrentIndex(0);
      setPhase('in_progress');
    } catch (err: unknown) {
      setStartError(err instanceof Error ? err.message : 'Failed to start exam');
    } finally {
      setIsStarting(false);
    }
  };

  const handleAnswerChange = useCallback(
    (questionId: string, text: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: text }));
    },
    []
  );

  const handlePrevious = () => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  };

  const handleNext = () => {
    if (!session) return;
    if (currentIndex < session.questions.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setPhase('review');
    }
  };

  const handleSubmit = async () => {
    if (!session) return;

    const unanswered = session.questions.filter(
      (q) => !answers[String(q.id)]?.trim()
    );

    if (unanswered.length > 0) {
      const doSubmit = () => submitExam();
      const msg = `${unanswered.length} question${unanswered.length !== 1 ? 's are' : ' is'} unanswered. Submit anyway?`;
      if (Platform.OS === 'web') {
        if (window.confirm(msg)) doSubmit();
      } else {
        Alert.alert('Unanswered Questions', msg, [
          { text: 'Go Back', style: 'cancel' },
          { text: 'Submit', onPress: doSubmit },
        ]);
      }
      return;
    }

    submitExam();
  };

  const submitExam = async () => {
    if (!session) return;
    setPhase('submitting');
    setSubmitError('');

    const examAnswers: ExamAnswer[] = session.questions.map((q) => ({
      question_id: q.id,
      answer_text: answers[String(q.id)] || '',
    }));

    try {
      const result = await examsService.submit(session.id, examAnswers);
      router.replace({
        pathname: '/(examinee)/result',
        params: { resultId: String(result.id) },
      });
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
      setPhase('review');
    }
  };

  // --- Start screen ---
  if (phase === 'start') {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={containerStyle}>
          <View style={styles.startCard}>
            <View style={styles.startIconBg}>
              <Text style={styles.startIcon}>📝</Text>
            </View>
            <Text style={styles.startTitle}>Ready to begin?</Text>
            <Text style={styles.startDesc}>
              You'll receive 10 questions. Take your time and write detailed answers.
              Your responses will be evaluated by AI.
            </Text>
            <View style={styles.rulesList}>
              {[
                '10 questions, answer all at your own pace',
                'Navigate freely between questions',
                'AI will grade each answer individually',
                'Results shown immediately after submission',
                'Minimum passing score: 85%',
              ].map((rule, i) => (
                <View key={i} style={styles.ruleItem}>
                  <View style={styles.ruleDot} />
                  <Text style={styles.ruleText}>{rule}</Text>
                </View>
              ))}
            </View>

            {startError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{startError}</Text>
              </View>
            ) : null}

            <Button
              title="Start Exam"
              onPress={handleStart}
              loading={isStarting}
              fullWidth
              size="lg"
            />
            <Button
              title="Go Back"
              onPress={() => router.back()}
              variant="ghost"
              fullWidth
            />
          </View>
        </View>
      </ScrollView>
    );
  }

  // --- Submitting ---
  if (phase === 'submitting') {
    return (
      <View style={styles.submittingContainer}>
        <LoadingSpinner
          size="large"
          message="Evaluating your answers... This may take a moment."
        />
        <Text style={styles.submittingHint}>
          AI is grading each of your responses
        </Text>
      </View>
    );
  }

  if (!session) return null;

  const currentQuestion = session.questions[currentIndex];
  const currentAnswer = answers[String(currentQuestion.id)] || '';
  const isLastQuestion = currentIndex === session.questions.length - 1;

  // --- Review screen ---
  if (phase === 'review') {
    const answeredCount = session.questions.filter(
      (q) => answers[String(q.id)]?.trim()
    ).length;

    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={containerStyle}>
          <Text style={styles.reviewTitle}>Review Your Answers</Text>
          <Text style={styles.reviewSubtitle}>
            {answeredCount} of {session.questions.length} questions answered
          </Text>

          {submitError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{submitError}</Text>
            </View>
          ) : null}

          {session.questions.map((q, idx) => {
            const ans = answers[String(q.id)] || '';
            const answered = !!ans.trim();
            return (
              <View key={q.id} style={styles.reviewItem}>
                <View style={styles.reviewItemHeader}>
                  <Text style={styles.reviewQNum}>Q{idx + 1}</Text>
                  <View
                    style={[
                      styles.reviewStatusDot,
                      answered
                        ? styles.reviewStatusAnswered
                        : styles.reviewStatusEmpty,
                    ]}
                  />
                  <Button
                    title="Edit"
                    onPress={() => {
                      setCurrentIndex(idx);
                      setPhase('in_progress');
                    }}
                    variant="ghost"
                    size="sm"
                  />
                </View>
                <Text style={styles.reviewQText} numberOfLines={2}>
                  {q.text}
                </Text>
                {answered ? (
                  <Text style={styles.reviewAnswer} numberOfLines={3}>
                    {ans}
                  </Text>
                ) : (
                  <Text style={styles.reviewNoAnswer}>No answer provided</Text>
                )}
              </View>
            );
          })}

          <View style={styles.reviewActions}>
            <Button
              title="Back to Questions"
              onPress={() => {
                setCurrentIndex(session.questions.length - 1);
                setPhase('in_progress');
              }}
              variant="outline"
              fullWidth
            />
            <Button
              title="Submit Exam"
              onPress={handleSubmit}
              fullWidth
              size="lg"
            />
          </View>
        </View>
      </ScrollView>
    );
  }

  // --- In progress ---
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={containerStyle}>
        <QuestionCard
          questionNumber={currentIndex + 1}
          totalQuestions={session.questions.length}
          questionText={currentQuestion.text}
          questionType={currentQuestion.question_type}
          choices={currentQuestion.choices}
          answer={currentAnswer}
          onAnswerChange={(text) =>
            handleAnswerChange(String(currentQuestion.id), text)
          }
        />

        <View style={styles.navRow}>
          <Button
            title="Previous"
            onPress={handlePrevious}
            disabled={currentIndex === 0}
            variant="outline"
          />

          {/* Question dots */}
          <View style={styles.questionDots}>
            {session.questions.map((q, idx) => {
              const answered = !!answers[String(q.id)]?.trim();
              return (
                <View
                  key={q.id}
                  style={[
                    styles.dot,
                    idx === currentIndex && styles.dotActive,
                    answered && idx !== currentIndex && styles.dotAnswered,
                  ]}
                />
              );
            })}
          </View>

          {isLastQuestion ? (
            <Button
              title="Review & Submit"
              onPress={handleNext}
            />
          ) : (
            <Button
              title="Next"
              onPress={handleNext}
            />
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  startCard: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    alignItems: 'center',
  },
  startIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  startIcon: { fontSize: 36 },
  startTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  startDesc: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: fontSize.md * 1.6,
  },
  rulesList: {
    width: '100%',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  ruleItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ruleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  ruleText: { fontSize: fontSize.sm, color: colors.text, flex: 1 },
  errorBox: {
    width: '100%',
    backgroundColor: '#FEE2E2',
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  errorText: { fontSize: fontSize.sm, color: colors.error },
  submittingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
    padding: spacing.xl,
  },
  submittingHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  questionDots: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 16,
  },
  dotAnswered: {
    backgroundColor: colors.success,
  },
  reviewTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  reviewSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  reviewItem: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  reviewItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reviewQNum: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  reviewStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  reviewStatusAnswered: { backgroundColor: colors.success },
  reviewStatusEmpty: { backgroundColor: colors.warning },
  reviewQText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.sm * 1.5,
  },
  reviewAnswer: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: fontSize.sm * 1.5,
    fontStyle: 'italic',
  },
  reviewNoAnswer: {
    fontSize: fontSize.sm,
    color: colors.warning,
    fontStyle: 'italic',
  },
  reviewActions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
