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
      });
    } else {
      main.push({
        to: "/",
        end: true,
        icon: IconHome,
        label: "Home",
      });
    }

    if (isManager) {
      main.push({
        to: "/manager",
        icon: IconTeam,
        label: "Manager hub",
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
        to: "/employee-engagement-calendar",
        icon: IconCalendar,
        label: "Engagement calendar",
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
    if (isAdmin) {
      admin.push(
        {
          to: "/upcoming",
          icon: IconCalendar,
          label: "Upcoming events",
        },
        {
          to: "/users",
          icon: IconUsers,
          label: "Users",
        },
        {
          to: "/admin",
          icon: IconCog,
          label: "Learning admin",
          end: true,
        },
        {
          to: "/admin/reports",
          icon: IconChart,
          label: "Manage reports",
          desc: "Add Power BI embeds",
          end: true,
        },
        {
          to: "/admin/system",
          icon: IconCog,
          label: "System status",
          desc: "Health & metrics",
          end: true,
        },
      );
    }

    const homeTo = "/";

    return { mainItems: main, adminItems: admin, homeTo };
  }, [role]);
}
