const LIBELLES_FISCAUX = [
  'BIERE_PETITE_BRASSERIE_SUP_2_8',
  'BIERE_PETITE_BRASSERIE_SUP_18',
  'BIERE_INF_2_8',
  'BIERE_SUP_2_8_BRASSERIE_TAUX_NORMAL',
  'BIERE_SUP_18_BRASSERIE_TAUX_NORMAL',
  'BIERE_SUP_2_8_PETITE_BRASSERIE_10000',
  'BIERE_SUP_18_PETITE_BRASSERIE_10000',
  'BIERE_SUP_2_8_PETITE_BRASSERIE_50000',
  'BIERE_SUP_18_PETITE_BRASSERIE_50000',
  'BIERE_SUP_2_8_PETITE_BRASSERIE_200000',
  'BIERE_SUP_18_PETITE_BRASSERIE_200000',
];

let cielProducts = [];
let easyBeerProducts = [];
let pdfPeriode = null;
let pdfAgrement = null;

function showStatus(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'status ' + type;
}

function show(id) {
  document.getElementById(id).classList.remove('hidden');
}

async function uploadPdf() {
  const fileInput = document.getElementById('pdfFile');
  if (!fileInput.files.length) {
    showStatus('pdfStatus', 'Selectionnez un fichier PDF', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('pdf', fileInput.files[0]);

  showStatus('pdfStatus', 'Analyse du PDF en cours...', 'info');

  try {
    const response = await fetch('/api/parse-pdf', { method: 'POST', body: formData });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
      throw new Error(err.error);
    }

    const result = await response.json();
    cielProducts = result.produits;
    pdfPeriode = result.periode;
    pdfAgrement = result.agrement;

    showStatus('pdfStatus',
      `${cielProducts.length} produits CIEL extraits (periode: ${pdfPeriode}, agrement: ${pdfAgrement})`,
      'success');

    show('step2');
  } catch (err) {
    showStatus('pdfStatus', 'Erreur: ' + err.message, 'error');
  }
}

async function fetchEasyBeerProducts() {
  const apiUser = document.getElementById('apiUser').value.trim();
  const apiPass = document.getElementById('apiPass').value;

  if (!apiUser || !apiPass) {
    showStatus('ebStatus', 'Renseignez vos identifiants', 'error');
    return;
  }

  const btn = document.getElementById('fetchEbBtn');
  btn.disabled = true;
  showStatus('ebStatus', 'Connexion a EasyBeer...', 'info');

  try {
    const dateISO = pdfPeriode
      ? pdfPeriode + '-01T00:00:00.000Z'
      : new Date().toISOString();

    const response = await fetch('/api/easybeer-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiUser, apiPass, date: dateISO })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
      throw new Error(err.error);
    }

    const result = await response.json();
    easyBeerProducts = result.products;

    showStatus('ebStatus', `${easyBeerProducts.length} produits EasyBeer trouves`, 'success');

    buildMappingTable();
    show('step3');
  } catch (err) {
    showStatus('ebStatus', 'Erreur: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function bestMatch(cielName) {
  const lower = cielName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let best = null;
  let bestScore = 0;

  for (const eb of easyBeerProducts) {
    const ebLower = eb.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (ebLower === lower) return eb.nom;

    // Simple similarity: count common words
    const cielWords = lower.split(/\s+/);
    const ebWords = ebLower.split(/\s+/);
    const common = cielWords.filter(w => ebWords.some(ew => ew.includes(w) || w.includes(ew))).length;
    const score = common / Math.max(cielWords.length, ebWords.length);
    if (score > bestScore && score > 0.3) {
      bestScore = score;
      best = eb.nom;
    }
  }
  return best;
}

function buildMappingTable() {
  const tbody = document.getElementById('mappingBody');
  tbody.innerHTML = '';

  for (const ciel of cielProducts) {
    const tr = document.createElement('tr');

    // CIEL name (read-only)
    const tdName = document.createElement('td');
    tdName.textContent = ciel.nom;
    tdName.style.fontWeight = '600';

    // TAV
    const tdTav = document.createElement('td');
    tdTav.textContent = ciel.tav;

    // Stock fin
    const tdStock = document.createElement('td');
    tdStock.textContent = ciel.stockFin;

    // EasyBeer mapping dropdown
    const tdEb = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'eb-select';

    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = '-- Aucun --';
    select.appendChild(optNone);

    for (const eb of easyBeerProducts) {
      const opt = document.createElement('option');
      opt.value = eb.nom;
      opt.textContent = eb.nom;
      select.appendChild(opt);
    }

    // Auto-match
    const match = bestMatch(ciel.nom);
    if (match) select.value = match;

    tdEb.appendChild(select);

    // Libelle fiscal dropdown
    const tdLib = document.createElement('td');
    const selLib = document.createElement('select');
    selLib.className = 'lib-select';
    for (const val of LIBELLES_FISCAUX) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val.replace(/_/g, ' ');
      selLib.appendChild(opt);
    }
    selLib.value = 'BIERE_PETITE_BRASSERIE_SUP_2_8';
    tdLib.appendChild(selLib);

    tr.appendChild(tdName);
    tr.appendChild(tdTav);
    tr.appendChild(tdStock);
    tr.appendChild(tdEb);
    tr.appendChild(tdLib);
    tbody.appendChild(tr);
  }
}

function saveMapping() {
  const rows = document.getElementById('mappingBody').querySelectorAll('tr');
  const produits = [];

  rows.forEach((row, i) => {
    const ebSelect = row.querySelector('.eb-select');
    const libSelect = row.querySelector('.lib-select');
    produits.push({
      nom: cielProducts[i].nom,
      tav: cielProducts[i].tav,
      stockInitial: cielProducts[i].stockFin, // stock fin becomes stock debut for next period
      easyBeerNom: ebSelect.value || null,
      libelleFiscal: libSelect.value
    });
  });

  const config = {
    agrement: pdfAgrement,
    periodeReference: pdfPeriode,
    produits
  };

  localStorage.setItem('dtiplus-config', JSON.stringify(config));
  showStatus('saveStatus', 'Configuration sauvegardee ! Redirection...', 'success');

  setTimeout(() => { window.location.href = '/'; }, 1500);
}

// Bind events
document.getElementById('uploadBtn').addEventListener('click', uploadPdf);
document.getElementById('fetchEbBtn').addEventListener('click', fetchEasyBeerProducts);
document.getElementById('saveBtn').addEventListener('click', saveMapping);
