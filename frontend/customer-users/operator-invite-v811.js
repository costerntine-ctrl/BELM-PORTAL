(function(){
  'use strict';
  function apply(){
    const section=document.getElementById('machine-operator-roster');
    if(!section)return;
    const title=section.querySelector('.panel-head h2');
    const note=section.querySelector('.panel-head p');
    if(title)title.textContent='Machine Operator Invitations';
    if(note)note.textContent='Select a machine, copy its Operator link and send it to the operator. The operator signs up from that link and creates their own 4–6 digit PIN.';

    const addRow=document.getElementById('rosterAddRow');
    if(addRow){addRow.classList.add('hidden');addRow.style.display='none';}

    const linkRow=document.getElementById('rosterOperatorLinkRow');
    if(linkRow&&!document.getElementById('operatorInviteHelpV811')){
      const help=document.createElement('small');
      help.id='operatorInviteHelpV811';
      help.style.cssText='display:block;margin:8px 0 0;opacity:.75;line-height:1.45';
      help.textContent='New operator: open link → Sign up → enter name/contact → create PIN → Operator Dashboard. Returning operator: open the same link → Sign in.';
      linkRow.insertAdjacentElement('afterend',help);
    }

    document.querySelectorAll('#rosterList [data-set-pin]').forEach(btn=>btn.remove());
    document.querySelectorAll('#rosterList .roster-pin-set,#rosterList .roster-pin-missing').forEach(tag=>{
      tag.textContent=tag.classList.contains('roster-pin-set')?'Registered':'Invite not completed';
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  const target=document.getElementById('machine-operator-roster')||document.body;
  new MutationObserver(()=>requestAnimationFrame(apply)).observe(target,{childList:true,subtree:true});
})();
