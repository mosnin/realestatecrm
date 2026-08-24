/** Primary supporting marketing pages. English is canonical. */

import type { Lang } from '../markets';

const en = {
  common: { seePlans: 'See all plans and credits' },
  agents: {
    metaTitle: 'For agents · Chippi',
    metaDescription:
      'Turn more real estate inquiries into booked tours without living in your inbox. Chippi reads, ranks, drafts, books, and keeps your CRM current.',
    hero: {
      label: 'For individual agents',
      headline: ['Turn more inquiries into booked tours.', 'Keep your day for clients.'],
      description:
        'Chippi reads every inquiry and ranks who is ready. It drafts in your voice, books from your calendar, and keeps the CRM current.',
      features: [
        { title: 'Never miss the first move', desc: 'Every new inquiry is read and a reply is prepared in your voice.' },
        { title: 'Call the right lead next', desc: 'Chippi ranks intent and shows the reasons behind each score.' },
        { title: 'End calendar ping pong', desc: 'Tours book from your real availability and update the deal.' },
      ],
      mockupAlt: 'The Chippi agent dashboard, with inbox, pipeline, and tours',
    },
    pricingHeadline: ['Simple pricing.', 'Built for one agent.'],
  },
  brokerages: {
    metaTitle: 'For brokerages · Chippi',
    metaDescription:
      'Convert more leads across the whole brokerage. Chippi routes each inquiry, prepares replies, books tours, and gives leaders a live action log.',
    hero: {
      label: 'Brokerage view',
      headline: ['Convert more leads', 'across the whole floor.'],
      description:
        'Give every agent a lead conversion teammate. Route each inquiry, keep the next move visible, and review every send from one workspace.',
      features: [
        { title: 'Route each lead on arrival', desc: 'Assign by territory and load. Keep the reason on the record.' },
        { title: 'See the chase across the floor', desc: 'View leads, drafts, follow ups, and deals by agent.' },
        { title: 'Control every send', desc: 'Set roles, choose approvals, and review the action log.' },
      ],
      mockupAlt: 'The Chippi brokerage dashboard with the live floor view',
    },
    pricingHeadline: ['Pricing that scales', 'with your floor.'],
  },
  chippi: {
    metaTitle: 'Meet Chippi',
    metaDescription:
      'Meet the AI lead conversion teammate for real estate. Chippi reads every inquiry, ranks intent, drafts replies, books tours, and keeps the CRM current.',
    hero: {
      label: 'Meet Chippi',
      headline: ['One teammate from', 'inquiry to booked tour.'],
      description:
        'Chippi works across your inbox, calendar, and CRM. It reads, ranks, drafts, books, and logs the next move. You decide what may send.',
      features: [
        { title: 'Reads every inquiry', desc: 'New leads arrive with their history and next move in context.' },
        { title: 'Drafts in your voice', desc: 'Send through your own connected inbox when you are ready.' },
        { title: 'Books the tour', desc: 'Times come from your real availability, not a separate calendar.' },
      ],
      mockupAlt: 'The Chippi workspace working a real estate lead',
    },
    pricingHeadline: ['One teammate.', 'From a desk to a floor.'],
  },
  integrations: {
    metaTitle: 'Integrations · Chippi',
    metaDescription:
      'Keep the tools you already use. Chippi works across your inbox, calendar, CRM, and messaging without a rip and replace.',
    hero: {
      label: 'Integrations',
      headline: ['Keep your stack.', 'Add the teammate.'],
      description:
        'Connect the apps you already pay for. Chippi reads the right context, completes the next move, and writes the result back where your team expects it.',
      features: [
        { title: 'Email and calendar', desc: 'Gmail, Outlook, Google Calendar, and Calendly.' },
        { title: 'Your CRM', desc: 'HubSpot, Salesforce, and Follow Up Boss, two way.' },
        { title: 'Messaging', desc: 'WhatsApp and Slack. Documents live on the deal.' },
      ],
    },
    pricingHeadline: ['Every plan includes', 'every integration.'],
  },
  company: {
    metaTitle: 'Our story · Chippi',
    metaDescription:
      'We built Chippi so real estate teams can work every lead without losing the human relationship that closes the deal.',
    heroEyebrow: 'Our story',
    heroHeadline: 'More leads should not mean less time with clients.',
    heroBody:
      'We built Chippi to work the chase between an inquiry and a booked tour. Agents keep the judgment, trust, and relationship that move the deal.',
    demo: 'See a demo',
    meet: 'Meet Chippi',
    gapEyebrow: 'The gap',
    gapHeadline: ['The leads kept coming.', 'The follow up did not keep up.'],
    gapBody: [
      'An agent’s day jumps between email, calendar, replies, follow ups, and deal updates. The selling happens in the moments that need judgment and trust.',
      'The coordination around those moments should not depend on memory. Chippi exists to read the inquiry, prepare the next move, book the tour, and leave a clear record.',
    ],
    beliefsEyebrow: 'What we believe',
    beliefsHeadline: 'A few things we will not move on.',
    beliefs: [
      {
        title: 'Configuration is failure to decide.',
        body: 'Settings, toggles, and customization layers are admissions the team could not pick. Picking is the work. We will not make your day harder so our spec was easier.',
      },
      {
        title: 'Your rules control every send.',
        body: 'You choose what Chippi may send automatically. Everything else waits for approval. Every action keeps an owner, a reason, and a receipt.',
      },
      {
        title: 'Chippi has one voice.',
        body: 'Wherever Chippi shows up, the same signature carries through. It is how you learn to trust the agent across every surface.',
      },
      {
        title: 'Proof before promises.',
        body: 'No made up returns. No invented time savings. We show the work, log the result, and let your own data make the case.',
      },
    ],
  },
  careers: {
    metaTitle: 'Careers · Chippi',
    metaDescription:
      'Help build the AI lead conversion teammate for real estate. We are a small team shipping close to customers, with a high bar for craft and trust.',
    heroEyebrow: 'Careers',
    heroHeadline: 'Help build the future of real estate.',
    heroBody:
      'We are a small team building the lead conversion teammate real estate has been missing. The surface is huge, the bar is high, and the work reaches customers fast.',
    contact: 'Get in touch',
    story: 'Our story',
    workEyebrow: 'How we work',
    workHeadline: 'A few things that shape every day.',
    principles: [
      {
        title: 'Taste is the spec.',
        body: 'We pick instead of shipping a settings page. Small team, strong opinions, decisions made and owned. The craft is the work, not the chrome around it.',
      },
      {
        title: 'Ship close to the user.',
        body: 'We sit with agents and brokers, watch the real day, and turn what we hear into product the same week. Short loops, real feedback, no theater.',
      },
      {
        title: 'Accountable by design.',
        body: 'We are building an agent people trust with their book. Every action has an owner, an outcome, and a receipt, and we hold that line in the code.',
      },
      {
        title: 'One voice everywhere.',
        body: 'An action card, a toast, or an activity row carries the same signature. Consistency and polish are how we build.',
      },
    ],
    openingsEyebrow: 'Open positions',
    openingsHeadline: 'No open roles right now.',
    openingsBeforeEmail: 'We are still happy to meet thoughtful builders. Email',
    openingsAfterEmail: 'and tell us what you would want to own.',
    closeHeadline: 'Do not see your role?',
    closeBody: 'We are always meeting great people. Tell us what you would want to build and the surface you would want to own.',
  },
  demo: {
    metaTitle: 'Book a live walkthrough · Chippi',
    metaDescription:
      'See Chippi move a real estate inquiry from first response to a booked tour, then map the same process to your team.',
    eyebrow: 'Live product walkthrough',
    headline: 'See one lead move from inquiry to booked tour.',
    body: 'Bring your lead process. We will show how Chippi reads, ranks, drafts, books, and logs each move. Then we will map the same flow to your agents and tools.',
    points: ['Read and rank an inquiry', 'Draft the reply in your voice', 'Book from the real calendar'],
  },
};

export type MarketingPagesDict = typeof en;

const es: MarketingPagesDict = {
  common: { seePlans: 'Ver todos los planes y créditos' },
  agents: {
    metaTitle: 'Para agentes · Chippi',
    metaDescription:
      'Convierte más consultas inmobiliarias en visitas agendadas sin vivir en tu correo. Chippi lee, califica, escribe, agenda y actualiza tu CRM.',
    hero: {
      label: 'Para agentes',
      headline: ['Convierte más consultas en visitas agendadas.', 'Guarda tu día para tus clientes.'],
      description:
        'Chippi lee cada consulta y muestra quién está listo. Escribe con tu voz, agenda desde tu calendario y mantiene el CRM al día.',
      features: [
        { title: 'No pierdas el primer contacto', desc: 'Cada consulta se lee y queda una respuesta lista con tu voz.' },
        { title: 'Llama primero al lead correcto', desc: 'Chippi ordena la intención y muestra la razón de cada calificación.' },
        { title: 'Termina con el ida y vuelta', desc: 'Las visitas se agendan con tu disponibilidad real y actualizan el negocio.' },
      ],
      mockupAlt: 'El panel de Chippi con correo, negocios y visitas',
    },
    pricingHeadline: ['Precios simples.', 'Pensados para un agente.'],
  },
  brokerages: {
    metaTitle: 'Para inmobiliarias · Chippi',
    metaDescription:
      'Convierte más leads en toda la inmobiliaria. Chippi asigna consultas, prepara respuestas, agenda visitas y muestra cada acción.',
    hero: {
      label: 'Para inmobiliarias',
      headline: ['Convierte más leads', 'en todo el equipo.'],
      description:
        'Dale a cada agente un asistente de conversión. Asigna cada consulta, muestra el próximo paso y revisa cada envío desde un solo lugar.',
      features: [
        { title: 'Asigna cada lead al llegar', desc: 'Distribuye por zona y carga. Guarda la razón en el registro.' },
        { title: 'Mira el seguimiento del equipo', desc: 'Ve leads, respuestas, seguimientos y negocios por agente.' },
        { title: 'Controla cada envío', desc: 'Define roles, aprobaciones y revisa el registro de acciones.' },
      ],
      mockupAlt: 'El panel de Chippi con la vista en vivo de la inmobiliaria',
    },
    pricingHeadline: ['Precios que crecen', 'con tu equipo.'],
  },
  chippi: {
    metaTitle: 'Conoce a Chippi',
    metaDescription:
      'Conoce al asistente de IA que convierte consultas inmobiliarias en visitas. Chippi lee, califica, escribe, agenda y actualiza el CRM.',
    hero: {
      label: 'Conoce a Chippi',
      headline: ['Un asistente desde', 'la consulta hasta la visita.'],
      description:
        'Chippi trabaja entre tu correo, calendario y CRM. Lee, califica, escribe, agenda y registra el próximo paso. Tú decides qué puede enviar.',
      features: [
        { title: 'Lee cada consulta', desc: 'Cada lead llega con su historial y su próximo paso en contexto.' },
        { title: 'Escribe con tu voz', desc: 'Envía desde tu propio correo conectado cuando estés listo.' },
        { title: 'Agenda la visita', desc: 'Los horarios salen de tu disponibilidad real, no de otro calendario.' },
      ],
      mockupAlt: 'El espacio de Chippi trabajando un lead inmobiliario',
    },
    pricingHeadline: ['Un asistente.', 'Para un agente o todo un equipo.'],
  },
  integrations: {
    metaTitle: 'Conexiones · Chippi',
    metaDescription:
      'Conserva las herramientas que ya usas. Chippi trabaja entre tu correo, calendario, CRM y mensajería sin reemplazarlos.',
    hero: {
      label: 'Conexiones',
      headline: ['Conserva tus herramientas.', 'Agrega el asistente.'],
      description:
        'Conecta las apps que ya pagas. Chippi lee el contexto correcto, completa el próximo paso y guarda el resultado donde tu equipo lo espera.',
      features: [
        { title: 'Correo y calendario', desc: 'Gmail, Outlook, Google Calendar y Calendly.' },
        { title: 'Tu CRM', desc: 'HubSpot, Salesforce y Follow Up Boss, en ambos sentidos.' },
        { title: 'Mensajería', desc: 'WhatsApp y Slack. Los documentos quedan en el negocio.' },
      ],
    },
    pricingHeadline: ['Todos los planes incluyen', 'todas las conexiones.'],
  },
  company: {
    metaTitle: 'Nuestra historia · Chippi',
    metaDescription:
      'Creamos Chippi para que los equipos inmobiliarios atiendan cada lead sin perder la relación humana que cierra el negocio.',
    heroEyebrow: 'Nuestra historia',
    heroHeadline: 'Más leads no deberían quitarte tiempo con tus clientes.',
    heroBody:
      'Creamos Chippi para hacer el seguimiento entre una consulta y una visita agendada. El agente conserva el criterio, la confianza y la relación que mueven el negocio.',
    demo: 'Ver una demo',
    meet: 'Conoce a Chippi',
    gapEyebrow: 'El problema',
    gapHeadline: ['Los leads siguieron llegando.', 'El seguimiento no alcanzó.'],
    gapBody: [
      'El día de un agente salta entre correo, calendario, respuestas, seguimientos y negocios. La venta sucede en los momentos que necesitan criterio y confianza.',
      'La coordinación alrededor de esos momentos no debería depender de la memoria. Chippi lee la consulta, prepara el próximo paso, agenda la visita y deja un registro claro.',
    ],
    beliefsEyebrow: 'Lo que creemos',
    beliefsHeadline: 'Hay cosas que no vamos a negociar.',
    beliefs: [
      {
        title: 'Configurar de más es no decidir.',
        body: 'Cada ajuste innecesario traslada una decisión al cliente. Elegir es nuestro trabajo. No haremos tu día más difícil para facilitar nuestra especificación.',
      },
      {
        title: 'Tus reglas controlan cada envío.',
        body: 'Tú eliges qué puede enviar Chippi. Lo demás espera aprobación. Cada acción conserva un responsable, una razón y un registro.',
      },
      {
        title: 'Chippi tiene una sola voz.',
        body: 'Donde aparezca Chippi, mantiene la misma firma. Así aprendes a confiar en el asistente en cada parte del producto.',
      },
      {
        title: 'Pruebas antes que promesas.',
        body: 'Sin retornos inventados ni ahorros de tiempo falsos. Mostramos el trabajo, registramos el resultado y dejamos que tus datos hagan el caso.',
      },
    ],
  },
  careers: {
    metaTitle: 'Trabaja con nosotros · Chippi',
    metaDescription:
      'Ayuda a crear el asistente de IA que convierte leads inmobiliarios. Somos un equipo pequeño, cercano al cliente y exigente con el oficio y la confianza.',
    heroEyebrow: 'Trabaja con nosotros',
    heroHeadline: 'Ayuda a construir el futuro inmobiliario.',
    heroBody:
      'Somos un equipo pequeño creando el asistente de conversión que le faltaba al sector inmobiliario. Hay mucho por construir, el nivel es alto y el trabajo llega rápido al cliente.',
    contact: 'Escríbenos',
    story: 'Nuestra historia',
    workEyebrow: 'Cómo trabajamos',
    workHeadline: 'Algunas cosas que guían cada día.',
    principles: [
      {
        title: 'El criterio es la especificación.',
        body: 'Elegimos en lugar de entregar otra página de ajustes. Equipo pequeño, opiniones claras y decisiones con responsable. El oficio es el trabajo.',
      },
      {
        title: 'Entrega cerca del cliente.',
        body: 'Nos sentamos con agentes y corredores, miramos el día real y convertimos lo aprendido en producto esa misma semana. Ciclos cortos y comentarios reales.',
      },
      {
        title: 'Responsable por diseño.',
        body: 'Creamos un asistente al que la gente confía sus leads. Cada acción tiene responsable, resultado y registro, y defendemos esa línea en el código.',
      },
      {
        title: 'Una voz en todas partes.',
        body: 'Una tarjeta, un aviso o una actividad mantienen la misma firma. La consistencia y el detalle son parte de cómo construimos.',
      },
    ],
    openingsEyebrow: 'Puestos abiertos',
    openingsHeadline: 'No hay puestos abiertos ahora.',
    openingsBeforeEmail: 'Aun así queremos conocer a personas que piensan bien. Escribe a',
    openingsAfterEmail: 'y cuéntanos qué te gustaría liderar.',
    closeHeadline: '¿No ves tu puesto?',
    closeBody: 'Siempre queremos conocer gente excelente. Cuéntanos qué te gustaría construir y qué parte te gustaría liderar.',
  },
  demo: {
    metaTitle: 'Agenda una demo en vivo · Chippi',
    metaDescription:
      'Mira cómo Chippi lleva una consulta inmobiliaria desde la primera respuesta hasta una visita agendada y aplica el proceso a tu equipo.',
    eyebrow: 'Demo del producto en vivo',
    headline: 'Mira un lead pasar de consulta a visita agendada.',
    body: 'Trae tu proceso de leads. Te mostraremos cómo Chippi lee, califica, escribe, agenda y registra cada paso. Después lo aplicaremos a tus agentes y herramientas.',
    points: ['Leer y calificar una consulta', 'Escribir la respuesta con tu voz', 'Agendar desde el calendario real'],
  },
};

const ru: MarketingPagesDict = {
  common: { seePlans: 'Посмотреть все планы и кредиты' },
  agents: {
    metaTitle: 'Для агентов · Chippi',
    metaDescription:
      'Больше обращений превращаются в показы без постоянной работы в почте. Chippi читает, оценивает, пишет, назначает и обновляет CRM.',
    hero: {
      label: 'Для агентов',
      headline: ['Превращайте больше обращений в показы.', 'Оставьте день для клиентов.'],
      description:
        'Chippi читает каждое обращение и показывает, кто готов. Пишет в вашем стиле, назначает по календарю и обновляет CRM.',
      features: [
        { title: 'Не упускайте первый контакт', desc: 'Каждое обращение прочитано, а ответ подготовлен в вашем стиле.' },
        { title: 'Сначала звоните нужному лиду', desc: 'Chippi оценивает намерение и объясняет каждую оценку.' },
        { title: 'Без переписки о времени', desc: 'Показы назначаются по вашему календарю и обновляют сделку.' },
      ],
      mockupAlt: 'Панель Chippi с входящими, сделками и показами',
    },
    pricingHeadline: ['Простые цены.', 'Для одного агента.'],
  },
  brokerages: {
    metaTitle: 'Для агентств · Chippi',
    metaDescription:
      'Больше лидов превращаются в показы во всём агентстве. Chippi распределяет обращения, готовит ответы, назначает показы и фиксирует действия.',
    hero: {
      label: 'Для агентств',
      headline: ['Превращайте больше лидов', 'во всей команде.'],
      description:
        'Дайте каждому агенту помощника по лидам. Распределяйте обращения, показывайте следующий шаг и проверяйте отправки в одном месте.',
      features: [
        { title: 'Распределение при поступлении', desc: 'Учитывает район и нагрузку. Причина остаётся в журнале.' },
        { title: 'Весь процесс команды', desc: 'Лиды, черновики, следующие касания и сделки по каждому агенту.' },
        { title: 'Контроль каждой отправки', desc: 'Роли, согласования и журнал действий в одном месте.' },
      ],
      mockupAlt: 'Панель Chippi с живым обзором агентства',
    },
    pricingHeadline: ['Цены растут', 'вместе с командой.'],
  },
  chippi: {
    metaTitle: 'Знакомьтесь, Chippi',
    metaDescription:
      'ИИ напарник по работе с лидами в недвижимости. Chippi читает обращения, оценивает намерение, пишет ответы, назначает показы и обновляет CRM.',
    hero: {
      label: 'Знакомьтесь, Chippi',
      headline: ['Один напарник от', 'обращения до показа.'],
      description:
        'Chippi работает между почтой, календарём и CRM. Читает, оценивает, пишет, назначает и фиксирует следующий шаг. Вы решаете, что можно отправить.',
      features: [
        { title: 'Читает каждое обращение', desc: 'Новый лид приходит с историей и следующим шагом.' },
        { title: 'Пишет в вашем стиле', desc: 'Отправляйте через подключённую почту, когда будете готовы.' },
        { title: 'Назначает показ', desc: 'Время берётся из вашего настоящего календаря.' },
      ],
      mockupAlt: 'Рабочее пространство Chippi с лидом по недвижимости',
    },
    pricingHeadline: ['Один напарник.', 'Для агента или всей команды.'],
  },
  integrations: {
    metaTitle: 'Интеграции · Chippi',
    metaDescription:
      'Оставьте привычные инструменты. Chippi работает между почтой, календарём, CRM и сообщениями без замены вашей системы.',
    hero: {
      label: 'Интеграции',
      headline: ['Оставьте свои инструменты.', 'Добавьте напарника.'],
      description:
        'Подключите приложения, за которые уже платите. Chippi получает нужный контекст, выполняет следующий шаг и сохраняет результат там, где его ждёт команда.',
      features: [
        { title: 'Почта и календарь', desc: 'Gmail, Outlook, Google Calendar и Calendly.' },
        { title: 'Ваша CRM', desc: 'HubSpot, Salesforce и Follow Up Boss с двусторонней синхронизацией.' },
        { title: 'Сообщения', desc: 'WhatsApp и Slack. Документы остаются в сделке.' },
      ],
    },
    pricingHeadline: ['В каждом плане есть', 'все интеграции.'],
  },
  company: {
    metaTitle: 'Наша история · Chippi',
    metaDescription:
      'Мы создали Chippi, чтобы команды в недвижимости обрабатывали каждый лид и сохраняли человеческие отношения, которые закрывают сделку.',
    heroEyebrow: 'Наша история',
    heroHeadline: 'Больше лидов не должно означать меньше времени с клиентами.',
    heroBody:
      'Chippi берёт на себя путь от обращения до назначенного показа. Агент сохраняет решения, доверие и отношения, которые двигают сделку.',
    demo: 'Посмотреть демо',
    meet: 'Знакомьтесь, Chippi',
    gapEyebrow: 'Проблема',
    gapHeadline: ['Лиды продолжали приходить.', 'На сопровождение не хватало времени.'],
    gapBody: [
      'День агента проходит между почтой, календарём, ответами, следующими касаниями и сделками. Продажа происходит там, где нужны решения и доверие.',
      'Координация этих моментов не должна зависеть от памяти. Chippi читает обращение, готовит следующий шаг, назначает показ и оставляет ясный журнал.',
    ],
    beliefsEyebrow: 'Во что мы верим',
    beliefsHeadline: 'Есть принципы, которыми мы не поступимся.',
    beliefs: [
      {
        title: 'Лишняя настройка означает отсутствие решения.',
        body: 'Каждый ненужный переключатель переносит решение на клиента. Выбирать должны мы. Мы не усложним ваш день ради более простой спецификации.',
      },
      {
        title: 'Ваши правила управляют отправкой.',
        body: 'Вы решаете, что Chippi может отправить. Остальное ждёт согласования. У каждого действия есть ответственный, причина и запись.',
      },
      {
        title: 'У Chippi один голос.',
        body: 'Где бы ни появился Chippi, он сохраняет одну и ту же подпись. Так возникает доверие к напарнику во всём продукте.',
      },
      {
        title: 'Доказательства раньше обещаний.',
        body: 'Никакой выдуманной отдачи и ложной экономии времени. Мы показываем работу, фиксируем результат и даём вашим данным говорить самим.',
      },
    ],
  },
  careers: {
    metaTitle: 'Работа в Chippi',
    metaDescription:
      'Помогите создать ИИ напарника по работе с лидами в недвижимости. Мы небольшая команда, близкая к клиентам и требовательная к качеству и доверию.',
    heroEyebrow: 'Работа в Chippi',
    heroHeadline: 'Помогите строить будущее недвижимости.',
    heroBody:
      'Мы небольшая команда и создаём напарника по лидам, которого не хватало рынку недвижимости. Масштаб большой, планка высокая, а работа быстро доходит до клиентов.',
    contact: 'Написать нам',
    story: 'Наша история',
    workEyebrow: 'Как мы работаем',
    workHeadline: 'Несколько принципов на каждый день.',
    principles: [
      {
        title: 'Вкус и есть спецификация.',
        body: 'Мы выбираем, а не выпускаем ещё одну страницу настроек. Небольшая команда, ясные мнения и ответственные за решения. Качество и есть работа.',
      },
      {
        title: 'Работа рядом с пользователем.',
        body: 'Мы сидим рядом с агентами и брокерами, наблюдаем реальный день и превращаем услышанное в продукт на той же неделе. Короткие циклы и честная обратная связь.',
      },
      {
        title: 'Ответственность по замыслу.',
        body: 'Мы создаём напарника, которому доверяют лиды. У каждого действия есть ответственный, результат и запись, и это закреплено в коде.',
      },
      {
        title: 'Один голос везде.',
        body: 'Карточка, уведомление и строка активности несут одну подпись. Последовательность и внимание к деталям входят в сам процесс разработки.',
      },
    ],
    openingsEyebrow: 'Открытые позиции',
    openingsHeadline: 'Сейчас открытых позиций нет.',
    openingsBeforeEmail: 'Но мы рады знакомству с сильными специалистами. Напишите на',
    openingsAfterEmail: 'и расскажите, за какую область хотите отвечать.',
    closeHeadline: 'Не нашли свою роль?',
    closeBody: 'Мы всегда рады знакомству с сильными людьми. Расскажите, что хотите построить и за какую область отвечать.',
  },
  demo: {
    metaTitle: 'Записаться на живое демо · Chippi',
    metaDescription:
      'Посмотрите, как Chippi ведёт обращение от первого ответа до назначенного показа, и примените тот же процесс к своей команде.',
    eyebrow: 'Живой показ продукта',
    headline: 'Посмотрите путь одного лида от обращения до показа.',
    body: 'Принесите свой процесс работы с лидами. Мы покажем, как Chippi читает, оценивает, пишет, назначает и фиксирует каждый шаг. Затем перенесём этот процесс на вашу команду и инструменты.',
    points: ['Прочитать и оценить обращение', 'Подготовить ответ в вашем стиле', 'Назначить по настоящему календарю'],
  },
};

export const MARKETING_PAGE_DICTS: Record<Lang, MarketingPagesDict> = { en, es, ru };
