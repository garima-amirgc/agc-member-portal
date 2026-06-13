/** Valid section keys for company_content_items. */
const COMPANY_CONTENT_SECTIONS = Object.freeze([
  "policy",
  "benefits",
  "forms",
  "about_forms",
  "policy_changes",
  "links",
]);

const COMPANY_ABOUT_INTRO_KEY = "company_about_intro";

const DEFAULT_ABOUT_INTRO =
  "The Amir Group of Companies is a family of food businesses committed to quality, safety, and service. " +
  "Explore company policies, benefits, and forms below. Contact HR if you need help finding a document or link.";

/** Seed rows inserted once when the table is empty. */
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
    title: "Home – Amir (Sierra Custom Foods Ltd.)",
    link_url: "https://www.sierracustomfoods.com",
    sort_order: 2,
  },
  {
    section: "links",
    title: "Products – Freefield Farms",
    link_url: "https://www.freefieldfarms.ca",
    sort_order: 3,
  },
  {
    section: "links",
    title: "Internal job opportunities – ADP Workforce Now Career Centre",
    link_url: "https://workforcenow.adp.com",
    sort_order: 4,
  },
  {
    section: "links",
    title: "Career Page – Careers at Amir",
    link_url: "https://www.amirqualitymeats.com/careers",
    sort_order: 5,
  },
  {
    section: "links",
    title: "Amir Group of Companies – LinkedIn",
    link_url: "https://www.linkedin.com/company/amir-group-of-companies",
    sort_order: 6,
  },
  {
    section: "links",
    title: "Amir Quality Meats Inc. – LinkedIn",
    link_url: "https://www.linkedin.com/company/amir-quality-meats-inc",
    sort_order: 7,
  },
  {
    section: "links",
    title: "Amir Specialty Poultry – LinkedIn",
    link_url: "https://www.linkedin.com/company/amir-specialty-poultry",
    sort_order: 8,
  },
  {
    section: "links",
    title: "Atlas – The Citation Hub",
    link_url: "https://www.atlas-certification.com",
    sort_order: 9,
  },
]);

function isValidCompanySection(section) {
  return COMPANY_CONTENT_SECTIONS.includes(String(section || "").trim());
}

module.exports = {
  COMPANY_CONTENT_SECTIONS,
  COMPANY_ABOUT_INTRO_KEY,
  DEFAULT_ABOUT_INTRO,
  COMPANY_CONTENT_SEED,
  isValidCompanySection,
};
