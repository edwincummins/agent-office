import type { FleetSnapshot, FleetStatus } from '../../../shared/protocol/fleet';

export const fleetColors:Record<FleetStatus,string>={working:'#3ecf8e','needs-you':'#e3a948',stuck:'#e2605f',idle:'#8b8676',stopped:'#2c3036'};
export function fitText(ctx:Pick<CanvasRenderingContext2D,'measureText'>,value:string,width:number):string {
  const chars=Array.from(value.replace(/[\u0000-\u001f\u007f]/g,' '));
  if(ctx.measureText(chars.join('')).width<=width)return chars.join('');
  while(chars.length&&ctx.measureText(chars.join('')+'…').width>width)chars.pop();
  return chars.length?chars.join('')+'…':'';
}
const sans='"Segoe UI", sans-serif';
function activityLines(g:CanvasRenderingContext2D,value:string,width:number):string[] {
  const text=value.replace(/[\u0000-\u001f\u007f]/g,' ');
  if(g.measureText(text).width<=width)return [text];
  const chars=Array.from(text);let end=0;
  while(end<chars.length&&g.measureText(chars.slice(0,end+1).join('')).width<=width)end++;
  const space=chars.slice(0,end).lastIndexOf(' ');
  if(space>end/2)end=space;
  return [chars.slice(0,end).join(''),fitText(g,chars.slice(end).join('').trimStart(),width)];
}
const urgency:FleetStatus[]=['needs-you','stuck','working','idle','stopped'];
export function drawFleet(g:CanvasRenderingContext2D,state:FleetSnapshot|null) {
  g.globalAlpha=1;g.textBaseline='top';g.textAlign='left';g.fillStyle='#08090a';g.fillRect(0,0,2048,1024);
  g.fillStyle='#F0643B';g.fillRect(28,36,24,24);g.fillStyle='#ece6d6';g.font=`600 40px ${sans}`;g.fillText('Cadre',70,25);
  g.fillStyle='#8b8676';g.font=`24px ${sans}`;g.fillText(state?`${state.teams.length} teams · ${state.seats.length} seats${state.status==='stale'?' · STALE — feed unavailable':''}`:'Feed is off',230,37);
  if(!state){g.font=`30px ${sans}`;g.fillText('Cadre feed is off. Set cadre.fleetCommand',28,150);return;}
  let top=110;
  if(state.needs.length){
    g.fillStyle='#211c11';g.fillRect(28,top,1992,78);g.strokeStyle='#c9a24a';g.lineWidth=2;g.strokeRect(28,top,1992,78);
    g.font=`600 30px ${sans}`;g.fillStyle='#e8cd85';g.fillText(fitText(g,`${state.needs.length} need you · ${state.needs[0].summary}`,1940),48,top+23);top+=98;
  }
  if(!state.teams.length){g.font=`30px ${sans}`;g.fillStyle='#8b8676';g.fillText('No teams or seats yet',28,top+30);return;}
  const columns=Math.min(4,state.teams.length),rows=state.teams.length>4?2:1;
  const w=(1992-(columns-1)*20)/columns,h=(996-top-(rows-1)*20)/rows;
  state.teams.slice(0,8).forEach((team,i)=>{
    const x=28+(i%columns)*(w+20),y=top+Math.floor(i/columns)*(h+20);
    const seats=state.seats.filter(s=>s.rig===team),status=urgency.find(s=>seats.some(seat=>seat.state===s))??'idle';
    g.fillStyle='#0b0c0d';g.beginPath();g.roundRect(x,y,w,h,14);g.fill();g.strokeStyle=fleetColors[status];g.lineWidth=2;g.stroke();
    g.fillStyle='#17191c';g.fillRect(x+2,y+2,w-4,72);
    g.font=`600 40px ${sans}`;g.fillStyle='#ece6d6';g.fillText(fitText(g,team,w*.57),x+16,y+13);
    g.font=`600 22px ${sans}`;g.fillStyle=fleetColors[status];g.fillText(status==='working'?`${seats.filter(s=>s.state==='working').length} working`:status.replace('-',' '),x+w*.62,y+18);
    if(i===7&&state.teams.length>8){g.fillStyle='#8b8676';g.fillText(`+${state.teams.length-7} more teams`,x+16,y+80);return;}
    const rowHeight=86;
    const capacity=Math.max(1,Math.floor((h-94)/rowHeight));
    const visible=seats.length>capacity?seats.slice(0,capacity-1):seats;
    visible.forEach((seat,j)=>{
      const sy=y+90+j*rowHeight;g.globalAlpha=seat.state==='stopped'?.45:1;
      g.beginPath();g.arc(x+20,sy+12,6,0,Math.PI*2);g.fillStyle=fleetColors[seat.state];g.strokeStyle='#2c3036';seat.state==='stopped'?g.stroke():g.fill();
      g.font=`32px ${sans}`;g.fillStyle='#c9c3b3';g.fillText(fitText(g,seat.name,w-52),x+36,sy);
      g.font='24px "Cascadia Mono", Consolas, monospace';g.fillStyle='#8b8676';
      activityLines(g,seat.activity||seat.state,w-52).forEach((line,k)=>g.fillText(line,x+36,sy+32+k*24));
      g.globalAlpha=1;
    });
    if(seats.length>visible.length){g.font=`24px ${sans}`;g.fillStyle='#8b8676';g.fillText(`+${seats.length-visible.length} more`,x+18,y+90+visible.length*rowHeight);}
    if(!seats.length){g.font=`24px ${sans}`;g.fillStyle='#8b8676';g.fillText('No seats',x+18,y+80);}
  });
}
