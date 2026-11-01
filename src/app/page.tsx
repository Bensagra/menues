import Link from "next/link";
import { Camera, ListChecks, QrCode, Send } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";

const STEPS = [
  { icon: Camera, title: "Subí una foto de tu carta", text: "Sacala con el celular o arrastrá las páginas. También podés cargarla a mano." },
  { icon: ListChecks, title: "Revisá los cambios", text: "Te mostramos precios nuevos, productos nuevos y lo que conviene revisar. Nada se publica solo." },
  { icon: Send, title: "Publicá", text: "Tus clientes ven la versión nueva al instante. La anterior queda en el historial." },
  { icon: QrCode, title: "Compartí el QR", text: "El código no cambia aunque actualices precios: imprimilo una vez y listo." },
];

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
        <Logo />
        <nav aria-label="Cuenta" className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/ingresar">Ingresar</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/registrarse">Crear cuenta</Link>
          </Button>
        </nav>
      </header>

      <main id="contenido">
        <section className="mx-auto grid max-w-6xl gap-10 px-4 pt-10 pb-16 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:pt-16">
          <div>
            <p className="text-sm font-semibold tracking-wide text-terracota uppercase">Menús digitales para restaurantes</p>
            <h1 className="mt-3 font-display text-[42px] leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
              Tu carta actualizada, en minutos
            </h1>
            <p className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
              Subí una foto de tu carta, revisá lo que cambió y publicá. Tus clientes la consultan desde el QR de la mesa, sin
              descargar nada.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/registrarse">Creá tu carta gratis</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/ingresar">Ya tengo cuenta</Link>
              </Button>
            </div>
          </div>

          <figure aria-label="Ejemplo de cómo se ve una carta publicada" className="mx-auto w-full max-w-sm">
            <div className="rounded-[22px] border border-border bg-card p-3 shadow-lg">
              <div className="rounded-xl bg-background p-5">
                <p className="font-display text-2xl font-semibold">La Esquina</p>
                <p className="text-sm text-muted-foreground">Palermo · Abierto hasta las 00:30</p>
                <div className="mt-5 space-y-4">
                  <p className="text-xs font-bold tracking-wider text-terracota uppercase">Pizzas</p>
                  {[
                    ["Muzzarella", "Chica $ 11.500 · Grande $ 16.900"],
                    ["Napolitana", "Chica $ 12.900 · Grande $ 18.500"],
                    ["Fugazzeta rellena", "$ 21.000"],
                  ].map(([name, price]) => (
                    <div key={name} className="border-b border-dashed border-border pb-3 last:border-0">
                      <p className="font-semibold">{name}</p>
                      <p className="price text-sm text-muted-foreground">{price}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <figcaption className="mt-3 text-center text-xs text-muted-foreground">Así ven tu carta tus clientes (ejemplo).</figcaption>
          </figure>
        </section>

        <section aria-labelledby="como-funciona" className="border-t border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-8">
            <h2 id="como-funciona" className="font-display text-3xl font-semibold tracking-tight">
              Cómo funciona
            </h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ icon: Icon, title, text }, index) => (
                <li key={title} className="rounded-xl border border-border bg-background p-5">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-muted-foreground">Paso {index + 1}</p>
                  <h3 className="mt-1 font-bold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground sm:px-8">
        CartaLista · Menús digitales para restaurantes
      </footer>
    </div>
  );
}
