import type { Metadata } from "next";

import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Request access",
};

export default function RegisterPage() {
  return <RegisterForm />;
}
