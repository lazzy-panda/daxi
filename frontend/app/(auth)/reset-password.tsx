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
import { Link, useRouter, useLocalSearchParams } from 'expo-router';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { colors, spacing, fontSize, fontWeight } from '../../constants/theme';
import { api } from '../../services/api';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    setPasswordError('');
    setConfirmError('');
    setError('');

    let valid = true;
    if (!password) { setPasswordError('Password is required'); valid = false; }
    else if (password.length < 8) { setPasswordError('Password must be at least 8 characters'); valid = false; }
    if (!confirmPassword) { setConfirmError('Please confirm your password'); valid = false; }
    else if (password !== confirmPassword) { setConfirmError('Passwords do not match'); valid = false; }
    if (!valid) return;

    if (!token) {
      setError('Invalid reset link. Please request a new one.');
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'Link is invalid or has expired. Please request a new one.');
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
            {done ? (
              <>
                <Text style={styles.heading}>Password updated</Text>
                <Text style={styles.description}>
                  Your password has been reset successfully. You can now sign in with your new password.
                </Text>
                <Button
                  title="Sign In"
                  onPress={() => router.replace('/(auth)/login')}
                  fullWidth
                  size="lg"
                  style={styles.submitBtn}
                />
              </>
            ) : (
              <>
                <Text style={styles.heading}>Set new password</Text>

                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Input
                  label="New Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  secureTextEntry
                  error={passwordError}
                  returnKeyType="next"
                />

                <Input
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Repeat your password"
                  secureTextEntry
                  error={confirmError}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />

                <Button
                  title="Reset Password"
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
