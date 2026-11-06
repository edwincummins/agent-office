// Cadre as it really is, read-only, for guests and for Fetty off the PC (11-06: "what if I have a guest watching and I
// want to show off Cadre? ... to be able to view Cadre for what it is and how it looks is important").
//
// The real Cadre Web page runs in a sealed frame (sandbox without same-origin: no office cookies, no storage) inside an
// office page. A short-lived watch pass, not the office sign-in, authorises its requests to /cadre-show/*, which this
// file answers by passing GETs through to the engine: never an action (every POST but the page's own /auth handshake is
// refused). For a guest every answer is cut to the teams he lets them watch, its text masked (guests.ts), his gold cards
// and terminals following his privacy eye, and live terminals replaced by masked colour frames built on the PC
// (screens.ts). The page's own buttons that would act are switched off as well, so nothing looks clickable that isn't.
import { randomBytes } from 'node:crypto';
import type http from 'node:http';
import type { Ctx } from '../office/context.js';
import type { Route } from '../http/router.js';
import { send } from '../http/util.js';
import { cadreOwner } from './access.js';
import { cadreWeb } from './web.js';
import { maskText } from './guests.js';
import { fleetGuestSettings, fleetSeatTeam, openScreenStream } from './index.js';
import type { FleetGuestSettings, FleetRun, FleetScreen } from '../../shared/protocol/fleet.js';
import { maskScreen as maskScreenLines } from './screens.js';

interface Pass { accountId: string; owner: boolean; expires: number }
const passes = new Map<string, Pass>();
const TTL = 30 * 60_000;

function issue(accountId: string, owner: boolean): string {
  const now = Date.now();
  for (const [k, p] of passes) if (p.expires < now) passes.delete(k);
  if (passes.size > 256) passes.delete(passes.keys().next().value!);
  const key = randomBytes(32).toString('hex');
  passes.set(key, { accountId, owner, expires: now + TTL });
  return key;
}

/** The page's script, put ahead of Cadre's own: requests go to the office's /cadre-show, storage lives in memory, and
 * only looking around stays clickable. */
function shim(office: string): string {
  const base = JSON.stringify(office + '/cadre-show').replace(/</g, '\\u003c');
  return `<script>(function(){
var B=${base},f=window.fetch.bind(window);
window.fetch=function(u,o){if(typeof u==='string'&&u.charAt(0)==='/')u=B+u;return f(u,o)};
function mem(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}
try{Object.defineProperty(window,'localStorage',{value:mem(),configurable:true})}catch(e){}
try{Object.defineProperty(window,'sessionStorage',{value:mem(),configurable:true})}catch(e){}
window.open=function(){return null};
var LOOK='[data-tab],[data-team],[data-cols],[data-go="needs"],[data-go="inbox"],[data-go="routines"],[data-seatjump],[data-seatpick],[data-ct="bell"],[data-ct="usage"],[data-ct="more"],[data-ct="theme"],[data-ct="skin"],[data-ct="zoom"],[data-ct="ttext"],[data-ct="tbig"],[data-ct="slim"],[data-ct="close"],[data-ct="go-needs"],[data-ct="go-tasks"],[data-ct="tt"],[data-ct="tt-x"],[data-ct="need"]';
var ACTS='button,a,[data-act],[data-ct],[data-sv],[data-tk-act],[data-go],[onclick],select,input[type=checkbox],input[type=range]';
function guard(e){var t=e.target&&e.target.closest&&e.target.closest(ACTS);if(!t||t.closest(LOOK))return;e.stopImmediatePropagation();e.preventDefault()}
['click','mousedown','pointerdown','keydown','submit','change'].forEach(function(k){document.addEventListener(k,function(e){if(k==='keydown'){var a=document.activeElement;if(a&&(a.tagName==='TEXTAREA'||(a.tagName==='INPUT'&&a.type==='text'&&!a.closest('[data-ct]'))))e.preventDefault();return}guard(e)},true)});
var st=document.createElement('style');st.textContent='textarea,.tf input,input[type=text]:not([placeholder*="Search"]){pointer-events:none!important;opacity:.55}#cadre-show-badge{position:fixed;right:12px;bottom:10px;z-index:99999;font:600 12px Segoe UI,sans-serif;color:#d8b25a;background:#222c25;border:1px solid #7a6431;border-radius:4px;padding:4px 10px;pointer-events:none}';
document.addEventListener('DOMContentLoaded',function(){document.head.appendChild(st);var b=document.createElement('div');b.id='cadre-show-badge';b.textContent='👁 Watching Cadre · read-only';document.body.appendChild(b)});
})();</script>`;
}

/** The office page that holds the sealed Cadre frame and hands it its watch pass. */
function page(office: string, pass: string): { html: string; csp: string } {
  const j = (v: string) => JSON.stringify(v).replace(/</g, '\\u003c');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cadre</title>
<style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#263129}iframe{display:block}</style></head><body>
<script>
const pass=${j(pass)},office=${j(office)};
const frame=document.createElement('iframe');frame.title='Cadre (read-only)';frame.sandbox='allow-scripts';frame.referrerPolicy='no-referrer';
fetch('/cadre-show/app',{headers:{Authorization:'Bearer '+pass},cache:'no-store'}).then(r=>r.ok?r.text():Promise.reject(r.status)).then(html=>{
  frame.srcdoc=html;document.body.append(frame);
}).catch(()=>{document.body.textContent='Cadre is not available right now.';});
addEventListener('message',e=>{
  if(e.source!==frame.contentWindow)return;
  if(e.data?.type==='cadre.web.ready')frame.contentWindow.postMessage({type:'cadre.web.authenticate',token:pass},'*');
  if(['cadre.web.connected','cadre.web.heartbeat','cadre.web.close'].includes(e.data?.type))parent.postMessage({type:e.data.type},office);
});
</script></body></html>`;
  // The sealed frame is built from srcdoc and inherits this policy, so it allows what Cadre's own page needs (its
  // inline styles and scripts, as the gateway's /app policy does) and nothing beyond this office.
  return { html, csp: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'` };
}

/** Opened by the office's Cadre panel off the PC, or for a guest: a fresh watch pass and the page holding Cadre. */
export const cadreShowPage: Route = {
  path: '/api/cadre/show', method: 'GET', auth: 'session',
  handle(ctx, { req, res, session, url }) {
    const account = session.account;
    if (!account || !cadreWeb(ctx.cfg.dataDir)) return send(res, 404, { error: 'Not available' });
    const office = `${ctx.cfg.tls || !/^(127\.0\.0\.1|localhost)(:|$)/.test(req.headers.host ?? '') ? 'https' : 'http'}://${req.headers.host}`;
    // ?as=guest: Fetty previews exactly what a guest sees (masked, his eye applied).
    const owner = !!cadreOwner(ctx, account.id) && url.searchParams.get('as') !== 'guest';
    const p = page(office, issue(account.id, owner));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': p.csp, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' }).end(p.html);
  },
};

// What a guest may never read, even masked: Fetty's own shells, browser frames, usage, routines and the audit log.
const GUEST_BLOCKED = /^\/api\/(chrome\/(term|terms|frame|routines|usage)|audit|overview|teamhead\/(img|preview)|seatview\/(polish|answer|keys|press))/;
const SCREEN_ROUTES = /^\/api\/(capture|seatview\/screen|stream)$/;

/** Deep copy with every string masked and every object naming a hidden team dropped. */
export function forGuest(value: unknown, visible: (team: string) => boolean, cards: boolean, terminals: boolean, key = ''): unknown {
  if (typeof value === 'string') return maskText(value);
  if (Array.isArray(value)) {
    if (!cards && /^(needs|cards|inbox|items)$/.test(key)) return [];
    return value
      .filter((v) => !(v && typeof v === 'object' && !Array.isArray(v) && ['rig', 'team'].some((k) => typeof (v as any)[k] === 'string' && !visible((v as any)[k]))))
      .filter((v) => !(typeof v === 'string' && key === 'teams' && !visible(v)))
      .map((v) => forGuest(v, visible, cards, terminals));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!terminals && (k === 'tail' || k === 'screen' || k === 'text')) continue;
      out[k] = forGuest(v, visible, cards, terminals, k);
    }
    return out;
  }
  return value;
}

/** A colour screen as the bytes of a terminal redraw, for the page's own xterm tiles. */
export function ansiFrame(screen: FleetScreen): string {
  const sgr = (c: number | string, bg: boolean) => {
    if (c === -1) return bg ? '49' : '39';
    if (c === -2) return bg ? '48;2;216;211;196' : '38;2;216;211;196';
    if (c === -3) return bg ? '48;2;30;38;33' : '38;2;30;38;33';
    if (typeof c === 'string') { const n = parseInt(c.slice(1), 16); return `${bg ? 48 : 38};2;${n >> 16};${(n >> 8) & 255};${n & 255}`; }
    return `${bg ? 48 : 38};5;${c}`;
  };
  const rows = screen.lines.slice(-(screen.rows || 40));
  const body = rows.map((runs: FleetRun[]) => runs.map(([t, fg, bg, b]) => `\x1b[0;${b ? '1;' : ''}${sgr(fg, false)};${sgr(bg, true)}m${t}`).join('') + '\x1b[0m\x1b[K').join('\r\n');
  return `\x1b[?25l\x1b[H${body}\x1b[J`;
}

function streamScreens(ctx: Ctx, res: http.ServerResponse, req: http.IncomingMessage, seat: string, mask: boolean) {
  let wrote = false;
  const write = (sc: FleetScreen) => {
    if (res.destroyed || res.writableEnded) return;
    if (!wrote) { wrote = true; res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store', 'x-cols': String(sc.cols), 'x-rows': String(sc.rows || 40), 'access-control-allow-origin': 'null', 'access-control-expose-headers': 'x-cols, x-rows' }); }
    res.write(ansiFrame(mask ? { ...sc, lines: maskScreenLines(sc.lines) } : sc));
  };
  const close = openScreenStream(ctx, seat, write);
  if (!close) return send(res, 404, { error: 'Not available' });
  const end = () => close();
  req.on('close', end); res.on('close', end);
  setTimeout(() => { if (!wrote) { close(); if (!res.headersSent) send(res, 404, { error: 'No screen yet' }); } }, 8000).unref();
}

const cors = (res: http.ServerResponse) => {
  // The sealed frame has no origin ('null'); its requests carry the watch pass, never cookies.
  res.setHeader('access-control-allow-origin', 'null');
  res.setHeader('access-control-allow-headers', 'authorization, content-type');
  res.setHeader('access-control-allow-methods', 'GET, POST');
  res.setHeader('access-control-expose-headers', 'x-cols, x-rows');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
};

/** The sealed Cadre page's requests: read-only passthrough to the engine, cut for guests. */
export const cadreShowApi: Route = {
  prefix: '/cadre-show/', auth: 'public',
  async handle(ctx, { req, res, url }) {
    cors(res);
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    const pass = passes.get(bearer);
    const account = pass && pass.expires > Date.now() ? ctx.accounts.get(pass.accountId) : undefined;
    if (!pass || !account) return send(res, 403, { error: 'Not available' });
    const route = url.pathname.slice('/cadre-show'.length);
    // The page's own handshake; every other write is refused.
    if (req.method === 'POST') return route === '/auth' ? send(res, 200, { ok: true }) : send(res, 403, { error: 'Read-only' });
    if (req.method !== 'GET') return send(res, 405, { error: 'Read-only' });
    const engine = cadreWeb(ctx.cfg.dataDir);
    if (!engine) return send(res, 404, { error: 'Not available' });
    const guest = !pass.owner || !cadreOwner(ctx, pass.accountId);
    const eye: FleetGuestSettings = fleetGuestSettings(ctx);
    const visible = (team: string) => !guest || eye.teams[team] === true;
    const isApi = /^\/api\/[a-z0-9][a-z0-9/_.-]*$/i.test(route) && !route.includes('..');
    const isCode = route === '/app' || route === '/views' || /^\/views\/[a-z][a-z0-9-]*\.js$/.test(route) || route === '/version';
    if (!isApi && !isCode) return send(res, 404, { error: 'Not available' });
    if (guest && GUEST_BLOCKED.test(route)) return send(res, 200, route.endsWith('s') ? [] : {});
    if (SCREEN_ROUTES.test(route) && !eye.terminals) return send(res, 404, { error: 'Hidden' });
    if (guest && !eye.cards && /^\/api\/(inbox|decide)/.test(route)) return send(res, 200, []);
    // A request naming a team or seat the guest may not watch.
    const team = url.searchParams.get('team') ?? (url.searchParams.get('seat') ? fleetSeatTeam(ctx, url.searchParams.get('seat')!) : null);
    if (team && !visible(team)) return send(res, 403, { error: 'Not available' });
    if (route === '/api/stream') {
      const seat = url.searchParams.get('seat') ?? '';
      if (guest) return streamScreens(ctx, res, req, seat, true);
      // Fetty himself: the real stream, piped.
      const stop = new AbortController(); req.on('close', () => stop.abort()); res.on('close', () => stop.abort());
      try {
        const up = await fetch(new URL(`/api/stream${url.search}`, engine.url), { headers: { Authorization: `Bearer ${engine.token}` }, signal: stop.signal });
        const head: Record<string, string> = { 'content-type': 'application/octet-stream' };
        for (const k of ['x-cols', 'x-rows']) { const v = up.headers.get(k); if (v) head[k] = v; }
        res.writeHead(up.status, head);
        if (up.body) for await (const chunk of up.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk);
      } catch { /* the tile closed */ }
      return res.end();
    }
    let up: Response, raw: Buffer;
    try {
      const target = new URL(route === '/app' ? '/' : route, engine.url); target.search = url.search;
      up = await fetch(target, { headers: { Authorization: `Bearer ${engine.token}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
      raw = Buffer.from(await up.arrayBuffer());
    } catch { return send(res, 502, { error: 'Cadre request unavailable' }); }
    const type = up.headers.get('content-type') ?? 'application/octet-stream';
    if (route === '/app') {
      const office = `${ctx.cfg.tls || !/^(127\.0\.0\.1|localhost)(:|$)/.test(req.headers.host ?? '') ? 'https' : 'http'}://${req.headers.host}`;
      // Cadre's page has no <head>: the shim goes right after its charset tag, ahead of all its own scripts.
      const page = raw.toString('utf8'), at = page.search(/<meta charset[^>]*>/i);
      const html = at >= 0 ? page.replace(/<meta charset[^>]*>/i, (m) => m + shim(office)) : shim(office) + page;
      return res.writeHead(up.status, { 'content-type': 'text/html; charset=utf-8' }).end(html);
    }
    if (!guest && !eye.terminals && /json/.test(type)) {
      // His own view follows the eye too: terminal text comes out, nothing is masked.
      const strip = (v: unknown): unknown => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !['tail', 'screen', 'text'].includes(k)).map(([k, x]) => [k, strip(x)])) : v;
      try { return res.writeHead(up.status, { 'content-type': 'application/json' }).end(JSON.stringify(strip(JSON.parse(raw.toString('utf8'))))); } catch { return send(res, 502, { error: 'Bad answer' }); }
    }
    if (guest && /json/.test(type)) {
      let body: unknown;
      try { body = JSON.parse(raw.toString('utf8')); } catch { return send(res, 502, { error: 'Bad answer' }); }
      return res.writeHead(up.status, { 'content-type': 'application/json' }).end(JSON.stringify(forGuest(body, visible, eye.cards, eye.terminals)));
    }
    res.writeHead(up.status, { 'content-type': type }).end(raw);
  },
};
