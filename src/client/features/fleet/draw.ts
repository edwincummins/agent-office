import type { FleetSnapshot, FleetStatus } from '../../../shared/protocol/fleet';

export const fleetColors:Record<FleetStatus,string>={working:'#3ecf8e','needs-you':'#e3a948',stuck:'#e2605f',waiting:'#7fb2ff',idle:'#8b8676',stopped:'#2c3036',unknown:'#a5a9b0'};
export function fitText(ctx:Pick<CanvasRenderingContext2D,'measureText'>,value:string,width:number):string {
  const chars=Array.from(value.replace(/[\u0000-\u001f\u007f]/g,' '));
  if(ctx.measureText(chars.join('')).width<=width)return chars.join('');
  while(chars.length&&ctx.measureText(chars.join('')+'…').width>width)chars.pop();
  return chars.length?chars.join('')+'…':'';
}
export function screenGrid(count:number){return {columns:count<=4?2:3,rows:count<=6?2:3,visible:Math.min(9,count)};}
/** Excludes activity/since: invisible metadata changes must not upload the wall texture. */
export function boardSignature(state:FleetSnapshot|null){
  const stateCount=state?.seats.length??0;
  return JSON.stringify(state&&{status:state.status,count:state.seats.length,needs:[state.needs.length,state.needs[0]?.summary],seats:state.seats.slice(0,9).map(({session,name,rig,state,reason,tail})=>({session,name,rig,state,reason:state==='stuck'?reason:undefined,tail:tail?.slice(-(screenGrid(stateCount).rows===3?9:15))}))});
}
const sans='"Segoe UI", sans-serif';
export function drawFleet(g:CanvasRenderingContext2D,state:FleetSnapshot|null) {
  g.globalAlpha=1;g.textBaseline='top';g.textAlign='left';g.fillStyle='#08090a';g.fillRect(0,0,2048,1024);
  g.fillStyle='#F0643B';g.fillRect(24,22,24,24);g.fillStyle='#ece6d6';g.font=`600 36px ${sans}`;g.fillText('Cadre',64,12);
  g.fillStyle='#8b8676';g.font=`24px ${sans}`;
  g.fillText(state?`${state.seats.length} seats${state.seats.length>9?` · +${state.seats.length-9} more in the panel`:''}${state.status==='stale'?' · STALE — feed unavailable':''}`:'Feed is off',220,24);
  if(!state||!state.seats.length){g.font=`30px ${sans}`;g.fillText(state?'No teams or seats yet':'Cadre feed is off. Set cadre.fleetCommand',24,150);return;}
  const top=88+(state.needs.length?56:0);
  if(state.needs.length){
    g.fillStyle='#211c11';g.fillRect(24,64,2000,56);g.strokeStyle='#c9a24a';g.lineWidth=2;g.strokeRect(24,64,2000,56);
    g.font=`600 28px ${sans}`;g.fillStyle='#e8cd85';g.fillText(fitText(g,`${state.needs.length} need you · ${state.needs[0].summary}`,1968),40,77);
  }
  const {columns,rows,visible}=screenGrid(state.seats.length),w=(2000-(columns-1)*16)/columns,h=(1000-top-(rows-1)*16)/rows;
  state.seats.slice(0,visible).forEach((seat,i)=>{
    const x=24+(i%columns)*(w+16),y=top+Math.floor(i/columns)*(h+16);
    g.fillStyle='#0b0c0d';g.beginPath();g.roundRect(x,y,w,h,10);g.fill();g.strokeStyle=fleetColors[seat.state];g.lineWidth=3;g.stroke();
    g.font=`600 28px ${sans}`;g.fillStyle='#ece6d6';g.fillText(fitText(g,`${seat.rig} · ${seat.name}`,w*.57-24),x+16,y+8);
    g.font=`22px ${sans}`;g.fillStyle=fleetColors[seat.state];
    const chip=seat.state==='stuck'?`stuck · ${seat.reason||'unchanged activity'}`:seat.state==='waiting'?'waiting':seat.state.replace('-',' ');
    g.textAlign='right';g.fillText(fitText(g,chip,w*.43-24),x+w-16,y+11);g.textAlign='left';
    const capacity=Math.min(rows===3?9:15,Math.floor((h-56)/24)),lines=(seat.tail??[]).slice(-capacity);
    g.save();g.beginPath();g.rect(x+16,y+44,w-32,h-56);g.clip();
    g.font='20px "Cascadia Mono", Consolas, monospace';g.fillStyle='#d8d3c4';
    if(!lines.length){g.fillStyle='#8b8676';g.textAlign='center';g.fillText('no output yet',x+w/2,y+h/2);}
    else lines.forEach((line,j)=>{g.globalAlpha=(seat.state==='stopped'?.4:1)*(j<2?.45:1);g.fillText(line,x+16,y+h-12-(lines.length-j)*24);});
    g.restore();
  });
}
