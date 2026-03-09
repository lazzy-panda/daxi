import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { flashcardsService, FlashCard } from '../../services/flashcards';
import { FlashCard as FlashCardComponent } from '../../components/FlashCard';
import { Button } from '../../components/Button';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

export default function StudyScreen() {
  const router = useRouter();

  const [cards, setCards] = useState<FlashCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewingId, setReviewingId] = useState<number | string | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const containerStyle =
    Platform.OS === 'web'
      ? { maxWidth: 600, width: '100%', alignSelf: 'center' as const }
      : {};

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await flashcardsService.getStudyCards();
      setCards(data);
      setCurrentIndex(0);
      setSessionComplete(false);
      setReviewedCount(0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load study cards');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleReview = async (
    cardId: number | string,
    difficulty: 'easy' | 'medium' | 'hard'
  ) => {
    setReviewingId(cardId);
    try {
      await flashcardsService.review(cardId, { difficulty });
    } catch {
      // Fail silently — still advance
    } finally {
      setReviewingId(null);
      setReviewedCount((c) => c + 1);

      if (currentIndex < cards.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else {
        setSessionComplete(true);
      }
    }
  };

  if (isLoading) return <LoadingSpinner fullScreen />;

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Failed to load cards</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Button title="Try Again" onPress={load} />
      </View>
    );
  }

  // Empty state
  if (cards.length === 0) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={containerStyle}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>You're all caught up!</Text>
            <Text style={styles.emptySubtitle}>
              No flash cards are due for review right now. Check back later or
              study all cards.
            </Text>
            <Button
              title="Back to Dashboard"
              onPress={() => router.replace('/(examinee)')}
              fullWidth
            />
          </View>
        </View>
      </ScrollView>
    );
  }

  // Session complete
  if (sessionComplete) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={containerStyle}>
          <View style={styles.completeCard}>
            <Text style={styles.completeIcon}>✅</Text>
            <Text style={styles.completeTitle}>Session Complete!</Text>
            <Text style={styles.completeSubtitle}>
              You reviewed {reviewedCount} card{reviewedCount !== 1 ? 's' : ''} in this session.
            </Text>
            <View style={styles.completeActions}>
              <Button
                title="Study Again"
                onPress={load}
                variant="outline"
                fullWidth
              />
              <Button
                title="Back to Dashboard"
                onPress={() => router.replace('/(examinee)')}
                fullWidth
              />
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  const currentCard = cards[currentIndex];
  const remaining = cards.length - currentIndex;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={containerStyle}>
        {/* Progress */}
        <View style={styles.progressSection}>
          <Text style={styles.progressLabel}>
            Card {currentIndex + 1} of {cards.length}
          </Text>
          <Text style={styles.remainingLabel}>
            {remaining} remaining
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${((currentIndex) / cards.length) * 100}%`,
              },
            ]}
          />
        </View>

        {/* Card */}
        <View style={styles.cardSection}>
          <FlashCardComponent
            front={currentCard.front}
            back={currentCard.back}
            source={currentCard.source ?? currentCard.source_reference}
            onHard={() => handleReview(currentCard.id, 'hard')}
            onMedium={() => handleReview(currentCard.id, 'medium')}
            onEasy={() => handleReview(currentCard.id, 'easy')}
          />
        </View>

        {/* Hint */}
        <Text style={styles.hint}>
          Tap the card to flip it, then rate how well you knew it
        </Text>

        {reviewingId === currentCard.id && (
          <View style={styles.reviewingIndicator}>
            <Text style={styles.reviewingText}>Saving...</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  errorTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  errorMessage: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  progressSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  progressLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  remainingLabel: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  cardSection: {
    marginBottom: spacing.lg,
  },
  hint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: fontSize.sm * 1.5,
  },
  reviewingIndicator: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  reviewingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  emptyCard: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: fontSize.md * 1.6,
  },
  completeCard: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  completeIcon: { fontSize: 56 },
  completeTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  completeSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  completeActions: { width: '100%', gap: spacing.sm, marginTop: spacing.sm },
});
