import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (process.env.MAINTENANCE_MODE === '1') {
    if (!request.nextUrl.pathname.startsWith('/maintenance')) {
      return NextResponse.redirect(new URL('/maintenance', request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon|icon).*)'],
};
