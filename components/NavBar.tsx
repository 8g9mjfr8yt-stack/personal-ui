"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/today", label: "Today" },
  { href: "/tasks", label: "Tasks" },
  { href: "/projects", label: "Projects" },
  { href: "/inbox", label: "Inbox" },
  { href: "/inspiration", label: "Inspiration" },
  { href: "/notes", label: "Notes" },
  { href: "/voice", label: "Hlas" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <div className="flex gap-4 overflow-x-auto">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                pathname === link.href
                  ? "whitespace-nowrap font-medium text-neutral-900"
                  : "whitespace-nowrap text-neutral-500 hover:text-neutral-900"
              }
            >
              {link.label}
            </Link>
          ))}
        </div>
        <button
          onClick={handleLogout}
          className="whitespace-nowrap text-sm text-neutral-500 hover:text-neutral-900"
        >
          Odhlásiť sa
        </button>
      </div>
    </nav>
  );
}
