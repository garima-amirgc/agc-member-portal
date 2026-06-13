export const COMPANY_CONTENT_SECTIONS = Object.freeze([
  {
    key: "policy",
    label: "Company policy",
    route: "/about-company/policy",
    pageTitle: "Company policy",
    pageIntro: "Company policies and reference documents.",
    adminLabel: "Company policy",
    showFile: true,
    showLink: false,
    showDescription: true,
  },
  {
    key: "benefits",
    label: "Benefits",
    route: "/about-company/benefits",
    pageTitle: "Benefits",
    pageIntro: "Employee benefits information and documents.",
    adminLabel: "Benefits",
    showFile: true,
    showLink: false,
    showDescription: true,
  },
  {
    key: "forms",
    label: "Forms",
    route: "/about-company/forms",
    pageTitle: "Forms",
    pageIntro: "Download and complete common company forms.",
    adminLabel: "Forms (Mileage & Supply)",
    showFile: true,
    showLink: false,
    showDescription: false,
  },
  {
    key: "about",
    label: "About the company",
    route: "/about-company/about",
    pageTitle: "About the company",
    pageIntro: "Learn about Amir Group of Companies and access additional forms.",
    adminLabel: "About page forms",
    isAboutPage: true,
  },
  {
    key: "policy_changes",
    label: "Policy changes",
    route: "/about-company/policy-changes",
    pageTitle: "Policy changes",
    pageIntro: "Recent policy updates and announcements.",
    adminLabel: "Policy changes",
    showFile: true,
    showLink: false,
    showDescription: true,
  },
  {
    key: "links",
    label: "Links to Portal",
    route: "/about-company/links",
    pageTitle: "Links to Portal",
    pageIntro: "Quick links to ADP, company websites, careers, LinkedIn, and training platforms.",
    adminLabel: "Portal links",
    showFile: false,
    showLink: true,
    showDescription: false,
  },
]);

export const ABOUT_COMPANY_NAV_ITEMS = COMPANY_CONTENT_SECTIONS.map((section) => ({
  to: section.route,
  label: section.label,
}));

/** Admin tabs — about_forms stored separately from main about page route key. */
export const COMPANY_CONTENT_ADMIN_SECTIONS = Object.freeze([
  { key: "policy", label: "Company policy", showFile: true, showLink: false, showDescription: true },
  { key: "benefits", label: "Benefits", showFile: true, showLink: false, showDescription: true },
  { key: "forms", label: "Forms", showFile: true, showLink: false, showDescription: false },
  {
    key: "about_forms",
    label: "About page forms",
    showFile: true,
    showLink: false,
    showDescription: false,
    aboutIntroTab: true,
  },
  { key: "policy_changes", label: "Policy changes", showFile: true, showLink: false, showDescription: true },
  { key: "links", label: "Portal links", showFile: false, showLink: true, showDescription: false },
]);

export function companySectionByRouteParam(sectionParam) {
  const param = String(sectionParam || "").trim().toLowerCase();
  if (param === "about") {
    return COMPANY_CONTENT_SECTIONS.find((s) => s.key === "about");
  }
  if (param === "policy-changes") {
    return COMPANY_CONTENT_SECTIONS.find((s) => s.key === "policy_changes");
  }
  return COMPANY_CONTENT_SECTIONS.find((s) => s.route.endsWith(`/${param}`));
}

export function companySectionByKey(key) {
  return COMPANY_CONTENT_ADMIN_SECTIONS.find((s) => s.key === key);
}
