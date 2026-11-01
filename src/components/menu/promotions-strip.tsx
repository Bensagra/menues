"use client";

import { useEffect, useState } from "react";
import { CalendarClock, UtensilsCrossed } from "lucide-react";
import { formatMoney } from "@/domain/money";
import { promotionState, shortTime } from "@/domain/promotions";
import type { PublicPromotion } from "./types";

/** Hora actual que arranca con la del servidor (sin diferencias al hidratar) y se actualiza cada minuto. */
function useNow(serverNow: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function PromotionsStrip({
  promotions,
  timeZone,
  currency,
  locale,
  serverNow,
}: {
  promotions: PublicPromotion[];
  timeZone: string;
  currency: string;
  locale: string;
  serverNow: number;
}) {
  const now = useNow(serverNow);
  const withState = promotions.map((p) => ({ p, state: promotionState(p, new Date(now), timeZone) }));
  const active = withState.filter((x) => x.state.kind === "active");
  const later = withState.filter((x) => x.state.kind === "scheduled" && x.state.next.today);
  if (active.length === 0 && later.length === 0) return null;
  const fmt = (minor: number | null) => (minor === null ? null : formatMoney(minor, currency, locale));
  return (
    <section aria-labelledby="hoy-en-el-local" className="mb-10 grid gap-3">
      <h2 id="hoy-en-el-local" className="sr-only">
        Hoy en el local
      </h2>
      {active.map(({ p, state }) => (
        <article key={p.id} className="rounded-(--menu-radius) border border-brand/25 bg-card p-5 shadow-xs">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold tracking-wide text-brand uppercase">
            {p.kind === "daily_menu" ? <UtensilsCrossed className="size-4" aria-hidden="true" /> : <CalendarClock className="size-4" aria-hidden="true" />}
            {p.kind === "daily_menu" ? "Menú del día" : "Promoción"}
            {state.kind === "active" && <span className="font-medium tracking-normal text-muted-foreground normal-case">· hasta las {shortTime(state.until)} h</span>}
          </p>
          <div className="mt-1 flex items-baseline justify-between gap-4">
            <h3 className="menu-display text-2xl font-semibold tracking-tight text-balance">{p.title}</h3>
            {fmt(p.price_minor) && <p className="price shrink-0 text-lg font-semibold">{fmt(p.price_minor)}</p>}
          </div>
          {p.items.length > 0 && (
            <ul className="mt-2 grid gap-1 text-[15px]">
              {p.items.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true" className="text-brand">
                    ·
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          )}
          {p.description && <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>}
        </article>
      ))}
      {later.map(({ p, state }) => (
        <p key={p.id} className="flex items-center gap-2 rounded-(--menu-radius) border border-border bg-card px-4 py-3 text-sm">
          <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            <strong>Hoy desde las {state.kind === "scheduled" ? shortTime(state.next.time) : ""} h:</strong> {p.title}
            {fmt(p.price_minor) && <span className="price"> · {fmt(p.price_minor)}</span>}
          </span>
        </p>
      ))}
    </section>
  );
}
