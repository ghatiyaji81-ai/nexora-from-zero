/**
 * NEXORA Centralized I18n String Registry
 * Consolidates all UI strings for Spaces, Communication Relief, Wellbeing,
 * Onboarding, Rules Engine, PWA, Mobile, and common actions.
 * All Hindi translations are marked [needs native review].
 */

export type Locale = 'en' | 'hi';
export type SupportedLocale = Locale;

export const STRINGS_EN = {
  // Common Actions & Badges
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.undo': 'Undo',
  'common.delete': 'Delete',
  'common.rename': 'Rename',
  'common.create': 'Create',
  'common.reset': 'Reset',
  'common.continue': 'Continue',
  'common.back': 'Back',
  'common.skip': 'Skip for now',
  'common.done': 'Done',
  'common.reopen': 'Reopen',
  'common.markRead': 'Mark read',
  'common.sampleData': 'Preview · Sample data',
  'common.notConnected': 'Not connected',
  'common.connected': 'Connected',

  // Spaces / Profiles (Item 4)
  'spaces.title': 'Spaces & Profiles',
  'spaces.switchLabel': 'Switch space',
  'spaces.currentSpace': 'Current Space',
  'spaces.createTitle': 'Create New Space',
  'spaces.nameLabel': 'Space Name',
  'spaces.themeLabel': 'Space Theme',
  'spaces.accentLabel': 'Signature Accent',
  'spaces.deleteConfirm': 'Are you sure you want to delete this space?',
  'spaces.deleteSuccess': 'Space deleted',
  'spaces.createdSuccess': 'New space created',
  'spaces.renamedSuccess': 'Space renamed',
  'spaces.switchedSuccess': 'Switched to',
  'spaces.work': 'Work',
  'spaces.study': 'Study',
  'spaces.personal': 'Personal',

  // Communication Relief (Item 5)
  'comm.title': 'Communication Relief',
  'comm.subtitle': 'Quiet notification batches, VIP bypass, and focused compose box',
  'comm.digestTitle': 'Daily Digest Schedule',
  'comm.digestDesc': 'Delivers notifications in grouped quiet batches instead of real-time interruptions.',
  'comm.digestTimes': '3 times daily (09:00, 13:00, 18:00)',
  'comm.snooze': 'Snooze notification',
  'comm.snoozeLaterToday': 'Later today (3 hours)',
  'comm.snoozeTomorrow': 'Tomorrow 10:00 AM',
  'comm.snoozeNextWeek': 'Next week Monday',
  'comm.vipTitle': 'Priority People (VIP Bypass)',
  'comm.vipDesc': 'Messages from these contacts bypass distraction shielding during deep focus.',
  'comm.quietHours': 'Quiet Hours Schedule',
  'comm.quietHoursRange': '20:00 - 08:00 Daily',
  'comm.replyLater': 'Reply Later Queue',
  'comm.replyLaterMoved': 'Moved to Reply Later queue',
  'comm.composeTitle': 'Unified Compose Box',
  'comm.chooseChannel': 'Choose delivery channel',
  'comm.sendAction': 'Send message',
  'comm.channelLocal': 'Connect (Local channel)',
  'comm.channelGithub': 'GitHub Discussions',
  'comm.channelTelegram': 'Telegram Messenger',
  'comm.channelEmail': 'Email Dispatch',
  'comm.externalNotConnected': 'External channels show Not connected until official credentials are set in .env.local.',
  'comm.focusMutedActive': 'Focus Shield: Notifications actively batched to daily digest',
  'comm.focusMutedHonest': 'Digest active (sample notifications held)',

  // Wellbeing (Item 7)
  'wellbeing.title': 'Wellbeing & Daily Reflection',
  'wellbeing.energyTitle': 'Energy Check-in',
  'wellbeing.energySubtitle': 'How is your energy right now? At most twice a day, always skippable.',
  'wellbeing.energyLow': 'Low energy 🔋',
  'wellbeing.energySteady': 'Steady pace ⚡',
  'wellbeing.energyHigh': 'High clarity 🚀',
  'wellbeing.suggestLight': 'Suggested: Light tasks, reading in Discover, or short reflection. Take breaks.',
  'wellbeing.suggestSteady': 'Suggested: Normal drafting, Connect replies, or creative asset review.',
  'wellbeing.suggestHeavy': 'Suggested: Deep 25m Focus Room sprint, complex Build tasks, or architecture planning.',
  'wellbeing.weeklyReport': 'Weekly Focus Reflection',
  'wellbeing.dailyWrapup': 'Daily Wrap-up',
  'wellbeing.gentleTone': 'Quiet work done with care. No guilt or pressure.',
  'wellbeing.exportData': 'Export My Data',
  'wellbeing.deleteData': 'Delete My Data',
  'wellbeing.exportDesc': 'Download a complete JSON export of your local spaces, preferences, and focus history.',
  'wellbeing.deleteDesc': 'Erase all locally stored data from this browser. This cannot be undone.',
  'wellbeing.deletedSuccess': 'All local data has been erased',

  // Rules Engine & Workflows (Item 6)
  'rules.title': 'Rules & Automation',
  'rules.subtitle': 'In-app automation triggers, auto-routing, and calm routines',
  'rules.createRule': 'Create Rule',
  'rules.testRule': 'Test Rule (Dry Run)',
  'rules.activityLog': 'Automation Activity Log',
  'rules.morningRoutine': 'Run Morning Routine',
  'rules.windDown': 'Run Wind Down Routine',
  'rules.scheduledNotice': 'Scheduled actions run only while NEXORA is open in your browser (or upon next open). No background server execution.',
  'rules.deleted': 'Rule deleted',
  'rules.loopProtected': 'Loop protection triggered: Maximum trigger chain depth exceeded',
  'rules.rateLimited': 'Rate limit reached: Rule triggered too frequently',
  'rules.dryRunSuccess': 'Dry run simulated successfully: No state modified',

  // PWA & i18n (Item 9)
  'pwa.installPrompt': 'Install NEXORA App',
  'pwa.updateAvailable': 'Update available. Reload to update.',
  'pwa.updateNow': 'Update Now',
  'pwa.offlineTitle': 'Offline Mode',
  'pwa.offlineDesc': 'You are currently offline. Your local documents and focus tools continue to work.',
  'pwa.languageSwitcher': 'Language (English / हिन्दी)',
  'pwa.dyslexicDevanagariNotice': 'OpenDyslexic contains Latin glyphs only. In Hindi mode, a legible Devanagari fallback is used.',

  // Mobile Polish & Share (Item 12)
  'mobile.more': 'More',
  'mobile.pullRefresh': 'Release to refresh local data',
  'mobile.hapticsLabel': 'Haptic Feedback',
  'mobile.hapticsDesc': 'Vibrate on actions (Android Chrome only; iOS Safari unsupported)',
  'mobile.cmdK': 'Search or Command (⌘K)',
  'share.title': 'Save Shared Content',
  'share.destination': 'Choose destination',
  'share.saveThink': 'Save as Note in Think',
  'share.saveConnect': 'Save as Draft in Connect',
  'share.iosNotice': 'Note: Android Chrome supports Web Share Target; iOS Safari does not support this standard.',
} as const;

export type I18nKey = keyof typeof STRINGS_EN;

export const STRINGS_HI: Record<I18nKey, string> = {
  // Common Actions & Badges [needs native review]
  'common.save': 'सहेजें',
  'common.cancel': 'रद्द करें',
  'common.close': 'बंद करें',
  'common.undo': 'वापस लें',
  'common.delete': 'हटाएं',
  'common.rename': 'नाम बदलें',
  'common.create': 'बनाएं',
  'common.reset': 'रीसेट',
  'common.continue': 'आगे बढ़ें',
  'common.back': 'पीछे',
  'common.skip': 'अभी छोड़ें',
  'common.done': 'संपन्न',
  'common.reopen': 'पुनः खोलें',
  'common.markRead': 'पढ़ा गया चिह्नित करें',
  'common.sampleData': 'पूर्वावलोकन · नमूना डेटा',
  'common.notConnected': 'कनेक्ट नहीं है',
  'common.connected': 'कनेक्टेड',

  // Spaces / Profiles (Item 4) [needs native review]
  'spaces.title': 'स्पेसेस और प्रोफाइल',
  'spaces.switchLabel': 'स्पेस बदलें',
  'spaces.currentSpace': 'वर्तमान स्पेस',
  'spaces.createTitle': 'नया स्पेस बनाएं',
  'spaces.nameLabel': 'स्पेस का नाम',
  'spaces.themeLabel': 'स्पेस थीम',
  'spaces.accentLabel': 'पहचान का रंग',
  'spaces.deleteConfirm': 'क्या आप वाकई इस स्पेस को हटाना चाहते हैं?',
  'spaces.deleteSuccess': 'स्पेस हटाया गया',
  'spaces.createdSuccess': 'नया स्पेस बनाया गया',
  'spaces.renamedSuccess': 'स्पेस का नाम बदला गया',
  'spaces.switchedSuccess': 'इस पर स्विच किया गया',
  'spaces.work': 'कार्य (Work)',
  'spaces.study': 'अध्ययन (Study)',
  'spaces.personal': 'व्यक्तिगत (Personal)',

  // Communication Relief (Item 5) [needs native review]
  'comm.title': 'शांत संचार (Communication Relief)',
  'comm.subtitle': 'शांत अधिसूचना बैच, वीआईपी प्राथमिकता और केंद्रित संदेश बॉक्स',
  'comm.digestTitle': 'दैनिक सारांश अनुसूची',
  'comm.digestDesc': 'सूचनाएं तुरंत बाधित करने के बजाय शांत समूहों में प्रस्तुत करता है।',
  'comm.digestTimes': 'दिन में 3 बार (09:00, 13:00, 18:00)',
  'comm.snooze': 'अधिसूचना स्नूज़ करें',
  'comm.snoozeLaterToday': 'आज बाद में (3 घंटे)',
  'comm.snoozeTomorrow': 'कल सुबह 10:00 बजे',
  'comm.snoozeNextWeek': 'अगले सप्ताह सोमवार',
  'comm.vipTitle': 'प्राथमिकता वाले व्यक्ति (VIP)',
  'comm.vipDesc': 'गहरे ध्यान के दौरान भी इन संपर्कों के संदेश प्राप्त होंगे।',
  'comm.quietHours': 'शांत समय अनुसूची',
  'comm.quietHoursRange': 'रात 20:00 से सुबह 08:00 बजे तक',
  'comm.replyLater': 'बाद में उत्तर दें कतार',
  'comm.replyLaterMoved': 'बाद में उत्तर दें कतार में भेजा गया',
  'comm.composeTitle': 'एकीकृत संदेश बॉक्स',
  'comm.chooseChannel': 'वितरण चैनल चुनें',
  'comm.sendAction': 'संदेश भेजें',
  'comm.channelLocal': 'कनेक्ट (स्थानीय चैनल)',
  'comm.channelGithub': 'गिटहब चर्चाएं',
  'comm.channelTelegram': 'टेलीग्राम संदेशवाहक',
  'comm.channelEmail': 'ईमेल प्रेषण',
  'comm.externalNotConnected': 'बाहरी चैनल कनेक्ट नहीं हैं जब तक क्रेडेंशियल सेट न हों।',
  'comm.focusMutedActive': 'फोकस शील्ड: सूचनाएं दैनिक सारांश में सक्रिय रूप से संग्रहीत',
  'comm.focusMutedHonest': 'सारांश सक्रिय (नमूना सूचनाएं रोकी गईं)',

  // Wellbeing (Item 7) [needs native review]
  'wellbeing.title': 'कल्याण और दैनिक चिंतन',
  'wellbeing.energyTitle': 'ऊर्जा जांच (Energy Check-in)',
  'wellbeing.energySubtitle': 'आपकी ऊर्जा कैसी है? दिन में अधिकतम दो बार, कभी भी छोड़ सकते हैं।',
  'wellbeing.energyLow': 'धीमी गति 🔋',
  'wellbeing.energySteady': 'संतुलित गति ⚡',
  'wellbeing.energyHigh': 'गहन स्पष्टता 🚀',
  'wellbeing.suggestLight': 'सुझाव: हल्के कार्य, डिस्कवर में शांत पठन, या संक्षिप्त विश्राम।',
  'wellbeing.suggestSteady': 'सुझाव: नियमित प्रारूपण, कनेक्ट उत्तर, या रचनात्मक समीक्षा।',
  'wellbeing.suggestHeavy': 'सुझाव: 25 मिनट का गहन फोकस रूम सत्र, या जटिल बिल्ड कार्य।',
  'wellbeing.weeklyReport': 'साप्ताहिक फोकस चिंतन',
  'wellbeing.dailyWrapup': 'दैनिक सारांश',
  'wellbeing.gentleTone': 'देखभाल के साथ शांत कार्य। कोई अपराधबोध या दबाव नहीं।',
  'wellbeing.exportData': 'मेरा डेटा निर्यात करें',
  'wellbeing.deleteData': 'मेरा डेटा हटाएं',
  'wellbeing.exportDesc': 'अपने स्थानीय स्पेस, प्राथमिकताओं और फोकस इतिहास का JSON निर्यात डाउनलोड करें।',
  'wellbeing.deleteDesc': 'इस ब्राउज़र से सभी स्थानीय रूप से संग्रहीत डेटा मिटाएं। इसे वापस नहीं लाया जा सकता।',
  'wellbeing.deletedSuccess': 'सभी स्थानीय डेटा मिटा दिया गया है',

  // Rules Engine & Workflows (Item 6) [needs native review]
  'rules.title': 'नियम और स्वचालन',
  'rules.subtitle': 'इन-ऐप स्वचालन ट्रिगर, ऑटो-रूटिंग और शांत दिनचर्या',
  'rules.createRule': 'नियम बनाएं',
  'rules.testRule': 'नियम का परीक्षण करें (ड्राई रन)',
  'rules.activityLog': 'स्वचालन गतिविधि लॉग',
  'rules.morningRoutine': 'सुबह की दिनचर्या शुरू करें',
  'rules.windDown': 'शाम का समापन शुरू करें',
  'rules.scheduledNotice': 'अनुसूचित क्रियाएं केवल तभी चलती हैं जब ब्राउज़र में नेक्सोरा खुला हो (या अगली बार खोलने पर)। पृष्ठभूमि में कोई सर्वर निष्पादन नहीं होता।',
  'rules.deleted': 'नियम हटाया गया',
  'rules.loopProtected': 'लूप सुरक्षा: अधिकतम ट्रिगर श्रृंखला गहराई पार हो गई',
  'rules.rateLimited': 'दर सीमा: नियम बहुत बार ट्रिगर हुआ',
  'rules.dryRunSuccess': 'ड्राई रन सफलतापूर्वक सिम्युलेट किया गया: कोई बदलाव नहीं किया गया',

  // PWA & i18n (Item 9) [needs native review]
  'pwa.installPrompt': 'नेक्सोरा ऐप इंस्टॉल करें',
  'pwa.updateAvailable': 'नया अपडेट उपलब्ध है। अपडेट करने के लिए पुनः लोड करें।',
  'pwa.updateNow': 'अभी अपडेट करें',
  'pwa.offlineTitle': 'ऑफ़लाइन मोड',
  'pwa.offlineDesc': 'आप वर्तमान में ऑफ़लाइन हैं। आपके स्थानीय दस्तावेज़ और फोकस उपकरण काम करते रहेंगे।',
  'pwa.languageSwitcher': 'भाषा (English / हिन्दी)',
  'pwa.dyslexicDevanagariNotice': 'ओपनडिस्लेक्सिक में केवल लैटिन वर्ण हैं। हिंदी मोड में एक सुपाठ्य देवनागरी फ़ॉन्ट का उपयोग किया जाता है।',

  // Mobile Polish & Share (Item 12) [needs native review]
  'mobile.more': 'अधिक',
  'mobile.pullRefresh': 'स्थानीय डेटा ताज़ा करने के लिए छोड़ें',
  'mobile.hapticsLabel': 'कंपन प्रतिक्रिया',
  'mobile.hapticsDesc': 'क्रियाओं पर कंपन (केवल एंड्रॉइड क्रोम; आईओएस सफारी असमर्थित)',
  'mobile.cmdK': 'खोजें या कमांड चलाएं (⌘K)',
  'share.title': 'साझा की गई सामग्री सहेजें',
  'share.destination': 'गंतव्य चुनें',
  'share.saveThink': 'थिंक में नोट के रूप में सहेजें',
  'share.saveConnect': 'कनेक्ट में ड्राफ्ट के रूप में सहेजें',
  'share.iosNotice': 'ध्यान दें: एंड्रॉइड क्रोम वेब शेयर टारगेट का समर्थन करता है; आईओएस सफारी इसका समर्थन नहीं करता।',
};

const STORAGE_KEY_LOCALE = 'nexora-locale';

let activeLocale: Locale = 'en';

export function getLocale(): Locale {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(STORAGE_KEY_LOCALE) as Locale | null;
    if (saved === 'hi' || saved === 'en') {
      activeLocale = saved;
    }
  }
  return activeLocale;
}

export function setLocale(locale: Locale): void {
  activeLocale = locale;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY_LOCALE, locale);
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
    window.dispatchEvent(new CustomEvent('nexora-locale-change', { detail: { locale } }));
  }
}

export function t(key: I18nKey): string {
  const current = getLocale();
  if (current === 'hi') {
    return STRINGS_HI[key] || STRINGS_EN[key];
  }
  return STRINGS_EN[key] || key;
}

/** Format numbers according to active locale */
export function formatNumber(num: number): string {
  const loc = getLocale() === 'hi' ? 'hi-IN' : 'en-US';
  return new Intl.NumberFormat(loc).format(num);
}

/** Format dates according to active locale */
export function formatDate(date: Date | number, options?: Intl.DateTimeFormatOptions): string {
  const loc = getLocale() === 'hi' ? 'hi-IN' : 'en-US';
  const d = typeof date === 'number' ? new Date(date) : date;
  return new Intl.DateTimeFormat(loc, options || { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

/** Format times according to active locale */
export function formatTime(date: Date | number): string {
  const loc = getLocale() === 'hi' ? 'hi-IN' : 'en-US';
  const d = typeof date === 'number' ? new Date(date) : date;
  return new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' }).format(d);
}
