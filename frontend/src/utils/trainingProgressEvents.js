/** Notify listeners (e.g. Team page) that training progress changed. */
export function dispatchTrainingProgressUpdated() {
  try {
    window.dispatchEvent(new CustomEvent("agc-training-progress"));
  } catch {
    /* ignore */
  }
}

/** Fired when all assigned training is complete (includes email milestone). */
export function dispatchTrainingComplete() {
  try {
    window.dispatchEvent(new CustomEvent("agc-training-complete"));
    dispatchTrainingProgressUpdated();
  } catch {
    /* ignore */
  }
}
