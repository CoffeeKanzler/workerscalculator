// A save import hands the user to the republic tab as soon as the core data is
// ready, while optional map layers keep parsing in the background. Anything
// that fails after that hand-off has to be visible from wherever the user now
// is: the import status text itself is only rendered on the start and
// save-import tabs, and the map retry button only on save-import.
//
// So the banner is mounted for as long as it has something worth saying, not
// merely while the import is busy. Success is excluded on purpose — the
// imported republic on screen is its own confirmation.
export function importBannerState({
  importBusy = false,
  importStatus = '',
  importStatusError = false,
  mapLayersFailed = false,
  dismissedStatus = null,
} = {}) {
  if (importBusy) {
    return {
      visible: true,
      spinner: true,
      tone: 'busy',
      message: importStatus,
      retry: false,
      dismissible: false,
    };
  }
  const dismissed = !!importStatus && importStatus === dismissedStatus;
  // A failed optional layer is reported as a warning rather than an error, so
  // the import reads as a success while the map quietly renders without its
  // water, pollution or roads. It is worth saying out loud, and it is
  // actionable: the files are still held for a retry.
  const tone = importStatusError ? 'error' : (mapLayersFailed ? 'warn' : 'none');
  const visible = tone !== 'none' && !!importStatus && !dismissed;
  return {
    visible,
    spinner: false,
    tone: visible ? tone : 'none',
    message: visible ? importStatus : '',
    retry: visible && !!mapLayersFailed,
    dismissible: visible,
  };
}

// An import of a large save runs for minutes, and nothing stopped a second one
// from being started on top of it. Two concurrent imports interleave: they
// share one fixed backup snapshot name, so the rollback target can become a
// half-imported state, and the core pass has no equivalent of the guard the
// deferred map pass uses to notice it has been superseded.
export function importControls({ importBusy = false } = {}) {
  return {
    pickerDisabled: !!importBusy,
    retryDisabled: !!importBusy,
  };
}
