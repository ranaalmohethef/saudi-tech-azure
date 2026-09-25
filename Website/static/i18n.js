// All page text, English and Arabic. Edit the words here.
// Every element with data-i="key" in index.html takes its text from this file.
const I18N = {
 en: {
  // header
  brand: "Diraya",
  team_name: "Saudi Tech Research Hub",
  nav_a: "Research Analytics", nav_x: "Dataset Explorer", nav_m: "Architecture", nav_t: "Team",
  lang: "العربية",

  // hero
  h1: "Saudi Technology Research Hub",
  question: "Explore technology research from Saudi universities through a unified research dataset.",
  k_papers: "Total Technology Papers", k_valid: "Validated Records", k_unis: "Universities",
  live: "Live data from PostgreSQL", loading: "Loading…",
  offline: "Saved copy (server not running)", dberr: "Database not connected (see terminal) · showing saved copy",

  // analytics
  a_h: "Research Analytics & Insights", a_lede: "Select a university to interactively filter all charts and metrics.",
  all: "All Universities", papers: "papers", share: "share", years_active: "Years Active", top_domain: "Top Domain", total: "Total",
  c_year: "Research Publications Over Time", c_year_s: "Technology papers per year",
  c_topic: "Technology Research Areas", c_topic_s: "Most active domains",
  c_j: "Publication Sources", c_j_s: "Top journals and conferences",
  c_f: "University Comparison", c_f_s: "Data funnel from extraction to final dataset",
  lg_tech: "Tech", lg_val: "Validated", lg_rej: "Rejected",
  th_u: "University", th_c: "Cleaned", th_v: "Validated", th_t: "Technology",

  // explorer
  x_h: "Dataset Explorer", x_lede: "Interactive search across the finalized technology dataset.",
  search: "Search title, author, journal, DOI", allYears: "All Years", allTopics: "All Topics",
  clear: "Clear filters", prev: "Previous", next: "Next",
  showing: (n, t) => `Showing ${n} of ${t} records`, page: (p, n) => `Page ${p} of ${n}`,
  empty: "No records found matching your filters.", noAbs: "No abstract available.",
  journal: "Journal", doi: "DOI", src: "Source", kw: "Keywords",

  // architecture
  m_h: "Architecture & Methodology",
  m_src: "Dataset Sources", m_time: "Timeframe", m_schema: "Data Schema", m_schema_v: "15 Standardized Fields", m_update: "Last Update",
  f1: "Research Sources", f2: "Azure Data Factory", f3: "Raw Zone (ADLS)", f4: "Clean & Validate",
  f5: "Union & Technology Filter", f6: "Quality Gate", f7: "PostgreSQL", f8: "Web Dashboard",
  f_note: "(PL_Master): One master pipeline runs every step in order and sends an email after each run.",

  // team
  t_h: "Engineering Team", t_lede: "Click a name to open the LinkedIn profile.", t_link: "LinkedIn profile",
  n1: "Rana Ayman Almohethef", n2: "Rana Saad AlHasaniah", n3: "Aryam Saad Alotaibi",
  foot: "Python · Azure Data Factory · ADLS Gen2 · Azure Functions · PostgreSQL · Flask",

  topic: { ml: "Machine learning", dl: "Deep learning", ai: "Artificial intelligence", nn: "Neural networks", iot: "Internet of Things", sec: "Security & cryptography", bc: "Blockchain", cloud: "Cloud & edge computing", nlp: "NLP & language models", cv: "Computer vision", data: "Big data & data mining", net: "Wireless networks", rob: "Robotics", se: "Software eng. & CS" }
 },

 ar: {
  brand: "دراية",
  team_name: "مركز الأبحاث التقنية السعودية",
  nav_a: "التحليلات", nav_x: "استكشاف البيانات", nav_m: "البنية", nav_t: "الفريق",
  lang: "English",

  h1: "منصة الأبحاث التقنية في الجامعات السعودية",
  question: "أكثر من خمسة آلاف بحث تقني من ست جامعات سعودية في قاعدة بيانات واحدة.",
  k_papers: "الأبحاث التقنية", k_valid: "سجلات اجتازت التحقق", k_unis: "الجامعات",
  live: "بيانات مباشرة من PostgreSQL", loading: "جاري التحميل…",
  offline: "نسخة محفوظة (السيرفر غير شغّال)", dberr: "القاعدة غير متصلة (راجع الـ Terminal) · نعرض النسخة المحفوظة",

  a_h: "التحليلات والمؤشرات", a_lede: "اختر جامعة لتصفية الرسوم التحليلية",
  all: "كل الجامعات", papers: "بحث", share: "من الإجمالي", years_active: "سنوات النشر", top_domain: "أبرز مجال", total: "المجموع",
  c_year: "الأبحاث عبر السنوات", c_year_s: "عدد الأبحاث التقنية في كل سنة",
  c_topic: "المجالات التقنية", c_topic_s: "أكثر المجالات نشاطًا",
  c_j: "جهات النشر", c_j_s: "أكثر المجلات والمؤتمرات",
  c_f: "مقارنة الجامعات", c_f_s: "مراحل البيانات من الاستخراج إلى البيانات النهائية",
  lg_tech: "تقني", lg_val: "اجتاز التحقق", lg_rej: "مرفوض",
  th_u: "الجامعة", th_c: "بعد التنظيف", th_v: "بعد التحقق", th_t: "تقني",

  x_h: "استكشاف البيانات", x_lede: "ابحث عن الأبحاث التقنية.",
  search: "ابحث بالعنوان أو المؤلف أو المجلة أو DOI", allYears: "كل السنوات", allTopics: "كل المجالات",
  clear: "مسح التصفية", prev: "السابق", next: "التالي",
  showing: (n, t) => `عرض ${n} من ${t} سجل`, page: (p, n) => `صفحة ${p} من ${n}`,
  empty: "لا توجد سجلات تطابق التصفية.", noAbs: "لا يوجد ملخص.",
  journal: "المجلة", doi: "DOI", src: "المصدر", kw: "الكلمات المطابقة",

  m_h: "البنية والمنهجية",
  m_src: "مصادر البيانات", m_time: "الفترة", m_schema: "مخطط البيانات", m_schema_v: "15 حقلًا موحّدًا", m_update: "آخر تحديث",
  f1: "مصادر البيانات", f2: "Azure Data Factory", f3: "حفظ البيانات الخام", f4: "تنظيف البيانات",
  f5: "دمج البيانات وفلترتها", f6: "التحقق من جودتها", f7: "PostgreSQL", f8: "الموقع الإلكتروني",
  f_note: "(PL_Master):  خط رئيسي واحد يشغّل كل الخطوات بالترتيب، ويرسل إيميل بعد كل تشغيل.",

  t_h: "فريق العمل", t_lede: "اضغط على الاسم لفتح حساب LinkedIn.", t_link: "حساب LinkedIn",
  n1: "رنا أيمن المحيذف", n2: "رنا سعد الحسنية", n3: "أريام سعد العتيبي",
  foot: "Python · Azure Data Factory · ADLS Gen2 · Azure Functions · PostgreSQL · Flask",

  topic: { ml: "تعلّم الآلة", dl: "التعلّم العميق", ai: "الذكاء الاصطناعي", nn: "الشبكات العصبية", iot: "إنترنت الأشياء", sec: "الأمن السيبراني والتشفير", bc: "البلوك تشين", cloud: "الحوسبة السحابية والطرفية", nlp: "معالجة اللغة والنماذج اللغوية", cv: "الرؤية الحاسوبية", data: "البيانات الضخمة والتنقيب", net: "الشبكات اللاسلكية", rob: "الروبوتات", se: "هندسة البرمجيات وعلوم الحاسب" }
 }
};
