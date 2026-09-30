import { hasComponent, Not, Or, query } from 'bitecs';
import { ChildOf, PaintType } from '../components';
import type { EngineWorld } from '../api/world';

/** Run after motion/transform, before offline drawing (video and still capture).
 * All DOM poses, geometry and raster sizes settle before any paint is captured. */
export async function prepareHtmlFrame(world: EngineWorld): Promise<void> {
  const c=world.components, pending:Promise<void>[]=[];
  const visit=(eid:number,time:number) => {
    if(c.Computed.visibility[eid]===0 || hasComponent(world,eid,c.Hidden) || hasComponent(world,eid,c.Culled) || hasComponent(world,eid,c.IsMask))return;
    for(const fid of c.Cache.fills[eid] ?? []) {
      if(c.Paint[fid]!==PaintType.HTML || hasComponent(world,fid,c.Hidden))continue;
      const host=c.HtmlHost[fid];if(!host)throw new Error('HTML export host is missing');
      const m=c.WorldTransform, camera=world.camera;
      const sx=Math.hypot(camera.a*m.a[eid]+camera.c*m.b[eid],camera.b*m.a[eid]+camera.d*m.b[eid])*world.resolution;
      const sy=Math.hypot(camera.a*m.c[eid]+camera.c*m.d[eid],camera.b*m.c[eid]+camera.d*m.d[eid])*world.resolution;
      host.prepare(c.Computed.width[eid],c.Computed.height[eid],sx||1,sy||1);
      pending.push(host.whenReady(time,true));
    }
    for(const child of c.Cache.children[eid] ?? [])visit(child,time);
  };
  for(const eid of query(world,[Or(c.Geometry,c.Group),Not(ChildOf('*')),Not(c.Deleted),Not(c.Culled)]))
    visit(eid,c.Computed.localTimeInSeconds[eid]??0);
  await Promise.all(pending);
}
