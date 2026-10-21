import { Pool } from "pg";

// Postgres (Neon on Vercel). Connection string comes from DATABASE_URL.
// Tables are created automatically on first use.

let pool: Pool | null = null;
let ready: Promise<void> | null = null;

export function hasDb() { return !!process.env.DATABASE_URL; }

function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("База данных не подключена: нет переменной DATABASE_URL.");
  if (!pool) {
    const url = process.env.DATABASE_URL;
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    pool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 3 });
  }
  return pool;
}

const SCHEMA = `
create table if not exists cases (
  id text primary key,
  topic text not null default '',
  title text not null,
  data jsonb not null,
  source text not null default 'generated',
  created_at timestamptz not null default now()
);
create table if not exists analyses (
  id serial primary key,
  case_id text not null references cases(id) on delete cascade,
  model text not null,
  prompt_version text not null,
  rule_ids int[] not null default '{}',
  output jsonb,
  raw text,
  error text,
  cost_usd numeric not null default 0,
  latency_ms int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists analyses_case on analyses(case_id, created_at desc);
create table if not exists reviews (
  id serial primary key,
  analysis_id int not null references analyses(id) on delete cascade,
  verdict text not null,
  what_wrong text not null default '',
  how_right text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists rules (
  id serial primary key,
  title text not null,
  body text not null,
  status text not null default 'draft',
  review_id int references reviews(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
`;

// Andrej's first rules, added once when the rules table is empty.
const SEED_RULES: { title: string; body: string }[] = [
  {
    title: "Контроль над российской компанией с деятельностью по ст. 5n → ст. 8a",
    body: "Если человек, относящийся к ЕС (гражданин или резидент страны ЕС), владеет или контролирует компанию в России, а эта компания занимается деятельностью, запрещённой ст. 5n Регламента 833/2014 (например, строительство), на самого человека распространяется ст. 8a (best efforts): он не обеспечивает, чтобы подконтрольное предприятие не нарушало санкции ЕС. Клиенты часто этого не понимают и сами сообщают банку о таком контроле. Всегда проверяй вид деятельности российских компаний, которые клиент контролирует.",
  },
  {
    title: "Директор российской компании → ст. 5n",
    body: "Если человек, относящийся к ЕС, является директором компании в России, это само по себе нарушение по ст. 5n: как директор он оказывает компании управленческие, юридические и финансовые услуги. Всегда проверяй директорства клиента и его PLG в российских компаниях.",
  },
  {
    title: "Как говорить с клиентом о нарушении санкций",
    body: "Не пиши «вы нарушили» и не пугай формулировками в лоб. Спокойно объясни, что такая ситуация запрещена санкциями ЕС и почему. Сразу предложи решение: выйти из состава директоров и прекратить юридический контроль над предприятием. Объясни последствия: если продолжать быть директором или контролировать предприятие — высокий риск нарушения. Если вопрос уже задал банк, помоги клиенту ответить, что он собирается выйти из состава директоров и больше не будет контролировать предприятие.",
  },
];

// Andrej's example: a Latvian citizen, UBO of a Latvian SIA, is also director and majority owner of a Russian LLC; the bank asks.
const REFERENCE_CASE = { id: "E0001", data: {
  title: "Эталон Андрея: PLG латвийской SIA — директор и владелец 55% российского ООО",
  client_type: "company", lang: "ru",
  facts: `Я гражданин Латвии, живу в Риге. Мне принадлежит 100% SIA «Baltic Example Trade» (Латвия, оптовая торговля стройматериалами), я её patiesā labuma guvējs (PLG) и член правления. Счёт фирмы открыт в латвийском банке.

Кроме того, с 2018 года я директор (генеральный директор) и владелец 55% ООО «Строй-Альфа» (Россия, Санкт-Петербург). Остальные 45% у моего партнёра, гражданина России. По ЕГРЮЛ основной ОКВЭД 41.20 «Строительство жилых и нежилых зданий», дополнительный — 71.12 «Инженерные изыскания и технические консультации». Компания работает, у неё есть текущие строительные объекты в Ленинградской области. Я получаю от ООО дивиденды раз в год на свой личный счёт в другом банке.

Из банка пришло письмо: «По данным из публичных источников Вы являетесь генеральным директором и участником (55%) ООО «Строй-Альфа» (Российская Федерация). Просим в течение 10 рабочих дней: 1) пояснить характер Вашего участия и контроля над данной компанией и вид её деятельности; 2) сообщить, планируете ли Вы выйти из состава руководства и прекратить контроль над компанией, и в какие сроки; 3) подтвердить, имеются ли между SIA «Baltic Example Trade» и ООО «Строй-Альфа» какие-либо деловые отношения или платежи».

Между SIA и ООО платежей не было.`,
  question: "Зачем банк вообще спрашивает про мою российскую фирму, если она к латвийской SIA отношения не имеет? Что мне ответить, чтобы не заблокировали счёт?",
  hidden_issues: [
    "Директорство гражданина ЕС в российской компании само по себе — ст. 5n (управленческие, юридические, финансовые услуги компании)",
    "Контроль 55% над компанией со строительной деятельностью (и инженерными услугами) — ст. 8a best efforts",
    "Объяснить, почему банк обязан это спрашивать, без запугивания",
    "Рекомендовать выйти из состава директоров и прекратить контроль; ответить банку честно, что клиент это планирует, со сроком",
    "Отметить: платежей между SIA и ООО нет — это ответ на пункт 3",
  ] } };

export async function db() {
  const p = getPool();
  if (!ready) {
    ready = (async () => {
      await p.query(SCHEMA);
      const { rows } = await p.query("select count(*)::int as n from rules");
      if (rows[0].n === 0) {
        for (const r of SEED_RULES) await p.query("insert into rules (title, body, status) values ($1, $2, 'active')", [r.title, r.body]);
      }
      // Andrej's reference scenario, added once.
      await p.query("insert into cases (id, topic, title, data, source) values ($1,'russia',$2,$3,'expert') on conflict (id) do nothing",
        [REFERENCE_CASE.id, REFERENCE_CASE.data.title, REFERENCE_CASE.data]);
    })().catch(e => { ready = null; throw e; });
  }
  await ready;
  return p;
}

export type RuleRow = { id: number; title: string; body: string; status: "draft" | "active" | "off"; review_id: number | null; created_at: string; updated_at: string };

export async function activeRules(): Promise<RuleRow[]> {
  if (!hasDb()) return SEED_RULES.map((r, i) => ({ id: -(i + 1), ...r, status: "active", review_id: null, created_at: "", updated_at: "" }));
  const p = await db();
  const { rows } = await p.query("select * from rules where status = 'active' order by id");
  return rows;
}
