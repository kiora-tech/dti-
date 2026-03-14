/**
 * Parser for CIEL DTI+ PDF declarations exported from douane.gouv.fr
 * Extracts: agrement, period, and product list (name, TAV, stock fin)
 */

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

async function getPageTexts(uint8Array) {
  const doc = await pdfjsLib.getDocument({ data: uint8Array }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(it => it.str).join(' '));
  }
  return pages;
}

function parseIdentification(pageText) {
  const agrementMatch = pageText.match(/N°\s*d.accises\s+([A-Z]{2}[0-9A-Za-z]{11})/);
  const agrement = agrementMatch ? agrementMatch[1] : null;

  const moisMatch = pageText.match(/MOIS\s+ANNEE\s+.*?(\w+)\s+(\d{4})/s);
  let mois = null;
  let annee = null;
  if (moisMatch) {
    const moisNoms = {
      'Janvier': '01', 'Février': '02', 'Mars': '03', 'Avril': '04',
      'Mai': '05', 'Juin': '06', 'Juillet': '07', 'Août': '08',
      'Septembre': '09', 'Octobre': '10', 'Novembre': '11', 'Décembre': '12',
      'janvier': '01', 'février': '02', 'mars': '03', 'avril': '04',
      'mai': '05', 'juin': '06', 'juillet': '07', 'août': '08',
      'septembre': '09', 'octobre': '10', 'novembre': '11', 'décembre': '12',
    };
    mois = moisNoms[moisMatch[1]] || null;
    annee = moisMatch[2];
  }

  return { agrement, mois, annee };
}

function parseBalancePage(pageText) {
  const products = [];

  // Extract zone between "PRODUITS" and first "% vol."
  const produitsMatch = pageText.match(/PRODUITS\s+(.*?)\s+\d+[.,]\d+\s*%\s*vol\./s);
  if (!produitsMatch) return products;

  // Extract all TAV values
  const tavMatches = [...pageText.matchAll(/(\d+[.,]\d+)\s*%\s*vol\./g)];
  const tavs = tavMatches.map(m => parseFloat(m[1].replace(',', '.')));
  const numProducts = tavs.length;

  if (numProducts === 0) return products;

  // Extract product names: text between "PRODUITS" and first TAV
  const namesRaw = produitsMatch[1].trim();
  // Split by 3+ spaces (table column separators)
  const names = namesRaw.split(/\s{2,}/).map(n => n.trim()).filter(n => n.length > 0);

  // Extract stock de fin de période (line starting with "4   Stock de fin")
  const stockFinMatch = pageText.match(/4\s+Stock de fin de période\s+([\d,.\s]+?)(?:\s+5\s+Observations|\s*$)/s);
  let stockFins = [];
  if (stockFinMatch) {
    stockFins = stockFinMatch[1].trim().split(/\s{2,}/).map(v => parseFloat(v.replace(',', '.')) || 0);
  }

  // Build product list
  for (let i = 0; i < numProducts; i++) {
    products.push({
      nom: names[i] || `Produit ${i + 1}`,
      tav: tavs[i] || 0,
      stockFin: stockFins[i] !== undefined ? stockFins[i] : 0
    });
  }

  return products;
}

async function parseCielPdf(buffer) {
  const uint8 = new Uint8Array(buffer);
  const pages = await getPageTexts(uint8);

  if (pages.length < 2) {
    throw new Error('PDF invalide: au moins 2 pages attendues');
  }

  // Page 1: identification
  const { agrement, mois, annee } = parseIdentification(pages[0]);

  // Pages 2+: balance des stocks (look for "BALANCE DES STOCKS")
  const allProducts = [];
  for (let i = 1; i < pages.length; i++) {
    if (pages[i].includes('BALANCE DES STOCKS')) {
      const products = parseBalancePage(pages[i]);
      allProducts.push(...products);
    }
  }

  const periode = (annee && mois) ? `${annee}-${mois}` : null;

  return {
    agrement,
    periode,
    produits: allProducts
  };
}

module.exports = { parseCielPdf };
