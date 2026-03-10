import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  Linking,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { billingService, Plan, BillingStatus } from '../../services/billing';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { Button } from '../../components/Button';
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme';

// ── Usage bar ────────────────────────────────────────────────────────────────

function UsageBar({ used, max, label }: { used: number; max: number | null; label: string }) {
  const pct = max ? Math.min(100, (used / max) * 100) : 0;
  const color = pct >= 90 ? colors.error : pct >= 70 ? colors.warning : '#16a34a';
  return (
    <View style={ub.wrap}>
      <View style={ub.row}>
        <Text style={ub.label}>{label}</Text>
        <Text style={ub.value}>{used} / {max ?? '∞'}</Text>
      </View>
      {max && (
        <View style={ub.track}>
          <View style={[ub.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
        </View>
      )}
    </View>
  );
}

const ub = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: fontSize.sm, color: colors.textSecondary },
  value: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text },
  track: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});

// ── Plan card ────────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  free: colors.textSecondary,
  pro: colors.primary,
  business: '#7c3aed',
};

function PlanCard({
  plan,
  current,
  stripeEnabled,
  onUpgrade,
  loading,
}: {
  plan: Plan;
  current: string;
  stripeEnabled: boolean;
  onUpgrade: (key: string) => void;
  loading: string | null;
}) {
  const isCurrent = plan.key === current;
  const isDowngrade = plan.key === 'free' && current !== 'free';
  const accentColor = PLAN_COLORS[plan.key] || colors.primary;

  return (
    <View style={[pc.card, isCurrent && pc.cardActive, { borderTopColor: accentColor }]}>
      {isCurrent && (
        <View style={[pc.badge, { backgroundColor: accentColor + '18' }]}>
          <Text style={[pc.badgeText, { color: accentColor }]}>Current plan</Text>
        </View>
      )}

      <Text style={[pc.name, { color: accentColor }]}>{plan.name}</Text>
      <View style={pc.priceRow}>
        <Text style={pc.price}>
          {plan.price_monthly === 0 ? 'Free' : `$${plan.price_monthly}`}
        </Text>
        {plan.price_monthly > 0 && <Text style={pc.per}>/month</Text>}
      </View>

      <View style={pc.features}>
        {plan.features.map((f) => (
          <View key={f} style={pc.featureRow}>
            <Ionicons name="checkmark-circle" size={14} color={accentColor} />
            <Text style={pc.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      {!isCurrent && !isDowngrade && (
        <Button
          title={loading === plan.key ? 'Redirecting…' : `Upgrade to ${plan.name}`}
          onPress={() => onUpgrade(plan.key)}
          loading={loading === plan.key}
          disabled={!!loading || !stripeEnabled}
          fullWidth
        />
      )}
      {!isCurrent && !isDowngrade && !stripeEnabled && (
        <Text style={pc.noStripe}>Configure Stripe to enable payments</Text>
      )}
      {isDowngrade && !isCurrent && (
        <Text style={pc.downgrade}>Manage via customer portal to downgrade</Text>
      )}
    </View>
  );
}

const pc = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 4,
    padding: spacing.lg,
    gap: spacing.md,
    flex: 1,
    minWidth: 220,
  },
  cardActive: { borderColor: colors.primary },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  badgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  name: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  price: { fontSize: 32, fontWeight: fontWeight.bold, color: colors.text },
  per: { fontSize: fontSize.sm, color: colors.textSecondary },
  features: { gap: spacing.sm },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  featureText: { fontSize: fontSize.sm, color: colors.text },
  noStripe: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center' },
  downgrade: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center' },
});

// ── Main screen ──────────────────────────────────────────────────────────────

export default function BillingScreen() {
  const params = useLocalSearchParams<{ success?: string; canceled?: string }>();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState('');

  const containerStyle = Platform.OS === 'web'
    ? { maxWidth: 1000, width: '100%', alignSelf: 'center' as const }
    : {};

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([billingService.getStatus(), billingService.getPlans()]);
      setStatus(s);
      setPlans(p);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Failed to load billing info');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpgrade = async (planKey: string) => {
    setUpgrading(planKey);
    setError('');
    try {
      const { checkout_url } = await billingService.createCheckout(planKey);
      if (Platform.OS === 'web') {
        window.location.href = checkout_url;
      } else {
        await Linking.openURL(checkout_url);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to start checkout');
      setUpgrading(null);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { portal_url } = await billingService.getPortal();
      if (Platform.OS === 'web') {
        window.location.href = portal_url;
      } else {
        await Linking.openURL(portal_url);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to open customer portal');
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <View style={containerStyle}>
        <Text style={styles.pageTitle}>Billing & Plans</Text>

        {/* Success / canceled banners */}
        {params.success === '1' && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
            <Text style={styles.successText}>Subscription activated! Your plan has been updated.</Text>
          </View>
        )}
        {params.canceled === '1' && (
          <View style={styles.warnBanner}>
            <Ionicons name="information-circle" size={18} color={colors.warning} />
            <Text style={styles.warnText}>Checkout canceled. No charges were made.</Text>
          </View>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Current usage */}
        {status && (
          <View style={styles.usageCard}>
            <View style={styles.usageHeader}>
              <View>
                <Text style={styles.usageTitle}>Current Usage</Text>
                <Text style={styles.usagePlan}>
                  {status.plan_name} Plan
                </Text>
              </View>
              {status.plan !== 'free' && status.stripe_enabled && (
                <Button
                  title={portalLoading ? 'Loading…' : 'Manage Subscription'}
                  onPress={handlePortal}
                  loading={portalLoading}
                  variant="outline"
                  size="sm"
                />
              )}
            </View>
            <View style={styles.usageBars}>
              <UsageBar used={status.usage_users} max={status.max_users} label="Allowlist users" />
              <UsageBar used={status.usage_docs} max={status.max_docs} label="Documents" />
            </View>
          </View>
        )}

        {/* Plan cards */}
        <Text style={styles.sectionTitle}>Available Plans</Text>
        <View style={styles.plansRow}>
          {plans.map((p) => (
            <PlanCard
              key={p.key}
              plan={p}
              current={status?.plan || 'free'}
              stripeEnabled={status?.stripe_enabled ?? false}
              onUpgrade={handleUpgrade}
              loading={upgrading}
            />
          ))}
        </View>

        {!status?.stripe_enabled && (
          <View style={styles.demoNotice}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.demoText}>
              Payments are in demo mode. Set <Text style={styles.code}>STRIPE_SECRET_KEY</Text> and price IDs in Railway to enable real billing.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  pageTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.lg },

  successBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#F0FDF4', borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: '#BBF7D0', marginBottom: spacing.md,
  },
  successText: { fontSize: fontSize.sm, color: '#16a34a', fontWeight: fontWeight.medium, flex: 1 },
  warnBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#FFFBEB', borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: '#FDE68A', marginBottom: spacing.md,
  },
  warnText: { fontSize: fontSize.sm, color: colors.warning, fontWeight: fontWeight.medium, flex: 1 },
  errorBox: {
    backgroundColor: '#FEE2E2', borderRadius: radius.md, padding: spacing.md,
    borderLeftWidth: 4, borderLeftColor: colors.error, marginBottom: spacing.md,
  },
  errorText: { fontSize: fontSize.sm, color: colors.error },

  usageCard: {
    backgroundColor: colors.background, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg,
    gap: spacing.md, marginBottom: spacing.xl,
  },
  usageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  usageTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  usagePlan: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  usageBars: { gap: spacing.md },

  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.md },
  plansRow: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: spacing.md,
    flexWrap: 'wrap',
    marginBottom: spacing.xl,
  },

  demoNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.background, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  demoText: { fontSize: fontSize.sm, color: colors.textSecondary, flex: 1, lineHeight: fontSize.sm * 1.6 },
  code: { fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier', color: colors.text },
});
