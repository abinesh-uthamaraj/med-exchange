import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pledge_id } = await request.json();

    // 1. Fetch pledge and parent request details
    const { data: pledge, error: fetchErr } = await supabase
      .from("pledges")
      .select("*, requests(*)")
      .eq("id", pledge_id)
      .single();

    if (fetchErr || !pledge) {
      return NextResponse.json({ error: "Pledge not found" }, { status: 404 });
    }

    if (pledge.requests.requester_id !== user.id) {
      return NextResponse.json({ error: "Only the requester can verify blood receipt." }, { status: 403 });
    }

    const today = new Date().toISOString();

    // 2. Mark pledge as Verified
    await supabase
      .from("pledges")
      .update({ status: "Verified", verified_at: today })
      .eq("id", pledge_id);

    // 3. Decrement units on request
    const remainingUnits = Math.max(0, pledge.requests.units_needed - pledge.units_pledged);
    await supabase
      .from("requests")
      .update({
        units_needed: remainingUnits,
        status: remainingUnits === 0 ? "Fulfilled" : "Active"
      })
      .eq("id", pledge.request_id);

    // 4. Save into donation_history log
    await supabase.from("donation_history").insert({
      donor_id: pledge.donor_id,
      request_id: pledge.request_id,
      item_name: pledge.requests.item_name,
      units_donated: pledge.units_pledged,
      hospital_location: pledge.requests.hospital_location,
      verified_by: user.id,
      verified_at: today
    });

    // 5. Update donor's last_donation_date to today
    await supabase
      .from("profiles")
      .update({ last_donation_date: today.split("T")[0] })
      .eq("id", pledge.donor_id);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}