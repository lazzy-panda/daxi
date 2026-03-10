import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { documentsService, Document } from '../../services/documents';
import { questionsService } from '../../services/questions';
import { allowlistService } from '../../services/allowlist';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

const STEPS = ['Upload Document', 'Generate Questions', 'Invite Examinee'];

// ── Step indicator ──────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <View style={si.row}>
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={i}>
            <View style={si.item}>
              <View style={[si.circle, done && si.circleDone, active && si.circleActive]}>
                {done ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : (
                  <Text style={[si.num, active && si.numActive]}>{i + 1}</Text>
                )}
              </View>
              <Text style={[si.label, active && si.labelActive]}>{label}</Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[si.line, done && si.lineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const si = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xxl },
  item: { alignItems: 'center', gap: 6 },
  circle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  circleDone: { backgroundColor: '#16a34a' },
  circleActive: { backgroundColor: colors.primary },
  num: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textSecondary },
  numActive: { color: '#fff' },
  label: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: fontWeight.medium, textAlign: 'center', maxWidth: 80 },
  labelActive: { color: colors.primary, fontWeight: fontWeight.semibold },
  line: { flex: 1, height: 2, backgroundColor: colors.border, marginBottom: 18, marginHorizontal: 4 },
  lineDone: { backgroundColor: '#16a34a' },
});

// ── Step 1: Upload Document ─────────────────────────────────────────────────

function Step1({ onDone, onSkip }: { onDone: (doc: Document) => void; onSkip: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploaded, setUploaded] = useState<Document | null>(null);

  const handleUpload = async () => {
    setError('');
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
      setUploaded(doc);
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.stepBox}>
      <Text style={styles.stepTitle}>Upload your first document</Text>
      <Text style={styles.stepDesc}>
        Upload a PDF, Word doc, or text file. Daxi will process it and use it to generate exam questions and flashcards.
      </Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {uploaded ? (
        <View style={styles.successBox}>
          <Ionicons name="document-text" size={20} color="#16a34a" />
          <Text style={styles.successText}>{uploaded.name || uploaded.filename}</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.uploadArea} onPress={handleUpload} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={32} color={colors.textSecondary} />
              <Text style={styles.uploadLabel}>Click to upload</Text>
              <Text style={styles.uploadSub}>PDF, DOCX, TXT, JPG, PNG</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.actions}>
        <Button
          title={uploaded ? 'Continue' : 'Upload & Continue'}
          onPress={uploaded ? () => onDone(uploaded) : handleUpload}
          loading={uploading}
          disabled={uploading}
        />
        <TouchableOpacity onPress={onSkip} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip this step</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Step 2: Generate Questions ─────────────────────────────────────────────

const Q_TYPES = [
  { key: 'open', label: 'Open-ended', icon: 'create-outline', color: colors.primary, bg: '#EFF6FF' },
  { key: 'mcq', label: 'Multiple Choice', icon: 'list-outline', color: '#16a34a', bg: '#F0FDF4' },
  { key: 'true_false', label: 'True / False', icon: 'checkmark-circle-outline', color: '#c2410c', bg: '#FFF7ED' },
  { key: 'short', label: 'Short Answer', icon: 'pencil-outline', color: '#7c3aed', bg: '#F5F3FF' },
] as const;

function Step2({
  doc,
  onDone,
  onSkip,
}: {
  doc: Document | null;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<string>('mcq');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!doc) { onSkip(); return; }
    setError('');
    setGenerating(true);
    try {
      if (selected === 'open') await questionsService.generateAI(doc.id, 5);
      else if (selected === 'mcq') await questionsService.generateMCQ(doc.id, 5);
      else if (selected === 'short') await questionsService.generateShort(doc.id, 5);
      else if (selected === 'true_false') await questionsService.generateTrueFalse(doc.id, 5);
      setGenerated(true);
    } catch (err: any) {
      setError(err?.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={styles.stepBox}>
      <Text style={styles.stepTitle}>Generate your first questions</Text>
      <Text style={styles.stepDesc}>
        {doc
          ? `We'll generate 5 questions from "${doc.name || doc.filename}". Pick a question type:`
          : 'No document uploaded — you can generate questions manually from the Questions page later.'}
      </Text>

      {doc && (
        <View style={styles.typeGrid}>
          {Q_TYPES.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.typeCard, { backgroundColor: t.bg, borderColor: selected === t.key ? t.color : colors.border }]}
              onPress={() => setSelected(t.key)}
            >
              <Ionicons name={t.icon as any} size={20} color={t.color} />
              <Text style={[styles.typeLabel, { color: t.color }]}>{t.label}</Text>
              {selected === t.key && (
                <Ionicons name="checkmark-circle" size={16} color={t.color} style={styles.typeCheck} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {generated && (
        <View style={styles.successBox}>
          <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
          <Text style={styles.successText}>5 questions generated successfully!</Text>
        </View>
      )}

      <View style={styles.actions}>
        {generated ? (
          <Button title="Continue" onPress={onDone} />
        ) : (
          <Button
            title={doc ? 'Generate Questions' : 'Skip'}
            onPress={doc ? handleGenerate : onSkip}
            loading={generating}
            disabled={generating}
          />
        )}
        <TouchableOpacity onPress={onSkip} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip this step</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Step 3: Invite Examinee ────────────────────────────────────────────────

function Step3({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [invited, setInvited] = useState(false);
  const [error, setError] = useState('');

  const handleInvite = async () => {
    if (!email.trim()) { setError('Enter an email address'); return; }
    setError('');
    setLoading(true);
    try {
      await allowlistService.add({ email: email.trim(), role: 'examinee' });
      setInvited(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to add to allowlist');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.stepBox}>
      <Text style={styles.stepTitle}>Invite your first examinee</Text>
      <Text style={styles.stepDesc}>
        Add an email to the allowlist. That person can register and take exams in your organization.
      </Text>

      {invited ? (
        <View style={styles.successBox}>
          <Ionicons name="mail" size={20} color="#16a34a" />
          <Text style={styles.successText}>{email} added to allowlist!</Text>
        </View>
      ) : (
        <>
          <Input
            label="Examinee email"
            value={email}
            onChangeText={setEmail}
            placeholder="colleague@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
            error={error}
          />
          <Button
            title="Add to Allowlist"
            onPress={handleInvite}
            loading={loading}
            disabled={loading}
            fullWidth
          />
        </>
      )}

      <View style={styles.actions}>
        <Button title="Finish Setup" onPress={onDone} variant={invited ? 'primary' : 'outline'} />
        {!invited && (
          <TouchableOpacity onPress={onDone} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip & finish</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Main Onboarding screen ─────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [uploadedDoc, setUploadedDoc] = useState<Document | null>(null);

  const finish = () => router.replace('/(curator)' as never);
  const next = () => setStep((s) => s + 1);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Welcome to Daxi!</Text>
          <Text style={styles.headerSub}>
            Let's get your learning platform set up in 3 quick steps.
          </Text>
        </View>

        <StepIndicator current={step} />

        {step === 0 && (
          <Step1
            onDone={(doc) => { setUploadedDoc(doc); next(); }}
            onSkip={next}
          />
        )}
        {step === 1 && (
          <Step2
            doc={uploadedDoc}
            onDone={next}
            onSkip={next}
          />
        )}
        {step === 2 && <Step3 onDone={finish} />}

        {/* Skip all */}
        {step < 2 && (
          <TouchableOpacity onPress={finish} style={styles.skipAllBtn}>
            <Text style={styles.skipAllText}>Skip setup and go to dashboard</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, paddingBottom: spacing.xxl },
  container: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },

  header: { marginBottom: spacing.xxl, alignItems: 'center' },
  headerTitle: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs, textAlign: 'center' },
  headerSub: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },

  stepBox: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.lg,
  },
  stepTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  stepDesc: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: fontSize.sm * 1.6 },

  uploadArea: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  uploadLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  uploadSub: { fontSize: fontSize.xs, color: colors.textSecondary },

  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    minWidth: 140,
    flex: 1,
  },
  typeLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, flex: 1 },
  typeCheck: { marginLeft: 'auto' },

  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#F0FDF4',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  successText: { fontSize: fontSize.sm, color: '#16a34a', fontWeight: fontWeight.medium, flex: 1 },

  errorText: { fontSize: fontSize.sm, color: colors.error },

  actions: { gap: spacing.sm, marginTop: spacing.xs },

  skipBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { fontSize: fontSize.sm, color: colors.textSecondary, textDecorationLine: 'underline' },

  skipAllBtn: { alignItems: 'center', marginTop: spacing.xl },
  skipAllText: { fontSize: fontSize.sm, color: colors.textMuted, textDecorationLine: 'underline' },
});
