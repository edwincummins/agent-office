import {TV,JUKEBOX,CABINET,GONG} from '../layout.js';
import type {ResolvedSlots} from './index.js';
/** Exact existing builder roots. TV.x already includes a wall offset; its group has another. */
export const NATIVE_SLOTS:ResolvedSlots={
 tv:{position:{x:TV.x-.1,y:TV.y,z:TV.z},size:{width:TV.width,height:TV.height,depth:.14},rotY:-Math.PI/2},
 jukebox:{position:{x:JUKEBOX.x,y:0,z:JUKEBOX.z},size:{width:JUKEBOX.width,height:JUKEBOX.height,depth:JUKEBOX.depth},rotY:-Math.PI/2},
 arcade:{position:{x:CABINET.x,y:0,z:CABINET.z},size:{width:CABINET.width,height:CABINET.height,depth:CABINET.depth},rotY:-Math.PI/2},
 lounge:{position:{x:13.4,y:0,z:0},size:{width:7,height:1.2,depth:7},rotY:Math.PI/2},
 gong:{position:{x:GONG.x,y:0,z:GONG.z},size:{width:GONG.width,height:GONG.height,depth:.6},rotY:0},
};

/** Stock map data; separate from the fixed source dimensions used by reusable builders. */
export const STOCK_SLOTS:ResolvedSlots=structuredClone(NATIVE_SLOTS);
