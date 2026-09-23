import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { z } from 'zod';
import { fingerprint, probe } from './preview.ts';
import { runMedia } from './media-process.ts';
import { jsonHash } from './clips.ts';
import { portraitHash } from './portrait.ts';
import { mobileInspectionSchema, mobileInspectionPayloadSchema, portraitDocumentSchema, portraitOutputSampleFrames } from './portrait-schema.ts';
import type { MobileInspection, PortraitDocument } from './portrait-schema.ts';

const recordSchema = z.object({
  schemaVersion:z.literal(1),kind:z.literal('portrait-mobile-inspection-record'),
  sourceVideoPath:z.string().min(1),recipeSha256:z.string().regex(/^[a-f0-9]{64}$/),evidence:mobileInspectionPayloadSchema,
}).strict();

/** Derived evidence only: the clean motion proxy and guided stills never alter the export. */
export async function createMobileInspection(input: unknown, video: string, videoSha256: string, output: string, bundleDirectory: string, signal?: AbortSignal) {
  const doc = portraitDocumentSchema.parse(input);
  if (doc.schemaVersion !== 2) throw new Error('Phone-size inspection requires an opted-in mobile portrait document');
  const path = await realpath(resolve(video)), root = resolve(output), sampleFrames = portraitOutputSampleFrames(doc);
  const bundleRoot = await realpath(resolve(bundleDirectory));
  if (await fingerprint(path,signal) !== videoSha256) throw new Error('Render changed before phone-size inspection');
  await mkdir(dirname(root),{recursive:true}); await mkdir(root);
  const preview = join(root,'phone-preview.mp4'), duration = doc.recipe.frames / 30;
  await runMedia(['-v','error','-nostdin','-n','-protocol_whitelist','file,pipe','-i',path,
    '-map','0:v:0','-map','0:a:0','-vf','scale=360:640,setsar=1,format=yuv420p','-frames:v',String(doc.recipe.frames),'-t',String(duration),
    '-c:v','libx264','-preset','veryfast','-crf','18','-c:a','aac','-b:a','128k','-movflags','+faststart',preview],{signal});
  const media = await probe(preview,signal);
  if (media.width !== 360 || media.height !== 640 || Math.abs(media.duration - duration) > .1) throw new Error('Incomplete phone-size motion preview');
  const safe = doc.mobile.profile.safeArea;
  const left = Math.round(360 * safe.left), top = Math.round(640 * safe.top);
  const width = 360 - left - Math.round(360 * safe.right), height = 640 - top - Math.round(640 * safe.bottom);
  // Labels and the expression are generated solely from bounded numeric data.
  const expression = sampleFrames.map(f => `eq(n,${f})`).join('+');
  const filter = join(root,'phone-frames.filter.txt');
  await writeFile(filter,`select='${expression}',scale=360:640,setsar=1,drawbox=x=${left}:y=${top}:w=${width}:h=${height}:color=cyan@0.8:t=2`,{flag:'wx'});
  await runMedia(['-v','error','-nostdin','-n','-protocol_whitelist','file,pipe','-i',path,'-map','0:v:0','-an',
    '-filter_script:v',filter,'-fps_mode','passthrough','-enc_time_base:v','1:30','-frame_pts','1',join(root,'phone-%d.png')],{signal});
  const frames = [];
  for (const frame of sampleFrames) {
    const image = join(root,`phone-${frame}.png`);
    frames.push({id:`phone-frame-${frame}`,frame,path:image,sha256:await fingerprint(image,signal)});
  }
  if (await fingerprint(path,signal) !== videoSha256) throw new Error('Render changed while phone-size evidence was being created');
  const evidence = mobileInspectionPayloadSchema.parse({schemaVersion:1,width:360,height:640,profileSha256:jsonHash(doc.mobile.profile),videoSha256,
    preview:{id:'phone-motion',path:preview,sha256:await fingerprint(preview,signal)},frames});
  await validatePhoneMedia(evidence,doc.recipe.frames,signal);
  // An independently stored local inspection record prevents a freshly authored
  // packet from self-certifying arbitrary files. Like the evidence cache, this is
  // local provenance, not cryptographic authentication against its filesystem owner.
  const record = recordSchema.parse({schemaVersion:1,kind:'portrait-mobile-inspection-record',sourceVideoPath:path,recipeSha256:portraitHash(doc),evidence});
  const recordSha256 = jsonHash(record), records = join(bundleRoot,'mobile-inspections');
  await mkdir(records,{recursive:true});
  const recordsRoot = await realpath(records);
  if (!recordsRoot.startsWith(bundleRoot + sep)) throw new Error('Mobile inspection records escape the bundle directory');
  await writeFile(join(recordsRoot,`${recordSha256}.json`),JSON.stringify(record,null,2),{flag:'wx',mode:0o600});
  return mobileInspectionSchema.parse({...evidence,recordSha256});
}

async function validatePhoneMedia(evidence: z.infer<typeof mobileInspectionPayloadSchema>, frames: number, signal?: AbortSignal) {
  const data = JSON.parse((await runMedia(['-v','error','-show_entries','stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,duration',
    '-of','json','-protocol_whitelist','file,pipe',evidence.preview.path],{binary:process.env.FFPROBE_PATH || 'ffprobe',signal,limit:1_000_000})).toString());
  const visual = data.streams?.filter((s:{codec_type:string})=>s.codec_type==='video') ?? [];
  const v = visual[0];
  if (visual.length !== 1 || v.codec_name !== 'h264' || v.width !== 360 || v.height !== 640 || v.r_frame_rate !== '30/1' ||
      Number(v.nb_frames) !== frames || !Number.isFinite(Number(v.duration)) || Math.abs(Number(v.duration) - frames / 30) > .002) {
    throw new Error('Phone-motion evidence must be a complete 360x640, 30 fps H.264 preview of the selected duration');
  }
  for (const frame of evidence.frames) {
    const info = await stat(frame.path);
    if (!info.isFile() || info.size < 33 || info.size > 4_000_000) throw new Error('Phone-frame evidence must be a bounded 360x640 PNG');
    const png = await readFile(frame.path);
    if (!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || png.toString('ascii',12,16) !== 'IHDR' ||
        png.readUInt32BE(16) !== 360 || png.readUInt32BE(20) !== 640) throw new Error('Phone-frame evidence must be a 360x640 PNG');
  }
}

export async function verifyMobileInspection(doc: PortraitDocument, input: unknown, video: string, videoSha256: string, bundleDirectory: string, signal?: AbortSignal): Promise<MobileInspection> {
  if (doc.schemaVersion !== 2) throw new Error('Unexpected phone-size evidence for a legacy portrait');
  const packet = mobileInspectionSchema.parse(input), expected = portraitOutputSampleFrames(doc);
  if (packet.profileSha256 !== jsonHash(doc.mobile.profile) || packet.videoSha256 !== videoSha256 ||
      JSON.stringify(packet.frames.map(f=>f.frame)) !== JSON.stringify(expected) || packet.frames.some(f=>f.id!==`phone-frame-${f.frame}`)) {
    throw new Error('Mobile profile, render or phone-size evidence samples changed');
  }
  const root = await realpath(resolve(bundleDirectory)), source = await realpath(resolve(video));
  let record: z.infer<typeof recordSchema>;
  try {
    const path = await realpath(join(root,'mobile-inspections',`${packet.recordSha256}.json`)), info = await stat(path);
    if (!path.startsWith(root + sep) || !info.isFile() || info.size > 8_000_000) throw new Error('Invalid mobile inspection record');
    record = recordSchema.parse(JSON.parse(await readFile(path,'utf8')));
  } catch { throw new Error('Phone evidence has no valid recorded inspection in this bundle; run portrait inspect again'); }
  const {recordSha256,...evidence} = packet;
  if (jsonHash(record) !== recordSha256 || record.sourceVideoPath !== source || record.recipeSha256 !== portraitHash(doc) || jsonHash(record.evidence) !== jsonHash(evidence)) {
    throw new Error('Phone evidence disagrees with its recorded inspection provenance');
  }
  if (await fingerprint(source,signal) !== videoSha256) throw new Error('Render changed since phone-size inspection');
  for (const file of [packet.preview,...packet.frames]) {
    if (await fingerprint(file.path,signal) !== file.sha256) throw new Error('Phone-size evidence changed or is unavailable');
  }
  await validatePhoneMedia(evidence,doc.recipe.frames,signal);
  return packet;
}
