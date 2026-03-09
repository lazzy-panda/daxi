import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthContext } from '../../context/AuthContext';
import { colors, spacing, fontSize, fontWeight, shadow } from '../../constants/theme';

const NAV_ITEMS = [
  { label: 'Dashboard', segment: '', icon: 'grid-outline' as const },
  { label: 'History', segment: 'history', icon: 'time-outline' as const },
  { label: 'Study', segment: 'study', icon: 'layers-outline' as const },
];

export default function ExamineeLayout() {
  const { user, logout } = useAuthContext();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const isActive = (segment: string) => {
    if (segment === '') {
      return pathname === '/' || pathname === '/(examinee)' || pathname === '/examinee';
    }
    return pathname.includes(segment);
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View style={styles.topBarInner}>
          <View style={styles.topBarLeft}>
            <Image source={require('../../assets/logo.png')} style={styles.logoMark} resizeMode="contain" />
          </View>

          <View style={styles.topBarCenter}>
            {NAV_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.segment}
                style={[
                  styles.navItem,
                  isActive(item.segment) && styles.navItemActive,
                ]}
                onPress={() =>
                  router.push(
                    item.segment
                      ? (`/(examinee)/${item.segment}` as never)
                      : ('/(examinee)' as never)
                  )
                }
              >
                <Ionicons
                  name={item.icon}
                  size={15}
                  color={isActive(item.segment) ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.navItemText,
                    isActive(item.segment) && styles.navItemTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.topBarRight}>
            <Text style={styles.userEmail} numberOfLines={1}>
              {user?.name || user?.email}
            </Text>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
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
    paddingHorizontal: spacing.md,
    paddingVertical: 1,
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center' as const,
    gap: spacing.md,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoMark: {
    width: 56,
    height: 56,
  },
  logoName: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  topBarCenter: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
  },
  navItemActive: {
    backgroundColor: '#EFF6FF',
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
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  userEmail: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    maxWidth: 160,
    display: Platform.OS === 'web' ? 'flex' : 'none',
  },
  logoutBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium },
  content: { flex: 1 },
});
