/**
 * Client-side navigation helpers — drop-in replacements for next/link and
 * next/navigation hooks that respect the current locale.
 */

import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// `Link`, `redirect`, `usePathname`, `useRouter` are all locale-aware now.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
