import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoginScreen } from "@/features/auth/login-screen";
import { getServerSession } from "@/server/auth/server-session";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  // A visitor with a valid session has no business on the sign-in page.
  if (await getServerSession()) {
    redirect("/overview");
  }

  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
