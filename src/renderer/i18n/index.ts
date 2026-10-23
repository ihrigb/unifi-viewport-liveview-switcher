import { en } from './en'
import { de } from './de'

const locale = navigator.language.startsWith('de') ? 'de' : 'en'
export const t = locale === 'de' ? de : en
