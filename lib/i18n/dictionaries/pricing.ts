/**
 * Pricing-page copy, all languages.
 *
 * VOICE: docs/MARKETING_VOICE.md — sell the outcome, not the machine. A
 * five-year-old should understand every sentence. Short sentences, plain
 * words, no jargon, no hype. The top of the page says what you GET; the FAQ
 * further down keeps every number and billing term accurate for the buyer who
 * goes looking. Simplifying the pitch must never become hiding the facts.
 *
 * `en` is the CANONICAL BASE — `PricingDict` is derived from it, so adding a
 * string breaks the build until every language carries it. Edit `en` first.
 *
 * The translations are as simple IN THEIR OWN LANGUAGE as the English is in
 * English — NOT literal renderings (a word-for-word translation of plain
 * English produces stiff Spanish and bureaucratic Russian):
 *  - es: neutral Latin-American Spanish, informal "tú", everyday spoken words.
 *  - ru: formal «вы» (the register this market expects) but plain — short
 *    sentences, ordinary verbs, no noun chains.
 * Prices are NEVER hardcoded in prose — they interpolate via tokens
 * ({teamSeat}, {price}, {amount}) so currency localization applies everywhere.
 */

import type { Lang } from '../markets';

const en = {
  metaTitle: 'Pricing · Chippi',
  hero: {
    pill: 'Pricing',
    h1: 'Pay for what you use.',
    sub: 'Try it free for 7 days. Chippi does the work you hate. You keep the deals.',
  },
  plans: {
    individualEyebrow: 'For one agent',
    teamEyebrow: 'For teams',
    monthly: 'Monthly',
    annual: 'Yearly',
    save20: 'Save 20%',
    mostPopular: 'Most popular',
    perMonth: '/mo',
    billedMonthly: 'billed each month',
    /** {amount} = localized yearly total */
    billedAnnually: 'billed once a year at {amount}',
    /** {n} = included seat count */
    seatsIncluded: '{n} people included',
    forOneAgent: 'For one person',
    creditsPerMonth: 'credits a month',
    /** {price} localized seat price, {credits} formatted credit count */
    perSeatLine: '+{price}/person, +{credits} credits',
    cards: {
      solo: {
        blurb: 'Chippi reads your leads and writes back for you.',
        highlights: ['Answers every new lead', 'Books showings for you', 'Works with your email and calendar'],
        cta: 'Start free',
      },
      pro: {
        blurb: 'For agents with a lot of leads coming in.',
        highlights: ['Everything in Solo', 'More credits each month', 'We answer you first'],
        cta: 'Start free',
      },
      team: {
        blurb: 'See what everyone on your team is doing.',
        highlights: ['Sends each lead to the right person', 'One screen for the whole team', 'You decide who can do what'],
        cta: 'Start a team',
      },
      team_plus: {
        blurb: 'Run a big team. Keep it simple.',
        highlights: ['Everything in Team', 'More people and more credits', 'Cheaper per person'],
        cta: 'Start Team Plus',
      },
    },
  },
  seats: {
    eyebrow: 'Adding people',
    h2: 'Add someone. We fix the bill.',
    sub: 'Team and Team Plus come with people included. Need more? Each extra person costs the same flat price. Add or remove them any time.',
    perAgentSuffix: '/ extra person / mo',
    /** {credits} formatted credit count */
    creditsPerAgent: '+{credits} credits for each person you add',
    largeFloor: 'Got a big team?',
    talkToSales: 'Talk to us',
  },
  credits: {
    eyebrow: 'Credits',
    h2: 'One credit = one job Chippi does.',
    sub: 'Big jobs cost more. Small jobs cost almost nothing. Credits you do not use wait 30 days for you.',
    workflows: {
      tour_booking: 'Book a showing',
      daily_briefing: 'Your daily update',
      lead_score: 'Rank a new lead',
    },
    /** Intl.PluralRules category → the word "credit" declined for a count. */
    creditForms: { one: 'credit', other: 'credits' } as Record<string, string>,
    topupsEyebrow: 'Need more? Buy a top-up',
    topupLabels: { starter: 'Small top-up', growth: 'Medium top-up', power: 'Big top-up' },
    /** {price} = localized one-time price */
    topupLine: 'credits for {price}, one time',
  },
  faq: {
    eyebrow: 'Questions',
    h2: 'What people ask first.',
    items: [
      {
        q: 'Is there a free plan?',
        a: 'No. But you get 7 days free. We ask for a card to start. We do not charge you until day 7. Cancel before then and you pay nothing.',
      },
      {
        q: 'What is a credit?',
        a: 'One credit is one job Chippi does for you. Like booking a showing, writing your daily update, or ranking a new lead. Small jobs cost little or nothing. Credits you do not use wait 30 days.',
      },
      {
        q: 'What if I run out?',
        a: 'Buy more any time. Or move up a plan and get more each month for a better price. Your account keeps working. Only the big AI jobs pause.',
      },
      {
        q: 'How does team pricing work?',
        a: 'Add someone and we fix the bill for you. Extra people cost a flat price each month. That is {teamSeat} on Team and {teamPlusSeat} on Team Plus. Add or remove them any time. No jumping plans. No sales calls unless you want one.',
      },
    ],
  },
  closing: {
    h2: 'Try Chippi free for 7 days.',
    sub: 'Connect your email. Chippi starts working your leads today. Cancel before day 7 and you pay nothing.',
    startTrial: 'Start free',
    bookDemo: 'See a demo',
  },
  /** Shown only when the display currency isn't USD (checkout bills USD until
   *  Stripe currency_options ship). {currency} = the display currency code. */
  billedInUsdNote: 'Prices shown in {currency} to help you. We charge in USD.',
};

export type PricingDict = typeof en;

const es: PricingDict = {
  metaTitle: 'Precios · Chippi',
  hero: {
    pill: 'Precios',
    h1: 'Paga por lo que usas.',
    sub: 'Pruébalo gratis 7 días. Chippi hace el trabajo que odias. Tú te quedas con los negocios.',
  },
  plans: {
    individualEyebrow: 'Para un agente',
    teamEyebrow: 'Para equipos',
    monthly: 'Mensual',
    annual: 'Anual',
    save20: 'Ahorra 20%',
    mostPopular: 'Más popular',
    perMonth: '/mes',
    billedMonthly: 'se cobra cada mes',
    billedAnnually: 'se cobra una vez al año: {amount}',
    seatsIncluded: '{n} personas incluidas',
    forOneAgent: 'Para una persona',
    creditsPerMonth: 'créditos al mes',
    perSeatLine: '+{price}/persona, +{credits} créditos',
    cards: {
      solo: {
        blurb: 'Chippi lee tus leads y les responde por ti.',
        highlights: ['Responde cada lead nuevo', 'Agenda las visitas por ti', 'Funciona con tu correo y tu calendario'],
        cta: 'Empieza gratis',
      },
      pro: {
        blurb: 'Para agentes que reciben muchos leads.',
        highlights: ['Todo lo de Solo', 'Más créditos cada mes', 'Te respondemos primero'],
        cta: 'Empieza gratis',
      },
      team: {
        blurb: 'Mira qué hace todo tu equipo.',
        highlights: ['Manda cada lead a la persona correcta', 'Una pantalla para todo el equipo', 'Tú decides quién puede hacer qué'],
        cta: 'Crea un equipo',
      },
      team_plus: {
        blurb: 'Maneja un equipo grande. Sin complicarte.',
        highlights: ['Todo lo de Team', 'Más personas y más créditos', 'Más barato por persona'],
        cta: 'Empieza Team Plus',
      },
    },
  },
  seats: {
    eyebrow: 'Agregar personas',
    h2: 'Agrega a alguien. Nosotros arreglamos la cuenta.',
    sub: 'Team y Team Plus ya incluyen personas. ¿Necesitas más? Cada persona extra cuesta lo mismo. Agrégalas o quítalas cuando quieras.',
    perAgentSuffix: '/ persona extra / mes',
    creditsPerAgent: '+{credits} créditos por cada persona que agregues',
    largeFloor: '¿Tienes un equipo grande?',
    talkToSales: 'Habla con nosotros',
  },
  credits: {
    eyebrow: 'Créditos',
    h2: 'Un crédito = un trabajo que hace Chippi.',
    sub: 'Los trabajos grandes cuestan más. Los pequeños casi nada. Los créditos que no uses te esperan 30 días.',
    workflows: {
      tour_booking: 'Agendar una visita',
      daily_briefing: 'Tu resumen del día',
      lead_score: 'Calificar un lead nuevo',
    },
    creditForms: { one: 'crédito', other: 'créditos' },
    topupsEyebrow: '¿Necesitas más? Compra una recarga',
    topupLabels: { starter: 'Recarga chica', growth: 'Recarga mediana', power: 'Recarga grande' },
    topupLine: 'créditos por {price}, pago único',
  },
  faq: {
    eyebrow: 'Preguntas',
    h2: 'Lo que todos preguntan primero.',
    items: [
      {
        q: '¿Hay un plan gratis?',
        a: 'No. Pero tienes 7 días gratis. Te pedimos una tarjeta para empezar. No te cobramos hasta el día 7. Cancela antes y no pagas nada.',
      },
      {
        q: '¿Qué es un crédito?',
        a: 'Un crédito es un trabajo que Chippi hace por ti. Como agendar una visita, escribir tu resumen del día o calificar un lead nuevo. Los trabajos pequeños cuestan poco o nada. Los créditos que no uses te esperan 30 días.',
      },
      {
        q: '¿Y si se me acaban?',
        a: 'Compra más cuando quieras. O sube de plan y recibe más cada mes a mejor precio. Tu cuenta sigue funcionando. Solo se pausan los trabajos grandes de IA.',
      },
      {
        q: '¿Cómo funciona el precio para equipos?',
        a: 'Agrega a alguien y nosotros arreglamos la cuenta. Cada persona extra cuesta un precio fijo al mes. Son {teamSeat} en Team y {teamPlusSeat} en Team Plus. Agrégalas o quítalas cuando quieras. Sin cambiar de plan. Sin llamadas de ventas, a menos que tú quieras.',
      },
    ],
  },
  closing: {
    h2: 'Prueba Chippi gratis 7 días.',
    sub: 'Conecta tu correo. Chippi empieza a trabajar tus leads hoy. Cancela antes del día 7 y no pagas nada.',
    startTrial: 'Empieza gratis',
    bookDemo: 'Ver una demo',
  },
  billedInUsdNote: 'Los precios se muestran en {currency} para ayudarte. Cobramos en USD.',
};

const ru: PricingDict = {
  metaTitle: 'Цены · Chippi',
  hero: {
    pill: 'Цены',
    h1: 'Платите за то, что используете.',
    sub: 'Попробуйте бесплатно 7 дней. Chippi делает работу, которую вы не любите. Сделки остаются вам.',
  },
  plans: {
    individualEyebrow: 'Для одного агента',
    teamEyebrow: 'Для команд',
    monthly: 'Помесячно',
    annual: 'На год',
    save20: 'Скидка 20%',
    mostPopular: 'Самый популярный',
    perMonth: '/мес',
    billedMonthly: 'списываем каждый месяц',
    billedAnnually: 'списываем раз в год: {amount}',
    seatsIncluded: 'Людей включено: {n}',
    forOneAgent: 'Для одного человека',
    creditsPerMonth: 'кредитов в месяц',
    perSeatLine: '+{price}/человек, +{credits} кредитов',
    cards: {
      solo: {
        blurb: 'Chippi читает ваши лиды и отвечает за вас.',
        highlights: ['Отвечает на каждый новый лид', 'Записывает на показы за вас', 'Работает с вашей почтой и календарём'],
        cta: 'Начать бесплатно',
      },
      pro: {
        blurb: 'Для агентов, у которых много лидов.',
        highlights: ['Всё из плана Solo', 'Больше кредитов каждый месяц', 'Отвечаем вам первым'],
        cta: 'Начать бесплатно',
      },
      team: {
        blurb: 'Видно, что делает вся ваша команда.',
        highlights: ['Отправляет каждый лид нужному человеку', 'Один экран для всей команды', 'Вы решаете, кому что можно'],
        cta: 'Создать команду',
      },
      team_plus: {
        blurb: 'Большая команда. И всё просто.',
        highlights: ['Всё из плана Team', 'Больше людей и кредитов', 'Дешевле за человека'],
        cta: 'Начать Team Plus',
      },
    },
  },
  seats: {
    eyebrow: 'Добавить людей',
    h2: 'Добавьте человека. Счёт поправим сами.',
    sub: 'В Team и Team Plus места уже входят. Нужно больше? Каждый лишний человек стоит одну и ту же цену. Добавляйте и убирайте когда угодно.',
    perAgentSuffix: '/ доп. человек / мес',
    creditsPerAgent: '+{credits} кредитов за каждого добавленного человека',
    largeFloor: 'У вас большая команда?',
    talkToSales: 'Напишите нам',
  },
  credits: {
    eyebrow: 'Кредиты',
    h2: 'Один кредит = одна работа Chippi.',
    sub: 'Большие работы стоят дороже. Мелкие — почти ничего. Неиспользованные кредиты ждут вас 30 дней.',
    workflows: {
      tour_booking: 'Записать на показ',
      daily_briefing: 'Ваша сводка за день',
      lead_score: 'Оценить новый лид',
    },
    creditForms: { one: 'кредит', few: 'кредита', many: 'кредитов', other: 'кредита' },
    topupsEyebrow: 'Нужно больше? Купите пакет',
    topupLabels: { starter: 'Малый пакет', growth: 'Средний пакет', power: 'Большой пакет' },
    topupLine: 'кредитов за {price}, разовый платёж',
  },
  faq: {
    eyebrow: 'Вопросы',
    h2: 'О чём спрашивают в первую очередь.',
    items: [
      {
        q: 'Есть бесплатный план?',
        a: 'Нет. Но у вас есть 7 дней бесплатно. Для старта нужна карта. Мы не списываем деньги до 7-го дня. Отмените раньше — не заплатите ничего.',
      },
      {
        q: 'Что такое кредит?',
        a: 'Кредит — это одна работа, которую Chippi делает за вас. Например, запись на показ, сводка за день или оценка нового лида. Мелкие работы стоят мало или ничего. Неиспользованные кредиты ждут 30 дней.',
      },
      {
        q: 'А если кредиты закончатся?',
        a: 'Купите ещё в любой момент. Или перейдите на план выше: больше кредитов за лучшую цену. Аккаунт продолжает работать. Останавливаются только большие ИИ-работы.',
      },
      {
        q: 'Как считается цена для команды?',
        a: 'Добавьте человека — счёт поправим сами. Каждый лишний человек стоит фиксированную цену в месяц. Это {teamSeat} на плане Team и {teamPlusSeat} на плане Team Plus. Добавляйте и убирайте когда угодно. Без смены плана. Без звонков продавцов, пока вы сами не захотите.',
      },
    ],
  },
  closing: {
    h2: 'Попробуйте Chippi бесплатно 7 дней.',
    sub: 'Подключите почту. Chippi начнёт работать с вашими лидами уже сегодня. Отмените до 7-го дня — не заплатите ничего.',
    startTrial: 'Начать бесплатно',
    bookDemo: 'Посмотреть демо',
  },
  billedInUsdNote: 'Цены показаны в {currency} для удобства. Списываем в USD.',
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
