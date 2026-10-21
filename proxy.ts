import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Access control.
// - Locally (npm run dev on your computer) nothing is locked.
// - On a server (Vercel) the whole site asks for SITE_PASSWORD, if it is set.
// - On a server the admin parts (Lab, Settings) need ADMIN_PASSWORD. Without it they are closed.
// Passwords are set in Vercel → Project → Settings → Environment Variables.

const ADMIN_PATHS = ["/pipeline", "/review", "/rules", "/settings", "/api/settings", "/api/models", "/api/pipeline", "/api/rules", "/partner", "/api/partner", "/api/sanctions"];
// Called by Vercel Cron; the route checks CRON_SECRET itself.
const OPEN_PATHS = ["/api/sanctions/cron"];
const isServer = () => !!process.env.VERCEL || process.env.DEPLOYED === "1";

function askPassword(realm: string) {
  return new NextResponse("Нужен пароль", { status: 401, headers: { "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"` } });
}

function passwordFrom(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(h.slice(6));
    return decoded.slice(decoded.indexOf(":") + 1);
  } catch { return null; }
}

export function proxy(req: NextRequest) {
  if (!isServer()) return NextResponse.next();
  const path = req.nextUrl.pathname;
  if (OPEN_PATHS.includes(path)) return NextResponse.next();
  const given = passwordFrom(req);
  const site = process.env.SITE_PASSWORD;
  const admin = process.env.ADMIN_PASSWORD;
  const isAdmin = ADMIN_PATHS.some(p => path === p || path.startsWith(p + "/"));

  if (isAdmin) {
    if (!admin) return new NextResponse("Раздел закрыт на сервере. Задайте ADMIN_PASSWORD в настройках Vercel.", { status: 403 });
    if (given !== admin) return askPassword("admin");
    return NextResponse.next();
  }
  // The admin password also opens the public part.
  if (site && given !== site && given !== admin) return askPassword("site");
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
