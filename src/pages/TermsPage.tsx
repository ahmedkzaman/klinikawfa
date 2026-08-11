import { MainLayout } from "@/components/layout";
import { SEOHead } from "@/components/seo";
import { PublicPageSchema } from "@/components/seo/PublicPageSchema";
import { useLanguage } from "@/contexts/LanguageContext";

const content = {
  ms: {
    title: "Terma Penggunaan",
    intro: "Terma ini menerangkan penggunaan laman web Klinik Awfa. Maklumat di laman ini adalah untuk maklumat umum dan tidak menggantikan penilaian perubatan.",
    sections: [
      ["Maklumat perubatan", "Kandungan kesihatan tidak merupakan diagnosis atau nasihat perubatan untuk keadaan tertentu. Dapatkan pemeriksaan doktor atau rawatan kecemasan apabila diperlukan."],
      ["Temujanji", "Permintaan temujanji tertakluk kepada pengesahan klinik. Menghantar borang tidak menjamin slot sehingga pengesahan diterima."],
      ["Maklumat peribadi", "Maklumat yang dihantar melalui laman ini digunakan bagi mengurus pertanyaan, temujanji dan perkhidmatan klinik mengikut undang-undang yang berkenaan."],
      ["Ketepatan dan perubahan", "Kami berusaha memastikan maklumat tepat, namun waktu operasi, doktor bertugas, harga dan perkhidmatan boleh berubah. Hubungi klinik untuk pengesahan terkini."],
      ["Hubungi kami", "Untuk pertanyaan tentang terma ini, hubungi Klinik Awfa melalui maklumat hubungan yang dipaparkan di laman web."],
    ],
  },
  en: {
    title: "Terms of Use",
    intro: "These terms explain the use of the Klinik Awfa website. Information on this site is general information and does not replace a medical assessment.",
    sections: [
      ["Medical information", "Health content is not a diagnosis or medical advice for a specific condition. Seek a doctor’s assessment or emergency care when required."],
      ["Appointments", "Appointment requests are subject to clinic confirmation. Submitting a form does not guarantee a slot until confirmation is received."],
      ["Personal information", "Information submitted through this website is used to manage enquiries, appointments and clinic services in accordance with applicable law."],
      ["Accuracy and changes", "We aim to keep information accurate, but operating hours, doctors on duty, prices and services may change. Contact the clinic for current confirmation."],
      ["Contact us", "For questions about these terms, contact Klinik Awfa using the contact details displayed on this website."],
    ],
  },
} as const;

export default function TermsPage() {
  const { language } = useLanguage();
  const page = content[language];
  return (
    <MainLayout>
      <SEOHead title={`${page.title} | Klinik Awfa`} description={page.intro} url="/terms" />
      <PublicPageSchema path="/terms" name={page.title} description={page.intro} type="WebPage" />
      <main className="bg-slate-50 px-4 py-12 md:py-16">
        <article className="mx-auto max-w-3xl rounded-2xl border bg-white p-6 shadow-sm md:p-10">
          <h1 className="text-3xl font-bold text-slate-950 md:text-4xl">{page.title}</h1>
          <p className="mt-4 leading-7 text-slate-600">{page.intro}</p>
          <div className="mt-10 space-y-8">
            {page.sections.map(([heading, body]) => <section key={heading}><h2 className="text-xl font-semibold text-slate-900">{heading}</h2><p className="mt-2 leading-7 text-slate-600">{body}</p></section>)}
          </div>
          <p className="mt-10 border-t pt-6 text-sm text-slate-500">Last updated: 11 August 2026</p>
        </article>
      </main>
    </MainLayout>
  );
}
