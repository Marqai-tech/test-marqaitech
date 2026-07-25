'use client';

import { useState, useCallback } from 'react';
import {
  FiUsers,
  FiHeart,
  FiMessageCircle,
  FiShare2,
  FiSmile,
  FiPaperclip,
  FiImage,
  FiHash,
  FiTrendingUp,
  FiAward,
  FiCalendar,
  FiGift,
  FiUserPlus,
  FiClock,
  FiMapPin,
  FiSend,
  FiZap,
  FiFlag,
  FiPlus,
  FiX,
  FiSpeaker,
  FiCoffee,
  FiBriefcase,
} from 'react-icons/fi';

/* ── Types ── */
interface Author {
  name: string;
  role: string;
  initials: string;
  gradient: string;
}

interface Comment {
  id: string;
  author: Author;
  text: string;
  time: string;
  likes: number;
}

interface Post {
  id: string;
  author: Author;
  time: string;
  content: string;
  imageGradient?: string;
  imageLabel?: string;
  tags?: string[];
  likes: number;
  comments: number;
  shares: number;
  isLiked?: boolean;
  isPinned?: boolean;
  type: 'announcement' | 'achievement' | 'birthday' | 'welcome' | 'policy' | 'event' | 'general';
  commentList?: Comment[];
}

interface TrendingTopic {
  id: string;
  title: string;
  posts: number;
}

interface Hashtag {
  id: string;
  tag: string;
  count: number;
}

interface ActiveMember {
  id: string;
  name: string;
  initials: string;
  gradient: string;
  posts: number;
}

interface Announcement {
  id: string;
  title: string;
  time: string;
  type: 'urgent' | 'info' | 'policy';
}

interface BirthdayPerson {
  id: string;
  name: string;
  initials: string;
  gradient: string;
  date: string;
  department: string;
}

interface AnniversaryPerson {
  id: string;
  name: string;
  initials: string;
  gradient: string;
  years: number;
  role: string;
}

interface NewJoiner {
  id: string;
  name: string;
  initials: string;
  gradient: string;
  role: string;
  department: string;
  joinDate: string;
}

/* ── Sample Data ── */
const trendingTopics: TrendingTopic[] = [
  { id: '1', title: 'Annual Performance Reviews', posts: 48 },
  { id: '2', title: 'New Office Space Discussion', posts: 35 },
  { id: '3', title: 'Hackathon 2025 Teams', posts: 29 },
  { id: '4', title: 'Remote Work Policy Update', posts: 24 },
  { id: '5', title: 'Q2 Results Celebration', posts: 21 },
];

const popularHashtags: Hashtag[] = [
  { id: '1', tag: '#TeamWins', count: 156 },
  { id: '2', tag: '#3BoxesCulture', count: 132 },
  { id: '3', tag: '#WorkLifeBalance', count: 98 },
  { id: '4', tag: '#InnovationFirst', count: 87 },
  { id: '5', tag: '#EmployeeSpotlight', count: 74 },
  { id: '6', tag: '#GrowthMindset', count: 63 },
  { id: '7', tag: '#3BoxesFamily', count: 58 },
  { id: '8', tag: '#LearningAndDev', count: 45 },
];

const activeMembers: ActiveMember[] = [
  { id: '1', name: 'Priya Sharma', initials: 'PS', gradient: 'from-rose-500 to-pink-600', posts: 24 },
  { id: '2', name: 'Arjun Mehta', initials: 'AM', gradient: 'from-amber-500 to-orange-600', posts: 19 },
  { id: '3', name: 'Kavya Reddy', initials: 'KR', gradient: 'from-emerald-500 to-teal-600', posts: 17 },
  { id: '4', name: 'Rahul Verma', initials: 'RV', gradient: 'from-green-500 to-cyan-600', posts: 15 },
  { id: '5', name: 'Neha Gupta', initials: 'NG', gradient: 'from-teal-500 to-teal-600', posts: 14 },
  { id: '6', name: 'Vikram Singh', initials: 'VS', gradient: 'from-fuchsia-500 to-pink-600', posts: 12 },
];

const companyAnnouncements: Announcement[] = [
  { id: '1', title: 'Q3 Strategy All-Hands — July 15', time: '2h ago', type: 'urgent' },
  { id: '2', title: 'Updated Leave Policy Effective Aug 1', time: '5h ago', type: 'policy' },
  { id: '3', title: 'New Health Insurance Provider', time: '1d ago', type: 'info' },
  { id: '4', title: 'Office Deep Cleaning — This Weekend', time: '2d ago', type: 'info' },
];

const upcomingBirthdays: BirthdayPerson[] = [
  { id: '1', name: 'Deepa Nair', initials: 'DN', gradient: 'from-rose-400 to-pink-500', date: 'Jul 8', department: 'Design' },
  { id: '2', name: 'Suresh Kumar', initials: 'SK', gradient: 'from-sky-400 to-green-500', date: 'Jul 10', department: 'Engineering' },
  { id: '3', name: 'Anita Desai', initials: 'AD', gradient: 'from-lime-400 to-green-500', date: 'Jul 12', department: 'Marketing' },
];

const workAnniversaries: AnniversaryPerson[] = [
  { id: '1', name: 'Rajesh Iyer', initials: 'RI', gradient: 'from-amber-400 to-yellow-500', years: 10, role: 'VP Engineering' },
  { id: '2', name: 'Meera Patel', initials: 'MP', gradient: 'from-teal-400 to-cyan-500', years: 7, role: 'Sr. Product Manager' },
  { id: '3', name: 'Siddharth Rao', initials: 'SR', gradient: 'from-orange-400 to-red-500', years: 5, role: 'Tech Lead' },
];

const newJoiners: NewJoiner[] = [
  { id: '1', name: 'Tanvi Joshi', initials: 'TJ', gradient: 'from-teal-400 to-teal-500', role: 'UX Designer', department: 'Design', joinDate: 'Jul 1' },
  { id: '2', name: 'Karan Malhotra', initials: 'KM', gradient: 'from-emerald-400 to-green-500', role: 'Backend Dev', department: 'Engineering', joinDate: 'Jul 1' },
  { id: '3', name: 'Shreya Menon', initials: 'SM', gradient: 'from-green-400 to-emerald-500', role: 'HR Executive', department: 'People Ops', joinDate: 'Jun 28' },
];

const initialPosts: Post[] = [
  {
    id: '1',
    author: { name: 'HR Communications', role: 'People Operations', initials: 'HR', gradient: 'from-green-600 to-emerald-700' },
    time: '30 min ago',
    content: '🚀 Exciting News! 3Boxes has been recognized as a "Great Place to Work" for the third consecutive year! This achievement belongs to every single one of you who makes our culture special. Thank you for being the heart of 3Boxes!',
    imageGradient: 'from-green-600 via-emerald-600 to-teal-700',
    imageLabel: '🏆 Great Place to Work Certified — 3 Years Running',
    tags: ['#3BoxesCulture', '#TeamWins'],
    likes: 142,
    comments: 38,
    shares: 24,
    isPinned: true,
    type: 'announcement',
    commentList: [
      { id: 'c1', author: { name: 'Priya Sharma', role: 'Engineering', initials: 'PS', gradient: 'from-rose-500 to-pink-600' }, text: 'So proud to be part of this team! 🎉', time: '15 min ago', likes: 8 },
      { id: 'c2', author: { name: 'Arjun Mehta', role: 'Product', initials: 'AM', gradient: 'from-amber-500 to-orange-600' }, text: 'Well deserved! Our culture is truly special.', time: '10 min ago', likes: 5 },
    ],
  },
  {
    id: '2',
    author: { name: 'Suresh Kumar', role: 'Engineering Lead', initials: 'SK', gradient: 'from-sky-500 to-green-600' },
    time: '1h ago',
    content: 'Big shoutout to the Platform Team for shipping the new API gateway 2 weeks ahead of schedule! 🎯 Your dedication and late-night sprints paid off. The performance benchmarks are incredible — 40% reduction in latency!',
    tags: ['#TeamWins', '#InnovationFirst'],
    likes: 89,
    comments: 21,
    shares: 12,
    type: 'achievement',
    commentList: [
      { id: 'c3', author: { name: 'Kavya Reddy', role: 'QA Lead', initials: 'KR', gradient: 'from-emerald-500 to-teal-600' }, text: 'Testing was a breeze with this team! Great collaboration.', time: '45 min ago', likes: 4 },
    ],
  },
  {
    id: '3',
    author: { name: 'People Operations', role: 'HR Team', initials: 'PO', gradient: 'from-emerald-600 to-teal-700' },
    time: '2h ago',
    content: '🎂 Happy Birthday to our amazing Design Lead, Deepa Nair! Your creative vision shapes everything beautiful at 3Boxes. Wishing you a fantastic day filled with joy and inspiration! 🎨✨',
    imageGradient: 'from-rose-500 via-pink-500 to-fuchsia-600',
    imageLabel: '🎂 Happy Birthday Deepa! 🎈',
    tags: ['#EmployeeSpotlight', '#3BoxesFamily'],
    likes: 76,
    comments: 34,
    shares: 5,
    type: 'birthday',
    commentList: [
      { id: 'c4', author: { name: 'Deepa Nair', role: 'Design Lead', initials: 'DN', gradient: 'from-rose-400 to-pink-500' }, text: 'Thank you everyone! Feeling so loved 💕', time: '1h ago', likes: 12 },
    ],
  },
  {
    id: '4',
    author: { name: 'Vikram Singh', role: 'CTO', initials: 'VS', gradient: 'from-fuchsia-600 to-pink-700' },
    time: '3h ago',
    content: 'Please join me in welcoming Tanvi Joshi and Karan Malhotra to the 3Boxes family! Tanvi joins our Design team as UX Designer and Karan comes aboard as Backend Developer. Both bring incredible talent and fresh perspectives. Make them feel at home! 🏠',
    tags: ['#3BoxesFamily', '#EmployeeSpotlight'],
    likes: 64,
    comments: 28,
    shares: 8,
    type: 'welcome',
    commentList: [
      { id: 'c5', author: { name: 'Tanvi Joshi', role: 'UX Designer', initials: 'TJ', gradient: 'from-teal-400 to-teal-500' }, text: 'Thrilled to be here! Looking forward to creating amazing experiences 🎨', time: '2h ago', likes: 9 },
      { id: 'c6', author: { name: 'Karan Malhotra', role: 'Backend Dev', initials: 'KM', gradient: 'from-emerald-400 to-green-500' }, text: 'Excited to contribute to the platform! 💪', time: '2h ago', likes: 7 },
    ],
  },
  {
    id: '5',
    author: { name: 'Compliance Team', role: 'Legal & Compliance', initials: 'CT', gradient: 'from-slate-600 to-gray-700' },
    time: '4h ago',
    content: '📋 Important: Updated Data Privacy Policy is now effective. All employees must acknowledge the updated policy by July 15th. Please review the changes in the Documentation Hub under "Company Policies". This is mandatory for all team members.',
    tags: ['#WorkLifeBalance'],
    likes: 23,
    comments: 15,
    shares: 6,
    type: 'policy',
    commentList: [
      { id: 'c7', author: { name: 'Rahul Verma', role: 'Finance', initials: 'RV', gradient: 'from-green-500 to-cyan-600' }, text: 'Completed the acknowledgment. The new clauses on remote data handling are very clear.', time: '3h ago', likes: 3 },
    ],
  },
  {
    id: '6',
    author: { name: 'Events Committee', role: 'Culture Team', initials: 'EC', gradient: 'from-orange-500 to-red-600' },
    time: '5h ago',
    content: '🎯 Hackathon 2025 is coming! Mark your calendars for July 20-21. This year\'s theme: "AI for Good". Form your teams (3-5 members) and register by July 12. Amazing prizes await! Use the link in the comments to register. Let\'s innovate together!',
    imageGradient: 'from-orange-500 via-red-500 to-rose-600',
    imageLabel: '🎯 Hackathon 2025 — AI for Good | July 20-21',
    tags: ['#InnovationFirst', '#3BoxesCulture'],
    likes: 112,
    comments: 45,
    shares: 31,
    type: 'event',
    commentList: [
      { id: 'c8', author: { name: 'Neha Gupta', role: 'Data Science', initials: 'NG', gradient: 'from-teal-500 to-teal-600' }, text: 'Team "Neural Ninjas" is ready! Who else is in? 🤖', time: '4h ago', likes: 11 },
      { id: 'c9', author: { name: 'Arjun Mehta', role: 'Product', initials: 'AM', gradient: 'from-amber-500 to-orange-600' }, text: 'Looking for 2 more team members! DM me if interested.', time: '3h ago', likes: 6 },
    ],
  },
  {
    id: '7',
    author: { name: 'Rajesh Iyer', role: 'VP Engineering', initials: 'RI', gradient: 'from-amber-500 to-yellow-600' },
    time: '6h ago',
    content: 'Reflecting on 10 incredible years at 3Boxes today! From a 5-person startup to a 500+ team — what a journey. Grateful for every challenge, every late night, and every celebration. Here\'s to the next decade of building something meaningful together. 🙏',
    tags: ['#3BoxesCulture', '#GrowthMindset'],
    likes: 198,
    comments: 52,
    shares: 18,
    type: 'achievement',
    commentList: [
      { id: 'c10', author: { name: 'Vikram Singh', role: 'CTO', initials: 'VS', gradient: 'from-fuchsia-600 to-pink-700' }, text: 'You\'ve been the backbone of our engineering culture, Rajesh! Here\'s to many more! 🥂', time: '5h ago', likes: 15 },
    ],
  },
  {
    id: '8',
    author: { name: 'Facilities Team', role: 'Operations', initials: 'FT', gradient: 'from-teal-500 to-emerald-600' },
    time: '8h ago',
    content: '☕ New espresso machine installed in the 3rd floor pantry! We\'ve also added oat milk and a selection of teas. Let us know your favorite brew in the comments. Happy caffeinating!',
    likes: 67,
    comments: 19,
    shares: 4,
    type: 'general',
    commentList: [
      { id: 'c11', author: { name: 'Kavya Reddy', role: 'QA Lead', initials: 'KR', gradient: 'from-emerald-500 to-teal-600' }, text: 'Finally! The old one was... an experience 😅', time: '7h ago', likes: 8 },
    ],
  },
  {
    id: '9',
    author: { name: 'Learning & Development', role: 'L&D Team', initials: 'LD', gradient: 'from-cyan-500 to-green-600' },
    time: '10h ago',
    content: '📚 New Leadership Workshop series starting next week! "Leading with Empathy" — a 4-week program for managers at all levels. Limited to 25 participants. Register through the Learning Hub. First session: July 8 with guest facilitator Dr. Ananya Roy.',
    imageGradient: 'from-cyan-500 via-green-500 to-emerald-600',
    imageLabel: '📚 Leadership Workshop — Leading with Empathy',
    tags: ['#LearningAndDev', '#GrowthMindset'],
    likes: 54,
    comments: 12,
    shares: 9,
    type: 'event',
    commentList: [],
  },
  {
    id: '10',
    author: { name: 'Sales Champions', role: 'Sales Team', initials: 'SC', gradient: 'from-green-500 to-emerald-600' },
    time: '12h ago',
    content: '🎉 Q2 Target Achieved — 115% of quota! A massive shoutout to the entire Sales team for an outstanding quarter. Special recognition to the Enterprise team for closing 3 major deals in the final week. Client dinner celebration coming soon!',
    tags: ['#TeamWins', '#3BoxesCulture'],
    likes: 95,
    comments: 27,
    shares: 14,
    type: 'achievement',
    commentList: [
      { id: 'c12', author: { name: 'Rahul Verma', role: 'Finance', initials: 'RV', gradient: 'from-green-500 to-cyan-600' }, text: 'Revenue charts look beautiful! 📈', time: '11h ago', likes: 7 },
    ],
  },
  {
    id: '11',
    author: { name: 'CSR Committee', role: 'Social Impact', initials: 'CS', gradient: 'from-lime-500 to-green-600' },
    time: '1d ago',
    content: '🌱 Tree Plantation Drive Update: 3Boxes volunteers planted 250 saplings at the city park last Saturday! Thank you to all 45 volunteers who spent their weekend making our city greener. Next drive scheduled for August. Sign-ups open now!',
    imageGradient: 'from-lime-500 via-green-500 to-emerald-600',
    imageLabel: '🌱 250 Trees Planted — 3Boxes CSR Drive',
    tags: ['#3BoxesCulture', '#TeamWins'],
    likes: 83,
    comments: 16,
    shares: 11,
    type: 'general',
    commentList: [],
  },
  {
    id: '12',
    author: { name: 'IT Security', role: 'Information Security', initials: 'IS', gradient: 'from-red-500 to-rose-600' },
    time: '1d ago',
    content: '🔒 Security Reminder: Never share your login credentials or click on suspicious links. We\'ve noticed an increase in phishing attempts targeting company emails. Report any suspicious emails to security@3boxes.com immediately. Stay safe, stay secure!',
    likes: 31,
    comments: 8,
    shares: 3,
    type: 'policy',
    commentList: [
      { id: 'c13', author: { name: 'Priya Sharma', role: 'Engineering', initials: 'PS', gradient: 'from-rose-500 to-pink-600' }, text: 'Good reminder! I got one of those phishing emails yesterday. Reported it right away.', time: '20h ago', likes: 4 },
    ],
  },
  {
    id: '13',
    author: { name: 'Wellness Committee', role: 'Employee Wellness', initials: 'WC', gradient: 'from-teal-500 to-teal-600' },
    time: '1d ago',
    content: '🧘 Weekly Mindfulness Session resumes this Thursday at 5:30 PM in the Meditation Room (Floor 2). Open to all employees — no experience needed. Start your weekend with a calm mind! Mats and refreshments provided.',
    tags: ['#WorkLifeBalance'],
    likes: 47,
    comments: 9,
    shares: 5,
    type: 'event',
    commentList: [],
  },
];

/* ── Helper: Time ago utility ── */

/* ── Sub-Components ── */

function AvatarCircle({ initials, gradient, size = 'md' }: { initials: string; gradient: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-[10px]',
    md: 'w-10 h-10 text-xs',
    lg: 'w-12 h-12 text-sm',
  };
  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold shadow-sm shrink-0`}>
      {initials}
    </div>
  );
}

function PostTypeBadge({ type }: { type: Post['type'] }) {
  const config: Record<Post['type'], { label: string; icon: React.ReactNode; className: string }> = {
    announcement: { label: 'Announcement', icon: <FiSpeaker className="w-3 h-3" />, className: 'bg-green-50 text-green-700 border-green-200' },
    achievement: { label: 'Achievement', icon: <FiAward className="w-3 h-3" />, className: 'bg-amber-50 text-amber-700 border-amber-200' },
    birthday: { label: 'Birthday', icon: <FiGift className="w-3 h-3" />, className: 'bg-pink-50 text-pink-700 border-pink-200' },
    welcome: { label: 'Welcome', icon: <FiUserPlus className="w-3 h-3" />, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    policy: { label: 'Policy', icon: <FiFlag className="w-3 h-3" />, className: 'bg-slate-50 text-slate-700 border-slate-200' },
    event: { label: 'Event', icon: <FiCalendar className="w-3 h-3" />, className: 'bg-orange-50 text-orange-700 border-orange-200' },
    general: { label: 'General', icon: <FiCoffee className="w-3 h-3" />, className: 'bg-gray-50 text-gray-700 border-gray-200' },
  };
  const c = config[type];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${c.className}`}>
      {c.icon} {c.label}
    </span>
  );
}

/* ── Main Page Component ── */
export default function SocialFeedPage() {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [composerText, setComposerText] = useState('');
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);

  const toggleLike = useCallback((postId: string) => {
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, isLiked: !p.isLiked, likes: p.isLiked ? p.likes - 1 : p.likes + 1 }
        : p
    ));
  }, []);

  const toggleComments = useCallback((postId: string) => {
    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }, []);

  const handleCreatePost = useCallback(() => {
    if (!composerText.trim()) return;
    const newPost: Post = {
      id: `new-${Date.now()}`,
      author: { name: 'You', role: 'Employee', initials: 'YO', gradient: 'from-green-500 to-teal-600' },
      time: 'Just now',
      content: composerText.trim(),
      likes: 0,
      comments: 0,
      shares: 0,
      type: 'general',
      commentList: [],
    };
    setPosts(prev => [newPost, ...prev]);
    setComposerText('');
    setShowCreatePostModal(false);
  }, [composerText]);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center shadow-lg shadow-green-500/20">
            <FiUsers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-thb-text-primary">Social Feed</h1>
            <p className="text-sm text-thb-text-secondary">Stay connected with your team and company updates</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreatePostModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-green-500/25 hover:shadow-green-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <FiPlus className="w-4 h-4" /> Create Post
        </button>
      </div>

      {/* ── Main Content Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[256px_1fr_288px] gap-6">

        {/* ── LEFT SIDEBAR ── */}
        <aside className="space-y-5 hidden lg:block">
          {/* Trending Topics */}
          <div className="bg-thb-card-bg rounded-xl border border-thb-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <FiTrendingUp className="w-4 h-4 text-green-500" />
              <h3 className="font-semibold text-sm text-thb-text-primary">Trending Topics</h3>
            </div>
            <div className="space-y-3">
              {trendingTopics.map((topic, idx) => (
                <div key={topic.id} className="flex items-start gap-3 group cursor-pointer">
                  <span className="text-xs font-bold text-thb-text-muted w-5 shrink-0 mt-0.5">{idx + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-thb-text-primary font-medium group-hover:text-green-600 transition-colors truncate">{topic.title}</p>
                    <p className="text-[11px] text-thb-text-muted">{topic.posts} posts</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Popular Hashtags */}
          <div className="bg-thb-card-bg rounded-xl border border-thb-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <FiHash className="w-4 h-4 text-teal-500" />
              <h3 className="font-semibold text-sm text-thb-text-primary">Popular Hashtags</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {popularHashtags.map(ht => (
                <span
                  key={ht.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-green-50 text-xs font-medium text-thb-text-secondary hover:text-green-600 border border-transparent hover:border-green-200 transition-all cursor-pointer"
                >
                  <FiHash className="w-2.5 h-2.5" />
                  {ht.tag.slice(1)}
                  <span className="text-thb-text-muted ml-0.5">({ht.count})</span>
                </span>
              ))}
            </div>
          </div>

          {/* Active Members */}
          <div className="bg-thb-card-bg rounded-xl border border-thb-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <FiZap className="w-4 h-4 text-amber-500" />
              <h3 className="font-semibold text-sm text-thb-text-primary">Active Members</h3>
            </div>
            <div className="space-y-3">
              {activeMembers.map(member => (
                <div key={member.id} className="flex items-center gap-3 group cursor-pointer">
                  <AvatarCircle initials={member.initials} gradient={member.gradient} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-thb-text-primary font-medium group-hover:text-green-600 transition-colors truncate">{member.name}</p>
                    <p className="text-[11px] text-thb-text-muted">{member.posts} posts this week</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── MAIN FEED ── */}
        <div className="space-y-5 min-w-0">
          {/* Post Composer */}
          <div className="bg-thb-card-bg rounded-xl border border-thb-border p-4">
            <div className="flex items-start gap-3">
              <AvatarCircle initials="YO" gradient="from-green-500 to-teal-600" size="md" />
              <div className="flex-1 min-w-0">
                <textarea
                  value={composerText}
                  onChange={e => setComposerText(e.target.value)}
                  placeholder="Share something with your team..."
                  className="w-full min-h-[80px] px-4 py-3 rounded-xl border border-thb-border bg-slate-50/50 text-sm text-thb-text-primary placeholder:text-thb-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-300 transition-all"
                />
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-1">
                    <button className="p-2 rounded-lg text-thb-text-muted hover:text-green-600 hover:bg-green-50 transition-all" title="Add image">
                      <FiImage className="w-4 h-4" />
                    </button>
                    <button className="p-2 rounded-lg text-thb-text-muted hover:text-teal-600 hover:bg-teal-50 transition-all" title="Add emoji">
                      <FiSmile className="w-4 h-4" />
                    </button>
                    <button className="p-2 rounded-lg text-thb-text-muted hover:text-emerald-600 hover:bg-emerald-50 transition-all" title="Attach file">
                      <FiPaperclip className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={handleCreatePost}
                    disabled={!composerText.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg text-xs font-semibold shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    <FiSend className="w-3.5 h-3.5" /> Post
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Feed Posts */}
          <div className="space-y-4">
            {posts.map(post => (
              <article
                key={post.id}
                className={`bg-thb-card-bg rounded-xl border border-thb-border overflow-hidden transition-shadow hover:shadow-md ${post.isPinned ? 'ring-1 ring-green-200' : ''}`}
              >
                {/* Pinned Indicator */}
                {post.isPinned && (
                  <div className="bg-green-50 px-4 py-1.5 flex items-center gap-2 border-b border-green-100">
                    <FiMapPin className="w-3 h-3 text-green-500" />
                    <span className="text-[11px] font-semibold text-green-600">Pinned Post</span>
                  </div>
                )}

                {/* Post Header */}
                <div className="p-4 pb-0">
                  <div className="flex items-start gap-3">
                    <AvatarCircle initials={post.author.initials} gradient={post.author.gradient} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-thb-text-primary">{post.author.name}</span>
                        <PostTypeBadge type={post.type} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-thb-text-muted">{post.author.role}</span>
                        <span className="text-thb-text-muted">·</span>
                        <span className="text-xs text-thb-text-muted flex items-center gap-1">
                          <FiClock className="w-3 h-3" /> {post.time}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Post Content */}
                <div className="px-4 pt-3">
                  <p className="text-sm text-thb-text-primary leading-relaxed whitespace-pre-wrap">{post.content}</p>

                  {/* Image / Gradient Card */}
                  {post.imageGradient && (
                    <div className={`mt-3 rounded-xl bg-gradient-to-br ${post.imageGradient} p-6 min-h-[120px] flex items-center justify-center`}>
                      <p className="text-white font-bold text-center text-base sm:text-lg drop-shadow-md">{post.imageLabel}</p>
                    </div>
                  )}

                  {/* Tags */}
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {post.tags.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-green-50 text-[11px] font-medium text-green-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Post Actions */}
                <div className="px-4 py-3 mt-2 border-t border-thb-border">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleLike(post.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        post.isLiked
                          ? 'bg-red-50 text-red-600 hover:bg-red-100'
                          : 'text-thb-text-secondary hover:bg-red-50 hover:text-red-500'
                      }`}
                    >
                      <FiHeart className={`w-3.5 h-3.5 ${post.isLiked ? 'fill-red-500' : ''}`} />
                      {post.likes > 0 && <span>{post.likes}</span>}
                    </button>
                    <button
                      onClick={() => toggleComments(post.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-thb-text-secondary hover:bg-green-50 hover:text-green-600 transition-all"
                    >
                      <FiMessageCircle className="w-3.5 h-3.5" />
                      {post.comments > 0 && <span>{post.comments}</span>}
                    </button>
                    <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-thb-text-secondary hover:bg-emerald-50 hover:text-emerald-600 transition-all">
                      <FiShare2 className="w-3.5 h-3.5" />
                      {post.shares > 0 && <span>{post.shares}</span>}
                    </button>
                  </div>
                </div>

                {/* Comments Section */}
                {expandedComments.has(post.id) && (
                  <div className="border-t border-thb-border bg-slate-50/50">
                    {/* Existing Comments */}
                    {post.commentList && post.commentList.length > 0 && (
                      <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
                        {post.commentList.map(comment => (
                          <div key={comment.id} className="flex items-start gap-2.5">
                            <AvatarCircle initials={comment.author.initials} gradient={comment.author.gradient} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="bg-white rounded-lg px-3 py-2 border border-slate-100">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-thb-text-primary">{comment.author.name}</span>
                                  <span className="text-[10px] text-thb-text-muted">{comment.time}</span>
                                </div>
                                <p className="text-xs text-thb-text-primary mt-0.5 leading-relaxed">{comment.text}</p>
                              </div>
                              <button className="inline-flex items-center gap-1 mt-1 ml-1 text-[10px] text-thb-text-muted hover:text-red-500 transition-colors">
                                <FiHeart className="w-2.5 h-2.5" /> {comment.likes > 0 ? comment.likes : 'Like'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Comment Input */}
                    <div className="p-4 pt-0">
                      <div className="flex items-center gap-2.5">
                        <AvatarCircle initials="YO" gradient="from-green-500 to-teal-600" size="sm" />
                        <div className="flex-1 flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-green-500/20 focus-within:border-green-300 transition-all">
                          <input
                            type="text"
                            placeholder="Write a comment..."
                            className="flex-1 text-xs text-thb-text-primary placeholder:text-thb-text-muted bg-transparent focus:outline-none"
                          />
                          <button className="p-1 rounded text-thb-text-muted hover:text-green-600 transition-colors">
                            <FiSend className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <aside className="space-y-5 hidden lg:block">
          {/* Company Announcements */}
          <div className="bg-thb-card-bg rounded-xl border border-thb-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <FiMapPin className="w-4 h-4 text-green-500" />
              <h3 className="font-semibold text-sm text-thb-text-primary">Company Announcements</h3>
            </div>
            <div className="space-y-3">
              {companyAnnouncements.map(ann => (
                <div key={ann.id} className="flex items-start gap-3 group cursor-pointer">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    ann.type === 'urgent' ? 'bg-red-500' : ann.type === 'policy' ? 'bg-amber-500' : 'bg-green-500'
                  }`} />
                  <div className="min-w-0">
                    <p className="text-sm text-thb-text-primary font-medium group-hover:text-green-600 transition-colors leading-snug">{ann.title}</p>
                    <p className="text-[11px] text-thb-text-muted mt-0.5">{ann.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Birthdays */}
          <div className="bg-thb-card-bg rounded-xl border border-thb-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <FiGift className="w-4 h-4 text-pink-500" />
              <h3 className="font-semibold text-sm text-thb-text-primary">Upcoming Birthdays</h3>
            </div>
            <div className="space-y-3">
              {upcomingBirthdays.map(person => (
                <div key={person.id} className="flex items-center gap-3">
                  <AvatarCircle initials={person.initials} gradient={person.gradient} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-thb-text-primary font-medium truncate">{person.name}</p>
                    <p className="text-[11px] text-thb-text-muted">{person.department} · {person.date}</p>
                  </div>
                  <span className="text-lg">🎂</span>
                </div>
              ))}
            </div>
          </div>

          {/* Work Anniversaries */}
          <div className="bg-thb-card-bg rounded-xl border border-thb-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <FiAward className="w-4 h-4 text-amber-500" />
              <h3 className="font-semibold text-sm text-thb-text-primary">Work Anniversaries</h3>
            </div>
            <div className="space-y-3">
              {workAnniversaries.map(person => (
                <div key={person.id} className="flex items-center gap-3">
                  <AvatarCircle initials={person.initials} gradient={person.gradient} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-thb-text-primary font-medium truncate">{person.name}</p>
                    <p className="text-[11px] text-thb-text-muted">{person.role}</p>
                  </div>
                  <div className="text-center shrink-0">
                    <span className="block text-sm font-bold text-amber-600">{person.years}</span>
                    <span className="text-[9px] text-thb-text-muted">years</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* New Joiners */}
          <div className="bg-thb-card-bg rounded-xl border border-thb-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <FiUserPlus className="w-4 h-4 text-emerald-500" />
              <h3 className="font-semibold text-sm text-thb-text-primary">New Joiners</h3>
            </div>
            <div className="space-y-3">
              {newJoiners.map(person => (
                <div key={person.id} className="flex items-center gap-3">
                  <div className="relative">
                    <AvatarCircle initials={person.initials} gradient={person.gradient} size="sm" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-thb-text-primary font-medium truncate">{person.name}</p>
                    <p className="text-[11px] text-thb-text-muted">{person.role} · {person.department}</p>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 px-1.5 py-0.5 rounded">{person.joinDate}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* ── Mobile Sidebars (stacked below feed) ── */}
      <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Mobile Trending & Hashtags */}
        <div className="bg-thb-card-bg rounded-xl border border-thb-border p-4">
          <div className="flex items-center gap-2 mb-4">
            <FiTrendingUp className="w-4 h-4 text-green-500" />
            <h3 className="font-semibold text-sm text-thb-text-primary">Trending Topics</h3>
          </div>
          <div className="space-y-2.5">
            {trendingTopics.slice(0, 3).map((topic, idx) => (
              <div key={topic.id} className="flex items-start gap-2">
                <span className="text-xs font-bold text-thb-text-muted w-4 shrink-0">{idx + 1}</span>
                <p className="text-sm text-thb-text-primary font-medium">{topic.title}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-4 mb-3">
            <FiHash className="w-4 h-4 text-teal-500" />
            <h3 className="font-semibold text-sm text-thb-text-primary">Popular Hashtags</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {popularHashtags.slice(0, 5).map(ht => (
              <span key={ht.id} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-slate-50 text-[11px] font-medium text-thb-text-secondary">
                {ht.tag}
              </span>
            ))}
          </div>
        </div>

        {/* Mobile Announcements & Events */}
        <div className="space-y-5">
          <div className="bg-thb-card-bg rounded-xl border border-thb-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <FiMapPin className="w-4 h-4 text-green-500" />
              <h3 className="font-semibold text-sm text-thb-text-primary">Announcements</h3>
            </div>
            <div className="space-y-2.5">
              {companyAnnouncements.slice(0, 3).map(ann => (
                <div key={ann.id} className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${ann.type === 'urgent' ? 'bg-red-500' : 'bg-green-500'}`} />
                  <div>
                    <p className="text-sm text-thb-text-primary font-medium">{ann.title}</p>
                    <p className="text-[11px] text-thb-text-muted">{ann.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-thb-card-bg rounded-xl border border-thb-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <FiUserPlus className="w-4 h-4 text-emerald-500" />
              <h3 className="font-semibold text-sm text-thb-text-primary">New Joiners</h3>
            </div>
            <div className="space-y-2.5">
              {newJoiners.map(person => (
                <div key={person.id} className="flex items-center gap-2.5">
                  <AvatarCircle initials={person.initials} gradient={person.gradient} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm text-thb-text-primary font-medium truncate">{person.name}</p>
                    <p className="text-[11px] text-thb-text-muted">{person.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Create Post Modal ── */}
      {showCreatePostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCreatePostModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-thb-border animate-[slideInRight_0.2s_ease-out]">
            <div className="flex items-center justify-between p-5 border-b border-thb-border">
              <h3 className="font-bold text-thb-text-primary">Create Post</h3>
              <button
                onClick={() => setShowCreatePostModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-thb-text-muted transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <div className="flex items-start gap-3">
                <AvatarCircle initials="YO" gradient="from-green-500 to-teal-600" size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-thb-text-primary">You</p>
                  <p className="text-xs text-thb-text-muted">Employee</p>
                </div>
              </div>
              <textarea
                value={composerText}
                onChange={e => setComposerText(e.target.value)}
                placeholder="What's on your mind? Share updates, ideas, or kudos..."
                className="w-full min-h-[150px] mt-4 px-4 py-3 rounded-xl border border-thb-border bg-slate-50/50 text-sm text-thb-text-primary placeholder:text-thb-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-300 transition-all"
                autoFocus
              />
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-thb-border">
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-thb-text-secondary hover:bg-green-50 hover:text-green-600 transition-all">
                  <FiImage className="w-3.5 h-3.5" /> Photo
                </button>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-thb-text-secondary hover:bg-teal-50 hover:text-teal-600 transition-all">
                  <FiSmile className="w-3.5 h-3.5" /> Emoji
                </button>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-thb-text-secondary hover:bg-emerald-50 hover:text-emerald-600 transition-all">
                  <FiPaperclip className="w-3.5 h-3.5" /> File
                </button>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-thb-text-secondary hover:bg-orange-50 hover:text-orange-600 transition-all">
                  <FiBriefcase className="w-3.5 h-3.5" /> Tag
                </button>
              </div>
            </div>
            <div className="p-5 pt-0">
              <button
                onClick={handleCreatePost}
                disabled={!composerText.trim()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-green-500/25 hover:shadow-green-500/40 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99] transition-all"
              >
                <FiSend className="w-4 h-4" /> Publish Post
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
