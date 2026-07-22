import { redirect } from "next/navigation";

/** Back-office entry — marketing site lives on @weld/www (serviceweld.com). */
export default function HomePage() {
  redirect("/clients");
}
