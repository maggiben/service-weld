import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import esLanding from "./locales/es/landing.json";
import enLanding from "./locales/en/landing.json";

void i18n.use(initReactI18next).init({
  resources: {
    es: { landing: esLanding },
    en: { landing: enLanding },
  },
  lng: "es",
  fallbackLng: "es",
  supportedLngs: ["es", "en"],
  defaultNS: "landing",
  interpolation: { escapeValue: false },
});

export default i18n;
