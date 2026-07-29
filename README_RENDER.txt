BELM PORTAL - READY FOR RENDER.COM
==================================

Hii ZIP ina:
- React frontend iliyojengwa tayari
- PHP 8.3 + Apache API
- PostgreSQL database schema
- Dockerfile
- render.yaml (Blueprint)
- Automatic database initialization
- One role-aware login for Customer, Technician and Administrator accounts
- Automatic customer, machine and checklist synchronization
- public_website_patch/ for belmgeneraltech.co.tz


NAVIGATION UPDATE
-----------------
- Admin pages now use the same permanent left sidebar.
- Sidebar contains Main Menu, All Overview, Customers, Registration Requests,
  Checklists, Service Requests, Spare Parts, Billing, Suppliers, Reports,
  Roles & Users and Settings according to the signed-in role.
- Admin pages also return directly to /admin-menu/.
- The Main Menu only shows sections assigned to the signed-in user's role.
- Customer assistant management returns to /portal/dashboard.
- Technician task management returns to /tech.
- Portal Home shows Administrator Login and Request Registration.
- New Customers, Staff and Technicians submit /apply/ and remain blocked until
  Admin approval. Approved users then use their generated /login/ link.
- New and reset Staff/Technician accounts display one credentials card with
  the unified login link, generated password, recovery code and Copy buttons.
- Logging out keeps a stable login form. Old /admin/login, /portal/login and
  /tech login screens use the same role-aware authentication without redirects.
- Apache serves /login/, /admin/login and /portal/login through the same stable
  static login form, while old /admin/* bookmarks continue through the app.


ALL OVERVIEW & MANAGEMENT REPORTS
---------------------------------
All Overview:
  /overview-manager/

- Card analysis for customers, machines, employees, registration requests,
  service requests, tasks and low stock.
- Finance cards for sales, received revenue, expenses and profit/loss.
- Every role has a card with staff, active accounts, pending tasks and
  completed tasks.
- Service, machine and today's attendance status comparisons.
- Latest recorded employee activity.

Reports:
  /reports-manager/

- Today, week, month, year or custom-date reporting.
- Current vs previous financial comparison.
- Sales, revenue, expenses, profit/loss and outstanding balances.
- 12-month visual trend.
- Attendance, tasks, service requests and employee/role activity.
- Daily employee attendance saving with status, check-in, check-out and notes.
- Export CSV and Print / Save PDF.

Settings:
  /settings-manager/

- Company details, business defaults, light/dark theme and protected PIN save.


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

Apache ina API FallbackResource ya /api/index.php, kwa hiyo REST URLs kama
/api/health, /api/customers na /api/billing/invoices zinafika kwenye router
hata kama hosting environment haitumii nested .htaccess rewrite.


LOGIN YA KWANZA
---------------
Email:
  admin@belmgeneraltech.co.tz

Temporary password:
  ChangeMe123!

Default delete PIN:
  1234

Badilisha password na PIN baada ya kuingia.


ONE LOGIN & ADMIN APPROVAL
--------------------------
Unified login for Customer, Technician and Staff:
  https://portal.belmgeneraltech.co.tz/login/

Admin applications:
  https://portal.belmgeneraltech.co.tz/admin-applications/

Workflow:
1. Customer, Staff au Technician anatuma Request Registration kupitia /apply/.
2. Request inabaki PENDING na haina dashboard access wala password.
3. Kwa Staff/Technician, Super Admin anachagua exact role. Technician lazima
   apewe Assigned Customer.
4. Admin approval inagenerate private login link yenye account iliyojazwa,
   temporary password na recovery code.
5. Admin anatumia Copy credentials kumtumia user taarifa zote.
6. User anaingia kupitia /login/. Mfumo unatambua role automatically:
   Admin -> /admin-menu/, Technician -> /tech,
   Customer -> /portal/dashboard.
7. User anaona pages na data za role yake tu.

Admin > Service Requests sasa inafungua manager kamili:
  /service-request-manager/

Hapa Admin anaweza kuchagua Technician anayehudumia customer huyo, kubadilisha
job status na kuhifadhi service notes.

Customer link inatengenezwa automatically kwa jina la kampuni:
  https://portal.belmgeneraltech.co.tz/login/?customer=customer-name

Customer na assistants wake wanatumia link hiyo hiyo. Kila mmoja anaingia
kwa email na password yake.

Portal home ina:
  Administrator Login: /login/?role=admin
  Request Registration: /apply/
Baada ya approval, Customer/Staff/Technician anatumia generated login link.
Login page ina Login na Forgot Password; haina registration form.


SELF-SERVICE FORGOT PASSWORD
----------------------------
- Customer, assistant, Technician na staff wote wanaweza kutumia:
    /forgot-password/
- User anaweka email, BELM recovery code na password mpya.
- Recovery code ya zamani ina-expire baada ya reset.
- Mfumo unaonyesha recovery code mpya mara moja; user lazima aisave.
- Existing account isiyo na recovery code: Admin afanye Reset Login/Password
  mara moja ili kupata temporary password na recovery code mpya.


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
- Assistant mpya anapata recovery code kwa self-service password reset.
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
- Input type ikiwa DROPDOWN, Admin anatumia + Add value kuongeza kila option.
- Kila dropdown value inaweza kupewa GREEN, YELLOW au RED safety color.
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
- Customer akichaguliwa, company name, email, phone, address, TIN na VRN
  zinajazwa/kuonyeshwa automatically kwenye invoice na proforma form.
- Kitufe cha Back to Main Menu kinarudi Admin > Customers.
- Record payment; balance na PAID/PARTIALLY PAID status zinahesabiwa automatic.
- Overpayment na payment ya cancelled invoice zinakataliwa.
- Record company expenses.
- Create na edit proforma invoice pamoja na items, VAT na discount.
- Invoice/proforma na items zake zinasave kwa database transaction moja.


SYSTEM SETTINGS, SPARE PARTS NA ROLES
-------------------------------------
- Light/Dark theme sasa inabadilisha dashboard nzima.
- Theme inahifadhiwa kwenye browser na database (displayTheme), kwa hiyo
  inarudi automatically baada ya refresh/login.
- Admin > Spare Parts inafungua /spare-parts-manager/ yenye save confirmation,
  validation, edit, delete, search, low-stock count na inventory value.
- Part number inahifadhiwa kwa uppercase na duplicate part number inakataliwa
  kwa ujumbe unaoeleweka.
- Admin > Roles & System Users inafungua /roles-manager/.
- Admin anaweza Add Role, Add System User na Change Role ya user aliyepo.
- Public staff registration haionekani dashboard mpaka Super Admin a-approve
  na kuchagua exact role.
- Menus nje ya allowedPages za role zinafichwa, na API inakataa direct URL.
- Technician role inalazimisha Assigned Customer.
- User role, active status, phone na assigned customer zinahifadhiwa pamoja.
- Mfumo unazuia kubadilisha/kufuta Super Admin wa mwisho.


CUSTOMER CARDS NA WORKING LINKS
-------------------------------
- Admin > Customers inafungua /customers-manager/.
- Customers Overview imepangwa kwa card style yenye company, email, phone,
  address, TIN, VRN na account status.
- Kila customer card ina machine cards zake.
- Machine status ina color:
  GREEN = Normal
  YELLOW = Attention
  RED = Don't operate
  GREY = Not checked/unknown
- Customer link inatumia automatically domain inayofunguliwa wakati huo:
  Render URL au portal.belmgeneraltech.co.tz.
- Kila customer card ina Copy Link na Open Customer Login.
- Customer mpya anaonyesha email, temporary password, recovery code na
  working portal link.
- Credential dialog ina Copy All, Copy Link na Copy Password tofauti.
- Reset Login inagenerate password/recovery code mpya kwa existing customer.


SMART SUPPLIER DIRECTORY
------------------------
- Admin > Suppliers inafungua /suppliers-manager/.
- Suppliers wamepangwa kwa cards na trust score.
- Smart Trust Check inatumia contact, WhatsApp, business email, website,
  location na BELM verification.
- Trust levels: TRUSTED, REVIEW na VERIFY.
- Supplier card ina phone, email, website, location, specialty na notes.
- WhatsApp button inafungua message ya BELM kwa supplier.
- Admin anaweza Save, Edit au Delete supplier.
- Trust score ni pre-screening aid; verify documents, identity na payment
  details kabla ya kufanya biashara.


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
- Forgot Password inahitaji email + recovery code iliyotolewa wakati account
  ili-approve; haiwezi kutumika kwa email pekee.
- Recovery code inahifadhiwa kwa BCRYPT hash na inabadilika baada ya kila reset.


ORODHA KAMILI YA FUNCTIONS
--------------------------
Fungua FUNCTIONS_ZOTE.txt iliyopo kwenye root ya ZIP.
