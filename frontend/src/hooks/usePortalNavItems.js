import { useMemo } from "react";
import {
  IconBuilding,
  IconCalendar,
  IconChart,
  IconCog,
  IconHome,
  IconTeam,
  IconTicket,
  IconUser,
  IconUsers,
} from "../components/layout/SidebarIcons";
import { ADMIN_GRANT_KEYS } from "../constants/adminGrants";
import { buildAdminNavGroups } from "../constants/adminNavGroups";
import { ABOUT_COMPANY_NAV_ITEMS } from "../constants/companyContentConfig";
import { hasAdminGrant, hasAnyAdminGrant } from "../utils/adminAccess";
import { getFacilityUniversityHomePath, isFacilityUniversityOnlyPortal } from "../utils/facilityUniversityOnly";

export function usePortalNavItems(user) {
  const role = user?.role;
  return useMemo(() => {
    if (isFacilityUniversityOnlyPortal(user)) {
      const home = getFacilityUniversityHomePath(user);
      return {
        mainItems: [
          { to: home, icon: IconBuilding, label: "AGC University", end: false },
          { to: "/it-tickets", icon: IconTicket, label: "IT Ticket" },
        ],
        adminItems: [],
        adminGroups: [],
        aboutCompanyItems: [],
        homeTo: home,
      };
    }

    const hasScopedGrants = Array.isArray(user?.admin_grants) && user.admin_grants.length > 0;
    const showAdministrationNav = role === "Admin" || hasScopedGrants;

    const main = [];
    main.push({
      to: "/",
      end: true,
      icon: IconHome,
      label: "Home",
    });

    main.push({
      to: "/team",
      icon: IconTeam,
      label: "Team",
    });

    main.push(
      {
        to: "/facilities",
        icon: IconBuilding,
        label: "AGC University",
      },
      {
        to: "/reports",
        icon: IconChart,
        label: "Reports",
        desc: "",
      },
      {
        to: "/calendar",
        icon: IconCalendar,
        label: "Calendar",
      },
      {
        to: "/upcoming",
        icon: IconCalendar,
        label: "Upcoming",
      },
      {
        to: "/social-committee",
        icon: IconTeam,
        label: "Social Committee",
      },
      {
        to: "/it-tickets",
        icon: IconTicket,
        label: "IT Ticket",
      },
      {
        to: "/profile",
        icon: IconUser,
        label: "Profile",
      },
    );

    const admin = [];
    if (showAdministrationNav) {
      const candidates = [
        {
          to: "/admin/calendar",
          icon: IconCalendar,
          label: "Calendar",
          desc: "Add holidays / activities",
          grantKey: ADMIN_GRANT_KEYS.ENGAGEMENT_CALENDAR,
          group: "hr",
        },
        {
          to: "/admin/company-news",
          icon: IconUsers,
          label: "Company News",
          grantKeys: [
            ADMIN_GRANT_KEYS.EMPLOYEE_OF_MONTH,
            ADMIN_GRANT_KEYS.LEADERSHIP_UPDATES,
            ADMIN_GRANT_KEYS.CUSTOMER_WINS,
            ADMIN_GRANT_KEYS.COMMUNITY_INVOLVEMENT,
          ],
          group: "hr",
        },
        {
          to: "/admin/new-hires",
          icon: IconUsers,
          label: "New hires",
          grantKey: ADMIN_GRANT_KEYS.NEW_HIRES,
          group: "hr",
        },
        {
          to: "/admin/about-company",
          icon: IconBuilding,
          label: "About Company",
          grantKey: ADMIN_GRANT_KEYS.COMPANY_CONTENT,
          group: "hr",
        },
        {
          to: "/admin/polls",
          icon: IconCog,
          label: "Feedback & polls",
          desc: "Popup surveys",
          end: true,
          grantKey: ADMIN_GRANT_KEYS.FEEDBACK_POLLS,
          group: "hr",
        },
        {
          to: "/admin/hr-newsfeed",
          icon: IconUsers,
          label: "HR News Feed",
          desc: "Announcements with image",
          grantKey: ADMIN_GRANT_KEYS.HR_NEWSFEED,
          group: "hr",
        },
        {
          to: "/admin/upcoming",
          icon: IconCalendar,
          label: "Manage upcoming",
          grantKey: ADMIN_GRANT_KEYS.UPCOMING_EVENTS,
          group: "social",
        },
        {
          to: "/admin/social-committee",
          icon: IconTeam,
          label: "Social Committee",
          desc: "Winners & past events",
          grantKey: ADMIN_GRANT_KEYS.SOCIAL_COMMITTEE,
          group: "social",
        },
        {
          to: "/users",
          icon: IconUsers,
          label: "Users",
          grantKey: ADMIN_GRANT_KEYS.USERS,
          group: "it",
        },
        {
          to: "/admin/reports",
          icon: IconChart,
          label: "Manage reports",
          desc: "Add Power BI embeds",
          end: true,
          grantKey: ADMIN_GRANT_KEYS.REPORTS,
          group: "it",
        },
        {
          to: "/admin/system",
          icon: IconCog,
          label: "System status",
          desc: "Health & metrics",
          end: true,
          grantKey: ADMIN_GRANT_KEYS.SYSTEM,
          group: "it",
        },
        {
          to: "/admin",
          icon: IconCog,
          label: "Learning admin",
          end: true,
          grantKey: ADMIN_GRANT_KEYS.LEARNING_ADMIN,
          group: "uofagc",
        },
      ];
      for (const item of candidates) {
        const allowed = item.grantKeys ? hasAnyAdminGrant(user, item.grantKeys) : hasAdminGrant(user, item.grantKey);
        if (allowed) {
          const { grantKey: _k, grantKeys: _ks, ...nav } = item;
          admin.push(nav);
        }
      }
    }

    const aboutCompanyItems = ABOUT_COMPANY_NAV_ITEMS.map((item) => ({ ...item }));

    const homeTo = "/";

    return {
      mainItems: main,
      aboutCompanyItems,
      adminItems: admin,
      adminGroups: buildAdminNavGroups(admin),
      homeTo,
    };
  }, [role, user]);
}
