"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isWorkspaceNavItemActive } from "./workspace-nav-state";

const NAV_ITEMS = [
  { href: "/workspace", label: "Feed" },
  { href: "/workspace/graph", label: "Graph" },
  { href: "/workspace/digests", label: "Digests" },
  { href: "/workspace/settings", label: "Settings" },
] as const;

const BASE_LINK_CLASS =
  "rounded px-3 py-1.5 text-sm font-medium transition";
const ACTIVE_LINK_CLASS =
  "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200";
const INACTIVE_LINK_CLASS =
  "text-slate-700 hover:bg-white hover:text-slate-950";

function linkClassName(isActive: boolean): string {
  return [
    BASE_LINK_CLASS,
    isActive ? ACTIVE_LINK_CLASS : INACTIVE_LINK_CLASS,
  ].join(" ");
}

export function WorkspaceNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Workspace sections"
      className="flex rounded-md border border-slate-200 bg-slate-50 p-1"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = isWorkspaceNavItemActive(pathname, item.href);

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={linkClassName(isActive)}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
