import { next, rewrite } from '@vercel/edge';

// Runs at the edge in front of every request except the login page,
// the login API, and the standalone login assets.
export const config = {
  matcher: ['/((?!api/login|login\\.html|favicon|robots\\.txt).*)'],
};

const COOKIE = 'cc_auth';

export default function middleware(request: Request) {
  const token = process.env.AUTH_TOKEN;
  const cookie = request.headers.get('cookie') ?? '';
  const authed =
    !!token &&
    cookie.split(';').some((c) => c.trim() === `${COOKIE}=${token}`);

  if (authed) return next();

  const url = new URL(request.url);
  return rewrite(new URL('/login.html', url));
}
