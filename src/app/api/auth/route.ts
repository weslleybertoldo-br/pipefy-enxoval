import { NextRequest, NextResponse } from "next/server";

const VALID_EMAIL = process.env.AUTH_EMAIL || "weslley.bertoldo@seazone.com.br";
const VALID_PASSWORD = process.env.AUTH_PASSWORD || "Bt8751bt";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (email === VALID_EMAIL && password === VALID_PASSWORD) {
      const token = Buffer.from(`${email}:${Date.now()}`).toString("base64");
      const response = NextResponse.json({ success: true });
      response.cookies.set("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24, // 24h
        path: "/",
      });
      return response;
    }

    return NextResponse.json({ success: false, error: "Email ou senha incorretos" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("auth_token");
  return response;
}

// Verificar se está autenticado
export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true });
}
