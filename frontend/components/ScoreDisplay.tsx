import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize, fontWeight } from '../constants/theme';

interface ScoreDisplayProps {
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  size?: 'sm' | 'lg';
}

export function ScoreDisplay({
  score,
  maxScore,
  percentage,
  passed,
  size = 'lg',
}: ScoreDisplayProps) {
  const scoreColor =
    percentage >= 85 ? colors.success : colors.error;

  return (
    <View style={styles.container}>
      <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
        <Text style={[styles.percentage, { color: scoreColor }]}>
          {Math.round(percentage)}%
        </Text>
        <Text style={styles.fraction}>
          {score} / {maxScore}
        </Text>
      </View>
      <View
        style={[
          styles.badge,
          passed ? styles.badgePassed : styles.badgeFailed,
        ]}
      >
        <Text
          style={[
            styles.badgeText,
            passed ? styles.badgeTextPassed : styles.badgeTextFailed,
          ]}
        >
          {passed ? 'PASSED' : 'FAILED'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.md,
  },
  scoreCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  percentage: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    lineHeight: fontSize.xxl + 4,
  },
  fraction: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  badge: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
  },
  badgePassed: {
    backgroundColor: '#DCFCE7',
  },
  badgeFailed: {
    backgroundColor: '#FEE2E2',
  },
  badgeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
  },
  badgeTextPassed: {
    color: colors.success,
  },
  badgeTextFailed: {
    color: colors.error,
  },
});
