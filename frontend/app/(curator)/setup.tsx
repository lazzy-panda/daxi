import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthContext } from '../../context/AuthContext';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { colors, spacing, fontSize, fontWeight } from '../../constants/theme';

export default function OrgSetupScreen() {
  const { createOrg } = useAuthContext();
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Organization name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await createOrg(name.trim());
      router.replace('/(curator)');
    } catch {
      setError('Failed to create organization. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create your organization</Text>
      <Text style={styles.subtitle}>
        Set up your workspace to start managing your learning platform.
      </Text>
      <View style={styles.form}>
        <Input
          label="Organization name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Acme Corp"
          error={error}
          returnKeyType="done"
          onSubmitEditing={handleCreate}
        />
        <Button
          title="Create Organization"
          onPress={handleCreate}
          loading={loading}
          fullWidth
          size="lg"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    padding: spacing.xl,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  form: {
    gap: spacing.md,
  },
});
