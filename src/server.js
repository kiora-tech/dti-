/**
 * DTI+ CIEL - Express Server
 * Serves the web interface and handles DTI+ generation requests.
 *
 * SECURITY: Credentials are never stored, logged, or persisted.
 * They exist only in memory during the request lifecycle.
 */

const express = require('express');
const path = require('path');
const archiver = require('archiver');
const { generateAllPeriods } = require('./generator');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Validation helpers
function validatePeriod(str) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(str);
}

function validateAgrement(str) {
  return /^[A-Za-z]{2}[0-9A-Za-z]{11}$/.test(str);
}

app.post('/api/generate', async (req, res) => {
  const { apiUser, apiPass, agrement, produits, startDate, endDate } = req.body;

  // Validate inputs
  if (!apiUser || !apiPass) {
    return res.status(400).json({ error: 'Identifiants API requis' });
  }
  if (!agrement || !validateAgrement(agrement)) {
    return res.status(400).json({ error: 'Numéro d\'agrément invalide (format: 2 lettres + 11 caractères alphanumériques)' });
  }
  if (!Array.isArray(produits) || produits.length === 0) {
    return res.status(400).json({ error: 'Au moins un produit requis' });
  }
  if (!validatePeriod(startDate) || !validatePeriod(endDate)) {
    return res.status(400).json({ error: 'Dates invalides (format: YYYY-MM)' });
  }
  if (startDate > endDate) {
    return res.status(400).json({ error: 'La date de début doit être antérieure à la date de fin' });
  }

  // Validate each product
  for (const p of produits) {
    if (!p.nom || typeof p.nom !== 'string') {
      return res.status(400).json({ error: 'Chaque produit doit avoir un nom' });
    }
    if (typeof p.tav !== 'number' || p.tav < 0 || p.tav > 100) {
      return res.status(400).json({ error: `TAV invalide pour "${p.nom}"` });
    }
  }

  try {
    const files = await generateAllPeriods({
      apiUser,
      apiPass,
      agrement,
      produits,
      startDate,
      endDate
    });

    // Stream zip directly to response - no temp files
    const zipName = `dti-plus_${startDate}_${endDate}.zip`;
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`
    });

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const file of files) {
      archive.append(file.content, { name: file.filename });
    }

    await archive.finalize();
  } catch (err) {
    // Never include credentials in error responses
    const message = err.message || 'Erreur interne';
    const status = message.includes('invalides') ? 401 : 500;
    if (!res.headersSent) {
      res.status(status).json({ error: message });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DTI+ CIEL server: http://localhost:${PORT}`);
});
