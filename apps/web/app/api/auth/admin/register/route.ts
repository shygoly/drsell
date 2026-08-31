import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const api = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
  const body = await req.text();
  const res = await fetch(`${api}/api/auth/admin/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
