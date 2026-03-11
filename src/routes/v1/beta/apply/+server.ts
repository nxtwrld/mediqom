import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getClient } from "$lib/supabase";
import { z } from "zod";
import SUPPORTED_LANGUAGES from "$lib/languages";

// Validation schema for beta application
const betaApplicationSchema = z.object({
  user_type: z.enum(["family", "provider", "developer", "organization"]),
  problem_description: z
    .string()
    .min(10, "Please provide more detail about your problem"),
  current_solution: z
    .string()
    .min(10, "Please provide more detail about your current solution"),
  data_volume: z.enum(["1-10", "11-50", "51-200", "200+"]),
  timeline: z.enum(["immediately", "week", "month", "exploring"]),
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  organization: z.string().optional(),
  country: z.enum(["CZ", "DE", "US"]),
  language: z.enum(Object.keys(SUPPORTED_LANGUAGES) as [string, ...string[]]),
  additional_info: z.string().optional(),
  beta_agreement: z.literal(true, {
    errorMap: () => ({ message: "You must agree to beta terms" }),
  }),
  feedback_agreement: z.literal(true, {
    errorMap: () => ({ message: "You must agree to provide feedback" }),
  }),
  confidentiality_agreement: z.literal(true, {
    errorMap: () => ({ message: "You must agree to confidentiality" }),
  }),
  terms_agreement: z.literal(true, {
    errorMap: () => ({ message: "You must agree to terms of service" }),
  }),
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    // Parse request body
    const body = await request.json();

    // Validate input
    const validationResult = betaApplicationSchema.safeParse(body);

    if (!validationResult.success) {
      return json(
        {
          success: false,
          error: "Validation failed",
          details: validationResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const data = validationResult.data;

    // Get Supabase client
    const supabase = getClient();

    // Check if email already exists
    const { data: existing, error: checkError } = await supabase
      .from("beta_applications")
      .select("id, status")
      .eq("email", data.email)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 means no rows found, which is what we want
      console.error("Error checking existing application:", checkError);
      return json(
        {
          success: false,
          error: "Failed to check existing applications",
        },
        { status: 500 },
      );
    }

    if (existing) {
      return json(
        {
          success: false,
          error: "An application with this email already exists",
          status: existing.status,
        },
        { status: 409 },
      );
    }

    // Insert new application
    const { data: application, error: insertError } = await supabase
      .from("beta_applications")
      .insert({
        user_type: data.user_type,
        problem_description: data.problem_description,
        current_solution: data.current_solution,
        data_volume: data.data_volume,
        timeline: data.timeline,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        organization: data.organization || null,
        country: data.country,
        language: data.language,
        additional_info: data.additional_info || null,
        beta_agreement: data.beta_agreement,
        feedback_agreement: data.feedback_agreement,
        confidentiality_agreement: data.confidentiality_agreement,
        terms_agreement: data.terms_agreement,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting beta application:", insertError);
      return json(
        {
          success: false,
          error: "Failed to submit application",
        },
        { status: 500 },
      );
    }

    // TODO: Send confirmation email
    // This could be done via Supabase Edge Functions or a separate email service

    return json({
      success: true,
      message: "Application submitted successfully",
      applicationId: application.id,
    });
  } catch (error) {
    console.error("Unexpected error in beta application:", error);
    return json(
      {
        success: false,
        error: "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
};

// Optional: Add GET endpoint for checking application status by email
export const GET: RequestHandler = async ({ url }) => {
  const email = url.searchParams.get("email");

  if (!email) {
    return json(
      {
        success: false,
        error: "Email parameter is required",
      },
      { status: 400 },
    );
  }

  const supabase = getClient();

  const { data, error } = await supabase
    .from("beta_applications")
    .select("status, created_at")
    .eq("email", email)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return json(
        {
          success: false,
          error: "No application found",
        },
        { status: 404 },
      );
    }

    console.error("Error checking application status:", error);
    return json(
      {
        success: false,
        error: "Failed to check application status",
      },
      { status: 500 },
    );
  }

  return json({
    success: true,
    status: data.status,
    created_at: data.created_at,
  });
};
