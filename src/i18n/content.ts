import type { Lang } from './config';

export interface Card {
  tag?: string;
  title: string;
  text: string;
}

export interface Meta {
  title: string;
  description: string;
}

export interface Dict {
  logo: string;
  brand: string;
  nav: {
    home: string;
    about: string;
    services: string;
    marketing: string;
    blog: string;
    contact: string;
  };
  getInTouch: string;
  langLabel: string;
  footer: { email: string; copyright: string };
  meta: {
    home: Meta;
    about: Meta;
    services: Meta;
    marketing: Meta;
    contact: Meta;
    blog: Meta;
  };
  home: {
    eyebrow: string;
    h1: string[];
    lead: string;
    secondaryBtn: string;
  };
  about: {
    eyebrow: string;
    h2: string;
    intro: string;
    cards: Card[];
  };
  services: {
    s1: { eyebrow: string; h2: string; intro: string; cards: Card[] };
    s2: { eyebrow: string; h2: string; intro: string; items: Card[] };
  };
  marketing: {
    eyebrow: string;
    h2: string;
    items: Card[];
  };
  contact: { h2: string; lead: string; cta: string };
  blog: { eyebrow: string; h2: string; empty: string; back: string };
}

const EMAIL = 'pablovolenski@gmail.com';

export const content: Record<Lang, Dict> = {
  de: {
    logo: 'unabhängige praxis',
    brand: 'Unabhängige Praxis',
    nav: {
      home: 'start',
      about: 'über mich',
      services: 'leistungen',
      marketing: 'marketing',
      blog: 'blog',
      contact: 'kontakt',
    },
    getInTouch: 'Kontakt aufnehmen',
    langLabel: 'Sprache',
    footer: { email: EMAIL, copyright: '© 2026' },
    meta: {
      home: {
        title: 'Unabhängige Praxis — Digitales Marketing & Web-Präsenz',
        description:
          'Ich führe eine unabhängige Praxis und baue Web-Präsenz, Marketing und Arbeits-Tools für Freelancer, Teams und Communitys — abseits der großen Tech-Konzerne.',
      },
      about: {
        title: 'Über mich — Unabhängige Praxis',
        description:
          'Meine Geschichte — die Jobs, Umwege und Lektionen, die zu dieser unabhängigen Praxis für digitales Marketing geführt haben.',
      },
      services: {
        title: 'Leistungen — Unabhängige Praxis',
        description:
          'Webdesign, WordPress-Umsetzungen, Wartung und Arbeits-Tools — Drives, Boards und Kollaborationsräume, die du wirklich kontrollierst.',
      },
      marketing: {
        title: 'Marketing — Unabhängige Praxis',
        description:
          'SEO, GEO, Landingpages und interaktive Gadgets, die dich auffindbar machen und den Klick lohnenswert.',
      },
      contact: {
        title: 'Kontakt — Unabhängige Praxis',
        description: 'Nimm Kontakt auf — erzähl mir, was du baust.',
      },
      blog: {
        title: 'Blog — Unabhängige Praxis',
        description:
          'Notizen zu Web-Präsenz, Marketing und dem Bau von Dingen, die deine bleiben.',
      },
    },
    home: {
      eyebrow: 'unabhängige praxis / gegründet jetzt',
      h1: ['MACH ES', 'UNVERWECHSELBAR', 'DEINS'],
      lead: 'Eine Ein-Personen-Praxis für digitales Marketing — Web-Präsenz, Marketing und Kollaborations-Tools für Freelancer, Teams und Communitys, die lieber besitzen als mieten.',
      secondaryBtn: 'Was ich mache →',
    },
    about: {
      eyebrow: '// über mich',
      h2: 'Meine Geschichte, kurz gefasst',
      intro:
        '[Schreib hier deine eigene Geschichte — die Jobs, Umwege und Lektionen, die zu dieser Praxis geführt haben. Bearbeite jede Karte unten direkt.]',
      cards: [
        { tag: 'kapitel eins', title: 'Wo alles begann', text: 'Ergänze den ersten Funken — wie du dazu gekommen bist.' },
        { tag: 'kapitel zwei', title: 'Ein Wendepunkt', text: 'Ergänze den Moment, der deinen Ansatz geprägt hat.' },
        { tag: 'kapitel drei', title: 'Was ich gelernt habe', text: 'Ergänze die Erfahrung, die dir gezeigt hat, was funktioniert.' },
        { tag: 'kapitel vier', title: 'Heute', text: 'Ergänze, warum du das heute machst, für wen und wie.' },
      ],
    },
    services: {
      s1: {
        eyebrow: '// leistungen',
        h2: 'Webdesign, gemeinsam mit dir',
        intro:
          'Ich bin mehr als jemand, der dir eine Seite baut, und ich bin nicht Google oder Meta. Was ich mache, mache ich speziell für dich — ich bringe dir bei, es selbst zu betreiben, oder betreibe es für dich, ganz wie du willst.',
        cards: [
          { tag: 'ab €200', title: 'Rohe Website', text: 'Sauber, schnell, einfach. Kein Ballast, keine Abos — einfach eine Seite, die funktioniert.' },
          { tag: 'ab €400', title: 'WordPress-Website', text: 'Dieselbe Einfachheit, plus ein echtes Backend — Blog, Forum, Magazin oder News-Feed, den du selbst bearbeiten kannst.' },
          { title: 'Basis-Wartung', text: 'Wöchentliche Backups. Ruhe im Kopf, nicht mehr und nicht weniger.' },
          { title: 'Erweiterte Wartung', text: 'Backups, Sicherheitschecks, Updates und monatliche Inhaltspflege — ich halte es am Laufen, damit du es nicht musst.' },
        ],
      },
      s2: {
        eyebrow: '// arbeits-tools',
        h2: 'Deine Drives, Boards & Räume — bleiben deine',
        intro:
          'Gemeinsame Drives, Planungs-Boards, ein privater Raum für dein Team oder deine Community — aufgesetzt auf Infrastruktur, die du wirklich kontrollierst, damit niemand dir über Nacht Preis oder Regeln ändern kann.',
        items: [
          { title: 'Gemeinsame Drives', text: 'Team-Dateien, organisiert — gehostet auf Infrastruktur, die dir gehört, nicht auf einem gemieteten Konto.' },
          { title: 'Online-Boards', text: 'Planungs- und Community-Boards, eingerichtet so, wie deine Gruppe wirklich arbeitet.' },
          { title: 'Kollaborationsräume', text: 'Ein privater Hub für ein Team, einen Verein oder ein Kollektiv — Dokumente, Chat und Ressourcen an einem Ort.' },
        ],
      },
    },
    marketing: {
      eyebrow: '// marketing',
      h2: 'Gefunden werden — und den Klick wert sein',
      items: [
        { title: 'SEO / GEO', text: 'Text und Struktur, geprüft darauf, wie Menschen suchen — und wie KI antwortet. Ich bringe dir den Prozess bei, automatisiere die repetitiven Teile oder übernehme ihn für dich.' },
        { title: 'Landingpages', text: 'Einen Code scannen, einen Link klicken, irgendwo landen, das zum Konvertieren gebaut ist — für eine Kampagne oder als dauerhaftes Asset.' },
        { title: 'Gadgets & Artefakte', text: 'Quizze, Spiele, Drag-and-Drop-Tools — kleine interaktive Stücke, die Aufmerksamkeit verdienen, statt sie nur zu halten.' },
      ],
    },
    contact: {
      h2: 'Erzähl mir, was du baust.',
      lead: 'Kein Formular, kein Gatekeeping — schreib mir direkt und ich melde mich persönlich bei dir.',
      cta: 'Kontakt aufnehmen',
    },
    blog: {
      eyebrow: '// blog',
      h2: 'Notizen & Aufzeichnungen',
      empty: 'Noch keine Beiträge — schau bald wieder vorbei.',
      back: '← zurück zum Blog',
    },
  },

  en: {
    logo: 'independent practice',
    brand: 'Independent Practice',
    nav: {
      home: 'home',
      about: 'about',
      services: 'services',
      marketing: 'marketing',
      blog: 'blog',
      contact: 'contact',
    },
    getInTouch: 'Get in touch',
    langLabel: 'Language',
    footer: { email: EMAIL, copyright: '© 2026' },
    meta: {
      home: {
        title: 'Independent Practice — Digital Marketing & Web Presence',
        description:
          'I run an independent practice building web presence, marketing and work tools for freelancers, teams and communities — outside big tech.',
      },
      about: {
        title: 'About — Independent Practice',
        description:
          'My story — the jobs, detours and lessons that led to this independent digital marketing practice.',
      },
      services: {
        title: 'Services — Independent Practice',
        description:
          'Web design, WordPress builds, maintenance and work tools — drives, boards and collaboration spaces you actually control.',
      },
      marketing: {
        title: 'Marketing — Independent Practice',
        description:
          'SEO, GEO, landing pages, and interactive gadgets that get you found and make it worth the click.',
      },
      contact: {
        title: 'Contact — Independent Practice',
        description: "Get in touch — tell me what you're building.",
      },
      blog: {
        title: 'Blog — Independent Practice',
        description:
          'Notes on web presence, marketing and building things that stay yours.',
      },
    },
    home: {
      eyebrow: 'independent practice / est. now',
      h1: ['MAKE IT', 'UNMISTAKABLY', 'YOURS'],
      lead: "A one-person digital marketing practice — web presence, marketing and collaboration tools for freelancers, teams and communities who'd rather own it than rent it.",
      secondaryBtn: 'What I do →',
    },
    about: {
      eyebrow: '// about',
      h2: 'My story, briefly',
      intro:
        '[Write your own story here — the jobs, detours and lessons that led to this practice. Edit each card below directly.]',
      cards: [
        { tag: 'chapter one', title: 'Where it started', text: 'Add the first spark — how you got into this.' },
        { tag: 'chapter two', title: 'A turning point', text: 'Add the moment that shaped your approach.' },
        { tag: 'chapter three', title: 'What I learned', text: 'Add the experience that taught you what works.' },
        { tag: 'chapter four', title: 'Today', text: 'Add why you do this now, for who, and how.' },
      ],
    },
    services: {
      s1: {
        eyebrow: '// services',
        h2: 'Web design, done with you',
        intro:
          "I'm more than someone who builds you a page, and I'm not Google or Meta. Whatever I make, I make for you specifically — I'll teach you to run it, or keep running it for you, your call.",
        cards: [
          { tag: 'from €200', title: 'Raw site', text: 'Clean, fast, simple. No bloat, no subscriptions — just a site that works.' },
          { tag: 'from €400', title: 'WordPress site', text: 'Same simplicity, plus a real backend — blog, forum, magazine or news feed you can edit yourself.' },
          { title: 'Basic maintenance', text: 'Weekly backups. Peace of mind, nothing more, nothing less.' },
          { title: 'Advanced maintenance', text: "Backups, security checks, updates and monthly content edits — I keep it running so you don't have to." },
        ],
      },
      s2: {
        eyebrow: '// work tools',
        h2: 'Your drives, boards & spaces — kept yours',
        intro:
          'Shared drives, planning boards, a private space for your team or community — set up on infrastructure you actually control, so nobody can change the price or the rules on you overnight.',
        items: [
          { title: 'Shared drives', text: 'Team files, organized — hosted on infrastructure you own, not a rented account.' },
          { title: 'Online boards', text: 'Planning and community boards set up to match how your group actually works.' },
          { title: 'Collaboration spaces', text: 'A private hub for a team, club or collective — docs, chat and resources in one place.' },
        ],
      },
    },
    marketing: {
      eyebrow: '// marketing',
      h2: 'Getting found, and making it worth the click',
      items: [
        { title: 'SEO / GEO', text: "Writing and structure reviewed for how people search — and how AI answers. I'll teach you the process, automate the repetitive parts, or run it for you." },
        { title: 'Landing pages', text: 'Scan a code, click a link, land somewhere built to convert — for one campaign, or as a permanent asset.' },
        { title: 'Gadgets & artifacts', text: 'Quizzes, games, drag-and-drop tools — small interactive pieces that earn attention instead of just holding it.' },
      ],
    },
    contact: {
      h2: "Tell me what you're building.",
      lead: "No form, no gatekeeping — write to me directly and I'll get back to you myself.",
      cta: 'Get in touch',
    },
    blog: {
      eyebrow: '// blog',
      h2: 'Notes & write-ups',
      empty: 'No posts yet — check back soon.',
      back: '← back to blog',
    },
  },

  es: {
    logo: 'práctica independiente',
    brand: 'Práctica Independiente',
    nav: {
      home: 'inicio',
      about: 'sobre mí',
      services: 'servicios',
      marketing: 'marketing',
      blog: 'blog',
      contact: 'contacto',
    },
    getInTouch: 'Ponte en contacto',
    langLabel: 'Idioma',
    footer: { email: EMAIL, copyright: '© 2026' },
    meta: {
      home: {
        title: 'Práctica Independiente — Marketing Digital y Presencia Web',
        description:
          'Llevo una práctica independiente creando presencia web, marketing y herramientas de trabajo para autónomos, equipos y comunidades — fuera de las grandes tecnológicas.',
      },
      about: {
        title: 'Sobre mí — Práctica Independiente',
        description:
          'Mi historia — los trabajos, desvíos y lecciones que llevaron a esta práctica independiente de marketing digital.',
      },
      services: {
        title: 'Servicios — Práctica Independiente',
        description:
          'Diseño web, desarrollos WordPress, mantenimiento y herramientas de trabajo — drives, tableros y espacios de colaboración que realmente controlas.',
      },
      marketing: {
        title: 'Marketing — Práctica Independiente',
        description:
          'SEO, GEO, páginas de aterrizaje y gadgets interactivos que te hacen visible y hacen que valga la pena el clic.',
      },
      contact: {
        title: 'Contacto — Práctica Independiente',
        description: 'Ponte en contacto — cuéntame qué estás construyendo.',
      },
      blog: {
        title: 'Blog — Práctica Independiente',
        description:
          'Notas sobre presencia web, marketing y construir cosas que siguen siendo tuyas.',
      },
    },
    home: {
      eyebrow: 'práctica independiente / desde ahora',
      h1: ['HAZLO', 'INCONFUNDIBLEMENTE', 'TUYO'],
      lead: 'Una práctica de marketing digital de una sola persona — presencia web, marketing y herramientas de colaboración para autónomos, equipos y comunidades que prefieren poseer en vez de alquilar.',
      secondaryBtn: 'Qué hago →',
    },
    about: {
      eyebrow: '// sobre mí',
      h2: 'Mi historia, en breve',
      intro:
        '[Escribe aquí tu propia historia — los trabajos, desvíos y lecciones que te llevaron a esta práctica. Edita cada tarjeta abajo directamente.]',
      cards: [
        { tag: 'capítulo uno', title: 'Dónde empezó', text: 'Añade la primera chispa — cómo llegaste a esto.' },
        { tag: 'capítulo dos', title: 'Un punto de inflexión', text: 'Añade el momento que moldeó tu enfoque.' },
        { tag: 'capítulo tres', title: 'Lo que aprendí', text: 'Añade la experiencia que te enseñó lo que funciona.' },
        { tag: 'capítulo cuatro', title: 'Hoy', text: 'Añade por qué haces esto ahora, para quién y cómo.' },
      ],
    },
    services: {
      s1: {
        eyebrow: '// servicios',
        h2: 'Diseño web, hecho contigo',
        intro:
          'Soy más que alguien que te construye una página, y no soy Google ni Meta. Lo que hago, lo hago para ti específicamente — te enseño a gestionarlo, o lo gestiono por ti, tú decides.',
        cards: [
          { tag: 'desde €200', title: 'Sitio esencial', text: 'Limpio, rápido, sencillo. Sin excesos, sin suscripciones — solo un sitio que funciona.' },
          { tag: 'desde €400', title: 'Sitio WordPress', text: 'La misma sencillez, más un backend de verdad — blog, foro, revista o feed de noticias que puedes editar tú mismo.' },
          { title: 'Mantenimiento básico', text: 'Copias de seguridad semanales. Tranquilidad, ni más ni menos.' },
          { title: 'Mantenimiento avanzado', text: 'Copias, revisiones de seguridad, actualizaciones y ediciones de contenido mensuales — lo mantengo funcionando para que tú no tengas que hacerlo.' },
        ],
      },
      s2: {
        eyebrow: '// herramientas de trabajo',
        h2: 'Tus drives, tableros y espacios — siguen siendo tuyos',
        intro:
          'Drives compartidos, tableros de planificación, un espacio privado para tu equipo o comunidad — montados sobre infraestructura que realmente controlas, para que nadie pueda cambiarte el precio o las reglas de la noche a la mañana.',
        items: [
          { title: 'Drives compartidos', text: 'Archivos del equipo, organizados — alojados en infraestructura tuya, no en una cuenta alquilada.' },
          { title: 'Tableros online', text: 'Tableros de planificación y comunidad configurados según cómo trabaja realmente tu grupo.' },
          { title: 'Espacios de colaboración', text: 'Un centro privado para un equipo, club o colectivo — documentos, chat y recursos en un solo lugar.' },
        ],
      },
    },
    marketing: {
      eyebrow: '// marketing',
      h2: 'Que te encuentren, y que valga la pena el clic',
      items: [
        { title: 'SEO / GEO', text: 'Texto y estructura revisados para cómo busca la gente — y cómo responde la IA. Te enseño el proceso, automatizo las partes repetitivas o lo llevo por ti.' },
        { title: 'Páginas de aterrizaje', text: 'Escanea un código, haz clic en un enlace, llega a un lugar construido para convertir — para una campaña o como activo permanente.' },
        { title: 'Gadgets y artefactos', text: 'Cuestionarios, juegos, herramientas de arrastrar y soltar — pequeñas piezas interactivas que se ganan la atención en vez de solo retenerla.' },
      ],
    },
    contact: {
      h2: 'Cuéntame qué estás construyendo.',
      lead: 'Sin formularios, sin barreras — escríbeme directamente y te responderé yo mismo.',
      cta: 'Ponte en contacto',
    },
    blog: {
      eyebrow: '// blog',
      h2: 'Notas y artículos',
      empty: 'Aún no hay entradas — vuelve pronto.',
      back: '← volver al blog',
    },
  },
};
