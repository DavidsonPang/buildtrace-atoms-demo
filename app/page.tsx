import { BuilderWorkspace } from "@/src/components/builder-workspace";
import { AuthProvider } from "@/src/components/auth-provider";

export default function Home() {
  return (
    <AuthProvider>
      <BuilderWorkspace />
    </AuthProvider>
  );
}
