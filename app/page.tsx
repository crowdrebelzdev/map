import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/get-session";

export default async function Home() {
  const session = await getServerSession();

  if (!session) {
    redirect("/sign-in");
  }

  redirect(session.user.role === "admin" ? "/admin/events" : "/events");
}
