import { mainBridge } from "@/lib/ipc";
import { MAIN_CHANNELS } from "@desktop/main-channels";
import type { MainRequestMap } from "@desktop/main-channels";
import { ElectronFileHandle } from "@/lib/electron-file-handle";
import type { Engine } from "@/components/engine";
import type { UnderstandingRequest } from "@diffusionstudio/video-understanding/system";
import { agentWorkflow } from "@diffusionstudio/video-understanding/workflow";
import type { AssetRef } from "@diffusionstudio/cli/channels";

type WithAsset<T> = T extends unknown ? Omit<T, 'path'> & AssetRef : never;
export type UnderstandMediaRequest = WithAsset<UnderstandingRequest>;
export function handleMediaUnderstand(engine: () => Engine) {
  return async (request: UnderstandMediaRequest) => {
    if (!window.desktop) throw new Error("Video understanding currently requires Desktop or dapi --local.");
    let path: string;
    if ("path" in request) path = request.path;
    else {
      const asset = engine().world.assets.get(request.id);
      if (!asset || asset.type !== "VIDEO") throw new Error("Select a video asset");
      if (!(asset.handle instanceof ElectronFileHandle)) {
        throw new Error("This asset is browser-managed. Export it with dapi asset export, then analyze its local path.");
      }
      path = asset.handle.path;
    }
    // Asset ids are renderer-only routing fields, never forwarded to the strict
    // provider schema. Unknown provider flags are still rejected in main.
    const { id: _id, ...options } = request as UnderstandMediaRequest & { id?: string };
    return mainBridge.call(MAIN_CHANNELS.UNDERSTANDING_START, { ...options, path });
  };
}
export const handleUnderstandingStatus = (data: { id: string }) => mainBridge.call(MAIN_CHANNELS.UNDERSTANDING_STATUS, data);
export const handleUnderstandingCancel = (data: { id: string }) => mainBridge.call(MAIN_CHANNELS.UNDERSTANDING_CANCEL, data);
export const handleUnderstandingEvidence = (data: { id: string; query?: string; supportedOnly?: boolean }) => mainBridge.call(MAIN_CHANNELS.UNDERSTANDING_EVIDENCE, data);
export const handleAgentWorkflow = async () => agentWorkflow;
export const handleAgentInspect = (data: MainRequestMap[typeof MAIN_CHANNELS.UNDERSTANDING_INSPECT]['request']) => mainBridge.call(MAIN_CHANNELS.UNDERSTANDING_INSPECT, data);
export const handleAgentDossier = (data: MainRequestMap[typeof MAIN_CHANNELS.UNDERSTANDING_DOSSIER]['request']) => mainBridge.call(MAIN_CHANNELS.UNDERSTANDING_DOSSIER, data);
export const handleAgentTranscript = (data: MainRequestMap[typeof MAIN_CHANNELS.UNDERSTANDING_TRANSCRIPT_IMPORT]['request']) => mainBridge.call(MAIN_CHANNELS.UNDERSTANDING_TRANSCRIPT_IMPORT, data);
export const handleAgentObserve = (data: MainRequestMap[typeof MAIN_CHANNELS.UNDERSTANDING_OBSERVE]['request']) => mainBridge.call(MAIN_CHANNELS.UNDERSTANDING_OBSERVE, data);
