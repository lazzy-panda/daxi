import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { colors, spacing, radius, fontSize, fontWeight, shadow } from '../constants/theme';

interface FlashCardProps {
  front: string;
  back: string;
  source?: string;
  onHard?: () => void;
  onMedium?: () => void;
  onEasy?: () => void;
}

export function FlashCard({
  front,
  back,
  source,
  onHard,
  onMedium,
  onEasy,
}: FlashCardProps) {
  const [flipped, setFlipped] = useState(false);
  const animValue = useRef(new Animated.Value(0)).current;

  const flipToBack = () => {
    Animated.spring(animValue, {
      toValue: 1,
      friction: 8,
      tension: 10,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
    setFlipped(true);
  };

  const flipToFront = () => {
    Animated.spring(animValue, {
      toValue: 0,
      friction: 8,
      tension: 10,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
    setFlipped(false);
  };

  const handleFlip = () => {
    if (flipped) {
      flipToFront();
    } else {
      flipToBack();
    }
  };

  const frontRotate = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const backRotate = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  const frontOpacity = animValue.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });

  const backOpacity = animValue.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        onPress={handleFlip}
        style={styles.cardTouchable}
        activeOpacity={0.95}
      >
        <View style={styles.cardContainer}>
          {/* Front */}
          <Animated.View
            style={[
              styles.card,
              styles.cardFront,
              Platform.OS !== 'web'
                ? {
                    transform: [{ rotateY: frontRotate }],
                    opacity: frontOpacity,
                  }
                : {},
              Platform.OS === 'web' && !flipped ? styles.visible : Platform.OS === 'web' ? styles.hidden : {},
            ]}
          >
            <Text style={styles.sideLabel}>Question / Concept</Text>
            <Text style={styles.frontText}>{front}</Text>
            <Text style={styles.tapHint}>Tap to reveal answer</Text>
          </Animated.View>

          {/* Back */}
          <Animated.View
            style={[
              styles.card,
              styles.cardBack,
              Platform.OS !== 'web'
                ? {
                    transform: [{ rotateY: backRotate }],
                    opacity: backOpacity,
                  }
                : {},
              Platform.OS === 'web' && flipped ? styles.visible : Platform.OS === 'web' ? styles.hidden : {},
            ]}
          >
            <Text style={[styles.sideLabel, styles.sideLabelBack]}>Answer</Text>
            <Text style={styles.backText}>{back}</Text>
            {source && (
              <Text style={styles.source}>Source: {source}</Text>
            )}
          </Animated.View>
        </View>
      </TouchableOpacity>

      {flipped && (onHard || onMedium || onEasy) && (
        <View style={styles.ratingRow}>
          <TouchableOpacity
            style={[styles.ratingBtn, styles.ratingHard]}
            onPress={onHard}
          >
            <Text style={styles.ratingBtnText}>Hard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ratingBtn, styles.ratingMedium]}
            onPress={onMedium}
          >
            <Text style={styles.ratingBtnText}>Medium</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ratingBtn, styles.ratingEasy]}
            onPress={onEasy}
          >
            <Text style={styles.ratingBtnText}>Easy</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const CARD_HEIGHT = 280;

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  cardTouchable: {
    width: '100%',
  },
  cardContainer: {
    width: '100%',
    height: CARD_HEIGHT,
    position: 'relative',
  },
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.xl,
    padding: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
    backfaceVisibility: 'hidden',
    borderWidth: 1,
    ...shadow.md,
  },
  visible: {
    opacity: 1,
    zIndex: 1,
  },
  hidden: {
    opacity: 0,
    zIndex: 0,
  },
  cardFront: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  cardBack: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  sideLabel: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sideLabelBack: {
    color: 'rgba(255,255,255,0.7)',
  },
  frontText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    textAlign: 'center',
    lineHeight: fontSize.lg * 1.5,
  },
  backText: {
    fontSize: fontSize.md,
    color: '#fff',
    textAlign: 'center',
    lineHeight: fontSize.md * 1.6,
  },
  tapHint: {
    position: 'absolute',
    bottom: spacing.md,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  source: {
    position: 'absolute',
    bottom: spacing.md,
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: 'center',
  },
  ratingBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    maxWidth: 120,
  },
  ratingBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: '#fff',
  },
  ratingHard: {
    backgroundColor: colors.error,
  },
  ratingMedium: {
    backgroundColor: colors.warning,
  },
  ratingEasy: {
    backgroundColor: colors.success,
  },
});
