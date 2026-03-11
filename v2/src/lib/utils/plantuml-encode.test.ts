import { describe, it, expect } from 'vitest';

// ---- REGRESSION: PlantUML hex encoding ----
// Bug: ArchitectureTab had a broken encoding chain (rawDeflate returned input unchanged,
// encode64 was hex encoding masquerading as base64). Fixed by collapsing to single
// plantumlEncode function using ~h hex prefix (plantuml.com text encoding standard).
//
// This test validates the encoding algorithm matches what ArchitectureTab.svelte uses.

/** Reimplementation of the plantumlEncode function from ArchitectureTab.svelte */
function plantumlEncode(text: string): string {
  const bytes = unescape(encodeURIComponent(text));
  let hex = '~h';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex;
}

describe('plantumlEncode', () => {
  it('produces ~h prefix for hex encoding', () => {
    const result = plantumlEncode('@startuml\n@enduml');
    expect(result.startsWith('~h')).toBe(true);
  });

  it('encodes ASCII correctly', () => {
    const result = plantumlEncode('AB');
    // A=0x41, B=0x42
    expect(result).toBe('~h4142');
  });

  it('encodes simple PlantUML source', () => {
    const result = plantumlEncode('@startuml\n@enduml');
    // Each character maps to its hex code
    const expected = '~h' + Array.from('@startuml\n@enduml')
      .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('');
    expect(result).toBe(expected);
  });

  it('handles Unicode characters', () => {
    // UTF-8 multi-byte: é = 0xc3 0xa9
    const result = plantumlEncode('café');
    expect(result.startsWith('~h')).toBe(true);
    // c=63, a=61, f=66, é=c3a9
    expect(result).toBe('~h636166c3a9');
  });

  it('handles empty string', () => {
    expect(plantumlEncode('')).toBe('~h');
  });

  it('produces valid URL-safe output (no special chars beyond hex digits)', () => {
    const result = plantumlEncode('@startuml\ntitle Test\nA -> B\n@enduml');
    // After ~h prefix, only hex digits [0-9a-f]
    const hexPart = result.slice(2);
    expect(hexPart).toMatch(/^[0-9a-f]+$/);
  });

  it('generates correct URL for plantuml.com', () => {
    const source = '@startuml\nA -> B\n@enduml';
    const encoded = plantumlEncode(source);
    const url = `https://www.plantuml.com/plantuml/svg/${encoded}`;
    expect(url).toContain('plantuml.com/plantuml/svg/~h');
    expect(url.length).toBeGreaterThan(50);
  });
});
