import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { env } from '@/config/env';
import { openExternal } from '@/lib/links';
import { space } from '@/theme';

/**
 * "By continuing you agree to…" with the Terms and Privacy Policy as real, full-size links. Shown
 * only once both documents are published (`env.legal`): nobody is asked to agree to documents
 * that do not exist yet.
 */
export function LegalNotice({ lead = 'By continuing' }: { lead?: string }) {
  const toast = useToast();
  if (!env.legal) return null;
  const open = async (url: string, name: string) => {
    if (!(await openExternal(url))) toast.show({ message: `Couldn't open the ${name}. Check your connection and try again.`, aboveNav: false });
  };
  return (
    <View style={styles.root}>
      <Text variant="meta" color="textTertiary" style={styles.center}>
        {lead} you agree to Kinnoc&apos;s
      </Text>
      <View style={styles.links}>
        <Button variant="text" subdued label="Terms" onPress={() => void open(env.legal!.termsUrl, 'Terms')} accessibilityHint="Opens in a browser" />
        <Text variant="meta" color="textTertiary" accessibilityElementsHidden importantForAccessibility="no">
          and
        </Text>
        <Button
          variant="text"
          subdued
          label="Privacy Policy"
          onPress={() => void open(env.legal!.privacyUrl, 'Privacy Policy')}
          accessibilityHint="Opens in a browser"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  center: { textAlign: 'center' },
  links: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: -space[1] },
});
