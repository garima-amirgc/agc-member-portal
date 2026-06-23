export function dispatchTrainingProgressUpdated() {
  try {
    window.dispatchEvent(new CustomEvent("agc-training-progress"));
  } catch {
  }
}

export function dispatchTrainingComplete() {
  try {
    window.dispatchEvent(new CustomEvent("agc-training-complete"));
    dispatchTrainingProgressUpdated();
  } catch {
  }
}
