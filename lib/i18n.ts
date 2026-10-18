import type { Lang } from "./types";

// Texts of the customer-facing page (Разбор запроса) in three languages.
export const I18N: Record<Lang, Record<string, string>> = {
  en: {
    tag: "Latvia · due diligence", title: "What does my bank want?",
    subtitle: "Paste a bank's request. Get a plain explanation, a checklist and a draft reply you review and send yourself.",
    h_input: "The bank's request", samples: "Examples", l_req: "Request text (remove names, account numbers, personal codes)",
    l_ctype: "Client type", o_ind: "Individual", o_co: "Company (SIA, AS, foreign entity)", o_st: "Self-employed / sole trader",
    l_reply: "Reply language", o_same: "Same as the bank's request", l_ctx: "What you already know or have (optional)",
    l_model: "AI model", b_go: "Decode request", ctx_ph: "e.g. The money came from selling my flat in March. I have the sale contract.",
    guard: "The assistant explains and drafts. It does not decide for the bank, promise approval, or help hide information. Check every fact before you send.",
    s_ready: "Ready", s_think: "Reading the request…", s_done: "Done", s_empty: "The result will appear here.",
    h_sum: "What the bank is asking", h_items: "What to provide", h_q: "Questions for you", h_draft: "Draft reply", h_check: "Check before sending", h_unc: "Uncertainties",
    k_why: "Why they ask", k_ev: "Possible evidence", k_cl: "To clarify", st_have: "You have it", st_missing: "Missing", st_unclear: "Unclear", deadline: "Deadline",
    copy: "Copy draft", copied: "Copied", draft_note: "Edit freely. Text in [brackets] needs your facts.", none: "None", safety: "Important",
    no_models: "No AI model is set up yet. Add an API key and a model in Settings.", go_settings: "Open Settings",
  },
  ru: {
    tag: "Латвия · due diligence", title: "Что хочет мой банк?",
    subtitle: "Вставьте запрос банка — получите объяснение простыми словами, список документов и черновик ответа, который вы проверите и отправите сами.",
    h_input: "Запрос банка", samples: "Примеры", l_req: "Текст запроса (уберите имена, номера счетов, персональные коды)",
    l_ctype: "Тип клиента", o_ind: "Частное лицо", o_co: "Компания (SIA, AS, иностранная)", o_st: "Самозанятый / ИП",
    l_reply: "Язык ответа банку", o_same: "Как в запросе банка", l_ctx: "Что вы уже знаете или имеете (необязательно)",
    l_model: "Модель ИИ", b_go: "Разобрать запрос", ctx_ph: "Например: деньги от продажи квартиры в марте. Есть договор купли-продажи.",
    guard: "Помощник объясняет и составляет черновик. Он не принимает решений за банк, не обещает одобрения и не помогает скрывать сведения. Проверьте каждый факт перед отправкой.",
    s_ready: "Готово к работе", s_think: "Читаю запрос…", s_done: "Готово", s_empty: "Здесь появится разбор.",
    h_sum: "Что просит банк", h_items: "Что предоставить", h_q: "Вопросы к вам", h_draft: "Черновик ответа", h_check: "Проверить перед отправкой", h_unc: "Неясности",
    k_why: "Зачем это банку", k_ev: "Чем подтвердить", k_cl: "Уточнить", st_have: "Есть", st_missing: "Не хватает", st_unclear: "Неясно", deadline: "Срок",
    copy: "Скопировать черновик", copied: "Скопировано", draft_note: "Редактируйте свободно. Текст в [скобках] — заполните своими данными.", none: "Нет", safety: "Важно",
    no_models: "Пока не настроена ни одна модель ИИ. Добавьте API-ключ и модель в Настройках.", go_settings: "Открыть Настройки",
  },
  lv: {
    tag: "Latvija · due diligence", title: "Ko mana banka grib?",
    subtitle: "Ielīmējiet bankas pieprasījumu un saņemiet skaidrojumu vienkāršā valodā, sarakstu un atbildes melnrakstu, ko pārbaudāt un nosūtāt paši.",
    h_input: "Bankas pieprasījums", samples: "Piemēri", l_req: "Pieprasījuma teksts (izņemiet vārdus, kontu numurus, personas kodus)",
    l_ctype: "Klienta veids", o_ind: "Fiziska persona", o_co: "Uzņēmums (SIA, AS, ārvalstu)", o_st: "Pašnodarbinātais",
    l_reply: "Atbildes valoda", o_same: "Kā bankas pieprasījumā", l_ctx: "Ko jūs jau zināt vai jums ir (nav obligāti)",
    l_model: "MI modelis", b_go: "Atšifrēt pieprasījumu", ctx_ph: "Piemēram: nauda no dzīvokļa pārdošanas martā. Ir pirkuma līgums.",
    guard: "Asistents skaidro un sagatavo melnrakstu. Tas nepieņem lēmumus bankas vietā, negarantē apstiprinājumu un nepalīdz slēpt informāciju. Pārbaudiet katru faktu pirms nosūtīšanas.",
    s_ready: "Gatavs", s_think: "Lasu pieprasījumu…", s_done: "Gatavs", s_empty: "Šeit parādīsies skaidrojums.",
    h_sum: "Ko banka prasa", h_items: "Kas jāiesniedz", h_q: "Jautājumi jums", h_draft: "Atbildes melnraksts", h_check: "Pārbaudīt pirms nosūtīšanas", h_unc: "Neskaidrības",
    k_why: "Kāpēc banka prasa", k_ev: "Iespējamie pierādījumi", k_cl: "Jāprecizē", st_have: "Ir", st_missing: "Trūkst", st_unclear: "Neskaidrs", deadline: "Termiņš",
    copy: "Kopēt melnrakstu", copied: "Nokopēts", draft_note: "Rediģējiet brīvi. Teksts [iekavās] jāaizpilda ar jūsu faktiem.", none: "Nav", safety: "Svarīgi",
    no_models: "Vēl nav iestatīts neviens MI modelis. Pievienojiet API atslēgu un modeli Iestatījumos.", go_settings: "Atvērt Iestatījumus",
  },
};

export function tr(lang: Lang) {
  return (k: string) => I18N[lang][k] ?? I18N.en[k] ?? k;
}
