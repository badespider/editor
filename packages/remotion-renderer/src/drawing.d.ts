declare module '@scene-drawing' {
  export function worldScene(layer: import('../../editing-playbook/src/scene-motion.ts').SceneLayer,t:number,
    groups:unknown[],width:number,height:number):import('../../editing-playbook/src/scene-motion.ts').ScenePose;
  export function exposureTimes(t:number,duration:number,blur:unknown):number[];
  export function drawBlockV2(ctx:CanvasRenderingContext2D,sample:OffscreenCanvas,accum:OffscreenCanvas,
    layers:unknown[],t:number,shot:unknown,width:number,height:number):void;
  export function drawSceneCaptions(ctx:CanvasRenderingContext2D,t:number,data:unknown):void;
}
