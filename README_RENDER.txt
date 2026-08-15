BELM PORTAL - READY FOR RENDER.COM
==================================

Hii ZIP ina:
- React frontend iliyojengwa tayari
- PHP 8.3 + Apache API
- PostgreSQL database schema
- Dockerfile
- render.yaml (Blueprint)
- Automatic database initialization
- Original role-specific React login structure
- Automatic customer, machine and checklist synchronization
- public_website_patch/ for belmgeneraltech.co.tz


NAVIGATION UPDATE
-----------------
- Admin pages now use the same permanent left sidebar.
- Sidebar is arranged as a clear left-side task list.
- Main Workflow starts with All Overview, Registration & Role Approval,
  Service Requests, and Reports, Analysis & Comparison.
- Customers & Maintenance contains Customers & Machines, Checklist Templates,
  Spare Parts Inventory, and Suppliers Directory.
- Finance & Administration contains Billing & Finance, Roles & System Users,
  and System Settings.
- Admin pages return directly to /overview-manager/.
- Main Menu has been removed. All Overview is now the Admin landing page.
- Sidebar only shows sections assigned to the signed-in user's role.
- Customer assistant management returns to /portal/dashboard.
- Technician task management returns to /tech.
- Portal Home shows Administrator Login and Request Registration.
- New Customers, Staff and Technicians submit /apply/ and remain blocked until
  Admin approval. Approval generates the correct role-specific login link.
- New and reset Staff/Technician accounts display one credentials card with
  the role-specific login link, generated password, recovery code and Copy buttons.
- The extra static /login/ page and its JavaScript interception were removed.
- Admin uses /admin/login, Customer uses /portal/login?customer=..., and
  Technician uses /tech. These are the original React forms and do not redirect
  before the password can be entered.
- Database migration repairs the built-in Admin active state and Super Admin
  role without overwriting a password that the Administrator already changed.
- BELM Technician dashboard shows a large assigned-customer card with location,
  phone, email, TIN/VRN and machine count.
- The Technician Machine List uses large cards showing brand, type, model,
  serial/registration, service kit, last checked date, status and condition.
- BELM Technician Inventory Request includes My Inventory Requests and Re-edit
  for a request that is still PENDING. Once Inventory acts, it becomes read-only.
- PHOTO checklist items use a real camera/file upload. The browser converts the
  image to low-MB JPEG evidence (target about 0.45 MB, maximum 0.5 MB) before save.


ALL OVERVIEW & MANAGEMENT REPORTS
---------------------------------
All Overview:
  /overview-manager/

- Card analysis for customers, machines, employees, registration requests,
  service requests, tasks and low stock.
- Finance cards for sales, received revenue, expenses and profit/loss.
- Spare Parts Inventory reads live database stock and shows part types, total
  quantity, low/out-of-stock counts, purchase value, sales value and potential
  margin.
- Inventory table prioritizes out-of-stock and low-stock parts and links to
  the full Spare Parts Manager.
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


CUSTOMER MACHINE EXPENSES
-------------------------
- Machine cards on Customer Dashboard are larger and include Machine Expenses.
- Customer records expense date, spare description, part number, quantity,
  unit and unit cost for the selected machine.
- Total cost is calculated and saved against that customer and machine only.
- Customer can take or upload a receipt photo; the browser compresses it and
  the database stores it with the calculated expense.
- Analysis cards show total machine expense, total spare quantity, number of
  records, average cost and attached receipt count.
- Expense history can be downloaded as authenticated PDF or CSV.
- Customer Viewer accounts remain read-only.


MACHINE-AWARE SERVICE REQUESTS
------------------------------
- Every Customer Dashboard machine card has Request Service.
- The generic request button is replaced so every request starts from a
  specific machine.
- The portal detects the selected machine model/type and loads matching active
  Checklist Template service types.
- Selecting a service type synchronizes its spare-parts names, part numbers and
  quantities into the request.
- Admin sees the service type and synchronized parts on the Service Requests card.
- Checklist Template now saves Service Type and its own editable parts list.


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
  "schemaVersion": "16-receipts-service-parts-sync"
  "schemaReady": true
  "adminReady": true

`adminChecks` zote lazima ziwe true. Zikionyesha false, database ndiyo ina
tatizo la Admin account badala ya browser/login page.

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


ROLE LOGIN & ADMIN APPROVAL
---------------------------
Administrator login:
  https://portal.belmgeneraltech.co.tz/admin/login

Admin applications:
  https://portal.belmgeneraltech.co.tz/admin-applications/

Workflow:
1. Customer, Staff au Technician anatuma Request Registration kupitia /apply/.
2. Request inabaki PENDING na haina dashboard access wala password.
3. Kwa Staff/Technician, Super Admin anachagua exact role. Technician lazima
   apewe Assigned Customer.
4. Admin approval inagenerate role-specific login link, temporary password
   na recovery code.
5. Admin anatumia Copy credentials kumtumia user taarifa zote.
6. User anaingia kupitia link ya role yake:
   Admin /admin/login -> /overview-manager/
   Technician /tech -> Technician workspace
   Customer /portal/login?customer=... -> /portal/dashboard
7. User anaona pages na data za role yake tu.

Admin > Service Requests sasa inafungua manager kamili:
  /service-request-manager/

Hapa Admin anaweza kuchagua Technician anayehudumia customer huyo, kubadilisha
job status na kuhifadhi service notes.

Customer link inatengenezwa automatically kwa jina la kampuni:
  https://portal.belmgeneraltech.co.tz/portal/login?customer=customer-name

Customer na assistants wake wanatumia link hiyo hiyo. Kila mmoja anaingia
kwa email na password yake.

Portal home ina:
  Administrator Login: /admin/login
  Request Registration: /apply/
Baada ya approval, Customer/Staff/Technician anatumia generated login link.


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
- Customer akichagua machine (mfano SRS45V) anaona Checklist Reports zake.
- Kila completed checklist ina button ya View Checked Report yenye answers,
  safety status, technician, date, hour meter, machine details na photo evidence.
- Checked Report inaweza kuprintiwa moja kwa moja; authenticated Download
  button ya report data bado ipo.
- Technician aliye-save report anaweza kutumia Edit Checklist siku hiyo hiyo.
- Uhariri unafungwa automatically saa 00:00 kwa timezone ya
  Africa/Dar_es_Salaam; baada ya hapo report inaonyesha Expired / No Edit.
- Deadline inatekelezwa na API pia, hivyo haiwezi kupitwa kwa kubadilisha
  browser au request.


TECHNICIAN CUSTOMER ASSIGNMENT
------------------------------
Admin > Roles/Users:
1. Tengeneza au edit staff user.
2. Chagua Role: Technician.
3. Chagua Assigned Customer.
4. Weka email na password ya Technician.

Technician akilogin:
  Login -> Assigned Customer Machines -> Select Machine -> Checklist

Kwenye kila machine card ya Technician:
  Checked Reports -> Machine Checklist Reports -> View Checked Report

Mfano:
  BELM Technician Login -> SRS45V -> Checked Reports -> View Checked Report

- Button ya mwisho ya inspection inaitwa Save Checklist.
- Baada ya Save Checklist kufanikiwa, Checked Report iliyosave inafunguka
  automatically.
- Save response sasa inarudisha Checked Report kamili; report inafunguka baada
  ya React kurudisha Customer Machine List, bila kutegemea timing ya request
  nyingine.
- Edit Checklist inaruhusu kurekebisha hour meter na checked answers hadi
  saa 00:00 Tanzania; safety status inahesabiwa upya na server.
- Technician akifunga Checked Report anakuta Machine List tayari iko nyuma.
- Technician akitumia Administrator Login kwa credentials zake, session
  inahamishwa kwenda /tech bila kuomba login ya pili.

Technician ana pia button ya My Tasks:
  /technician-tasks/

Task yoyote ya Technician inaunganishwa automatically na Assigned Customer
wa Technician huyo.

TECHNICIAN ADD SPARE
--------------------
- Technician dashboard ina button ya + Add Spare.
- Technician anachagua assigned machine; Machine Type inajazwa automatically.
- Technician anajaza Part Number na Description.
- Server inathibitisha machine ni ya Assigned Customer wa Technician.
- Part mpya inaingia Spare Parts Inventory na stock quantity 0.
- Spare Parts Inventory inaonyesha Technician spare alert yenye machine,
  customer, fundi, part number na description.
- Inventory anaweza kuchagua Purchase Required au Add to Inventory.
- Add to Inventory inalazimisha stock quantity iwe zaidi ya 0, inasave bei na
  stock, kisha inafunga alert.
- Part yenye stock inayopatikana haiwezi kuombwa kama zero-stock purchase;
  Technician anaelekezwa aombe itolewe kutoka stock iliyopo.

Security rules:
- Technician role lazima iwe na Assigned Customer.
- Technician hawezi kuona customer list ya kampuni nyingine.
- Technician hawezi kuona machines za customer mwingine.
- Technician hawezi kusoma au kutuma checklist report ya machine nyingine.
- Technician mwingine hawezi ku-edit report ambayo hakuijaza.
- Report ikifika saa 00:00 Tanzania inakuwa Expired / No Edit.
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

- Billing Review menu iko side bar ya kushoto na ina-list kutoka juu kwenda
  chini tu: Invoices, Payments, Expenses, Proforma, Bank Manager.
- Payments ina review panel yake yenye invoice, customer, method, reference,
  amount na Re-edit; haijafichwa tena ndani ya invoice.
- Bank Manager:
  - Add/Re-edit bank accounts na opening balance.
  - Payment inaweza kuchaguliwa bank ilipopokelewa; Expense inaweza kuchaguliwa
    bank iliyolipa.
  - Record/Re-edit withdrawals; withdrawal kubwa kuliko available bank balance
    inakataliwa.
  - Withdrawal lazima iwe na Cheque/Transaction Number pamoja na
    Reason/Description.
  - Kila bank inaonyesha payments in, expenses, withdrawals na current balance.
  - Bank table ina total row inayoonyesha Bank A + Bank B + ... =
    All Bank Total.
  - Summary ina All Bank Balance, Total Payments, Total Expenses,
    Total Withdrawals, Customer Debt, VAT Debt, Loss na BELM Profit.
  - Bank balance = opening balance + assigned payments - assigned expenses -
    withdrawals.
  - BELM Profit = payments received - expenses - withdrawals - VAT debt.
  - Unallocated payments/expenses zina warning ili Admin achague bank sahihi.
- Create customer invoice yenye items, machine, due date na tax.
- Customer akichaguliwa, company name, email, phone, address, TIN na VRN
  zinajazwa/kuonyeshwa automatically kwenye invoice na proforma form.
- Kitufe cha All Overview kinafungua uchambuzi mkuu wa Admin.
- Record payment; balance na PAID/PARTIALLY PAID status zinahesabiwa automatic.
- Overpayment na payment ya cancelled invoice zinakataliwa.
- Record company expenses.
- Invoice, payment na company expense zote zina Re-edit.
- Invoice Re-edit inahesabu upya items, subtotal, tax, total, paid na balance;
  total mpya haiwezi kuwa chini ya payments zilizokwisha-recordiwa.
- Payment Re-edit inalinda balance na inahesabu upya invoice status.
- Expense Re-edit inahifadhi receipt iliyokwisha-uploadiwa.
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
- Google Technical Search inatafuta kwa brand, model, serial au part number.
- Search type dropdown ina Spare Parts, Parts Diagrams, Service Manuals,
  Wiring Diagrams, Hydraulic Diagrams, Technical Specifications, Fault Codes,
  Suppliers/Distributors na General Google Search.
- Google results zinafunguka kwenye tab mpya bila kufunga Supplier Directory.
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

V201 SERVICE AUTO CALCULATE + OWNER NOTIFICATIONS
- Every hour-meter check-up calculates Service Type, Next Service At, Remaining/Overdue automatically.
- Customer/machine owner receives one DUE SOON email (<=60 hrs) and one OVERDUE email per milestone; duplicates are suppressed.
- WhatsApp auto-send is available when BELM_WHATSAPP_API_URL is configured. The endpoint must accept JSON {"to":"255...","message":"..."}; optional Bearer token: BELM_WHATSAPP_API_TOKEN.
- Without a configured WhatsApp provider, WhatsApp is logged as PENDING_PROVIDER; the portal never falsely marks it sent.
- Run backend/schema.sql after deployment.
