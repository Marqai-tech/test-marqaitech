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
  options: { manualCheckIn?: boolean; existingBreakIn?: Date | null; existingBreakOut?: Date | null; earlyLogout?: boolean } = {},
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

  const localMinutes = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
    return Number(parts.find(p => p.type === 'hour')?.value || 0) * 60 + Number(parts.find(p => p.type === 'minute')?.value || 0);
  };
  let hasBreakIn = Boolean(options.existingBreakIn);
  let hasBreakOut = Boolean(options.existingBreakOut);
  let sawCheckIn = false;
  for (const [index, punch] of accepted.entries()) {
    if (index === 0 && !options.manualCheckIn) {
      classifications.set(punch.id, 'check_in');
      sawCheckIn = true;
      continue;
    }
    if (options.earlyLogout && (options.manualCheckIn || sawCheckIn || index > 0)) {
      classifications.set(punch.id, 'check_out');
      options = { ...options, earlyLogout: false };
      continue;
    }
    const minutes = localMinutes(punch.punchTime);
    if ((options.manualCheckIn && index === 1) || minutes < 13 * 60 + 30) {
      classifications.set(punch.id, 'entry_only');
    } else if (!hasBreakIn) {
      classifications.set(punch.id, 'break_in');
      hasBreakIn = true;
    } else if (!hasBreakOut) {
      classifications.set(punch.id, 'break_out');
      hasBreakOut = true;
    } else if (minutes <= 18 * 60 + 30) {
      classifications.set(punch.id, 'entry_only');
    } else {
      classifications.set(punch.id, 'check_out');
    }
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
