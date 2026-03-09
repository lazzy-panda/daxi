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
import * as DocumentPicker from 'expo-document-picker';
import { documentsService, Document } from '../../services/documents';
import { Button } from '../../components/Button';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

const STATUS_COLORS: Record<Document['status'], string> = {
  processing: colors.warning,
  ready: colors.success,
  failed: colors.error,
};

const STATUS_BG: Record<Document['status'], string> = {
  processing: '#FFFBEB',
  ready: '#F0FDF4',
  failed: '#FEF2F2',
};

function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function DocumentsScreen() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [deletingId, setDeletingId] = useState<number | string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await documentsService.getAll();
      setDocuments(data);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
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

  const handleUpload = async () => {
    setUploadError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'image/jpeg',
          'image/png',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploading(true);

      const formData = new FormData();
      if (Platform.OS === 'web' && (asset as any).file) {
        formData.append('file', (asset as any).file, asset.name);
      } else {
        formData.append('file', {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/octet-stream',
        } as unknown as Blob);
      }

      const doc = await documentsService.upload(formData);
      setDocuments((prev) => [doc, ...prev]);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number | string, name: string) => {
    const doDelete = async () => {
      setDeletingId(id);
      try {
        await documentsService.delete(id);
        setDocuments((prev) => prev.filter((d) => d.id !== id));
      } catch (err: unknown) {
        if ((err as any)?.status === 404) {
          setDocuments((prev) => prev.filter((d) => d.id !== id));
          return;
        }
        const msg = err instanceof Error ? (err.message || 'Delete failed') : 'Delete failed';
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Error', msg);
        }
      } finally {
        setDeletingId(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${name}"?`)) await doDelete();
    } else {
      Alert.alert('Delete Document', `Delete "${name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
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
          <View>
            <Text style={styles.pageTitle}>Documents</Text>
            <Text style={styles.pageSubtitle}>
              Upload source material for AI question and flashcard generation
            </Text>
          </View>
          <Button
            title={uploading ? 'Uploading...' : 'Upload Document'}
            onPress={handleUpload}
            loading={uploading}
          />
        </View>

        {uploadError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{uploadError}</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.listCard}>
          <View style={styles.listHeader}>
            <Text style={[styles.listHeaderText, { flex: 3 }]}>Name</Text>
            <Text style={styles.listHeaderText}>Status</Text>
            <Text style={styles.listHeaderText}>Size</Text>
            <Text style={styles.listHeaderText}>Uploaded</Text>
            <Text style={styles.listHeaderText}>Action</Text>
          </View>

          {documents.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No documents uploaded</Text>
              <Text style={styles.emptySubtitle}>
                Upload PDFs, Word docs, text files or images to use as AI source material
              </Text>
            </View>
          ) : (
            documents.map((doc, idx) => (
              <View
                key={doc.id}
                style={[
                  styles.listRow,
                  idx % 2 === 1 && styles.listRowAlt,
                  idx === documents.length - 1 && styles.listRowLast,
                ]}
              >
                <View style={[styles.nameCell, { flex: 3 }]}>
                  <View style={styles.docIconBg}>
                    <Text style={styles.docIconText}>
                      {doc.filename?.split('.').pop()?.toUpperCase() || 'DOC'}
                    </Text>
                  </View>
                  <Text style={styles.docName} numberOfLines={1}>
                    {doc.name || doc.filename}
                  </Text>
                </View>
                <View style={styles.listCell}>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: STATUS_BG[doc.status] },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: STATUS_COLORS[doc.status] },
                      ]}
                    >
                      {doc.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.listCell}>{formatBytes(doc.size)}</Text>
                <Text style={styles.listCell}>{formatDate(doc.created_at)}</Text>
                <View style={styles.listCell}>
                  <TouchableOpacity
                    onPress={() =>
                      handleDelete(doc.id, doc.name || doc.filename)
                    }
                    disabled={deletingId === doc.id}
                    style={styles.deleteBtn}
                  >
                    <Text style={styles.deleteBtnText}>
                      {deletingId === doc.id ? '...' : 'Delete'}
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
  pageHeader: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    justifyContent: 'space-between',
    alignItems: Platform.OS === 'web' ? 'flex-start' : 'stretch',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  pageTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  pageSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
    marginBottom: spacing.md,
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
  nameCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  docIconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docIconText: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  docName: { flex: 1, fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium },
  listCell: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  statusPill: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'capitalize' },
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
