import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = createServiceSupabase();
  const inviteCode = process.env.INVITE_CODE;
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();

  if (!supabase || !inviteCode) {
    return NextResponse.json({ error: "Serverul nu este configurat." }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Lipseste sesiunea." }, { status: 401 });

  const body = await request.json();
  if (body.inviteCode !== inviteCode) {
    return NextResponse.json({ error: "Codul de invitatie este invalid." }, { status: 403 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sesiune invalida." }, { status: 401 });
  }

  const email = userData.user.email ?? "";
  const displayName = String(body.displayName || email.split("@")[0] || "Jucator").slice(0, 40);

  const { error } = await supabase.from("profiles").upsert({
    id: userData.user.id,
    email,
    display_name: displayName,
    is_admin: email.toLowerCase() === adminEmail
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
