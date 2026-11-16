import { redirect } from "next/navigation";
import { adminGate } from "../../core/auth";
import { admin } from "../../runtime";
import { AdminShell } from "../AdminShell";
import { LoginForm } from "../LoginForm";
import { NotConfigured } from "../NotConfigured";

export async function Login() {
  const gate = await adminGate();
  if (gate.state === "unconfigured") return <NotConfigured missing={gate.missing} />;
  if (gate.state === "admin") redirect(admin());
  return (
    <AdminShell title="Log in">
      <LoginForm />
    </AdminShell>
  );
}
