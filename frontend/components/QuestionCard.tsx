import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Input } from './Input';
import { colors, spacing, radius, fontSize, fontWeight } from '../constants/theme';
import { MCQChoice } from '../services/exams';

interface QuestionCardProps {
  questionNumber: number;
  totalQuestions: number;
  questionText: string;
  questionType?: 'open' | 'short' | 'mcq' | 'true_false';
  choices?: MCQChoice[];
  answer: string;
  onAnswerChange: (text: string) => void;
}

export function QuestionCard({
  questionNumber,
  totalQuestions,
  questionText,
  questionType = 'open',
  choices,
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
        <View style={styles.questionBoxHeader}>
          <Text style={styles.questionNumber}>Q{questionNumber}</Text>
          {questionType === 'mcq' && (
            <View style={styles.mcqBadge}>
              <Text style={styles.mcqBadgeText}>Multiple Choice</Text>
            </View>
          )}
          {questionType === 'true_false' && (
            <View style={[styles.mcqBadge, { backgroundColor: '#FFF7ED' }]}>
              <Text style={[styles.mcqBadgeText, { color: '#c2410c' }]}>True / False</Text>
            </View>
          )}
          {questionType === 'short' && (
            <View style={[styles.mcqBadge, { backgroundColor: '#F5F3FF' }]}>
              <Text style={[styles.mcqBadgeText, { color: '#7c3aed' }]}>Short Answer</Text>
            </View>
          )}
        </View>
        <Text style={styles.questionText}>{questionText}</Text>
      </View>

      {/* Answer */}
      {(questionType === 'mcq' || questionType === 'true_false') && choices && choices.length > 0 ? (
        <View style={styles.choicesContainer}>
          <Text style={styles.choicesLabel}>
            {questionType === 'true_false' ? 'Is this statement true or false?' : 'Choose one answer:'}
          </Text>
          {choices.map((choice) => {
            const selected = answer === choice.label;
            return (
              <TouchableOpacity
                key={choice.label}
                style={[styles.choiceItem, selected && styles.choiceItemSelected]}
                onPress={() => onAnswerChange(choice.label)}
                activeOpacity={0.7}
              >
                <View style={[styles.choiceRadio, selected && styles.choiceRadioSelected]}>
                  {selected && <View style={styles.choiceRadioDot} />}
                </View>
                <Text style={styles.choiceLabel}>{choice.label}</Text>
                <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                  {choice.text}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : questionType === 'short' ? (
        <Input
          label="Your Answer"
          value={answer}
          onChangeText={onAnswerChange}
          placeholder="Write a brief answer (1-2 sentences)..."
          multiline
          minHeight={64}
          hint="Keep it concise. AI will evaluate your response."
        />
      ) : (
        <Input
          label="Your Answer"
          value={answer}
          onChangeText={onAnswerChange}
          placeholder="Type your answer here..."
          multiline
          minHeight={120}
          hint="Write a detailed answer. AI will evaluate your response."
        />
      )}
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
  questionBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  questionNumber: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mcqBadge: {
    backgroundColor: '#F0FDF4',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
  },
  mcqBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#16a34a',
  },
  questionText: {
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: fontSize.md * 1.6,
  },
  choicesContainer: {
    gap: spacing.sm,
  },
  choicesLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  choiceItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  choiceItemSelected: {
    borderColor: colors.primary,
    backgroundColor: '#EFF6FF',
  },
  choiceRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  choiceRadioSelected: {
    borderColor: colors.primary,
  },
  choiceRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  choiceLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    minWidth: 20,
    marginTop: 1,
  },
  choiceText: {
    fontSize: fontSize.sm,
    color: colors.text,
    flex: 1,
    lineHeight: fontSize.sm * 1.5,
  },
  choiceTextSelected: {
    fontWeight: fontWeight.medium,
  },
});
