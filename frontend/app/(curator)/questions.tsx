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
import { questionsService, Question } from '../../services/questions';
import { documentsService, Document } from '../../services/documents';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

export default function QuestionsScreen() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [newQuestion, setNewQuestion] = useState('');
  const [questionError, setQuestionError] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [deletingId, setDeletingId] = useState<number | string | null>(null);

  // AI generation modal
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await questionsService.getAll();
      setQuestions(data);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load questions');
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
    setQuestionError('');
    if (!newQuestion.trim()) {
      setQuestionError('Question text is required');
      return;
    }
    setIsAdding(true);
    try {
      const q = await questionsService.create({ text: newQuestion.trim() });
      setQuestions((prev) => [q, ...prev]);
      setNewQuestion('');
    } catch (err: unknown) {
      setQuestionError(err instanceof Error ? err.message : 'Failed to add question');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: number | string, text: string) => {
    const doDelete = async () => {
      setDeletingId(id);
      try {
        await questionsService.delete(id);
        setQuestions((prev) => prev.filter((q) => q.id !== id));
      } catch (err: unknown) {
        if ((err as any)?.status === 404) {
          setQuestions((prev) => prev.filter((q) => q.id !== id));
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

    const safeText = text || '';
    const preview = safeText.length > 60 ? safeText.slice(0, 60) + '...' : safeText;
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete question: "${preview}"?`)) await doDelete();
    } else {
      Alert.alert('Delete Question', `Delete: "${preview}"?`, [
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
    if (!selectedDocId) {
      setGenerateError('Please select a document');
      return;
    }
    setIsGenerating(true);
    setGenerateError('');
    try {
      const generated = await questionsService.generateAI(selectedDocId, 5);
      setQuestions((prev) => [...generated, ...prev]);
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
              <Text style={styles.pageTitle}>Questions</Text>
              <Text style={styles.pageSubtitle}>
                {questions.length} question{questions.length !== 1 ? 's' : ''} total
              </Text>
            </View>
            <Button title="Generate with AI" onPress={openAiModal} variant="outline" />
          </View>

          {/* Add form */}
          <View style={styles.addCard}>
            <Text style={styles.addCardTitle}>Add Question</Text>
            <Input
              value={newQuestion}
              onChangeText={setNewQuestion}
              placeholder="Enter question text..."
              multiline
              minHeight={80}
              error={questionError}
              containerStyle={styles.noMargin}
            />
            <Button
              title="Add Question"
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
              <Text style={[styles.listHeaderText, { flex: 3 }]}>Question</Text>
              <Text style={styles.listHeaderText}>Source</Text>
              <Text style={styles.listHeaderText}>Action</Text>
            </View>

            {questions.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No questions yet</Text>
                <Text style={styles.emptySubtitle}>
                  Add questions manually or generate them with AI
                </Text>
              </View>
            ) : (
              questions.map((q, idx) => (
                <View
                  key={q.id}
                  style={[
                    styles.listRow,
                    idx % 2 === 1 && styles.listRowAlt,
                    idx === questions.length - 1 && styles.listRowLast,
                  ]}
                >
                  <View style={[styles.questionCell, { flex: 3 }]}>
                    <Text style={styles.questionText}>{q.text}</Text>
                    {q.auto_generated && (
                      <View style={styles.aiBadge}>
                        <Text style={styles.aiBadgeText}>AI</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.listCell} numberOfLines={1}>
                    {q.source || '—'}
                  </Text>
                  <View style={styles.listCell}>
                    <TouchableOpacity
                      onPress={() => handleDelete(q.id, q.text)}
                      disabled={deletingId === q.id}
                      style={styles.deleteBtn}
                    >
                      <Text style={styles.deleteBtnText}>
                        {deletingId === q.id ? '...' : 'Delete'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* AI Generation Modal */}
      <Modal
        visible={aiModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAiModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Generate Questions with AI</Text>
            <Text style={styles.modalSubtitle}>
              Select a document to generate 5 questions from
            </Text>

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
              <Button
                title="Cancel"
                onPress={() => setAiModalVisible(false)}
                variant="secondary"
              />
              <Button
                title="Generate 5 Questions"
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
  questionCell: {
    flex: 1,
    gap: spacing.xs,
  },
  questionText: { fontSize: fontSize.sm, color: colors.text, lineHeight: fontSize.sm * 1.5 },
  aiBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderRadius: 4,
    paddingVertical: 1,
    paddingHorizontal: spacing.xs,
  },
  aiBadgeText: { fontSize: 10, fontWeight: fontWeight.bold, color: colors.primary },
  listCell: { flex: 1, fontSize: fontSize.sm, color: colors.text },
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
  // Modal
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
  noDocsBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
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
  docItemSelected: {
    borderColor: colors.primary,
    backgroundColor: '#EFF6FF',
  },
  docRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
  },
  docRadioSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  docItemText: { fontSize: fontSize.sm, color: colors.text, flex: 1 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
