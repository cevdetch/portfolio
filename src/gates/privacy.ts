// Generic patterns for details that never go public. Personal terms are supplied privately,
// through the PRIVACY_DENYLIST secret or a local .privacy-denylist file.
export const privacyRules: readonly { name: string; pattern: RegExp }[] = [
  { name: 'phone number', pattern: /\+\d{2}[\s\d]{8,}\d/ },
  { name: 'IPv4 address', pattern: /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b(?!\.\d)/ },
  { name: 'tailnet hostname', pattern: /\b[\w-]+\.ts\.net\b/i },
  { name: 'local hostname', pattern: /\b[\w-]+\.(?:lan|local|home\.arpa|internal)\b/i },
  { name: 'localhost port', pattern: /\b(?:localhost|127\.0\.0\.1):\d{2,5}\b/ },
  { name: 'clock time', pattern: /(?<![T:\d])(?:[01]?\d|2[0-3])[:h][0-5]\d\b(?!:\d)/ },
  { name: 'WhatsApp', pattern: /\bwhatsapp\b/i },
];

export function findPrivacyViolations(text: string, denylist: readonly string[]): string[] {
  return [...privacyRules.filter(rule => rule.pattern.test(text)).map(rule => rule.name), ...findDenylistTerms(text, denylist)];
}

/** Deny-list hits, reported by position so the log never repeats a term. */
export function findDenylistTerms(text: string, denylist: readonly string[]): string[] {
  const lower = text.toLowerCase();
  return denylist.flatMap((term, index) => term && lower.includes(term.toLowerCase()) ? [`deny-list term #${index + 1}`] : []);
}

export function parseDenylist(raw: string): string[] {
  return raw.split('\n').map(line => line.trim()).filter(Boolean);
}

/** In CI an empty deny list means the secret is missing, so the gate fails closed. */
export function denylistStatus(terms: number, ci: boolean): { error?: string; warning?: string } {
  if (terms > 0) return {};
  return ci ? { error: 'PRIVACY_DENYLIST secret is empty or missing' }
    : { warning: 'warning: no deny-list terms; set PRIVACY_DENYLIST or create .privacy-denylist to scan for personal terms' };
}

/** Tracked files whose content the deny list scans: everything but binaries and vendored packages. */
export function isScannedTextFile(path: string): boolean {
  if (/^cv\/typst-packages\//.test(path)) return false;
  return !/\.(?:png|ico|ttf|pdf|woff2?|webp)$/i.test(path);
}

/** Splits `git log -z --format=%h%n%B` into commits and their messages. */
export function splitCommitLog(log: string): { commit: string; message: string }[] {
  return log.split('\0').filter(entry => entry.trim()).map(entry => {
    const [commit = '', ...message] = entry.replace(/^\n+/, '').split('\n');
    return { commit, message: message.join('\n') };
  });
}
