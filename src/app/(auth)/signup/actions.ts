"use server";

import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth/auth";
import { isDatabaseConfigured } from "@/lib/db/client";
import { signup, signupSchema } from "@/server/core/signup";

export interface SignupFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function signupAction(
  _prev: SignupFormState,
  formData: FormData
): Promise<SignupFormState> {
  if (!isDatabaseConfigured()) {
    return { error: "No database configured. Add DATABASE_URL to .env and run the migrations." };
  }

  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    organisation: formData.get("organisation"),
    country: formData.get("country"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const result = await signup(parsed.data);
  if (!result.ok) return { error: result.error };

  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  });

  redirect("/app");
}
