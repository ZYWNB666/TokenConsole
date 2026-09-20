import { redirect } from "next/navigation";

/**
 * The console opens on the Overview dashboard.
 */
export default function RootPage(): never {
  redirect("/overview");
}
