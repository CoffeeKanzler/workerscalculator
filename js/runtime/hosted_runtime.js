export function createHostedRuntime({ saveAdapter = null } = {}) {
  return {
    mode: 'hosted',
    capabilities: Object.freeze({ live: false, saveImport: true, planning: true }),
    live: null,
    saveAdapter,
    async start() {
      return { status: 'ready', mode: 'hosted', model: null };
    },
    async importSave(files, options) {
      if (!saveAdapter?.importSaveFolder) throw new Error('Hosted save adapter is not configured');
      return saveAdapter.importSaveFolder(files, options);
    },
  };
}
