import { createI18n } from 'vue-i18n'
import enUS from './locales/en-US.ts'
import koKR from './locales/ko-KR.ts'

const messages = {
  'en-US': enUS,
  'ko-KR': koKR
}

const SUPPORTED_LOCALES = ['en-US', 'ko-KR'] as const
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

// Get saved language from localStorage and fallback to English if unsupported.
const rawSavedLocale = localStorage.getItem('locale')
const savedLocale: SupportedLocale =
  rawSavedLocale && SUPPORTED_LOCALES.includes(rawSavedLocale as SupportedLocale)
    ? (rawSavedLocale as SupportedLocale)
    : 'en-US'

if (rawSavedLocale !== savedLocale) {
  localStorage.setItem('locale', savedLocale)
}

const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'en-US',
  globalInjection: true,
  messages
})

export default i18n
