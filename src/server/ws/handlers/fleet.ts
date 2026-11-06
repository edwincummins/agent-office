import type { FleetClientMsg } from '../../../shared/protocol/fleet.js';
import { subscribeFleet, leaveFleet, setFleetGuests } from '../../fleet/index.js';
import type { FeatureHooks, HandlerMap } from './types.js';
export const fleetHandlers={'fleet.subscribe':subscribeFleet,'fleet.guests':setFleetGuests} satisfies HandlerMap<FleetClientMsg>;
export const fleetHooks={closed:leaveFleet} satisfies FeatureHooks;
