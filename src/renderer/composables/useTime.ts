// useTime.ts
export function useTime() {
    const userTimeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  
    function formatInUserTZ(
      date: Date | null,
      opts: Intl.DateTimeFormatOptions = {}
    ) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  
      // If the caller supplied dateStyle/timeStyle, don't mix with granular fields.
      const hasStyles = 'dateStyle' in opts || 'timeStyle' in opts;
  
      const baseWhenNoStyles: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZoneName: 'short',
      };
  
      const fmtOptions: Intl.DateTimeFormatOptions = {
        timeZone: userTimeZone,
        ...(hasStyles ? {} : baseWhenNoStyles),
        ...opts,
      };
  
      // Some older Electron/ICU builds can still be picky — guard just in case.
      try {
        return new Intl.DateTimeFormat(undefined, fmtOptions).format(date);
      } catch {
        // Fallback: drop timeZoneName if that was the problem
        const { timeZoneName, ...rest } = fmtOptions;
        return new Intl.DateTimeFormat(undefined, rest).format(date);
      }
    }
  
    function fromEpochMs(ms?: number | string | null): Date | null {
      if (ms == null) return null;
      const n = Number(ms);
      return Number.isFinite(n) ? new Date(n) : null;
    }
  
    function fromSqliteUtcText(s?: string | null): Date | null {
      if (!s) return null;
      const isoish = s.replace(' ', 'T');
      if (isoish.endsWith('Z')) return new Date(isoish);
      const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(s);
      if (!m) return new Date(isoish + 'Z');
      const [, yy, MM, dd, hh, mm, ss, ms] = m;
      const msInt = ms ? Number((ms + '00').slice(0, 3)) : 0;
      return new Date(Date.UTC(+yy, +MM - 1, +dd, +hh, +mm, +ss, msInt));
    }
  
    function formatEpochMs(ms?: number | string | null, opts?: Intl.DateTimeFormatOptions) {
      return formatInUserTZ(fromEpochMs(ms), opts || {});
    }
    function formatSqliteUtc(s?: string | null, opts?: Intl.DateTimeFormatOptions) {
      return formatInUserTZ(fromSqliteUtcText(s), opts || {});
    }
  
    return {
      userTimeZone,
      formatInUserTZ,
      fromEpochMs,
      fromSqliteUtcText,
      formatEpochMs,
      formatSqliteUtc,
    };
  }
  