/* PICK VERIFY — app logic (runs inside the Android app's WebView; also runs in a desktop browser in dev mode) */
(function () {
  'use strict';
  var CAM_FRACTION = 0.45;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* ===================== native bridge (or browser dev stand-in) ===================== */
  var N = window.Native || devNative();
  function devNative() {
    return {
      dev: true,
      startCamera: function () { $('devCam').textContent = 'CAMERA (dev mode)'; setTimeout(function () { window.onCamera(JSON.stringify({ state: 'started' })); }, 10); },
      stopCamera: function () { }, showPreview: function () { }, torch: function () { },
      http: function (id, url, body) {
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body })
          .then(function (r) { return r.text().then(function (t) { window.onHttp(id, r.status, t); }); })
          .catch(function (e) { window.onHttp(id, 0, String(e)); });
      },
      vibrate: function () { }, beep: function () { },
      getPref: function (k) { try { return localStorage.getItem('pv_' + k) || ''; } catch (e) { return ''; } },
      setPref: function (k, v) { try { localStorage.setItem('pv_' + k, v); } catch (e) { } },
      appVersion: function () { return 'dev'; },
      notify: function (t, b) { window.__notes = (window.__notes || []).concat([[t, b]]); }, askNotify: function () { }, background: function () { }
    };
  }
  function pget(k, def) { var v = N.getPref(k); if (!v) return def; try { var o = JSON.parse(v); return o == null ? def : o; } catch (e) { return def; } }
  function pset(k, v) { N.setPref(k, JSON.stringify(v == null ? null : v)); }

  /* ===================== language: Hinglish (default) / English / हिंदी =====================
     Only the screen words change. Names, products, document numbers, MRP, batch stay exactly as they are.
     Every text the app draws passes through tr() (MutationObserver), so new screens need no extra code. */
  var LANG = (function () { var v = pget('lang', 'hl'); return v === 'en' || v === 'hi' ? v : 'hl'; })();
  var I18N = [   // [Hinglish, English, हिंदी]
    ['SAHI — PICKED', 'CORRECT — PICKED', 'सही — उठाया'], ['SAHI — RECEIVED', 'CORRECT — RECEIVED', 'सही — मिला'],
    ['DUPLICATE — MAT UTHAO', 'DUPLICATE — DO NOT PICK', 'डुप्लिकेट — मत उठाओ'], ['DUPLICATE — MAT LO', 'DUPLICATE — DO NOT TAKE', 'डुप्लिकेट — मत लो'],
    ['EXTRA — MAT UTHAO', 'EXTRA — DO NOT PICK', 'एक्स्ट्रा — मत उठाओ'], ['EXTRA — QTY POORI HAI', 'EXTRA — QTY ALREADY FULL', 'एक्स्ट्रा — मात्रा पूरी है'],
    ['⛔ DUPLICATE — count cancel:', '⛔ DUPLICATE — count cancelled:', '⛔ डुप्लिकेट — गिनती रद्द:'], ['⛔ DUPLICATE:', '⛔ DUPLICATE:', '⛔ डुप्लिकेट:'],
    ['line DUPLICATE', 'line DUPLICATE', 'लाइन डुप्लिकेट'], ['line duplicate', 'line duplicate', 'लाइन डुप्लिकेट'],
    ['Camera se Picking + Inward check — galat maal count hi nahi hota', 'Camera check for Picking + Inward — wrong goods are never counted', 'कैमरे से पिकिंग + इनवर्ड चेक — गलत माल गिना ही नहीं जाता'],
    ['Laptop pe Sheet → menu', 'Laptop: Sheet → menu', 'लैपटॉप पर शीट → मेन्यू'],
    ['Neeche wala button dabao, QR camera ke saamne', 'Tap the button below, hold the QR in front of the camera', 'नीचे वाला बटन दबाओ, QR कैमरे के सामने रखो'],
    ['Apna naam + PIN → kaam shuru', 'Your name + PIN → start work', 'अपना नाम + PIN → काम शुरू'],
    ['📷 Setup QR scan karo', '📷 Scan setup QR', '📷 सेटअप QR स्कैन करो'],
    ['QR nahi hai? Manually daalo', 'No QR? Enter manually', 'QR नहीं है? खुद डालो'],
    ['Save & connect', 'Save & connect', 'सेव करो और जोड़ो'],
    ['Login ▶', 'Login ▶', 'लॉगिन ▶'],
    ['⟳ Dobara try karo', '⟳ Try again', '⟳ दोबारा कोशिश करो'],
    ['📷 Camera se check', '📷 Camera check', '📷 कैमरे से चेक'],
    ['🔒 PIN login', '🔒 PIN login', '🔒 PIN लॉगिन'],
    ['📵 Offline bhi chalta hai', '📵 Works offline too', '📵 बिना नेट भी चलता है'],
    ['Server badlo (setup)', 'Change server (setup)', 'सर्वर बदलो (सेटअप)'],
    ['Manual entry (GM / Owner approval)', 'Manual entry (GM / Owner approval)', 'मैनुअल एंट्री (GM / Owner मंज़ूरी)'],
    ['Manual entry (GM)', 'Manual entry (GM)', 'मैनुअल एंट्री (GM)'],
    ['Document close karo', 'Close document', 'डॉक्यूमेंट बंद करो'],
    ['Label camera ke saamne rakho', 'Hold the label in front of the camera', 'लेबल कैमरे के सामने रखो'],
    ['MRP, weight, batch aur product ka naam ek saath frame me dikhao. Roshni kam ho to 🔦.', 'Show MRP, weight, batch and product name together in the frame. Low light? Use 🔦.', 'MRP, वज़न, बैच और प्रोडक्ट का नाम एक साथ फ्रेम में दिखाओ। रोशनी कम हो तो 🔦।'],
    ['Box pe jo likha hai wahi bharo. Slip se match hoga tabhi count hoga. ScanLog me MANUAL likha jayega.', 'Enter exactly what is printed on the box. It counts only if it matches the slip. ScanLog will show MANUAL.', 'डिब्बे पर जो लिखा है वही भरो। स्लिप से मैच होगा तभी गिनती होगी। ScanLog में MANUAL लिखा जाएगा।'],
    ['Product naam / keyword (box pe)', 'Product name / keyword (on box)', 'प्रोडक्ट नाम / कीवर्ड (डिब्बे पर)'],
    ['Weight (500 g / 1 kg / 1 L)', 'Weight (500 g / 1 kg / 1 L)', 'वज़न (500 g / 1 kg / 1 L)'],
    ['Barcode (agar hai)', 'Barcode (if any)', 'बारकोड (अगर है)'],
    ['GM / Owner naam', 'GM / Owner name', 'GM / Owner नाम'],
    ['Verify & count', 'Verify & count', 'जाँचो और गिनो'],
    ['Auto next box', 'Auto next box', 'अगला डिब्बा अपने आप'],
    ['GREEN ke baad tap nahi; box hatate hi agla scan', 'No tap after GREEN; next scan starts when you move the box', 'GREEN के बाद टैप नहीं; डिब्बा हटाते ही अगला स्कैन'],
    ['🔔 Notifications on karo', '🔔 Turn on notifications', '🔔 नोटिफिकेशन चालू करो'],
    ['Pending sync abhi bhejo', 'Send pending sync now', 'बाकी सिंक अभी भेजो'],
    ['🔑 Mera PIN badlo', '🔑 Change my PIN', '🔑 मेरा PIN बदलो'],
    ['Mera PIN badlo', 'Change my PIN', 'मेरा PIN बदलो'],
    ['👤 Kisi ka PIN reset (GM / Owner)', "👤 Reset someone's PIN (GM / Owner)", '👤 किसी का PIN रीसेट (GM / Owner)'],
    ['PIN reset (GM / Owner)', 'PIN reset (GM / Owner)', 'PIN रीसेट (GM / Owner)'],
    ['Server setup dobara', 'Set up server again', 'सर्वर सेटअप दोबारा'],
    ['Server setup nahi hua', 'Server not set up', 'सर्वर सेटअप नहीं हुआ'],
    ['Network slow / band hai', 'Network slow / off', 'नेटवर्क धीमा / बंद है'],
    ['Network / server error', 'Network / server error', 'नेटवर्क / सर्वर एरर'],
    ['Server ka jawab galat — Web app deploy (Anyone) check karo', 'Bad server reply — check Web app deploy (Anyone)', 'सर्वर का जवाब गलत — Web app deploy (Anyone) चेक करो'],
    ['Setup ho gaya ✔', 'Setup done ✔', 'सेटअप हो गया ✔'],
    ['Ye Pick Verify ka setup QR nahi hai', 'This is not a Pick Verify setup QR', 'यह Pick Verify का सेटअप QR नहीं है'],
    ['Server se connect ho raha hai…', 'Connecting to server…', 'सर्वर से जुड़ रहा है…'],
    ['Sheet ke Users tab me koi Active = YES naam nahi hai.', "No name with Active = YES in the Sheet's Users tab.", 'शीट के Users टैब में कोई Active = YES नाम नहीं है।'],
    ['Sheet menu → 📱 App setup QR → neeche "Server badlo (setup)" se QR dobara scan karo.', 'Sheet menu → 📱 App setup QR → scan the QR again with "Change server (setup)" below.', 'शीट मेन्यू → 📱 App setup QR → नीचे "सर्वर बदलो (सेटअप)" से QR दोबारा स्कैन करो।'],
    ['Net check karo (WiFi / data), phir dobara try.', 'Check internet (WiFi / data), then try again.', 'नेट चेक करो (WiFi / डेटा), फिर दोबारा कोशिश करो।'],
    ['⚠️ Server se naam nahi aaye:', '⚠️ Could not get names from server:', '⚠️ सर्वर से नाम नहीं आए:'],
    ['— naam chuno —', '— choose name —', '— नाम चुनो —'],
    ['Naam aur PIN daalo', 'Enter name and PIN', 'नाम और PIN डालो'],
    ['Login…', 'Logging in…', 'लॉगिन हो रहा है…'],
    ['✨ App update ho raha hai…', '✨ Updating app…', '✨ ऐप अपडेट हो रहा है…'],
    ['Is update ke liye naya APK chahiye (ek baar). Abhi download karein? Install karne pe login aur data rehta hai.', 'This update needs a new APK (one time). Download now? Login and data stay after install.', 'इस अपडेट के लिए नया APK चाहिए (एक बार)। अभी डाउनलोड करें? इंस्टॉल करने पर लॉगिन और डेटा रहता है।'],
    ['Documents load ho rahe hain…', 'Loading documents…', 'डॉक्यूमेंट लोड हो रहे हैं…'],
    ['📵 Offline — purani list dikh rahi hai', '📵 Offline — showing saved list', '📵 ऑफलाइन — पुरानी लिस्ट दिख रही है'],
    ['GM / Owner approval ke bina pick nahi hoga', 'cannot be picked without GM / Owner approval', 'GM / Owner की मंज़ूरी के बिना पिक नहीं होगा'],
    ['GM / Owner approval ke bina count nahi hoga.', 'Will not count without GM / Owner approval.', 'GM / Owner की मंज़ूरी के बिना गिनती नहीं होगी।'],
    ['qty — app kholo aur scan karo', 'qty — open the app and scan', 'मात्रा — ऐप खोलो और स्कैन करो'],
    ['naye duplicate documents', 'new duplicate documents', 'नए डुप्लिकेट डॉक्यूमेंट'],
    ['naye documents assign hue', 'new documents assigned', 'नए डॉक्यूमेंट असाइन हुए'],
    ['naye documents', 'new documents', 'नए डॉक्यूमेंट'],
    ['Naya kaam:', 'New work:', 'नया काम:'],
    ['Naya kaam', 'New work', 'नया काम'],
    ['Inward GRN', 'Inward GRN', 'इनवर्ड GRN'],
    ['Pick Slip', 'Pick Slip', 'पिक स्लिप'],
    ['min pehle', 'min ago', 'मिनट पहले'],
    ['ghante pehle', 'hours ago', 'घंटे पहले'],
    ['din pehle', 'days ago', 'दिन पहले'],
    ['ghante se', 'hrs', 'घंटे से'],
    ['abhi', 'just now', 'अभी'],
    ['Good morning', 'Good morning', 'सुप्रभात'],
    ['Good evening', 'Good evening', 'शुभ संध्या'],
    ['Namaste', 'Hello', 'नमस्ते'],
    ['Shuru nahi', 'Not started', 'शुरू नहीं'],
    ['Chal rahe', 'In progress', 'चल रहे'],
    ['Chal raha', 'In progress', 'चल रहा'],
    ['⛔ Duplicate', '⛔ Duplicate', '⛔ डुप्लिकेट'],
    ['Complete ✓', 'Complete ✓', 'पूरा ✓'],
    ['Aaj warehouse ka haal', "Today's warehouse status", 'आज वेयरहाउस का हाल'],
    ['Sab kaam complete — shabaash!', 'All work complete — well done!', 'सारा काम पूरा — शाबाश!'],
    ['⚠️ Users me nahi', '⚠️ Not in Users', '⚠️ Users में नहीं'],
    ['sheet me data nahi', 'no data in sheet', 'शीट में डेटा नहीं'],
    ['Koi pick slip assign nahi hai', 'No pick slip assigned', 'कोई पिक स्लिप असाइन नहीं है'],
    ['Koi inward assign nahi hai', 'No inward assigned', 'कोई इनवर्ड असाइन नहीं है'],
    ['Naya kaam aate hi 🔔 notification aayega', "You'll get a 🔔 notification when new work comes", 'नया काम आते ही 🔔 नोटिफिकेशन आएगा'],
    ['Lines load ho rahi hain…', 'Loading lines…', 'लाइनें लोड हो रही हैं…'],
    ['📵 Offline — saved lines', '📵 Offline — saved lines', '📵 ऑफलाइन — सेव की हुई लाइनें'],
    ['👁 Sirf dekhne ke liye — ye document aapko assign nahi hai.', '👁 View only — this document is not assigned to you.', '👁 सिर्फ देखने के लिए — यह डॉक्यूमेंट आपको असाइन नहीं है।'],
    ['item(s) ke liye sheet me Batch / Barcode / Keyword / naam nahi hai — inko camera verify nahi kar sakta. GM sheet me Batch ya Keyword bhare.', 'item(s) have no Batch / Barcode / Keyword / name in the sheet — the camera cannot verify them. GM should fill Batch or Keyword in the sheet.', 'आइटम के लिए शीट में Batch / Barcode / Keyword / नाम नहीं है — कैमरा इन्हें चेक नहीं कर सकता। GM शीट में Batch या Keyword भरे।'],
    ['label se record', 'record from label', 'लेबल से रिकॉर्ड'],
    ['GM / Owner approve', 'GM / Owner approve', 'GM / Owner मंज़ूरी'],
    ['✔ Duplicate approved:', '✔ Duplicate approved:', '✔ डुप्लिकेट मंज़ूर:'],
    ['Check nahi:', 'Not checked:', 'चेक नहीं:'],
    ['(box pe nahi)', '(not on box)', '(डिब्बे पर नहीं)'],
    ['box pe nahi', 'not on box', 'डिब्बे पर नहीं'],
    ['galat scan', 'wrong scan', 'गलत स्कैन'],
    ['Kam mila', 'Short', 'कम मिला'],
    ['Koi line nahi', 'No lines', 'कोई लाइन नहीं'],
    ['Pick: koi bhi item', 'Pick: any item', 'पिक: कोई भी आइटम'],
    ['Inward: koi bhi item', 'Inward: any item', 'इनवर्ड: कोई भी आइटम'],
    ['Sheet me menu 📦 Pick Verify → App setup QR kholo aur QR camera ke saamne rakho.', 'In the Sheet open menu 📦 Pick Verify → App setup QR and hold the QR in front of the camera.', 'शीट में मेन्यू 📦 Pick Verify → App setup QR खोलो और QR कैमरे के सामने रखो।'],
    ['QR dhoondh raha hai…', 'Looking for QR…', 'QR ढूँढ रहा है…'],
    ['✅ Ho gaya — box hatao, agla box dikhao', '✅ Done — remove the box, show the next one', '✅ हो गया — डिब्बा हटाओ, अगला डिब्बा दिखाओ'],
    ['Match ho raha hai… phone hilao mat', 'Matching… keep the phone still', 'मैच हो रहा है… फ़ोन मत हिलाओ'],
    ['Batch / product code wali line (coding) bhi dikhao', 'Also show the batch / product code line (coding)', 'बैच / प्रोडक्ट कोड वाली लाइन (कोडिंग) भी दिखाओ'],
    ['Do items same lag rahe hain — product naam wala hissa dikhao', 'Two items look the same — show the product name part', 'दो आइटम एक जैसे लग रहे हैं — प्रोडक्ट नाम वाला हिस्सा दिखाओ'],
    ['Product code saaf nahi padha — coding wali line ke paas lao, roshni me', 'Product code not clear — bring the coding line closer, in good light', 'प्रोडक्ट कोड साफ नहीं पढ़ा — कोडिंग वाली लाइन पास लाओ, रोशनी में'],
    ['Product code saaf nahi padha', 'Product code not clear', 'प्रोडक्ट कोड साफ नहीं पढ़ा'],
    ['Label padh raha hai…', 'Reading label…', 'लेबल पढ़ रहा है…'],
    ['Qty zyada hai', 'Qty too high', 'मात्रा ज़्यादा है'],
    ['🔄 2 side se check ✓', '🔄 Checked from 2 sides ✓', '🔄 2 साइड से चेक ✓'],
    ['Batch record:', 'Batch recorded:', 'बैच रिकॉर्ड:'],
    ['🎉 Document complete!', '🎉 Document complete!', '🎉 डॉक्यूमेंट पूरा!'],
    ['✔ List pe jao', '✔ Back to list', '✔ लिस्ट पर जाओ'],
    ['📷 AGLA BOX', '📷 NEXT BOX', '📷 अगला डिब्बा'],
    ['Scan band karo', 'Stop scan', 'स्कैन बंद करो'],
    ['INWARD MAT KARO', 'DO NOT RECEIVE', 'इनवर्ड मत करो'],
    ['GALAT MAAL', 'WRONG GOODS', 'गलत माल'],
    ['MAT UTHAO', 'DO NOT PICK', 'मत उठाओ'],
    ['MAT LO', 'DO NOT TAKE', 'मत लो'],
    ['QTY POORI HAI', 'QTY ALREADY FULL', 'मात्रा पूरी है'],
    ['MATCH NAHI HUA', 'NO MATCH', 'मैच नहीं हुआ'],
    ['SAHI', 'CORRECT', 'सही'],
    ['Ye product is document me hai hi nahi.', 'This product is not in this document.', 'यह प्रोडक्ट इस डॉक्यूमेंट में है ही नहीं।'],
    ['Qty already poori hai', 'Qty already complete', 'मात्रा पहले ही पूरी है'],
    ['Wapas rakho.', 'Put it back.', 'वापस रखो।'],
    ['Slip se match nahi hua', 'Does not match the slip', 'स्लिप से मैच नहीं हुआ'],
    ['Neeche dekho kya alag hai 👇', 'See below what is different 👇', 'नीचे देखो क्या अलग है 👇'],
    ['OK — box wapas rakh diya', 'OK — box put back', 'ठीक है — डिब्बा वापस रख दिया'],
    ['count cancel', 'count cancelled', 'गिनती रद्द'],
    ['Sab items complete hain', 'All items are complete', 'सारे आइटम पूरे हैं'],
    ['Box pe jo likha hai woh bharo', 'Fill in what is written on the box', 'डिब्बे पर जो लिखा है वो भरो'],
    ['GM / Owner PIN daalo', 'Enter GM / Owner PIN', 'GM / Owner PIN डालो'],
    ['Server pe check ho raha hai…', 'Checking on server…', 'सर्वर पर चेक हो रहा है…'],
    ['Pehle GM / Owner approve kare.', 'GM / Owner must approve first.', 'पहले GM / Owner मंज़ूरी दे।'],
    ['Details slip se match nahi', 'Details do not match the slip', 'डिटेल स्लिप से मैच नहीं'],
    ['Poori details chahiye', 'Full details needed', 'पूरी डिटेल चाहिए'],
    ['Batch / product naam / MRP / weight sab bharo.', 'Fill batch / product name / MRP / weight.', 'बैच / प्रोडक्ट नाम / MRP / वज़न सब भरो।'],
    ['GM / Owner approval', 'GM / Owner approval', 'GM / Owner मंज़ूरी'],
    ['PIN daalo', 'Enter PIN', 'PIN डालो'],
    ['Kya ye sach me naya dispatch hai (partial delivery / naya order)? Approve karne ke baad hi pick hoga. Ye ScanLog + Violations me aapke naam se likha jayega aur HO ko mail jayega.', 'Is this really a new dispatch (partial delivery / new order)? It can be picked only after approval. This is recorded in ScanLog + Violations under your name and mailed to HO.', 'क्या यह सच में नया डिस्पैच है (आंशिक डिलीवरी / नया ऑर्डर)? मंज़ूरी के बाद ही पिक होगा। यह ScanLog + Violations में आपके नाम से लिखा जाएगा और HO को मेल जाएगा।'],
    ['Haan, approve', 'Yes, approve', 'हाँ, मंज़ूर'],
    ['Approve ho raha hai…', 'Approving…', 'मंज़ूरी हो रही है…'],
    ['✔ Approved — ab scan kar sakte ho', '✔ Approved — you can scan now', '✔ मंज़ूर — अब स्कैन कर सकते हो'],
    ['Scan hua:', 'Scanned:', 'स्कैन हुआ:'],
    ['Kitna mila? (zaroori)', 'How many found? (required)', 'कितना मिला? (ज़रूरी)'],
    ['Khule pieces', 'Loose pieces', 'खुले पीस'],
    ['Khule pcs', 'Loose pcs', 'खुले पीस'],
    ['Reason (zaroori)', 'Reason (required)', 'कारण (ज़रूरी)'],
    ['Stock nahi mila', 'Stock not found', 'स्टॉक नहीं मिला'],
    ['Expiry / near expiry', 'Expiry / near expiry', 'एक्सपायरी / एक्सपायरी के पास'],
    ['Batch alag hai', 'Different batch', 'बैच अलग है'],
    ['Location pe nahi', 'Not at location', 'लोकेशन पर नहीं'],
    ['Other ho to zaroori', 'Required if Other', 'अन्य हो तो ज़रूरी'],
    ['Short save karo', 'Save short', 'कम सेव करो'],
    ['Total mila:', 'Total found:', 'कुल मिला:'],
    ['Kitna mila — number daalna zaroori hai', 'How many found — a number is required', 'कितना मिला — नंबर डालना ज़रूरी है'],
    ['Poora mila to Kam mila nahi — baaki boxes scan karo', 'If all were found it is not short — scan the remaining boxes', 'पूरा मिला तो कम मिला नहीं — बाकी डिब्बे स्कैन करो'],
    ['Reason chuno', 'Choose a reason', 'कारण चुनो'],
    ['"Other" ke saath remark likho', 'Write a remark with "Other"', '"Other" के साथ टिप्पणी लिखो'],
    ['"Other" ke saath remark likhna zaroori hai', 'A remark is required with "Other"', '"Other" के साथ टिप्पणी लिखना ज़रूरी है'],
    ['Short save ho raha hai…', 'Saving short…', 'कम सेव हो रहा है…'],
    ['✔ Saari lines ho gayi — Document close karo', '✔ All lines done — close the document', '✔ सारी लाइनें हो गईं — डॉक्यूमेंट बंद करो'],
    ['Short save ✔', 'Short saved ✔', 'कम सेव ✔'],
    ['Network chahiye — Kam mila online hi save hota hai', 'Internet needed — short is saved only online', 'नेट चाहिए — कम मिला ऑनलाइन ही सेव होता है'],
    ['Report load ho raha hai…', 'Loading report…', 'रिपोर्ट लोड हो रही है…'],
    ['Report nahi mila — ⟳ dabao', 'No report — tap ⟳', 'रिपोर्ट नहीं मिली — ⟳ दबाओ'],
    ['Sahi scans', 'Correct scans', 'सही स्कैन'],
    ['Galat scans', 'Wrong scans', 'गलत स्कैन'],
    ['Accuracy %', 'Accuracy %', 'सटीकता %'],
    ['Dispatch qty', 'Dispatch qty', 'डिस्पैच मात्रा'],
    ['Inward qty', 'Inward qty', 'इनवर्ड मात्रा'],
    ['Short lines', 'Short lines', 'कम लाइनें'],
    ['Dup try', 'Dup attempts', 'डुप्लिकेट कोशिश'],
    ['Short close', 'Short close', 'कम के साथ बंद'],
    ['Assign nahi', 'Not assigned', 'असाइन नहीं'],
    ['Supervisor efficiency', 'Supervisor efficiency', 'सुपरवाइज़र कार्यक्षमता'],
    ['Abhi koi scan nahi', 'No scans yet', 'अभी कोई स्कैन नहीं'],
    ['Koi violation nahi ✔', 'No violations ✔', 'कोई उल्लंघन नहीं ✔'],
    ['Koi short nahi', 'No shorts', 'कोई कमी नहीं'],
    ['Pending documents', 'Pending documents', 'बाकी डॉक्यूमेंट'],
    ['Sab complete ✔', 'All complete ✔', 'सब पूरा ✔'],
    ['Document complete. Close karein?', 'Document complete. Close it?', 'डॉक्यूमेंट पूरा। बंद करें?'],
    ['Close karo', 'Close', 'बंद करो'],
    ['Close ho raha hai…', 'Closing…', 'बंद हो रहा है…'],
    ['Done ✔', 'Done ✔', 'पूरा ✔'],
    ['Pending sync:', 'Pending sync:', 'बाकी सिंक:'],
    ['Kiska PIN', 'Whose PIN', 'किसका PIN'],
    ['Naya PIN (4-6 number)', 'New PIN (4-6 digits)', 'नया PIN (4-6 अंक)'],
    ['Naya PIN dobara', 'New PIN again', 'नया PIN दोबारा'],
    ['Sheet me PIN 🔒 chhupa rehta hai — koi padh nahi sakta. Naya PIN sirf us bande ko batao.', 'PINs stay hidden 🔒 in the Sheet — nobody can read them. Tell the new PIN only to that person.', 'शीट में PIN 🔒 छुपा रहता है — कोई पढ़ नहीं सकता। नया PIN सिर्फ उसी व्यक्ति को बताओ।'],
    ['PIN 4 se 6 number ka hona chahiye', 'PIN must be 4 to 6 digits', 'PIN 4 से 6 अंक का होना चाहिए'],
    ['PIN 4 se 6 number ka', 'PIN must be 4 to 6 digits', 'PIN 4 से 6 अंक का'],
    ['Dono PIN same nahi', 'The two PINs do not match', 'दोनों PIN एक जैसे नहीं'],
    ['PIN badal raha hai…', 'Changing PIN…', 'PIN बदल रहा है…'],
    ['✔ PIN badal gaya — agli baar naye PIN se login', '✔ PIN changed — use the new PIN next time', '✔ PIN बदल गया — अगली बार नए PIN से लॉगिन'],
    ['PIN reset ho raha hai…', 'Resetting PIN…', 'PIN रीसेट हो रहा है…'],
    ['📦 BOX mode — 1 scan = poora box (Case Size)', '📦 BOX mode — 1 scan = full box (Case Size)', '📦 बॉक्स मोड — 1 स्कैन = पूरा डिब्बा (Case Size)'],
    ['Sync try ho raha hai…', 'Trying to sync…', 'सिंक की कोशिश हो रही है…'],
    ['API key galat hai — app me setup QR dobara scan karo', 'Wrong API key — scan the setup QR again in the app', 'API key गलत है — ऐप में सेटअप QR दोबारा स्कैन करो'],
    ['Duplicate approve sirf GM / Owner kar sakta hai', 'Only GM / Owner can approve duplicates', 'डुप्लिकेट मंज़ूरी सिर्फ GM / Owner दे सकता है'],
    ['Kitna mila — qty daalna zaroori hai', 'How many found — qty is required', 'कितना मिला — मात्रा डालना ज़रूरी है'],
    ['Line nahi mili — refresh karo', 'Line not found — refresh', 'लाइन नहीं मिली — रिफ्रेश करो'],
    ['Manual entry ke liye GM / Owner ka naam + PIN chahiye', 'Manual entry needs GM / Owner name + PIN', 'मैनुअल एंट्री के लिए GM / Owner का नाम + PIN चाहिए'],
    ['Naam ya PIN galat hai', 'Wrong name or PIN', 'नाम या PIN गलत है'],
    ['Owner ka PIN sirf Owner badal sakta hai', "Only the Owner can change the Owner's PIN", 'Owner का PIN सिर्फ Owner बदल सकता है'],
    ['PIN reset sirf GM / Owner kar sakte hain', 'Only GM / Owner can reset PINs', 'PIN रीसेट सिर्फ GM / Owner कर सकते हैं'],
    ['Report sirf GM / Owner / Operator dekh sakte hain', 'Only GM / Owner / Operator can see the report', 'रिपोर्ट सिर्फ GM / Owner / Operator देख सकते हैं'],
    ['Scan data nahi mila', 'Scan data not received', 'स्कैन डेटा नहीं मिला'],
    ['Short ka reason chuno', 'Choose a reason for short', 'कम का कारण चुनो'],
    ['Type galat hai', 'Wrong type', 'टाइप गलत है'],
    ['Ye document aapko assign nahi hai', 'This document is not assigned to you', 'यह डॉक्यूमेंट आपको असाइन नहीं है'],
    ['Ye line pehle se complete / short hai', 'This line is already complete / short', 'यह लाइन पहले से पूरी / कम है'],
    ['Ye naam Users me (Active) nahi', 'This name is not in Users (Active)', 'यह नाम Users में (Active) नहीं'],
    ['Ye naam Users me nahi', 'This name is not in Users', 'यह नाम Users में नहीं'],
    ['Do alag MRP dikh rahe — ek hi box frame me rakho', 'Two different MRPs visible — keep only one box in frame', 'दो अलग MRP दिख रहे — एक ही डिब्बा फ्रेम में रखो'],
    ['Do alag batch dikh rahe — ek hi box frame me rakho', 'Two different batches visible — keep only one box in frame', 'दो अलग बैच दिख रहे — एक ही डिब्बा फ्रेम में रखो'],
    ['Keyword ke shabd saath me nahi mile (coding line dikhao)', 'Keyword words not found together (show the coding line)', 'कीवर्ड के शब्द साथ में नहीं मिले (कोडिंग लाइन दिखाओ)'],
    ['Wholesale carton: naam se pehchan nahi — code / batch / keyword chahiye', 'Wholesale carton: name is not proof — code / batch / keyword needed', 'होलसेल कार्टन: नाम से पहचान नहीं — कोड / बैच / कीवर्ड चाहिए'],
    ['Keyword nahi dikha:', 'Keyword not seen:', 'कीवर्ड नहीं दिखा:'],
    ['Batch nahi dikha', 'Batch not seen', 'बैच नहीं दिखा'],
    ['Weight nahi dikha', 'Weight not seen', 'वज़न नहीं दिखा'],
    ['MRP nahi dikha', 'MRP not seen', 'MRP नहीं दिखा'],
    ['MRP saaf nahi', 'MRP not clear', 'MRP साफ नहीं'],
    ['Same line do baar aayi', 'Same line came twice', 'वही लाइन दो बार आई'],
    ['same item', 'same item', 'वही आइटम'],
    ['same qty', 'same qty', 'वही मात्रा'],
    ['Warehouse:', 'Warehouse:', 'वेयरहाउस:'],
    ['PICKING', 'PICKING', 'पिकिंग'], ['INWARD', 'INWARD', 'इनवर्ड'], ['📊 REPORT', '📊 REPORT', '📊 रिपोर्ट'],
    ['Picking', 'Picking', 'पिकिंग'], ['Inward', 'Inward', 'इनवर्ड'],
    ['📦 BOX', '📦 BOX', '📦 बॉक्स'], ['PCS', 'PCS', 'पीस'], ['📷 SCAN', '📷 SCAN', '📷 स्कैन'],
    ['IN PROGRESS', 'IN PROGRESS', 'चालू'], ['CLOSED-SHORT', 'CLOSED-SHORT', 'कम के साथ बंद'], ['UNASSIGNED', 'UNASSIGNED', 'असाइन नहीं'],
    ['PENDING', 'PENDING', 'बाकी'], ['PARTIAL', 'PARTIAL', 'आधा'], ['PICKED', 'PICKED', 'उठाया'], ['RECEIVED', 'RECEIVED', 'मिला'],
    ['SHORT', 'SHORT', 'कम'], ['OPEN', 'OPEN', 'नया'], ['DONE', 'DONE', 'पूरा'], ['DUPLICATE', 'DUPLICATE', 'डुप्लिकेट'], ['EXTRA', 'EXTRA', 'एक्स्ट्रा'],
    ['Settings', 'Settings', 'सेटिंग्स'], ['Sound', 'Sound', 'आवाज़'], ['Logout', 'Logout', 'लॉगआउट'], ['Close', 'Close', 'बंद करो'],
    ['Cancel', 'Cancel', 'रद्द करो'], ['Approve', 'Approve', 'मंज़ूर करो'], ['Save', 'Save', 'सेव करो'], ['Download', 'Download', 'डाउनलोड'],
    ['Nahi', 'No', 'नहीं'], ['Haan', 'Yes', 'हाँ'], ['OK', 'OK', 'ठीक है'],
    ['Naam', 'Name', 'नाम'], ['Item', 'Item', 'आइटम'], ['Remark', 'Remark', 'टिप्पणी'], ['Reason', 'Reason', 'कारण'],
    ['Barcode', 'Barcode', 'बारकोड'], ['Code', 'Code', 'कोड'], ['Product', 'Product', 'प्रोडक्ट'], ['Weight', 'Weight', 'वज़न'], ['Wt', 'Wt', 'वज़न'],
    ['Batch', 'Batch', 'बैच'], ['Keyword', 'Keyword', 'कीवर्ड'], ['Slip:', 'Slip:', 'स्लिप:'], ['Slip', 'Slip', 'स्लिप'], ['Box', 'Box', 'डिब्बा'], ['box', 'box', 'डिब्बा'],
    ['Short:', 'Short:', 'कम:'], ['Short', 'Short', 'कम'], ['short', 'short', 'कम'], ['Manual', 'Manual', 'मैनुअल'], ['(manual)', '(manual)', '(मैनुअल)'], ['(record)', '(record)', '(रिकॉर्ड)'],
    ['Stock', 'Stock', 'स्टॉक'], ['Damage', 'Damage', 'डैमेज'], ['Other', 'Other', 'अन्य'],
    ['Pieces', 'Pieces', 'पीस'], ['Pcs', 'Pcs', 'पीस'], ['pcs', 'pcs', 'पीस'], ['piece', 'piece', 'पीस'],
    ['lines', 'lines', 'लाइनें'], ['line', 'line', 'लाइन'], ['Qty', 'Qty', 'मात्रा'], ['qty', 'qty', 'मात्रा'],
    ['Documents', 'Documents', 'डॉक्यूमेंट'], ['Violations', 'Violations', 'उल्लंघन'], ['Complete', 'Complete', 'पूरे'],
    ['Sahi', 'Correct', 'सही'], ['Galat', 'Wrong', 'गलत'], ['Acc %', 'Acc %', 'सटीकता %'], ['Time', 'Time', 'समय'], ['/hr', '/hr', '/घंटा'],
    ['Aaj', 'Today', 'आज'], ['Kal', 'Yesterday', 'कल'], ['7 din', '7 days', '7 दिन'], ['updated', 'updated', 'अपडेट'], ['by', 'by', 'द्वारा'],
    ['User:', 'User:', 'यूज़र:'], ['Owner', 'Owner', 'ओनर'], ['Operator', 'Operator', 'ऑपरेटर'], ['Supervisor', 'Supervisor', 'सुपरवाइज़र'],
    ['Invoice', 'Invoice', 'इनवॉइस'], ['Order', 'Order', 'ऑर्डर'], ['Party', 'Party', 'पार्टी'], ['pending', 'pending', 'बाकी']
  ];
  var I18T = [   // sentences with numbers / names inside: [pattern, English, हिंदी]
    [/Aaj aapke (\d+) document baaki hain/, 'You have $1 documents pending today', 'आज आपके $1 डॉक्यूमेंट बाकी हैं'],
    [/isi document me (\d+) qty pehle hi pick\/receive ho chuka/, '$1 qty already picked/received in this document', 'इसी डॉक्यूमेंट में $1 मात्रा पहले ही पिक/रिसीव हो चुकी'],
    [/(\S+) me (\d+) qty pehle hi pick\/receive ho chuka/, '$2 qty already picked/received in $1', '$1 में $2 मात्रा पहले ही पिक/रिसीव हो चुकी'],
    [/isi document me bhi hai \(abhi pending\)/, 'also in this document (still pending)', 'इसी डॉक्यूमेंट में भी है (अभी बाकी)'],
    [/(\S+) me bhi hai \(abhi pending\)/, 'also in $1 (still pending)', '$1 में भी है (अभी बाकी)'],
    [/Sirf (\d+) pcs baaki hai \((.+?)\), aapne (\d+) pcs set kiya hai/, 'Only $1 pcs left ($2), you set $3 pcs', 'सिर्फ $1 पीस बाकी हैं ($2), आपने $3 पीस सेट किए हैं'],
    [/PCS (\d+) karo aur dobara scan/, 'Set PCS to $1 and scan again', 'PCS $1 करो और दोबारा स्कैन'],
    [/\(Is item ka Case Size sheet me nahi — (\d+) pcs gina\)/, '(No Case Size for this item in the sheet — counted $1 pcs)', '(इस आइटम का Case Size शीट में नहीं — $1 पीस गिने)'],
    [/Ye "([^"]*)" hai,\n"([^"]*)" nahi\./, 'This is "$1",\nnot "$2".', 'यह "$1" है,\n"$2" नहीं।'],
    [/🔄 Dabba ghumao — (.+) wali side dikhao/, '🔄 Turn the box — show the $1 side', '🔄 डिब्बा घुमाओ — $1 वाली साइड दिखाओ'],
    [/📦 BOX mode: 1 scan = (\d+) poora box\./, '📦 BOX mode: 1 scan = $1 full box.', '📦 बॉक्स मोड: 1 स्कैन = $1 पूरा डिब्बा।'],
    [/PCS mode — 1 scan = (\d+) piece/, 'PCS mode — 1 scan = $1 piece', 'पीस मोड — 1 स्कैन = $1 पीस'],
    [/Server ne ek count reject kiya \(row (\d+)\) — dobara scan karo/, 'Server rejected one count (row $1) — scan again', 'सर्वर ने एक गिनती रिजेक्ट की (row $1) — दोबारा स्कैन करो'],
    [/Pehle sync hone do \((\d+) pending\), phir Kam mila/, 'Let sync finish first ($1 pending), then Short', 'पहले सिंक होने दो ($1 बाकी), फिर कम मिला'],
    [/Pehle sync hone do \((\d+) pending\)/, 'Let sync finish first ($1 pending)', 'पहले सिंक होने दो ($1 बाकी)'],
    [/(\d+) line baaki hai — har line scan karo ya "Kam mila" \+ reason do/, '$1 line(s) left — scan every line or give "Short" + reason', '$1 लाइन बाकी है — हर लाइन स्कैन करो या "कम मिला" + कारण दो'],
    [/Aapne (\d+) likha, scan sirf (\d+) hua\. Jo mila hai woh pehle scan karo\./, 'You wrote $1, only $2 scanned. Scan what you found first.', 'आपने $1 लिखा, स्कैन सिर्फ $2 हुआ। जो मिला है वो पहले स्कैन करो।'],
    [/Aapne (\d+) likha, par scan (\d+) hua hai\. Jo mila hai woh scan karo, phir Kam mila karo\./, 'You wrote $1, but $2 were scanned. Scan what you found, then mark Short.', 'आपने $1 लिखा, पर स्कैन $2 हुआ है। जो मिला है वो स्कैन करो, फिर कम मिला करो।'],
    [/Scan (\d+) ho chuka hai — mila usse kam nahi ho sakta\. Sahi number daalo\./, '$1 already scanned — found cannot be less. Enter the right number.', 'स्कैन $1 हो चुका है — मिला उससे कम नहीं हो सकता। सही नंबर डालो।'],
    [/⚠️ scan (\d+) hua hai/, '⚠️ $1 scanned', '⚠️ स्कैन $1 हुआ है'],
    [/Sirf (\d+) baaki hai\./, 'Only $1 left.', 'सिर्फ $1 बाकी है।'],
    [/Closed — (\d+) short/, 'Closed — $1 short', 'बंद — $1 कम'],
    [/(\d+) scan abhi sync nahi hue\.\nPhir bhi logout\?/, '$1 scans not synced yet.\nLogout anyway?', '$1 स्कैन अभी सिंक नहीं हुए।\nफिर भी लॉगआउट?'],
    [/✔ (.+) ka naya PIN set — usko batao/, '✔ New PIN set for $1 — tell them', '✔ $1 का नया PIN सेट — उसे बताओ'],
    [/"([^"]*)" sheet me nahi mila/, '"$1" not found in sheet', '"$1" शीट में नहीं मिला'],
    [/"([^"]*)" tab nahi mila\. Apps Script me setupSheets ek baar Run karo\./, '"$1" tab not found. Run setupSheets once in Apps Script.', '"$1" टैब नहीं मिला। Apps Script में setupSheets एक बार Run करो।']
  ];
  var I18X = null, I18C = {}, I18N_N = 0;
  function tr(s) {
    if (LANG === 'hl' || !s || !/[A-Za-z]/.test(s)) return s;
    var ck = LANG + '|' + s; if (I18C.hasOwnProperty(ck)) return I18C[ck];
    if (!I18X) {                // CAPS words (PENDING, OPEN, EXTRA…) only as a whole label, never inside product names
      var map = {}; I18N.forEach(function (e) { map[e[0]] = e; });
      var keys = Object.keys(map).filter(function (k) { return !/^[A-Z][A-Z-]*$/.test(k) && k !== 'IN PROGRESS'; }).sort(function (a, b) { return b.length - a.length; });
      I18X = { map: map, rx: new RegExp('(^|[^A-Za-z])(' + keys.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')(?![A-Za-z])', 'g') };
    }
    var col = LANG === 'en' ? 1 : 2, out = String(s), tt = out.trim();
    if (I18X.map.hasOwnProperty(tt)) { out = out.replace(tt, I18X.map[tt][col]); I18C[ck] = out; return out; }
    I18T.forEach(function (t) { out = out.replace(t[0], t[col]); });
    out = out.replace(I18X.rx, function (m, pre, k) { return pre + I18X.map[k][col]; });
    if (++I18N_N > 4000) { I18C = {}; I18N_N = 0; }
    I18C[ck] = out;
    return out;
  }
  var NT = '.nm, #inUser, #aaName, #mAdmin, #pfWho, #mLine, #devCam, [data-nt], script, style';
  function i18nNode(t, force) {
    var p = t.parentNode;
    if (!p || p.nodeType !== 1 || p.closest(NT)) return;
    if (!force && t.__t === t.nodeValue) return;             // our own change
    var orig = force && t.__o != null ? t.__o : t.nodeValue;
    if (LANG === 'hl' && t.__o == null) return;               // never translated: already Hinglish
    var out = tr(orig);
    t.__o = orig; t.__t = out;
    if (t.nodeValue !== out) t.nodeValue = out;
  }
  function i18nEl(el, force) {
    if (!el) return;
    if (el.nodeType === 3) return i18nNode(el, force);
    if (el.nodeType !== 1 || el.closest(NT)) return;
    [el].concat([].slice.call(el.querySelectorAll('[placeholder]'))).forEach(function (x) {
      if (!x.hasAttribute('placeholder') || x.closest(NT)) return;
      if (x.__ph == null) { if (LANG === 'hl') return; x.__ph = x.getAttribute('placeholder'); }
      var v = tr(x.__ph); if (x.getAttribute('placeholder') !== v) x.setAttribute('placeholder', v);
    });
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false), n;
    while ((n = w.nextNode())) i18nNode(n, force);
  }
  function langButtons() {
    [].forEach.call(document.querySelectorAll('[data-lang]'), function (b) { b.classList.toggle('on', b.getAttribute('data-lang') === LANG); });
    document.documentElement.lang = LANG === 'hi' ? 'hi' : 'en';
  }
  function setLang(v) {
    LANG = v === 'en' || v === 'hi' ? v : 'hl';
    pset('lang', LANG); I18C = {};
    i18nEl(document.body, true);
    langButtons();
  }
  function i18nStart() {
    langButtons();
    if (LANG !== 'hl') i18nEl(document.body, true);
    new MutationObserver(function (recs) {
      if (LANG === 'hl') return;
      recs.forEach(function (r) {
        if (r.type === 'characterData') i18nNode(r.target, false);
        else for (var i = 0; i < r.addedNodes.length; i++) i18nEl(r.addedNodes[i], false);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-lang]'); if (b) setLang(b.getAttribute('data-lang')); });
  }

  /* ===================== state ===================== */
  var S = {
    cfg: pget('cfg', null), user: pget('user', null), set: pget('settings', { auto: false, sound: true }),
    users: pget('users', []), docs: pget('docs', []), tab: 'PICK', cur: null, qty: 1,
    queue: pget('queue', []), view: '', scan: null, syncing: false, netDown: false,
    unit: 'PCS', wh: pget('wh', ''), shortReasons: pget('shortReasons', null), report: null, repRange: 'today'
  };
  var SHORT_DEF = ['Stock nahi mila', 'Damage', 'Expiry / near expiry', 'Batch alag hai', 'Location pe nahi', 'Other'];
  var ROLE_LABEL = { OWNER: 'Owner', GM: 'GM', ADMIN: 'GM', OPERATOR: 'Operator', SUPERVISOR: 'Supervisor' };
  function isApprover() { return !!S.user && /^(OWNER|GM|ADMIN)$/.test(S.user.role); }
  function seesAll() { return isApprover() || (!!S.user && S.user.role === 'OPERATOR'); }
  function nat(fn, a, b) {                     // optional native features (older app builds simply don't have them)
    try { if (N[fn]) return b !== undefined ? N[fn](a, b) : a !== undefined ? N[fn](a) : N[fn](); } catch (e) { }
  }

  /* ===================== HTTP ===================== */
  var httpWait = {}, httpSeq = 0;
  window.onHttp = function (id, status, text) {
    var w = httpWait[id]; if (!w) return;
    delete httpWait[id]; clearTimeout(w.t); w.done(Number(status) || 0, String(text == null ? '' : text));
  };
  function NetErr(m) { this.message = m; this.net = true; }
  NetErr.prototype = Object.create(Error.prototype);
  function api(action, body, timeoutMs) {
    body = body || {};
    body.action = action; body.key = S.cfg && S.cfg.k;
    if (S.user && !body.user) { body.user = S.user.name; body.pin = S.user.pin; }
    return new Promise(function (resolve, reject) {
      if (!S.cfg || !S.cfg.u) return reject(new Error('Server setup nahi hua'));
      var id = 'h' + (++httpSeq) + '_' + Date.now();
      var t = setTimeout(function () { delete httpWait[id]; reject(new NetErr('Network slow / band hai')); }, timeoutMs || 45000);
      httpWait[id] = {
        t: t, done: function (status, text) {
          if (!status || status >= 500) return reject(new NetErr('Network / server error (' + status + ')'));
          var j;
          try { j = JSON.parse(text); } catch (e) { return reject(new NetErr('Server ka jawab galat — Web app deploy (Anyone) check karo')); }
          if (!j.ok) return reject(new Error(j.error || 'Error'));
          S.netDown = false;
          resolve(j);
        }
      };
      try { N.http(id, S.cfg.u, JSON.stringify(body)); } catch (e) { clearTimeout(t); delete httpWait[id]; reject(new NetErr(String(e))); }
    });
  }

  /* ===================== UI helpers ===================== */
  var VIEWS = ['vSetup', 'vLogin', 'vHome', 'vDoc'];
  function show(v) {
    S.view = v;
    VIEWS.forEach(function (x) { $(x).classList.toggle('hide', x !== v); });
    window.scrollTo(0, 0);
    header();
  }
  function header() {
    var v = S.view, app = (S.cfg && S.cfg.n) || 'MRCGZB Pick/IN';
    $('hLogo').classList.toggle('hide', v === 'vDoc');
    $('hBack').classList.toggle('hide', v !== 'vDoc');
    $('hRefresh').classList.toggle('hide', !(v === 'vHome' || v === 'vDoc'));
    $('hMenu').classList.toggle('hide', !(v === 'vHome' || v === 'vDoc'));
    var title = app, sub = '';
    if (v === 'vHome' && S.user) sub = (S.wh ? '🏭 ' + S.wh + ' · ' : '') + (ROLE_LABEL[S.user.role] || S.user.role);
    if (v === 'vDoc' && S.cur) { title = S.cur.doc; sub = (S.cur.type === 'PICK' ? 'Picking' : 'Inward') + ' · ' + (S.user ? S.user.name : ''); }
    $('hTitle').innerHTML = esc(title) + '<small>' + esc(sub) + '</small>';
    renderSync();
  }
  function renderSync() {
    var n = S.queue.length, b = $('hSync');
    b.classList.toggle('hide', !n);
    b.textContent = (S.netDown ? '📵 ' : '⏳ ') + n + ' sync';
  }
  function busy(m) { if (m === false) { $('busy').classList.add('hide'); return; } $('busyMsg').textContent = m; $('busy').classList.remove('hide'); }
  var toastT;
  function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 3800); }
  function ask(msg, okLabel) {
    return new Promise(function (resolve) {
      var d = document.createElement('div');
      d.className = 'sheet';
      d.innerHTML = '<div class="pn"><p style="font-size:18px;font-weight:700;white-space:pre-line">' + esc(msg) + '</p>' +
        '<div class="row"><button class="btn" data-a="0">Nahi</button><button class="btn p grow" data-a="1">' + esc(okLabel || 'Haan') + '</button></div></div>';
      d.onclick = function (e) { var b = e.target.closest('[data-a]'); if (!b) return; document.body.removeChild(d); resolve(b.getAttribute('data-a') === '1'); };
      document.body.appendChild(d);
    });
  }
  function feedback(kind) {
    try { N.vibrate(JSON.stringify(kind === 'ok' ? [0, 90] : kind === 'bad' ? [0, 400, 120, 400, 120, 400] : [0, 150, 100, 150])); } catch (e) { }
    if (S.set.sound) { try { N.beep(kind); } catch (e) { } }
  }
  function nm(l) { return l ? (l.name || l.sku || l.barcode || ('Row ' + l.row)) : ''; }
  function isDone(l) { return l.qty <= 0 || l.done >= l.qty || l.status === 'SHORT'; }
  function dupBlocked(l) { return !!(l && l.dup && l.dup.level === 'BLOCK' && !l.dup.approved); }
  function verb() { return S.cur && S.cur.type === 'INWARD' ? 'RECEIVED' : 'PICKED'; }

  /* ===================== setup ===================== */
  function goSetup() { show('vSetup'); }
  function saveCfg(u, k, n) {
    S.cfg = { u: String(u).trim(), k: String(k).trim(), n: n || 'Pick Verify' };
    pset('cfg', S.cfg);
    goLogin();
  }
  function onQR(frame) {
    for (var i = 0; i < frame.c.length; i++) {
      var o = null;
      try { o = JSON.parse(frame.c[i]); } catch (e) { }
      if (o && o.pv === 1 && o.u && o.k) { stopScan(); feedback('ok'); toast('Setup ho gaya ✔'); saveCfg(o.u, o.k, o.n); return; }
    }
    if (frame.c.length) $('sMsg').textContent = 'Ye Pick Verify ka setup QR nahi hai';
  }

  /* ===================== login ===================== */
  function goLogin() {
    S.user = null;
    show('vLogin'); fillUsers();
    $('loginErr').classList.add('hide');
    busy('Server se connect ho raha hai…');
    api('ping').then(function (r) {
      S.users = r.users || []; pset('users', S.users);
      if (r.app) { S.cfg.n = r.app; pset('cfg', S.cfg); header(); }
      if (r.warehouse) { S.wh = r.warehouse; pset('wh', S.wh); }
      pset('autoUpdate', r.autoUpdate !== false);
      $('loginWh').textContent = S.wh ? '🏭 Warehouse: ' + S.wh : '';
      if (S.cfg && S.cfg.n) $('loginApp').textContent = S.cfg.n;
      fillUsers();
      if (!S.users.length) loginError('Sheet ke Users tab me koi Active = YES naam nahi hai.');
    }).catch(function (e) { loginError(e.message); }).then(function () { busy(false); applyUpdateIfIdle(); });
  }
  /* connection problem on the login screen stays visible (a toast is gone before anyone reads it) */
  function loginError(m) {
    var hint = /deploy|Anyone|jawab galat/i.test(m) ? '<br>Laptop: Apps Script → Deploy → Manage deployments → ✏ Edit → Execute as: <b>Me</b>, Who has access: <b>Anyone</b> → New version → Deploy.'
      : /API key/i.test(m) ? '<br>Sheet menu → 📱 App setup QR → neeche "Server badlo (setup)" se QR dobara scan karo.'
      : /Network|slow|band/i.test(m) ? '<br>Net check karo (WiFi / data), phir dobara try.' : '';
    $('loginErrMsg').innerHTML = '⚠️ Server se naam nahi aaye: ' + esc(m) + hint;
    $('loginErr').classList.remove('hide');
  }
  function fillUsers() {
    var cur = $('inUser').value, last = pget('lastName', '');
    $('inUser').innerHTML = '<option value="">— naam chuno —</option>' + S.users.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('');
    var pick = cur && S.users.indexOf(cur) !== -1 ? cur : last;            // don't overwrite a name the user already picked
    if (pick && S.users.indexOf(pick) !== -1) $('inUser').value = pick;
  }
  function doLogin() {
    var name = $('inUser').value, pin = $('inPin').value.trim();
    if (!name || !pin) return toast('Naam aur PIN daalo');
    busy('Login…');
    api('login', { user: name, pin: pin }).then(function (r) {
      S.user = { name: r.user.name, role: r.user.role, pin: pin }; pset('user', S.user); pset('lastName', r.user.name);
      if (r.warehouse) { S.wh = r.warehouse; pset('wh', S.wh); }
      if (r.shortReasons) { S.shortReasons = r.shortReasons; pset('shortReasons', S.shortReasons); }
      $('inPin').value = '';
      S.seeded = false; pset('seen', []);
      nat('askNotify'); nat('background', true);
      S.tab = seesAll() ? 'REPORT' : 'PICK';
      goHome();
    }).catch(function (e) { toast('⚠️ ' + e.message); }).then(function () { busy(false); });
  }

  /* ===================== home: assigned documents ===================== */
  function goHome() { S.cur = null; show('vHome'); renderDocs(); loadDocs(); if (S.tab === 'REPORT') loadReport(); applyUpdateIfIdle(); }

  /* ===================== live update: new screens / rules arrive without a new APK ===================== */
  var updReady = 0, apkAsked = false;
  window.onUpdateReady = function (v) { updReady = v; applyUpdateIfIdle(); };
  function applyUpdateIfIdle() {
    if (!updReady || !N.reloadApp) return;
    if (S.scan || S.queue.length || ['vLogin', 'vHome', 'vSetup'].indexOf(S.view) === -1) return;     // never in the middle of work
    updReady = 0;
    toast('✨ App update ho raha hai…');
    setTimeout(function () { N.reloadApp(); }, 1200);
  }
  window.onApkNeeded = function (v, url) {
    if (apkAsked || !N.openUrl) return;
    apkAsked = true;
    ask('Is update ke liye naya APK chahiye (ek baar). Abhi download karein? Install karne pe login aur data rehta hai.', 'Download').then(function (ok) { if (ok) N.openUrl(url); });
  };
  function loadDocs(silent) {
    if (!silent) busy('Documents load ho rahe hain…');
    return api('docs').then(function (r) {
      S.docs = r.docs || []; pset('docs', S.docs);
      if (r.warehouse && r.warehouse !== S.wh) { S.wh = r.warehouse; pset('wh', S.wh); header(); }
      checkNew();
      if (S.view === 'vHome' && S.tab !== 'REPORT') renderDocs();
    }).catch(function (e) {
      if (silent) return;
      if (e.net) { S.netDown = true; toast('📵 Offline — purani list dikh rahi hai'); } else toast('⚠️ ' + e.message);
      if (/PIN/.test(e.message)) logout();
    }).then(function () { if (!silent) busy(false); renderSync(); });
    if (!S.users.length || isApprover()) api('ping').then(function (r) { S.users = r.users || []; pset('users', S.users); }).catch(function () { });
  }
  /* new assignment (supervisor) / new duplicate (GM, Owner, Operator) -> phone notification. Same keys as the Android background check. */
  function noteKeys() {
    var me = S.user ? S.user.name.toLowerCase() : '', all = seesAll(), out = [];
    S.docs.forEach(function (d) {
      var label = (d.type === 'PICK' ? 'Pick Slip ' : 'Inward GRN ') + d.doc;
      if (all) { if (d.dup > 0) out.push({ k: 'D|' + d.type + '|' + d.doc, t: '⛔ DUPLICATE: ' + label, b: d.dup + ' line duplicate — GM / Owner approval ke bina pick nahi hoga' }); }
      else if (String(d.assignedTo || '').toLowerCase() === me && d.status !== 'DONE' && d.status !== 'CLOSED-SHORT') {
        out.push({ k: 'A|' + d.type + '|' + d.doc, t: 'Naya kaam: ' + label, b: d.lines + ' lines · ' + d.qty + ' qty — app kholo aur scan karo' });
      }
    });
    return out;
  }
  function checkNew() {
    var seen = pget('seen', []), first = !S.seeded, keys = noteKeys(), fresh = keys.filter(function (x) { return seen.indexOf(x.k) === -1; });
    S.seeded = true;
    if (!fresh.length) return;
    pset('seen', seen.concat(fresh.map(function (x) { return x.k; })).slice(-500));
    if (first && !seen.length) return;                                    // first load after login: no flood
    if (fresh.length === 1) nat('notify', tr(fresh[0].t), tr(fresh[0].b));
    else nat('notify', tr(fresh.length + (seesAll() ? ' naye duplicate documents' : ' naye documents assign hue')), tr(fresh.map(function (x) { return x.t.replace(/^.*?: /, ''); }).join(', ')));
    feedback('warn');
    toast('🔔 ' + (fresh.length === 1 ? fresh[0].t : fresh.length + ' naye documents'));
  }
  function ago(ms) {
    if (!ms) return '';
    var m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    return m < 1 ? 'abhi' : m < 60 ? m + ' min pehle' : m < 1440 ? Math.round(m / 60) + ' ghante pehle' : Math.round(m / 1440) + ' din pehle';
  }
  function isClosed(d) { return d.status === 'DONE' || d.status === 'CLOSED-SHORT'; }
  function renderHello() {
    if (!S.user || S.tab === 'REPORT') { $('hello').innerHTML = ''; return; }
    var D = S.docs, all = seesAll(), first = String(S.user.name).split(' ')[0];
    var open = D.filter(function (d) { return d.status === 'OPEN' || d.status === 'UNASSIGNED'; }).length;
    var prog = D.filter(function (d) { return d.status === 'IN PROGRESS'; }).length;
    var done = D.filter(isClosed).length, dup = D.filter(function (d) { return d.dup > 0 && !isClosed(d); }).length;
    var hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Namaste' : 'Good evening';
    var st = all
      ? [[open, 'Shuru nahi'], [prog, 'Chal rahe'], [dup, '⛔ Duplicate', dup ? 'alert' : '']]
      : [[open, 'Naya kaam'], [prog, 'Chal raha'], [done, 'Complete ✓']];
    $('hello').innerHTML = '<div class="hello"><div class="hi">' + greet + ', ' + esc(first) + ' 👋</div><div class="sub2">' +
      (all ? 'Aaj warehouse ka haal' : (open + prog ? 'Aaj aapke ' + (open + prog) + ' document baaki hain' : 'Sab kaam complete — shabaash!')) + '</div>' +
      '<div class="stats">' + st.map(function (x) { return '<div class="' + (x[2] || '') + '"><b>' + x[0] + '</b><span>' + x[1] + '</span></div>'; }).join('') + '</div></div>';
  }
  function renderDocs() {
    var t = S.tab;
    $('tabPick').classList.toggle('on', t === 'PICK'); $('tabInw').classList.toggle('on', t === 'INWARD');
    $('tabRep').classList.toggle('hide', !seesAll()); $('tabRep').classList.toggle('on', t === 'REPORT');
    $('tabRep').parentNode.classList.toggle('three', seesAll());
    $('docList').classList.toggle('hide', t === 'REPORT'); $('repView').classList.toggle('hide', t !== 'REPORT');
    var cnt = function (ty) { var n = S.docs.filter(function (d) { return d.type === ty && !isClosed(d); }).length; return n ? String(n) : ''; };
    $('cntPick').textContent = cnt('PICK'); $('cntInw').textContent = cnt('INWARD');
    $('cntPick').classList.toggle('hide', !cnt('PICK')); $('cntInw').classList.toggle('hide', !cnt('INWARD'));
    renderHello();
    if (t === 'REPORT') return renderReport();
    var order = { 'IN PROGRESS': 0, 'OPEN': 1, 'UNASSIGNED': 2, 'CLOSED-SHORT': 3, 'DONE': 4 };
    var list = S.docs.filter(function (d) { return d.type === t; }).sort(function (a, b) { return (order[a.status] == null ? 1 : order[a.status]) - (order[b.status] == null ? 1 : order[b.status]); });
    var admin = seesAll();
    $('docList').innerHTML = list.map(function (d) {
      var cls = d.status === 'DONE' ? 'g' : d.status === 'IN PROGRESS' ? 'a' : d.status === 'CLOSED-SHORT' ? 'r' : d.status === 'UNASSIGNED' ? '' : 'b';
      var st = d.status === 'DONE' ? 'st-done' : d.status === 'IN PROGRESS' ? 'st-prog' : d.status === 'CLOSED-SHORT' ? 'st-short' : d.status === 'UNASSIGNED' ? 'st-un' : 'st-open';
      var pct = d.qty ? Math.min(100, Math.round(d.done * 100 / d.qty)) : 0;
      var icon = d.status === 'DONE' ? '✅' : d.type === 'PICK' ? '🚚' : '📥';
      return '<div class="card doc ' + st + '" data-doc="' + esc(d.doc) + '"><div class="dic">' + icon + '</div><div class="dmain">' +
        '<div class="dh"><b>' + esc(d.doc) + '</b><span class="chip ' + cls + '">' + esc(d.status) + '</span></div>' +
        '<div class="dmeta">' + d.lines + ' lines · ' + d.qty + ' qty' + (d.assignedAt ? ' · ⏱ ' + ago(d.assignedAt) : '') + (admin && d.assignedTo ? ' · 👤 ' + esc(d.assignedTo) + (d.noUser ? ' <b style="color:#b91c1c">⚠️ Users me nahi</b>' : '') : '') +
        (d.missing ? ' · ⚠️ sheet me data nahi' : '') + '</div>' +
        '<div class="prog"><div class="bar" style="width:' + pct + '%"></div></div>' +
        '<div class="dfoot"><span>' + d.doneLines + '/' + d.lines + ' lines · ' + d.done + '/' + d.qty + ' qty</span><span class="pct">' + pct + '%</span></div>' +
        (d.dup ? '<div class="dupb">⛔ ' + d.dup + ' line DUPLICATE — GM / Owner approval ke bina pick nahi hoga</div>' : '') + '</div></div>';
    }).join('') || '<div class="empty"><div style="font-size:44px">' + (t === 'PICK' ? '🚚' : '📥') + '</div>' + (t === 'PICK' ? 'Koi pick slip assign nahi hai' : 'Koi inward assign nahi hai') +
      '<br><span class="muted">Naya kaam aate hi 🔔 notification aayega</span></div>';
  }

  /* ===================== document lines ===================== */
  function openDoc(type, doc) {
    busy('Lines load ho rahi hain…');
    api('lines', { type: type, doc: doc }).then(function (r) {
      S.cur = { type: r.type, doc: r.doc, lines: r.lines, opts: r.opts, readOnly: !!r.readOnly };
      if (r.shortReasons) { S.shortReasons = r.shortReasons; pset('shortReasons', S.shortReasons); }
      pset('lines_' + type + '_' + doc, S.cur);
      applyPending();
      setQty(1); show('vDoc'); renderDoc();
    }).catch(function (e) {
      var c = pget('lines_' + type + '_' + doc, null);
      if (e.net && c) { S.netDown = true; S.cur = c; applyPending(); setQty(1); show('vDoc'); renderDoc(); toast('📵 Offline — saved lines'); }
      else toast('⚠️ ' + e.message);
    }).then(function () { busy(false); });
  }
  function applyPending() {
    if (!S.cur) return;
    S.queue.forEach(function (q) {
      if (q.kind !== 'confirm' || q.body.type !== S.cur.type || q.body.doc !== S.cur.doc || q.applied) return;
      var l = lineByRow(q.body.row); if (l) l.done += q.body.qty;
    });
  }
  function lineByRow(r) { return S.cur ? S.cur.lines.filter(function (l) { return l.row === r; })[0] : null; }
  function engLines() { return S.cur.lines.filter(function (l) { return l.status !== 'SHORT'; }); }
  function setQty(n) { S.qty = Math.max(1, Math.min(9999, n || 1)); $('qVal').textContent = S.qty; }
  function setUnit(u) {
    S.unit = u === 'BOX' ? 'BOX' : 'PCS';
    $('qUnit').textContent = S.unit === 'BOX' ? '📦 BOX' : 'PCS';
    $('qUnit').classList.toggle('on', S.unit === 'BOX');
  }
  function cs(l) { return l && Number(l.caseSize) > 1 ? Math.floor(Number(l.caseSize)) : 1; }
  function pcsOf(l) { return S.unit === 'BOX' ? S.qty * cs(l) : S.qty; }
  function qtyLabel() { return '×' + S.qty + (S.unit === 'BOX' ? ' BOX' : ''); }
  function boxText(n, l) { var c = cs(l); return c > 1 && n >= c ? Math.floor(n / c) + ' box' + (n % c ? ' + ' + (n % c) + ' pcs' : '') : n + ' pcs'; }
  function renderDoc() {
    var c = S.cur, L = c.lines, q = 0, d = 0, dl = 0;
    L.forEach(function (l) { q += l.qty; d += Math.min(l.done, l.qty); if (isDone(l)) dl++; });
    var pc = q ? Math.min(100, Math.round(d * 100 / q)) : 0;
    $('docBar').style.width = pc + '%'; $('docPct').textContent = pc + '%';
    $('docType').textContent = (c.type === 'PICK' ? '🚚 Picking' : '📥 Inward') + (c.lines[0] && c.lines[0].party ? ' · ' + c.lines[0].party : '');
    $('docProg').textContent = dl + '/' + L.length + ' lines · ' + d + '/' + q + ' qty';
    var noId = L.filter(function (l) { return !isDone(l) && !PVEngine.lineHasIdentity(l); });
    $('docWarn').innerHTML = (c.readOnly ? '<div class="warnbox">👁 Sirf dekhne ke liye — ye document aapko assign nahi hai.</div>' : '') +
      (noId.length ? '<div class="warnbox">⚠️ ' + noId.length + ' item(s) ke liye sheet me Batch / Barcode / Keyword / naam nahi hai — inko camera verify nahi kar sakta. GM sheet me Batch ya Keyword bhare.</div>' : '');
    ['btnManual', 'btnClose'].forEach(function (id) { $(id).classList.toggle('hide', !!c.readOnly); });
    $('dock').classList.toggle('hide', !!c.readOnly);
    var sorted = L.slice().sort(function (a, b) { return (isDone(a) - isDone(b)) || (a.row - b.row); });
    $('lineList').innerHTML = sorted.map(function (l) {
      var dn = isDone(l), st = l.status === 'SHORT' ? 'SHORT' : dn ? verb() : l.done > 0 ? 'PARTIAL' : 'PENDING';
      var cls = st === 'SHORT' ? 'r' : dn ? 'g' : l.done > 0 ? 'a' : '';
      var batch = PVEngine.isNABatch(l.batch) ? '' : l.batch ? '<span>Batch <b>' + esc(l.batch) + '</b></span>'
        : (c.opts && c.opts.CAPTURE_BATCH ? '<span>Batch <b>label se record</b>' + (l.capBatch ? ' (' + esc(l.capBatch) + ')' : '') + '</span>' : '');
      var kv = (l.mrp !== '' ? '<span>MRP <b>₹' + esc(l.mrp) + '</b></span>' : '') + (l.weight ? '<span>Wt <b>' + esc(l.weight) + '</b></span>' : '') + batch +
        (l.keyword ? '<span>Keyword <b>' + esc(l.keyword) + '</b></span>' : '');
      var blocked = dupBlocked(l), dp = '';
      if (l.dup && !dn) {
        dp = blocked ? '<div class="dupb">⛔ DUPLICATE: ' + esc(l.dup.msg) + (c.readOnly ? '' : '<br><button class="btn dupok" data-approve="' + l.row + '">GM / Owner approve</button>') + '</div>'
          : l.dup.approved ? '<div class="dupa">✔ Duplicate approved: ' + esc(l.dup.by) + '</div>'
          : '<div class="dupw">⚠️ ' + esc(l.dup.msg) + '</div>';
      }
      if (cs(l) > 1) kv += '<span>Box <b>' + cs(l) + ' pcs</b></span>';
      if (l.skip) kv += '<span class="muted">Check nahi: ' + esc(l.skip) + ' (box pe nahi)</span>';
      var extra = (l.wrong ? '<div class="wrongc">❌ ' + l.wrong + ' galat scan</div>' : '') +
        (l.status === 'SHORT' && l.shortReason ? '<div class="shortr">Short: ' + esc(l.shortReason) + '</div>' : '');
      var act = dn || blocked || c.readOnly ? '' : '<div class="lact"><button class="cam" data-scan="' + l.row + '" aria-label="Is item ko scan karo">📷</button>' +
        '<button class="shortb" data-short="' + l.row + '">Kam mila</button></div>';
      return '<div class="card ln' + (dn ? ' done' : '') + (blocked ? ' dupcard' : '') + '"><div class="grow"><div><span class="chip ' + cls + '">' + st + '</span> <b>' + l.done + ' / ' + l.qty + '</b>' +
        (cs(l) > 1 && l.qty >= cs(l) ? ' <span class="muted">(' + esc(boxText(l.qty, l)) + ')</span>' : '') + '</div>' +
        '<div class="nm">' + esc(nm(l)) + '</div><div class="kv">' + kv + '</div>' +
        '<div class="muted" style="font-size:12px;margin-top:4px">' + esc([l.sku, l.barcode, l.order, l.invoice, l.party].filter(Boolean).join(' · ')) + '</div>' + extra + dp + '</div>' + act + '</div>';
    }).join('') || '<div class="empty">Koi line nahi</div>';
    header();
  }

  /* ===================== live scan ===================== */
  function startScan(o) {
    S.scan = { mode: o.mode, target: o.target || 0, evs: [], frames: [], state: 'scan', away: 0, lastRow: 0, torch: false };
    document.documentElement.style.setProperty('--cam', Math.round(CAM_FRACTION * 100) + 'vh');
    $('vScan').classList.remove('hide');
    var tl = o.target ? lineByRow(o.target) : null;
    $('sTarget').textContent = o.mode === 'qr' ? 'Setup QR' : tl ? '🎯 ' + nm(tl) : (S.cur.type === 'PICK' ? 'Pick: koi bhi item' : 'Inward: koi bhi item');
    $('sQty').textContent = o.mode === 'qr' ? '' : qtyLabel();
    $('sQty').classList.toggle('hide', o.mode === 'qr');
    $('sTable').innerHTML = ''; $('sDots').innerHTML = '';
    $('sHint').textContent = o.mode === 'qr' ? 'Sheet me menu 📦 Pick Verify → App setup QR kholo aur QR camera ke saamne rakho.'
      : 'MRP, weight, batch aur product ka naam ek saath frame me dikhao. Roshni kam ho to 🔦.' + (S.unit === 'BOX' ? '\n📦 BOX mode: 1 scan = ' + S.qty + ' poora box.' : '');
    $('sMsg').textContent = o.mode === 'qr' ? 'QR dhoondh raha hai…' : 'Label camera ke saamne rakho';
    N.startCamera(CAM_FRACTION);
  }
  function stopScan() {
    try { N.stopCamera(); } catch (e) { }
    S.scan = null;
    $('vScan').classList.add('hide');
    hideResult();
    if (S.view === 'vDoc' && S.cur) renderDoc();
  }
  window.onCamera = function (json) {
    var o = {}; try { o = JSON.parse(json); } catch (e) { }
    if (o.state === 'error') { toast('Camera: ' + (o.msg || 'error')); stopScan(); }
  };
  window.onFrame = function (json) {
    var sc = S.scan; if (!sc) return;
    var f; try { f = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return; }
    var frame = { t: String(f.t || ''), c: (f.c || []).map(String) };
    if (sc.mode === 'qr') return onQR(frame);
    if (sc.state === 'result' || !S.cur) return;
    var lines = engLines(), o = S.cur.opts;
    var ev = PVEngine.evalFrame(frame, lines, sc.target, o);
    if (sc.state === 'cooldown') {
      var same = ev.chosen === sc.lastRow || (ev.chk[sc.lastRow] && (ev.chk[sc.lastRow].batch.s === 'MATCH' || ev.chk[sc.lastRow].keyword.s === 'MATCH' || ev.chk[sc.lastRow].name.s === 'MATCH'));
      sc.away = same ? 0 : sc.away + 1;
      if (sc.away >= 6) { sc.state = 'scan'; sc.evs = []; sc.frames = []; }
      renderLive({ state: sc.state === 'cooldown' ? 'COOLDOWN' : 'IDLE' });
      return;
    }
    sc.evs.push(ev); sc.frames.push(frame);
    if (sc.evs.length > 12) { sc.evs.shift(); sc.frames.shift(); }
    var d = PVEngine.decide(sc.evs, lines, sc.target, o);
    if (d.state === 'GREEN') return onGreen(d);
    if (d.state === 'RED') return onRed(d);
    renderLive(d);
  };
  function evidence() {
    var sc = S.scan, out = [], win = PVEngine.opts(S.cur.opts).WIN_MULTI || 12;     // server re-checks the same frames (incl. other faces of the box)
    for (var i = sc.evs.length - 1; i >= 0 && out.length < win; i--) if (!sc.evs[i].empty) out.unshift({ t: sc.frames[i].t.slice(0, 4000), c: sc.frames[i].c.slice(0, 6) });
    return out;
  }
  var FL = [['barcode', 'Barcode'], ['code', 'Code'], ['keyword', 'Product'], ['name', 'Product'], ['mrp', 'MRP'], ['weight', 'Weight'], ['batch', 'Batch']];
  var IC = { MATCH: '✅', MISMATCH: '❌', UNCLEAR: '…', CAPTURE: '📝', NA: '' };
  function fieldRows(chk, forResult) {
    if (!chk) return '';
    var h = '';
    FL.forEach(function (p) {
      var k = p[0], c = chk[k];
      if (!c || c.s === 'NA') return;
      if (k === 'name' && chk.keyword && chk.keyword.s !== 'NA') return;
      if (k === 'name' && forResult && c.s !== 'MATCH') return;
      var exp = k === 'batch' && c.s === 'CAPTURE' ? '(record)' : c.exp;
      h += '<tr class="' + c.s.toLowerCase() + '"><td>' + p[1] + '</td><td>' + esc(exp) + '</td><td>' + esc(c.read || '—') + '</td><td>' + IC[c.s] + '</td></tr>';
    });
    return h;
  }
  function renderLive(d) {
    var sc = S.scan; if (!sc) return;
    var msg;
    if (d.state === 'COOLDOWN') msg = '✅ Ho gaya — box hatao, agla box dikhao';
    else if (d.state === 'IDLE') msg = 'Label camera ke saamne rakho';
    else if (d.kind === 'CONFIRMING') msg = 'Match ho raha hai… phone hilao mat';
    else if (d.kind === 'NOID') msg = 'Batch / product code wali line (coding) bhi dikhao';
    else if (d.kind === 'AMBIGUOUS') msg = 'Do items same lag rahe hain — product naam wala hissa dikhao';
    else if (d.kind === 'TURN') msg = '🔄 Dabba ghumao — ' + (d.missing || []).join(', ') + ' wali side dikhao';
    else if (d.checks && d.checks.code && d.checks.code.s === 'UNCLEAR') msg = 'Product code saaf nahi padha — coding wali line ke paas lao, roshni me';
    else msg = 'Label padh raha hai…';
    $('sMsg').textContent = msg;
    var need = d.need || 3, on = d.progress || 0, dots = '';
    for (var i = 0; i < need; i++) dots += '<i class="' + (i < on ? 'on' : '') + '"></i>';
    $('sDots').innerHTML = d.state === 'AMBER' ? dots : '';
    var l = d.row ? lineByRow(d.row) : null;
    if (!sc.target) $('sTarget').textContent = l && d.state === 'AMBER' ? '🔎 ' + nm(l) : (S.cur.type === 'PICK' ? 'Pick: koi bhi item' : 'Inward: koi bhi item');
    $('sTable').innerHTML = d.state === 'AMBER' ? fieldRows(d.checks) : '';
  }
  function onGreen(d) {
    var sc = S.scan, l = lineByRow(d.row), q = pcsOf(l), rem = PVEngine.remaining(l);
    if (dupBlocked(l)) return onRed({ kind: 'DUPLICATE', row: d.row, read: d.read, checks: d.checks });
    if (d.full || rem <= 0) return onRed({ kind: 'EXTRA', row: d.row, read: d.read, checks: d.checks });
    sc.state = 'result';
    if (q > rem) {
      sc.qtyRow = d.row;
      feedback('warn');
      return showResult('a', '⚠️', 'Qty zyada hai', nm(l) + '\nSirf ' + rem + ' pcs baaki hai (' + boxText(rem, l) + '), aapne ' + q + ' pcs set kiya hai' + (S.unit === 'BOX' ? ' (' + S.qty + ' box × ' + cs(l) + ')' : '') + '.',
        null, [['qtyfix', 'PCS ' + rem + ' karo aur dobara scan'], ['resume', 'OK']]);
    }
    var id = uid();
    queueAdd({ id: id, kind: 'confirm', body: { user: S.user.name, pin: S.user.pin, type: S.cur.type, doc: S.cur.doc, row: d.row, qty: q, frames: evidence(), scanId: id } });
    l.done += q;
    l.status = l.done >= l.qty ? verb() : 'PARTIAL';
    if (d.captured) { var b = String(l.capBatch || '').split(/\s*,\s*/).filter(String); if (b.indexOf(d.captured) === -1) b.push(d.captured); l.capBatch = b.join(', '); }
    sc.lastRow = d.row;
    feedback('ok');
    var docDone = S.cur.lines.every(isDone);
    var msg = (d.faces ? '🔄 2 side se check ✓\n' : '') + nm(l) + '\n+' + q + (S.unit === 'BOX' && cs(l) > 1 ? ' pcs (' + S.qty + ' box)' : '') + '   →   ' + l.done + ' / ' + l.qty + (d.captured ? '\nBatch record: ' + d.captured : '') + (docDone ? '\n\n🎉 Document complete!' : '');
    if (S.unit === 'BOX' && cs(l) <= 1) msg += '\n(Is item ka Case Size sheet me nahi — ' + q + ' pcs gina)';
    showResult('g', '✅', 'SAHI — ' + verb(), msg, d.checks, docDone ? [['finish', '✔ List pe jao']] : [['next', '📷 AGLA BOX'], ['stop', 'Scan band karo']]);
    if (S.set.auto && !docDone) {
      setTimeout(function () {
        if (S.scan && S.scan.state === 'result' && S.scan.lastRow === d.row && !$('res').classList.contains('hide')) { hideResult(); S.scan.state = 'cooldown'; S.scan.away = 0; renderLive({ state: 'COOLDOWN' }); }
      }, 1300);
    }
    processQueue();
  }
  function onRed(d) {
    var sc = S.scan; sc.state = 'result';
    var l = d.row ? lineByRow(d.row) : null, inward = S.cur.type === 'INWARD';
    var title = inward ? 'GALAT MAAL — INWARD MAT KARO' : 'GALAT MAAL — MAT UTHAO', msg, reason;
    if (d.kind === 'NOTINDOC') { msg = 'Ye product is document me hai hi nahi.' + (d.read && d.read.barcode ? '\nBarcode: ' + d.read.barcode : ''); reason = 'Not in document'; }
    else if (d.kind === 'OTHER') { var o = lineByRow(d.other); msg = 'Ye "' + nm(o) + '" hai,\n"' + nm(l) + '" nahi.'; reason = 'Other item: ' + nm(o); }
    else if (d.kind === 'DUPLICATE') { title = 'DUPLICATE — MAT ' + (inward ? 'LO' : 'UTHAO'); msg = nm(l) + '\n' + (l && l.dup ? l.dup.msg : '') + '\n\nGM / Owner approval ke bina count nahi hoga.'; reason = 'Duplicate: ' + (l && l.dup ? l.dup.msg : ''); }
    else if (d.kind === 'EXTRA') { title = 'EXTRA — ' + (inward ? 'QTY POORI HAI' : 'MAT UTHAO'); msg = nm(l) + '\nQty already poori hai (' + l.done + ' / ' + l.qty + '). Wapas rakho.'; reason = 'Extra — qty complete'; }
    else { msg = 'Slip se match nahi hua' + (l ? ' (' + nm(l) + ')' : '') + '.\nNeeche dekho kya alag hai 👇'; reason = PVEngine.reasons(d.checks) || 'Mismatch'; }
    feedback('bad');
    var id = uid();
    queueAdd({ id: id, kind: 'reject', body: { user: S.user.name, pin: S.user.pin, type: S.cur.type, doc: S.cur.doc, row: d.row || 0, qty: pcsOf(l), reason: reason, read: d.read || {}, scanId: id } });
    if (l && d.kind !== 'DUPLICATE') l.wrong = (l.wrong || 0) + 1;
    showResult('r', '❌', title, msg, d.kind === 'MISMATCH' ? d.checks : null, [['resume', 'OK — box wapas rakh diya']]);
    processQueue();
  }
  function showResult(cls, ico, title, msg, checks, acts) {
    try { N.showPreview(false); } catch (e) { }
    var r = $('res');
    r.className = 'res ' + cls;
    $('rIco').textContent = ico; $('rTitle').textContent = title; $('rMsg').textContent = msg || '';
    var rows = fieldRows(checks, true);
    $('rTable').innerHTML = rows ? '<tr><th></th><th>Slip</th><th>Box</th><th></th></tr>' + rows : '';
    $('rActs').innerHTML = acts.map(function (a, i) { return '<button class="btn' + (i ? ' alt' : '') + '" data-act="' + a[0] + '">' + esc(a[1]) + '</button>'; }).join('');
  }
  function hideResult() {
    $('res').className = 'res hide';
    if (S.scan) { try { N.showPreview(true); } catch (e) { } }
  }
  function resultAction(a) {
    if (a === 'finish') { stopScan(); goHome(); return; }
    if (a === 'stop' || a === 'close') { stopScan(); return; }
    hideResult();
    if (!S.scan) { if (S.view === 'vDoc') renderDoc(); return; }
    if (a === 'qtyfix') {
      var ln = S.scan.qtyRow ? lineByRow(S.scan.qtyRow) : null;
      setUnit('PCS');
      if (ln) setQty(PVEngine.remaining(ln));
      $('sQty').textContent = qtyLabel();
    }
    if (S.scan.target) { var t = lineByRow(S.scan.target); if (t && isDone(t)) { S.scan.target = 0; $('sTarget').textContent = S.cur.type === 'PICK' ? 'Pick: koi bhi item' : 'Inward: koi bhi item'; } }
    S.scan.state = 'scan'; S.scan.evs = []; S.scan.frames = [];
    renderLive({ state: 'IDLE' });
  }

  /* ===================== sync queue (works offline) ===================== */
  function queueAdd(item) { S.queue.push(item); pset('queue', S.queue); renderSync(); }
  function processQueue() {
    if (S.syncing || !S.queue.length || !S.cfg) return;
    S.syncing = true;
    var item = S.queue[0];
    var body = JSON.parse(JSON.stringify(item.body));
    api(item.kind, body).then(function (r) {
      S.queue.shift(); pset('queue', S.queue);
      if (item.kind === 'confirm') afterConfirm(item, r);
      S.syncing = false; renderSync();
      if (S.queue.length) setTimeout(processQueue, 200);
    }).catch(function (e) {
      S.syncing = false;
      if (e.net) { S.netDown = true; renderSync(); return; }
      S.queue.shift(); pset('queue', S.queue); renderSync();
      toast('⚠️ Sync: ' + e.message);
      if (S.queue.length) setTimeout(processQueue, 200);
    });
  }
  function afterConfirm(item, r) {
    var b = item.body, here = S.cur && S.cur.type === b.type && S.cur.doc === b.doc;
    if (r.verdict !== 'GREEN') {
      feedback('warn');
      toast(r.kind === 'DUPLICATE' ? '⛔ DUPLICATE — count cancel: ' + (r.msg || '') : '⚠️ Server ne ek count reject kiya (row ' + b.row + ') — dobara scan karo');
      if (here && r.lines) { S.cur.lines = r.lines; applyPending(); if (!S.scan) renderDoc(); }
      return;
    }
    var morePending = S.queue.some(function (q) { return q.kind === 'confirm' && q.body.type === b.type && q.body.doc === b.doc; });
    if (here && r.lines && !morePending) {
      S.cur.lines = r.lines; pset('lines_' + b.type + '_' + b.doc, S.cur);
      if (!S.scan && S.view === 'vDoc') renderDoc();
    }
  }

  /* ===================== manual entry (admin approved) ===================== */
  function openManual() {
    var open = S.cur.lines.filter(function (l) { return !isDone(l); });
    if (!open.length) return toast('Sab items complete hain');
    $('mLine').innerHTML = open.map(function (l) { return '<option value="' + l.row + '">' + esc(nm(l)) + ' — ' + l.done + '/' + l.qty + '</option>'; }).join('');
    $('mAdmin').innerHTML = S.users.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('');
    ['mName', 'mMrp', 'mWeight', 'mBatch', 'mBarcode', 'mAdminPin'].forEach(function (id) { $(id).value = ''; });
    $('dManual').classList.remove('hide');
  }
  function submitManual() {
    var m = { name: $('mName').value.trim(), mrp: $('mMrp').value.trim(), weight: $('mWeight').value.trim(), batch: $('mBatch').value.trim(), barcode: $('mBarcode').value.trim() };
    if (!m.mrp && !m.batch && !m.weight && !m.barcode) return toast('Box pe jo likha hai woh bharo');
    if (!$('mAdminPin').value.trim()) return toast('GM / Owner PIN daalo');
    var row = Number($('mLine').value);
    $('dManual').classList.add('hide');
    busy('Server pe check ho raha hai…');
    api('confirm', { type: S.cur.type, doc: S.cur.doc, row: row, qty: pcsOf(lineByRow(row)), manual: m, approver: $('mAdmin').value, approverPin: $('mAdminPin').value.trim(), scanId: uid() })
      .then(function (r) {
        if (r.lines) { S.cur.lines = r.lines; applyPending(); }
        renderDoc();
        if (r.verdict === 'GREEN') { feedback('ok'); showResult('g', '✅', 'SAHI — ' + verb() + ' (manual)', nm(r.line) + '\n' + r.line.done + ' / ' + r.line.qty, null, [['close', 'OK']]); }
        else if (r.verdict === 'RED') { feedback('bad'); showResult('r', '❌', r.kind === 'DUPLICATE' ? 'DUPLICATE' : 'MATCH NAHI HUA', r.kind === 'DUPLICATE' ? (r.msg || '') + '\nPehle GM / Owner approve kare.' : r.kind === 'EXTRA' ? 'Qty already poori hai.' : (PVEngine.reasons(r.decision && r.decision.checks) || 'Details slip se match nahi'), r.decision && r.decision.checks, [['close', 'OK']]); }
        else { feedback('warn'); showResult('a', '⚠️', 'Poori details chahiye', r.kind === 'QTY' ? 'Sirf ' + r.remaining + ' baaki hai.' : 'Batch / product naam / MRP / weight sab bharo.', r.decision && r.decision.checks, [['close', 'OK']]); }
      }).catch(function (e) { toast('⚠️ ' + e.message); }).then(function () { busy(false); });
  }

  /* ===================== duplicate approval (ADMIN only) ===================== */
  function askAdmin(msg) {
    return new Promise(function (resolve) {
      var d = document.createElement('div');
      d.className = 'sheet';
      d.innerHTML = '<div class="pn"><h1>GM / Owner approval</h1><p style="white-space:pre-line">' + esc(msg) + '</p>' +
        '<label>GM / Owner naam</label><select id="aaName">' + S.users.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('') + '</select>' +
        '<label>PIN</label><input id="aaPin" type="password" inputmode="numeric" autocomplete="off">' +
        '<div class="row" style="margin-top:16px"><button class="btn" data-a="0">Cancel</button><button class="btn p grow" data-a="1">Approve</button></div></div>';
      d.onclick = function (e) {
        var b = e.target.closest('[data-a]'); if (!b) return;
        var out = b.getAttribute('data-a') === '1' ? { name: d.querySelector('#aaName').value, pin: d.querySelector('#aaPin').value.trim() } : null;
        if (out && !out.pin) return toast('PIN daalo');
        document.body.removeChild(d); resolve(out);
      };
      document.body.appendChild(d);
    });
  }
  function approveDup(row) {
    var l = lineByRow(row); if (!l || !l.dup) return;
    var msg = nm(l) + '\n' + l.dup.msg + '\n\nKya ye sach me naya dispatch hai (partial delivery / naya order)? Approve karne ke baad hi pick hoga. Ye ScanLog + Violations me aapke naam se likha jayega aur HO ko mail jayega.';
    var p = isApprover()
      ? ask(msg, 'Haan, approve').then(function (ok) { return ok ? { name: S.user.name, pin: S.user.pin } : null; })
      : askAdmin(msg);
    p.then(function (a) {
      if (!a) return;
      busy('Approve ho raha hai…');
      api('approveDup', { type: S.cur.type, doc: S.cur.doc, row: row, approver: a.name, approverPin: a.pin })
        .then(function (r) { S.cur.lines = r.lines; applyPending(); renderDoc(); toast('✔ Approved — ab scan kar sakte ho'); })
        .catch(function (e) { toast('⚠️ ' + e.message); }).then(function () { busy(false); });
    });
  }

  /* ===================== short: maal kam mila (qty + reason mandatory) ===================== */
  function openShort(row) {
    var l = lineByRow(row); if (!l) return;
    if (S.queue.some(function (q) { return q.body && q.body.type === S.cur.type && q.body.doc === S.cur.doc; })) return toast('Pehle sync hone do (' + S.queue.length + ' pending), phir Kam mila');
    var reasons = S.shortReasons || SHORT_DEF, c = cs(l);
    var d = document.createElement('div');
    d.className = 'sheet';
    d.innerHTML = '<div class="pn"><h1>Kam mila — ' + esc(nm(l)) + '</h1>' +
      '<p class="muted">Slip: <b>' + l.qty + ' pcs</b>' + (c > 1 ? ' (' + esc(boxText(l.qty, l)) + ')' : '') + ' · Scan hua: <b>' + l.done + ' pcs</b>' + (c > 1 && l.done ? ' (' + esc(boxText(l.done, l)) + ')' : '') + '</p>' +
      '<label>Kitna mila? (zaroori)</label><div class="row">' +
      (c > 1 ? '<div class="grow"><input id="shBox" inputmode="numeric" placeholder="Box"><div class="muted">Box (1 box = ' + c + ' pcs)</div></div>' : '') +
      '<div class="grow"><input id="shPcs" inputmode="numeric" placeholder="' + (c > 1 ? 'Khule pcs' : 'Pcs') + '"><div class="muted">' + (c > 1 ? 'Khule pieces' : 'Pieces') + '</div></div></div>' +
      '<div class="muted" id="shTot" style="margin-top:6px"></div>' +
      '<label>Reason (zaroori)</label><div id="shR">' + reasons.map(function (r, i) {
        return '<label class="rad"><input type="radio" name="shr" value="' + esc(r) + '"> ' + esc(r) + '</label>';
      }).join('') + '</div>' +
      '<label>Remark</label><input id="shNote" autocomplete="off" placeholder="Other ho to zaroori">' +
      '<div class="row" style="margin-top:16px"><button class="btn" data-a="0">Cancel</button><button class="btn p grow" data-a="1">Short save karo</button></div></div>';
    var tot = function () {
      var b = c > 1 ? Number((d.querySelector('#shBox') || {}).value || 0) : 0, p = Number(d.querySelector('#shPcs').value || 0);
      return (isFinite(b) ? Math.floor(b) : NaN) * c + (isFinite(p) ? Math.floor(p) : NaN);
    };
    d.oninput = function () {
      var t = tot(), filled = (d.querySelector('#shPcs').value + ((d.querySelector('#shBox') || {}).value || '')).trim() !== '';
      d.querySelector('#shTot').textContent = filled ? 'Total mila: ' + t + ' pcs' + (t !== l.done ? '  ⚠️ scan ' + l.done + ' hua hai' : '  ✔') : '';
    };
    d.onclick = function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      if (b.getAttribute('data-a') === '0') { document.body.removeChild(d); return; }
      var filled = (d.querySelector('#shPcs').value + ((d.querySelector('#shBox') || {}).value || '')).trim() !== '';
      var found = tot(), rr = d.querySelector('input[name=shr]:checked'), note = d.querySelector('#shNote').value.trim();
      if (!filled || !isFinite(found) || found < 0) return toast('Kitna mila — number daalna zaroori hai');
      if (found >= l.qty) return toast('Poora mila to Kam mila nahi — baaki boxes scan karo');
      if (found > l.done) return toast('Aapne ' + found + ' likha, scan sirf ' + l.done + ' hua. Jo mila hai woh pehle scan karo.');
      if (found < l.done) return toast('Scan ' + l.done + ' ho chuka hai — mila usse kam nahi ho sakta. Sahi number daalo.');
      if (!rr) return toast('Reason chuno');
      if (/^other$/i.test(rr.value) && !note) return toast('"Other" ke saath remark likho');
      document.body.removeChild(d);
      busy('Short save ho raha hai…');
      api('short', { type: S.cur.type, doc: S.cur.doc, row: row, found: found, reason: rr.value, note: note })
        .then(function (r) { S.cur.lines = r.lines; pset('lines_' + S.cur.type + '_' + S.cur.doc, S.cur); renderDoc(); toast(r.docDone ? '✔ Saari lines ho gayi — Document close karo' : 'Short save ✔'); })
        .catch(function (e) { toast('⚠️ ' + (e.net ? 'Network chahiye — Kam mila online hi save hota hai' : e.message)); }).then(function () { busy(false); });
    };
    document.body.appendChild(d);
  }

  /* ===================== report (GM / Owner / Operator) ===================== */
  function loadReport(range) {
    if (range) S.repRange = range;
    $('repView').innerHTML = '<div class="empty">Report load ho raha hai…</div>';
    api('report', { range: S.repRange }, 60000).then(function (r) { S.report = r.report; pset('report', S.report); if (S.tab === 'REPORT') renderReport(); })
      .catch(function (e) { S.report = S.report || pget('report', null); if (S.tab === 'REPORT') renderReport(); toast('⚠️ ' + e.message); });
  }
  function renderReport() {
    var R = S.report, el = $('repView');
    var tabs = '<div class="rtabs">' + [['today', 'Aaj'], ['yesterday', 'Kal'], ['7d', '7 din']].map(function (x) {
      return '<button class="rtab' + (S.repRange === x[0] ? ' on' : '') + '" data-range="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div>';
    if (!R) { el.innerHTML = tabs + '<div class="empty">Report nahi mila — ⟳ dabao</div>'; return; }
    var T = R.totals, v = function (x) { return x === null || x === undefined || x === '' ? '—' : esc(x); };
    var k = function (lbl, val, cls) { return '<div class="kpi ' + (cls || '') + '"><div>' + lbl + '</div><b>' + v(val) + '</b></div>'; };
    var h = tabs + '<div class="muted" style="margin:4px 2px 8px">🏭 ' + esc(R.warehouse) + ' · ' + esc(R.label) + ' · updated ' + esc(R.generated) + '</div>' +
      '<div class="kpis">' + k('Sahi scans', T.okScans) + k('Accuracy %', T.accuracy, 'g') + k('Galat scans', T.wrong, T.wrong ? 'r' : '') +
      k('Dispatch qty', T.pickQty) + k('Inward qty', T.inQty) + k('Violations', R.violationCount, R.violationCount ? 'r' : '') +
      k('Short lines', T.shortLines, T.shortLines ? 'a' : '') + k('Manual', T.manual, T.manual ? 'a' : '') + k('Dup try', T.dupAttempts, T.dupAttempts ? 'r' : '') + '</div>' +
      '<div class="card"><b>Documents</b><div class="muted">Complete ' + R.docs.done + ' · Short close ' + R.docs.closedShort + ' · Chal rahe ' + R.docs.inProgress +
      ' · Shuru nahi ' + R.docs.open + ' · Assign nahi ' + R.docs.unassigned + '</div></div>';
    h += '<h2>Supervisor efficiency</h2><div class="tw"><table class="rt"><tr><th>Naam</th><th>Sahi</th><th>Galat</th><th>Acc %</th><th>Qty</th><th>Short</th><th>Manual</th><th>Time</th><th>/hr</th></tr>' +
      (R.users.length ? R.users.map(function (u) {
        return '<tr><td><b>' + esc(u.name) + '</b></td><td>' + v(u.scansOk) + '</td><td class="' + (u.wrong ? 'bad' : '') + '">' + v(u.wrong) + '</td><td>' + v(u.accuracy) +
          '</td><td>' + v(u.pickQty + u.inQty) + '</td><td>' + v(u.shortLines) + '</td><td>' + v(u.manual) + '</td><td>' + v(u.first) + '–' + v(u.last) + '</td><td>' + v(u.perHour) + '</td></tr>';
      }).join('') : '<tr><td colspan="9">Abhi koi scan nahi</td></tr>') + '</table></div>';
    h += '<h2>Violations (' + R.violationCount + ')</h2>' + (R.violations.length ? R.violations.map(function (x) {
      return '<div class="card vio"><div class="dh"><b>' + esc(x.doc) + '</b><span class="chip r">' + esc(x.rule) + '</span></div><div class="muted">' + esc(x.time) + ' · ' +
        esc(x.type) + (x.party ? ' · ' + esc(x.party) : '') + (x.to ? ' · 👤 ' + esc(x.to) : '') + (x.user && x.user !== 'System' ? ' · by ' + esc(x.user) : '') + '</div><div>' + esc(x.product || '') + '</div><div class="muted">' + esc(x.detail) + '</div></div>';
    }).join('') : '<div class="muted" style="padding:6px 4px">Koi violation nahi ✔</div>');
    h += '<h2>Short lines</h2>' + (R.shorts.length ? R.shorts.map(function (x) {
      return '<div class="card"><b>' + esc(x.doc) + '</b> · ' + esc(x.product) + '<div class="muted">' + esc(x.time) + ' · ' + esc(x.user) + ' · ' + v(x.qty) + ' short · ' + esc(x.reason) + '</div></div>';
    }).join('') : '<div class="muted" style="padding:6px 4px">Koi short nahi</div>');
    h += '<h2>Pending documents</h2>' + (R.docs.pending.length ? R.docs.pending.map(function (p) {
      return '<div class="card"><div class="dh"><b>' + esc(p.doc) + '</b><span class="chip ' + (p.status === 'IN PROGRESS' ? 'a' : 'b') + '">' + esc(p.status) + '</span></div><div class="muted">' +
        esc(p.type) + ' · 👤 ' + esc(p.to) + (p.ageHours !== null ? ' · ' + p.ageHours + ' ghante se' : '') + '</div></div>';
    }).join('') : '<div class="muted" style="padding:6px 4px">Sab complete ✔</div>');
    el.innerHTML = h;
  }

  /* ===================== close doc / settings ===================== */
  function closeDoc() {
    if (S.queue.length) return toast('Pehle sync hone do (' + S.queue.length + ' pending)');
    var open = S.cur.lines.filter(function (l) { return !isDone(l); }).length;
    if (open) return toast(open + ' line baaki hai — har line scan karo ya "Kam mila" + reason do');
    ask('Document complete. Close karein?', 'Close karo').then(function (ok) {
      if (!ok) return;
      busy('Close ho raha hai…');
      api('close', { type: S.cur.type, doc: S.cur.doc }).then(function (r) { toast(r.short ? 'Closed — ' + r.short + ' short' : 'Done ✔'); goHome(); })
        .catch(function (e) { toast('⚠️ ' + e.message); }).then(function () { busy(false); });
    });
  }
  function openSettings() {
    $('stAuto').checked = !!S.set.auto; $('stSound').checked = S.set.sound !== false;
    $('stInfo').textContent = 'User: ' + (S.user ? S.user.name + ' (' + (ROLE_LABEL[S.user.role] || S.user.role) + ')' : '-') + (S.wh ? ' · 🏭 ' + S.wh : '') + ' · App ' + (N.appVersion ? N.appVersion() : '') + ' · Pending sync: ' + S.queue.length;
    var ns = nat('notifyState');
    $('stNotify').classList.toggle('hide', !ns || ns === 'granted' || ns === 'unsupported');
    $('stPinReset').classList.toggle('hide', !isApprover());
    $('dSet').classList.remove('hide');
  }

  /* ===================== PIN: change own, GM / Owner reset someone's (PINs are hidden in the Sheet) ===================== */
  function pinForm(title, who) {
    return new Promise(function (resolve) {
      var d = document.createElement('div');
      d.className = 'sheet';
      d.innerHTML = '<div class="pn"><h1>' + esc(title) + '</h1>' +
        (who ? '<label>Kiska PIN</label><select id="pfWho">' + S.users.filter(function (n) { return n !== S.user.name; }).map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('') + '</select>' : '') +
        '<label>Naya PIN (4-6 number)</label><input id="pfNew" type="password" inputmode="numeric" autocomplete="off">' +
        '<label>Naya PIN dobara</label><input id="pfNew2" type="password" inputmode="numeric" autocomplete="off">' +
        '<p class="muted">Sheet me PIN 🔒 chhupa rehta hai — koi padh nahi sakta. Naya PIN sirf us bande ko batao.</p>' +
        '<div class="row" style="margin-top:12px"><button class="btn" data-a="0">Cancel</button><button class="btn p grow" data-a="1">Save</button></div></div>';
      d.onclick = function (e) {
        var b = e.target.closest('[data-a]'); if (!b) return;
        if (b.getAttribute('data-a') !== '1') { document.body.removeChild(d); return resolve(null); }
        var n1 = d.querySelector('#pfNew').value.trim(), n2 = d.querySelector('#pfNew2').value.trim();
        if (!/^\d{4,6}$/.test(n1)) return toast('PIN 4 se 6 number ka');
        if (n1 !== n2) return toast('Dono PIN same nahi');
        var out = { pin: n1, who: who ? d.querySelector('#pfWho').value : '' };
        document.body.removeChild(d); resolve(out);
      };
      document.body.appendChild(d);
    });
  }
  function changeMyPin() {
    $('dSet').classList.add('hide');
    pinForm('Mera PIN badlo').then(function (f) {
      if (!f) return;
      busy('PIN badal raha hai…');
      api('changePin', { newPin: f.pin }).then(function () { S.user.pin = f.pin; pset('user', S.user); toast('✔ PIN badal gaya — agli baar naye PIN se login'); })
        .catch(function (e) { toast('⚠️ ' + e.message); }).then(function () { busy(false); });
    });
  }
  function resetSomeonePin() {
    $('dSet').classList.add('hide');
    pinForm('PIN reset (GM / Owner)', true).then(function (f) {
      if (!f || !f.who) return;
      busy('PIN reset ho raha hai…');
      api('resetPin', { target: f.who, newPin: f.pin }).then(function (r) { toast('✔ ' + r.target + ' ka naya PIN set — usko batao'); })
        .catch(function (e) { toast('⚠️ ' + e.message); }).then(function () { busy(false); });
    });
  }
  function logout() {
    nat('background', false);
    S.user = null; pset('user', null); S.docs = []; pset('docs', []); pset('seen', []); S.report = null; pset('report', null); goLogin();
  }

  /* ===================== back button (Android) ===================== */
  window.onBack = function () {
    var sheet = document.querySelector('.sheet:not(.hide)');
    if (sheet) { if (sheet.id) sheet.classList.add('hide'); else document.body.removeChild(sheet); return true; }
    if (!$('res').classList.contains('hide')) { resultAction(S.scan ? 'resume' : 'close'); return true; }
    if (S.scan) { stopScan(); return true; }
    if (S.view === 'vDoc') { goHome(); return true; }
    return false;
  };

  /* ===================== wiring ===================== */
  function bind() {
    $('btnSetupQR').onclick = function () { startScan({ mode: 'qr' }); };
    $('btnSetupManual').onclick = function () { $('setupManual').classList.toggle('hide'); };
    $('btnSetupSave').onclick = function () {
      var u = $('inUrl').value.trim(), k = $('inKey').value.trim();
      if (!/^https?:\/\/.+/.test(u) || !k) return toast('URL aur key dono daalo');
      saveCfg(u, k);
    };
    $('btnLogin').onclick = doLogin;
    $('inPin').onkeydown = function (e) { if (e.key === 'Enter') doLogin(); };
    $('btnReSetup').onclick = goSetup;
    $('btnLoginRetry').onclick = goLogin;
    $('tabPick').onclick = function () { S.tab = 'PICK'; renderDocs(); };
    $('tabInw').onclick = function () { S.tab = 'INWARD'; renderDocs(); };
    $('tabRep').onclick = function () { S.tab = 'REPORT'; renderDocs(); loadReport(); };
    $('repView').onclick = function (e) { var b = e.target.closest('[data-range]'); if (b) { loadReport(b.getAttribute('data-range')); renderReport(); } };
    $('qUnit').onclick = function () { setUnit(S.unit === 'BOX' ? 'PCS' : 'BOX'); setQty(1); toast(S.unit === 'BOX' ? '📦 BOX mode — 1 scan = poora box (Case Size)' : 'PCS mode — 1 scan = ' + S.qty + ' piece'); };
    $('stNotify').onclick = function () { nat('askNotify'); $('stNotify').classList.add('hide'); };
    $('docList').onclick = function (e) {
      var c = e.target.closest('[data-doc]'); if (!c) return;
      openDoc(S.tab, c.getAttribute('data-doc'));
    };
    $('hBack').onclick = function () { goHome(); };
    $('hRefresh').onclick = function () { if (S.view === 'vDoc' && S.cur) openDoc(S.cur.type, S.cur.doc); else { loadDocs(); if (S.tab === 'REPORT') loadReport(); } processQueue(); };
    $('hMenu').onclick = openSettings;
    $('hSync').onclick = function () { S.netDown = false; processQueue(); toast('Sync try ho raha hai…'); };
    $('qMinus').onclick = function () { setQty(S.qty - 1); };
    $('qPlus').onclick = function () { setQty(S.qty + 1); };
    $('btnScan').onclick = function () { startScan({ mode: 'item', target: 0 }); };
    $('lineList').onclick = function (e) {
      var a = e.target.closest('[data-approve]'); if (a) return approveDup(Number(a.getAttribute('data-approve')));
      var sh = e.target.closest('[data-short]'); if (sh) return openShort(Number(sh.getAttribute('data-short')));
      var b = e.target.closest('[data-scan]'); if (b) startScan({ mode: 'item', target: Number(b.getAttribute('data-scan')) });
    };
    $('btnStop').onclick = stopScan;
    $('btnTorch').onclick = function () { if (!S.scan) return; S.scan.torch = !S.scan.torch; try { N.torch(S.scan.torch); } catch (e) { } };
    $('rActs').onclick = function (e) { var b = e.target.closest('[data-act]'); if (b) resultAction(b.getAttribute('data-act')); };
    $('btnManual').onclick = openManual;
    $('mCancel').onclick = function () { $('dManual').classList.add('hide'); };
    $('mOk').onclick = submitManual;
    $('btnClose').onclick = closeDoc;
    $('stAuto').onchange = function () { S.set.auto = this.checked; pset('settings', S.set); };
    $('stSound').onchange = function () { S.set.sound = this.checked; pset('settings', S.set); };
    $('stSync').onclick = function () { S.netDown = false; processQueue(); toast('Sync try ho raha hai…'); };
    $('stLogout').onclick = function () {
      $('dSet').classList.add('hide');
      if (S.queue.length) return ask(S.queue.length + ' scan abhi sync nahi hue.\nPhir bhi logout?', 'Logout').then(function (ok) { if (ok) logout(); });
      logout();
    };
    $('stReset').onclick = function () { $('dSet').classList.add('hide'); goSetup(); };
    $('stClose').onclick = function () { $('dSet').classList.add('hide'); };
    $('stPin').onclick = changeMyPin;
    $('stPinReset').onclick = resetSomeonePin;
  }

  function init() {
    i18nStart();
    bind();
    if (!S.cfg) goSetup();
    else if (!S.user) goLogin();
    else { nat('background', true); goHome(); }
    setInterval(function () { S.netDown = false; processQueue(); }, 20000);
    setInterval(function () {                                  // new work / duplicates while the app is open
      if (S.user && !S.scan && (S.view === 'vHome' || S.view === 'vDoc') && !document.querySelector('.sheet:not(.hide)')) loadDocs(true);
    }, 60000);
    window.onResumeApp = function () { if (S.user && !S.scan) loadDocs(true); };
    processQueue();
  }
  window.PV = { S: S, startScan: startScan, stopScan: stopScan };   // for debugging/tests
  init();
})();
