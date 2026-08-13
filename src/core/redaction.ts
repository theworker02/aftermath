const DEFAULT_PATTERNS: RegExp[] = [
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bAIza[0-9A-Za-z\-_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /\bAuthorization:\s*.+$/gim,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[^"'\s]{8,}/gi,
];

export function redactSecrets(text: string, extraPatterns: string[] = []): string {
  let out = text;
  const patterns = [
    ...DEFAULT_PATTERNS,
    ...extraPatterns.map((p) => {
      try {
        return new RegExp(p, 'gi');
      } catch {
        return null;
      }
    }),
  ].filter(Boolean) as RegExp[];

  for (const re of patterns) {
    out = out.replace(re, '[REDACTED]');
  }
  return out;
}

export function truncateText(
  text: string,
  maxBytes: number,
): { text: string; truncated: boolean; originalBytes: number } {
  const buf = Buffer.from(text, 'utf8');
  if (buf.byteLength <= maxBytes) {
    return { text, truncated: false, originalBytes: buf.byteLength };
  }
  const sliced = buf.subarray(0, maxBytes).toString('utf8');
  const notice = `\n\n[AFTERMATH] Log truncated. Kept ${maxBytes} of ${buf.byteLength} bytes.\n`;
  return {
    text: sliced + notice,
    truncated: true,
    originalBytes: buf.byteLength,
  };
}
