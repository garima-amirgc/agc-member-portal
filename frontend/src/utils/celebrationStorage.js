const AUTO_DISMISS_BIRTHDAY = "agc_celebration_auto_birthday";
const AUTO_DISMISS_ANNIVERSARY = "agc_celebration_auto_anniversary";
const AUTO_DISMISS_LEGACY = "agc_celebration_auto_dismissed";

function read(key) {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function write(key) {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
  }
}

export function wasBirthdayAutoDismissed() {
  return read(AUTO_DISMISS_BIRTHDAY) || read(AUTO_DISMISS_LEGACY);
}

export function wasAnniversaryAutoDismissed() {
  return read(AUTO_DISMISS_ANNIVERSARY);
}

export function markBirthdayAutoDismissed() {
  write(AUTO_DISMISS_BIRTHDAY);
}

export function markAnniversaryAutoDismissed() {
  write(AUTO_DISMISS_ANNIVERSARY);
}

export function wasCelebrationAutoDismissed() {
  return wasBirthdayAutoDismissed() && wasAnniversaryAutoDismissed();
}

export function markCelebrationAutoDismissed() {
  markBirthdayAutoDismissed();
  markAnniversaryAutoDismissed();
}
