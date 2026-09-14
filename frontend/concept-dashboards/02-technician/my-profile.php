<?php
header('Cache-Control: no-store, no-cache, must-revalidate');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>My Profile — BELM Technician</title>
  <link rel="stylesheet" href="assets/css/belm-technician-dashboard.css">
  <style>
    .profile-wrap{width:min(980px,100%);margin:0 auto}.profile-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px;padding:18px;border:1px solid #2b5c82;border-radius:16px;background:linear-gradient(135deg,#0b3157,#081d35)}.profile-head small{color:#5ee39a;font-weight:900;letter-spacing:.08em}.profile-head h1{margin:5px 0 3px}.profile-head p{margin:0;color:#9db5cc;font-size:12px}.sync-badge{padding:8px 11px;border-radius:999px;border:1px solid #2d7eb4;background:#0a3151;color:#bfe2ff;font-size:10px;font-weight:900}.profile-card{padding:18px;border:1px solid #315675;border-radius:16px;background:#07192c}.profile-name{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding-bottom:16px;border-bottom:1px solid #23435f}.profile-name h2{margin:0 0 4px;font-size:26px}.profile-name p{margin:0;color:#92a9c0}.status{padding:7px 10px;border-radius:999px;background:#123a29;border:1px solid #2e7c53;color:#89e5b0;font-size:10px;font-weight:900}.profile-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}.field{padding:13px;border:1px solid #254866;border-radius:12px;background:#061423}.field span{display:block;color:#7896b2;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.field b{display:block;margin-top:5px;color:#f3f7fb;overflow-wrap:anywhere}.customer-box{margin-top:16px;padding:16px;border:1px solid #2c5b80;border-radius:14px;background:#0a2037}.customer-box small{color:#58d99c;font-weight:900}.customer-box h3{margin:5px 0 10px}.customer-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.customer-grid div{padding:10px;border:1px solid #274966;border-radius:10px;background:#061523}.customer-grid span{display:block;color:#7f9ab5;font-size:9px;text-transform:uppercase}.customer-grid b{display:block;margin-top:4px;font-size:12px}.profile-note{margin-top:14px;padding:12px;border-left:4px solid #2c9de8;background:#0a2037;color:#aac2d8;font-size:11px}.error{padding:18px;border:1px solid #7e3340;border-radius:12px;background:#351821;color:#ffc7ce}.loading{padding:20px;color:#a9bfd4}@media(max-width:700px){.profile-grid,.customer-grid{grid-template-columns:1fr}.profile-head{flex-direction:column}.profile-name{flex-direction:column}}
  </style>
</head>
<body class="belm-admin">
<div class="belm-shell" id="belmShell">
  <aside class="belm-sidebar">
    <div class="belm-brand"><div class="belm-brand__name">BELM<span class="belm-brand__slash">/</span></div><div class="belm-brand__tag">OPERATIONS PLATFORM</div></div>
    <nav class="belm-nav">
      <a href="index.html" class="belm-nav__item">⌂ <span>Home</span></a>
      <a href="my-job-cards.php" class="belm-nav__item">▤ <span>My Job Cards</span></a>
      <a href="customer-machines.php" class="belm-nav__item">🚜 <span>Customer Machines</span></a>
      <a href="diagnosis-repair.php" class="belm-nav__item">🔧 <span>Diagnosis Report</span></a>
      <a href="spare-requests.php" class="belm-nav__item">⬡ <span>Spare Requests</span></a>
      <a href="testing-completion.php" class="belm-nav__item">✓ <span>Testing &amp; Completion</span></a>
      <a href="daily-checklists.php" class="belm-nav__item">☑ <span>Daily Checklists</span></a>
      <a href="communication.php" class="belm-nav__item">✉ <span>Communication</span></a>
      <a href="my-reports.php" class="belm-nav__item">▥ <span>My Reports</span></a>
      <a href="my-profile.php" class="belm-nav__item is-active">♙ <span>My Profile</span></a>
    </nav>
    <div class="belm-nav__divider"></div>
    <div class="belm-sidebar__foot"><a href="logout.php" class="belm-nav__item">↪ <span>Log out</span></a></div>
  </aside>
  <div class="belm-main"><header class="belm-topbar"><div class="belm-topbar__left"><button class="belm-topbar__menu" id="sidebarToggle" type="button">☰</button><span class="belm-topbar__kicker">TECHNICIAN PROFILE</span></div><div class="belm-user"><div><div class="belm-user__name">TECHNICIAN</div><div class="belm-user__role">TECHNICAL DEPARTMENT</div></div></div></header><main class="belm-content"><div id="profileRoot" class="profile-wrap"><div class="loading">Loading registration profile…</div></div></main></div>
</div>
<script>
(()=>{'use strict';const token=localStorage.getItem('belm_tech_token')||'',root=document.getElementById('profileRoot'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])),fmt=v=>{if(!v)return'Not recorded';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})};async function load(){if(!token){location.replace('/login');return}try{const r=await fetch('/api/technician-dashboard?action=profile',{cache:'no-store',headers:{Authorization:`Bearer ${token}`}}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not load profile.');const p=d.profile||{},c=p.assignedCustomer||null;root.innerHTML=`<section class="profile-head"><div><small>MY PROFILE</small><h1>Registration Details</h1><p>Synced directly from the Technician registration record.</p></div><span class="sync-badge">LIVE REGISTRATION SYNC</span></section><section class="profile-card"><div class="profile-name"><div><h2>${esc(p.name||'Technician')}</h2><p>${esc(p.role||'Technician')} · ${esc(p.accountType||'Technician')}</p></div><span class="status">${esc(p.status||'Active')}</span></div><div class="profile-grid"><div class="field"><span>Full Name</span><b>${esc(p.name||'Not recorded')}</b></div><div class="field"><span>Email</span><b>${esc(p.email||'Not recorded')}</b></div><div class="field"><span>Phone</span><b>${esc(p.phone||'Not recorded')}</b></div><div class="field"><span>Role</span><b>${esc(p.role||'Technician')}</b></div><div class="field"><span>Account Type</span><b>${esc(p.accountType||'Technician')}</b></div><div class="field"><span>Registered</span><b>${esc(fmt(p.registeredAt))}</b></div><div class="field"><span>Managed By</span><b>${esc(p.managedBy||'BELM GENERAL TECH SERVICE')}</b></div><div class="field"><span>Account Status</span><b>${esc(p.status||'Active')}</b></div></div>${c?`<section class="customer-box"><small>ASSIGNED CUSTOMER</small><h3>${esc(c.name||'Customer')}</h3><div class="customer-grid"><div><span>Email</span><b>${esc(c.email||'Not recorded')}</b></div><div><span>Phone</span><b>${esc(c.phone||'Not recorded')}</b></div><div><span>Address</span><b>${esc(c.address||'Not recorded')}</b></div></div></section>`:''}<div class="profile-note">These details are read-only here. When the registration record is changed by the authorized administrator, My Profile reflects the updated record automatically.</div></section>`}catch(e){root.innerHTML=`<div class="error">${esc(e.message||'Could not load profile.')}</div>`}}document.getElementById('sidebarToggle')?.addEventListener('click',()=>document.getElementById('belmShell')?.classList.toggle('is-sidebar-open'));load()})();
</script>
</body></html>