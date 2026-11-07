from pathlib import Path

p = Path("index.html")
html = p.read_text(encoding="utf-8")

if 'id="annuaire-odm"' in html:
    raise SystemExit("Modules déjà présents : arrêt sans modification.")

css = """
/* Modules B2B ODM */
.odm-network,.odm-match{padding:75px 0;background:var(--bg)}
.odm-match{background:var(--bg2)}
.odm-wrap{max-width:var(--max);margin:auto;padding:0 22px}
.odm-intro{color:var(--muted);line-height:1.8;max-width:780px}
.odm-filters,.odm-tabs{display:flex;flex-wrap:wrap;gap:10px;margin:25px 0}
.odm-filter,.odm-tab{padding:11px 16px;border:1px solid var(--line);border-radius:25px;background:var(--panel);color:var(--white);cursor:pointer}
.odm-filter.active,.odm-tab.active{background:var(--blue);color:#071522}
.odm-empty,.odm-panel{padding:25px;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);color:var(--muted);line-height:1.8}
.odm-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.odm-field{display:flex;flex-direction:column;gap:8px}
.odm-field.full,.odm-consent,.odm-feedback{grid-column:1/-1}
.odm-field label{font-size:13px;color:var(--muted)}
.odm-field input,.odm-field select,.odm-field textarea{width:100%;padding:13px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--white);font:inherit}
.odm-field textarea{min-height:120px}
.odm-consent{font-size:13px;color:var(--muted)}
.odm-consent input{width:auto}
.odm-feedback{color:var(--blue2)}
@media(max-width:650px){.odm-form{grid-template-columns:1fr}.odm-field.full,.odm-consent,.odm-feedback{grid-column:1}.odm-network,.odm-match{padding:55px 0}}
"""

modules = """
<section class="odm-network" id="annuaire-odm">
 <div class="odm-wrap">
  <div class="kicker">Réseau Afrique – International</div>
  <h2>Un pont entre les entreprises <span class="accent">du monde et d’Afrique.</span></h2>
  <p class="odm-intro">ODM TECH CONNECT facilite les échanges entre fabricants, fournisseurs, distributeurs et entreprises africaines. La Guinée et l’Afrique de l’Ouest sont notre point de départ.</p>
  <div class="odm-filters">
   <button type="button" class="odm-filter active">Tous les secteurs</button>
   <button type="button" class="odm-filter">Mines & Énergie</button>
   <button type="button" class="odm-filter">Technologies & Numérique</button>
   <button type="button" class="odm-filter">Agriculture & Agroalimentaire</button>
   <button type="button" class="odm-filter">Logistique & Transport</button>
  </div>
  <div class="odm-empty"><strong>Annuaire en cours de constitution.</strong><br>Les entreprises seront publiées après vérification de leurs informations et avec leur accord. Vous représentez une entreprise ? Présentez votre demande ci-dessous.</div>
 </div>
</section>
<section class="odm-match" id="mise-en-relation">
 <div class="odm-wrap">
  <div class="kicker">Développons les échanges</div>
  <h2>Rejoignez le réseau <span class="accent">ODM TECH CONNECT.</span></h2>
  <p class="odm-intro">Vous êtes une entreprise internationale qui souhaite explorer l’Afrique, ou une entreprise africaine qui recherche des partenaires étrangers ? Présentez votre besoin.</p>
  <div class="odm-tabs">
   <button type="button" class="odm-tab active" data-kind="international">Entreprise internationale</button>
   <button type="button" class="odm-tab" data-kind="africaine">Entreprise africaine</button>
  </div>
  <div class="odm-panel">
   <form class="odm-form" id="odmMatchForm">
    <input type="hidden" name="type_demande" id="odmType" value="Entreprise internationale">
    <div class="odm-field"><label>Nom de l’entreprise *</label><input name="entreprise" required></div>
    <div class="odm-field"><label id="odmCountryLabel">Pays d’origine *</label><input name="pays" required></div>
    <div class="odm-field"><label>Nom du contact *</label><input name="contact" required></div>
    <div class="odm-field"><label>E-mail professionnel *</label><input name="email" type="email" required></div>
    <div class="odm-field"><label>Secteur *</label><select name="secteur" required><option value="">Choisir</option><option>Énergie et mines</option><option>Technologies et numérique</option><option>Agriculture et agroalimentaire</option><option>Logistique et transport</option><option>Industrie</option><option>Commerce et distribution</option><option>Autre</option></select></div>
    <div class="odm-field"><label id="odmNeedLabel">Type de collaboration *</label><select name="besoin" id="odmNeed" required><option value="">Choisir</option><option>Représentation commerciale</option><option>Recherche de distributeurs</option><option>Prospection de marché</option><option>Mise en relation commerciale</option><option>Autre</option></select></div>
    <div class="odm-field full"><label>Présentez votre entreprise et votre besoin *</label><textarea name="message" required></textarea></div>
    <label class="odm-consent"><input type="checkbox" required> J’accepte l’utilisation de ces informations par ODM TECH CONNECT pour répondre à ma demande.</label>
    <button class="btn" type="submit">Préparer ma demande ↗</button>
    <p class="odm-feedback" id="odmFeedback" role="status"></p>
   </form>
  </div>
 </div>
</section>
"""

js = """
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
 const body=[...d.entries()].map(([k,v])=>k+' : '+v).join('\\n');
 document.getElementById('odmFeedback').textContent='Votre application e-mail va s’ouvrir. Vérifiez puis envoyez votre demande.';
 window.location.href='mailto:odm-techconnect@gmail.com?subject='+encodeURIComponent('Demande de mise en relation - ODM TECH CONNECT')+'&body='+encodeURIComponent(body);
});
"""

if "</style>" not in html or '<section class="contact-section" id="contact">' not in html:
    raise SystemExit("Repère introuvable : aucun changement effectué.")

html = html.replace("</style>", css + "\\n</style>", 1)
html = html.replace('<section class="contact-section" id="contact">', modules + '\\n<section class="contact-section" id="contact">', 1)

translate = '<script src="https://translate.google.com/translate_a/element.js'
pos = html.find(translate)
end = html.rfind("</script>", 0, pos)
if pos < 0 or end < 0:
    raise SystemExit("Fin du JavaScript introuvable : aucun changement effectué.")

html = html[:end] + js + "\\n" + html[end:]
p.write_text(html, encoding="utf-8")
print("OK : modules B2B et mise en relation intégrés.")
