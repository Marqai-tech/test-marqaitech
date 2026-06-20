'use client';

/**
 * Locale switcher — dropdown to switch between supported locales.
 * Uses next-intl's useRouter + usePathname to redirect to the same page
 * in the new locale. With localePrefix='as-needed', the default locale (en)
 * has no URL prefix; other locales get /es/, /fr/, etc.
 */

import { useState, useRef, useEffect } from 'react';
import { FiGlobe, FiChevronDown } from 'react-icons/fi';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { locales, localeNames, type Locale } from '@/i18n/routing';

export default function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('locale');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleChange = (newLocale: Locale) => {
    setOpen(false);
    if (newLocale === locale) return;
    // useRouter from next-intl/navigation will handle the prefix logic
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
        title={t('switchLanguage')}
        aria-label={t('switchLanguage')}
        aria-expanded={open}
      >
        <FiGlobe className="w-4 h-4" />
        <span className="hidden sm:inline">{localeNames[locale]?.flag}</span>
        <span className="hidden md:inline">{localeNames[locale]?.nativeName}</span>
        <FiChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
          <p className="px-3 py-1 text-xs text-slate-500 uppercase tracking-wider">{t('selectLocale')}</p>
          {locales.map((l) => (
            <button
              key={l}
              onClick={() => handleChange(l)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 ${
                l === locale ? 'bg-violet-50 text-violet-700 font-medium' : 'text-slate-700'
              }`}
            >
              <span className="text-base">{localeNames[l].flag}</span>
              <span className="flex-1">{localeNames[l].nativeName}</span>
              <span className="text-xs text-slate-400">{l.toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
