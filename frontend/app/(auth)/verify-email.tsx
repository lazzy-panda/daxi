import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors, spacing, fontSize, fontWeight } from '../../constants/theme';
import { api } from '../../services/api';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />

      {status === 'loading' && (
        <>
          <ActivityIndicator size="large" color={colors.primary} style={styles.icon} />
          <Text style={styles.heading}>Verifying your email…</Text>
        </>
      )}

      {status === 'success' && (
        <>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.heading}>Email verified!</Text>
          <Text style={styles.description}>Your email has been confirmed. You can now sign in.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.btnText}>Sign In</Text>
          </TouchableOpacity>
        </>
      )}

      {status === 'error' && (
        <>
          <Text style={styles.errorIcon}>✕</Text>
          <Text style={styles.heading}>Verification failed</Text>
          <Text style={styles.description}>This link is invalid or has already been used.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.btnText}>Back to Sign In</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  logo: { width: 120, height: 120, marginBottom: spacing.md },
  icon: { marginVertical: spacing.md },
  successIcon: { fontSize: 48, color: '#16a34a' },
  errorIcon: { fontSize: 48, color: colors.error },
  heading: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.text, textAlign: 'center' },
  description: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', maxWidth: 320 },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
    borderRadius: 8,
    marginTop: spacing.sm,
  },
  btnText: { color: '#fff', fontWeight: fontWeight.semibold, fontSize: fontSize.sm },
});
