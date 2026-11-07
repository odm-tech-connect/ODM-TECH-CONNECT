const fs = require('fs');
const vm = require('vm');
const path = require('path');

const pages = [
  { file: 'index.html', lang: 'fr' },
  { file: 'en/index.html', lang: 'en' }
];

const divisions = [
  'ODM Marketplace',
  'ODM Business',
  'ODM Trade',
  'ODM Logistics',
  'ODM Digital',
  'ODM Global Network'
];

let errors = 0;
let warnings = 0;

function ok(message) {
  console.log('✅ ' + message);
}

function fail(message) {
  console.log('❌ ' + message);
  errors++;
}

function warn(message) {
  console.log('⚠️ ' + message);
  warnings++;
}

function attr(tag, name) {
  const re = new RegExp(
    "\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')",
    "i"
  );
  const match = tag.match(re);
  return match ? (match[1] ?? match[2]) : null;
}

console.log('\n====================================');
console.log(' ODM TECH CONNECT - CONTRÔLE GLOBAL');
console.log('====================================');

for (const page of pages) {
  console.log('\n===== ' + page.file + ' =====');

  if (!fs.existsSync(page.file)) {
    fail('Page absente : ' + page.file);
    continue;
  }

  const html = fs.readFileSync(page.file, 'utf8');

  if (html.includes('ODM_DIVISIONS_VISUELLES_V1')) {
    ok('Intégration des divisions présente');
  } else {
    fail('Intégration des divisions absente');
  }

  if (html.includes('ODM_DIVISIONS_VISUELLES_CSS_V1')) {
    ok('Styles des divisions présents');
  } else {
    fail('Styles des divisions absents');
  }

  if (/<html[^>]*lang=["']/.test(html)) {
    ok('Attribut de langue présent');
  } else {
    fail('Attribut de langue absent');
  }

  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) {
    ok('Titre SEO présent');
  } else {
    fail('Titre SEO absent');
  }

  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)]
    .map(match => match[1]);

  const duplicates = ids.filter(
    (id, index) => ids.indexOf(id) !== index
  );

  if (duplicates.length === 0) {
    ok('Aucun identifiant HTML dupliqué');
  } else {
    fail('Identifiants dupliqués : ' + [...new Set(duplicates)].join(', '));
  }

  const idSet = new Set(ids);
  const anchors = [...html.matchAll(/\bhref=["']#([^"']+)["']/gi)]
    .map(match => match[1])
    .filter(id => id);

  const missingAnchors = [...new Set(anchors)]
    .filter(id => !idSet.has(id));

  if (missingAnchors.length === 0) {
    ok('Tous les liens internes correspondent à une section');
  } else {
    fail('Liens internes sans destination : ' + missingAnchors.join(', '));
  }

  const images = [...html.matchAll(/<img\b[^>]*>/gi)]
    .map(match => match[0]);

  const missingAlt = images.filter(tag => !attr(tag, 'alt'));
  const missingSrc = images.filter(tag => !attr(tag, 'src'));

  if (missingAlt.length === 0) {
    ok('Toutes les images possèdent un texte alternatif');
  } else {
    fail(missingAlt.length + ' image(s) sans texte alternatif');
  }

  if (missingSrc.length === 0) {
    ok('Toutes les images possèdent une source');
  } else {
    fail(missingSrc.length + ' image(s) sans source');
  }

  const htmlWithoutStyles = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const divisionCards = (
    htmlWithoutStyles.match(/<article\b[^>]*\bclass=["'][^"']*\bdivision-card\b[^"']*["'][^>]*>/gi) || []
  ).length;

  if (divisionCards === 6) {
    ok('Six cartes de divisions présentes');
  } else {
    fail('Nombre de cartes incorrect : ' + divisionCards);
  }

  for (const division of divisions) {
    if (html.includes(division)) {
      ok(division + ' présente');
    } else {
      fail(division + ' absente');
    }
  }

  const divisionImages = (
    html.match(/<img\b[^>]*src=["']https:\/\/images\.unsplash\.com\/[^"']+["'][^>]*>/g) || []
  );

  if (divisionImages.length >= 6) {
    ok('Images professionnelles des divisions détectées : ' + divisionImages.length);
  } else {
    fail('Moins de six images professionnelles détectées');
  }

  const badLocalImages = [];

  for (const tag of images) {
    const src = attr(tag, 'src');
    if (!src || /^(https?:|data:|\/\/|#)/i.test(src)) continue;

    const localPath = path.resolve(path.dirname(page.file), src);

    if (!fs.existsSync(localPath)) {
      badLocalImages.push(src);
    }
  }

  if (badLocalImages.length === 0) {
    ok('Toutes les images locales référencées existent');
  } else {
    fail('Images locales introuvables : ' + badLocalImages.join(', '));
  }

  const navLink = page.lang === 'fr'
    ? /href=["']#divisions["'][^>]*>Nos divisions<\/a>/i
    : /href=["']#divisions["'][^>]*>Our divisions<\/a>/i;

  if (navLink.test(html)) {
    ok('Lien des divisions présent dans le menu');
  } else {
    fail('Lien des divisions absent du menu');
  }

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  let scriptCount = 0;
  let scriptErrors = 0;

  for (const script of scripts) {
    if (/\bsrc\s*=/.test(script[1])) continue;
    if (!script[2].trim()) continue;

    scriptCount++;

    try {
      new vm.Script(script[2], {
        filename: page.file + ' - script ' + scriptCount
      });
    } catch (error) {
      scriptErrors++;
      console.log('❌ Erreur JavaScript : ' + error.message);
    }
  }

  if (scriptErrors === 0) {
    ok('Scripts JavaScript intégrés valides (' + scriptCount + ')');
  } else {
    fail(scriptErrors + ' erreur(s) dans les scripts JavaScript');
  }

  if (/<\/main>/i.test(html) && /<\/body>/i.test(html) && /<\/html>/i.test(html)) {
    ok('Structure principale HTML présente');
  } else {
    fail('Structure HTML incomplète');
  }

  if (html.includes('ODM TECH CONNECT')) {
    ok('Identité ODM TECH CONNECT présente');
  } else {
    fail('Identité ODM TECH CONNECT absente');
  }
}

console.log('\n====================================');
console.log('           RÉSULTAT FINAL');
console.log('====================================');
console.log('Erreurs : ' + errors);
console.log('Avertissements : ' + warnings);

if (errors === 0) {
  console.log('\n✅ CONTRÔLE TERMINÉ : AUCUNE ERREUR DÉTECTÉE.');
} else {
  console.log('\n❌ CONTRÔLE TERMINÉ : DES CORRECTIONS SONT NÉCESSAIRES.');
}

console.log('\nNote : les images distantes doivent encore être vérifiées en ligne.');
console.log('Ce programme ne modifie aucun fichier.');

process.exitCode = errors > 0 ? 1 : 0;
