import type { FleetClientMsg } from '../../../shared/protocol/fleet.js';
import { subscribeFleet, leaveFleet, setFleetGuests, fleetScreens } from '../../fleet/index.js';
import type { FeatureHooks, HandlerMap } from './types.js';
export const fleetHandlers={'fleet.subscribe':subscribeFleet,'fleet.guests':setFleetGuests,'fleet.screens':fleetScreens} satisfies HandlerMap<FleetClientMsg>;
export const fleetHooks={closed:leaveFleet} satisfies FeatureHooks;
