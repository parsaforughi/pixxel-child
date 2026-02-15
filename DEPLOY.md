# راهنمای استقرار Pixxel Age Filter روی cPanel

## اطلاعات سرور

| مورد | مقدار |
|------|--------|
| **دامنه** | pixxel.pixxel-skinexpert.com |
| **IP** | 45.89.239.110 |
| **نام کاربری cPanel** | pixxelpixxelskin |
| **مسیر Home** | /home/pixxelpixxelskin |
| **نام‌سرورها** | ns1.seylaneh.co , ns2.seylaneh.co |
| **کوتا** | 1,000 MB |

---

## مرحله ۱: ساخت خروجی Production (روی سیستم خودتان)

در پوشه پروژه اجرا کنید:

```bash
cd pixxel-age-filter-final
npm install
npm run build
```

خروجی داخل پوشه **`dist`** ساخته می‌شود. همه فایل‌های داخل `dist` را باید روی سرور ببرید.

---

## مرحله ۲: آپلود روی cPanel

### روش الف: File Manager در cPanel

1. وارد cPanel شوید:  
   `https://pixxel.pixxel-skinexpert.com:2083`  
   (یا آدرس cPanel که هاست داده)
2. **File Manager** را باز کنید.
3. بروید به مسیر:
   - برای **ساب‌دامین** `pixxel.pixxel-skinexpert.com`:  
     معمولاً `public_html` یا `pixxel.pixxel-skinexpert.com` (بسته به تنظیمات ساب‌دامین).
   - اگر ساب‌دامین جدا تعریف شده، پوشه همان ساب‌دامین را باز کنید.
4. محتوای قبلی آن پوشه را (در صورت نیاز) پشتیبان بگیرید، سپس **همه فایل‌ها و پوشه‌های داخل `dist`** را آپلود کنید:
   - `index.html` (در روت)
   - `.htaccess` (در روت)
   - پوشه `assets/` (به‌همراه فایل‌های داخلش)
   - `favicon.ico`, `placeholder.svg`, `robots.txt` در روت

نکته: فایل **`.htaccess`** برای روتینگ SPA لازم است؛ حتماً آپلود شود و در روت (کنار `index.html`) باشد.

### روش ب: FTP/SFTP

1. با یک کلاینت FTP (مثل FileZilla) به سرور وصل شوید:
   - **Host:** 45.89.239.110 یا pixxel.pixxel-skinexpert.com
   - **Username:** pixxelpixxelskin
   - **Password:** پسورد cPanel
   - **Port:** 21 (FTP) یا 22 (SFTP در صورت فعال بودن)
2. به همان مسیر روت وب (مثلاً `public_html` یا پوشه ساب‌دامین) بروید.
3. تمام محتویات پوشه **`dist`** را در آن مسیر آپلود کنید (همان موارد بالا).

---

## مرحله ۳: تنظیم دامنه در cPanel (در صورت نیاز)

- اگر ساب‌دامین `pixxel.pixxel-skinexpert.com` از قبل تعریف شده و به همان پوشه‌ای که فایل‌ها را آپلود کردید اشاره می‌کند، معمولاً نیازی به تغییر نیست.
- اگر ساب‌دامین تعریف نشده:
  - در cPanel: **Domains** یا **Subdomains** → اضافه کردن ساب‌دامین `pixxel` برای `pixxel-skinexpert.com`.
  - Document Root را به همان پوشه‌ای که `index.html` و `.htaccess` را گذاشتید تنظیم کنید.

---

## مرحله ۴: تست

- در مرورگر باز کنید: **https://pixxel.pixxel-skinexpert.com**
- اگر صفحه اصلی لود شد ولی با رفرش یا مستقیم زدن لینک به خطای ۴۰۴ رفت، معمولاً یا `.htaccess` آپلود نشده یا در مسیر اشتباه است؛ باید `.htaccess` در همان مسیر `index.html` باشد.

---

## چک‌لیست قبل از آپلود

- [ ] `npm run build` بدون خطا اجرا شده.
- [ ] پوشه `dist` شامل این موارد است: `index.html`, `.htaccess`, `assets/`, `favicon.ico`, `robots.txt`.
- [ ] همه محتویات `dist` به روت دامنه/ساب‌دامین (مثلاً `public_html` یا پوشه ساب‌دامین) آپلود شده، نه داخل یک زیرپوشه مثل `dist`.

---

## در صورت خطا

- **۴۰۴ روی رفرش یا لینک مستقیم:** مسیر و وجود `.htaccess` را چک کنید؛ mod_rewrite روی سرور باید فعال باشد (معمولاً روی cPanel فعال است).
- **صفحه سفید:** در مرورگر Developer Tools (F12) → Console و Network را بررسی کنید؛ احتمال خطای JavaScript یا مسیر اشتباه فایل‌های استاتیک است.
- **Mixed Content:** اگر سایت با HTTPS باز می‌شود، مطمئن شوید اسکریپت/لینک‌های خارجی هم با `https://` لود می‌شوند (در این پروژه از CDN برای MediaPipe استفاده شده و معمولاً مشکلی نیست).

---

پس از انجام این مراحل، سایت Pixxel Age Filter روی آدرس **pixxel.pixxel-skinexpert.com** در دسترس خواهد بود.
