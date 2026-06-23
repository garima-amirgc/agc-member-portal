const COMPANY_CONTENT_SECTIONS = Object.freeze([
  "policy",
  "benefits",
  "forms",
  "about_forms",
  "policy_changes",
  "links",
  "links_websites",
]);

const COMPANY_ABOUT_INTRO_KEY = "company_about_intro";
const LINKS_SECTIONS_MIGRATED_KEY = "company_content_links_sections_migrated_v1";

const DEFAULT_ABOUT_INTRO =
  "The Amir Group of Companies is a family of food businesses committed to quality, safety, and service. " +
  "Explore company policies, benefits, and forms below. Contact HR if you need help finding a document or link.";

const COMPANY_CONTENT_SEED = Object.freeze([
  { section: "forms", title: "Mileage Reporting Form", sort_order: 1 },
  { section: "forms", title: "Supply Request Form", sort_order: 2 },
  {
    section: "links",
    title: "ADP Access",
    link_url: "https://workforcenow.adp.com",
    sort_order: 1,
  },
  {
    section: "links",
    title: "Internal job opportunities – ADP Workforce Now Career Centre",
    link_url: "https://workforcenow.adp.com",
    sort_order: 2,
  },
  {
    section: "links",
    title: "Atlas – The Citation Hub",
    link_url: "https://www.atlas-certification.com",
    sort_order: 3,
  },
  {
    section: "links_websites",
    title: "Home – Amir (Sierra Custom Foods Ltd.)",
    link_url: "https://www.sierracustomfoods.com",
    sort_order: 1,
  },
  {
    section: "links_websites",
    title: "Products – Freefield Farms",
    link_url: "https://www.freefieldfarms.ca",
    sort_order: 2,
  },
  {
    section: "links_websites",
    title: "Career Page – Careers at Amir",
    link_url: "https://www.amirqualitymeats.com/careers",
    sort_order: 3,
  },
  {
    section: "links_websites",
    title: "Amir Group of Companies – LinkedIn",
    link_url: "https://www.linkedin.com/company/amir-group-of-companies",
    sort_order: 4,
  },
  {
    section: "links_websites",
    title: "Amir Quality Meats Inc. – LinkedIn",
    link_url: "https://www.linkedin.com/company/amir-quality-meats-inc",
    sort_order: 5,
  },
  {
    section: "links_websites",
    title: "Amir Specialty Poultry – LinkedIn",
    link_url: "https://www.linkedin.com/company/amir-specialty-poultry",
    sort_order: 6,
  },
]);

function isPortalLinkRow(row) {
  const url = String(row?.link_url || "").trim().toLowerCase();
  const title = String(row?.title || "").trim().toLowerCase();
  if (/adp\.com|workforcenow/i.test(url)) return true;
  if (/atlas-certification/i.test(url)) return true;
  if (title.startsWith("adp ") || title.includes("adp access")) return true;
  if (title.includes("adp workforce")) return true;
  if (title.includes("atlas")) return true;
  return false;
}

function isValidCompanySection(section) {
  return COMPANY_CONTENT_SECTIONS.includes(String(section || "").trim());
}

function normalizeCompanySectionKey(section) {
  const s = String(section || "").trim();
  if (s === "websites") return "links_websites";
  return s;
}

module.exports = {
  COMPANY_CONTENT_SECTIONS,
  COMPANY_ABOUT_INTRO_KEY,
  LINKS_SECTIONS_MIGRATED_KEY,
  DEFAULT_ABOUT_INTRO,
  COMPANY_CONTENT_SEED,
  isPortalLinkRow,
  isValidCompanySection,
  normalizeCompanySectionKey,
};
