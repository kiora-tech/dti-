// Available libelle fiscal values for beer
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

// Default products (from original generate-final.js)
const DEFAULT_PRODUITS = [
  { nom: "L'Alsacienne", tav: 5.8, stockInitial: 1.4208 },
  { nom: "La Blondinette", tav: 5.0, stockInitial: 6.7197 },
  { nom: "La Confinee", tav: 5.4, stockInitial: 2.9658 },
  { nom: "La Fresh", tav: 4.6, stockInitial: 3.1944 },
  { nom: "La Stephanoise", tav: 5.0, stockInitial: 0.0132 },
  { nom: "Event Triple", tav: 5.6, stockInitial: 0 },
  { nom: "Huna", tav: 5.0, stockInitial: 0 },
  { nom: "La champetre", tav: 5.0, stockInitial: 0 },
  { nom: "Papa noel", tav: 5.0, stockInitial: 0 },
  { nom: "Stout", tav: 5.5, stockInitial: 0 },
  { nom: "Waldmeister", tav: 5.0, stockInitial: 0.0561 },
];

const tbody = document.getElementById('produitsBody');

function createLibelleSelect(selected) {
  const sel = document.createElement('select');
  for (const val of LIBELLES_FISCAUX) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val.replace(/_/g, ' ');
    if (val === selected) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

function addProductRow(data) {
  const d = data || { nom: '', tav: 5.0, stockInitial: 0, libelleFiscal: 'BIERE_PETITE_BRASSERIE_SUP_2_8' };
  const tr = document.createElement('tr');

  const tdNom = document.createElement('td');
  const inputNom = document.createElement('input');
  inputNom.type = 'text';
  inputNom.value = d.nom;
  inputNom.placeholder = 'Nom du produit';
  tdNom.appendChild(inputNom);

  const tdTav = document.createElement('td');
  const inputTav = document.createElement('input');
  inputTav.type = 'number';
  inputTav.step = '0.1';
  inputTav.min = '0';
  inputTav.max = '100';
  inputTav.value = d.tav;
  tdTav.appendChild(inputTav);

  const tdStock = document.createElement('td');
  const inputStock = document.createElement('input');
  inputStock.type = 'number';
  inputStock.step = '0.0001';
  inputStock.min = '0';
  inputStock.value = d.stockInitial;
  tdStock.appendChild(inputStock);

  const tdLibelle = document.createElement('td');
  tdLibelle.appendChild(createLibelleSelect(d.libelleFiscal || 'BIERE_PETITE_BRASSERIE_SUP_2_8'));

  const tdDel = document.createElement('td');
  const btnDel = document.createElement('button');
  btnDel.className = 'btn btn-danger';
  btnDel.textContent = '\u00d7';
  btnDel.title = 'Supprimer';
  btnDel.onclick = () => tr.remove();
  tdDel.appendChild(btnDel);

  tr.appendChild(tdNom);
  tr.appendChild(tdTav);
  tr.appendChild(tdStock);
  tr.appendChild(tdLibelle);
  tr.appendChild(tdDel);
  tbody.appendChild(tr);
}

function loadDefaults() {
  tbody.innerHTML = '';
  for (const p of DEFAULT_PRODUITS) {
    addProductRow(p);
  }
}

function saveConfig() {
  const config = {
    agrement: document.getElementById('agrement').value,
    produits: collectProduits(),
    startDate: document.getElementById('startDate').value,
    endDate: document.getElementById('endDate').value
  };
  localStorage.setItem('dtiplus-config', JSON.stringify(config));
  showStatus('Configuration sauvegardee (sans les identifiants)', 'success');
}

function loadConfig() {
  const saved = localStorage.getItem('dtiplus-config');
  if (!saved) return false;

  try {
    const config = JSON.parse(saved);
    if (config.agrement) document.getElementById('agrement').value = config.agrement;
    if (config.startDate) document.getElementById('startDate').value = config.startDate;
    if (config.endDate) document.getElementById('endDate').value = config.endDate;
    if (config.produits && config.produits.length > 0) {
      tbody.innerHTML = '';
      for (const p of config.produits) {
        addProductRow(p);
      }
      return true;
    }
  } catch (e) {
    // Ignore corrupt saved config
  }
  return false;
}

function collectProduits() {
  const rows = tbody.querySelectorAll('tr');
  const produits = [];
  for (const row of rows) {
    const inputs = row.querySelectorAll('input');
    const select = row.querySelector('select');
    produits.push({
      nom: inputs[0].value.trim(),
      tav: parseFloat(inputs[1].value) || 0,
      stockInitial: parseFloat(inputs[2].value) || 0,
      libelleFiscal: select.value
    });
  }
  return produits;
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status ' + type;
}

function hideStatus() {
  document.getElementById('status').className = 'status hidden';
}

async function generate() {
  const apiUser = document.getElementById('apiUser').value.trim();
  const apiPass = document.getElementById('apiPass').value;
  const agrement = document.getElementById('agrement').value.trim();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  const produits = collectProduits();

  // Validate
  if (!apiUser || !apiPass) {
    showStatus('Veuillez renseigner vos identifiants API EasyBeer', 'error');
    return;
  }
  if (!agrement) {
    showStatus('Veuillez renseigner votre numero d\'agrement', 'error');
    return;
  }
  if (produits.length === 0) {
    showStatus('Ajoutez au moins un produit', 'error');
    return;
  }
  if (produits.some(p => !p.nom)) {
    showStatus('Chaque produit doit avoir un nom', 'error');
    return;
  }
  if (!startDate || !endDate) {
    showStatus('Veuillez selectionner les dates de debut et de fin', 'error');
    return;
  }
  if (startDate > endDate) {
    showStatus('La date de debut doit etre anterieure a la date de fin', 'error');
    return;
  }

  const btn = document.getElementById('generateBtn');
  btn.disabled = true;
  btn.textContent = 'Generation en cours...';
  showStatus('Connexion a l\'API EasyBeer et generation des fichiers DTI+...\nCela peut prendre quelques minutes selon le nombre de mois.', 'info');

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiUser, apiPass, agrement, produits, startDate, endDate })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
      throw new Error(err.error || `Erreur HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dti-plus_${startDate}_${endDate}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus(`Fichiers generes avec succes ! Le telechargement a demarre.`, 'success');
  } catch (err) {
    showStatus('Erreur: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generer les fichiers DTI+';
  }
}

// Init
if (!loadConfig()) {
  loadDefaults();
}
