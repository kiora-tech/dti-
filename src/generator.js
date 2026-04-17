/**
 * DTI+ CIEL Generator - Core module
 * Reusable, stateless functions for generating DTI+ XML declarations
 * from EasyBeer API data.
 *
 * No file I/O, no global state, no process.env reads.
 * Credentials are always passed as function parameters and never stored.
 */

const https = require('https');

const NAMESPACE = 'http://douane.finances.gouv.fr/app/ciel/dtiplus/v1';

const VALID_LIBELLES = [
  'BIERE_PETITE_BRASSERIE_SUP_2_8',
  'BIERE_PETITE_BRASSERIE_SUP_18',
  'BIERE_INF_2_8',
  'BIERE_INF_2_8_PREMIX',
  'BIERE_INF_2_8_PREMIX_DOM',
  'BIERE_SUP_2_8_BRASSERIE_TAUX_NORMAL',
  'BIERE_SUP_18_BRASSERIE_TAUX_NORMAL',
  'BIERE_SUP_2_8_BRASSERIE_TAUX_NORMAL_PREMIX',
  'BIERE_SUP_2_8_BRASSERIE_TAUX_NORMAL_PREMIX_DOM',
  'BIERE_PETITE_BRASSERIE_SUP_2_8_PREMIX',
  'BIERE_PETITE_BRASSERIE_SUP_2_8_PREMIX_DOM',
  'BIERE_SUP_2_8_PETITE_BRASSERIE_10000',
  'BIERE_SUP_18_PETITE_BRASSERIE_10000',
  'BIERE_SUP_2_8_PETITE_BRASSERIE_10000_PREMIX',
  'BIERE_SUP_2_8_PETITE_BRASSERIE_10000_PREMIX_DOM',
  'BIERE_SUP_2_8_PETITE_BRASSERIE_50000',
  'BIERE_SUP_18_PETITE_BRASSERIE_50000',
  'BIERE_SUP_2_8_PETITE_BRASSERIE_50000_PREMIX',
  'BIERE_SUP_2_8_PETITE_BRASSERIE_50000_PREMIX_DOM',
  'BIERE_SUP_2_8_PETITE_BRASSERIE_200000',
  'BIERE_SUP_18_PETITE_BRASSERIE_200000',
  'BIERE_SUP_2_8_PETITE_BRASSERIE_200000_PREMIX',
  'BIERE_SUP_2_8_PETITE_BRASSERIE_200000_PREMIX_DOM',
];

function round5(val) {
  return Math.round(val * 100000) / 100000;
}

function formatVolume(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  const num = round5(Math.max(0, parseFloat(val)));
  if (num === 0) return '0';
  return num.toFixed(5).replace(/\.?0+$/, '');
}

function escapeXml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
}

/**
 * Fetch DRM data from EasyBeer API for a given date.
 * Credentials are used only for this request and not retained.
 */
function fetchDRM(apiUser, apiPass, dateISO) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${apiUser}:${apiPass}`).toString('base64');
    const postData = JSON.stringify({
      filtre: {
        idsProduits: [],
        categoriesFiscales: [],
        masquerProduitsZero: false
      },
      date: dateISO
    });

    const options = {
      hostname: 'api.easybeer.fr',
      path: '/douane/drm?forceRefresh=false',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error('Identifiants EasyBeer invalides'));
          return;
        }
        if (res.statusCode >= 400) {
          reject(new Error(`Erreur API EasyBeer (HTTP ${res.statusCode})`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Réponse API invalide: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Connexion API impossible: ${e.message}`)));
    req.write(postData);
    req.end();
  });
}

function generateProduitXml(p) {
  const libelle = p.libelleFiscal || 'BIERE_PETITE_BRASSERIE_SUP_2_8';
  return `
    <produit>
      <libelle-personnalise>${escapeXml(p.nom)}</libelle-personnalise>
      <libelle-fiscal>${escapeXml(libelle)}</libelle-fiscal>
      <tav>${p.tav}</tav>
      <observations>${escapeXml(p.observations)}</observations>
      <balance-stock>
        <stock-debut-periode>${formatVolume(p.stockDebut)}</stock-debut-periode>
        <entrees-periode>
          <volume-produit>${formatVolume(p.production)}</volume-produit>
          <entree-droits-suspendus>0</entree-droits-suspendus>
          <travail-a-facon>0</travail-a-facon>
        </entrees-periode>
        <sorties-periode>
          <sorties-avec-paiement-droits>
            <sorties-avec-paiement-annee-courante>${formatVolume(p.ventes)}</sorties-avec-paiement-annee-courante>
          </sorties-avec-paiement-droits>
          <sorties-sans-paiement-droits>
            <sorties-definitives>0</sorties-definitives>
            <sorties-exoneration-droits>0</sorties-exoneration-droits>
            <travail-a-facon>0</travail-a-facon>
            <fabrication-autre-produit>0</fabrication-autre-produit>
            <lies-vins-distilles>0</lies-vins-distilles>
            <autres-sorties>${formatVolume(p.autresSorties)}</autres-sorties>
          </sorties-sans-paiement-droits>
        </sorties-periode>
        <stock-fin-periode>${formatVolume(p.stockFin)}</stock-fin-periode>
      </balance-stock>
    </produit>`;
}

function generateXml(periode, produits, agrement) {
  const [annee, mois] = periode.split('-');
  const produitsXml = produits.map(generateProduitXml).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<mouvements-balances xmlns="${NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NAMESPACE} ciel-dti-plus_v1.0.24.xsd">
  <periode-taxation>
    <mois>${mois}</mois>
    <annee>${annee}</annee>
  </periode-taxation>
  <identification-redevable>${escapeXml(agrement)}</identification-redevable>
  <droits-suspendus>${produitsXml}
  </droits-suspendus>
</mouvements-balances>`;
}

/**
 * Aggregate EasyBeer data from multiple products into one.
 */
function aggregateEasyBeer(ebNoms, easyBeerData) {
  let hasData = false;
  let stockRestant = 0;
  let entreesDS = 0;
  let sortiesVentes = 0;
  let stockFinal = 0;

  for (const ebNom of ebNoms) {
    const eb = easyBeerData[ebNom];
    if (eb) {
      hasData = true;
      stockRestant += eb.stockRestant;
      entreesDS += eb.entreesDS;
      sortiesVentes += eb.sortiesVentes;
      stockFinal += eb.stockFinal;
    }
  }

  return hasData ? { stockRestant, entreesDS, sortiesVentes, stockFinal } : null;
}

/**
 * Process a single month: fetch DRM, reconcile stocks, return product data.
 */
async function processMonth(periode, produitsCiel, stocks, apiUser, apiPass) {
  const [annee, mois] = periode.split('-');
  const dateApi = `${annee}-${mois}-01T00:00:00.000Z`;

  const result = await fetchDRM(apiUser, apiPass, dateApi);

  // Collect EasyBeer data
  const easyBeerData = {};
  if (result.objet && result.objet.entrepots) {
    const entrepot = result.objet.entrepots[0];
    if (entrepot && entrepot.degres) {
      for (const degre of entrepot.degres) {
        for (const prod of degre.produits || []) {
          easyBeerData[prod.nom] = {
            stockRestant: parseFloat(prod.stockRestant) || 0,
            entreesDS: parseFloat(prod.entreesDroitsSuspendus) || 0,
            sortiesVentes: parseFloat(prod.sortiesVentes) || 0,
            stockFinal: parseFloat(prod.stockFinal) || 0
          };
        }
      }
    }
  }

  const produitsMois = [];
  let totalVentes = 0;
  const updatedStocks = { ...stocks };

  for (const p of produitsCiel) {
    const nom = p.nom;
    // Support multiple EasyBeer products mapped to one CIEL product
    const ebNoms = p.easyBeerNoms || (p.easyBeerNom ? [p.easyBeerNom] : [nom]);
    const stockDebut = stocks[nom] || 0;

    // Aggregate data from all mapped EasyBeer products
    const eb = aggregateEasyBeer(ebNoms, easyBeerData);

    let production = 0;
    let ventes = 0;
    let autresSorties = 0;
    let stockFin = stockDebut;
    let observations = 'Pas de mouvement';

    if (eb) {
      ventes = Math.max(0, eb.sortiesVentes);
      production = Math.max(0, eb.entreesDS);

      const stockFinEB = Math.max(0, eb.stockFinal);
      const stockFinCalc = round5(stockDebut + production - ventes);

      if (stockFinCalc > stockFinEB + 0.0001) {
        autresSorties = round5(stockFinCalc - stockFinEB);
        stockFin = stockFinEB;
        observations = 'Ajustement inventaire';
      } else if (stockFinCalc < stockFinEB - 0.0001) {
        production = round5(production + (stockFinEB - stockFinCalc));
        stockFin = stockFinEB;
        observations = 'Correction production';
      } else {
        stockFin = stockFinEB;
      }

      if (ventes > 0.0001 || production > 0.0001) {
        if (autresSorties > 0.0001) {
          observations = 'Ventes et ajustement';
        } else if (production > 0.0001 && ventes > 0.0001) {
          observations = 'Production et ventes';
        } else if (production > 0.0001) {
          observations = 'Production';
        } else {
          observations = 'Ventes';
        }
      }

      totalVentes += ventes;
    }

    produitsMois.push({
      nom,
      tav: p.tav,
      libelleFiscal: p.libelleFiscal || 'BIERE_PETITE_BRASSERIE_SUP_2_8',
      stockDebut,
      production,
      ventes,
      autresSorties,
      stockFin,
      observations
    });

    updatedStocks[nom] = stockFin;
  }

  return { produits: produitsMois, stocks: updatedStocks, totalVentes };
}

/**
 * Generate period strings from startDate to endDate (inclusive).
 */
function buildPeriodes(startDate, endDate) {
  const [sy, sm] = startDate.split('-').map(Number);
  const [ey, em] = endDate.split('-').map(Number);
  const periodes = [];

  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    periodes.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return periodes;
}

/**
 * Generate all DTI+ XML files for a date range.
 * Returns an array of { filename, content } objects.
 *
 * @param {Object} config
 * @param {string} config.apiUser - EasyBeer API username (not stored)
 * @param {string} config.apiPass - EasyBeer API password (not stored)
 * @param {string} config.agrement - Numero d'accise
 * @param {Array} config.produits - Product definitions [{nom, tav, stockInitial, libelleFiscal}]
 * @param {string} config.startDate - Start period "YYYY-MM"
 * @param {string} config.endDate - End period "YYYY-MM"
 * @param {Function} [config.onProgress] - Optional callback(message) for progress updates
 */
async function generateAllPeriods(config) {
  const { apiUser, apiPass, agrement, produits, startDate, endDate, onProgress, isAborted } = config;
  const periodes = buildPeriodes(startDate, endDate);

  if (periodes.length === 0) {
    throw new Error('Plage de dates invalide');
  }
  if (periodes.length > 36) {
    throw new Error('Maximum 36 mois par génération');
  }

  // Initialize stocks from product definitions
  let stocks = {};
  for (const p of produits) {
    stocks[p.nom] = parseFloat(p.stockInitial) || 0;
  }

  const files = [];

  for (let i = 0; i < periodes.length; i++) {
    if (isAborted && isAborted()) break;

    const periode = periodes[i];
    if (onProgress) onProgress(`Récupération DRM ${periode}... (${i + 1}/${periodes.length})`);

    const result = await processMonth(periode, produits, stocks, apiUser, apiPass);
    stocks = result.stocks;

    const xml = generateXml(periode, result.produits, agrement);
    files.push({ filename: `${periode}.xml`, content: xml });

    // Delay between API calls (except for the last one)
    if (i < periodes.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return files;
}

module.exports = {
  generateAllPeriods,
  buildPeriodes,
  fetchDRM,
  processMonth,
  generateXml,
  generateProduitXml,
  aggregateEasyBeer,
  escapeXml,
  formatVolume,
  round5,
  VALID_LIBELLES
};
