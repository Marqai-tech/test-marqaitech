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
    // Biometric devices only report that the employee presented at the
    // entrance. They cannot identify a break. Once the first check-in is
    // accepted, every later non-duplicate scan is a checkout candidate,
    // regardless of time or whether the check-in was manual.
    classifications.set(punch.id, 'check_out');
  }

  const completedBreaks: Array<{ start: Date; end: Date }> = [];
  const breakPunches = accepted.filter(p => classifications.get(p.id) === 'break_in' || classifications.get(p.id) === 'break_out');
  for (let index = 0; index + 1 < breakPunches.length; index += 2) {
    completedBreaks.push({ start: breakPunches[index].punchTime, end: breakPunches[index + 1].punchTime });
  }
  const breakMinutes = completedBreaks.reduce(
    (total, interval) => total + Math.max(0, Math.round((interval.end.getTime() - interval.start.getTime()) / 60_000)),
    0,
  );

  return { accepted, classifications, completedBreaks, breakMinutes };
}
