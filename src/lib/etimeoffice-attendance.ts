export type ClassifiedPunchType =
  | 'check_in'
  | 'check_out'
  | 'break_in'
  | 'break_out'
  | 'entry_only'
  | 'duplicate';

export type TimedPunch = { id: string; punchTime: Date };

/**
 * Classify a complete employee day from chronologically ordered biometric
 * punches. Scans within the configured window of the previous accepted scan
 * remain in the audit log but do not affect attendance calculations.
 */
export function classifyBiometricDay<T extends TimedPunch>(
  punches: T[],
  duplicateWindowMinutes = 2,
  options: { manualCheckIn?: boolean; existingCheckOut?: Date | null; existingBreakIn?: Date | null; existingBreakOut?: Date | null; earlyLogout?: boolean } = {},
) {
  const ordered = [...punches].sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime());
  const duplicateWindowMs = Math.max(0, duplicateWindowMinutes) * 60_000;
  const accepted: T[] = [];
  const classifications = new Map<string, ClassifiedPunchType>();

  for (const punch of ordered) {
    const previous = accepted[accepted.length - 1];
    if (previous && punch.punchTime.getTime() - previous.punchTime.getTime() <= duplicateWindowMs) {
      classifications.set(punch.id, 'duplicate');
      continue;
    }
    accepted.push(punch);
  }

  for (const [index, punch] of accepted.entries()) {
    if (index === 0 && !options.manualCheckIn) {
      classifications.set(punch.id, 'check_in');
      continue;
    }
    // Company access rule: the first punch establishes check-in. Every later
    // biometric scan is an exit/checkout signal, irrespective of its time.
    // Lunch break-in/out are explicit app actions and are never inferred from
    // biometric scans. The sync layer keeps the latest checkout scan.
    classifications.set(punch.id, 'check_out');
  }

  // Biometric devices are used only for first check-in and subsequent
  // checkout updates. Lunch breaks are recorded explicitly in the app.
  const completedBreaks: Array<{ start: Date; end: Date }> = [];
  const breakMinutes = 0;

  return { accepted, classifications, completedBreaks, breakMinutes };
}
