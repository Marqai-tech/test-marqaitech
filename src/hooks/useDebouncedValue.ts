'use client';

import { useEffect, useState } from 'react';

/**
 * Debounce any rapidly-changing value.
 *
 * Returns a value that only updates after `delay` ms have elapsed without
 * changes. Ideal for typeahead search inputs (e.g. company-name → logo fetch)
 * to avoid spamming the API on every keystroke.
 *
 * Usage:
 *   const debouncedCompany = useDebouncedValue(companyName, 500);
 *   useEffect(() => { if (debouncedCompany) fetchLogo(debouncedCompany); }, [debouncedCompany]);
 */
export function useDebouncedValue<T>(value: T, delay: number = 400): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}
