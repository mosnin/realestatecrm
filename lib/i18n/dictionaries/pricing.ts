/**
 * Pricing-page copy, all languages.
 *
 * `en` (American English) is the CANONICAL BASE — it is the source of truth
 * for what the page says, and `PricingDict` is derived from it, so adding a
 * string to `en` breaks the build until every language carries it. Edit `en`
 * first, then update the translations to match (the intended workflow: an
 * English copy change must reflect in every language unless a divergence is
 * explicitly decided).
 *
 * Translation register (keep consistent across all marketing dictionaries):
 *  - es: neutral Latin-American Spanish (es-419), informal "tú", same short
 *    confident sentences as the English. No vosotros, no Castilian idiom.
 *  - ru: formal «вы», same register. Product terms stay natural, not calqued.
 *  - Numbers are NEVER hardcoded in prose — price/seat figures interpolate
 *    via tokens ({teamSeat}, {teamPlusSeat}) so currency localization applies
 *    everywhere at once.
 */

import type { Lang } from '../markets';

const en = {
  metaTitle: 'Pricing · Chippi',
  hero: {
    pill: 'Pricing',
    h1: 'Pricing that scales with you.',
    sub: 'Every plan starts with a 7-day free trial. Move up as you grow, premium AI workflows draw from a monthly credit balance, and brokerage pricing expands automatically as you add agents.',
  },
  plans: {
    individualEyebrow: 'For individual agents',
    teamEyebrow: 'For teams and brokerages',
    monthly: 'Monthly',
    annual: 'Annual',
    save20: 'Save 20%',
    mostPopular: 'Most popular',
    perMonth: '/mo',
    billedMonthly: 'billed monthly',
    /** {amount} = localized yearly total */
    billedAnnually: 'billed annually at {amount}/yr',
    /** {n} = included seat count */
    seatsIncluded: '{n} seats included',
    forOneAgent: 'For one agent',
    creditsPerMonth: 'credits / month',
    /** {price} localized seat price, {credits} formatted credit count */
    perSeatLine: '+{price}/seat, +{credits} credits',
    cards: {
      solo: {
        blurb: 'Organize your pipeline and put the core AI workflows to work.',
        highlights: ['Reads and drafts every lead', 'Tour booking and follow-ups', 'Every integration included'],
        cta: 'Start free trial',
      },
      pro: {
        blurb: 'The full daily AI workflow for serious lead volume.',
        highlights: ['Everything in Solo', 'Higher monthly credit balance', 'Priority support'],
        cta: 'Start free trial',
      },
      team: {
        blurb: 'A shared command center for scoring, routing, and accountability.',
        highlights: ['Lead routing across the floor', 'Live floor view and analytics', 'Roles, approvals, and audit log'],
        cta: 'Start a team',
      },
      team_plus: {
        blurb: 'Brokerage-level workflow without enterprise complexity.',
        highlights: ['Everything in Team', 'More seats and credits', 'Better per-seat rate'],
        cta: 'Start Team Plus',
      },
    },
  },
  seats: {
    eyebrow: 'Adding agents',
    h2: 'Add an agent, billing updates itself.',
    sub: 'Team and Team Plus include a block of seats. Past that, each additional agent is a flat monthly add-on, added or removed automatically as your floor changes.',
    perAgentSuffix: '/ additional agent / mo',
    /** {credits} formatted credit count */
    creditsPerAgent: '+{credits} credits per added agent',
    largeFloor: 'Running a large floor?',
    talkToSales: 'Talk to sales',
  },
  credits: {
    eyebrow: 'Premium AI workflows',
    h2: 'Credits are spent when Chippi does real work.',
    sub: 'Every plan includes a monthly credit balance. High-value actions cost more, routine ones cost little. Unused credits roll over for 30 days.',
    workflows: {
      tour_booking: 'Tour booking workflow',
      daily_briefing: 'Daily AI briefing',
      lead_score: 'Lead score update',
    },
    /** Intl.PluralRules category → the word "credit" declined for a count. */
    creditForms: { one: 'credit', other: 'credits' } as Record<string, string>,
    topupsEyebrow: 'Need more? One-time top-ups',
    topupLabels: { starter: 'Starter refill', growth: 'Growth refill', power: 'Power refill' },
    /** {price} = localized one-time price */
    topupLine: 'credits, {price} one-time',
  },
  faq: {
    eyebrow: 'Questions',
    h2: 'What people ask first.',
    items: [
      {
        q: 'Is there a free plan?',
        a: 'No. Every plan starts with a 7-day free trial. A card is required to begin, you are not charged until the trial ends, and you can cancel anytime before then at no cost.',
      },
      {
        q: 'What are credits?',
        a: 'Premium AI workflows draw from a monthly credit balance, like booking a tour, running your daily AI briefing, or scoring a new lead. Routine actions cost little or nothing, and unused credits roll over for 30 days.',
      },
      {
        q: 'What happens when I run out of credits?',
        a: 'Buy a one-time top-up anytime, or move up a plan for a larger monthly allocation and a better rate. Your workspace never locks, only the premium AI workflows pause.',
      },
      {
        q: 'How does brokerage pricing work?',
        a: 'Add an agent and billing updates automatically. Each agent beyond your included seats is a flat monthly add-on ({teamSeat} on Team, {teamPlusSeat} on Team Plus), added or removed as your floor changes. No tier jumping, no calls to sales until you want them.',
      },
    ],
  },
  closing: {
    h2: 'Try Chippi free for 7 days.',
    sub: 'Bring your inbox and let Chippi start working the leads today. Card required, cancel anytime before day 7 at no charge.',
    startTrial: 'Start free trial',
    bookDemo: 'Book a demo',
  },
  /** Shown only when the display currency isn't USD (checkout bills USD until
   *  Stripe currency_options ship). {currency} = the display currency code. */
  billedInUsdNote: 'Prices shown in {currency} for convenience. Billing is in USD at the equivalent rate.',
};

export type PricingDict = typeof en;

const es: PricingDict = {
  metaTitle: 'Precios · Chippi',
  hero: {
    pill: 'Precios',
    h1: 'Precios que escalan contigo.',
    sub: 'Cada plan comienza con una prueba gratis de 7 días. Sube de plan a medida que creces, los flujos de IA premium consumen créditos de un saldo mensual y el precio para inmobiliarias se amplía automáticamente al agregar agentes.',
  },
  plans: {
    individualEyebrow: 'Para agentes individuales',
    teamEyebrow: 'Para equipos e inmobiliarias',
    monthly: 'Mensual',
    annual: 'Anual',
    save20: 'Ahorra 20%',
    mostPopular: 'Más popular',
    perMonth: '/mes',
    billedMonthly: 'facturación mensual',
    billedAnnually: 'facturación anual de {amount}/año',
    seatsIncluded: '{n} puestos incluidos',
    forOneAgent: 'Para un agente',
    creditsPerMonth: 'créditos / mes',
    perSeatLine: '+{price}/puesto, +{credits} créditos',
    cards: {
      solo: {
        blurb: 'Organiza tu pipeline y pon a trabajar los flujos de IA esenciales.',
        highlights: ['Lee y redacta cada lead', 'Agenda visitas y da seguimiento', 'Todas las integraciones incluidas'],
        cta: 'Comenzar prueba gratis',
      },
      pro: {
        blurb: 'El flujo de IA diario completo para un volumen serio de leads.',
        highlights: ['Todo lo de Solo', 'Mayor saldo mensual de créditos', 'Soporte prioritario'],
        cta: 'Comenzar prueba gratis',
      },
      team: {
        blurb: 'Un centro de mando compartido para calificación, asignación y rendición de cuentas.',
        highlights: ['Asignación de leads en todo el equipo', 'Vista del equipo y analítica en vivo', 'Roles, aprobaciones y registro de auditoría'],
        cta: 'Crear un equipo',
      },
      team_plus: {
        blurb: 'Flujo de trabajo a nivel inmobiliaria, sin complejidad corporativa.',
        highlights: ['Todo lo de Team', 'Más puestos y créditos', 'Mejor precio por puesto'],
        cta: 'Comenzar Team Plus',
      },
    },
  },
  seats: {
    eyebrow: 'Agregar agentes',
    h2: 'Agrega un agente y la facturación se actualiza sola.',
    sub: 'Team y Team Plus incluyen un bloque de puestos. A partir de ahí, cada agente adicional es un cargo mensual fijo, que se suma o se quita automáticamente según cambia tu equipo.',
    perAgentSuffix: '/ agente adicional / mes',
    creditsPerAgent: '+{credits} créditos por cada agente agregado',
    largeFloor: '¿Manejas un equipo grande?',
    talkToSales: 'Habla con ventas',
  },
  credits: {
    eyebrow: 'Flujos de IA premium',
    h2: 'Los créditos se gastan cuando Chippi hace trabajo real.',
    sub: 'Cada plan incluye un saldo mensual de créditos. Las acciones de alto valor cuestan más, las rutinarias cuestan poco. Los créditos sin usar se conservan por 30 días.',
    workflows: {
      tour_booking: 'Flujo de agendamiento de visitas',
      daily_briefing: 'Resumen diario con IA',
      lead_score: 'Actualización del score del lead',
    },
    creditForms: { one: 'crédito', other: 'créditos' },
    topupsEyebrow: '¿Necesitas más? Recargas únicas',
    topupLabels: { starter: 'Recarga Starter', growth: 'Recarga Growth', power: 'Recarga Power' },
    topupLine: 'créditos, {price} pago único',
  },
  faq: {
    eyebrow: 'Preguntas',
    h2: 'Lo que todos preguntan primero.',
    items: [
      {
        q: '¿Hay un plan gratis?',
        a: 'No. Cada plan comienza con una prueba gratis de 7 días. Se requiere una tarjeta para empezar, no se te cobra hasta que termina la prueba y puedes cancelar en cualquier momento antes de que termine, sin costo.',
      },
      {
        q: '¿Qué son los créditos?',
        a: 'Los flujos de IA premium consumen créditos de un saldo mensual, como agendar una visita, generar tu resumen diario con IA o calificar un lead nuevo. Las acciones rutinarias cuestan poco o nada, y los créditos sin usar se conservan por 30 días.',
      },
      {
        q: '¿Qué pasa cuando me quedo sin créditos?',
        a: 'Compra una recarga única en cualquier momento, o sube de plan para obtener una asignación mensual mayor y una mejor tarifa. Tu espacio de trabajo nunca se bloquea, solo se pausan los flujos de IA premium.',
      },
      {
        q: '¿Cómo funciona el precio para inmobiliarias?',
        a: 'Agrega un agente y la facturación se actualiza automáticamente. Cada agente por encima de los puestos incluidos es un cargo mensual fijo ({teamSeat} en Team, {teamPlusSeat} en Team Plus), que se suma o se quita según cambia tu equipo. Sin saltos de plan ni llamadas a ventas hasta que tú quieras.',
      },
    ],
  },
  closing: {
    h2: 'Prueba Chippi gratis por 7 días.',
    sub: 'Conecta tu bandeja de entrada y deja que Chippi empiece a trabajar tus leads hoy. Se requiere tarjeta, cancela en cualquier momento antes del día 7 sin cargo.',
    startTrial: 'Comenzar prueba gratis',
    bookDemo: 'Agendar una demo',
  },
  billedInUsdNote: 'Los precios se muestran en {currency} como referencia. La facturación es en USD al valor equivalente.',
};

const ru: PricingDict = {
  metaTitle: 'Цены · Chippi',
  hero: {
    pill: 'Цены',
    h1: 'Цены, которые масштабируются вместе с вами.',
    sub: 'Каждый план начинается с бесплатного 7-дневного пробного периода. Переходите на план выше по мере роста, премиальные ИИ-процессы оплачиваются из ежемесячного баланса кредитов, а тариф для агентства масштабируется автоматически по мере добавления агентов.',
  },
  plans: {
    individualEyebrow: 'Для индивидуальных агентов',
    teamEyebrow: 'Для команд и агентств',
    monthly: 'Ежемесячно',
    annual: 'Ежегодно',
    save20: 'Скидка 20%',
    mostPopular: 'Самый популярный',
    perMonth: '/мес',
    billedMonthly: 'ежемесячная оплата',
    billedAnnually: 'при годовой оплате {amount}/год',
    seatsIncluded: 'Мест включено: {n}',
    forOneAgent: 'Для одного агента',
    creditsPerMonth: 'кредитов / месяц',
    perSeatLine: '+{price}/место, +{credits} кредитов',
    cards: {
      solo: {
        blurb: 'Наведите порядок в воронке и запустите в работу базовые ИИ-процессы.',
        highlights: ['Читает каждый лид и готовит черновики ответов', 'Запись на показы и повторные контакты с лидами', 'Все интеграции включены'],
        cta: 'Начать бесплатный период',
      },
      pro: {
        blurb: 'Полный ежедневный ИИ-процесс для серьёзного потока лидов.',
        highlights: ['Всё из плана Solo', 'Больше кредитов ежемесячно', 'Приоритетная поддержка'],
        cta: 'Начать бесплатный период',
      },
      team: {
        blurb: 'Общий центр управления для скоринга, распределения лидов и контроля.',
        highlights: ['Распределение лидов по всей команде', 'Панель команды и аналитика в реальном времени', 'Роли, согласования и журнал действий'],
        cta: 'Создать команду',
      },
      team_plus: {
        blurb: 'Процессы уровня агентства без корпоративной сложности.',
        highlights: ['Всё из плана Team', 'Больше мест и кредитов', 'Лучшая цена за место'],
        cta: 'Начать Team Plus',
      },
    },
  },
  seats: {
    eyebrow: 'Добавление агентов',
    h2: 'Добавьте агента — счёт обновится сам.',
    sub: 'Team и Team Plus включают набор мест. Сверх него каждый дополнительный агент — фиксированная месячная доплата, которая добавляется и убирается автоматически вместе с изменениями в команде.',
    perAgentSuffix: '/ доп. агент / мес',
    creditsPerAgent: '+{credits} кредитов за каждого добавленного агента',
    largeFloor: 'У вас большая команда?',
    talkToSales: 'Свяжитесь с отделом продаж',
  },
  credits: {
    eyebrow: 'Премиальные ИИ-процессы',
    h2: 'Кредиты тратятся, когда Chippi выполняет реальную работу.',
    sub: 'Каждый план включает ежемесячный баланс кредитов. Ценные действия стоят дороже, рутинные — совсем немного. Неиспользованные кредиты сохраняются в течение 30 дней.',
    workflows: {
      tour_booking: 'Процесс записи на показ',
      daily_briefing: 'Ежедневная ИИ-сводка',
      lead_score: 'Обновление скоринга лида',
    },
    creditForms: { one: 'кредит', few: 'кредита', many: 'кредитов', other: 'кредита' },
    topupsEyebrow: 'Нужно больше? Разовые пополнения',
    topupLabels: { starter: 'Пополнение Starter', growth: 'Пополнение Growth', power: 'Пополнение Power' },
    topupLine: 'кредитов, {price} разовым платежом',
  },
  faq: {
    eyebrow: 'Вопросы',
    h2: 'О чём спрашивают в первую очередь.',
    items: [
      {
        q: 'Есть ли бесплатный план?',
        a: 'Нет. Каждый план начинается с бесплатного 7-дневного пробного периода. Для старта нужна карта, оплата не списывается до конца пробного периода, и вы можете отменить подписку в любой момент до его окончания без каких-либо расходов.',
      },
      {
        q: 'Что такое кредиты?',
        a: 'Премиальные ИИ-процессы оплачиваются из ежемесячного баланса кредитов — например, запись на показ, ежедневная ИИ-сводка или скоринг нового лида. Рутинные действия почти или совсем ничего не стоят, а неиспользованные кредиты сохраняются в течение 30 дней.',
      },
      {
        q: 'Что будет, когда кредиты закончатся?',
        a: 'Купите разовое пополнение в любой момент или перейдите на план выше — с большим ежемесячным объёмом и лучшей ценой. Рабочее пространство никогда не блокируется, приостанавливаются только премиальные ИИ-процессы.',
      },
      {
        q: 'Как устроен тариф для агентства?',
        a: 'Добавьте агента — счёт обновится автоматически. Каждый агент сверх включённых мест — фиксированная месячная доплата ({teamSeat} на плане Team, {teamPlusSeat} на плане Team Plus), которая добавляется и убирается вместе с изменениями в команде. Без скачков между планами и без звонков в отдел продаж, пока вы сами не захотите.',
      },
    ],
  },
  closing: {
    h2: 'Попробуйте Chippi бесплатно 7 дней.',
    sub: 'Подключите почту — и Chippi начнёт работать с вашими лидами уже сегодня. Нужна карта; отменить можно в любой момент до 7-го дня — без списаний.',
    startTrial: 'Начать бесплатный период',
    bookDemo: 'Записаться на демо',
  },
  billedInUsdNote: 'Цены показаны в {currency} для удобства. Оплата производится в USD по эквивалентному курсу.',
};

export const PRICING_DICTS: Record<Lang, PricingDict> = { en, es, ru };

/** Tiny token interpolation: fill('{n} seats', { n: 5 }). Tokens with no
 *  provided value are left as-is (visible in review rather than silently
 *  dropped). */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}

/** Language-correct plural word for a count (handles Russian one/few/many). */
export function pluralWord(lang: Lang, n: number, forms: Record<string, string>): string {
  const tag = lang === 'en' ? 'en-US' : lang === 'es' ? 'es-419' : 'ru';
  const cat = new Intl.PluralRules(tag).select(n);
  return forms[cat] ?? forms.other ?? Object.values(forms)[0] ?? '';
}
