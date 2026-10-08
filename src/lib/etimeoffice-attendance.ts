export type ClassifiedPunchType =
  | 'check_in'
  | 'check_out'
  | 'break_in'
  | 'break_out'
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

  if (accepted.length) classifications.set(accepted[0].id, 'check_in');
  if (accepted.length > 1) classifications.set(accepted[accepted.length - 1].id, 'check_out');

  const middle = accepted.slice(1, -1);
  middle.forEach((punch, index) => {
    classifications.set(punch.id, index % 2 === 0 ? 'break_in' : 'break_out');
  });

  const completedBreaks: Array<{ start: Date; end: Date }> = [];
  for (let index = 0; index + 1 < middle.length; index += 2) {
    completedBreaks.push({ start: middle[index].punchTime, end: middle[index + 1].punchTime });
  }
  const breakMinutes = completedBreaks.reduce(
    (total, interval) => total + Math.max(0, Math.round((interval.end.getTime() - interval.start.getTime()) / 60_000)),
    0,
  );

  return { accepted, classifications, completedBreaks, breakMinutes };
}
