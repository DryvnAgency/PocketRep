import { NextRequest } from 'next/server';

export function requireBearer(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.DASHBOARD_AUTH_SECRET;
  if (!expected) {
    return { ok: false, status: 500, error: 'DASHBOARD_AUTH_SECRET not set' };
  }
  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'missing bearer' };
  }
  const token = header.slice('Bearer '.length).trim();
  if (token !== expected) {
    return { ok: false, status: 401, error: 'invalid bearer' };
  }
  return { ok: true };
}
