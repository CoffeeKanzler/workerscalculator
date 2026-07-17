import {
  parseNamepoints, parseBuildingsGame, parseWorkers, parseHeader, parseResearch,
  reconcileSettlementMembership,
} from './savegame.js';

const sourceStatus = (payload) => Object.fromEntries(
  ['namepoints', 'buildings', 'workers', 'header', 'research']
    .map((key) => [key, payload[key] ? 'pending' : 'missing']),
);

self.onmessage = ({ data }) => {
  const status = sourceStatus(data);
  const warnings = [];
  const required = (key, parse) => {
    try {
      const value = parse(data[key]);
      status[key] = 'exact';
      return value;
    } catch (error) {
      status[key] = 'failed';
      self.postMessage({ type: 'error', file: key, message: error.message, required: true });
      throw error;
    }
  };
  const optional = (key, parse) => {
    if (!data[key]) return null;
    try {
      const value = parse(data[key]);
      status[key] = 'exact';
      return value;
    } catch (error) {
      status[key] = 'failed';
      warnings.push({ file: key, message: error.message });
      self.postMessage({ type: 'error', file: key, message: error.message, required: false });
      return null;
    }
  };

  try {
    const header = optional('header', parseHeader);
    const settlements = required('namepoints', parseNamepoints);
    const buildings = required('buildings', (buffer) => parseBuildingsGame(buffer, {
      onProgress: (done, total) => self.postMessage({ type: 'progress', file: 'buildings', done, total }),
    }));
    const membershipAudit = reconcileSettlementMembership(settlements, buildings);
    const workers = optional('workers', (buffer) => parseWorkers(buffer, {
      saveVersion: header?.saveVersion ?? 124,
    }));
    const research = optional('research', parseResearch);
    self.postMessage({
      type: 'complete',
      parsed: {
        settlements, buildings, citizens: workers?.citizens ?? null,
        citizenFileSummary: workers?.summary ?? null, header, research,
        membershipAudit, sourceStatus: status, warnings,
      },
    });
  } catch {
    // Required-source errors have already been reported with useful context.
  }
};
