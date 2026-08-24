/** Shared marketing navigation and footer copy. */

import type { Lang } from '../markets';

const en = {
  header: {
    product: {
      label: 'Product',
      featured: {
        eyebrow: 'MEET CHIPPI',
        title: 'Turn more leads into booked tours.',
        body: 'Chippi reads each inquiry, ranks who is ready, drafts the reply, and books from your calendar.',
        cta: 'Meet Chippi',
      },
      items: [
        { label: 'Chippi', desc: 'The AI teammate that turns inquiries into tours' },
        { label: 'For agents', desc: 'Your inbox, leads, and tours, handled' },
        { label: 'For brokerages', desc: 'One conversion teammate behind every desk' },
        { label: 'Integrations', desc: 'Connect the tools you already pay for' },
      ],
    },
    company: {
      label: 'Company',
      featured: {
        eyebrow: 'OUR STORY',
        title: 'The chase should not cost the relationship.',
        body: 'Why we built a teammate to work every lead while agents do the human work.',
        cta: 'Read our story',
      },
      items: [
        { label: 'Our story', desc: 'The gap we set out to close' },
        { label: 'Help Center', desc: 'Guides for every part of Chippi' },
        { label: 'Research', desc: 'The work that shaped every feature' },
        { label: 'Careers', desc: 'Help build the future of real estate' },
      ],
    },
    pricing: 'Pricing',
    signIn: 'Sign in',
    start: 'Start free',
    startLong: 'Start free for 7 days',
    demo: 'See a demo',
  },
  footer: {
    headings: ['Product', 'Company', 'Resources'],
    links: [
      ['Agents', 'Brokerages', 'Integrations', 'Pricing'],
      ['Company', 'Live walkthrough', 'Sign in'],
      ['Help Center', 'Research', 'Status', 'Privacy', 'Terms'],
    ],
    control: 'Built for control',
    practices: ['Roles', 'Logs', 'Privacy'],
    rights: 'All rights reserved.',
  },
};

export type ChromeDict = typeof en;

const es: ChromeDict = {
  header: {
    product: {
      label: 'Producto',
      featured: {
        eyebrow: 'CONOCE A CHIPPI',
        title: 'Convierte más leads en visitas agendadas.',
        body: 'Chippi lee cada consulta, califica quién está listo, escribe la respuesta y agenda desde tu calendario.',
        cta: 'Conoce a Chippi',
      },
      items: [
        { label: 'Chippi', desc: 'El asistente de IA que convierte consultas en visitas' },
        { label: 'Para agentes', desc: 'Tu correo, leads y visitas, atendidos' },
        { label: 'Para inmobiliarias', desc: 'Un asistente de conversión en cada escritorio' },
        { label: 'Conexiones', desc: 'Conecta las herramientas que ya pagas' },
      ],
    },
    company: {
      label: 'Empresa',
      featured: {
        eyebrow: 'NUESTRA HISTORIA',
        title: 'El seguimiento no debe quitarte la relación.',
        body: 'Creamos un asistente que atiende cada lead mientras tú haces el trabajo humano.',
        cta: 'Lee nuestra historia',
      },
      items: [
        { label: 'Nuestra historia', desc: 'El problema que decidimos resolver' },
        { label: 'Centro de ayuda', desc: 'Guías para cada parte de Chippi' },
        { label: 'Investigación', desc: 'El trabajo que dio forma a cada función' },
        { label: 'Trabaja con nosotros', desc: 'Ayuda a construir el futuro inmobiliario' },
      ],
    },
    pricing: 'Precios',
    signIn: 'Iniciar sesión',
    start: 'Prueba gratis',
    startLong: 'Prueba 7 días gratis',
    demo: 'Ver una demo',
  },
  footer: {
    headings: ['Producto', 'Empresa', 'Recursos'],
    links: [
      ['Agentes', 'Inmobiliarias', 'Conexiones', 'Precios'],
      ['Empresa', 'Demo en vivo', 'Iniciar sesión'],
      ['Centro de ayuda', 'Investigación', 'Estado', 'Privacidad', 'Términos'],
    ],
    control: 'Creado para darte control',
    practices: ['Roles', 'Registros', 'Privacidad'],
    rights: 'Todos los derechos reservados.',
  },
};

const ru: ChromeDict = {
  header: {
    product: {
      label: 'Продукт',
      featured: {
        eyebrow: 'ЗНАКОМЬТЕСЬ, CHIPPI',
        title: 'Больше лидов превращаются в показы.',
        body: 'Chippi читает обращения, оценивает готовность, пишет ответ и назначает время по календарю.',
        cta: 'Познакомиться с Chippi',
      },
      items: [
        { label: 'Chippi', desc: 'ИИ-напарник, который превращает обращения в показы' },
        { label: 'Для агентов', desc: 'Почта, лиды и показы под контролем' },
        { label: 'Для агентств', desc: 'Помощник по лидам за каждым столом' },
        { label: 'Подключения', desc: 'Подключите привычные сервисы' },
      ],
    },
    company: {
      label: 'Компания',
      featured: {
        eyebrow: 'НАША ИСТОРИЯ',
        title: 'Погоня за лидом не должна мешать отношениям.',
        body: 'Мы создали напарника для работы с лидами, чтобы агент занимался людьми.',
        cta: 'Читать нашу историю',
      },
      items: [
        { label: 'Наша история', desc: 'Какую проблему мы решили' },
        { label: 'Центр помощи', desc: 'Инструкции по всем частям Chippi' },
        { label: 'Исследования', desc: 'Работа, на которой основаны функции' },
        { label: 'Вакансии', desc: 'Помогите строить будущее недвижимости' },
      ],
    },
    pricing: 'Цены',
    signIn: 'Войти',
    start: 'Начать бесплатно',
    startLong: '7 дней бесплатно',
    demo: 'Посмотреть демо',
  },
  footer: {
    headings: ['Продукт', 'Компания', 'Ресурсы'],
    links: [
      ['Агенты', 'Агентства', 'Подключения', 'Цены'],
      ['Компания', 'Живой показ', 'Войти'],
      ['Центр помощи', 'Исследования', 'Статус', 'Конфиденциальность', 'Условия'],
    ],
    control: 'Контроль в основе',
    practices: ['Роли', 'Журнал', 'Данные'],
    rights: 'Все права защищены.',
  },
};

export const CHROME_DICTS: Record<Lang, ChromeDict> = { en, es, ru };
