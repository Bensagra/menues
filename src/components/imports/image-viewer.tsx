"use client";

import { useState } from "react";
import { cn } from "cn";
import { Minus, Plus, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";

const ZOOMS = [1, 1.5, 2, 3];

export function ImageViewer({
  images,
  page,
  onPageChange,
}: {
  images: { id: string; page_number: number; url: string | null; rotation: number }[];
  page: number;
  onPageChange: (page: number) => void;
}) {
  const [zoomIndex, setZoomIndex] = useState(0);
  const current = images.find((i) => i.page_number === page) ?? images[0];
  const zoom = ZOOMS[zoomIndex];
  const sideways = current && (current.rotation === 90 || current.rotation === 270);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        {images.length > 1 ? (
          <div role="tablist" aria-label="Páginas" className="flex flex-wrap gap-1">
            {images.map((image) => (
              <button
                key={image.id}
                role="tab"
                type="button"
                aria-selected={image.page_number === current?.page_number}
                onClick={() => onPageChange(image.page_number)}
                className={cn(
                  "min-h-11 rounded-lg px-3 text-sm font-semibold",
                  image.page_number === current?.page_number ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-[#efece4]",
                )}
              >
                Página {image.page_number}
              </button>
            ))}
          </div>
        ) : (
          <p className="px-1 text-sm font-semibold">Foto de la carta</p>
        )}
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setZoomIndex((z) => Math.max(0, z - 1))} disabled={zoomIndex === 0} aria-label="Alejar">
            <Minus aria-hidden="true" />
          </Button>
          <span className="w-12 text-center text-sm tabular-nums" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setZoomIndex((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoomIndex === ZOOMS.length - 1} aria-label="Acercar">
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="relative min-h-80 flex-1 overflow-auto bg-[#ebe8df]" tabIndex={0} aria-label="Foto ampliable; usá las flechas o el desplazamiento para recorrerla">
        {current?.url ? (
          <div style={{ width: `${zoom * 100}%` }} className="mx-auto p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.url}
              alt={`Página ${current.page_number} de la carta`}
              className={cn("mx-auto block h-auto w-full rounded-md shadow-sm", sideways && "my-[12%]")}
              style={{ transform: `rotate(${current.rotation}deg)` }}
            />
          </div>
        ) : (
          <div className="flex h-full min-h-80 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <ScanSearch className="size-7" aria-hidden="true" />
            No pudimos mostrar la foto. Recargá la página para generar un enlace nuevo.
          </div>
        )}
      </div>
    </div>
  );
}
