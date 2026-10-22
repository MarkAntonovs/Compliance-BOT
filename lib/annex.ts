import type { Entry } from "./sanctions";

// EU Reg. 833/2014, Annex XIX — entities with which transactions are prohibited (Art. 5aa),
// together with entities owned more than 50% by them. Source: consolidated text of Reg. 833/2014 (Annex XIX, parts A–C).
// Update by hand when the Council amends the annex.
export const ANNEX_XIX_CHECKED = "2026-10-22";

const A: [string, string[]][] = [
  ["OPK OBORONPROM", ["ОПК Оборонпром", "Oboronprom"]],
  ["UNITED AIRCRAFT CORPORATION", ["Объединённая авиастроительная корпорация", "Объединенная авиастроительная корпорация"]],
  ["URALVAGONZAVOD", ["Уралвагонзавод", "Научно-производственная корпорация Уралвагонзавод"]],
  ["ROSNEFT", ["Роснефть", "НК Роснефть", "Rosneft Oil Company"]],
  ["TRANSNEFT", ["Транснефть"]],
  ["GAZPROM NEFT", ["Газпром нефть", "Gazpromneft"]],
  ["ALMAZ-ANTEY", ["Алмаз-Антей", "Концерн ВКО Алмаз-Антей"]],
  ["KAMAZ", ["КАМАЗ"]],
  ["ROSTEC (RUSSIAN TECHNOLOGIES STATE CORPORATION)", ["Ростех", "Rostec", "Госкорпорация Ростех", "Russian Technologies"]],
  ["JSC PO SEVMASH", ["ПО Севмаш", "Севмаш", "Sevmash"]],
  ["SOVCOMFLOT", ["Совкомфлот"]],
  ["UNITED SHIPBUILDING CORPORATION", ["Объединённая судостроительная корпорация", "Объединенная судостроительная корпорация"]],
];
const B: [string, string[]][] = [["RUSSIAN MARITIME REGISTER OF SHIPPING (RMRS)", ["Российский морской регистр судоходства", "Russian Maritime Register of Shipping"]]];
const C: [string, string[]][] = [["RUSSIAN REGIONAL DEVELOPMENT BANK", ["Всероссийский банк развития регионов", "VBRR", "ВБРР"]]];

export function annexXix(): Entry[] {
  return ([["A", A], ["B", B], ["C", C]] as const).flatMap(([part, rows]) => rows.map(([name, aliases], i) => ({
    ref: `XIX-${part}${i + 1}`, kind: "entity" as const, name, names: [name, ...aliases], programme: `Reg. 833/2014 Annex XIX part ${part}`,
    details: { remark: "Запрет любых сделок по ст. 5aa Рег. 833/2014; также компании, которыми эта организация владеет более чем на 50%.", checked: ANNEX_XIX_CHECKED },
  })));
}
