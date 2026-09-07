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
  metaDescription: 'Turn more inquiries into booked tours. Start free for 7 days and save 20% with yearly billing.',
  hero: {
    pill: '7 days free · Save 20% yearly',
    h1: 'Choose the work you want off your plate.',
    sub: 'Every plan includes Chippi. Pick the amount of work your book needs. Yearly billing saves 20%.',
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
        blurb: 'For one agent who wants every lead worked.',
        highlights: ['Reads and ranks every new lead', 'Drafts replies in your voice', 'Books tours from your calendar'],
        cta: 'Start 7 days free',
      },
      pro: {
        blurb: 'For a busy agent with more leads to work.',
        highlights: ['Everything in Solo', 'More work included each month', 'Priority help when you need it'],
        cta: 'Start 7 days free',
      },
      team: {
        blurb: 'For a team that wants one clear lead process.',
        highlights: ['Routes each lead to the right person', 'Shows the whole floor in one place', 'Keeps roles and action logs clear'],
        cta: 'Start a team',
      },
      team_plus: {
        blurb: 'For a large floor that needs more room.',
        highlights: ['Everything in Team', 'More people and work included', 'Lower cost for each extra person'],
        cta: 'Start Team Plus',
      },
    },
  },
  seats: {
    eyebrow: 'Adding people',
    h2: 'Grow the team without changing plans.',
    sub: 'Team plans include seats. Add or remove people any time. The bill updates with you.',
    perAgentSuffix: '/ extra person / mo',
    /** {credits} formatted credit count */
    creditsPerAgent: '+{credits} credits for each person you add',
    largeFloor: 'Got a big team?',
    talkToSales: 'Talk to us',
  },
  credits: {
    eyebrow: 'Credits',
    h2: 'See what each job costs.',
    sub: 'A lead rank costs {leadScore} credit. A tour booking costs {tourBooking} credits. Unused credits stay 30 days.',
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
      {
        q: 'Why is yearly selected first?',
        a: 'Yearly billing saves 20%. You can switch to monthly before checkout.',
      },
    ],
  },
  closing: {
    h2: 'Give Chippi seven days with your leads.',
    sub: 'Connect your email and calendar. Cancel before day 7 and pay nothing.',
    startTrial: 'Start 7 days free',
    bookDemo: 'Book a live walkthrough',
  },
  /** Shown only when the display currency isn't USD (checkout bills USD until
   *  Stripe currency_options ship). {currency} = the display currency code. */
  billedInUsdNote: 'Prices shown in {currency} to help you. We charge in USD.',
};

export type PricingDict = typeof en;

const es: PricingDict = {
  metaTitle: 'Precios · Chippi',
  metaDescription: 'Convierte más consultas en visitas agendadas. Prueba 7 días gratis y ahorra 20% con pago anual.',
  hero: {
    pill: '7 días gratis · Ahorra 20% al año',
    h1: 'Elige el trabajo que quieres quitarte de encima.',
    sub: 'Todos los planes incluyen Chippi. Elige cuánto trabajo necesita tu cartera. El pago anual ahorra 20%.',
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
        blurb: 'Para un agente que quiere atender cada lead.',
        highlights: ['Lee y califica cada lead nuevo', 'Escribe respuestas con tu voz', 'Agenda visitas desde tu calendario'],
        cta: 'Prueba 7 días gratis',
      },
      pro: {
        blurb: 'Para un agente ocupado con más leads.',
        highlights: ['Todo lo de Solo', 'Más trabajo incluido cada mes', 'Ayuda prioritaria cuando la necesites'],
        cta: 'Prueba 7 días gratis',
      },
      team: {
        blurb: 'Para un equipo que quiere un proceso claro.',
        highlights: ['Manda cada lead a la persona correcta', 'Muestra todo el equipo en un lugar', 'Aclara los permisos y registros'],
        cta: 'Crea un equipo',
      },
      team_plus: {
        blurb: 'Para un equipo grande que necesita más espacio.',
        highlights: ['Todo lo de Team', 'Más personas y trabajo incluido', 'Menor precio por persona extra'],
        cta: 'Empieza Team Plus',
      },
    },
  },
  seats: {
    eyebrow: 'Agregar personas',
    h2: 'Haz crecer el equipo sin cambiar de plan.',
    sub: 'Los planes Team incluyen personas. Agrégalas o quítalas cuando quieras. La cuenta se actualiza sola.',
    perAgentSuffix: '/ persona extra / mes',
    creditsPerAgent: '+{credits} créditos por cada persona que agregues',
    largeFloor: '¿Tienes un equipo grande?',
    talkToSales: 'Habla con nosotros',
  },
  credits: {
    eyebrow: 'Créditos',
    h2: 'Mira cuánto cuesta cada trabajo.',
    sub: 'Calificar un lead cuesta {leadScore} crédito. Agendar una visita cuesta {tourBooking} créditos. Tus créditos duran 30 días.',
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
      {
        q: '¿Por qué aparece primero el pago anual?',
        a: 'El pago anual ahorra 20%. Puedes cambiar al mensual antes de pagar.',
      },
    ],
  },
  closing: {
    h2: 'Dale a Chippi siete días con tus leads.',
    sub: 'Conecta tu correo y calendario. Cancela antes del día 7 y no pagas nada.',
    startTrial: 'Prueba 7 días gratis',
    bookDemo: 'Agenda una demo en vivo',
  },
  billedInUsdNote: 'Los precios se muestran en {currency} para ayudarte. Cobramos en USD.',
};

const ru: PricingDict = {
  metaTitle: 'Цены · Chippi',
  metaDescription: 'Превращайте больше обращений в показы. Попробуйте 7 дней бесплатно и сэкономьте 20% при оплате за год.',
  hero: {
    pill: '7 дней бесплатно · Скидка 20% за год',
    h1: 'Выберите работу, которую хотите снять с себя.',
    sub: 'Во всех планах есть Chippi. Выберите нужный объём работы. Оплата за год экономит 20%.',
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
        blurb: 'Для одного агента, который хочет обработать каждый лид.',
        highlights: ['Читает и оценивает каждый новый лид', 'Пишет ответы в вашем стиле', 'Записывает на показы по календарю'],
        cta: '7 дней бесплатно',
      },
      pro: {
        blurb: 'Для занятого агента с большим потоком лидов.',
        highlights: ['Всё из плана Solo', 'Больше работы включено каждый месяц', 'Приоритетная помощь при необходимости'],
        cta: '7 дней бесплатно',
      },
      team: {
        blurb: 'Для команды, которой нужен единый порядок работы.',
        highlights: ['Направляет лид нужному человеку', 'Показывает всю команду в одном месте', 'Сохраняет роли и журнал действий'],
        cta: 'Создать команду',
      },
      team_plus: {
        blurb: 'Для большой команды, которой нужно больше места.',
        highlights: ['Всё из плана Team', 'Больше людей и работы включено', 'Ниже цена за дополнительного человека'],
        cta: 'Начать Team Plus',
      },
    },
  },
  seats: {
    eyebrow: 'Добавить людей',
    h2: 'Расширяйте команду без смены плана.',
    sub: 'В планах Team уже есть места. Добавляйте и убирайте людей. Счёт обновится сам.',
    perAgentSuffix: '/ доп. человек / мес',
    creditsPerAgent: '+{credits} кредитов за каждого добавленного человека',
    largeFloor: 'У вас большая команда?',
    talkToSales: 'Напишите нам',
  },
  credits: {
    eyebrow: 'Кредиты',
    h2: 'Смотрите цену каждой работы.',
    sub: 'Оценка лида стоит {leadScore} кредит. Запись на показ стоит {tourBooking} кредитов. Кредиты хранятся 30 дней.',
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
      {
        q: 'Почему сначала выбрана оплата за год?',
        a: 'Оплата за год экономит 20%. До оплаты можно выбрать месяц.',
      },
    ],
  },
  closing: {
    h2: 'Дайте Chippi семь дней с вашими лидами.',
    sub: 'Подключите почту и календарь. Отмените до 7-го дня и ничего не платите.',
    startTrial: '7 дней бесплатно',
    bookDemo: 'Записаться на живой показ',
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
