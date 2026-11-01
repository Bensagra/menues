import type { MenuSnapshot } from "@/domain/snapshot";
import type { OpeningInterval } from "@/domain/time";

export interface PublicMedia {
  sm: string;
  lg: string;
  w: number;
  h: number;
}

export interface PublicPromotion {
  id: string;
  kind: "daily_menu" | "promotion";
  title: string;
  description: string;
  items: string[];
  price_minor: number | null;
  starts_on: string;
  ends_on: string;
  weekdays: number[];
  start_time: string;
  end_time: string;
}

export interface PublicMenuData {
  business: {
    id: string;
    name: string;
    description: string;
    brand_color: string | null;
    currency: string;
    locale: string;
    logo: PublicMedia | null;
    cover: PublicMedia | null;
  };
  branch: {
    id: string;
    name: string;
    public_slug: string;
    address: string;
    phone: string;
    whatsapp: string;
    public_note: string;
    timezone: string;
    opening_hours: OpeningInterval[];
    other_branches: { name: string; public_slug: string }[];
  };
  menus: {
    menu_id: string;
    kind: string;
    version_number: number | null;
    published_at: string | null;
    snapshot: MenuSnapshot;
  }[];
  /** Programadas alrededor de hoy: la página decide cuáles mostrar con la hora actual. */
  promotions: PublicPromotion[];
}
