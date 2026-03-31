import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

const VALID_EMAIL = process.env.AUTH_EMAIL || "";
const VALID_PASSWORD = process.env.AUTH_PASSWORD || "";
const TOKEN_SECRET = process.env.TOKEN_SECRET || "";

function signToken(email: string): string {
  const payload = `${email}:${Date.now()}`;
  const signature = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${signature}`).toString("base64");
}

function verifyToken(token: string): boolean {
  try {
    if (!TOKEN_SECRET) return false;
    const decoded = Buffer.from(token, "base64").toString();
    const parts = decoded.split(":");
    if (parts.length < 3) return false;
    const signature = parts.pop()!;
    const payload = parts.join(":");
    const expected = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
    if (signature !== expected) return false;
    // Verificar expiração (24h)
    const timestamp = parseInt(parts[1]);
    if (isNaN(timestamp) || Date.now() - timestamp > 24 * 60 * 60 * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!VALID_EMAIL || !VALID_PASSWORD || !TOKEN_SECRET) {
    return NextResponse.json({ error: "Autenticação não configurada" }, { status: 500 });
  }
  try {
    const { email, password } = await req.json();

    if (email === VALID_EMAIL && password === VALID_PASSWORD) {
      const token = signToken(email);
      const response = NextResponse.json({ success: true });
      response.cookies.set("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24,
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

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true });
}
