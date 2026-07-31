// Electricity, expressed through the shared utility reader.
//
// This module is the one that established the evidence — that a building's
// supply is a storage line rather than a wire, and that a line at zero is a
// building that had none when the save was written. water and heat record
// themselves identically, so the reading moved to utility_alerts.js and this
// is the electricity-shaped door onto it.
import { buildingNeedsUtility, missingUtilityAlerts } from './utility_alerts.js?v=5';

export function buildingNeedsElectricity(building) {
  return buildingNeedsUtility(building, 'eletric');
}

export function unpoweredBuildingAlerts(options = {}) {
  return missingUtilityAlerts({ ...options, resource: 'eletric' });
}
