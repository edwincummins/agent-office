/** Keep the 0.12m tag and its 0.08m text below 33px / 22px at close range. */
export function tagScale(depth:number,projectionY:number,viewportHeight:number):number {
 const pixels=.12*Math.abs(projectionY)*Math.max(1,viewportHeight)/(2*Math.max(.001,depth));
 return Math.min(1,33/pixels);
}
export const tagOpacity=(distance:number)=>Math.min(1,Math.max(0,(16-distance)/2));
