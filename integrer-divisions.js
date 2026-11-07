const fs = require('fs');
const path = require('path');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join('backups', 'integration-visuelle-' + stamp);

const photos = {
  marketplace: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1000&q=85',
  business: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1000&q=85',
  trade: 'https://images.unsplash.com/photo-1494412519320-aa613dfb7738?auto=format&fit=crop&w=1000&q=85',
  logistics: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1000&q=85',
  digital: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1000&q=85',
  network: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1000&q=85'
};

const css = `
/* ODM_DIVISIONS_VISUELLES_CSS_V1 */
.division-section {
  padding: 95px 0;
  background: #071522;
}
.division-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 22px;
  margin-top: 38px;
}
.division-card {
  overflow: hidden;
  border: 1px solid rgba(174,216,239,.18);
  border-radius: 15px;
  background: linear-gradient(145deg,#122d43,#0b2032);
  transition: transform .25s ease, border-color .25s ease;
}
.division-card:hover {
  transform: translateY(-5px);
  border-color: #58cdf5;
}
.division-card img {
  display: block;
  width: 100%;
  height: 215px;
  object-fit: cover;
}
.division-card-content {
  padding: 23px;
}
.division-number {
  color: #58cdf5;
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 2px;
}
.division-card h3 {
  margin: 12px 0;
  font-size: 21px;
  color: #f7fbff;
}
.division-card p {
  color: #b4c5d3;
  font-size: 13px;
  line-height: 1.8;
}
.division-status {
  display: inline-block;
  margin-top: 17px;
  padding: 6px 10px;
  border: 1px solid rgba(88,205,245,.35);
  border-radius: 5px;
  color: #a6e8ff;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 1px;
  text-transform: uppercase;
}
@media(max-width:900px) {
  .division-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
}
@media(max-width:600px) {
  .division-section { padding: 65px 0; }
  .division-grid { grid-template-columns: 1fr; gap: 17px; }
  .division-card img { height: 220px; }
}
`;

const frSection = `
<!-- ODM_DIVISIONS_VISUELLES_V1 -->
<section class="division-section" id="divisions">
 <div class="container">
  <div class="section-head">
   <div class="kicker">Les pôles d'activité ODM</div>
   <h2>Six divisions pour connecter les marchés et <span class="accent">développer les échanges.</span></h2>
   <p class="section-lead">
    ODM TECH CONNECT construit progressivement une plateforme de relations
    commerciales et de services destinée aux entreprises de Guinée,
    d'Afrique de l'Ouest et du reste du monde.
   </p>
  </div>
  <div class="division-grid">

   <article class="division-card">
    <img src="${photos.marketplace}" alt="Équipements électroniques et composants pour le commerce" loading="lazy" decoding="async">
    <div class="division-card-content">
     <span class="division-number">01 / MARKETPLACE</span>
     <h3>ODM Marketplace</h3>
     <p>Un espace destiné à mettre en relation acheteurs et fournisseurs, présenter des catalogues de produits et recueillir des demandes commerciales. Les fonctionnalités de la marketplace sont en préparation.</p>
     <span class="division-status">Pôle en développement</span>
    </div>
   </article>

   <article class="division-card">
    <img src="${photos.business}" alt="Professionnels réunis autour d'un projet commercial" loading="lazy" decoding="async">
    <div class="division-card-content">
     <span class="division-number">02 / BUSINESS</span>
     <h3>ODM Business</h3>
     <p>Représentation commerciale, prospection, recherche de partenaires et accompagnement des relations d'affaires, dans le respect des autorisations écrites et des accords conclus.</p>
     <span class="division-status">Pôle en développement</span>
    </div>
   </article>

   <article class="division-card">
    <img src="${photos.trade}" alt="Transport maritime de marchandises et commerce international" loading="lazy" decoding="async">
    <div class="division-card-content">
     <span class="division-number">03 / TRADE</span>
     <h3>ODM Trade</h3>
     <p>Un pôle consacré au développement des échanges commerciaux, à l'import-export et à la distribution, selon les partenariats et les conditions convenus avec les entreprises.</p>
     <span class="division-status">Pôle en développement</span>
    </div>
   </article>

   <article class="division-card">
    <img src="${photos.logistics}" alt="Entrepôt et organisation logistique de marchandises" loading="lazy" decoding="async">
    <div class="division-card-content">
     <span class="division-number">04 / LOGISTICS</span>
     <h3>ODM Logistics</h3>
     <p>Un pôle envisagé pour faciliter les échanges autour du transport, du stockage et de la coordination logistique avec des prestataires et partenaires qualifiés.</p>
     <span class="division-status">Pôle en développement</span>
    </div>
   </article>

   <article class="division-card">
    <img src="${photos.digital}" alt="Équipe professionnelle travaillant avec des outils numériques" loading="lazy" decoding="async">
    <div class="division-card-content">
     <span class="division-number">05 / DIGITAL</span>
     <h3>ODM Digital</h3>
     <p>Accompagnement numérique, présence sur Internet, présentation professionnelle, outils digitaux et solutions destinées à soutenir le développement des entreprises.</p>
     <span class="division-status">Pôle en développement</span>
    </div>
   </article>

   <article class="division-card">
    <img src="${photos.network}" alt="Professionnels échangeant dans un réseau international" loading="lazy" decoding="async">
    <div class="division-card-content">
     <span class="division-number">06 / GLOBAL NETWORK</span>
     <h3>ODM Global Network</h3>
     <p>Développement progressif d'un réseau de correspondants, de professionnels et de partenaires internationaux, avec vérification des informations et définition claire des collaborations.</p>
     <span class="division-status">Pôle en développement</span>
    </div>
   </article>

  </div>
 </div>
</section>
`;

const enSection = `
<!-- ODM_DIVISIONS_VISUELLES_V1 -->
<section class="division-section" id="divisions">
 <div class="container">
  <div class="section-head">
   <div class="kicker">ODM business divisions</div>
   <h2>Six divisions connecting markets and <span class="accent">developing business.</span></h2>
   <p class="section-lead">
    ODM TECH CONNECT is progressively developing a business and professional
    network for companies in Guinea, West Africa and international markets.
   </p>
  </div>
  <div class="division-grid">

   <article class="division-card">
    <img src="${photos.marketplace}" alt="Electronic equipment and components for commerce" loading="lazy" decoding="async">
    <div class="division-card-content">
     <span class="division-number">01 / MARKETPLACE</span>
     <h3>ODM Marketplace</h3>
     <p>A planned space connecting buyers and suppliers, presenting product catalogues and collecting business enquiries. Marketplace features are under development.</p>
     <span class="division-status">In development</span>
    </div>
   </article>

   <article class="division-card">
    <img src="${photos.business}" alt="Professionals meeting to discuss a business project" loading="lazy" decoding="async">
    <div class="division-card-content">
     <span class="division-number">02 / BUSINESS</span>
     <h3>ODM Business</h3>
     <p>Commercial representation, prospecting, partner identification and business relationship support, subject to written authorization and agreed terms.</p>
     <span class="division-status">In development</span>
    </div>
   </article>

   <article class="division-card">
    <img src="${photos.trade}" alt="Maritime freight and international trade" loading="lazy" decoding="async">
    <div class="division-card-content">
     <span class="division-number">03 / TRADE</span>
     <h3>ODM Trade</h3>
     <p>A division focused on developing commercial exchanges, import and export opportunities and distribution, according to agreements with business partners.</p>
     <span class="division-status">In development</span>
    </div>
   </article>

   <article class="division-card">
    <img src="${photos.logistics}" alt="Warehouse and goods logistics operations" loading="lazy" decoding="async">
    <div class="division-card-content">
     <span class="division-number">04 / LOGISTICS</span>
     <h3>ODM Logistics</h3>
     <p>A planned division to support transport, storage and logistics coordination through qualified service providers and partners.</p>
     <span class="division-status">In development</span>
    </div>
   </article>

   <article class="division-card">
    <img src="${photos.digital}" alt="Professional team using digital technology" loading="lazy" decoding="async">
    <div class="division-card-content">
     <span class="division-number">05 / DIGITAL</span>
     <h3>ODM Digital</h3>
     <p>Digital support, online presence, professional business presentation, digital tools and solutions that can support company development.</p>
     <span class="division-status">In development</span>
    </div>
   </article>

   <article class="division-card">
    <img src="${photos.network}" alt="Professionals connecting through an international business network" loading="lazy" decoding="async">
    <div class="division-card-content">
     <span class="division-number">06 / GLOBAL NETWORK</span>
     <h3>ODM Global Network</h3>
     <p>Progressively developing a network of representatives, professionals and international partners, with verified information and clearly defined cooperation.</p>
     <span class="division-status">In development</span>
    </div>
   </article>

  </div>
 </div>
</section>
`;

function integrate(file, language, anchor, section) {
  if (!fs.existsSync(file)) {
    throw new Error('Page introuvable : ' + file);
  }

  let html = fs.readFileSync(file, 'utf8');
  let changed = false;

  if (!html.includes('ODM_DIVISIONS_VISUELLES_CSS_V1')) {
    const styleEnd = html.indexOf('</style>');
    if (styleEnd === -1) {
      throw new Error('Balise </style> introuvable dans ' + file);
    }
    html = html.slice(0, styleEnd) + css + '\n' + html.slice(styleEnd);
    changed = true;
  }

  if (!html.includes('ODM_DIVISIONS_VISUELLES_V1')) {
    const position = html.indexOf(anchor);
    if (position === -1) {
      throw new Error('Emplacement d’intégration introuvable dans ' + file);
    }
    html = html.slice(0, position) + section + '\n' + html.slice(position);
    changed = true;
  }

  const navLink = language === 'fr'
    ? '<a href="#divisions">Nos divisions</a>'
    : '<a href="#divisions">Our divisions</a>';

  if (!html.includes('href="#divisions"')) {
    const navAnchor = language === 'fr'
      ? '<a href="#expertise">Expertises</a>'
      : '<a href="#services">Expertise</a>';

    if (!html.includes(navAnchor)) {
      throw new Error('Lien de navigation introuvable dans ' + file);
    }

    html = html.replace(navAnchor, navAnchor + navLink);
    changed = true;
  }

  if (changed) {
    fs.mkdirSync(backupDir, { recursive: true });
    const backup = path.join(backupDir, file.replaceAll('/', '_'));
    fs.copyFileSync(file, backup);

    const temporary = file + '.integration-temp';
    fs.writeFileSync(temporary, html, 'utf8');
    fs.renameSync(temporary, file);

    console.log('[INTÉGRÉ] ' + file);
    console.log('[SAUVEGARDE] ' + backup);
  } else {
    console.log('[DÉJÀ INTÉGRÉ] ' + file);
  }
}

try {
  integrate(
    'index.html',
    'fr',
    '<section id="representation">',
    frSection
  );

  integrate(
    'en/index.html',
    'en',
    '<section id="mandate">',
    enSection
  );

  console.log('\n======================================');
  console.log('INTÉGRATION DES SIX DIVISIONS TERMINÉE');
  console.log('Les pages FR et EN ont été traitées.');
  console.log('Les sauvegardes sont dans : ' + backupDir);
  console.log('======================================\n');
} catch (error) {
  console.error('\nERREUR :', error.message);
  process.exitCode = 1;
}
