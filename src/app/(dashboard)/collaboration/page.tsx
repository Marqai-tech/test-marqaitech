'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiMessageCircle, FiFileText, FiVideo, FiUsers, FiGlobe, FiShield,
  FiLock, FiCpu, FiArrowRight, FiActivity, FiClock, FiZap, FiArrowLeft,
} from 'react-icons/fi';
import { useAutoSeedDemo } from '@/hooks/useAutoSeedDemo';

interface ModuleTile {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  description: string;
  gradientBg: string;
  iconColor: string;
  ringColor: string;
  isNew?: boolean;
  badges?: string[];
}

const tiles: ModuleTile[] = [
  {
    title: 'Chat',
    icon: FiMessageCircle,
    route: '/collaboration/chat',
    description: '1:1 and group messaging with threading, AI translation, and inline HR actions',
    gradientBg: 'bg-blue-500/10',
    iconColor: 'text-blue-500',
    ringColor: 'ring-blue-500/20',
    isNew: true,
    badges: ['E2EE for 1:1', 'AI Translate', 'DLP-protected'],
  },
  {
    title: 'File Hub',
    icon: FiFileText,
    route: '/collaboration/files',
    description: 'Personal, Project, and Company drives with version control, watermarking, and DLP scanning',
    gradientBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-500',
    ringColor: 'ring-emerald-500/20',
    isNew: true,
    badges: ['Versioned', 'Watermarked', 'Cloud-syncable'],
  },
  {
    title: 'Calls',
    icon: FiVideo,
    route: '/collaboration/calls',
    description: 'Native WebRTC 1:1 audio/video with optional Zoom/Teams deep-links and AI transcription',
    gradientBg: 'bg-violet-500/10',
    iconColor: 'text-violet-500',
    ringColor: 'ring-violet-500/20',
    isNew: true,
    badges: ['WebRTC E2EE', 'AI Transcription', 'External deep-links'],
  },
];

export default function CollaborationHubPage() {
  const router = useRouter();
  // Silently trigger collaboration demo-data seed on first load so the
  // Vercel deployment shows chat rooms / files / call recordings.
  useAutoSeedDemo('collaboration');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
          <FiUsers className="w-6 h-6 text-violet-500" />
          Collaboration Hub
        </h1>
        <p className="text-nexus-text-secondary mt-1">
          Enterprise chat, file management, and calling — built directly into the HRMS workflow with AI-powered features, security controls, and granular governance.
        </p>
      </div>

      {/* Capability cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map((tile) => {
          const IconComp = tile.icon;
          return (
            <button
              key={tile.route}
              onClick={() => router.push(tile.route)}
              className="nexus-card nexus-card-hover p-5 text-left group transition-all duration-200 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl ${tile.gradientBg} flex items-center justify-center ${tile.iconColor} ring-1 ${tile.ringColor} flex-shrink-0 transition-transform duration-200 group-hover:scale-110`}>
                  <IconComp className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-nexus-text-primary group-hover:text-blue-600 transition-colors inline-flex items-center gap-2">
                      {tile.title}
                      {tile.isNew && <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-700 uppercase tracking-wide">New</span>}
                    </h3>
                    <FiArrowRight className="w-4 h-4 text-nexus-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0" />
                  </div>
                  <p className="text-xs text-nexus-text-muted mt-1 leading-relaxed">
                    {tile.description}
                  </p>
                  {tile.badges && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {tile.badges.map((badge) => (
                        <span key={badge} className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                          {badge}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Architecture highlights */}
      <div className="nexus-card p-6">
        <h2 className="text-sm font-semibold text-nexus-text-secondary uppercase tracking-wider mb-4">
          Architecture & Compliance
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <FiShield className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-nexus-text-primary">Data Isolation</h3>
            </div>
            <p className="text-xs text-nexus-text-secondary leading-relaxed">
              A Sub-Company in Group A can never see the chats, files, or profiles of a Sub-Company in Group B, even if both share the same Parent Company. Tenant Admins see only aggregated analytics, not private communications, unless a legal eDiscovery hold is placed.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <FiLock className="w-4 h-4 text-violet-500" />
              <h3 className="text-sm font-semibold text-nexus-text-primary">End-to-End Encryption</h3>
            </div>
            <p className="text-xs text-nexus-text-secondary leading-relaxed">
              All 1:1 native WebRTC voice/video calls and direct chats are E2EE. The HRMS platform, Super Admins, and Tenant Admins cannot listen in or read these specific 1:1 interactions.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <FiCpu className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-nexus-text-primary">AI-Powered Features</h3>
            </div>
            <p className="text-xs text-nexus-text-secondary leading-relaxed">
              Real-time chat translation, document intelligence (extract data from uploaded certificates), chat summarization for project managers, and anonymous sentiment analysis to flag toxic teams or burnout risks.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <FiActivity className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-nexus-text-primary">DLP & Watermarking</h3>
            </div>
            <p className="text-xs text-nexus-text-secondary leading-relaxed">
              AI-scanning of chats and files blocks uploads containing credit card numbers or SSNs. Sensitive documents (payslips, contracts) display a dynamic watermark showing the viewer&apos;s email and timestamp to prevent screen-share leaks.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
