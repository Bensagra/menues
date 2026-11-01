import { NotFoundState } from "@/components/app/states";

export default function NotFound() {
  return (
    <main id="contenido" className="min-h-dvh">
      <NotFoundState
        title="No encontramos esta página"
        description="Puede que el enlace esté mal escrito, que se haya eliminado o que no tengas acceso."
        href="/panel"
        cta="Ir a mi panel"
      />
    </main>
  );
}
