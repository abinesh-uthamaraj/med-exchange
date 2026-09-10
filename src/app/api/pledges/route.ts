import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("pledges")
      .select("*, profiles:donor_id(full_name, phone_number)")
      .eq("status", "Pledged");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { request_id, eta_minutes, last_donation_date, donor_phone } = await request.json();

    if (!request_id || !eta_minutes || Number(eta_minutes) < 1) {
      return NextResponse.json({ error: "Please provide a valid estimated arrival time." }, { status: 400 });
    }

    // 90-day medical interval check
    if (last_donation_date) {
      const lastDate = new Date(last_donation_date);
      const diffDays = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 90) {
        return NextResponse.json({
          error: `Medical guidelines require a 90-day gap between donations. You must wait ${90 - diffDays} more day(s).`
        }, { status: 400 });
      }
    }

    // Insert the pledge with ETA and phone
    const { data, error } = await supabase.from("pledges").insert({
      request_id,
      donor_id: user.id,
      units_pledged: 1,
      eta_minutes: Number(eta_minutes),
      donor_phone: donor_phone?.trim() || null,
      status: "Pledged"
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}