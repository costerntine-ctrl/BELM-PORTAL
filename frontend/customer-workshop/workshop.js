/* V524 compatibility loader: use the clean CWM runtime. */
(function(){
  var s=document.createElement('script');
  s.src='/customer-workshop/workshop-v524.js?v=524-hotfix';
  s.async=false;
  document.head.appendChild(s);
})();
