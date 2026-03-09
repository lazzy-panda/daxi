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
  Modal,
} from 'react-native';
import { flashcardsService, FlashCard } from '../../services/flashcards';
import { documentsService, Document } from '../../services/documents';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

export default function FlashCardsScreen() {
  const [cards, setCards] = useState<FlashCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [source, setSource] = useState('');
  const [frontError, setFrontError] = useState('');
  const [backError, setBackError] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [deletingId, setDeletingId] = useState<number | string | null>(null);

  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await flashcardsService.getAll();
      setCards(data);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load flash cards');
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
    let valid = true;
    setFrontError('');
    setBackError('');

    if (!front.trim()) { setFrontError('Front text is required'); valid = false; }
    if (!back.trim()) { setBackError('Back text is required'); valid = false; }
    if (!valid) return;

    setIsAdding(true);
    try {
      const card = await flashcardsService.create({
        front: front.trim(),
        back: back.trim(),
        source: source.trim() || undefined,
      });
      setCards((prev) => [card, ...prev]);
      setFront('');
      setBack('');
      setSource('');
    } catch (err: unknown) {
      setFrontError(err instanceof Error ? err.message : 'Failed to add card');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: number | string) => {
    const doDelete = async () => {
      setDeletingId(id);
      try {
        await flashcardsService.delete(id);
        setCards((prev) => prev.filter((c) => c.id !== id));
      } catch (err: unknown) {
        if ((err as any)?.status === 404) {
          setCards((prev) => prev.filter((c) => c.id !== id));
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
      if (window.confirm('Delete this flash card?')) await doDelete();
    } else {
      Alert.alert('Delete Card', 'Delete this flash card?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const openAiModal = async () => {
    setGenerateError('');
    setSelectedDocId(null);
    try {
      const docs = await documentsService.getAll();
      setDocuments(docs.filter((d) => d.status === 'ready'));
    } catch {
      setDocuments([]);
    }
    setAiModalVisible(true);
  };

  const handleGenerate = async () => {
    if (!selectedDocId) { setGenerateError('Please select a document'); return; }
    setIsGenerating(true);
    setGenerateError('');
    try {
      const generated = await flashcardsService.generateAI(selectedDocId);
      setCards((prev) => [...generated, ...prev]);
      setAiModalVisible(false);
    } catch (err: unknown) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const containerStyle =
    Platform.OS === 'web'
      ? { maxWidth: 1200, width: '100%', alignSelf: 'center' as const }
      : {};

  if (isLoading) return <LoadingSpinner fullScreen />;

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={containerStyle}>
          <View style={styles.pageHeader}>
            <View>
              <Text style={styles.pageTitle}>Flash Cards</Text>
              <Text style={styles.pageSubtitle}>
                {cards.length} card{cards.length !== 1 ? 's' : ''} total
              </Text>
            </View>
            <Button title="Generate with AI" onPress={openAiModal} variant="outline" />
          </View>

          {/* Add form */}
          <View style={styles.addCard}>
            <Text style={styles.addCardTitle}>Add Flash Card</Text>
            <View style={styles.addRow}>
              <View style={styles.addField}>
                <Input
                  label="Front (Question / Concept)"
                  value={front}
                  onChangeText={setFront}
                  placeholder="What is...?"
                  multiline
                  minHeight={80}
                  error={frontError}
                  containerStyle={styles.noMargin}
                />
              </View>
              <View style={styles.addField}>
                <Input
                  label="Back (Answer)"
                  value={back}
                  onChangeText={setBack}
                  placeholder="The answer is..."
                  multiline
                  minHeight={80}
                  error={backError}
                  containerStyle={styles.noMargin}
                />
              </View>
            </View>
            <Input
              label="Source (optional)"
              value={source}
              onChangeText={setSource}
              placeholder="Chapter 3, page 42..."
              containerStyle={styles.noMargin}
            />
            <Button
              title="Add Flash Card"
              onPress={handleAdd}
              loading={isAdding}
              style={styles.addBtn}
            />
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* List */}
          <View style={styles.listCard}>
            <View style={styles.listHeader}>
              <Text style={[styles.listHeaderText, { flex: 2 }]}>Front</Text>
              <Text style={[styles.listHeaderText, { flex: 2 }]}>Back</Text>
              <Text style={styles.listHeaderText}>Source</Text>
              <Text style={styles.listHeaderText}>Action</Text>
            </View>

            {cards.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No flash cards yet</Text>
                <Text style={styles.emptySubtitle}>
                  Add cards manually or generate them with AI from your documents
                </Text>
              </View>
            ) : (
              cards.map((card, idx) => (
                <View
                  key={card.id}
                  style={[
                    styles.listRow,
                    idx % 2 === 1 && styles.listRowAlt,
                    idx === cards.length - 1 && styles.listRowLast,
                  ]}
                >
                  <View style={[{ flex: 2 }, styles.cellWithBadge]}>
                    <Text style={styles.cellText} numberOfLines={3}>{card.front}</Text>
                    {card.auto_generated && (
                      <View style={styles.aiBadge}>
                        <Text style={styles.aiBadgeText}>AI</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.listCell, { flex: 2 }]} numberOfLines={3}>
                    {card.back}
                  </Text>
                  <Text style={styles.listCell} numberOfLines={1}>
                    {card.source || '—'}
                  </Text>
                  <View style={styles.listCell}>
                    <TouchableOpacity
                      onPress={() => handleDelete(card.id)}
                      disabled={deletingId === card.id}
                      style={styles.deleteBtn}
                    >
                      <Text style={styles.deleteBtnText}>
                        {deletingId === card.id ? '...' : 'Delete'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={aiModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAiModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Generate Flash Cards with AI</Text>
            <Text style={styles.modalSubtitle}>Select a document as the source</Text>

            {generateError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{generateError}</Text>
              </View>
            ) : null}

            {documents.length === 0 ? (
              <View style={styles.noDocsBox}>
                <Text style={styles.noDocsText}>
                  No ready documents found. Upload and process a document first.
                </Text>
              </View>
            ) : (
              <View style={styles.docList}>
                {documents.map((doc) => (
                  <TouchableOpacity
                    key={doc.id}
                    style={[
                      styles.docItem,
                      selectedDocId === doc.id && styles.docItemSelected,
                    ]}
                    onPress={() => setSelectedDocId(doc.id)}
                  >
                    <View
                      style={[
                        styles.docRadio,
                        selectedDocId === doc.id && styles.docRadioSelected,
                      ]}
                    />
                    <Text style={styles.docItemText}>{doc.name || doc.filename}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setAiModalVisible(false)} variant="secondary" />
              <Button
                title="Generate Cards"
                onPress={handleGenerate}
                loading={isGenerating}
                disabled={!selectedDocId}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
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
  addCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  addCardTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  addRow: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: spacing.md,
  },
  addField: { flex: 1 },
  noMargin: { marginBottom: 0 },
  addBtn: { alignSelf: 'flex-start' },
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
  cellWithBadge: { gap: spacing.xs },
  cellText: { fontSize: fontSize.sm, color: colors.text, lineHeight: fontSize.sm * 1.5 },
  listCell: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  aiBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderRadius: 4,
    paddingVertical: 1,
    paddingHorizontal: spacing.xs,
  },
  aiBadgeText: { fontSize: 10, fontWeight: fontWeight.bold, color: colors.primary },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 480,
    gap: spacing.md,
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  modalSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary },
  noDocsBox: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  noDocsText: { fontSize: fontSize.sm, color: colors.textSecondary },
  docList: { gap: spacing.sm },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  docItemSelected: { borderColor: colors.primary, backgroundColor: '#EFF6FF' },
  docRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
  },
  docRadioSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  docItemText: { fontSize: fontSize.sm, color: colors.text, flex: 1 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
