
function googleTranslateElementInit(){
  new google.translate.TranslateElement({
    pageLanguage:'fr', includedLanguages:'en', autoDisplay:false,
    layout:google.translate.TranslateElement.InlineLayout.SIMPLE
  },'google_translate_element');
}
(function(){
  const lang=(navigator.languages && navigator.languages[0] || navigator.language || 'fr').toLowerCase();
  const prefersEnglish=lang.startsWith('en');
  const hasChoice=document.cookie.split(';').some(c=>c.trim().startsWith('googtrans='));
  if(prefersEnglish && !hasChoice){
    document.cookie='googtrans=/fr/en;path=/';
    document.cookie='googtrans=/fr/en;path=/;domain='+location.hostname;
  }
})();
const languageSelect=document.getElementById('siteLanguage');
function currentSiteLanguage(){
  const match=document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('googtrans='));
  return match && match.split('=')[1].endsWith('/en') ? 'en' : 'fr';
}
if(languageSelect){
  languageSelect.value=currentSiteLanguage();
  languageSelect.addEventListener('change',()=>{
    const target=languageSelect.value;
    const value=target==='en'?'/fr/en':'/fr/fr';
    document.cookie='googtrans='+value+';path=/';
    document.cookie='googtrans='+value+';path=/;domain='+location.hostname;
    location.reload();
  });
}
const toggle=document.getElementById('menuToggle');
const links=document.getElementById('navLinks');
toggle.addEventListener('click',()=>{
 const opened=links.classList.toggle('open');
 toggle.setAttribute('aria-expanded',String(opened));
 toggle.textContent=opened?'×':'☰';
});
links.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{
 links.classList.remove('open');
 toggle.setAttribute('aria-expanded','false');
 toggle.textContent='☰';
}));

// Parcours de mise en relation international ou africain
document.querySelectorAll('.odm-tab').forEach(function(tab){
 tab.addEventListener('click',function(){
  document.querySelectorAll('.odm-tab').forEach(b=>b.classList.remove('active'));
  tab.classList.add('active');
  const intl=tab.dataset.kind==='international';
  document.getElementById('odmType').value=intl?'Entreprise internationale':'Entreprise africaine';
  document.getElementById('odmCountryLabel').textContent=intl?'Pays d’origine *':'Pays africain *';
  document.getElementById('odmNeedLabel').textContent=intl?'Type de collaboration *':'Besoin de l’entreprise *';
  document.getElementById('odmNeed').innerHTML=intl
   ? '<option value="">Choisir</option><option>Représentation commerciale</option><option>Recherche de distributeurs</option><option>Prospection de marché</option><option>Mise en relation commerciale</option><option>Autre</option>'
   : '<option value="">Choisir</option><option>Recherche de fournisseurs ou fabricants</option><option>Recherche de partenaires internationaux</option><option>Recherche de produits ou équipements</option><option>Développement commercial</option><option>Accompagnement numérique</option><option>Autre</option>';
 });
});
document.getElementById('odmMatchForm').addEventListener('submit',function(e){
 e.preventDefault();
 const form=e.currentTarget;
 if(!form.reportValidity()) return;
 const d=new FormData(form);
 const body=[...d.entries()].map(([k,v])=>k+' : '+v).join('\n');
 document.getElementById('odmFeedback').textContent='Votre application e-mail va s’ouvrir. Vérifiez puis envoyez votre demande.';
 window.location.href='mailto:odmtechconnect@gmail.com?subject='+encodeURIComponent('Demande de mise en relation - ODM TECH CONNECT')+'&body='+encodeURIComponent(body);
});

