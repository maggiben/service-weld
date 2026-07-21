import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import esCommon from "./locales/es/common.json";
import enCommon from "./locales/en/common.json";

/**
 * react-i18next (006 R7). Spanish is the default and fallback; English is
 * available. Namespaced resources; enum/domain labels get their own `enums`
 * namespace in Phase 1/2.
 */
void i18n.use(initReactI18next).init({
  resources: {
    es: { common: esCommon },
    en: { common: enCommon },
  },
  lng: "es",
  fallbackLng: "es",
  supportedLngs: ["es", "en"],
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

export default i18n;
