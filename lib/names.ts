// Name normalisation for sanctions screening.
// "ООО «Строй-Альфа»", "Stroy-Alfa LLC" and "STROY ALFA" all become "alfa stroy".

const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", і: "i", ї: "yi", є: "ye", ґ: "g", ў: "u",
};

// Legal forms and filler words that say nothing about who the party is.
const STOP = new Set([
  "sia", "as", "aas", "ik", "pas", "biedriba", "nodibinajums",
  "ooo", "oao", "zao", "pao", "ao", "nko", "ip", "gup", "fgup", "mup", "tov", "pat", "uab", "ou", "oy", "ab", "aps",
  "llc", "ltd", "limited", "inc", "corp", "corporation", "co", "company", "plc", "lp", "llp", "jsc", "pjsc", "cjsc", "ojsc",
  "gmbh", "ag", "kg", "sa", "sas", "sarl", "srl", "spa", "bv", "nv", "sp", "zoo", "doo", "dd", "ad", "eood", "ood", "fze", "fzco", "fz", "dmcc",
  "obshchestvo", "ogranichennoy", "ogranichennoi", "otvetstvennostyu", "otvetstvennostiu", "liability", "s", "aktsionernoe", "publichnoe", "zakrytoe", "otkrytoe",
  "the", "of", "and", "i", "un",
]);

export function translit(s: string) {
  return s.toLowerCase().replace(/[а-яёіїєґў]/g, ch => CYR[ch] ?? ch);
}

export function tokens(name: string): string[] {
  const t = translit(name).normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const kept = t.filter(x => !STOP.has(x));
  return kept.length ? kept : t; // a name made only of "filler" words keeps them
}

// Order-independent key: "Rotenberg Arkady" and "Arkady ROTENBERG" give the same string.
export function normName(name: string) {
  return [...new Set(tokens(name))].sort().join(" ");
}

function lev(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

const near = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && lev(a, b) <= 1) || (a.length >= 10 && b.length >= 10 && lev(a, b) <= 2);

// Share of the query's words found (exactly or with a typo / other transliteration) in the candidate name.
export function coverage(queryNorm: string, candNorm: string) {
  const q = queryNorm.split(" ").filter(x => x.length > 1), c = candNorm.split(" ");
  if (!q.length) return 0;
  return q.filter(w => c.some(x => near(w, x))).length / q.length;
}
