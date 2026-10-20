import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { colors, space } from '@/theme';

export default function NotFound() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text variant="pageTitle" accessibilityRole="header">
          This page isn&apos;t here
        </Text>
        <Text variant="post" color="textSecondary">
          The link may be old, or the content was removed.
        </Text>
        <Button label="Go to Feed" onPress={() => router.replace('/')} style={styles.button} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: space[6], gap: space[3] },
  button: { alignSelf: 'flex-start', marginTop: space[2] },
});
