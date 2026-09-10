# BELM System Settings Dashboard — Template

Replica ya "System Settings" uliyotuma, kwa role ya `super_admin`.
Mtindo mwepesi (light theme) tofauti na dashibodi za awali za navy — umejengwa
sahihi kabisa (nimepima kwa upana wa desktop, si tu simu/A4).

## Muundo
```
belm-system-settings-dashboard/
├── index.html
├── assets/
│   ├── css/belm-system-settings.css
│   ├── js/belm-system-settings.js       # saa/tarehe halisi (live clock)
│   └── img/belm-logo-v2.png             # logo halisi ya BELM (v2)
```

## Vipengele
- Header: logo + "BELM OPERATIONS PORTAL" + "System Settings", bell (badge 5),
  dark-mode toggle icon, user chip "System Administrator / Super Admin".
- Sidebar: Home Dashboard + "SYSTEM SETTINGS" (active) + menu 12.
- Page head: gear icon + title + saa/tarehe halisi + "System Online" badge.
- Kadi 12 za rangi (blue/green/amber/gray) — kila moja na icon, maelezo, na
  button ya rangi inayolingana.
- System Information, Quick Actions (4 buttons), Support (logo + mawasiliano + quote).

## Kuunganisha na backend
Vitu vinavyohitaji data halisi: `System Online` status, `Uptime`, `Last Backup`,
notification badge (5), na buttons zote (Clear Cache, Backup Now, n.k.) —
unganisha na endpoints zako za `/api/system/*` zilizopo kwenye backend yako.
