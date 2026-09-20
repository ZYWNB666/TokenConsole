import {
  BarChart3Icon,
  BoxesIcon,
  Building2Icon,
  CreditCardIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  ScrollTextIcon,
  SettingsIcon,
  SquareTerminalIcon,
  type LucideIcon,
} from "lucide-react";

export type ConsoleRoute = {
  /** Absolute route path, e.g. "/api-keys". */
  href: string;
  /** Route slug used by the dynamic [section] route, e.g. "api-keys". */
  section: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export type ConsoleNavGroup = {
  /** null renders the group without a label (top-level entries). */
  label: string | null;
  routes: ConsoleRoute[];
};

export const consoleNav: ConsoleNavGroup[] = [
  {
    label: null,
    routes: [
      {
        href: "/overview",
        section: "overview",
        title: "Overview",
        description: "Monitor API usage, spend, and reliability across your workspace.",
        icon: LayoutDashboardIcon,
      },
    ],
  },
  {
    label: "API",
    routes: [
      {
        href: "/api-keys",
        section: "api-keys",
        title: "API Keys",
        description: "Create and manage project-scoped API keys.",
        icon: KeyRoundIcon,
      },
      {
        href: "/playground",
        section: "playground",
        title: "Playground",
        description: "Send test requests against your keys and inspect responses.",
        icon: SquareTerminalIcon,
      },
      {
        href: "/models",
        section: "models",
        title: "Models",
        description: "Browse the model catalogue with context windows and pricing.",
        icon: BoxesIcon,
      },
      {
        href: "/requests",
        section: "requests",
        title: "Request Logs",
        description: "Search and inspect individual API requests.",
        icon: ScrollTextIcon,
      },
    ],
  },
  {
    label: "Observability",
    routes: [
      {
        href: "/usage",
        section: "usage",
        title: "Usage",
        description: "Analyze usage by time, model, project and key.",
        icon: BarChart3Icon,
      },
    ],
  },
  {
    label: "Billing",
    routes: [
      {
        href: "/billing",
        section: "billing",
        title: "Billing Overview",
        description: "Track spend, invoices and payment transactions.",
        icon: CreditCardIcon,
      },
    ],
  },
  {
    label: "Organization",
    routes: [
      {
        href: "/organization",
        section: "organization",
        title: "Organization",
        description: "Manage members, projects and access control.",
        icon: Building2Icon,
      },
      {
        href: "/settings",
        section: "settings",
        title: "Settings",
        description: "Workspace and organization settings.",
        icon: SettingsIcon,
      },
    ],
  },
];

export const consoleRoutes: ConsoleRoute[] = consoleNav.flatMap(
  (group) => group.routes,
);

export function findConsoleRoute(section: string): ConsoleRoute | undefined {
  return consoleRoutes.find((route) => route.section === section);
}
