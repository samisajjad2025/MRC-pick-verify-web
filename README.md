# Pick Verify — web version (iPhone / kisi bhi phone ke browser me)

Same app, same Google Sheet, same rules. Label browser ke andar padha jata hai (Tesseract OCR, self-hosted).

1. github.com → **+ → New repository** → naam `pick-verify-web` → **Public** → Create.
2. **uploading an existing file** → is folder ki saari files + `lib` folder drag → **Commit changes**.
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch `main` / `(root)` → Save.
4. 1–2 min baad link milega: `https://<github-naam>.github.io/pick-verify-web/`
5. iPhone Safari me link kholo → Share ⬆ → **Add to Home Screen**. Pehli baar ~15 MB AI files download hoti hain (WiFi pe karo).
6. App me **Setup QR scan karo** → Google Sheet wala QR → login.

Is folder me koi password / key nahi hai; API key phone pe QR se aati hai. Isliye repo Public rakhna safe hai.
