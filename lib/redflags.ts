import type { Screened } from "./sanctions";
import type { LvProfile } from "./lvregister";

// Risk signs that do not need a list match: a "normal" businessman from Russia or Belarus, a director of a Russian company,
// an owner who is listed, a company set up after February 2022, trade through transit countries…
// Computed by rules (not by the model), so they are never missed; the AI report then explains them.

export type ExtractedParty = { name: string; kind?: "person" | "company"; role?: string; share?: string; nationality?: string; residence?: string; country?: string; birth_date?: string };
export type ExtractedLink = { person: string; company: string; company_country?: string; role?: string; share?: string; activity?: string };
export type Extracted = { parties: ExtractedParty[]; links: ExtractedLink[]; goods: string[]; trade_countries: string[]; partner_registered?: string };

export type Flag = { code: string; title: string; evidence: string; severity: "low" | "medium" | "high"; basis?: string };

const RU = /^(ru|rus|russia|russian federation|россия|российская федерация|рф|krievija)$/i;
const BY = /^(by|blr|belarus|беларусь|белоруссия|baltkrievija)$/i;
const EU = /^(lv|latvia|латвия|latvija|lt|lithuania|литва|ee|estonia|эстония|de|germany|германия|fi|finland|финляндия|pl|poland|польша|se|sweden|швеция|cy|cyprus|кипр|at|be|bg|hr|cz|dk|fr|gr|hu|ie|it|lu|mt|nl|pt|ro|sk|si|es|eu)$/i;
const TRANSIT = /(kazakhstan|казахстан|kyrgyz|киргиз|кыргыз|armenia|армени|georgia|грузи|uzbekistan|узбекистан|tajik|таджик|turkey|türkiye|турци|uae|emirates|оаэ|эмират|dubai|дубай|china|кита|hong kong|гонконг|serbia|серби|mongolia|монгол|azerbaijan|азербайджан)/i;

const isRu = (s?: string) => !!s && RU.test(s.trim());
const isBy = (s?: string) => !!s && BY.test(s.trim());
const isEu = (s?: string) => !!s && EU.test(s.trim());
const pct = (s?: string) => { const m = String(s || "").replace(",", ".").match(/(\d+(\.\d+)?)/); return m ? Number(m[1]) : NaN; };
const OWNER = /(owner|beneficial|ubo|plg|бенефициар|участник|владел|member|shareholder|parent|dalībn|share)/i;
const DIRECTOR = /(director|board|officer|valdes|правлен|директор|руковод|должност|ceo|manager)/i;

export function computeFlags(args: { reg: LvProfile | null; ex: Extracted | null; screened: Screened[]; partner: string }): Flag[] {
  const flags: Flag[] = [];
  const add = (f: Flag) => { if (!flags.some(x => x.code === f.code && x.evidence === f.evidence)) flags.push(f); };

  // 1. List matches, judged by who matched.
  for (const s of args.screened) {
    const strong = s.hits.filter(h => h.strength === "strong");
    const possible = s.hits.filter(h => h.strength === "possible");
    const xix = s.hits.find(h => h.list === "xix" && h.strength !== "weak");
    if (xix) add({ code: "annex_xix", severity: "high", title: "Организация из Приложения XIX (запрет любых сделок)", basis: "Рег. 833/2014, ст. 5aa",
      evidence: `${s.name} [${s.role}] ≈ ${xix.matched}. Запрет касается и компаний, которыми она владеет более чем на 50%.` });
    const listed = strong.filter(h => h.list !== "xix");
    if (listed.length) {
      const who = s.role === "партнёр" ? "Сам партнёр" : OWNER.test(s.role) ? "Владелец / бенефициар" : DIRECTOR.test(s.role) ? "Руководитель" : "Связанное лицо";
      add({ code: "listed", severity: "high", title: `${who} совпадает с санкционным списком`,
        basis: OWNER.test(s.role) ? "Рег. 269/2014 ст. 2; правило владения/контроля 50%" : "Рег. 269/2014 ст. 2 (запрет предоставлять средства прямо или косвенно)",
        evidence: `${s.name} [${s.role}] ≈ ${listed.map(h => `${h.matched} (${h.list.toUpperCase()}${h.details?.birth_date ? ", д.р. " + h.details.birth_date : ""})`).slice(0, 3).join("; ")}` });
    } else if (possible.length && !xix) {
      add({ code: "possible_match", severity: "medium", title: "Возможное совпадение со списком — нужно сверить данные", basis: "",
        evidence: `${s.name} [${s.role}] ≈ ${possible.map(h => `${h.matched} (${h.list.toUpperCase()})`).slice(0, 3).join("; ")}. Сверьте дату рождения, гражданство, рег. номер.` });
    }
  }

  // 2. People and companies from Russia / Belarus around the partner.
  const people: ExtractedParty[] = [...(args.ex?.parties || [])];
  if (args.reg) for (const u of args.reg.ubos) people.push({ name: u.name, kind: "person", role: "бенефициар (PLG)", nationality: u.details.nationality, residence: u.details.residence });
  for (const p of people) {
    const ru = isRu(p.nationality) || isRu(p.residence) || isRu(p.country), by = isBy(p.nationality) || isBy(p.residence) || isBy(p.country);
    if (!ru && !by) continue;
    const role = p.role || "";
    if (!OWNER.test(role) && !DIRECTOR.test(role) && !/partner|партн/i.test(role)) continue;
    const c = ru ? "России" : "Беларуси";
    add({ code: ru ? "ru_nexus" : "by_nexus", severity: "medium",
      title: `${p.kind === "company" ? "Компания" : "Человек"} из ${c} среди владельцев или руководства`,
      basis: ru ? "Рег. 833/2014 (ст. 5n, 8a, 12, 12g); оценка риска обхода санкций" : "Рег. 765/2006",
      evidence: `${p.name} [${role}${p.share ? ", " + p.share : ""}] — ${[p.nationality, p.residence, p.country].filter(Boolean).join(", ")}. В списках может не быть, но банк спросит о связях, источнике средств и деятельности в ${c}.` });
  }

  // 3. EU persons who run or control Russian companies (Andrej's rules R1, R2).
  const nat = new Map(people.map(p => [p.name.toLowerCase(), p.nationality || p.residence || p.country || ""]));
  for (const l of args.ex?.links || []) {
    if (!isRu(l.company_country) && !isBy(l.company_country)) continue;
    const n = nat.get(l.person.toLowerCase()) || "";
    const eu = isEu(n), unknown = !n;
    if (!eu && !unknown) continue;
    if (DIRECTOR.test(l.role || "")) add({ code: "eu_director_ru", severity: eu ? "high" : "medium", basis: "Рег. 833/2014, ст. 5n",
      title: eu ? "Гражданин/резидент ЕС — директор российской компании" : "Директор российской компании — проверить, не гражданин ли он ЕС",
      evidence: `${l.person} — ${l.role} в ${l.company}${l.activity ? " (" + l.activity + ")" : ""}. Директор оказывает компании управленческие и юридические услуги, это запрещено для лиц из ЕС.` });
    const share = pct(l.share);
    if (OWNER.test(l.role || "") && (share > 50 || /control|контрол/i.test(l.role || ""))) add({ code: "eu_controls_ru", severity: "medium", basis: "Рег. 833/2014, ст. 8a (best efforts)",
      title: eu ? "Лицо из ЕС контролирует российскую компанию" : "Контроль над российской компанией — проверить гражданство",
      evidence: `${l.person} — ${l.share || "контроль"} в ${l.company}${l.activity ? ", деятельность: " + l.activity : ""}. Нужно проверить, не подпадает ли деятельность под запреты Рег. 833/2014.` });
  }

  // 4. Company created after the full-scale invasion.
  const reg = args.reg?.company.registered || args.ex?.partner_registered || "";
  const recent = /^\d{4}$/.test(reg) ? Number(reg) >= 2022 : reg >= "2022-02-24";
  if (reg && recent) add({ code: "new_company", severity: "low", basis: "типичный признак схем обхода санкций",
    title: "Компания создана после 24.02.2022", evidence: `Дата регистрации: ${reg}. Новые компании чаще используют для обхода санкций — нужен понятный бизнес-профиль.` });

  // 5. Trade through typical transit countries.
  const transit = (args.ex?.trade_countries || []).filter(c => TRANSIT.test(c));
  if (transit.length) add({ code: "transit", severity: "medium", basis: "Рег. 833/2014, ст. 12, 12g; руководство ЕС по обходу санкций",
    title: "Торговля через страны, используемые для обхода санкций", evidence: `${transit.join(", ")}${args.ex?.goods.length ? ". Товары: " + args.ex.goods.slice(0, 5).join(", ") : ""}. Нужны данные о конечном получателе.` });

  // 6. Not enough data to say anything.
  if (!args.reg && !(args.ex?.parties || []).some(p => OWNER.test(p.role || ""))) add({ code: "no_owners", severity: "medium", basis: "",
    title: "Владельцы и бенефициары не известны", evidence: "Без данных о владельцах нельзя исключить контроль санкционного лица (правило 50%). Запросите выписку из реестра и сведения о бенефициарах." });

  const order = { high: 0, medium: 1, low: 2 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function maxSeverity(flags: Flag[]): "low" | "medium" | "high" | null {
  return flags.some(f => f.severity === "high") ? "high" : flags.some(f => f.severity === "medium") ? "medium" : flags.length ? "low" : null;
}
