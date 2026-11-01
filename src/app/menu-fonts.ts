import {
  Archivo_Black,
  Bebas_Neue,
  Caveat,
  Cormorant_Garamond,
  DM_Sans,
  DM_Serif_Display,
  Josefin_Sans,
  Libre_Baskerville,
  Lora,
  Oswald,
  Pacifico,
  Playfair_Display,
  Space_Grotesk,
  Work_Sans,
} from "next/font/google";

// Tipografías que puede usar el diseño de la carta (src/domain/theme.ts).
// preload: false para que el panel no las descargue: el navegador baja cada
// archivo solo cuando una carta la usa. next/font exige opciones literales.

const playfair = Playfair_Display({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-playfair" });
const dmSerif = DM_Serif_Display({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: "400", variable: "--font-dm-serif" });
const cormorant = Cormorant_Garamond({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-cormorant" });
const baskerville = Libre_Baskerville({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-baskerville" });
const bebas = Bebas_Neue({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: "400", variable: "--font-bebas" });
const oswald = Oswald({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-oswald" });
const archivoBlack = Archivo_Black({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: "400", variable: "--font-archivo-black" });
const josefin = Josefin_Sans({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-josefin" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-space-grotesk" });
const caveat = Caveat({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-caveat" });
const pacifico = Pacifico({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: "400", variable: "--font-pacifico" });
const dmSans = DM_Sans({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-dm-sans" });
const workSans = Work_Sans({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-work-sans" });
const lora = Lora({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-lora" });

export const menuFontVariables = [
  playfair,
  dmSerif,
  cormorant,
  baskerville,
  bebas,
  oswald,
  archivoBlack,
  josefin,
  spaceGrotesk,
  caveat,
  pacifico,
  dmSans,
  workSans,
  lora,
]
  .map((font) => font.variable)
  .join(" ");
