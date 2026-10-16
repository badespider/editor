/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Wire-level channels — the only raw ipcRenderer/ipcMain channels in play for
// the main↔renderer request/event protocol. Everything else multiplexes
// through these via an envelope carrying the logical MAIN_CHANNELS name and
// (for requests) a UUID for correlation.
//
// CLI traffic uses a separate wire pair (CLI_WIRE in @diffusionstudio/cli/protocol);
// main forwards it opaquely without inspecting channel names.
import type { LogEntry, ScreenshotResult } from "@diffusionstudio/cli/protocol";
import type { AnalysisRecord, Job } from "@diffusionstudio/video-understanding/types";
import type { EditorUnderstandingService, UnderstandingRequest } from "@diffusionstudio/video-understanding/system";
import type { AgentSession, AgentInspectRequest, AgentTranscriptRequest, AgentObservationRequest } from "@diffusionstudio/video-understanding/agent";
import type { ReferenceAutoService } from "@diffusionstudio/editing-playbook/reference-auto";
import type { ReferenceRecreationService } from "@diffusionstudio/editing-playbook/reference-recreation";
import type { MotionLearningService } from "@diffusionstudio/editing-playbook/motion-learning";
import type { MotionLibrary } from "@diffusionstudio/editing-playbook/motion-library";
import type { AutomaticReferenceReceipt } from "./reference-auto-controller";

export const MAIN_WIRE = {
  REQUEST: "main:request",
  RESPONSE: "main:response",
  EVENT: "main:event",
} as const;

export type MainWireChannel = (typeof MAIN_WIRE)[keyof typeof MAIN_WIRE];

// Logical channels. Two categories:
//   • Renderer→Main requests (request + response)
//   • Main→Renderer events   (push, no response)
// Renderer-state queries used to live here; they now answer CLI requests
// directly via the CLI bridge.
export const MAIN_CHANNELS = {
  // Renderer→Main requests
  APP_OPEN_EXTERNAL: "app:open-external",
  AUTH_GET_PENDING_CALLBACK: "auth:get-pending-callback",
  CHECKOUT_GET_PENDING_CALLBACK: "checkout:get-pending-callback",
  WINDOW_IS_FULLSCREEN: "window:is-fullscreen",
  WINDOW_CAPTURE: "window:capture",
  FILE_TRANSFER: "file:transfer",
  FILE_WRITE_OPEN: "file:write-open",
  FILE_WRITE_CHUNK: "file:write-chunk",
  FILE_WRITE_CLOSE: "file:write-close",
  FILE_WRITE_ABORT: "file:write-abort",
  HEADLESS_GET_MODE: "headless:get-mode",
  LOGS_GET: "logs:get",
  UNDERSTANDING_START: "understanding:start",
  UNDERSTANDING_STATUS: "understanding:status",
  UNDERSTANDING_CANCEL: "understanding:cancel",
  UNDERSTANDING_EVIDENCE: "understanding:evidence",
  UNDERSTANDING_INSPECT: "understanding:inspect",
  UNDERSTANDING_DOSSIER: "understanding:dossier",
  UNDERSTANDING_TRANSCRIPT_IMPORT: "understanding:transcript-import",
  UNDERSTANDING_OBSERVE: "understanding:observe",
  REFERENCE_AUTO_CAPABILITIES: "reference-auto:capabilities",
  REFERENCE_AUTO_START: "reference-auto:start",
  REFERENCE_AUTO_STATUS: "reference-auto:status",
  REFERENCE_AUTO_CANCEL: "reference-auto:cancel",
  REFERENCE_AUTO_FINISH: "reference-auto:finish",
  REFERENCE_RECREATE_CAPABILITIES: "reference-recreate:capabilities",
  REFERENCE_RECREATE_START: "reference-recreate:start",
  REFERENCE_RECREATE_STATUS: "reference-recreate:status",
  REFERENCE_RECREATE_CANCEL: "reference-recreate:cancel",
  REFERENCE_RECREATE_RENDERED: "reference-recreate:rendered",
  REFERENCE_LEARN_CAPABILITIES: "reference-learn:capabilities",
  REFERENCE_LEARN_START: "reference-learn:start",
  REFERENCE_LEARN_STATUS: "reference-learn:status",
  REFERENCE_LEARN_CANCEL: "reference-learn:cancel",
  REFERENCE_LEARN_RENDERED: "reference-learn:rendered",
  MOTION_LIBRARY_LIST: "motion-library:list",
  MOTION_LIBRARY_READ: "motion-library:read",
  MOTION_LIBRARY_REMOVE: "motion-library:remove",

  // Main→Renderer events
  AUTH_CALLBACK: "auth:callback",
  CHECKOUT_CALLBACK: "checkout:callback",
  WINDOW_FULLSCREEN_CHANGE: "window:fullscreen-change",
  HEADLESS_MODE: "headless:mode",
} as const;

export type MainChannel = (typeof MAIN_CHANNELS)[keyof typeof MAIN_CHANNELS];

// Events fed by a `diffusion://` deep link. Main routes each link to exactly
// one of these by its host, so auth and checkout never consume each other's.
export type DeepLinkChannel =
  | typeof MAIN_CHANNELS.AUTH_CALLBACK
  | typeof MAIN_CHANNELS.CHECKOUT_CALLBACK;

export type MainRequestMap = {
  [MAIN_CHANNELS.REFERENCE_LEARN_CAPABILITIES]: { request: void; response: Awaited<ReturnType<MotionLearningService['capabilities']>> };
  [MAIN_CHANNELS.REFERENCE_LEARN_START]: { request: Parameters<MotionLearningService['start']>[0]; response: Awaited<ReturnType<MotionLearningService['start']>> };
  [MAIN_CHANNELS.REFERENCE_LEARN_STATUS]: { request: {id:string}; response: Awaited<ReturnType<MotionLearningService['status']>> };
  [MAIN_CHANNELS.REFERENCE_LEARN_CANCEL]: { request: {id:string}; response: Awaited<ReturnType<MotionLearningService['cancel']>> };
  [MAIN_CHANNELS.REFERENCE_LEARN_RENDERED]: { request: Parameters<MotionLearningService['rendered']>[0]; response: Awaited<ReturnType<MotionLearningService['rendered']>> };
  [MAIN_CHANNELS.MOTION_LIBRARY_LIST]: { request: void; response: Awaited<ReturnType<MotionLibrary['list']>> };
  [MAIN_CHANNELS.MOTION_LIBRARY_READ]: { request: {id:string}; response: Awaited<ReturnType<MotionLibrary['read']>> };
  [MAIN_CHANNELS.MOTION_LIBRARY_REMOVE]: { request: {id:string}; response: Awaited<ReturnType<MotionLibrary['remove']>> };
  [MAIN_CHANNELS.REFERENCE_RECREATE_CAPABILITIES]: { request: void; response: Awaited<ReturnType<ReferenceRecreationService['capabilities']>> };
  [MAIN_CHANNELS.REFERENCE_RECREATE_START]: { request: Parameters<ReferenceRecreationService['start']>[0]; response: Awaited<ReturnType<ReferenceRecreationService['start']>> };
  [MAIN_CHANNELS.REFERENCE_RECREATE_STATUS]: { request: { id: string }; response: Awaited<ReturnType<ReferenceRecreationService['status']>> };
  [MAIN_CHANNELS.REFERENCE_RECREATE_CANCEL]: { request: { id: string }; response: Awaited<ReturnType<ReferenceRecreationService['cancel']>> };
  [MAIN_CHANNELS.REFERENCE_RECREATE_RENDERED]: { request: Parameters<ReferenceRecreationService['rendered']>[0]; response: Awaited<ReturnType<ReferenceRecreationService['rendered']>> };
  [MAIN_CHANNELS.REFERENCE_AUTO_CAPABILITIES]: { request: void; response: Awaited<ReturnType<ReferenceAutoService['capabilities']>> };
  [MAIN_CHANNELS.REFERENCE_AUTO_START]: { request: Parameters<ReferenceAutoService['start']>[0]; response: Awaited<ReturnType<ReferenceAutoService['start']>> };
  [MAIN_CHANNELS.REFERENCE_AUTO_STATUS]: { request: { id: string }; response: Awaited<ReturnType<ReferenceAutoService['status']>> };
  [MAIN_CHANNELS.REFERENCE_AUTO_CANCEL]: { request: { id: string }; response: Awaited<ReturnType<ReferenceAutoService['cancel']>> };
  [MAIN_CHANNELS.REFERENCE_AUTO_FINISH]: { request: { id: string; projectId: string; sceneId: number }; response: AutomaticReferenceReceipt };
  [MAIN_CHANNELS.UNDERSTANDING_START]: { request: UnderstandingRequest; response: AgentSession | Job };
  [MAIN_CHANNELS.UNDERSTANDING_INSPECT]: { request: { id: string; request: AgentInspectRequest }; response: Awaited<ReturnType<EditorUnderstandingService['inspect']>> };
  [MAIN_CHANNELS.UNDERSTANDING_DOSSIER]: { request: { id: string; query?: string }; response: Awaited<ReturnType<EditorUnderstandingService['dossier']>> };
  [MAIN_CHANNELS.UNDERSTANDING_TRANSCRIPT_IMPORT]: { request: { id: string; transcript: AgentTranscriptRequest }; response: Awaited<ReturnType<EditorUnderstandingService['importTranscript']>> };
  [MAIN_CHANNELS.UNDERSTANDING_OBSERVE]: { request: { id: string; report: AgentObservationRequest }; response: Awaited<ReturnType<EditorUnderstandingService['observe']>> };
  [MAIN_CHANNELS.UNDERSTANDING_STATUS]: { request: { id: string }; response: Job };
  [MAIN_CHANNELS.UNDERSTANDING_CANCEL]: { request: { id: string }; response: Job };
  [MAIN_CHANNELS.UNDERSTANDING_EVIDENCE]: { request: { id: string; query?: string; supportedOnly?: boolean }; response: AnalysisRecord };
  [MAIN_CHANNELS.APP_OPEN_EXTERNAL]: { request: { url: string }; response: void };
  [MAIN_CHANNELS.AUTH_GET_PENDING_CALLBACK]: { request: void; response: string | null };
  [MAIN_CHANNELS.CHECKOUT_GET_PENDING_CALLBACK]: { request: void; response: string | null };
  [MAIN_CHANNELS.WINDOW_IS_FULLSCREEN]: { request: void; response: boolean };
  [MAIN_CHANNELS.WINDOW_CAPTURE]: { request: void; response: ScreenshotResult };
  [MAIN_CHANNELS.FILE_TRANSFER]: {
    request: { selector: string; absolutePath: string };
    response: void;
  };
  [MAIN_CHANNELS.FILE_WRITE_OPEN]: {
    request: { path: string; exclusive?: boolean };
    response: { id: string };
  };
  [MAIN_CHANNELS.FILE_WRITE_CHUNK]: {
    request: { id: string; data: Uint8Array; position: number };
    response: void;
  };
  [MAIN_CHANNELS.FILE_WRITE_CLOSE]: {
    request: { id: string };
    response: void;
  };
  [MAIN_CHANNELS.FILE_WRITE_ABORT]: {
    request: { id: string };
    response: void;
  };
  [MAIN_CHANNELS.HEADLESS_GET_MODE]: { request: void; response: boolean };
  [MAIN_CHANNELS.LOGS_GET]: { request: void; response: LogEntry[] };
};
export type MainRequestChannel = keyof MainRequestMap;

export type MainEventMap = {
  [MAIN_CHANNELS.AUTH_CALLBACK]: { url: string };
  [MAIN_CHANNELS.CHECKOUT_CALLBACK]: { url: string };
  [MAIN_CHANNELS.WINDOW_FULLSCREEN_CHANGE]: { fullscreen: boolean };
  [MAIN_CHANNELS.HEADLESS_MODE]: { active: boolean };
};
export type MainEventChannel = keyof MainEventMap;

export type MainRequest = {
  id: string;
  channel: MainRequestChannel;
  data: unknown;
};

export type MainEvent = {
  channel: MainEventChannel;
  data: unknown;
};

export type MainReply =
  | { id: string; ok: true; data: unknown }
  | { id: string; ok: false; error: string };
