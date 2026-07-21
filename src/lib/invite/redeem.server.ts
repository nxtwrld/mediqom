/**
 * Shared invite-redemption logic: atomically claims an invite code, then
 * invites the redeeming email via Supabase's admin invite API. Used by both
 * the self-service redeem endpoint and the admin "send invite directly" endpoint.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type RedeemResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

export async function redeemInviteCode(
  supabase: SupabaseClient,
  code: string,
  email: string,
  origin: string,
): Promise<RedeemResult> {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: claim, error: claimError } = await supabase.rpc(
    "claim_invite_code",
    { p_code: code, p_email: normalizedEmail },
  );

  if (claimError) {
    console.error("[Invite] claim_invite_code error:", claimError);
    return { ok: false, status: 500, message: "Internal server error" };
  }

  if (!claim?.success) {
    if (claim?.reason === "already_claimed") {
      return {
        ok: false,
        status: 409,
        message: "Sorry, this code was already claimed.",
      };
    }
    return { ok: false, status: 404, message: "Invalid invite code." };
  }

  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/med")}`;
  const { data: inviteData, error: inviteError } =
    await supabase.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo,
    });

  if (inviteError || !inviteData?.user) {
    // Release the code — don't burn a scarce invite on an email-provider
    // hiccup or an "already registered" mistake.
    await supabase
      .from("invite_codes")
      .update({ status: "available", claimed_email: null, claimed_at: null })
      .eq("code", code);

    const alreadyRegistered = inviteError?.message
      ?.toLowerCase()
      .includes("already registered");

    return {
      ok: false,
      status: 409,
      message: alreadyRegistered
        ? "You already have an account — please sign in above."
        : inviteError?.message || "Could not send invite email.",
    };
  }

  await supabase
    .from("invite_codes")
    .update({ claimed_by: inviteData.user.id })
    .eq("code", code);

  return { ok: true };
}
