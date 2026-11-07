import type { SettingsClientMsg } from '../../../shared/protocol.js';
import type { HandlerMap } from './types.js';

/** Registered behind the office's owner gate; visitors never choose the shared sky. */
export const skyLocationHandlers = {
  'sky.location'(ctx, c, msg) {
    const error = ctx.sky.setLocation(msg.location);
    if (error) ctx.warn(c, error);
  },
} satisfies HandlerMap<Extract<SettingsClientMsg, { t: 'sky.location' }>>;
