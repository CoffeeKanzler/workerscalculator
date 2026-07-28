export function createAddonRuntime({ liveAdapter, saveAdapter = null } = {}) {
  if (!liveAdapter || typeof liveAdapter.refresh !== 'function') {
    throw new TypeError('Addon runtime requires a live SDK adapter');
  }
  return {
    mode: 'addon',
    capabilities: Object.freeze({ live: true, saveImport: true, planning: true }),
    live: liveAdapter,
    saveAdapter,
    async start() {
      return liveAdapter.refresh();
    },
    async importSave(files, options) {
      if (!saveAdapter?.importSaveFolder) throw new Error('Addon save adapter is not configured');
      return saveAdapter.importSaveFolder(files, options);
    },
  };
}
