import type { CreativeRequest } from '../src/creative.ts';

// Synthetic timing and content only: no private narration or finished video.
export const courseRequest = (): CreativeRequest => ({
  schemaVersion: 1, topic: 'A technical signal path', audience: 'IT learners',
  promise: 'Follow the connection', payoff: 'Separate symptoms from causes',
  spine: 'Observe, explain, check', duration: 12, aspect: 'landscape',
  brand: { palette: { background: '#0B1728', foreground: '#F7F5EF', accent: '#66DBEC' },
    fontFamily: 'Geist', motionTone: 'Restrained causal motion with readable holds' },
  signatureMotif: null,
  beats: [
    { id: 'signal-path', start: 0, end: 8, purpose: 'Explain a connection',
      picture: 'Persistent endpoint objects with a labeled path', sourceEvidence: [], quiet: false,
      uses: [{ technique: 'course-it-style-1@1', start: 0, end: 8, role: 'lead',
        placement: 'full-frame', implementation: 'hyperframes-svg',
        reason: 'The user explicitly selected the course style',
        changes: { content: 'New subject-specific labels', layout: 'New technical geometry',
          timing: 'Illustrative fixture; real narration must supply the production cues' } }] },
    { id: 'read', start: 8, end: 12, purpose: 'Allow reading',
      picture: 'Hold the explained state', sourceEvidence: [], quiet: true, uses: [] },
  ],
});
