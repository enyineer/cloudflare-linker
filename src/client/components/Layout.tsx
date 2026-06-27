import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { can } from "../../shared/roles.ts";
import { useMe } from "../lib/me.tsx";
import { Badge } from "./Badge.tsx";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/links", label: "Links" },
  { href: "/domains", label: "Web addresses" },
  { href: "/campaigns", label: "Campaigns" },
];

function isActive(location: string, href: string): boolean {
  return href === "/" ? location === "/" : location.startsWith(href);
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const me = useMe();
  const items = can(me.role, "manageUsers") ? [...NAV, { href: "/team", label: "Team" }] : NAV;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__logo" aria-hidden="true" />
          Cloudflare Linker
        </div>
        <nav className="nav">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav__item ${isActive(location, item.href) ? "nav__item--active" : ""}`.trim()}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="user-chip">
          <Badge tone="accent">{me.role}</Badge>
          <span className="muted">{me.email}</span>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
