function getHelpContacts() {
  return [
    {
      id: "garima",
      name: String(process.env.HELP_GARIMA_NAME || "Garima Singh").trim(),
      role: String(process.env.HELP_GARIMA_ROLE || "Portal support").trim(),
      email: String(process.env.HELP_GARIMA_EMAIL || "").trim(),
    },
    {
      id: "ashhar",
      name: String(process.env.HELP_ASHHAR_NAME || process.env.HELP_SYED_NAME || "Ashhar").trim(),
      role: String(process.env.HELP_ASHHAR_ROLE || process.env.HELP_SYED_ROLE || "Portal support").trim(),
      email: String(process.env.HELP_ASHHAR_EMAIL || process.env.HELP_SYED_EMAIL || "").trim(),
    },
  ];
}

function getHelpRecipientEmails() {
  const seen = new Set();
  const out = [];
  for (const c of getHelpContacts()) {
    const email = String(c.email || "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(c.email.trim());
  }
  return out;
}

module.exports = { getHelpContacts, getHelpRecipientEmails };
