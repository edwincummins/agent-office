import { NavGrid, type Bounds, type Obstacles, type Pt } from '../../../shared/nav';
import type { DeskDef } from '../../../shared/layout';
import type { ModelChair } from '../../../shared/maps/model';

/** Approach authored chairs from a clear side, without assuming a stock desk aisle. */
export class ModelNav extends NavGrid {
  constructor(bounds: Bounds, private readonly obstacles: Obstacles, private readonly chairs: ReadonlyMap<string, ModelChair>) { super(bounds, obstacles, undefined, .2); }
  override wayTo(from: Pt, seat: DeskDef): Pt[] {
    const chair = this.chairs.get(seat.id);
    if (!chair) return super.wayTo(from, seat);
    const candidates: Pt[][] = [];
    for (const side of [-1, 1]) for (const offset of [.65, .75, .85]) for (const back of [0, .3, -.2]) {
      const target: Pt = [chair.x + Math.cos(chair.rotY) * side * offset - Math.sin(chair.rotY) * back, chair.z - Math.sin(chair.rotY) * side * offset - Math.cos(chair.rotY) * back];
      if (!this.clearPoint(target) || !this.walkable(...target)) continue;
      if (!this.hopClear(target, chair)) continue;
      const path = this.route(from, target);
      if (path.every((p, i) => !i || this.clearLine(path[i - 1], p))) candidates.push(path);
    }
    const length = (path: Pt[]) => path.reduce((sum, p, i) => sum + (i ? Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0), 0);
    candidates.sort((a, b) => length(a) - length(b));
    // Never manufacture a straight route through a wall when the chair is inaccessible.
    return candidates[0] ?? [];
  }
  private clearPoint([x,z]: Pt): boolean {
    return !this.obstacles.rects.some(([a,b,c,d])=>x>a-.3&&x<b+.3&&z>c-.3&&z<d+.3) && !this.obstacles.circles.some(([a,b,r])=>Math.hypot(x-a,z-b)<r+.3);
  }
  private hopClear(from: Pt, chair: ModelChair): boolean {
    return segmentClear(from,[chair.x,chair.z],this.obstacles,0,[chair.x,chair.z]);
  }
  override clearLine(a: Pt,b: Pt): boolean {
    return super.clearLine(a,b)&&segmentClear(a,b,this.obstacles,.3);
  }
  override wayFrom(seat: DeskDef, to: Pt): Pt[] {
    return this.chairs.has(seat.id) ? this.wayTo(to, seat).reverse() : super.wayFrom(seat, to);
  }
}

/** Continuous intersections also catch partitions thinner than one navigation cell. */
export function segmentClear(a: Pt,b: Pt,obstacles: Obstacles,pad=0,ownChair?: Pt): boolean {
  const dx=b[0]-a[0],dz=b[1]-a[1];
  for(const [x0,x1,z0,z1] of obstacles.rects){
    let near=0,far=1;
    for(const [origin,delta,min,max] of [[a[0],dx,x0-pad,x1+pad],[a[1],dz,z0-pad,z1+pad]]){
      if(Math.abs(delta)<1e-12){if(origin<min||origin>max){near=2;break;}continue;}
      const t0=(min-origin)/delta,t1=(max-origin)/delta;
      near=Math.max(near,Math.min(t0,t1));far=Math.min(far,Math.max(t0,t1));
    }
    if(near<=far)return false;
  }
  for(const [x,z,r] of obstacles.circles){
    if(ownChair&&Math.hypot(x-ownChair[0],z-ownChair[1])<.01)continue;
    const length=dx*dx+dz*dz,t=length?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length)):0;
    if(Math.hypot(a[0]+t*dx-x,a[1]+t*dz-z)<r+pad)return false;
  }
  return true;
}
