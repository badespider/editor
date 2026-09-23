import { spawn } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';

export function runMedia(args: string[], options: { binary?: string; signal?: AbortSignal; limit?: number; cwd?: string } = {}): Promise<Buffer> {
  // Resolve an explicitly relative executable before changing the child's cwd.
  // Bare command names still use PATH, preserving the existing runner contract.
  const binary = options.binary || process.env.FFMPEG_PATH || 'ffmpeg';
  const executable = !isAbsolute(binary) && /[\\/]/.test(binary) ? resolve(binary) : binary;
  return new Promise((resolveOutput, reject) => {
    const child = spawn(executable, args, { windowsHide: true,
      cwd: options.cwd, signal: options.signal, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let length = 0, stderr = '', overflow = false;
    child.stdout.on('data', (chunk: Buffer) => {
      length += chunk.length;
      if (length > (options.limit ?? 8_000_000)) { overflow = true; child.kill(); } else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-12000); });
    child.on('error', reject);
    child.on('close', code => overflow ? reject(new Error('Media output exceeded the bounded buffer')) :
      code === 0 ? resolveOutput(Buffer.concat(chunks)) : reject(new Error(`Media process exited ${code}: ${stderr.slice(-5000)}`)));
  });
}
