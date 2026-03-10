import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { colors, spacing, fontSize, fontWeight } from '../../constants/theme';
import { api } from '../../services/api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setEmailError('');
    setError('');
    if (!email.trim()) {
      setEmailError('Email is required');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Enter a valid email address');
      return;
    }
    setIsLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          <View style={styles.brand}>
            <Image source={require('../../assets/logo.png')} style={styles.logoMark} resizeMode="contain" />
          </View>

          <View style={styles.form}>
            {sent ? (
              <>
                <Text style={styles.heading}>Check your email</Text>
                <Text style={styles.description}>
                  If an account exists for <Text style={styles.bold}>{email}</Text>, we've sent a
                  password reset link. Check your inbox (and spam folder).
                </Text>
                <Button
                  title="Back to Sign In"
                  onPress={() => router.replace('/(auth)/login')}
                  fullWidth
                  size="lg"
                  style={styles.submitBtn}
                />
              </>
            ) : (
              <>
                <Text style={styles.heading}>Reset your password</Text>
                <Text style={styles.description}>
                  Enter your email and we'll send you a link to reset your password.
                </Text>

                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={emailError}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />

                <Button
                  title="Send Reset Link"
                  onPress={handleSubmit}
                  loading={isLoading}
                  fullWidth
                  size="lg"
                  style={styles.submitBtn}
                />

                <View style={styles.footer}>
                  <Link href="/(auth)/login" asChild>
                    <TouchableOpacity>
                      <Text style={styles.link}>Back to Sign In</Text>
                    </TouchableOpacity>
                  </Link>
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  container: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: spacing.xl },
  brand: { alignItems: 'center' },
  logoMark: { width: 132, height: 132 },
  form: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: spacing.sm,
  },
  heading: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: fontSize.sm * 1.6,
    marginBottom: spacing.sm,
  },
  bold: { fontWeight: fontWeight.semibold, color: colors.text },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  errorText: { fontSize: fontSize.sm, color: colors.error },
  submitBtn: { marginTop: spacing.sm },
  footer: { alignItems: 'center', marginTop: spacing.sm },
  link: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold },
});
