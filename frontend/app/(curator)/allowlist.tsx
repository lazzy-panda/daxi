import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { allowlistService, AllowlistEntry } from '../../services/allowlist';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

type Role = 'curator' | 'examinee';

export default function AllowlistScreen() {
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<Role>('examinee');
  const [emailError, setEmailError] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const [deletingId, setDeletingId] = useState<number | string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await allowlistService.getAll();
      setEntries(data);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load allowlist');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleAdd = async () => {
    setEmailError('');
    setAddError('');

    if (!newEmail.trim()) {
      setEmailError('Email is required');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(newEmail)) {
      setEmailError('Enter a valid email address');
      return;
    }

    setIsAdding(true);
    try {
      const entry = await allowlistService.add({
        email: newEmail.trim(),
        role: newRole,
      });
      setEntries((prev) => [entry, ...prev]);
      setNewEmail('');
      setNewRole('examinee');
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to add entry');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: number | string, email: string) => {
    const doDelete = async () => {
      setDeletingId(id);
      try {
        await allowlistService.delete(id);
        setEntries((prev) => prev.filter((e) => e.id !== id));
      } catch (err: unknown) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete');
      } finally {
        setDeletingId(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Remove ${email} from allowlist?`)) {
        await doDelete();
      }
    } else {
      Alert.alert('Remove Entry', `Remove ${email} from allowlist?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const containerStyle =
    Platform.OS === 'web'
      ? { maxWidth: 1200, width: '100%', alignSelf: 'center' as const }
      : {};

  if (isLoading) return <LoadingSpinner fullScreen />;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={containerStyle}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Allowlist</Text>
          <Text style={styles.pageSubtitle}>
            Control which emails can register on Daxi
          </Text>
        </View>

        {/* Add form */}
        <View style={styles.addCard}>
          <Text style={styles.addCardTitle}>Add Email</Text>
          {addError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{addError}</Text>
            </View>
          ) : null}
          <View style={styles.addRow}>
            <View style={styles.addEmailInput}>
              <Input
                label="Email Address"
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="user@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                error={emailError}
                containerStyle={styles.noMargin}
                returnKeyType="done"
                onSubmitEditing={handleAdd}
              />
            </View>
            <View style={styles.addRoleSelector}>
              <Text style={styles.roleLabel}>Role</Text>
              <View style={styles.roleTabs}>
                {(['examinee', 'curator'] as Role[]).map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[
                      styles.roleTab,
                      newRole === role && styles.roleTabActive,
                    ]}
                    onPress={() => setNewRole(role)}
                  >
                    <Text
                      style={[
                        styles.roleTabText,
                        newRole === role && styles.roleTabTextActive,
                      ]}
                    >
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          <Button
            title="Add to Allowlist"
            onPress={handleAdd}
            loading={isAdding}
            style={styles.addBtn}
          />
        </View>

        {/* Error */}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* List */}
        <View style={styles.listCard}>
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderText}>Email</Text>
            <Text style={styles.listHeaderText}>Role</Text>
            <Text style={styles.listHeaderText}>Status</Text>
            <Text style={styles.listHeaderText}>Action</Text>
          </View>

          {entries.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No entries yet</Text>
              <Text style={styles.emptySubtitle}>
                Add emails above to grant access to Daxi
              </Text>
            </View>
          ) : (
            entries.map((entry, idx) => (
              <View
                key={entry.id}
                style={[
                  styles.listRow,
                  idx % 2 === 1 && styles.listRowAlt,
                  idx === entries.length - 1 && styles.listRowLast,
                ]}
              >
                <Text style={styles.listCell} numberOfLines={1}>
                  {entry.email}
                </Text>
                <View style={styles.listCell}>
                  <View
                    style={[
                      styles.rolePill,
                      entry.role === 'curator'
                        ? styles.rolePillCurator
                        : styles.rolePillExaminee,
                    ]}
                  >
                    <Text
                      style={[
                        styles.rolePillText,
                        entry.role === 'curator'
                          ? styles.rolePillTextCurator
                          : styles.rolePillTextExaminee,
                      ]}
                    >
                      {entry.role}
                    </Text>
                  </View>
                </View>
                <Text style={styles.listCell}>
                  {entry.used ? (
                    <Text style={{ color: colors.success }}>Used</Text>
                  ) : (
                    <Text style={{ color: colors.textMuted }}>Pending</Text>
                  )}
                </Text>
                <View style={styles.listCell}>
                  <TouchableOpacity
                    onPress={() => handleDelete(entry.id, entry.email)}
                    disabled={deletingId === entry.id}
                    style={styles.deleteBtn}
                  >
                    <Text style={styles.deleteBtnText}>
                      {deletingId === entry.id ? '...' : 'Remove'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  pageHeader: { marginBottom: spacing.xl },
  pageTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  pageSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  addCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  addCardTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  addRow: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: spacing.md,
    alignItems: Platform.OS === 'web' ? 'flex-start' : 'stretch',
  },
  addEmailInput: {
    flex: Platform.OS === 'web' ? 1 : undefined,
  },
  noMargin: { marginBottom: 0 },
  addRoleSelector: {
    gap: spacing.xs,
  },
  roleLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  roleTabs: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    height: 44,
  },
  roleTab: {
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    backgroundColor: colors.surface,
  },
  roleTabActive: {
    backgroundColor: colors.primary,
  },
  roleTabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  roleTabTextActive: {
    color: '#fff',
    fontWeight: fontWeight.semibold,
  },
  addBtn: { alignSelf: 'flex-start' },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
    marginBottom: spacing.sm,
  },
  errorText: { fontSize: fontSize.sm, color: colors.error },
  listCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  listHeader: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listHeaderText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listRowAlt: { backgroundColor: colors.surface },
  listRowLast: { borderBottomWidth: 0 },
  listCell: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  rolePill: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
  },
  rolePillCurator: { backgroundColor: '#EFF6FF' },
  rolePillExaminee: { backgroundColor: '#F0FDF4' },
  rolePillText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  rolePillTextCurator: { color: colors.primary },
  rolePillTextExaminee: { color: colors.success },
  deleteBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
    alignSelf: 'flex-start',
  },
  deleteBtnText: { fontSize: fontSize.xs, color: colors.error, fontWeight: fontWeight.medium },
  emptyState: { padding: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
});
