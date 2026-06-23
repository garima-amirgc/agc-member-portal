import {
  IconBuilding,
  IconClipboard,
  IconDocument,
  IconGlobe,
  IconHeart,
  IconInfo,
  IconLink,
  IconMegaphone,
} from "../components/layout/SidebarIcons";

export const COMPANY_CONTENT_NAV_TITLE = "AGC";

export const COMPANY_CONTENT_SECTIONS = Object.freeze([
  {
    key: "about",
    label: "About the company",
    navIcon: IconInfo,
    route: "/about-company/about",
    pageTitle: "About the company",
    pageIntro: "",
    adminLabel: "About page forms",
    isAboutPage: true,
  },
  {
    key: "benefits",
    label: "Benefits",
    navIcon: IconHeart,
    route: "/about-company/benefits",
    pageTitle: "Benefits",
    pageIntro: "Employee benefits information and documents.",
    adminLabel: "Benefits",
    showFile: true,
    showLink: false,
    showDescription: true,
  },
  {
    key: "policy",
    label: "Company policy",
    navIcon: IconDocument,
    route: "/about-company/policy",
    pageTitle: "Company policy",
    pageIntro: "Company policies and reference documents.",
    adminLabel: "Company policy",
    showFile: true,
    showLink: false,
    showDescription: true,
  },
  {
    key: "policy_changes",
    label: "Policy changes",
    navIcon: IconMegaphone,
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
    navIcon: IconLink,
    route: "/about-company/links",
    pageTitle: "Links to Portal",
    pageIntro: "Quick links to ADP, training platforms, and other internal portal tools.",
    adminLabel: "Portal links",
    showFile: false,
    showLink: true,
    showDescription: false,
  },
  {
    key: "links_websites",
    label: "Links to websites",
    navIcon: IconGlobe,
    route: "/about-company/websites",
    pageTitle: "Links to websites",
    pageIntro: "Company websites, careers pages, and social profiles.",
    adminLabel: "Website links",
    showFile: false,
    showLink: true,
    showDescription: false,
  },
  {
    key: "forms",
    label: "Forms",
    navIcon: IconClipboard,
    route: "/about-company/forms",
    pageTitle: "Forms",
    pageIntro: "Download and complete common company forms.",
    adminLabel: "Forms (Mileage & Supply)",
    showFile: true,
    showLink: false,
    showDescription: false,
  },
]);

export const ABOUT_COMPANY_NAV_ITEMS = COMPANY_CONTENT_SECTIONS.map((section) => ({
  to: section.route,
  label: section.label,
  icon: section.navIcon || IconBuilding,
}));

export const COMPANY_CONTENT_ADMIN_SECTIONS = Object.freeze([
  { key: "policy", label: "Company policy", showFile: true, showLink: false, showDescription: true },
  { key: "benefits", label: "Benefits", showFile: true, showLink: false, showDescription: true },
  { key: "policy_changes", label: "Policy changes", showFile: true, showLink: false, showDescription: true },
  { key: "links", label: "Portal links", showFile: false, showLink: true, showDescription: false },
  { key: "links_websites", label: "Website links", showFile: false, showLink: true, showDescription: false },
  { key: "forms", label: "Forms", showFile: true, showLink: false, showDescription: false },
  {
    key: "about_forms",
    label: "About page forms",
    showFile: true,
    showLink: false,
    showDescription: false,
    aboutIntroTab: true,
  },
]);

export function companySectionByRouteParam(sectionParam) {
  const param = String(sectionParam || "").trim().toLowerCase();
  if (param === "about") {
    return COMPANY_CONTENT_SECTIONS.find((s) => s.key === "about");
  }
  if (param === "policy-changes") {
    return COMPANY_CONTENT_SECTIONS.find((s) => s.key === "policy_changes");
  }
  if (param === "websites") {
    return COMPANY_CONTENT_SECTIONS.find((s) => s.key === "links_websites");
  }
  return COMPANY_CONTENT_SECTIONS.find((s) => s.route.endsWith(`/${param}`));
}

export function companySectionByKey(key) {
  return COMPANY_CONTENT_ADMIN_SECTIONS.find((s) => s.key === key);
}
