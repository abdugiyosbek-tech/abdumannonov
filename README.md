# FIT JARVIS Portal v3 MVP

Build talab qilmaydigan statik fitness portal. GitHub Pages yoki oddiy HTTP server orqali ishlaydi.

## Ishga tushirish

Windowsda `RUN_PORTAL.bat` faylini ishga tushiring. Yoki terminalda:

```bash
python -m http.server 8000
```

So‘ng brauzerda `http://localhost:8000` manzilini oching.

## Tuzilma

- `index.html` — portalning semantik HTML tuzilmasi
- `assets/css/styles.css` — qora va oq rejimni o‘z ichiga olgan umumiy dizayn
- `assets/js/config.js` — bazaviy mashg‘ulot va makro rejalar
- `assets/js/core.js` — sana, baholash va backup validatsiyasi
- `assets/js/storage.js` — LocalStorage va IndexedDB saqlash qatlami
- `assets/js/app.js` — UI, render va hodisalar
- `data/FIT_JARVIS_manba_reja.xlsx` — portal bilan bir xil bazaviy baholash formulasi ishlatiladigan manba jadval
- `service-worker.js`, `manifest.json` — PWA/offline ishlash
- `tests/` — asosiy mantiq testlari

## Muhim mantiq

30 kunlik tracking har kuni bugungi sanadan boshlab keyingi 29 kunni ko‘rsatadi. Eski ma’lumotlar o‘chirilmaydi. `Reja` ustunidagi mashg‘ulot qo‘lda tahrirlanadi va avtomatik saqlanadi.

Dam/tiklanish kunlarida sport komponenti `max(sport %, qadam maqsadi %)` orqali baholanadi. Boshqa kunlarda sport foizi ishlatiladi. Qolgan vaznlar sozlamalardan olinadi.

Fotolar siqilib IndexedDB bazasiga saqlanadi. JSON backup import qilinishidan oldin tuzilma va qiymatlar tekshiriladi.

## Test

```bash
npm test
```
