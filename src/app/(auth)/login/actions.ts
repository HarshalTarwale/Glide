"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth/auth";
import { isDatabaseConfigured } from "@/lib/db/client";

export interface AuthFormState {
  error?: string;
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  if (!isDatabaseConfigured()) {
    return { error: "No database configured. Add DATABASE_URL to .env and run the migrations." };
  }

  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/app",
    });
    return {};
  } catch (error) {
    // signIn throws a redirect on success; it must be allowed to propagate.
    if (error instanceof AuthError) {
      return { error: "Those credentials did not match an account." };
    }
    throw error;
  }
}
