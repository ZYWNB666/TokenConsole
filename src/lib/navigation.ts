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

import type { DictionaryKey } from "@/i18n/dictionaries/en";

export type ConsoleRoute = {
  /** Absolute route path, e.g. "/api-keys". */
  href: string;
  /** Route slug used by the dynamic [section] route, e.g. "api-keys". */
  section: string;
  /** Dictionary key for the link/page title. */
  titleKey: DictionaryKey;
  /** Dictionary key for the page description. */
  descriptionKey: DictionaryKey;
  icon: LucideIcon;
};

export type ConsoleNavGroup = {
  /** null renders the group without a label (top-level entries). */
  labelKey: DictionaryKey | null;
  routes: ConsoleRoute[];
};

export const consoleNav: ConsoleNavGroup[] = [
  {
    labelKey: null,
    routes: [
      {
        href: "/overview",
        section: "overview",
        titleKey: "nav.overview.title",
        descriptionKey: "nav.overview.description",
        icon: LayoutDashboardIcon,
      },
    ],
  },
  {
    labelKey: "nav.group.api",
    routes: [
      {
        href: "/api-keys",
        section: "api-keys",
        titleKey: "nav.apiKeys.title",
        descriptionKey: "nav.apiKeys.description",
        icon: KeyRoundIcon,
      },
      {
        href: "/playground",
        section: "playground",
        titleKey: "nav.playground.title",
        descriptionKey: "nav.playground.description",
        icon: SquareTerminalIcon,
      },
      {
        href: "/models",
        section: "models",
        titleKey: "nav.models.title",
        descriptionKey: "nav.models.description",
        icon: BoxesIcon,
      },
      {
        href: "/requests",
        section: "requests",
        titleKey: "nav.requests.title",
        descriptionKey: "nav.requests.description",
        icon: ScrollTextIcon,
      },
    ],
  },
  {
    labelKey: "nav.group.observability",
    routes: [
      {
        href: "/usage",
        section: "usage",
        titleKey: "nav.usage.title",
        descriptionKey: "nav.usage.description",
        icon: BarChart3Icon,
      },
    ],
  },
  {
    labelKey: "nav.group.billing",
    routes: [
      {
        href: "/billing",
        section: "billing",
        titleKey: "nav.billing.title",
        descriptionKey: "nav.billing.description",
        icon: CreditCardIcon,
      },
    ],
  },
  {
    labelKey: "nav.group.organization",
    routes: [
      {
        href: "/organization",
        section: "organization",
        titleKey: "nav.organization.title",
        descriptionKey: "nav.organization.description",
        icon: Building2Icon,
      },
      {
        href: "/settings",
        section: "settings",
        titleKey: "nav.settings.title",
        descriptionKey: "nav.settings.description",
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
