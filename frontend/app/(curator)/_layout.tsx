import React, { useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthContext } from '../../context/AuthContext';
import { colors, spacing, fontSize, fontWeight, shadow } from '../../constants/theme';

const NAV_ITEMS = [
  { label: 'Allowlist', href: '/(curator)/allowlist', icon: 'people-outline' as const },
  { label: 'Documents', href: '/(curator)/documents', icon: 'document-text-outline' as const },
  { label: 'Questions', href: '/(curator)/questions', icon: 'help-circle-outline' as const },
  { label: 'Flash Cards', href: '/(curator)/flashcards', icon: 'layers-outline' as const },
  { label: 'Results', href: '/(curator)/results', icon: 'bar-chart-outline' as const },
  { label: 'Analytics', href: '/(curator)/analytics', icon: 'stats-chart-outline' as const },
];

export default function CuratorLayout() {
  const { user, logout, org, isLoading } = useAuthContext();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && org === null && pathname !== '/setup') {
      router.replace('/(curator)/setup' as never);
    }
  }, [isLoading, org, pathname]);

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.root}>
      {/* Top nav bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarInner}>
          <View style={styles.topBarLeft}>
            <TouchableOpacity onPress={() => router.push('/(curator)' as never)}>
              <Image source={require('../../assets/logo.png')} style={styles.logoMark} resizeMode="contain" />
            </TouchableOpacity>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>Curator</Text>
            </View>
            {org && (
              <Text style={styles.orgName}>{org.name}</Text>
            )}
          </View>
          <View style={styles.topBarRight}>
            <Text style={styles.userEmail}>{user?.email}</Text>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Secondary nav */}
      <View style={styles.secondaryNav}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.navScroll}
        >
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === '/(curator)'
                ? pathname === '/' || pathname === '/(curator)' || pathname === '/curator'
                : pathname.includes(item.href.replace('/(curator)/', ''));
            return (
              <TouchableOpacity
                key={item.href}
                style={[styles.navItem, isActive && styles.navItemActive]}
                onPress={() => router.push(item.href as never)}
              >
                <Ionicons
                  name={item.icon}
                  size={15}
                  color={isActive ? colors.primary : colors.textSecondary}
                  style={styles.navIcon}
                />
                <Text
                  style={[
                    styles.navItemText,
                    isActive && styles.navItemTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  topBar: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    height: 64,
    ...shadow.sm,
  },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 1,
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center' as const,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoMark: {
    width: 126,
    height: 56,
  },
  logoName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  roleBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 2,
    // paddingHorizontal: spacing.sm,
  },
  roleText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  orgName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    display: Platform.OS === 'web' ? 'flex' : 'none',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  userEmail: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    display: Platform.OS === 'web' ? 'flex' : 'none',
  },
  logoutBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  secondaryNav: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navScroll: {
    paddingHorizontal: spacing.md,
    maxWidth: 1200,
    alignSelf: 'center' as const,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginRight: spacing.xs,
  },
  navIcon: {
    marginTop: 1,
  },
  navItemActive: {
    borderBottomColor: colors.primary,
  },
  navItemText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  navItemTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  content: {
    flex: 1,
  },
});
