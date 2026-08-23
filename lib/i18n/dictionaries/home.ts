/**
 * Homepage offer copy. English is canonical so every new claim must ship with
 * Spanish and Russian before the build can pass.
 */

import type { Lang } from '../markets';

const en = {
  metaTitle: 'Chippi · Turn more leads into booked tours',
  metaDescription: 'Chippi reads and ranks every inquiry. It drafts in your voice, books tours, and keeps the CRM current.',
  hero: {
    eyebrow: 'Your AI lead conversion teammate',
    line1: 'Turn more leads into',
    line2: 'booked tours.',
    sub: 'Chippi reads every inquiry and ranks who is ready. It drafts in your voice, books from your real calendar, and keeps the CRM current. You stay in control of what sends.',
    band: 'From first inquiry to booked tour',
    capabilities: ['New lead response', 'Lead ranking', 'Tour booking', 'Follow-up drafts', 'Deal updates', 'Action receipts'],
  },
  offer: {
    start: 'Start free for 7 days',
    demo: 'Book a live walkthrough',
    terms: 'Card required. Nothing charged until day 7. Cancel before then and pay nothing.',
    outcomes: ['Every inquiry read', 'Best leads ranked', 'Tours booked', 'Every action logged'],
  },
  proof: {
    intro: 'The lead conversion loop stops depending on your memory. Chippi handles the chase. You keep the relationship.',
    items: [
      { value: 'Read', label: 'Every new inquiry' },
      { value: 'Ranked', label: 'Who to call next' },
      { value: 'Booked', label: 'From your real calendar' },
    ],
  },
  mechanism: {
    eyebrow: 'How it works',
    headline: 'Every lead gets a clear next move.',
    sub: 'Keep the tools you use. Chippi works the handoff between them.',
    items: [
      { title: 'Read', desc: 'Every inquiry arrives with its history and context.' },
      { title: 'Rank', desc: 'Intent signals show who deserves the next call.' },
      { title: 'Draft', desc: 'The reply follows your voice and sending rules.' },
      { title: 'Book', desc: 'The tour lands on your calendar and updates the deal.' },
    ],
    control: 'You choose what Chippi may send. Everything else waits for approval. Every action is logged.',
  },
  closing: {
    eyebrow: 'Try it on your book',
    headline: 'Give Chippi seven days.',
    subheadline: 'Keep the deals. Lose the chase.',
    body: 'Connect your inbox and calendar. See Chippi read, rank, draft, and book against your real leads. Cancel before day 7 and pay nothing.',
    start: 'Start free for 7 days',
    demo: 'Book a live walkthrough',
  },
};

export type HomeDict = typeof en;

const es: HomeDict = {
  metaTitle: 'Chippi · Convierte más leads en visitas agendadas',
  metaDescription: 'Chippi lee y califica cada consulta. Escribe con tu voz, agenda visitas y actualiza el CRM.',
  hero: {
    eyebrow: 'Tu asistente de IA para convertir leads',
    line1: 'Convierte más leads en',
    line2: 'visitas agendadas.',
    sub: 'Chippi lee cada consulta y muestra quién está listo. Escribe con tu voz, agenda desde tu calendario y actualiza el CRM. Tú decides qué se envía.',
    band: 'Desde la primera consulta hasta la visita',
    capabilities: ['Respuesta a leads nuevos', 'Calificación de leads', 'Agenda de visitas', 'Respuestas de seguimiento', 'Actualización de negocios', 'Registro de acciones'],
  },
  offer: {
    start: 'Prueba 7 días gratis',
    demo: 'Agenda una demo en vivo',
    terms: 'Se requiere tarjeta. No cobramos hasta el día 7. Cancela antes y no pagas nada.',
    outcomes: ['Cada consulta leída', 'Mejores leads primero', 'Visitas agendadas', 'Cada acción registrada'],
  },
  proof: {
    intro: 'La conversión ya no depende de tu memoria. Chippi hace el seguimiento. Tú cuidas la relación.',
    items: [
      { value: 'Leído', label: 'Cada consulta nueva' },
      { value: 'Ordenado', label: 'A quién llamar ahora' },
      { value: 'Agendado', label: 'Desde tu calendario real' },
    ],
  },
  mechanism: {
    eyebrow: 'Cómo funciona',
    headline: 'Cada lead sale con un próximo paso claro.',
    sub: 'Conserva las herramientas que usas. Chippi conecta el trabajo entre ellas.',
    items: [
      { title: 'Lee', desc: 'Cada consulta llega con su historial y contexto.' },
      { title: 'Califica', desc: 'Las señales muestran a quién debes llamar ahora.' },
      { title: 'Escribe', desc: 'La respuesta sigue tu voz y tus reglas.' },
      { title: 'Agenda', desc: 'La visita llega a tu calendario y actualiza el negocio.' },
    ],
    control: 'Tú decides qué puede enviar Chippi. Lo demás espera tu aprobación. Cada acción queda registrada.',
  },
  closing: {
    eyebrow: 'Pruébalo con tus leads',
    headline: 'Dale siete días a Chippi.',
    subheadline: 'Quédate con los negocios. Deja el seguimiento.',
    body: 'Conecta tu correo y calendario. Mira cómo Chippi lee, califica, escribe y agenda con tus leads. Cancela antes del día 7 y no pagas nada.',
    start: 'Prueba 7 días gratis',
    demo: 'Agenda una demo en vivo',
  },
};

const ru: HomeDict = {
  metaTitle: 'Chippi · Больше лидов превращаются в показы',
  metaDescription: 'Chippi читает обращения, оценивает готовность, пишет в вашем стиле, назначает показы и обновляет CRM.',
  hero: {
    eyebrow: 'Ваш ИИ-напарник по работе с лидами',
    line1: 'Превращайте больше лидов',
    line2: 'в назначенные показы.',
    sub: 'Chippi читает каждое обращение и показывает готовых клиентов. Пишет в вашем стиле, назначает время по календарю и обновляет CRM. Вы решаете, что отправлять.',
    band: 'От первого обращения до назначенного показа',
    capabilities: ['Ответ новым лидам', 'Оценка лидов', 'Запись на показы', 'Черновики ответов', 'Обновление сделок', 'Журнал действий'],
  },
  offer: {
    start: '7 дней бесплатно',
    demo: 'Записаться на живой показ',
    terms: 'Нужна карта. Списание только на 7-й день. Отмените раньше и ничего не платите.',
    outcomes: ['Каждое обращение прочитано', 'Лучшие лиды наверху', 'Показы назначены', 'Каждое действие записано'],
  },
  proof: {
    intro: 'Работа с лидами больше не зависит от памяти. Chippi ведёт процесс. Вы сохраняете отношения.',
    items: [
      { value: 'Прочитано', label: 'Каждое новое обращение' },
      { value: 'Оценено', label: 'Кому звонить дальше' },
      { value: 'Назначено', label: 'По вашему календарю' },
    ],
  },
  mechanism: {
    eyebrow: 'Как это работает',
    headline: 'У каждого лида есть понятный следующий шаг.',
    sub: 'Оставьте привычные сервисы. Chippi связывает работу между ними.',
    items: [
      { title: 'Читает', desc: 'Каждое обращение приходит с историей и контекстом.' },
      { title: 'Оценивает', desc: 'Сигналы показывают, кому звонить следующим.' },
      { title: 'Пишет', desc: 'Ответ следует вашему стилю и правилам отправки.' },
      { title: 'Назначает', desc: 'Показ попадает в календарь и обновляет сделку.' },
    ],
    control: 'Вы решаете, что Chippi может отправить. Остальное ждёт одобрения. Каждое действие записано.',
  },
  closing: {
    eyebrow: 'Проверьте на своих лидах',
    headline: 'Дайте Chippi семь дней.',
    subheadline: 'Сделки остаются вам. Погоню берёт Chippi.',
    body: 'Подключите почту и календарь. Смотрите, как Chippi читает, оценивает, пишет и назначает показы. Отмените до 7-го дня и ничего не платите.',
    start: '7 дней бесплатно',
    demo: 'Записаться на живой показ',
  },
};

export const HOME_DICTS: Record<Lang, HomeDict> = { en, es, ru };
