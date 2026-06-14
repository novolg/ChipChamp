export const config = { runtime: 'edge' };

// Verifies the shared password and, on success, sets the auth cookie that
// middleware.ts checks. Password and cookie token live in env vars only —
// neither is ever shipped to the browser bundle.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const form = await request.formData();
  const password = form.get('password');
  const expected = process.env.SITE_PASSWORD;
  const token = process.env.AUTH_TOKEN;

  if (!expected || !token) {
    return new Response('Server not configured', { status: 500 });
  }

  if (typeof password === 'string' && password === expected) {
    return new Response(null, {
      status: 303,
      headers: {
        'Set-Cookie': `cc_auth=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
        Location: '/',
      },
    });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/login.html?error=1' },
  });
}
