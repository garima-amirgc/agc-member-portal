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
import { hasAdminGrant } from "../utils/adminAccess";
import { getFacilityUniversityHomePath, isFacilityUniversityOnlyPortal } from "../utils/facilityUniversityOnly";
import { isSupervisor } from "../utils/supervisorAccess";

/**
 * Same main/admin nav items and home link target as the sidebar (role-aware).
 * Pass the full `user` object so scoped admins only see administration areas they were granted.
 */
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
        homeTo: home,
      };
    }

    const hasScopedGrants = Array.isArray(user?.admin_grants) && user.admin_grants.length > 0;
    const showAdministrationNav = role === "Admin" || hasScopedGrants;

    const main = [];
    /** Same home route for every role so `/` and upcoming feed behavior stay aligned (DashboardPage). */
    main.push({
      to: "/",
      end: true,
      icon: IconHome,
      label: "Home",
    });

    if (isSupervisor(user)) {
      main.push({
        to: "/manager",
        icon: IconTeam,
        label: "My team",
      });
    }

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
        desc: "Power BI dashboards",
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
        },
        {
          to: "/admin/upcoming",
          icon: IconCalendar,
          label: "Manage upcoming",
          grantKey: ADMIN_GRANT_KEYS.UPCOMING,
        },
        {
          to: "/users",
          icon: IconUsers,
          label: "Users",
          grantKey: ADMIN_GRANT_KEYS.USERS,
        },
        {
          to: "/admin",
          icon: IconCog,
          label: "Learning admin",
          end: true,
          grantKey: ADMIN_GRANT_KEYS.LEARNING_ADMIN,
        },
        {
          to: "/admin/reports",
          icon: IconChart,
          label: "Manage reports",
          desc: "Add Power BI embeds",
          end: true,
          grantKey: ADMIN_GRANT_KEYS.REPORTS,
        },
        {
          to: "/admin/system",
          icon: IconCog,
          label: "System status",
          desc: "Health & metrics",
          end: true,
          grantKey: ADMIN_GRANT_KEYS.SYSTEM,
        },
        {
          to: "/admin/polls",
          icon: IconCog,
          label: "Feedback & polls",
          desc: "Popup surveys",
          end: true,
          grantKey: ADMIN_GRANT_KEYS.FEEDBACK_POLLS,
        },
      ];
      for (const item of candidates) {
        if (hasAdminGrant(user, item.grantKey)) {
          const { grantKey: _k, ...nav } = item;
          admin.push(nav);
        }
      }
    }

    const homeTo = "/";

    return { mainItems: main, adminItems: admin, homeTo };
  }, [role, user]);
}
