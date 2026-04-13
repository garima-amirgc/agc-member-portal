import { useMemo } from "react";
import {
  IconBuilding,
  IconCalendar,
  IconCog,
  IconHome,
  IconTeam,
  IconTicket,
  IconUser,
  IconUsers,
} from "../components/layout/SidebarIcons";

/**
 * Same main/admin nav items and home link target as the sidebar (role-aware).
 */
export function usePortalNavItems(role) {
  return useMemo(() => {
    const isAdmin = role === "Admin";
    const isManager = role === "Manager";

    const main = [];
    if (isAdmin) {
      main.push({
        to: "/dashboard",
        end: true,
        icon: IconHome,
        label: "Home",
        desc: "Quick links & overview",
      });
    } else {
      main.push({
        to: "/",
        end: true,
        icon: IconHome,
        label: "Home",
        desc: "Dashboard",
      });
    }

    if (isManager) {
      main.push({
        to: "/manager",
        icon: IconTeam,
        label: "Manager hub",
        desc: "Team, leave & calendar",
      });
    }

    main.push(
      {
        to: "/facilities",
        icon: IconBuilding,
        label: "Facilities",
        desc: "Facility pages & courses",
      },
      {
        to: "/it-tickets",
        icon: IconTicket,
        label: "IT Ticket",
        desc: "Report IT issues",
      },
      {
        to: "/profile",
        icon: IconUser,
        label: "Profile",
        desc: "Account & leave requests",
      },
    );

    const admin = [];
    if (isAdmin) {
      admin.push(
        {
          to: "/upcoming",
          icon: IconCalendar,
          label: "Upcoming events",
          desc: "Facility calendars",
        },
        {
          to: "/users",
          icon: IconUsers,
          label: "Users",
          desc: "Roles & access",
        },
        {
          to: "/admin",
          icon: IconCog,
          label: "Learning admin",
          desc: "Videos, documents & assignments",
        },
      );
    }

    const homeTo = isAdmin ? "/upcoming" : "/";

    return { mainItems: main, adminItems: admin, homeTo };
  }, [role]);
}
