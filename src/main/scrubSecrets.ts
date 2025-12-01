// ── Sensitive-data scrubbing ──────────────────────────────────────────────
const sensitiveTokens = new Set<string>();

export function registerSensitiveToken(token?: string) {
  if (!token) return;
  const v = String(token).trim();
  if (v.length < 3) return; // ignore very short stuff
  sensitiveTokens.add(v);
}

export function scrubSecrets(raw: string): string {
  if (!raw) return raw;

  let out = raw;

  // 1) Explicit tokens (passwords we’ve seen)
  for (const t of sensitiveTokens) {
    if (!t) continue;
    // simple replace-all; safe enough for logs
    out = out.split(t).join('***');
  }

  // 2) Generic patterns in our scripts
  //    PW='something'
  out = out.replace(/PW='[^']*'/g, "PW='***'");
  //    PW=something (bare)
  out = out.replace(/PW=[^\s]+/g, 'PW=***');
  //    printf '%s\n' 'password' | sudo -S ...
  out = out.replace(/printf '%s\\n' '[^']*' \| sudo -S -p ''/g, "printf '%s\\n' '***' | sudo -S -p ''");

  //    Any obvious password= in JSON-like text
  out = out.replace(/("password"\s*:\s*")[^"]*(")/gi, '$1***$2');

  return out;
}