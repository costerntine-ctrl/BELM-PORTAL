(function () {
  const KEY = "belm_legal_lang";
  const titles = {
    en: { title: document.getElementById("legalTitle")?.dataset.en || document.getElementById("legalTitle")?.textContent, updated: "Last updated: 16 August 2026", notice_terms: "This page is a general-purpose draft prepared for the BELM Portal and is not legal advice. Please have it reviewed by a qualified lawyer familiar with Tanzanian law before relying on it as your company's official terms.", notice_privacy: "This page is a general-purpose draft prepared for the BELM Portal and is not legal advice. Please have it reviewed by a qualified lawyer familiar with Tanzanian data protection law before relying on it as your company's official policy." },
  };
  const isTerms = !!document.getElementById("termsLink")?.classList.contains("active");
  const labels = {
    title: isTerms ? { en: "Terms of Use & Definitions", sw: "Masharti ya Matumizi & Maana za Maneno" } : { en: "Privacy Policy", sw: "Sera ya Faragha" },
    updated: { en: "Last updated: 16 August 2026", sw: "Ilisasishwa mwisho: 16 Agosti 2026" },
    privacyLink: { en: "Privacy Policy", sw: "Sera ya Faragha" },
    termsLink: { en: "Terms & Definitions", sw: "Masharti & Maana za Maneno" },
    notice: isTerms
      ? { en: "This page is a general-purpose draft prepared for the BELM Portal and is not legal advice. Please have it reviewed by a qualified lawyer familiar with Tanzanian law before relying on it as your company's official terms.", sw: "Ukurasa huu ni rasimu ya jumla iliyoandaliwa kwa ajili ya BELM Portal na si ushauri wa kisheria. Tafadhali upitiwe na wakili aliyehitimu na anayefahamu sheria za Tanzania kabla ya kuutumia kama masharti rasmi ya kampuni yako." }
      : { en: "This page is a general-purpose draft prepared for the BELM Portal and is not legal advice. Please have it reviewed by a qualified lawyer familiar with Tanzanian data protection law before relying on it as your company's official policy.", sw: "Ukurasa huu ni rasimu ya jumla iliyoandaliwa kwa ajili ya BELM Portal na si ushauri wa kisheria. Tafadhali upitiwe na wakili aliyehitimu na anayefahamu sheria za ulinzi wa data za Tanzania kabla ya kuutumia kama sera rasmi ya kampuni yako." },
  };

  function apply(lang) {
    const sw = lang === "sw";
    document.getElementById("legalEn").classList.toggle("hidden", sw);
    document.getElementById("legalSw").classList.toggle("hidden", !sw);
    document.getElementById("legalTitle").textContent = sw ? labels.title.sw : labels.title.en;
    document.getElementById("legalUpdated").textContent = sw ? labels.updated.sw : labels.updated.en;
    document.getElementById("privacyLink").textContent = sw ? labels.privacyLink.sw : labels.privacyLink.en;
    document.getElementById("termsLink").textContent = sw ? labels.termsLink.sw : labels.termsLink.en;
    document.getElementById("legalNotice").textContent = sw ? labels.notice.sw : labels.notice.en;
    const button = document.getElementById("legalLangToggle");
    if (button) button.textContent = sw ? "🌐 English" : "🌐 Kiswahili";
    document.documentElement.lang = sw ? "sw" : "en";
  }

  const saved = localStorage.getItem(KEY) === "sw" ? "sw" : "en";
  apply(saved);
  document.getElementById("legalLangToggle")?.addEventListener("click", () => {
    const next = localStorage.getItem(KEY) === "sw" ? "en" : "sw";
    localStorage.setItem(KEY, next);
    apply(next);
  });
})();
