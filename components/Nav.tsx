"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Разбор запроса" },
  { href: "/lab", label: "Тест-лаборатория" },
  { href: "/settings", label: "Настройки и API-ключи" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <div className="topbar">
      <div className="in">
        <Link href="/" className="brand">Bank Request Decoder</Link>
        <nav className="nav">
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} className={path === l.href ? "on" : ""}>{l.label}</Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
