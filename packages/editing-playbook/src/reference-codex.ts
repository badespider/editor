/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { execFile, spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { delimiter, join, resolve } from 'node:path';

export type ReferenceCodexCapabilities = {
  available: boolean; installed: boolean; authenticated: boolean; auth: 'chatgpt' | 'unavailable';
  runner: 'codex-cli'; executable?: string; reason: string; remoteProcessing: true;
  analysisWindowSeconds: 120; timeoutSeconds: 600;
};
export type ReferenceCodexRequest = {
  directory: string; prompt: string; images: string[]; schemaPath: string; outputPath: string; signal: AbortSignal;
};
export type ReferenceCodexResult = { output: string; usage: Record<string, number> | null; model: string | null;
  logPath: string; stderrPath: string; executable: string };
/** Dependency injection stays in trusted Node construction, never in IPC/request payloads. */
export interface ReferenceCodexRunner {
  capabilities(): Promise<ReferenceCodexCapabilities>;
  run(request: ReferenceCodexRequest): Promise<ReferenceCodexResult>;
}

/** Keep authentication/runtime context, excluding API keys and custom endpoints. */
export function referenceCodexEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const keys = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR',
    'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'CODEX_HOME', 'CODEX_SQLITE_HOME',
    'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'USERNAME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL',
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR']);
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => keys.has(key.toUpperCase()) && value !== undefined));
}

async function executableOnPath(explicit?: string) {
  const name = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const selected = explicit ?? process.env.DIFFUSION_CODEX_PATH;
  if (selected) {
    const path = await realpath(resolve(selected)), info = await stat(path);
    if (!info.isFile() || process.platform === 'win32' && !path.toLowerCase().endsWith('.exe')) throw new Error('Configured Codex path must be a local executable.');
    await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return path;
  }
  const entries = (process.env.PATH ?? process.env.Path ?? '').split(delimiter).slice(0, 512);
  for (const entry of entries) {
    if (!entry.trim()) continue;
    const path = resolve(entry.replace(/^"|"$/g, ''), name);
    try {
      const info = await stat(path);
      if (!info.isFile()) continue;
      await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      return await realpath(path);
    } catch (error) { if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
  }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const directory = join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
    let entries;
    try { entries = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).slice(0, 128); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    const candidates: { path: string; modified: number }[] = [];
    for (const entry of entries) {
      const path = join(directory, entry.name, 'codex.exe');
      try { const info = await stat(path); if (info.isFile()) candidates.push({ path, modified: info.mtimeMs }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    candidates.sort((a, b) => b.modified - a.modified);
    if (candidates[0]) return realpath(candidates[0].path);
  }
  return null;
}

function shortProcess(binary: string, args: string[]) {
  return new Promise<{ code: number | null; text: string }>((resolveResult, reject) => {
    const child = spawn(binary, args, { shell: false, windowsHide: true, env: referenceCodexEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '', settled = false;
    const timer = setTimeout(() => { child.kill(); if (!settled) { settled = true; reject(new Error('Codex authentication check timed out.')); } }, 10_000);
    const append = (chunk: Buffer) => { text = (text + chunk.toString()).slice(-32768); };
    child.stdout.on('data', append); child.stderr.on('data', append);
    child.on('error', error => { clearTimeout(timer); if (!settled) { settled = true; reject(error); } });
    child.on('close', code => { clearTimeout(timer); if (!settled) { settled = true; resolveResult({ code, text }); } });
  });
}

/** No shell/config/hooks/connectors. Images arrive as initial model input. */
export function referenceCodexArguments(request: Omit<ReferenceCodexRequest, 'prompt' | 'signal'>) {
  const disabled = ['shell_tool', 'unified_exec', 'shell_snapshot', 'apps', 'plugins', 'hooks', 'multi_agent',
    'multi_agent_v2', 'browser_use', 'browser_use_external', 'computer_use', 'image_generation', 'view_image',
    'code_mode', 'code_mode_host', 'skill_search', 'skill_mcp_dependency_install', 'memories', 'tool_suggest'];
  return ['exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check',
    '--json', '--color', 'never', '--output-schema', request.schemaPath, '--output-last-message', request.outputPath,
    '--cd', request.directory, ...disabled.flatMap(feature => ['--disable', feature]), '--enable', 'skip_host_skill_discovery',
    '-c', 'forced_login_method="chatgpt"', '-c', 'model_provider="openai"', '-c', 'approval_policy="never"',
    '-c', 'mcp_servers={}', '-c', 'web_search="disabled"', '-c', 'project_doc_max_bytes=0',
    '-c', 'history.persistence="none"', ...request.images.flatMap(image => ['--image', image]), '--', '-'];
}

const toolTypes = new Set(['command_execution', 'mcp_tool_call', 'web_search', 'file_change', 'tool_call', 'function_call', 'computer_use', 'image_generation']);
export function referenceCodexEvent(line: string) {
  const event = JSON.parse(line) as { type?: string; item?: { type?: string }; usage?: Record<string, unknown>; model?: unknown };
  const forbidden = toolTypes.has(event.type ?? '') || toolTypes.has(event.item?.type ?? '');
  const usage = event.type === 'turn.completed' && event.usage ? Object.fromEntries(Object.entries(event.usage)
    .filter(([key, value]) => ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens'].includes(key) &&
      Number.isSafeInteger(value) && Number(value) >= 0).map(([key, value]) => [key, Number(value)])) : null;
  return { forbidden, usage, model: typeof event.model === 'string' ? event.model.slice(0, 160) : null };
}

export class CodexReferenceRunner implements ReferenceCodexRunner {
  private readonly executable: string | undefined;
  constructor(options: { executable?: string } = {}) { this.executable = options.executable; }
  async capabilities(): Promise<ReferenceCodexCapabilities> {
    const base = { runner: 'codex-cli' as const, remoteProcessing: true as const, analysisWindowSeconds: 120 as const, timeoutSeconds: 600 as const };
    try {
      const executable = await executableOnPath(this.executable);
      if (!executable) return { ...base, available: false, installed: false, authenticated: false, auth: 'unavailable', reason: 'Install the Codex CLI and sign in with ChatGPT.' };
      const status = await shortProcess(executable, ['login', 'status']);
      const authenticated = status.code === 0 && /Logged in using ChatGPT/i.test(status.text);
      return { ...base, executable, available: authenticated, installed: true, authenticated, auth: authenticated ? 'chatgpt' : 'unavailable',
        reason: authenticated ? 'Signed in to Codex with ChatGPT. Selected reference frames will be sent for analysis using your account usage.' : 'Sign in to the Codex CLI with ChatGPT; API-key authentication is not used.' };
    } catch { return { ...base, available: false, installed: true, authenticated: false, auth: 'unavailable', reason: 'Could not verify the local Codex ChatGPT sign-in. Run codex login status.' }; }
  }

  async run(request: ReferenceCodexRequest): Promise<ReferenceCodexResult> {
    request.signal.throwIfAborted();
    const capabilities = await this.capabilities();
    request.signal.throwIfAborted();
    if (!capabilities.available || !capabilities.executable) throw new Error(capabilities.reason);
    if (request.images.length < 1 || request.images.length > 12) throw new Error('Codex analysis requires 1–12 bounded pipeline images.');
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(600_000)]);
    const logPath = join(request.directory, 'codex-events.jsonl'), stderrPath = join(request.directory, 'codex-stderr.log');
    const args = referenceCodexArguments(request), executable = capabilities.executable;
    let stdout = '', stderr = '', pending = '', logBytes = 0, usage: Record<string, number> | null = null, model: string | null = null;
    try {
      await new Promise<void>((resolveRun, reject) => {
        const child = spawn(executable, args, { cwd: request.directory, shell: false, windowsHide: true,
          env: referenceCodexEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] });
        let failure: Error | undefined, stopped = false;
        const stop = (error: Error) => {
          failure ??= error;
          if (stopped) return; stopped = true;
          // Only this spawned child PID is ever passed to taskkill, never a
          // user path, shell command, cached PID or process-name wildcard.
          if (process.platform === 'win32' && Number.isSafeInteger(child.pid) && child.pid! > 0) {
            execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10_000 }, () => { if (child.exitCode === null) child.kill(); });
          } else { child.kill('SIGTERM'); setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 1000).unref(); }
        };
        const abort = () => stop(new Error(request.signal.aborted ? 'Reference analysis cancelled.' : 'Reference analysis exceeded its 10-minute timeout.'));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        child.stdout.on('data', (chunk: Buffer) => {
          logBytes += chunk.length;
          if (logBytes > 2 * 1024 ** 2) { stop(new Error('Codex analysis exceeded its bounded event log.')); return; }
          const text = chunk.toString(); stdout += text; pending += text;
          const lines = pending.split('\n'); pending = lines.pop() ?? '';
          if (pending.length > 524288) { stop(new Error('Codex emitted an oversized event.')); return; }
          for (const line of lines) {
            if (!line.trim()) continue;
            try { const event = referenceCodexEvent(line); if (event.forbidden) stop(new Error('Reference analysis attempted a disabled tool; no generated code was accepted.')); if (event.usage) usage = event.usage; if (event.model) model = event.model; }
            catch { /* Non-JSON diagnostics remain a bounded local log. */ }
          }
        });
        child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-65536); });
        child.stdin.on('error', error => { if (!stopped) stop(error); });
        child.on('error', error => { signal.removeEventListener('abort', abort); reject(error); });
        child.on('close', code => { signal.removeEventListener('abort', abort); if (failure) reject(failure); else if (code !== 0) reject(new Error(`Codex analysis failed (${code}). See its local job log.`)); else resolveRun(); });
        child.stdin.end(request.prompt);
      });
      signal.throwIfAborted();
      const info = await stat(request.outputPath);
      if (!info.isFile() || !info.size || info.size > 524288) throw new Error('Codex did not produce a bounded structured result.');
      const data = await readFile(request.outputPath);
      if (data.length > 524288) throw new Error('Codex result exceeds the plan budget.');
      return { output: data.toString('utf8'), usage, model, logPath, stderrPath, executable };
    } finally {
      await writeFile(logPath, stdout, { flag: 'wx', mode: 0o600 });
      await writeFile(stderrPath, stderr, { flag: 'wx', mode: 0o600 });
    }
  }
}
