import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { ScreenHeader } from '@/components/Header';
import { Banner } from '@/components/States';
import { Text } from '@/components/Text';
import { KEYBOARD_BEHAVIOR } from '@/lib/useKeyboardVisible';
import { colors, space } from '@/theme';

/** Shared frame for the sign-in, sign-up and reset forms. */
export function AuthScaffold({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  const { isPreview } = useAuth();
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader border={false} />
      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_BEHAVIOR}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text variant="pageTitle" accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {intro ? (
            <Text variant="post" color="textSecondary">
              {intro}
            </Text>
          ) : null}
          {isPreview ? (
            <Banner
              tone="warning"
              message="Development preview sign-in. This is not real authentication and nothing leaves this device."
              style={styles.preview}
            />
          ) : null}
          <View style={styles.form}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  content: { paddingHorizontal: space[6], paddingBottom: space[8], gap: space[3] },
  title: { fontSize: 28, lineHeight: 34 },
  preview: { marginTop: space[2] },
  form: { marginTop: space[4], gap: space[5] },
});
