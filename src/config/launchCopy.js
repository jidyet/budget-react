export const LAUNCH_COPY = {
  supportEmailFallback: "support@householdbudget.app",
  privacyHero: {
    eyebrow: "Privacy & security",
    title: "Clear and simple",
    detail:
      "This app is built to stay simple. Your private data stays with you, and shared household data only shows up for the people in that shared space.",
  },
  privacyItems: [
    {
      title: "What stays private",
      detail: "Your personal account setup, progress, and preferences stay tied to your account.",
    },
    {
      title: "What households can see",
      detail: "Shared household members can see the bills, progress, and updates inside that shared space.",
    },
    {
      title: "Who can manage a household",
      detail: "Owners and admins can manage members, requests, and shared setup. Regular members cannot change roles.",
    },
    {
      title: "Manual-first by design",
      detail: "You can keep using manual entry, spreadsheets, and statement uploads. Nothing forces bank sync.",
    },
  ],
  securityItems: [
    "You sign in to reach saved cloud data",
    "Personal data is scoped to your account",
    "Shared data is scoped to active household members",
    "Billing stays off for early testers",
  ],
  faqItems: [
    {
      question: "Can I start simple?",
      answer: "Yes. You can stay solo, add one bill, and build from there.",
    },
    {
      question: "Do I need bank sync?",
      answer: "No. Manual entry, spreadsheet import, and statement upload all stay supported.",
    },
    {
      question: "Can I switch to a household later?",
      answer: "Yes. You can start solo now and move into a shared household when you are ready.",
    },
    {
      question: "What if something looks wrong?",
      answer: "Send feedback from the app. Short notes are enough and help us fix things faster.",
    },
  ],
  betaChecklist: [
    "Try one real daily check-in",
    "Add or edit a bill",
    "Mark one payment",
    "Test solo or household flow",
    "Send feedback if anything feels off",
  ],
  betaKnownNotes: [
    "Billing stays off for testers",
    "Some import matches may still need review",
    "Statement parsing works best with clean files",
  ],
  betaSupportItems: [
    {
      title: "Send feedback",
      detail: "Use the feedback button anytime something feels unclear, broken, or especially helpful.",
    },
    {
      title: "What to look for",
      detail: "Check if the app stays clear, calm, and easy to use on real daily updates.",
    },
    {
      title: "Privacy and security",
      detail: "Your personal data stays tied to your account. Shared household data is only for active members.",
    },
  ],
  onboarding: {
    welcomeDetail: "See what is due, track progress, and keep your next move clear without the noise.",
    welcomeNote: "You can start solo and stay simple. Shared household mode is there whenever you want it.",
    addBillNote: "Open Settings, add a bill, then come back to watch your progress build.",
    simpleDetail: "You only need one small action today. The app will help with the rest.",
  },
  householdSetup: {
    chooserNote:
      "You can start simple here. Solo mode stays private, and shared mode is ready whenever you want to do this together.",
    soloNote:
      "Solo mode keeps everything private and simple. You can still create or join a household later without losing your current flow.",
  },
  uploadModes: {
    pdf: {
      title: "PDF statement upload",
      description:
        "Upload a PDF statement and the app will try to pull balance, minimum due, APR, new purchases, and other helpful details.",
      badge: "PDF",
      dropTitle: "Drop your PDF statement here or click to browse",
      dropSubtext:
        "Works with statement PDFs, card statements, loan statements, and most standard bill statements.",
    },
    image: {
      title: "Other files and images",
      description:
        "Upload a screenshot, phone photo, or image file and the app will try to pull balance, minimum due, APR, new purchases, and other helpful details.",
      badge: "IMG",
      dropTitle: "Drop your screenshot or image file here or click to browse",
      dropSubtext:
        "Works with screenshots, phone photos, JPEGs, PNGs, WEBP files, and other clear bill images.",
    },
  },
};
