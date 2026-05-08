import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { manager, dealer, conversations } from "@/lib/mock";
import SignOutButton from "./SignOutButton";

const NAV = [
  { href: "/dashboard", label: "Dashboard", ic: "◆" },
  { href: "/heat-sheet", label: "Heat Sheet", ic: "◉" },
  { href: "/game-plans/new", label: "Game Plan", ic: "+" },
  { href: "/lens", label: "Rex Lens", ic: "◎" },
  { href: "/coach", label: "Rex Coach", ic: "★" },
  { href: "/audit", label: "Audit Vault", ic: "⊞" },
  { href: "/rep", label: "Rep Mobile", ic: "☐" },
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in");

  const awaitingApproval = conversations.filter((c) => c.status === "awaiting_approval").length;

  return (
    <div className="route app app-shell">
      <aside className="app-side">
        <div className="brand">
          <div className="mark">REX</div>
          <div className="sub">Open · v0.1</div>
        </div>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="app-nav-item">
            <span className="ic">{item.ic}</span>
            {item.label}
            {item.label === "Heat Sheet" && awaitingApproval > 0 && (
              <span className="badge">{awaitingApproval}</span>
            )}
          </Link>
        ))}
        <div className="spacer" />
        <SignOutButton />
        <div className="app-user">
          <div className="av">{manager.avatar_initials}</div>
          <div>
            <div className="nm">{data.user.email ?? manager.name}</div>
            <div className="rl">
              {manager.role} · {dealer.name}
            </div>
          </div>
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
