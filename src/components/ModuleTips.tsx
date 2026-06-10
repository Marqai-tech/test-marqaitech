'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import { FiZap, FiX, FiChevronDown, FiChevronUp } from 'react-icons/fi';

interface Tip {
  title: string;
  description: string;
}

interface ModuleTipsProps {
  moduleKey: string;
  title: string;
  tips: Tip[];
}

const emptySubscribe = () => () => {};

function getStoredDismissed(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

export default function ModuleTips({ moduleKey, title, tips }: ModuleTipsProps) {
  const storageKey = `nexus_tips_dismissed_${moduleKey}`;
  const [collapsed, setCollapsed] = useState(false);

  // Use useSyncExternalStore for mounted state to avoid useEffect setState
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [dismissed, setDismissed] = useState(() => getStoredDismissed(storageKey));

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try { localStorage.setItem(storageKey, 'true'); } catch { /* ignore */ }
  }, [storageKey]);

  const handleShowTips = useCallback(() => {
    setDismissed(false);
    setCollapsed(false);
    try { localStorage.setItem(storageKey, 'false'); } catch { /* ignore */ }
  }, [storageKey]);

  if (!mounted) return null;

  if (dismissed) {
    return (
      <button
        onClick={handleShowTips}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-gradient-to-r from-blue-50 to-indigo-50 text-amber-700 text-xs font-medium hover:from-blue-100 hover:to-indigo-100 transition-all duration-200 shadow-sm"
      >
        <FiZap className="w-3.5 h-3.5" />
        Show Tips
      </button>
    );
  }

  return (
    <div className="nexus-card overflow-hidden border border-blue-100 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
            <FiZap className="w-4 h-4 text-amber-600" />
          </div>
          <h3 className="text-sm font-semibold text-nexus-text-primary">{title}</h3>
          <span className="text-[10px] font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
            {tips.length} tips
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-white/60 transition-colors"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <FiChevronDown className="w-4 h-4" /> : <FiChevronUp className="w-4 h-4" />}
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Dismiss tips"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tips Content */}
      {!collapsed && (
        <div className="p-4 bg-gradient-to-b from-blue-50/50 to-indigo-50/30">
          <div className="space-y-3">
            {tips.map((tip, index) => (
              <div key={index} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold mt-0.5">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-nexus-text-primary">{tip.title}</p>
                  <p className="text-xs text-nexus-text-secondary mt-0.5 leading-relaxed">{tip.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
