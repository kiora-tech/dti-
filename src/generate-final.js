/**
 * Génération DTI+ finale - Format v4
 * - 15 produits CIEL uniquement
 * - Régularisations en autres-sorties (sans taxe)
 * - Vraies ventes en sorties-avec-paiement
 */

const https = require('https');
const fs = require('fs');

const API_USER = 'REDACTED_USER';
const API_PASS = 'REDACTED_PASS';
const AGREMENT = 'FRXXXXXXXXXX';
const NAMESPACE = 'http://douane.finances.gouv.fr/app/ciel/dtiplus/v1';

// 15 produits CIEL avec stock fin novembre 2024
const produitsCiel = {
  "BDN": { tav: 5.0, stockNov: 0.2838, aVider: true },
  "Bière a 5 (test)": { tav: 5.0, stockNov: 3.8547, aVider: true },
  "Event Triple": { tav: 5.6, stockNov: 0 },
  "Huna": { tav: 5.0, stockNov: 0 },
  "L'Alsacienne": { tav: 5.8, stockNov: 1.4208 },
  "La Blondinette": { tav: 5.0, stockNov: 6.7197 },
  "La champêtre": { tav: 5.0, stockNov: 0 },
  "La Confinée": { tav: 5.4, stockNov: 2.9658 },
  "La Fresh": { tav: 4.6, stockNov: 3.1944 },
  "La Rousseau": { tav: 5.0, stockNov: 0.1056, aVider: true },
  "La Stéphanoise": { tav: 5.0, stockNov: 0.0132 },
  "La sureau": { tav: 5.0, stockNov: 0.0315 },
  "Papa noël": { tav: 5.0, stockNov: 0 },
  "Stout": { tav: 5.5, stockNov: 0 },
  "Waldmeister": { tav: 5.0, stockNov: 0.0561 },
};

const periodes = [];
for (let y = 2024; y <= 2026; y++) {
  for (let m = 1; m <= 12; m++) {
    if (y === 2024 && m < 12) continue;
    if (y === 2026 && m > 2) continue;
    periodes.push(`${y}-${String(m).padStart(2, '0')}`);
  }
}

function fetchDRM(date) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${API_USER}:${API_PASS}`).toString('base64');
    const postData = JSON.stringify(date);
    
    const options = {
      hostname: 'api.easybeer.fr',
      path: '/douane/drm?forceRefresh=false&masquerProduitsZero=false',
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
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

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

function generateProduitXml(p) {
  return `
    <produit>
      <libelle-personnalise>${escapeXml(p.nom)}</libelle-personnalise>
      <libelle-fiscal>BIERE_PETITE_BRASSERIE_SUP_2_8</libelle-fiscal>
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

function generateXml(periode, produits) {
  const [annee, mois] = periode.split('-');
  const produitsXml = produits.map(generateProduitXml).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<mouvements-balances xmlns="${NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NAMESPACE} ciel-dti-plus_v1.0.24.xsd">
  <periode-taxation>
    <mois>${mois}</mois>
    <annee>${annee}</annee>
  </periode-taxation>
  <identification-redevable>${AGREMENT}</identification-redevable>
  <droits-suspendus>${produitsXml}
  </droits-suspendus>
</mouvements-balances>`;
}

async function main() {
  const outDir = 'dti-plus-final';
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }
  
  // État des stocks (stock_fin mois N = stock_début mois N+1)
  let stocks = {};
  for (const [nom, data] of Object.entries(produitsCiel)) {
    stocks[nom] = data.stockNov;
  }
  
  for (const periode of periodes) {
    const [annee, mois] = periode.split('-');
    const dateApi = `${annee}-${mois}-01T00:00:00.000Z`;
    
    console.log(`\nRécupération DRM ${periode}...`);
    
    try {
      const result = await fetchDRM(dateApi);
      
      // Collecter données EasyBeer
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
      
      for (const [nom, ciel] of Object.entries(produitsCiel)) {
        const stockDebut = stocks[nom];
        const eb = easyBeerData[nom];
        
        let production = 0;
        let ventes = 0;
        let autresSorties = 0;
        let stockFin = stockDebut;
        let observations = 'Pas de mouvement';
        
        if (eb) {
          // Vraies ventes EasyBeer
          ventes = Math.max(0, eb.sortiesVentes);
          production = Math.max(0, eb.entreesDS);
          
          // Stock fin EasyBeer (on fait confiance à EasyBeer pour le stock)
          const stockFinEB = Math.max(0, eb.stockFinal);
          
          // Calcul de ce qui devrait rester
          const stockFinCalc = round5(stockDebut + production - ventes);
          
          if (stockFinCalc > stockFinEB + 0.0001) {
            // Il faut des sorties supplémentaires (régularisation)
            autresSorties = round5(stockFinCalc - stockFinEB);
            stockFin = stockFinEB;
            observations = 'Ajustement inventaire';
          } else if (stockFinCalc < stockFinEB - 0.0001) {
            // Il manque des entrées (production non enregistrée)
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
        } else {
          // Pas de données EasyBeer pour ce produit CIEL
          if (ciel.aVider && periode === '2024-12' && stockDebut > 0.0001) {
            // Produit à vider en décembre (régularisation sans taxe)
            autresSorties = stockDebut;
            stockFin = 0;
            observations = 'Régularisation - produit non suivi';
          }
        }
        
        // Cas spécial La Blondinette en décembre : écart CIEL/EasyBeer
        if (nom === 'La Blondinette' && periode === '2024-12') {
          // Stock CIEL = 6.7197, stock EasyBeer = 3.1665
          // Écart = 3.5532 à mettre en autres-sorties
          const ecart = round5(stockDebut - (easyBeerData[nom]?.stockRestant || 0));
          if (ecart > 0.0001) {
            autresSorties = round5(autresSorties + ecart);
            stockFin = round5(stockDebut + production - ventes - autresSorties);
            observations = 'Ventes et ajustement stock';
          }
        }
        
        // Cas spécial La sureau et Waldmeister en décembre
        if ((nom === 'La sureau' || nom === 'Waldmeister') && periode === '2024-12') {
          const eb = easyBeerData[nom];
          if (eb) {
            const ecart = round5(stockDebut - eb.stockRestant);
            if (ecart > 0.0001) {
              autresSorties = ecart;
              stockFin = eb.stockFinal;
              observations = 'Ajustement stock';
            }
          }
        }
        
        produitsMois.push({
          nom,
          tav: ciel.tav,
          stockDebut,
          production,
          ventes,
          autresSorties,
          stockFin,
          observations
        });
        
        // Mettre à jour le stock pour le mois suivant
        stocks[nom] = stockFin;
      }
      
      // Générer XML
      const xml = generateXml(periode, produitsMois);
      const filename = `${outDir}/${periode}.xml`;
      fs.writeFileSync(filename, xml);
      
      console.log(`✓ ${filename} (ventes: ${totalVentes.toFixed(4)} hl)`);
      
    } catch (err) {
      console.error(`Erreur ${periode}:`, err.message);
    }
    
    // Délai 5s
    await new Promise(r => setTimeout(r, 5000));
  }
  
  console.log(`\n${periodes.length} fichiers générés dans ${outDir}/`);
}

main().catch(console.error);
