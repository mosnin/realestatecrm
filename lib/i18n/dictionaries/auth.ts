import type { Lang } from '../markets';

const en = {
  brand: {
    eyebrow: 'Your AI lead conversion teammate',
    headline: 'Turn more leads into booked tours.',
    capabilities: 'Read · Rank · Draft · Book',
  },
  accountType: 'Account type',
  agent: 'Real estate agent',
  broker: 'Broker',
  legal: {
    prefix: 'By continuing, you agree to our',
    terms: 'Terms of Service',
    and: 'and',
    privacy: 'Privacy Policy',
  },
  signup: {
    heading: 'Set up Chippi.',
    subheading: 'Start with your first lead.',
    existing: 'Already have an account?',
    action: 'Sign in',
  },
  realtor: {
    heading: 'Welcome back, real estate agent.',
    newAccount: 'Do not have an account?',
    action: 'Sign up',
  },
  brokerPage: {
    heading: 'Welcome back, broker.',
    newAccount: 'Do not have an account?',
    action: 'Sign up',
  },
};

export type AuthDict = typeof en;

const es: AuthDict = {
  brand: {
    eyebrow: 'Tu asistente de IA para convertir leads',
    headline: 'Convierte más leads en visitas agendadas.',
    capabilities: 'Leer · Calificar · Escribir · Agendar',
  },
  accountType: 'Tipo de cuenta',
  agent: 'Agente inmobiliario',
  broker: 'Corredor',
  legal: {
    prefix: 'Al continuar, aceptas nuestros',
    terms: 'Términos de servicio',
    and: 'y la',
    privacy: 'Política de privacidad',
  },
  signup: {
    heading: 'Configura Chippi.',
    subheading: 'Empieza con tu primer lead.',
    existing: '¿Ya tienes una cuenta?',
    action: 'Inicia sesión',
  },
  realtor: {
    heading: 'Bienvenido de nuevo.',
    newAccount: '¿Aún no tienes una cuenta?',
    action: 'Regístrate',
  },
  brokerPage: {
    heading: 'Bienvenido de nuevo.',
    newAccount: '¿Aún no tienes una cuenta?',
    action: 'Regístrate',
  },
};

const ru: AuthDict = {
  brand: {
    eyebrow: 'Ваш ИИ-напарник по работе с лидами',
    headline: 'Больше лидов превращаются в показы.',
    capabilities: 'Читать · Оценивать · Писать · Назначать',
  },
  accountType: 'Тип аккаунта',
  agent: 'Агент по недвижимости',
  broker: 'Брокер',
  legal: {
    prefix: 'Продолжая, вы принимаете наши',
    terms: 'Условия использования',
    and: 'и',
    privacy: 'Политику конфиденциальности',
  },
  signup: {
    heading: 'Настройте Chippi.',
    subheading: 'Начните с первого лида.',
    existing: 'Уже есть аккаунт?',
    action: 'Войти',
  },
  realtor: {
    heading: 'С возвращением.',
    newAccount: 'Нет аккаунта?',
    action: 'Зарегистрироваться',
  },
  brokerPage: {
    heading: 'С возвращением.',
    newAccount: 'Нет аккаунта?',
    action: 'Зарегистрироваться',
  },
};

export const AUTH_DICTS: Record<Lang, AuthDict> = { en, es, ru };
