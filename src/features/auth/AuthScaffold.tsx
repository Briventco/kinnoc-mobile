import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { ScreenHeader } from '@/components/Header';
import { Banner } from '@/components/States';
import { Text } from '@/components/Text';
import { KEYBOARD_BEHAVIOR } from '@/lib/useKeyboardVisible';
import { colors, gutter, space } from '@/theme';

interface AuthScaffoldProps {
  title: string;
  intro?: string;
  children: ReactNode;
  /** Pinned under the form: the way to the other auth screen, or legal text. */
  footer?: ReactNode;
  /** Setup steps after sign-in have nowhere to go back to. */
  back?: boolean;
}

/**
 * Shared frame for sign-in, sign-up, password reset and account setup: the Kinnoc mark, a
 * display title, the form, and a footer that rests at the bottom of the screen. Everything
 * scrolls inside one keyboard-avoiding view, so the field being typed in stays visible.
 */
export function AuthScaffold({ title, intro, children, footer, back = true }: AuthScaffoldProps) {
  const { isPreview } = useAuth();
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {back ? <ScreenHeader border={false} /> : <View style={styles.noHeader} />}
      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_BEHAVIOR}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <Image
            source={require('@/assets/images/brand/kinnoc-symbol-blue.png')}
            style={styles.mark}
            contentFit="contain"
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <View style={styles.heading}>
            <Text variant="display" accessibilityRole="header">
              {title}
            </Text>
            {intro ? (
              <Text variant="post" color="textSecondary">
                {intro}
              </Text>
            ) : null}
          </View>
          {isPreview ? (
            <Banner tone="warning" message="Development preview sign-in. This is not real authentication and nothing leaves this device." />
          ) : null}
          <View style={styles.form}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** "New to Kinnoc? Create an account": a quiet question with one action, centred at the foot. */
export function AuthSwitch({ question, children }: { question: string; children: ReactNode }) {
  return (
    <View style={styles.switch}>
      <Text variant="preview" color="textSecondary">
        {question}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  noHeader: { height: space[6] },
  content: { flexGrow: 1, paddingHorizontal: gutter + space[2], paddingTop: space[2], paddingBottom: space[4] },
  mark: { width: 30, height: 38 },
  heading: { marginTop: space[5], gap: space[2] },
  form: { marginTop: space[6], gap: space[5] },
  // Rests at the bottom when there is room; otherwise follows the form.
  footer: { marginTop: 'auto', paddingTop: space[6], gap: space[2] },
  switch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', columnGap: space[1] },
});
