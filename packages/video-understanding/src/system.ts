import { z } from 'zod';
import { AgentEvidenceService, openSchema } from './agent.ts';
import type { AgentSession, AgentInspectRequest } from './agent.ts';
import { UnderstandingService } from './service.ts';
import { requestSchema } from './types.ts';
import type { Job } from './types.ts';

export const understandingRequestSchema = z.union([
  openSchema.extend({ provider: z.literal('agent').default('agent') }),
  requestSchema.extend({ provider: z.literal('gemini') }).strict(),
]);
export type UnderstandingRequest = z.input<typeof understandingRequestSchema>;
export type AgentUnderstandingRequest = Extract<UnderstandingRequest, {provider?: 'agent'}>;
export type GeminiUnderstandingRequest = Extract<UnderstandingRequest, {provider: 'gemini'}>;

/** Public editor entrypoint. Provider selection is identical for CLI and desktop. */
export class EditorUnderstandingService {
  readonly agent: AgentEvidenceService;
  private cloud?: UnderstandingService;
  private readonly shutdown = new AbortController();
  private active = 0;
  constructor(privateDirectory?: string, privateFactory?: () => UnderstandingService) {
    this.agent = new AgentEvidenceService(privateDirectory);
    this.makeCloud = privateFactory ?? (() => new UnderstandingService(privateDirectory));
  }
  private readonly makeCloud: () => UnderstandingService;
  private legacy() { return this.cloud ??= this.makeCloud(); }
  private async local<T>(fn: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal) {
    const combined = AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(10 * 60 * 1000), ...(signal ? [signal] : [])]);
    combined.throwIfAborted();
    if (this.active >= 2) throw new Error('Two local inspections are already running; retry after one finishes.');
    this.active++;
    try { return await fn(combined); } finally { this.active--; }
  }
  understand(input: AgentUnderstandingRequest, signal?: AbortSignal): Promise<AgentSession>;
  understand(input: GeminiUnderstandingRequest, signal?: AbortSignal): Promise<Job>;
  understand(input: UnderstandingRequest, signal?: AbortSignal): Promise<AgentSession | Job>;
  async understand(input: UnderstandingRequest, signal?: AbortSignal): Promise<AgentSession | Job> {
    const options = understandingRequestSchema.parse(input);
    if (options.provider === 'agent') {
      const { provider: _, ...request } = options;
      return this.local(s => this.agent.open(request, s), signal);
    }
    this.shutdown.signal.throwIfAborted(); signal?.throwIfAborted();
    // Reject before constructing the cloud adapter (which may read credentials).
    if (options.mode !== 'prepare' && !options.allowUpload) throw new Error('Gemini needs explicit upload consent (allowUpload: true / --upload). Agent mode needs neither a key nor upload consent.');
    return this.legacy().start(options);
  }
  inspect(id: string, request: AgentInspectRequest, signal?: AbortSignal) {
    return this.local(s => this.agent.inspect(id, request, s), signal);
  }
  dossier(id: string, query?: string) {
    return query === undefined ? this.agent.read(id) : this.agent.search(id, query);
  }
  importTranscript(id: string, input: unknown) { return this.agent.importTranscript(id, input); }
  observe(id: string, input: unknown) { return this.agent.observe(id, input); }
  status(id: string) { return this.legacy().status(id); }
  cancel(id: string) { return this.legacy().cancel(id); }
  evidence(id: string, query?: string, supportedOnly?: boolean) { return this.legacy().evidence(id, query, supportedOnly); }
  stop() { this.shutdown.abort(); this.cloud?.stop(); }
}
