import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.pledge_id) {
      return NextResponse.json({ error: "Invalid request. Missing pledge_id." }, { status: 400 });
    }

    const { pledge_id } = body;

    const { data: pledge, error: fetchErr } = await supabase
      .from("pledges")
      .select("*, requests(*)")
      .eq("id", pledge_id)
      .single();

    if (fetchErr || !pledge || !pledge.requests) {
      return NextResponse.json({ error: "Pledge or associated request not found" }, { status: 404 });
    }

    if (pledge.requests.requester_id !== user.id) {
      return NextResponse.json(
        { error: "Forbidden. Only the request owner can verify receipt." },
        { status: 403 }
      );
    }

    if (pledge.status === "Verified") {
      return NextResponse.json(
        { error: "This pledge has already been verified and recorded." },
        { status: 400 }
      );
    }

    const todayIso = new Date().toISOString();
    const todayDate = todayIso.split("T")[0];

    const { error: pledgeUpdateErr } = await supabase
      .from("pledges")
      .update({ status: "Verified", verified_at: todayIso })
      .eq("id", pledge_id);

    if (pledgeUpdateErr) {
      return NextResponse.json({ error: "Failed to update pledge status." }, { status: 500 });
    }

    const pledgedUnits = pledge.units_pledged || 1;
    const remainingUnits = Math.max(0, pledge.requests.units_needed - pledgedUnits);

    await supabase
      .from("requests")
      .update({
        units_needed: remainingUnits,
        status: remainingUnits === 0 ? "Fulfilled" : "Active",
      })
      .eq("id", pledge.request_id);

    const { error: historyErr } = await supabase.from("donation_history").insert({
      donor_id: pledge.donor_id,
      request_id: pledge.request_id,
      item_name: pledge.requests.item_name,
      units_donated: pledgedUnits,
      hospital_location: pledge.requests.hospital_location,
      verified_by: user.id,
      verified_at: todayIso,
    });

    if (historyErr) {
      console.error("Failed to insert donation history:", historyErr);
    }

    if (pledge.requests.item_type === "blood") {
      await supabase
        .from("profiles")
        .update({ last_donation_date: todayDate })
        .eq("id", pledge.donor_id);
    }

    return NextResponse.json(
      { success: true, message: "Pledge verified successfully." },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}