/**
 * SAMPLE DATA — development fixtures only.
 * Events, opportunities, messages and counts here are invented for development; Settings →
 * Development shows when the app is using them. Never import this file outside `src/api/mock/`.
 */
import { Image } from 'react-native';

import type {
  AppNotification,
  Comment,
  Community,
  CommunityUpdate,
  DiscoverItem,
  EventItem,
  Message,
  NotificationPreferences,
  OpportunityItem,
  Post,
  Profile,
  ResourceItem,
  StoryFrame,
  UserSummary,
} from '../types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
/** A time `days` from now at a fixed local hour, for events and deadlines. */
const onDay = (days: number, hour = 10) => {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

/** A bundled image's URI. Native bundles give a module ID; the web bundle gives the URL (or `{ uri }`). */
const asset = (module: number | string | { uri?: string }): string | null => {
  if (typeof module === 'string') return module;
  if (typeof module === 'object') return module.uri ?? null;
  return Image.resolveAssetSource?.(module)?.uri ?? null;
};

const meetupPhoto = asset(require('@/assets/images/sample/meetup-stage.jpg'));
const toviaStagePhoto = asset(require('@/assets/images/sample/tovia-stage.jpg'));

/**
 * Sample avatars. me, caleb and tovia are Brivent's own photos; the rest are free-licence Unsplash
 * portraits (see assets/images/sample/avatars/SOURCES.md).
 */
const avatars = {
  me: asset(require('@/assets/images/sample/avatars/me.jpg')),
  caleb: asset(require('@/assets/images/sample/avatars/me.jpg')),
  tovia: asset(require('@/assets/images/sample/avatars/tovia.jpg')),
  esther: asset(require('@/assets/images/sample/avatars/esther.jpg')),
  mira: asset(require('@/assets/images/sample/avatars/mira.jpg')),
  tobi: asset(require('@/assets/images/sample/avatars/tobi.jpg')),
  samuel: asset(require('@/assets/images/sample/avatars/samuel.jpg')),
  ayo: asset(require('@/assets/images/sample/avatars/ayo.jpg')),
  daniel: asset(require('@/assets/images/sample/avatars/daniel.jpg')),
};

export const ME_ID = 'u_me';

const person = (id: string, displayName: string, username: string, avatarUrl: string | null): UserSummary => ({
  id,
  displayName,
  username,
  avatarUrl,
});

export const users = {
  me: person(ME_ID, 'Caleb Abisoye', 'calebabisoye', avatars.me),
  deborah: person('u_deborah', 'Caleb Abisoye.', 'deborah', avatars.caleb),
  tovia: person('u_tovia', 'Tovia O.', 'tovia', avatars.tovia),
  esther: person('u_esther', 'Esther N.', 'esther', avatars.esther),
  tobi: person('u_tobi', 'Tobi J.', 'tobij', avatars.tobi),
  samuel: person('u_samuel', 'Samuel K.', 'samuel', avatars.samuel),
  ayo: person('u_ayo', 'Ayo B.', 'ayo', avatars.ayo),
  mira: person('u_mira', 'Mira E.', 'mira', avatars.mira),
  daniel: person('u_daniel', 'Daniel F.', 'daniel', avatars.daniel),
};

export const myProfile: Profile = {
  ...users.me,
  headline: 'Founder, Brivent Global Innovations',
  location: 'Lagos, Nigeria',
  bio: 'Building products, communities and opportunities for Africa. Always happy to talk startups and product design.',
  website: 'brivent.co',
  interests: ['Product design', 'Startups', 'Web development', 'Community building'],
  // Free-text interests in sample data: no catalogue.
  interestSlugs: [],
  followerCount: 312,
  followingCount: 180,
  communityCount: 6,
  isMe: true,
  isFollowing: false,
};

type CommunitySeed = Community & {
  isPinned: boolean;
  isMuted: boolean;
  unreadCount: number;
  hasMention: boolean;
};

type Defaulted = 'isPinned' | 'isMuted' | 'unreadCount' | 'hasMention' | 'rules' | 'slug' | 'categorySlug' | 'coverUrl' | 'joinPolicy' | 'role';

const community = (c: Omit<CommunitySeed, Defaulted> & Partial<Pick<CommunitySeed, Defaulted>>): CommunitySeed => ({
  isPinned: false,
  isMuted: false,
  unreadCount: 0,
  hasMention: false,
  rules: ['Be kind and stay on topic.', 'No spam or self-promotion without context.', 'Share sources when you post resources.'],
  slug: c.id.replace(/^c_/, ''),
  categorySlug: c.category.toLowerCase(),
  coverUrl: null,
  // As on the server, private communities only grow by invitation.
  joinPolicy: c.visibility === 'private' ? 'invite-only' : 'open',
  role: c.membership === 'member' ? 'member' : null,
  ...c,
});

export const communities: CommunitySeed[] = [
  community({
    id: 'c_tech',
    name: 'Tech Creators',
    monogram: 'TC',
    photoUrl: meetupPhoto,
    memberCount: 248,
    category: 'Technology',
    visibility: 'public',
    description: 'Developers, designers and makers sharing what they build, sessions and resources.',
    membership: 'member',
    role: 'owner',
    joinPolicy: 'approval',
    pinned: { title: 'Start here', body: 'Rules, resources and helpful links' },
    isPinned: true,
    unreadCount: 3,
  }),
  community({
    id: 'c_uniosun',
    name: 'UNIOSUN Community',
    monogram: 'U',
    photoUrl: null,
    memberCount: 1240,
    category: 'Campus',
    visibility: 'private',
    description: 'Students and alumni of Osun State University. Campus updates, events and study help.',
    membership: 'member',
    pinned: { title: 'Semester calendar', body: 'Key dates for this semester' },
    unreadCount: 12,
  }),
  community({
    id: 'c_design',
    name: 'Design Hub',
    monogram: 'DH',
    photoUrl: null,
    memberCount: 186,
    category: 'Design',
    visibility: 'public',
    description: 'Product, UI and brand designers giving feedback and sharing work in progress.',
    membership: 'member',
    pinned: null,
    unreadCount: 5,
    hasMention: true,
  }),
  community({
    id: 'c_career',
    name: 'Career Growth',
    monogram: 'CG',
    photoUrl: null,
    memberCount: 532,
    category: 'Careers',
    visibility: 'public',
    description: 'Internships, CV reviews, interview practice and career advice.',
    membership: 'member',
    pinned: null,
    unreadCount: 2,
  }),
  community({
    id: 'c_builders',
    name: 'Product Builders',
    monogram: 'PB',
    photoUrl: null,
    memberCount: 97,
    category: 'Startups',
    visibility: 'public',
    description: 'Founders and early teams building products, one week at a time.',
    membership: 'member',
    pinned: null,
  }),
  community({
    id: 'c_web3',
    name: 'Web3 Nigeria',
    monogram: 'W3',
    photoUrl: null,
    memberCount: 410,
    category: 'Technology',
    visibility: 'public',
    description: 'Builders and learners exploring web3 in Nigeria.',
    membership: 'member',
    pinned: null,
    isMuted: true,
    unreadCount: 4,
  }),
  community({
    id: 'c_gaming',
    name: 'Gaming & Tech',
    monogram: 'GT',
    photoUrl: null,
    memberCount: 305,
    category: 'Gaming',
    visibility: 'public',
    description: 'Game developers, players and tournaments.',
    membership: 'none',
    pinned: null,
  }),
  community({
    id: 'c_data',
    name: 'Data Science Lagos',
    monogram: 'DS',
    photoUrl: null,
    memberCount: 640,
    category: 'Data',
    visibility: 'public',
    description: 'Analysts, data scientists and ML engineers meeting monthly in Lagos.',
    membership: 'invited',
    pinned: null,
  }),
  community({
    id: 'c_writers',
    name: 'Creative Writers',
    monogram: 'CW',
    photoUrl: null,
    memberCount: 128,
    category: 'Writing',
    visibility: 'public',
    joinPolicy: 'approval',
    description: 'A small circle for writers sharing drafts and feedback. Members approve new joiners.',
    membership: 'none',
    pinned: null,
  }),
];

type MessageSeed = Omit<Message, 'clientId' | 'isMine' | 'status' | 'attachments' | 'link' | 'reactions' | 'replyTo' | 'seq' | 'deletedAt' | 'sender'> &
  Partial<Pick<Message, 'attachments' | 'link' | 'reactions' | 'replyTo' | 'status'>> & { sender: UserSummary };

/** Sequence numbers are assigned by the mock adapter, in order, per conversation. */
const msg = ({ sender, ...m }: MessageSeed): Message => ({
  clientId: null,
  seq: null,
  deletedAt: null,
  attachments: [],
  link: null,
  reactions: [],
  replyTo: null,
  status: 'read',
  isMine: sender.id === ME_ID,
  sender: { username: sender.username, displayName: sender.displayName, avatarUrl: sender.avatarUrl },
  ...m,
});

/** Conversation history per community, oldest first. */
export const messagesByCommunity: Record<string, Message[]> = {
  c_tech: [
    ...Array.from({ length: 24 }, (_, i) =>
      msg({
        id: `m_tech_old_${i}`,
        communityId: 'c_tech',
        sender: [users.tovia, users.esther, users.deborah, users.samuel][i % 4],
        text: [
          'Has anyone tried the new Expo router layouts?',
          'Sharing my notes from the accessibility workshop later today.',
          'Reminder: demo day sign-ups close on Friday.',
          'Who is going to the meetup this weekend?',
        ][i % 4],
        sentAt: ago(2 * DAY - i * 20 * MIN),
      }),
    ),
    msg({
      id: 'm_tech_1',
      communityId: 'c_tech',
      sender: users.deborah,
      text: 'The recording is now available. Check the link below and let me know your thoughts.',
      sentAt: ago(50 * MIN),
      link: {
        url: 'https://example.com/sample-recording',
        title: 'Product Design for Developers (Recording)',
        domain: 'example.com',
        thumbnailUrl: meetupPhoto,
        detail: '58 min',
        isVideo: true,
      },
      reactions: [
        { emoji: '👍', count: 12, reactedByMe: false },
        { emoji: '🙌', count: 6, reactedByMe: true },
        { emoji: '🔥', count: 4, reactedByMe: false },
      ],
    }),
    msg({
      id: 'm_tech_2',
      communityId: 'c_tech',
      sender: users.tovia,
      text: 'This is really helpful. The section on user research was my favourite.',
      sentAt: ago(34 * MIN),
    }),
    msg({
      id: 'm_tech_3',
      communityId: 'c_tech',
      sender: users.me,
      text: 'Agreed! I especially liked the part about turning insights into actual design decisions.',
      sentAt: ago(30 * MIN),
      status: 'read',
    }),
    msg({
      id: 'm_tech_4',
      communityId: 'c_tech',
      sender: users.esther,
      text: "Can someone drop the Figma file too? I'd like to follow along.",
      sentAt: ago(17 * MIN),
      replyTo: {
        id: 'm_tech_1',
        senderName: 'Deborah A.',
        text: 'The recording is now available. Check the link below and let me know your thoughts.',
      },
    }),
  ],
  c_uniosun: [
    msg({ id: 'm_u_1', communityId: 'c_uniosun', sender: users.samuel, text: 'Orientation is on Friday at the main auditorium.', sentAt: ago(3 * HOUR) }),
    msg({ id: 'm_u_2', communityId: 'c_uniosun', sender: users.tovia, text: 'Bring your admission letter and student ID.', sentAt: ago(55 * MIN) }),
  ],
  c_design: [
    msg({ id: 'm_d_1', communityId: 'c_design', sender: users.esther, text: '@Caleb here is the mockup. What do you think?', sentAt: ago(2 * HOUR) }),
  ],
  c_career: [
    msg({ id: 'm_c_1', communityId: 'c_career', sender: users.samuel, text: 'A new internship opportunity just dropped in Discover.', sentAt: ago(DAY + 2 * HOUR) }),
  ],
  c_builders: [
    msg({ id: 'm_b_1', communityId: 'c_builders', sender: users.samuel, text: 'Should we do a weekly build log thread?', sentAt: ago(DAY + 4 * HOUR) }),
    msg({ id: 'm_b_2', communityId: 'c_builders', sender: users.me, text: "That's a good idea. Let's discuss tomorrow.", sentAt: ago(DAY + 3 * HOUR) }),
  ],
  c_web3: [
    msg({ id: 'm_w_1', communityId: 'c_web3', sender: users.ayo, text: 'GM! Anyone attending the event in Yaba?', sentAt: ago(2 * DAY) }),
  ],
  c_gaming: [
    msg({ id: 'm_g_1', communityId: 'c_gaming', sender: users.daniel, text: 'Tournament sign-ups close on Friday.', sentAt: ago(4 * DAY) }),
  ],
  c_data: [],
  c_writers: [],
};

/** Who is typing in which community, to show the inbox typing state. */
export const typingSeed: Record<string, string[]> = { c_uniosun: ['Tovia'] };

const comment = (id: string, author: UserSummary, text: string, createdAt: string): Comment => ({
  id,
  // Filled in by the mock adapter from the post the comment belongs to.
  postId: '',
  parentId: null,
  author,
  text,
  isMine: false,
  replyCount: 0,
  createdAt,
  editedAt: null,
  deletedAt: null,
});

export const posts: Post[] = [
  {
    kind: 'post',
    id: 'p_1',
    author: users.deborah,
    community: { id: 'c_tech', name: 'Brivent Global Innovations' },
    text: "Had the opportunity to pitch Kinnoc, Brivent’s community and opportunity platform, at HultPrize UNIOSUN. Proud to support platforms empowering young innovators to share ideas, build solutions, and create impact. ",
    media: meetupPhoto
      ? [{ id: 'media_1', kind: 'image', url: meetupPhoto, width: 1200, height: 696, alt: 'A speaker on stage in front of a screen reading Build, Create, Belong' }]
      : [],
    createdAt: ago(3 * HOUR),
    link: null,
    editedAt: null,
    likeCount: 983,
    commentCount: 312,
    likedByMe: true,
    savedByMe: false,
    topReply: null,
    isMine: false,
  },
  {
    kind: 'post',
    id: 'p_2',
    author: users.tobi,
    community: { id: 'c_career', name: 'Career Growth' },
    text: "What are you learning this semester? I'm going deep on system design and would love resource recommendations.",
    media: [],
    link: null,
    createdAt: ago(5 * HOUR),
    editedAt: null,
    likeCount: 9,
    commentCount: 12,
    likedByMe: false,
    savedByMe: false,
    topReply: comment('cm_1', users.samuel, 'Start with the roadmap pinned in Tech Creators, then build one small project.', ago(4 * HOUR)),
    isMine: false,
  },
  {
    kind: 'post',
    id: 'p_3',
    author: users.me,
    community: { id: 'c_builders', name: 'Product Builders' },
    text: 'Slow progress is still progress. Keep building.',
    media: [],
    link: null,
    createdAt: ago(2 * DAY),
    editedAt: null,
    likeCount: 24,
    commentCount: 3,
    likedByMe: false,
    savedByMe: false,
    topReply: null,
    isMine: true,
  },
  ...Array.from({ length: 14 }, (_, i): Post => {
    const author = [users.esther, users.samuel, users.ayo, users.tovia, users.mira][i % 5];
    const c = [communities[2], communities[3], communities[5], communities[0], communities[4]][i % 5];
    return {
      kind: 'post',
      id: `p_more_${i}`,
      author,
      community: { id: c.id, name: c.name },
      text: [
        'Sharing a quick tip: write the empty state before the full state. It forces you to explain the feature.',
        'Mock interview practice this Thursday evening. Reply if you want a slot.',
        'Notes from this week’s community call are up in the chat.',
        'Finished my first open-source contribution today. Small fix, big confidence boost.',
        'What tools do you use to plan a side project?',
      ][i % 5],
      media: [],
      link: null,
      createdAt: ago((8 + i * 7) * HOUR),
      editedAt: null,
      likeCount: 3 + ((i * 7) % 20),
      commentCount: (i * 3) % 9,
      likedByMe: false,
      savedByMe: false,
      topReply: null,
      isMine: false,
    };
  }),
];

export const updates: CommunityUpdate[] = [
  {
    kind: 'update',
    id: 'up_1',
    community: communities[1],
    title: 'Orientation for new students',
    body: 'Bring your admission letter and student ID. Departments will meet afterwards.',
    startsAt: onDay(4, 10),
    place: 'Main Auditorium, Osogbo campus',
    createdAt: ago(5 * HOUR),
  },
];

export const commentsByPost: Record<string, Comment[]> = {
  p_1: [
    comment('cm_p1_1', users.tovia, 'Thanks for running this. The research section was gold.', ago(2 * HOUR)),
    comment('cm_p1_2', users.esther, 'Is there a Figma file to go with it?', ago(90 * MIN)),
  ],
  p_2: [
    comment('cm_1', users.samuel, 'Start with the roadmap pinned in Tech Creators, then build one small project.', ago(4 * HOUR)),
    comment('cm_p2_2', users.deborah, 'Designing Data-Intensive Applications is worth it, slowly.', ago(3 * HOUR)),
  ],
};

type EventDefaults =
  | 'kind' | 'savedByMe' | 'endsAt' | 'isOnline' | 'coverUrl' | 'timeZone' | 'address' | 'onlineUrl' | 'hostLogoUrl' | 'description'
  | 'category' | 'tags' | 'price' | 'capacity' | 'registrationDeadline' | 'status' | 'cancellationReason' | 'isPast';

const event = (e: Omit<EventItem, EventDefaults> & Partial<EventItem>): EventItem => ({
  kind: 'event',
  savedByMe: false,
  endsAt: null,
  timeZone: 'Africa/Lagos',
  address: null,
  isOnline: false,
  onlineUrl: null,
  hostLogoUrl: null,
  description: null,
  category: null,
  tags: [],
  price: null,
  capacity: null,
  registrationDeadline: null,
  status: 'scheduled',
  cancellationReason: null,
  isPast: false,
  coverUrl: null,
  ...e,
});

const opportunity = (o: Omit<OpportunityItem, 'kind' | 'savedByMe' | 'coverUrl' | 'eligibility'> & Partial<OpportunityItem>): OpportunityItem => ({
  kind: 'opportunity',
  savedByMe: false,
  coverUrl: null,
  eligibility: null,
  ...o,
});

const resource = (r: Omit<ResourceItem, 'kind' | 'savedByMe' | 'coverUrl'> & Partial<ResourceItem>): ResourceItem => ({
  kind: 'resource',
  savedByMe: false,
  coverUrl: null,
  ...r,
});

export const discoverItems: DiscoverItem[] = [
  event({
    id: 'd_meetup',
    title: 'Lagos Tech Meetup 2026',
    summary: 'An evening of short talks, demos and meeting other builders in Lagos. Hosted by Tech Creators.',
    startsAt: onDay(5, 10),
    venue: 'Victoria Island, Lagos',
    address: 'Landmark Centre, Victoria Island, Lagos, NG',
    host: 'Tech Creators',
    category: 'Meetup',
    tags: ['tech', 'networking'],
    price: { amount: 0, currency: 'NGN' },
    coverUrl: meetupPhoto,
    externalUrl: 'https://example.com/sample-event',
  }),
  opportunity({
    id: 'd_scholarship',
    type: 'scholarship',
    title: 'Tech Futures Scholarship 2027',
    summary: 'Tuition support and mentoring for undergraduates studying computing or engineering.',
    organisation: 'Tech Futures Fund',
    organisationMonogram: 'TF',
    location: 'Nigeria',
    arrangement: null,
    closesAt: onDay(42, 23),
    eligibility: 'Undergraduates in Nigeria studying computing or engineering.',
    externalUrl: 'https://example.com/sample-scholarship',
  }),
  opportunity({
    id: 'd_job_designer',
    type: 'job',
    title: 'Junior Product Designer',
    summary: 'Join a small studio designing web and mobile products for African startups.',
    organisation: 'Lumen Studio',
    organisationMonogram: 'LS',
    location: 'Lagos',
    arrangement: 'onsite',
    closesAt: onDay(3, 23),
    externalUrl: 'https://example.com/sample-job',
  }),
  opportunity({
    id: 'd_intern_frontend',
    type: 'internship',
    title: 'Frontend Developer (Internship)',
    summary: 'A three-month internship building React interfaces with a product team.',
    organisation: 'Brivent Global Innovations',
    organisationMonogram: 'B',
    location: null,
    arrangement: 'remote',
    closesAt: onDay(27, 23),
    externalUrl: 'https://example.com/sample-internship',
  }),
  opportunity({
    id: 'd_bootcamp',
    type: 'programme',
    title: 'Cloud Skills Bootcamp',
    summary: 'A six-week online programme covering cloud fundamentals and a capstone project.',
    organisation: 'Open Cloud Academy',
    organisationMonogram: 'OC',
    location: 'Online',
    arrangement: 'remote',
    closesAt: onDay(18, 23),
    externalUrl: 'https://example.com/sample-bootcamp',
  }),
  opportunity({
    id: 'd_hackathon',
    type: 'hackathon',
    title: 'Campus Build Weekend',
    summary: 'A 48-hour student hackathon. Teams of up to four.',
    organisation: 'UNIOSUN Tech Club',
    organisationMonogram: 'UT',
    location: 'Osogbo campus',
    arrangement: 'onsite',
    closesAt: onDay(12, 23),
    eligibility: 'Current students of any university.',
    externalUrl: 'https://example.com/sample-hackathon',
  }),
  event({
    id: 'd_workshop',
    title: 'Product Design Workshop',
    summary: 'A hands-on workshop on turning research into design decisions.',
    startsAt: onDay(12, 10),
    venue: 'Yaba, Lagos',
    host: 'Designverse',
    externalUrl: 'https://example.com/sample-workshop',
  }),
  event({
    id: 'd_techweek',
    title: 'UNIOSUN Tech Week',
    summary: 'Five days of talks, workshops and a career fair on campus.',
    startsAt: onDay(21, 9),
    endsAt: onDay(25, 17),
    venue: 'Osogbo campus',
    host: 'UNIOSUN Community',
    externalUrl: null,
  }),
  resource({
    id: 'd_sysdesign',
    title: 'System Design Roadmap',
    summary: 'A step-by-step path through system design fundamentals, with practice questions.',
    format: 'guide',
    publisher: 'Tech Creators',
    length: '12 min read',
    externalUrl: 'https://example.com/sample-guide',
  }),
  resource({
    id: 'd_portfolio',
    title: 'Design Portfolio Template',
    summary: 'A simple case-study structure for your first design portfolio.',
    format: 'template',
    publisher: 'Design Hub',
    length: null,
    externalUrl: 'https://example.com/sample-template',
  }),
  resource({
    id: 'd_cv',
    title: 'Writing a CV for Your First Internship',
    summary: 'What recruiters look for and how to show projects when you have little experience.',
    format: 'article',
    publisher: 'Career Growth',
    length: '8 min read',
    externalUrl: 'https://example.com/sample-article',
  }),
];

export const notifications: AppNotification[] = [
  {
    id: 'n_1',
    kind: 'mention',
    actor: users.deborah,
    title: [{ text: 'Deborah A.', strong: true }, { text: ' mentioned you in ' }, { text: 'Tech Creators', strong: true }],
    excerpt: '“@Caleb can you share the slides from Saturday?”',
    createdAt: ago(12 * MIN),
    read: false,
    target: '/community/c_tech',
  },
  {
    id: 'n_2',
    kind: 'like',
    actor: users.tovia,
    title: [{ text: 'Tovia O.', strong: true }, { text: ' and 23 others liked your post' }],
    excerpt: 'Slow progress is still progress. Keep building.',
    createdAt: ago(HOUR),
    read: false,
    target: '/post/p_3',
  },
  {
    id: 'n_3',
    kind: 'deadline',
    actor: null,
    title: [{ text: 'Junior Product Designer', strong: true }, { text: ' at Lumen Studio closes in 3 days. You saved it.' }],
    excerpt: null,
    createdAt: ago(3 * HOUR),
    read: false,
    opportunity: { organisationMonogram: 'LS' },
    target: '/discover/d_job_designer',
  },
  {
    id: 'n_4',
    kind: 'reply',
    actor: users.esther,
    title: [{ text: 'Esther N.', strong: true }, { text: ' replied to your comment' }],
    excerpt: '“Same here. The user research part was gold.”',
    createdAt: ago(DAY + HOUR),
    read: true,
    target: '/post/p_1',
  },
  {
    id: 'n_5',
    kind: 'event-reminder',
    actor: null,
    title: [{ text: 'Lagos Tech Meetup 2026', strong: true }, { text: ' is coming up soon.' }],
    excerpt: null,
    createdAt: ago(DAY + 2 * HOUR),
    read: true,
    event: { startsAt: onDay(5, 10) },
    target: '/discover/d_meetup',
  },
  {
    id: 'n_6',
    kind: 'community',
    actor: null,
    title: [{ text: 'Samuel and 2 others', strong: true }, { text: ' joined ' }, { text: 'Product Builders', strong: true }],
    excerpt: null,
    createdAt: ago(3 * DAY),
    read: true,
    community: communities[4],
    target: '/community/c_builders/info',
  },
];

export const notificationPreferences: NotificationPreferences = {
  mentions: true,
  replies: true,
  likes: true,
  communityActivity: true,
  reminders: true,
};

/** Story frames per author, oldest first. Text frames avoid inventing photos of people. */
export const storiesByAuthor: { author: UserSummary; frames: StoryFrame[] }[] = [
  {
    author: users.tovia,
    frames: [
      ...(toviaStagePhoto
        ? [{ id: 'sf_tov_0', kind: 'image' as const, url: toviaStagePhoto, createdAt: ago(4 * HOUR), caption: 'Speaking at HultPrize UNIOSUN today.' }]
        : []),
      { id: 'sf_tov_1', kind: 'text', text: 'User research section was my favourite part of Saturday.', background: 'blue', createdAt: ago(2 * HOUR) }],
  },
  {
    author: users.esther,
    frames: [
      { id: 'sf_est_1', kind: 'text', text: 'Mockups for the Design Hub challenge are in. Feedback welcome.', background: 'ink', createdAt: ago(6 * HOUR) },
      { id: 'sf_est_2', kind: 'text', text: 'Figma file going up tonight.', background: 'navy', createdAt: ago(90 * MIN) },
    ],
  },
  {
    author: users.samuel,
    frames: [{ id: 'sf_sam_1', kind: 'text', text: 'Mock interviews this Thursday. Reply in Career Growth for a slot.', background: 'blue', createdAt: ago(9 * HOUR) }],
  },
  {
    author: users.ayo,
    frames: [{ id: 'sf_ayo_1', kind: 'text', text: 'GM builders. Who is going to the Yaba meetup?', background: 'ink', createdAt: ago(11 * HOUR) }],
  },
];

/** Frames the viewer has already seen, so the row shows both ring states. */
export const seenStoryFrames = ['sf_sam_1'];
