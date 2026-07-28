BELM PORTAL - READY FOR RENDER.COM
==================================

Hii ZIP ina:
- React frontend iliyojengwa tayari
- PHP 8.3 + Apache API
- PostgreSQL database schema
- Dockerfile
- render.yaml (Blueprint)
- Automatic database initialization
- Customer application and admin approval workflow
- Automatic customer, machine and checklist synchronization
- public_website_patch/ for belmgeneraltech.co.tz


JINSI YA KUIWEKA RENDER
-----------------------
1. Extract ZIP hii kwenye simu au computer.
2. Upload mafaili YOTE yaliyomo ndani kwenda kwenye root ya GitHub repository.
   Muhimu: Dockerfile na render.yaml zionekane moja kwa moja kwenye root.
3. Ingia https://dashboard.render.com/
4. Bonyeza New > Blueprint.
5. Connect GitHub repository yenye portal hii.
6. Render itasoma render.yaml. Bonyeza Apply/Deploy.
7. Subiri resources mbili ziwe Live:
   - belm-portal
   - belm-portal-db
8. Fungua URL uliyopewa, mfano:
   https://belm-portal.onrender.com
9. Kagua pia:
   https://belm-portal.onrender.com/api/health

Jibu sahihi la health:
  "ok": true
  "database": "connected"
  "adminReady": true


LOGIN YA KWANZA
---------------
Email:
  admin@belmgeneraltech.co.tz

Temporary password:
  ChangeMe123!

Default delete PIN:
  1234

Badilisha password na PIN baada ya kuingia.


CUSTOMER APPLICATION WORKFLOW
-----------------------------
Public application:
  https://portal.belmgeneraltech.co.tz/apply/

Admin applications:
  https://portal.belmgeneraltech.co.tz/admin-applications/

Workflow:
1. Customer anajaza company, TIN, VRN, contact, machine type, brand,
   model, registration number, email na password.
2. Request inakuwa PENDING.
3. Admin anaingia kwa email/password na kufungua Customer Applications.
4. Admin anachagua Approve Customer au Cancel Request.
5. Approval inatengeneza customer account na machine record.
6. Checklist ya machine type inaunganishwa automatically.
7. Kama checklist ya machine type haipo, standard inspection checklist
   inatengenezwa automatically.
8. Customer anaingia kwa email na password aliyotengeneza kwenye application.

Admin > Service Requests sasa inafungua manager kamili:
  /service-request-manager/

Hapa Admin anaweza kuchagua Technician anayehudumia customer huyo, kubadilisha
job status na kuhifadhi service notes.

Customer link inatengenezwa automatically kwa jina la kampuni:
  https://portal.belmgeneraltech.co.tz/portal/login?customer=customer-name

Customer na assistants wake wanatumia link hiyo hiyo. Kila mmoja anaingia
kwa email na password yake.

Portal home ina login choices:
  Admin:       /admin/login
  Technician:  /tech
  Customer:    /portal/login


BELM UI THEME
-------------
Portal yote imetumia rangi za BELM company profile:
- Deep navy: headers, sidebar na login backgrounds
- BELM green: primary buttons, links na approved states
- Strong yellow: active navigation, pending alerts na accent stripe
- White/off-white: forms, cards na dashboard content

Theme ya React portal ipo:
  frontend/belm-theme.css


CUSTOMER ASSISTANTS
-------------------
Main customer account:
1. Login kwenye customer link yake.
2. Bonyeza Manage Assistants.
3. Weka assistant name, email, phone, role na password.
4. Operator anaweza kuona data na kutuma/cancel service request.
5. Viewer ana read-only access.
6. Main customer anaweza edit, kubadilisha password, deactivate au delete
   assistant.

Security:
- Assistant hawezi kufungua Manage Assistants.
- Assistant anaona customer na machines za kampuni yake tu.
- Deactivated/deleted assistant token inakataliwa automatically.
- Email ya kila portal account hairuhusiwi kutumika mara mbili.
- Baada ya ku-deploy version hii, customer users waliokuwa tayari wame-login
  wa-login upya mara moja ili token mpya yenye owner/assistant role itengenezwe.


CHECKLIST RELIABLE SAVE
-----------------------
Admin > Checklist Templates sasa inafungua:
  /checklist-manager/

- Create na edit zinahifadhi template pamoja na items zake kwa transaction moja.
- Save ikishindikana hakuna half-saved template/report.
- Mfumo unathibitisha saved item count kabla ya kuonyesha success.
- Required items, input type, dropdown values na safety levels zinavalidate.
- Technician report, answers na machine status zinahifadhiwa pamoja.


TECHNICIAN CUSTOMER ASSIGNMENT
------------------------------
Admin > Roles/Users:
1. Tengeneza au edit staff user.
2. Chagua Role: Technician.
3. Chagua Assigned Customer.
4. Weka email na password ya Technician.

Technician akilogin:
  Login -> Assigned Customer Machines -> Select Machine -> Checklist

Technician ana pia button ya My Tasks:
  /technician-tasks/

Task yoyote ya Technician inaunganishwa automatically na Assigned Customer
wa Technician huyo.

Security rules:
- Technician role lazima iwe na Assigned Customer.
- Technician hawezi kuona customer list ya kampuni nyingine.
- Technician hawezi kuona machines za customer mwingine.
- Technician hawezi kusoma au kutuma checklist report ya machine nyingine.
- Kubadilisha URL au API hakuvunji restriction hii.


KUUNGANISHA WEBSITE KUU
-----------------------
Ndani ya ZIP fungua:
  public_website_patch/

Upload files zilizomo humo kwenda cPanel document root ya:
  https://belmgeneraltech.co.tz/

Files hizi zinaunganisha buttons zilizopo sasa:
  client_register.php -> Portal Application
  client_login.php    -> Customer Login
  login.php           -> Admin Login


BILLING MANAGER
---------------
Admin > Accounting & Billing sasa inafungua:
  /billing-manager/

- Create customer invoice yenye items, machine, due date na tax.
- Record payment; balance na PAID/PARTIALLY PAID status zinahesabiwa automatic.
- Overpayment na payment ya cancelled invoice zinakataliwa.
- Record company expenses.
- Create na edit proforma invoice pamoja na items, VAT na discount.
- Invoice/proforma na items zake zinasave kwa database transaction moja.


MUHIMU KUHUSU FREE PLAN
-----------------------
render.yaml imetumia Free plan ili ujaribu bila malipo.

- Free web service inaweza kusimama baada ya kutotumika; ombi la kwanza
  linaweza kuchelewa wakati service inaanza tena.
- Free PostgreSQL database ya Render ina muda wa siku 30.
- Kwa matumizi ya biashara/production, badilisha database plan kutoka:
    plan: free
  kwenda:
    plan: basic-256mb
- Unaweza pia kubadilisha web service plan kutoka free kwenda starter.


CUSTOM DOMAIN
-------------
Baada ya portal kuwa Live:
1. Fungua belm-portal kwenye Render.
2. Nenda Settings > Custom Domains.
3. Add:
   portal.belmgeneraltech.co.tz
4. Weka DNS record Render itakayokuonyesha.


USALAMA
-------
- Database password na JWT secret zinatengenezwa/kupitishwa na Render.
- Usiziandike ndani ya source code.
- Usichapishe repository ikiwa baadaye utaongeza siri au taarifa binafsi.
- Recycle Bin restore/permanent delete na kubadilisha Admin PIN ni Super
  Admin-only.
- Hakuna public forgot-password endpoint inayotoa password mpya kwenye browser.


ORODHA KAMILI YA FUNCTIONS
--------------------------
Fungua FUNCTIONS_ZOTE.txt iliyopo kwenye root ya ZIP.
