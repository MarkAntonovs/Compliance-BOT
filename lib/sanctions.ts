import { readFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import { db } from "./db";
import { normName, coverage } from "./names";
import { why } from "./lvregister";
import { annexXix } from "./annex";

// Official sanctions lists, downloaded straight from the publishers and kept in Postgres.
// Refreshed daily by Vercel cron (vercel.json) and by the button on the "Партнёр" page.

export type ListId = "eu" | "un" | "ofac" | "uk" | "xix";
export const LISTS: { id: ListId; label: string; url: string; extra?: string; info: string }[] = [
  { id: "eu", label: "ЕС — консолидированный список (FSF)", info: "https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions",
    url: process.env.SANCTIONS_EU_URL || "https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw" },
  { id: "un", label: "ООН — сводный список СБ", info: "https://www.un.org/securitycouncil/content/un-sc-consolidated-list",
    url: process.env.SANCTIONS_UN_URL || "https://scsanctions.un.org/resources/xml/en/consolidated.xml" },
  { id: "ofac", label: "США — OFAC SDN", info: "https://sanctionslist.ofac.treas.gov/Home/SdnList",
    url: process.env.SANCTIONS_OFAC_URL || "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV",
    extra: process.env.SANCTIONS_OFAC_ALT_URL || "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV" },
  { id: "uk", label: "Великобритания — UK Sanctions List", info: "https://www.gov.uk/government/publications/the-uk-sanctions-list",
    url: process.env.SANCTIONS_UK_URL || "https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv" },
  { id: "xix", label: "ЕС — Рег. 833/2014, Приложение XIX (запрет сделок, ст. 5aa)", info: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014R0833", url: "" },
];

export type Entry = { ref: string; kind: "person" | "entity" | "vessel" | "other"; name: string; names: string[]; programme: string; details: Record<string, string> };

// ---------- download ----------

async function getText(url: string): Promise<string> {
  if (url.startsWith("/")) return readFile(url, "utf8"); // local file, for testing
  let res: Response;
  try { res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; compliance-bot/1.0)" }, signal: AbortSignal.timeout(150_000) }); }
  catch (e) { throw new Error(`${url.split("?")[0]} недоступен: ${why(e)}`); }
  if (!res.ok) throw new Error(`${url.split("?")[0]} ответил ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return new TextDecoder("utf-8").decode(buf);
}

// ---------- CSV ----------

export function parseCsv(text: string, delim = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") { q = true; cell = ""; }
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const clean = (s?: string) => (s || "").replace(/\s+/g, " ").trim();
const nn = (s?: string) => { const v = clean(s); return v === "-0-" ? "" : v; };
const uniq = (a: string[]) => [...new Set(a.map(clean).filter(Boolean))];
const short = (s: string, n = 400) => (s.length > n ? s.slice(0, n) + "…" : s);

// ---------- parsers ----------

function parseEu(text: string): Entry[] {
  const rows = parseCsv(text, ";");
  const h = rows[0]; const ix = (k: string) => h.indexOf(k);
  const I = { id: ix("Entity_LogicalId"), ref: ix("Entity_EU_ReferenceNumber"), kind: ix("Entity_SubjectType_ClassificationCode"), prog: ix("Entity_Regulation_Programme"),
    whole: ix("NameAlias_WholeName"), fn: ix("NameAlias_Function"), remark: ix("Entity_Remark"), des: ix("Entity_DesignationDate"), url: ix("Entity_Regulation_PublicationUrl"),
    dob: ix("BirthDate_BirthDate"), cit: ix("Citizenship_CountryDescription"), gender: ix("NameAlias_Gender"), unid: ix("Entity_UnitedNationId") };
  if (I.id < 0 || I.whole < 0) throw new Error("ЕС: не нашёл нужные колонки — формат файла изменился.");
  const map = new Map<string, { e: Entry; prog: Set<string>; dob: Set<string>; cit: Set<string> }>();
  for (const r of rows.slice(1)) {
    const id = clean(r[I.id]); if (!id) continue;
    let x = map.get(id);
    if (!x) {
      const k = clean(r[I.kind]);
      x = { e: { ref: id, kind: k === "person" ? "person" : k === "enterprise" ? "entity" : "other", name: "", names: [], programme: "", details: {} }, prog: new Set(), dob: new Set(), cit: new Set() };
      const d = x.e.details;
      if (r[I.ref]) d.eu_ref = clean(r[I.ref]);
      if (r[I.des]) d.designated = clean(r[I.des]);
      if (r[I.remark]) d.remark = short(clean(r[I.remark]));
      if (r[I.url]) d.regulation_url = clean(r[I.url]);
      if (r[I.unid]) d.un_id = clean(r[I.unid]);
      map.set(id, x);
    }
    const nm = clean(r[I.whole]); if (nm && !x.e.names.includes(nm)) x.e.names.push(nm);
    if (nm && !x.e.name) x.e.name = nm;
    if (r[I.fn] && !x.e.details.function) x.e.details.function = short(clean(r[I.fn]));
    if (r[I.prog]) x.prog.add(clean(r[I.prog]));
    if (r[I.dob]) x.dob.add(clean(r[I.dob]));
    if (r[I.cit]) x.cit.add(clean(r[I.cit]));
  }
  return [...map.values()].filter(x => x.e.names.length).map(x => {
    x.e.programme = [...x.prog].join(", ");
    if (x.dob.size) x.e.details.birth_date = [...x.dob].join(", ");
    if (x.cit.size) x.e.details.citizenship = [...x.cit].join(", ");
    return x.e;
  });
}

function parseUn(text: string): Entry[] {
  const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false, isArray: (n) => ["INDIVIDUAL", "ENTITY", "INDIVIDUAL_ALIAS", "ENTITY_ALIAS", "VALUE", "INDIVIDUAL_DATE_OF_BIRTH"].includes(n) }).parse(text);
  const root = xml.CONSOLIDATED_LIST;
  if (!root) throw new Error("ООН: неожиданный формат XML.");
  const s = (v: unknown) => (typeof v === "string" ? clean(v) : typeof v === "number" ? String(v) : "");
  const out: Entry[] = [];
  const add = (x: Record<string, unknown>, kind: Entry["kind"], aliasKey: string) => {
    const main = clean([x.FIRST_NAME, x.SECOND_NAME, x.THIRD_NAME, x.FOURTH_NAME].map(s).join(" "));
    const aliases = ((x[aliasKey] as Record<string, unknown>[]) || []).map(a => s(a.ALIAS_NAME));
    const names = uniq([main, s(x.NAME_ORIGINAL_SCRIPT), ...aliases]);
    if (!names.length) return;
    const d: Record<string, string> = {};
    const nat = ((x.NATIONALITY as { VALUE?: unknown[] })?.VALUE || []).map(s).filter(Boolean);
    if (nat.length) d.nationality = nat.join(", ");
    const dob = ((x.INDIVIDUAL_DATE_OF_BIRTH as Record<string, unknown>[]) || []).map(b => s(b.DATE) || s(b.YEAR)).filter(Boolean);
    if (dob.length) d.birth_date = dob.join(", ");
    if (s(x.LISTED_ON)) d.designated = s(x.LISTED_ON);
    if (s(x.COMMENTS1)) d.remark = short(s(x.COMMENTS1));
    out.push({ ref: s(x.REFERENCE_NUMBER) || s(x.DATAID), kind, name: main || names[0], names, programme: s(x.UN_LIST_TYPE), details: d });
  };
  for (const x of (root.INDIVIDUALS?.INDIVIDUAL || [])) add(x, "person", "INDIVIDUAL_ALIAS");
  for (const x of (root.ENTITIES?.ENTITY || [])) add(x, "entity", "ENTITY_ALIAS");
  return out;
}

function parseOfac(sdn: string, alt: string): Entry[] {
  const map = new Map<string, Entry>();
  for (const r of parseCsv(sdn)) {
    const id = clean(r[0]); const name = nn(r[1]); if (!id || !name || !/^\d+$/.test(id)) continue;
    const t = nn(r[2]).toLowerCase();
    const d: Record<string, string> = {};
    if (nn(r[4])) d.title = nn(r[4]);
    if (nn(r[11])) d.remark = short(nn(r[11]));
    map.set(id, { ref: id, kind: t === "individual" ? "person" : t === "vessel" || t === "aircraft" ? "vessel" : t ? "other" : "entity", name, names: [name], programme: nn(r[3]), details: d });
  }
  for (const r of parseCsv(alt)) {
    const e = map.get(clean(r[0])); const nm = nn(r[3]);
    if (e && nm && !e.names.includes(nm)) e.names.push(nm);
  }
  return [...map.values()];
}

function parseUk(text: string): Entry[] {
  const rows = parseCsv(text);
  const hi = rows.findIndex(r => r.some(c => clean(c) === "Unique ID"));
  if (hi < 0) throw new Error("Великобритания: не нашёл заголовок «Unique ID» — формат файла изменился.");
  const h = rows[hi].map(clean); const ix = (k: string) => h.indexOf(k);
  const nameIx = ["Name 1", "Name 2", "Name 3", "Name 4", "Name 5", "Name 6"].map(ix);
  const I = { id: ix("Unique ID"), nonlat: ix("Name non-latin script"), regime: ix("Regime Name"), type: ix("Individual, Entity, Ship"), dob: ix("D.O.B"),
    nat: ix("Nationality(/ies)"), des: ix("Date Designated"), other: ix("Other Information"), pos: ix("Position"), reg: ix("Business registration number (s)") };
  const map = new Map<string, Entry>();
  for (const r of rows.slice(hi + 1)) {
    const id = clean(r[I.id]); if (!id) continue;
    let e = map.get(id);
    if (!e) {
      const t = clean(r[I.type]).toLowerCase();
      e = { ref: id, kind: t.startsWith("indiv") ? "person" : t.startsWith("entity") ? "entity" : t.startsWith("ship") ? "vessel" : "other", name: "", names: [], programme: clean(r[I.regime]), details: {} };
      const d = e.details;
      for (const [k, i] of [["birth_date", I.dob], ["nationality", I.nat], ["designated", I.des], ["position", I.pos], ["registration_number", I.reg]] as const) if (i >= 0 && clean(r[i])) d[k] = short(clean(r[i]), 200);
      if (I.other >= 0 && clean(r[I.other])) d.remark = short(clean(r[I.other]));
      map.set(id, e);
    }
    const nm = clean(nameIx.filter(i => i >= 0).map(i => r[i] || "").join(" "));
    for (const n of [nm, I.nonlat >= 0 ? clean(r[I.nonlat]) : ""]) if (n && !e.names.includes(n)) e.names.push(n);
    if (nm && !e.name) e.name = nm;
  }
  return [...map.values()].filter(e => e.names.length).map(e => ({ ...e, name: e.name || e.names[0] }));
}

export async function downloadList(id: ListId): Promise<Entry[]> {
  const l = LISTS.find(x => x.id === id);
  if (!l) throw new Error("Неизвестный список " + id);
  if (id === "xix") return annexXix();
  if (id === "eu") return parseEu(await getText(l.url));
  if (id === "un") return parseUn(await getText(l.url));
  if (id === "ofac") { const [a, b] = await Promise.all([getText(l.url), getText(l.extra!)]); return parseOfac(a, b); }
  return parseUk(await getText(l.url));
}

// ---------- storage ----------

export async function refreshList(id: ListId) {
  const p = await db();
  const l = LISTS.find(x => x.id === id)!;
  const t0 = Date.now();
  let entries: Entry[];
  try {
    entries = await downloadList(id);
    if (entries.length < (id === "xix" ? 5 : 50)) throw new Error(`подозрительно мало записей (${entries.length}) — список не заменён`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await p.query(`insert into sanction_lists (id, label, source_url, error, checked_at) values ($1,$2,$3,$4,now())
      on conflict (id) do update set error = $4, checked_at = now()`, [id, l.label, l.info, msg]);
    throw new Error(`${l.label}: ${msg}`);
  }
  const c = await p.connect();
  let names = 0;
  try {
    await c.query("begin");
    await c.query("delete from sanction_names where list = $1", [id]);
    await c.query("delete from sanction_entries where list = $1", [id]);
    const CH = 2000;
    for (let i = 0; i < entries.length; i += CH) {
      const part = entries.slice(i, i + CH);
      await c.query(`insert into sanction_entries (list, ref, kind, name, programme, details)
        select $1, * from unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::jsonb[]) on conflict do nothing`,
        [id, part.map(e => e.ref), part.map(e => e.kind), part.map(e => e.name), part.map(e => e.programme), part.map(e => JSON.stringify(e.details))]);
      const refs: string[] = [], nms: string[] = [], norms: string[] = [];
      for (const e of part) for (const n of e.names) { const k = normName(n); if (k) { refs.push(e.ref); nms.push(n); norms.push(k); } }
      await c.query(`insert into sanction_names (list, ref, name, norm) select $1, * from unnest($2::text[], $3::text[], $4::text[])`, [id, refs, nms, norms]);
      names += refs.length;
    }
    await c.query(`insert into sanction_lists (id, label, source_url, updated_at, entries, names, error, checked_at) values ($1,$2,$3,now(),$4,$5,null,now())
      on conflict (id) do update set label = $2, source_url = $3, updated_at = now(), entries = $4, names = $5, error = null, checked_at = now()`,
      [id, l.label, l.info, entries.length, names]);
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally { c.release(); }
  return { id, entries: entries.length, names, seconds: Math.round((Date.now() - t0) / 1000) };
}

export async function listStatus() {
  const p = await db();
  let { rows } = await p.query("select * from sanction_lists");
  // Annex XIX is kept in code: load it automatically the first time.
  if (!rows.some(r => r.id === "xix" && r.entries)) { await refreshList("xix").catch(() => {}); rows = (await p.query("select * from sanction_lists")).rows; }
  return LISTS.map(l => ({ id: l.id, label: l.label, info: l.info, ...(rows.find(r => r.id === l.id) || {}) }));
}

// ---------- screening ----------

export type Hit = { list: ListId; ref: string; matched: string; primary: string; kind: string; programme: string; details: Record<string, string>; score: number; strength: "strong" | "possible" | "weak" };
export type Screened = { name: string; role: string; hits: Hit[] };

function scoreOf(q: string, cand: string, sim: number) {
  const qn = q.split(" ").length, cn = cand.split(" ").length;
  const cov = coverage(q, cand);
  let s = sim;
  if (cov === 1 && qn >= 2) s = Math.max(s, cn === qn ? 0.97 : 0.9);
  else if (cov === 1 && qn === 1) s = Math.max(s, cn === 1 ? 0.9 : cn === 2 ? 0.72 : 0.6);
  // Two of three words (e.g. only first name + patronymic) is not enough: "Sidorov Oleg Petrovich" ≠ "Shpakov Oleg Petrovich".
  return Math.round(s * 100) / 100;
}

export async function screen(parties: { name: string; role: string }[]): Promise<Screened[]> {
  const p = await db();
  const c = await p.connect();
  try {
    await c.query("select set_limit(0.3)");
    const out: Screened[] = [];
    for (const party of parties) {
      const q = normName(party.name);
      if (q.replace(/ /g, "").length < 3) { out.push({ ...party, hits: [] }); continue; }
      const { rows } = await c.query(
        `select n.list, n.ref, n.name as matched, n.norm, similarity(n.norm, $1) as sim, e.name as primary, e.kind, e.programme, e.details
         from sanction_names n join sanction_entries e on e.list = n.list and e.ref = n.ref
         where n.norm % $1 order by sim desc limit 40`, [q]);
      const best = new Map<string, Hit>();
      for (const r of rows) {
        const score = scoreOf(q, r.norm, Number(r.sim));
        if (score < 0.62) continue;
        const key = r.list + ":" + r.ref;
        const prev = best.get(key);
        if (!prev || prev.score < score)
          best.set(key, { list: r.list, ref: r.ref, matched: r.matched, primary: r.primary, kind: r.kind, programme: r.programme, details: r.details || {}, score,
            strength: score >= 0.9 ? "strong" : score >= 0.75 ? "possible" : "weak" });
      }
      out.push({ ...party, hits: [...best.values()].sort((a, b) => b.score - a.score).slice(0, 6) });
    }
    return out;
  } finally { c.release(); }
}
