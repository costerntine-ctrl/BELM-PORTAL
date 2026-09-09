# BELM Admin — Home Dashboard Template

Ukurasa huu (`index.html`) ni replica ya dashibodi uliyotuma (BELM Admin — Home Dashboard),
umejengwa kwa HTML/CSS/JS safi (bila framework) ili uweze kuubandika moja kwa moja
kwenye BELM Portal (PHP/JS/PostgreSQL) uliyonayo.

## Muundo wa faili
```
belm-admin-dashboard/
├── index.html                          # Ukurasa wa dashibodi (badilisha jina kuwa dashboard.php)
├── assets/
│   ├── css/belm-admin-dashboard.css    # Rangi/muundo — navy #04101f + gold #f5c518
│   └── js/belm-admin-dashboard.js      # Sidebar toggle (mobile) + Light/Dark mode
```

## Jinsi ya kuunganisha kwenye Portal yako

1. Nakili folda `assets/css/belm-admin-dashboard.css` na `assets/js/belm-admin-dashboard.js`
   kwenye folda yako ya assets iliyopo (pamoja na `belm-home-hero.css`).
2. Badilisha jina la `index.html` kuwa `dashboard.php` (au weka ndani ya layout yako
   iliyopo yenye `<?php include 'header.php'; ?>` / session check ya SUPER ADMIN).
3. Data zote (Active Customers 248, Registered Machines 612, n.k.) ni tuli (hardcoded)
   kwa sasa — badilisha na queries za PostgreSQL, mfano:

   ```php
   <div class="belm-stat-card__value"><?= $activeCustomersCount ?></div>
   ```

4. Jina la mtumiaji "BELM ADMIN" / "SUPER ADMIN" — badilisha na `$_SESSION['user_name']`
   na `$_SESSION['role']`.
5. Notification badge (`3`) — unganisha na jedwali lako la notifications/alerts.
6. Workshop Activity chart ni bars za CSS zilizowekewa `height:` moja kwa moja kwa asilimia.
   Ukitaka chart inayosoma data halisi kwa JS, tumia Chart.js au niambie nikusaidie
   kuiunganisha na endpoint yako ya `/api/workshop-activity`.

## Vipengele vilivyomo
- Sidebar kamili yenye menu zote 11 + Home (active state ya gold) + Light mode / Log out
- Topbar: hamburger (mobile), notification bell yenye badge, user chip yenye dropdown chevron
- Hero banner ya "Home Dashboard" na silhouette ya mtambo (SVG, badilishika kwa picha yako halisi)
- Kadi 4 za takwimu (Active Customers, Registered Machines, Open Job Cards, Pending Approvals)
- Workshop Activity — bar chart ya wiki (Completed/In Progress) + legend na Pending
- Machine & Stock Alerts — orodha ya alerts 4 zenye icons na counts
- Recent Activity — jedwali lenye status pills (Completed = kijani, Approved = gold)
- Promo panel ya "Service Support Partnership" upande wa kulia
- Responsive: inapunguza kwa tablet/simu, sidebar inakuwa drawer chini ya 900px
- Light/Dark mode toggle (imehifadhiwa kwenye localStorage)

## Rangi kuu (tokens - CSS variables juu ya faili la CSS)
| Jina | Hex | Matumizi |
|---|---|---|
| `--belm-navy-900` | `#04101f` | Background ya mwili |
| `--belm-navy-800` | `#071c33` | Sidebar |
| `--belm-navy-700` | `#0a2540` | Topbar, cards, panels |
| `--belm-gold-500`  | `#f5c518` | Active nav, logo, CTA button |
| `--belm-blue-500`  | `#2f86d6` | Icon ya "Active Customers" + Completed bar |
| `--belm-green-500` | `#21b06b` | Icon ya "Open Job Cards" + In Progress bar |
| `--belm-red-500`   | `#e0503a` | Alerts hatarishi + notification badge |
| `--belm-amber-500` | `#f0b90b` | Icon ya "Pending Approvals" + alerts za onyo |

Ukitaka nirekebishe rangi/vipimo ili vifanane zaidi na `belm-home-hero.css` uliyonayo tayari,
niletee faili hilo (au screenshot) nitalilinganisha moja kwa moja.
