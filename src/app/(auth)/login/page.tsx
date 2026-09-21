import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoginScreen } from "@/features/auth/login-screen";
import { getDictionary, getLocale } from "@/i18n/server";
import { getServerSession } from "@/server/auth/server-session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getLocale())["login.submit"] };
}

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
