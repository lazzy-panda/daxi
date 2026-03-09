import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Input } from './Input';
import { colors, spacing, radius, fontSize, fontWeight } from '../constants/theme';

interface QuestionCardProps {
  questionNumber: number;
  totalQuestions: number;
  questionText: string;
  answer: string;
  onAnswerChange: (text: string) => void;
}

export function QuestionCard({
  questionNumber,
  totalQuestions,
  questionText,
  answer,
  onAnswerChange,
}: QuestionCardProps) {
  const progress = questionNumber / totalQuestions;

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressRow}>
        <Text style={styles.progressLabel}>
          Question {questionNumber} of {totalQuestions}
        </Text>
        <Text style={styles.progressPercent}>
          {Math.round(progress * 100)}%
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Question */}
      <View style={styles.questionBox}>
        <Text style={styles.questionNumber}>Q{questionNumber}</Text>
        <Text style={styles.questionText}>{questionText}</Text>
      </View>

      {/* Answer input */}
      <Input
        label="Your Answer"
        value={answer}
        onChangeText={onAnswerChange}
        placeholder="Type your answer here..."
        multiline
        minHeight={120}
        hint="Write a detailed answer. AI will evaluate your response."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  progressLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  progressPercent: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
  },
  questionBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  questionNumber: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  questionText: {
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: fontSize.md * 1.6,
  },
});
