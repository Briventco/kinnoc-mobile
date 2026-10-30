import { Image } from 'expo-image';
import { Download, PlusSquare, Share, X } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Text } from '@/components/Text';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { colors, radius, shadow, space } from '@/theme';

export function PwaInstallPrompt() {
  const { canPrompt, isIOS, hasNativePrompt, install, dismiss } = usePwaInstall();

  if (!canPrompt) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.sheet} accessibilityRole="region" accessibilityLabel="Install Kinnoc">
        <View style={styles.header}>
          <Image source={require('@/../assets/images/icon.png')} style={styles.icon} contentFit="cover" />
          <View style={styles.headerText}>
            <Text variant="headline" style={styles.title}>
              Install Kinnoc
            </Text>
            <Text variant="meta" color="textSecondary">
              web.kinnoc.app
            </Text>
          </View>
          <IconButton icon={X} label="Dismiss installation prompt" onPress={dismiss} />
        </View>

        {isIOS ? (
          <View style={styles.content}>
            <Text variant="post" color="textSecondary" style={styles.intro}>
              Install Kinnoc on your iPhone for the full app experience:
            </Text>
            <View style={styles.steps}>
              <View style={styles.stepRow}>
                <View style={styles.stepBadge}>
                  <Share size={16} color={colors.primary} />
                </View>
                <Text variant="post" style={styles.stepText}>
                  1. Tap the <Text variant="rowTitle">Share</Text> button in Safari’s navigation bar.
                </Text>
              </View>
              <View style={styles.stepRow}>
                <View style={styles.stepBadge}>
                  <PlusSquare size={16} color={colors.primary} />
                </View>
                <Text variant="post" style={styles.stepText}>
                  2. Scroll down and choose <Text variant="rowTitle">Add to Home Screen</Text>.
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Button label="Got it" size="large" onPress={dismiss} />
              <Button label="Continue in browser" variant="text" subdued onPress={dismiss} style={styles.secondary} />
            </View>
          </View>
        ) : (
          <View style={styles.content}>
            <Text variant="post" color="textSecondary" style={styles.intro}>
              Add Kinnoc to your device for instant launch, smooth animations, and full-screen immersion.
            </Text>
            <View style={styles.actions}>
              {hasNativePrompt ? (
                <Button label="Install App" size="large" icon={Download} onPress={() => void install()} />
              ) : null}
              <Button label="Continue in browser" variant="text" subdued onPress={dismiss} style={styles.secondary} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    padding: space[4],
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: radius.sheet,
    padding: space[5],
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.float,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    marginBottom: space[3],
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    marginBottom: 2,
  },
  content: {
    gap: space[4],
  },
  intro: {
    lineHeight: 20,
  },
  steps: {
    gap: space[2],
    backgroundColor: colors.surface2,
    padding: space[3],
    borderRadius: radius.field,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
  },
  actions: {
    gap: space[2],
    paddingTop: space[1],
  },
  secondary: {
    alignSelf: 'center',
  },
});
