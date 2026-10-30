import { Image } from 'expo-image';
import { ArrowUp, Camera, ImageIcon, Plus, Reply, Smile, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';

import type { Message } from '@/api/types';
import { Emoji } from '@/components/Emoji';
import { IconButton } from '@/components/IconButton';
import { ActionSheet } from '@/components/Overlays';
import { Pressable } from '@/components/Pressable';
import { Text } from '@/components/Text';
import { pickImages } from '@/lib/media';
import { useBottomBarInset } from '@/lib/useKeyboardVisible';
import { colors, fonts, gutter, radius, space } from '@/theme';

const QUICK_EMOJI = ['😀', '😂', '😍', '🙏', '👍', '🙌', '🔥', '🎉'];

interface ChatComposerProps {
  communityName: string;
  replyTo: Message | null;
  onCancelReply: () => void;
  onSend: (text: string, attachmentUris: string[]) => void;
  onTyping?: () => void;
  bottomInset: number;
  /** False when the backend does not accept photos in messages yet. */
  allowAttachments?: boolean;
}

/** The API's limit for one message. */
const MAX_LENGTH = 4000;
/** The same message sent again this soon is a double tap, not a second message. */
const DOUBLE_TAP_MS = 1000;

/** Attach, a growing field with emoji, then Photo — replaced by Send once there is something to send. */
export function ChatComposer({ communityName, replyTo, onCancelReply, onSend, onTyping, bottomInset, allowAttachments = true }: ChatComposerProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachMenu, setAttachMenu] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const input = useRef<TextInputInstance>(null);
  // Two taps in one frame both see the text before it was cleared; the second is dropped here,
  // or the same message would go out twice (with two client IDs, so the server keeps both).
  const lastSent = useRef({ key: '', at: 0 });
  const canSend = text.trim().length > 0 || attachments.length > 0;
  const paddingBottom = useBottomBarInset(bottomInset);

  const add = async (source: 'library' | 'camera') => {
    const uris = await pickImages(source, 4 - attachments.length);
    if (uris.length) setAttachments((a) => [...a, ...uris].slice(0, 4));
  };

  const send = () => {
    if (!canSend) return;
    const key = `${text.trim()}\n${attachments.join('\n')}`;
    const now = Date.now();
    if (key === lastSent.current.key && now - lastSent.current.at < DOUBLE_TAP_MS) return;
    lastSent.current = { key, at: now };
    onSend(text.trim(), attachments);
    setText('');
    setAttachments([]);
    setEmoji(false);
  };

  return (
    <View style={[styles.root, { paddingBottom }]}>
      {replyTo ? (
        <View style={styles.replyBar}>
          <Reply size={18} color={colors.primary} strokeWidth={2} />
          <View style={styles.flex}>
            <Text variant="meta" color="text" style={styles.bold}>
              Replying to {replyTo.isMine ? 'yourself' : (replyTo.sender?.displayName ?? 'a former member')}
            </Text>
            <Text variant="preview" color="textTertiary" numberOfLines={1}>
              {replyTo.text}
            </Text>
          </View>
          <IconButton icon={X} label="Cancel reply" color="textTertiary" size={18} onPress={onCancelReply} />
        </View>
      ) : null}

      {attachments.length ? (
        <ScrollView horizontal contentContainerStyle={styles.thumbs} showsHorizontalScrollIndicator={false}>
          {attachments.map((uri, i) => (
            <View key={uri}>
              <Image source={{ uri }} style={styles.thumb} contentFit="cover" accessibilityLabel={`Attached photo ${i + 1}`} />
              <Pressable
                onPress={() => setAttachments((a) => a.filter((u) => u !== uri))}
                style={styles.remove}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${i + 1}`}
                hitSlop={10}
              >
                <X size={12} color={colors.onPrimary} strokeWidth={2.5} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {emoji ? (
        <View style={styles.emojiRow}>
          {QUICK_EMOJI.map((e) => (
            <Pressable key={e} onPress={() => setText((t) => t + e)} style={styles.emoji} accessibilityRole="button" accessibilityLabel={`Insert ${e}`}>
              <Emoji size={24}>{e}</Emoji>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.row}>
        {allowAttachments ? <IconButton icon={Plus} label="Attach" size={24} onPress={() => setAttachMenu(true)} /> : null}
        <View style={[styles.field, !allowAttachments && styles.fieldAlone]}>
          <TextInput
            ref={input}
            value={text}
            onChangeText={(t) => {
              setText(t);
              onTyping?.();
            }}
            placeholder={`Message ${communityName}`}
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={MAX_LENGTH}
            style={styles.input}
            accessibilityLabel={`Message ${communityName}`}
            maxFontSizeMultiplier={1.6}
          />
          <IconButton
            icon={Smile}
            label={emoji ? 'Hide emoji' : 'Add emoji'}
            color={emoji ? 'primary' : 'textTertiary'}
            size={22}
            onPress={() => setEmoji((v) => !v)}
          />
        </View>
        {canSend ? (
          <Pressable onPress={send} style={styles.send} accessibilityRole="button" accessibilityLabel="Send" pressedOpacity={0.8}>
            <ArrowUp size={22} color={colors.onPrimary} strokeWidth={2.4} />
          </Pressable>
        ) : allowAttachments ? (
          <IconButton icon={Camera} label="Take a photo" size={24} onPress={() => void add('camera')} />
        ) : (
          <View style={styles.sendPlaceholder} />
        )}
      </View>

      <ActionSheet
        visible={attachMenu}
        title="Attach"
        onClose={() => setAttachMenu(false)}
        actions={[
          { label: 'Photo library', icon: ImageIcon, onPress: () => void add('library') },
          { label: 'Camera', icon: Camera, onPress: () => void add('camera') },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingTop: space[2] },
  flex: { flex: 1, minWidth: 0 },
  bold: { fontFamily: fonts.body700 },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: gutter, paddingRight: 6, paddingBottom: space[2] },
  thumbs: { gap: space[2], paddingHorizontal: gutter, paddingBottom: space[2], paddingTop: 6 },
  thumb: { width: 64, height: 64, borderRadius: radius.tag, backgroundColor: colors.surface3 },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: space[2], paddingBottom: space[2] },
  emoji: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 4, gap: 2 },
  field: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 16,
  },
  fieldAlone: { marginLeft: space[3] - 4 },
  sendPlaceholder: { width: 44, height: 44 },
  input: {
    flex: 1,
    fontFamily: fonts.body400,
    fontSize: 16,
    lineHeight: 21,
    color: colors.text,
    // Grows to about five lines, then scrolls.
    maxHeight: 21 * 5 + 20,
    paddingTop: 11,
    paddingBottom: 11,
  },
  send: {
    width: 40,
    height: 40,
    margin: 2,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
