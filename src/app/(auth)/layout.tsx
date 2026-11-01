import Link from "next/link";
import { Logo } from "@/components/app/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-4 sm:px-8">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-md" aria-label="CartaLista, inicio">
          <Logo />
        </Link>
      </header>
      <main id="contenido" className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
