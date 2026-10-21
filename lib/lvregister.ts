// Latvian Enterprise Register (Uzņēmumu reģistrs) open data on data.gov.lv — free, no key.
// CKAN datastore API: companies, officers (amatpersonas), beneficial owners (PLG), members (dalībnieki).

const BASE = process.env.LV_DATA_API || "https://data.gov.lv/dati/api/3/action";
const RES = {
  companies: process.env.LV_RES_COMPANIES || "25e80bf3-f107-4ab4-89ef-251b5b9374e9",
  officers: process.env.LV_RES_OFFICERS || "e665114a-73c2-4375-9470-55874b4cfa6b",
  ubo: process.env.LV_RES_UBO || "20a9b26d-d056-4dbb-ae18-9ff23c87bdee",
};
let membersRes: string | null | undefined = process.env.LV_RES_MEMBERS; // found automatically if not set

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

async function api(action: string, params: Record<string, string>) {
  const u = new URL(`${BASE}/${action}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  let res: Response;
  try { res = await fetch(u, { signal: AbortSignal.timeout(25_000), headers: { "user-agent": "compliance-bot/1.0" } }); }
  catch (e) { throw new Error("Реестр Латвии (data.gov.lv) недоступен: " + (e instanceof Error ? e.message : String(e))); }
  if (!res.ok) throw new Error(`Реестр Латвии (data.gov.lv) ответил ${res.status}`);
  const j = await res.json();
  if (!j.success) throw new Error("Реестр Латвии: " + JSON.stringify(j.error || "ошибка").slice(0, 200));
  return j.result;
}

async function search(resource: string, q: string, limit = 100): Promise<Row[]> {
  const r = await api("datastore_search", { resource_id: resource, q, limit: String(limit) });
  return (r.records || []) as Row[];
}

async function findMembersResource(): Promise<string | null> {
  if (membersRes !== undefined) return membersRes;
  try {
    const r = await api("package_search", { q: "dalībnieki", rows: "20" });
    for (const p of r.results || []) for (const res of p.resources || [])
      if (/members\.csv/i.test(str(res.url)) && res.datastore_active !== false) { membersRes = str(res.id); return membersRes; }
  } catch { /* members are optional */ }
  membersRes = null;
  return null;
}

export type LvCompany = { regcode: string; name: string; type: string; registered: string; terminated: string; address: string };

function company(r: Row): LvCompany {
  return { regcode: str(r.regcode), name: str(r.name) || str(r.name_in_quotes), type: str(r.type_text) || str(r.regtype_text),
    registered: str(r.registered), terminated: str(r.terminated) || str(r.closed), address: str(r.address) };
}

export async function findCompanies(query: string): Promise<LvCompany[]> {
  const q = query.trim();
  if (/^\d{11}$/.test(q)) {
    let rows: Row[] = [];
    try { rows = (await api("datastore_search", { resource_id: RES.companies, filters: JSON.stringify({ regcode: q }), limit: "5" })).records || []; } catch { /* try full text */ }
    if (!rows.length) rows = await search(RES.companies, q, 20);
    return rows.map(company).filter(c => c.regcode === q);
  }
  const rows = await search(RES.companies, q, 20);
  const list = rows.map(company).filter(c => c.regcode);
  // active companies first
  return list.sort((a, b) => Number(!!a.terminated) - Number(!!b.terminated)).slice(0, 10);
}

// Rows of a person/entity table that belong to the company with this registration number.
// officers/members use at_legal_entity_registration_number for the company; the PLG table uses legal_entity_registration_number.
function ofCompany(rows: Row[], regcode: string) {
  return rows.filter(r => {
    const at = str(r.at_legal_entity_registration_number);
    return at ? at === regcode : str(r.legal_entity_registration_number) === regcode;
  });
}

const personName = (r: Row) => str(r.name) || [str(r.forename), str(r.surname)].filter(Boolean).join(" ");

export type LvParty = { name: string; role: string; details: Record<string, string> };
export type LvProfile = { company: LvCompany; officers: LvParty[]; ubos: LvParty[]; members: LvParty[]; warnings: string[] };

function pick(r: Row, keys: string[]) {
  const d: Record<string, string> = {};
  for (const k of keys) if (str(r[k])) d[k] = str(r[k]);
  return d;
}

export async function companyProfile(regcode: string): Promise<LvProfile> {
  const found = await findCompanies(regcode);
  if (!found.length) throw new Error(`В реестре Латвии нет компании с номером ${regcode}.`);
  const warnings: string[] = [];
  const safe = async (label: string, f: () => Promise<Row[]>) => { try { return await f(); } catch (e) { warnings.push(`${label}: ${e instanceof Error ? e.message : e}`); return []; } };
  const mres = await findMembersResource();
  const [off, ubo, mem] = await Promise.all([
    safe("Должностные лица", () => search(RES.officers, regcode)),
    safe("Бенефициары (PLG)", () => search(RES.ubo, regcode)),
    mres ? safe("Участники", () => search(mres, regcode)) : Promise.resolve([] as Row[]),
  ]);
  if (!mres) warnings.push("Список участников (dalībnieki) не найден в открытых данных — участники не проверены.");
  return {
    company: found[0],
    officers: ofCompany(off, regcode).map(r => ({ name: personName(r), role: [str(r.position), str(r.governing_body)].filter(Boolean).join(", ") || "должностное лицо",
      details: pick(r, ["entity_type", "birth_date", "latvian_identity_number_masked", "legal_entity_registration_number", "rights_of_representation_type", "registered_on"]) })).filter(x => x.name),
    ubos: ofCompany(ubo, regcode).map(r => ({ name: personName(r), role: "бенефициар (PLG)",
      details: pick(r, ["birth_date", "nationality", "residence", "latvian_identity_number_masked", "registered_on"]) })).filter(x => x.name),
    members: ofCompany(mem, regcode).map(r => ({ name: personName(r), role: "участник",
      details: pick(r, ["entity_type", "number_of_shares", "share_nominal_value", "share_currency", "birth_date", "legal_entity_registration_number", "registered_on"]) })).filter(x => x.name),
    warnings,
  };
}
