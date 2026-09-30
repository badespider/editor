import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/** Cache invalidation for this checkout's compositor host/compiler dependencies.
 * The desktop app must run from the same checkout. No cache is shared across jobs. */
export async function sceneRendererId() {
  let root:string|undefined;
  for(const start of [process.cwd(),dirname(resolve(process.argv[1] ?? process.cwd()))]) {
    let candidate=resolve(start);
    for (;;) {
      try { const p=JSON.parse(await readFile(join(candidate,'package.json'),'utf8'));if(p.name==='@diffusionstudio/editor'){root=candidate;break;} } catch {}
      const parent=dirname(candidate);if(parent===candidate)break;candidate=parent;
    }
    if(root)break;
  }
  if(!root)throw Error('Cannot fingerprint the editor checkout; run from that checkout, or choose --full before claiming a render');
  const repository=root;
  const hash=createHash('sha256');
  async function add(path:string) {
    const data=await readFile(join(repository,path));hash.update(path.replaceAll('\\','/'));hash.update('\0');hash.update(data);hash.update('\0');
  }
  async function tree(path:string) {
    for(const item of (await readdir(join(repository,path),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const child=join(path,item.name);if(item.isDirectory())await tree(child);else if(/\.(ts|tsx|css|json)$/.test(item.name))await add(child);
    }
  }
  await tree('apps/web/src');await tree('packages/jsx/src');
  for(const path of ['package-lock.json','apps/web/package.json','apps/desktop/src/main.ts','apps/cli/src/compile-project.ts','apps/cli/src/playbook-delivery.ts'])await add(path);
  hash.update(process.platform);hash.update(process.arch);
  return hash.digest('hex');
}
