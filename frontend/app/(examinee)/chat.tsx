import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { documentsService, Document } from '../../services/documents';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
}

// ── Document picker strip ────────────────────────────────────────────────────

function DocStrip({
  docs,
  selected,
  onSelect,
}: {
  docs: Document[];
  selected: Document | null;
  onSelect: (d: Document) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={strip.scroll}
      contentContainerStyle={strip.content}
    >
      {docs.map((d) => {
        const active = selected?.id === d.id;
        return (
          <TouchableOpacity
            key={d.id}
            style={[strip.pill, active && strip.pillActive]}
            onPress={() => onSelect(d)}
          >
            <Ionicons
              name="document-text-outline"
              size={13}
              color={active ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[strip.pillText, active && strip.pillTextActive]}
              numberOfLines={1}
            >
              {d.name || d.filename}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const strip = StyleSheet.create({
  scroll: { backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
  content: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: 200,
  },
  pillActive: { borderColor: colors.primary, backgroundColor: '#EFF6FF' },
  pillText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: fontWeight.medium },
  pillTextActive: { color: colors.primary, fontWeight: fontWeight.semibold },
});

// ── Source accordion ─────────────────────────────────────────────────────────

function SourcesAccordion({ sources }: { sources: string[] }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  return (
    <View style={src.wrap}>
      <TouchableOpacity style={src.header} onPress={() => setOpen((o) => !o)}>
        <Ionicons name="book-outline" size={12} color={colors.textSecondary} />
        <Text style={src.headerText}>{sources.length} source excerpt{sources.length > 1 ? 's' : ''}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textSecondary} />
      </TouchableOpacity>
      {open &&
        sources.map((s, i) => (
          <View key={i} style={src.item}>
            <Text style={src.itemText}>{s}</Text>
          </View>
        ))}
    </View>
  );
}

const src = StyleSheet.create({
  wrap: { marginTop: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerText: { fontSize: 11, color: colors.textSecondary, flex: 1 },
  item: {
    marginTop: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.xs,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  itemText: { fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
});

// ── Chat message ─────────────────────────────────────────────────────────────

function ChatMessage({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <View style={[msg_.row, isUser && msg_.rowUser]}>
      {!isUser && (
        <View style={msg_.avatar}>
          <Ionicons name="sparkles" size={14} color={colors.primary} />
        </View>
      )}
      <View style={[msg_.bubble, isUser ? msg_.bubbleUser : msg_.bubbleAI]}>
        <Text style={[msg_.text, isUser && msg_.textUser]}>{msg.text}</Text>
        {!isUser && <SourcesAccordion sources={msg.sources || []} />}
      </View>
    </View>
  );
}

const msg_ = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, alignItems: 'flex-start' },
  rowUser: { flexDirection: 'row-reverse' },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  bubbleAI: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderTopRightRadius: 4,
  },
  text: { fontSize: fontSize.sm, color: colors.text, lineHeight: fontSize.sm * 1.6 },
  textUser: { color: '#fff' },
});

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [selected, setSelected] = useState<Document | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const containerStyle = Platform.OS === 'web'
    ? { maxWidth: 760, width: '100%', alignSelf: 'center' as const, flex: 1 }
    : { flex: 1 };

  useEffect(() => {
    documentsService.getAvailable()
      .then((data) => {
        setDocs(data);
        if (data.length > 0) setSelected(data[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingDocs(false));
  }, []);

  const handleSelect = useCallback((doc: Document) => {
    setSelected(doc);
    setMessages([]);
  }, []);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || !selected || sending) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const res = await documentsService.chat(selected.id, q);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: res.answer, sources: res.sources },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: err?.message || 'Failed to get an answer. Try again.' },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [input, selected, sending]);

  if (loadingDocs) return <LoadingSpinner fullScreen />;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={64}
    >
      <View style={containerStyle}>
        {/* Doc selector */}
        {docs.length > 0 ? (
          <DocStrip docs={docs} selected={selected} onSelect={handleSelect} />
        ) : (
          <View style={styles.emptyDocs}>
            <Ionicons name="document-text-outline" size={32} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>No documents available</Text>
            <Text style={styles.emptySub}>Ask your curator to upload and process course material.</Text>
          </View>
        )}

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 && selected ? (
            <View style={styles.welcomeWrap}>
              <View style={styles.welcomeIcon}>
                <Ionicons name="sparkles" size={28} color={colors.primary} />
              </View>
              <Text style={styles.welcomeTitle}>Ask anything about</Text>
              <Text style={styles.welcomeDoc}>{selected.name || selected.filename}</Text>
              <View style={styles.suggestionRow}>
                {[
                  'Summarize the main topics',
                  'What are the key concepts?',
                  'Give me 3 key takeaways',
                ].map((s) => (
                  <TouchableOpacity key={s} style={styles.suggestion} onPress={() => { setInput(s); }}>
                    <Text style={styles.suggestionText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            messages.map((m, i) => <ChatMessage key={i} msg={m} />)
          )}

          {sending && (
            <View style={[msg_.row]}>
              <View style={msg_.avatar}>
                <Ionicons name="sparkles" size={14} color={colors.primary} />
              </View>
              <View style={[msg_.bubble, msg_.bubbleAI, styles.typingBubble]}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input bar */}
        {selected && (
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask a question about this document…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
              onSubmitEditing={Platform.OS === 'web' ? send : undefined}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
              onPress={send}
              disabled={!input.trim() || sending}
            >
              <Ionicons
                name="send"
                size={18}
                color={input.trim() && !sending ? '#fff' : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },

  emptyDocs: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  emptySub: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },

  messages: { flex: 1 },
  messagesContent: { padding: spacing.md, flexGrow: 1 },

  welcomeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  welcomeIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  welcomeTitle: { fontSize: fontSize.md, color: colors.textSecondary },
  welcomeDoc: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, textAlign: 'center' },
  suggestionRow: { gap: spacing.sm, width: '100%', maxWidth: 400 },
  suggestion: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  suggestionText: { fontSize: fontSize.sm, color: colors.text },

  typingBubble: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minWidth: 60, alignItems: 'center' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 10,
    fontSize: fontSize.sm,
    color: colors.text,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.border },
});
