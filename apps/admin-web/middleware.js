import { NextResponse } from "next/server";

/** 边缘兜底：根路径 → 生态总览（与 app/page、next.config redirects 一致） */
export function middleware(request) {
  if (request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/ecosystem", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/"
};
