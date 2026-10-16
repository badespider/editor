import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { build } from "esbuild";
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const jsx = resolve(repository, "packages/jsx/src/index.ts");
export type NativeNode = { tag: string; props: Record<string, unknown>; children: NativeNode[]; parent?: NativeNode };
export type Mounted = { document: {stage: NativeNode}; nodes(): NativeNode[]; setTime(time: number): void; created(): number; routePath(): string; dispose(): void };
export async function nativeModule(source: string): Promise<{mount(time?: number): Mounted}> {
  // Bundle the actual public host runtime and Solid once: the generated module receives exactly
  // the same host namespace as the editor. No substitute component implementations are used.
  const result = await build({
    stdin: {contents: `import Project from "test-generated";
import { renderProject } from ${JSON.stringify(jsx)};
import { createSignal } from "solid-js";
export function mount(initialTime = 0) {
 const [clock,setClock]=createSignal({time:initialTime,frame:initialTime*30,delta:0,playing:false});
 let count=0,route="",path=[];
 const context={font:"20px Arial",strokeStyle:"",save(){},restore(){},fillRect(){},beginPath(){path=[];},rect(){},clip(){},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){},fill(){},arc(){},fillText(){},measureText(text){return{width:Array.from(text).length*(parseFloat(this.font.match(/[\\d.]+px/)?.[0])||20)*.55};},stroke(){if(this.strokeStyle==="#D35B2E")route=JSON.stringify(path);}};
 const stage={tag:"stage",props:{},children:[]};
 const document={stage,tick:clock,createElement(tag){count++;return{tag,props:{},children:[]};},createTextNode(text){count++;return{tag:"#text",props:{text},children:[]};},replaceText(node,text){node.props.text=text;},isTextNode(node){return node.tag==="#text";},setProperty(node,key,value){node.props[key]=value;},insertNode(parent,node,anchor){if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);const at=anchor?parent.children.indexOf(anchor):-1;parent.children.splice(at<0?parent.children.length:at,0,node);node.parent=parent;},removeNode(parent,node){parent.children.splice(parent.children.indexOf(node),1);node.parent=undefined;},getParentNode(node){return node.parent;},getFirstChild(node){return node.children[0];},getNextSibling(node){return node.parent?.children[node.parent.children.indexOf(node)+1];},applyRef(node,ref){ref({width:0,height:0,getContext(){return context;}});}};
 const dispose=renderProject(Project,document);
 return{document,dispose,created:()=>count,routePath:()=>route,nodes(){const nodes=[];function walk(node){nodes.push(node);node.children.forEach(walk);}walk(stage);return nodes;},setTime(time){const prior=clock().time;setClock({time,frame:Math.floor(time*30),delta:time-prior,playing:false});}};
}`, resolveDir: repository, loader: "js"},
    bundle: true, write: false, format: "esm", platform: "node", conditions: ["browser"], logLevel: "silent",
    plugins: [{name: "native-moment-host", setup(builder) {
      builder.onResolve({filter: /^test-generated$/}, () => ({path: "generated", namespace: "moment"}));
      builder.onLoad({filter: /.*/, namespace: "moment"}, () => ({contents: source, loader: "js", resolveDir: repository}));
      builder.onResolve({filter: /^dapi-host:@diffusionstudio\/jsx$/}, () => ({path: jsx}));
      builder.onResolve({filter: /^dapi-host:solid-js$/}, () => builder.resolve("solid-js", {resolveDir: repository, kind: "import-statement"}));
    }}],
  });
  const directory=await mkdtemp(join(tmpdir(),"editor-moment-test-"));
  const file=join(directory,"runtime.mjs");
  try {await writeFile(file,result.outputFiles[0].text);return await import(pathToFileURL(file).href);}
  finally {await unlink(file);await rmdir(directory);}
}
